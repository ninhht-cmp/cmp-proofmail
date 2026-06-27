#!/usr/bin/env node
import { input, select, confirm } from '@inquirer/prompts';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { loadConfig, ROOT, VERSION } from '../config/app-config.js';
import { checkEnv } from '../config/env-check.js';
import { loadSellers } from '../core/sellers/seller-loader.js';
import { captureShops } from '../core/capture/shop-capturer.js';
import { sendCampaign, sendOne } from '../core/mailer/campaign-sender.js';
import { createTransport } from '../adapters/smtp-transport.js';
import {
  createCampaignStore,
  missingBrandAssets,
  paths,
  ensureDirs,
  listTemplates,
  fileExists,
} from '../adapters/storage.js';
import { fetchSheetCsv } from '../adapters/google-sheet.js';
import { unknownSubjectVars, SUBJECT_VARS, subjectTemplateFor } from '../core/render/template.js';
import { EMAIL_RE } from '../lib/patterns.js';
import { errMsg } from '../lib/util.js';
import { flag, flagVal } from './args.js';
import { ui, c, banner, makeProgressBar, type ProgressBar } from './ui.js';
import { runManual } from './manual-flow.js';
import { runManualDraft } from './manual-draft-flow.js';
import { pickTemplate, campaignIdFor } from './template-picker.js';
import { OUTLOOK_DRAFT_SUPPORTED } from '../adapters/outlook-draft.js';
import type { ValidationResult } from '../core/types.js';

const config = loadConfig();

// Suggest .csv/.xlsx files found in data/ and the project root.
function findDataFiles(): string[] {
  const dirs = [resolve(ROOT, 'data'), ROOT];
  const found: string[] = [];
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      const ext = extname(f).toLowerCase();
      if (['.csv', '.xlsx', '.xls'].includes(ext) && !f.startsWith('.')) {
        found.push(resolve(d, f));
      }
    }
  }
  return [...new Set(found)];
}

// Clean a path the way a user actually provides one — especially via drag-and-drop
// into the terminal, which pastes quotes and backslash-escaped spaces.
function cleanPath(input: string): string {
  let p = input.trim();
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1);
  }
  p = p.replace(/\\ /g, ' '); // drag-drop escapes spaces as "\ "
  if (p === '~' || p.startsWith('~/')) p = resolve(homedir(), p.slice(p === '~' ? 1 : 2));
  return resolve(p);
}

// Download a Google Sheet tab to a cached CSV → the rest of the pipeline is unchanged.
async function loadSheetToFile(url: string): Promise<string> {
  ui.info('Đang tải Google Sheet...');
  const { id, gid, text } = await fetchSheetCsv(url);
  ensureDirs();
  const out = paths.sheetCsv(id, gid);
  writeFileSync(out, text);
  ui.ok(`Đã tải Sheet → ${out.replace(ROOT + '/', '')}`);
  return out;
}

async function pickFile(): Promise<string> {
  const cliFile = flagVal('file');
  if (cliFile) return resolve(cliFile);
  const sheetArg = flagVal('sheet');
  if (sheetArg) return loadSheetToFile(sheetArg);

  const candidates = findDataFiles();
  const choice = await select({
    message: 'Chọn nguồn danh sách người bán (mẹo: bỏ file vào thư mục data/ để tự hiện ở đây):',
    choices: [
      ...candidates.map((f) => ({ name: f.replace(ROOT + '/', ''), value: f })),
      { name: '🌐 Dán link Google Sheets...', value: '__gsheet__' },
      { name: '✎ Kéo-thả / gõ đường dẫn tới file khác...', value: '__manual__' },
    ],
  });
  if (choice === '__gsheet__') {
    const url = await input({
      message: 'Dán link Google Sheets (sheet phải ở chế độ "Anyone with the link can view"):',
    });
    return loadSheetToFile(url.trim());
  }
  if (choice !== '__manual__') return choice;
  const p = await input({
    message:
      'Kéo-thả file (.csv/.xlsx) vào cửa sổ này rồi Enter — hoặc gõ đường dẫn (vd: data/danh-sach.xlsx):',
    validate: (v) => (existsSync(cleanPath(v)) ? true : `Không thấy file: ${cleanPath(v)}`),
  });
  return cleanPath(p);
}

function showValidation({ valid, skipped, duplicates }: ValidationResult): void {
  ui.line();
  ui.ok(`Đọc được ${c.bold(String(valid.length))} người bán hợp lệ.`);
  if (duplicates.length) ui.warn(`${duplicates.length} dòng trùng email (đã bỏ, giữ bản đầu).`);
  if (skipped.length) {
    ui.warn(`${skipped.length} dòng bị bỏ qua:`);
    skipped.slice(0, 8).forEach((s) => ui.dim(`  • dòng ${s.line}: ${s.reason}`));
    if (skipped.length > 8) ui.dim(`  • ... và ${skipped.length - 8} dòng khác`);
  }
  ui.line();
}

// --- onProgress reporters: turn core events into one tidy progress bar each ---
// (instead of one scrolling line per seller — unreadable at 1000+ sellers).

function makeBarReporter(label: string, suffix?: (evt: any) => string) {
  let bar: ProgressBar | null = null;
  return (evt: any) => {
    if (!bar) {
      bar = makeProgressBar(label);
      bar.start(evt.total, 0, { suffix: '' });
    }
    bar.update(evt.done, { suffix: suffix ? suffix(evt) : '' });
    if (evt.done >= evt.total) bar.stop();
  };
}

function makeCaptureReporter() {
  let cached = 0;
  let failed = 0;
  return makeBarReporter('chụp gian hàng', (evt) => {
    if (evt.result.cached) cached++;
    else if (evt.result.error) failed++;
    return c.dim(`(cache ${cached}, lỗi ${failed})`);
  });
}

// Progress bar for the send step; pending count is only known on the first event.
function makeSendReporter() {
  let bar: ProgressBar | null = null;
  let ok = 0;
  let fail = 0;
  return ({ done, total, seller, ok: sent, dryRun }: any) => {
    if (dryRun) {
      ui.dim(`${c.brand('[thử]')} → ${seller.email} (${seller.seller_name})`);
      return;
    }
    if (!bar) {
      bar = makeProgressBar('gửi mail');
      bar.start(total, 0, { suffix: '' });
    }
    sent ? ok++ : fail++;
    bar.update(done, { suffix: `${c.ok('OK ' + ok)}  ${c.err('lỗi ' + fail)}` });
    if (done >= total) bar.stop();
  };
}

async function main(): Promise<void> {
  // Node version gate — old Node fails with cryptic errors deep inside deps.
  if (Number(process.versions.node.split('.')[0]) < 20) {
    console.error(`Cần Node.js phiên bản 20 trở lên (đang dùng ${process.versions.node}).`);
    console.error('→ Tải bản LTS mới tại https://nodejs.org rồi chạy lại.');
    process.exit(1);
  }

  banner(VERSION);

  // --draft forces the Outlook-draft transport for this run (overrides .env).
  const draftMode = flag('draft') || config.mail.transport === 'outlook-draft';
  config.mail.transport = draftMode ? 'outlook-draft' : 'smtp';
  if (draftMode && !OUTLOOK_DRAFT_SUPPORTED) {
    ui.err(
      'Chế độ điền nháp Outlook (--draft / MAIL_TRANSPORT=outlook-draft) chỉ chạy trên Windows với Outlook Classic.',
    );
    process.exit(1);
  }

  const missing = checkEnv(config);
  if (missing.length) {
    ui.err('Chưa cấu hình thông tin gửi mail. Thiếu:');
    missing.forEach((m) => ui.dim('• ' + m));
    ui.dim('\n→ Hãy mở file .env và điền các thông tin trên. Xem README để biết cách lấy.');
    process.exit(1);
  }
  if (draftMode) {
    ui.ok(`Chế độ: điền nháp vào Outlook để gửi tay — gửi từ ${c.bold(config.mail.fromEmail)}.`);
  } else {
    ui.ok(`Cấu hình gửi mail: ${c.bold(config.smtp.user)} qua ${config.smtp.host}`);
  }

  // Fail before the slow capture step if the brand chrome images aren't there.
  const missingAssets = missingBrandAssets();
  if (missingAssets.length) {
    ui.err('Thiếu ảnh thương hiệu trong thư mục assets/ (không thể dựng email):');
    missingAssets.forEach((f) => ui.dim('• assets/' + f));
    process.exit(1);
  }

  const file = await pickFile();
  let validation: ValidationResult;
  try {
    validation = await loadSellers(file);
  } catch (e) {
    ui.err(errMsg(e));
    process.exit(1);
  }
  // Require all 3 columns — a missing one blocks the whole run with a clear error.
  if (validation.missingRequired.length) {
    ui.err(`File thiếu cột bắt buộc: ${validation.missingRequired.join(', ')}.`);
    ui.dim('→ Cần đủ 3 cột: Name, Email, Shop URL (các cột khác tùy chọn).');
    process.exit(1);
  }
  showValidation(validation);
  if (!validation.valid.length) {
    ui.err('Không có người bán hợp lệ để gửi. Kiểm tra lại file.');
    process.exit(1);
  }

  // Choose the design (MAIL_TEMPLATE is the default): --template picks it
  // non-interactively, else prompt unless --yes signals an unattended run.
  const tplArg = flagVal('template');
  if (tplArg) {
    const avail = listTemplates();
    if (avail.length && !avail.includes(tplArg)) {
      ui.err(`Không có mẫu mail "${tplArg}". Hiện có: ${avail.join(', ')}.`);
      process.exit(1);
    }
    config.mail.template = tplArg;
  } else if (!flag('yes')) {
    config.mail.template = await pickTemplate({ current: config.mail.template });
  }

  // Preflight: the chosen design must have an HTML file — guards a stale
  // MAIL_TEMPLATE on an unattended run that would otherwise ENOENT mid-send.
  if (!fileExists(paths.template(config.mail.template))) {
    ui.err(
      `Không tìm thấy mẫu mail "${config.mail.template}" (templates/${config.mail.template}.hbs).`,
    );
    const avail = listTemplates();
    ui.dim(
      avail.length
        ? `→ Hiện có: ${avail.join(', ')}. Sửa MAIL_TEMPLATE trong .env hoặc dùng --template <tên>.`
        : '→ Thư mục templates/ chưa có mẫu nào.',
    );
    process.exit(1);
  }
  ui.ok(`Mẫu mail: ${c.bold(config.mail.template)}`);

  // Warn loudly on a typo'd subject placeholder — it would render blank silently.
  const effectiveSubject = subjectTemplateFor(config.mail.template, config.mail.subjectTemplate);
  const badVars = unknownSubjectVars(effectiveSubject);
  if (badVars.length) {
    const where =
      effectiveSubject === config.mail.subjectTemplate
        ? 'MAIL_SUBJECT (.env)'
        : `templates/${config.mail.template}.subject.hbs`;
    ui.warn(
      `Tiêu đề mail có biến không hợp lệ: ${badVars.map((v) => `{{${v}}}`).join(', ')} — sẽ hiển thị TRỐNG.`,
    );
    ui.dim(
      `→ Chỉ dùng được: ${SUBJECT_VARS.map((v) => `{{${v}}}`).join(', ')}. Sửa trong ${where}.`,
    );
  }

  // Outlook-draft is always manual (you click Send yourself) — precedes --auto.
  if (draftMode) {
    await runManualDraft({ config, file, sellers: validation.valid });
    return;
  }

  // Default flow: manual, one seller at a time. --auto runs the legacy bulk send.
  if (!flag('auto')) {
    await runManual({ config, file, sellers: validation.valid });
    return;
  }

  const dryRun = flag('dry');
  const autoYes = flag('yes');

  const hours = validation.valid.length / config.throttle.mailsPerHour;
  const hoursTxt = hours < 1 ? `${Math.ceil(hours * 60)} phút` : `${hours.toFixed(1)} giờ`;
  ui.info(
    `Nhịp gửi ${config.throttle.mailsPerHour} mail/giờ → ước tính ~${hoursTxt} cho ${validation.valid.length} người bán.`,
  );
  if (dryRun) ui.warn('CHẾ ĐỘ CHẠY THỬ: sẽ KHÔNG gửi mail thật.');

  // The screenshot is embedded inline in each email (no separate attachment).
  ui.step('1', 'Chuẩn bị ảnh gian hàng');
  const shots = await captureShops(validation.valid, {
    config,
    skipExisting: true,
    onProgress: makeCaptureReporter(),
  });
  const okShots = shots.filter((s) => s.shot);
  if (!okShots.length) {
    ui.err('Không chụp được gian hàng nào. Kiểm tra mạng / link gian hàng.');
    process.exit(1);
  }
  if (okShots.length < shots.length) {
    ui.warn(
      `${shots.length - okShots.length} gian hàng chụp lỗi (sẽ không gửi cho các người bán này).`,
    );
  }
  ui.ok(`Đã chuẩn bị ảnh cho ${c.bold(String(okShots.length))} người bán.`);

  // Optional test send so the operator can eyeball one email before the run.
  if (!autoYes && !dryRun) {
    const wantTest = await confirm({
      message: 'Gửi thử 1 email tới chính bạn để kiểm tra trước?',
      default: true,
    });
    if (wantTest) {
      const testTo = await input({
        message: 'Nhập email nhận bản thử:',
        default: config.smtp.user,
        validate: (v) => (EMAIL_RE.test(v) ? true : 'Email không hợp lệ.'),
      });
      const sample = okShots[0];
      try {
        const tx = createTransport(config.smtp);
        await sendOne(tx, sample, { config, overrideTo: testTo });
        tx.close();
        ui.ok(`Đã gửi bản thử tới ${testTo} (dùng dữ liệu người bán "${sample.seller_name}").`);
        const looksGood = await confirm({ message: 'Bạn đã kiểm tra và thấy ổn?', default: true });
        if (!looksGood) {
          ui.dim('Đã dừng. Hãy chỉnh template (templates/intro.hbs) rồi chạy lại.');
          process.exit(0);
        }
      } catch (e) {
        ui.err(`Gửi thử thất bại: ${errMsg(e)}`);
        process.exit(1);
      }
    }
  }

  // Final confirmation — require typing GUI so a real send is never accidental.
  const sendable = okShots;
  if (!autoYes && !dryRun) {
    ui.line();
    ui.warn(`Sắp gửi THẬT cho ${c.bold(String(sendable.length))} người bán.`);
    const word = await input({ message: 'Gõ chữ HOA "GUI" để xác nhận (hoặc Enter để huỷ):' });
    if (word.trim().toUpperCase() !== 'GUI') {
      ui.dim('Đã huỷ. Không gửi gì cả.');
      process.exit(0);
    }
  }

  // Campaign id = (file, design) so a re-run resumes and 'followup' is tracked
  // separately from 'intro' — same rule as the manual flow.
  const campaignId = campaignIdFor(basename(file).replace(/\.[^.]+$/, ''), config.mail.template);
  const store = createCampaignStore(campaignId);
  ui.step('2', dryRun ? 'Chạy thử (không gửi thật)' : 'Đang gửi mail');
  const result = await sendCampaign(okShots, {
    config,
    store,
    campaignId,
    dryRun,
    resume: true,
    onProgress: makeSendReporter(),
  });

  ui.summary('KẾT QUẢ ĐỢT GỬI', [
    ['Gửi thành công', result.sent.length, 'ok'],
    result.skippedAlready ? ['Bỏ (đã gửi trước)', result.skippedAlready, 'warn'] : null,
    result.skippedSuppressed ? ['Bỏ (suppression)', result.skippedSuppressed, 'warn'] : null,
    result.failed.length ? ['Thất bại', result.failed.length, 'err'] : null,
  ]);
  if (result.failed.length) {
    result.failed.slice(0, 10).forEach((f) => ui.dim(`• ${f.email}: ${f.error}`));
    if (result.failed.length > 10)
      ui.dim(`• ... và ${result.failed.length - 10} lỗi khác (xem báo cáo CSV)`);
  }
  // Mailbox copy: BCC is the reliable one (rides the proven send path).
  if (config.mail.bcc && !dryRun) ui.dim(`Bản sao đã BCC về: ${config.mail.bcc}`);
  // Sent-folder archiving (IMAP_SAVE_SENT) — only mentioned when enabled.
  if (result.archive) {
    const a = result.archive;
    if (a.connectError) {
      ui.warn(`Không lưu được vào hộp "Đã gửi" (không kết nối được IMAP): ${a.connectError}`);
      ui.dim(
        '→ Mail vẫn gửi tới người nhận bình thường; bản sao đã có qua BCC + báo cáo CSV bên dưới.',
      );
    } else {
      if (a.saved) ui.ok(`Đã lưu vào hộp "${a.folder}": ${c.bold(String(a.saved))}`);
      const notSaved = (a.failed || 0) + (a.skipped || 0);
      if (notSaved)
        ui.warn(
          `Không lưu được ${notSaved} bản vào hộp "Đã gửi" (mail vẫn đã gửi; bản sao có qua BCC + CSV).`,
        );
      if (a.disabledReason) ui.warn(a.disabledReason);
      else if (a.lastError && !a.saved) ui.dim(`Lý do IMAP lỗi: ${a.lastError}`);
    }
  }
  if (!dryRun) {
    // The authoritative sent history — always written, never depends on IMAP.
    const reportPath = store.report();
    ui.dim(`Lịch sử gửi đầy đủ (CSV, mở bằng Excel): ${reportPath.replace(ROOT + '/', '')}`);
  }
  if (!dryRun && (result.sent.length || result.skippedAlready)) {
    ui.dim('Mẹo: chạy lại lệnh này sẽ tự bỏ qua những người bán đã gửi (không gửi trùng).');
  }
  console.log();
}

// Run the wizard only when invoked directly, not when imported. pathToFileURL
// (not a manual `file://` concat) so the compare matches on Windows too.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    if ((e as any)?.name === 'ExitPromptError') {
      console.log('\nĐã thoát.');
      process.exit(0);
    }
    ui.err('Có lỗi: ' + errMsg(e));
    process.exit(1);
  });
}
