#!/usr/bin/env node
// Enrich tool: file (.csv/.xlsx) with a URL column → screenshot each site →
// upload to S3 via the CMP API → write the public link into a NEW result file.
//   npm run enrich -- --file=data/list.csv --template=followup [--url-col=website]
//   npm run enrich            (wizard: pick file, column, template)
import { input, select, confirm } from '@inquirer/prompts';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, extname, basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { loadConfig, ROOT, VERSION } from '../config/app-config.js';
import { readRows } from '../core/sellers/seller-loader.js';
import { normalizeKey } from '../core/sellers/seller-validator.js';
import { enrichImages, type EnrichOutcome } from '../core/enrich/image-enricher.js';
import { createCmpApi } from '../adapters/cmp-api.js';
import {
  createEnrichStore,
  writeEnrichedCsv,
  writeEnrichedXlsx,
  ensureDirs,
} from '../adapters/storage.js';
import { errMsg } from '../lib/util.js';
import { flag, flagVal } from './args.js';
import { ui, c, banner, makeProgressBar, makeSpinner, type ProgressBar } from './ui.js';
import type { CaptureTarget } from '../core/types.js';

const DEFAULT_IMAGE_COL = 'shop_image_url';

// --- URL helpers ---------------------------------------------------------------
const HAS_SCHEME = /^https?:\/\//i;
const LOOKS_DOMAIN = /^[\w-]+(\.[\w-]+)+/; // bare "shop.com/x" with no scheme

// Normalize a cell into a usable http(s) URL, or '' if it isn't one. A missing
// scheme is the common spreadsheet case → assume https rather than dropping the row.
function toUrl(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (HAS_SCHEME.test(s)) return s;
  if (LOOKS_DOMAIN.test(s)) return `https://${s}`;
  return '';
}

// Stable djb2 → base36; disambiguates the file name so two different URLs never
// collide on one S3 object. Inline (no node:crypto), same approach as the validator.
function shortHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Readable, URL-safe, UNIQUE slug for the S3 file name: host + last path segment +
// a hash of the full URL (so query-only differences still get distinct files).
function urlSlug(url: string): string {
  let label = '';
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    label = `${u.hostname.replace(/^www\./, '')}-${last}`;
  } catch {
    label = url;
  }
  const safe = label
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return `${safe || 'shop'}-${shortHash(url)}`;
}

// --- File picking (mirrors main.ts) --------------------------------------------
function cleanPath(p0: string): string {
  let p = p0.trim();
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'")))
    p = p.slice(1, -1);
  p = p.replace(/\\ /g, ' ');
  if (p === '~' || p.startsWith('~/')) p = resolve(homedir(), p.slice(p === '~' ? 1 : 2));
  return resolve(p);
}

function findDataFiles(): string[] {
  const dirs = [resolve(ROOT, 'data'), ROOT];
  const found: string[] = [];
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      const ext = extname(f).toLowerCase();
      if (['.csv', '.xlsx', '.xls'].includes(ext) && !f.startsWith('.')) found.push(resolve(d, f));
    }
  }
  return [...new Set(found)];
}

async function pickFile(): Promise<string> {
  const cliFile = flagVal('file');
  if (cliFile) return cleanPath(cliFile);
  const candidates = findDataFiles();
  const choice = await select({
    message: 'Chọn file danh sách (mẹo: bỏ file .csv/.xlsx vào thư mục data/ để tự hiện ở đây):',
    choices: [
      ...candidates.map((f) => ({ name: f.replace(ROOT + '/', ''), value: f })),
      { name: '✎ Kéo-thả / gõ đường dẫn tới file khác...', value: '__manual__' },
    ],
  });
  if (choice !== '__manual__') return choice;
  const p = await input({
    message: 'Kéo-thả file (.csv/.xlsx) vào đây rồi Enter — hoặc gõ đường dẫn:',
    validate: (v) => (existsSync(cleanPath(v)) ? true : `Không thấy file: ${cleanPath(v)}`),
  });
  return cleanPath(p);
}

// Resolve a requested column name to the actual header (tolerant of casing/spacing).
function findHeader(columns: string[], wanted: string): string | undefined {
  const w = normalizeKey(wanted);
  return columns.find((col) => col === wanted) ?? columns.find((col) => normalizeKey(col) === w);
}

// Auto-detect the URL column: the one whose cells most often look like a URL.
function detectUrlColumn(rows: Record<string, any>[], columns: string[]): string | null {
  let best: { col: string; hits: number } | null = null;
  for (const col of columns) {
    const hits = rows.reduce((n, r) => n + (toUrl(r[col]) ? 1 : 0), 0);
    if (hits && (!best || hits > best.hits)) best = { col, hits };
  }
  return best && best.hits >= Math.max(1, Math.ceil(rows.length * 0.3)) ? best.col : null;
}

async function resolveUrlColumn(rows: Record<string, any>[], columns: string[]): Promise<string> {
  const arg = flagVal('url-col');
  if (arg) {
    const h = findHeader(columns, arg);
    if (!h) {
      ui.err(`File không có cột "${arg}". Các cột hiện có: ${columns.join(', ')}.`);
      process.exit(1);
    }
    return h;
  }
  const detected = detectUrlColumn(rows, columns);
  if (detected && flag('yes')) return detected;
  return select({
    message: 'Cột nào chứa URL website?',
    default: detected ?? undefined,
    choices: columns.map((col) => ({
      name: detected === col ? `${col}  ${c.dim('(tự nhận diện)')}` : col,
      value: col,
    })),
  });
}

function relRoot(p: string): string {
  return p.startsWith(ROOT + '/') ? p.replace(ROOT + '/', '') : p;
}

// --- Progress reporter (one orange bar, like capture/send) ---------------------
function makeReporter() {
  let bar: ProgressBar | null = null;
  let ok = 0;
  let fail = 0;
  let skip = 0;
  return (evt: { done: number; total: number; outcome: EnrichOutcome }) => {
    if (!bar) {
      bar = makeProgressBar('chụp + tải ảnh');
      bar.start(evt.total, 0, { suffix: '' });
    }
    if (evt.outcome.status === 'ok') ok++;
    else if (evt.outcome.status === 'skip') skip++;
    else fail++;
    bar.update(evt.done, {
      suffix: `${c.ok('OK ' + ok)} ${c.warn('bỏ ' + skip)} ${c.err('lỗi ' + fail)}`,
    });
    if (evt.done >= evt.total) bar.stop();
  };
}

async function main(): Promise<void> {
  if (Number(process.versions.node.split('.')[0]) < 20) {
    console.error(`Cần Node.js 20 trở lên (đang dùng ${process.versions.node}).`);
    process.exit(1);
  }
  banner(VERSION);
  ui.title('  CÔNG CỤ CHỤP ẢNH WEBSITE → TẢI LÊN → GHI LINK VÀO FILE');

  const config = loadConfig();
  // --scope overrides .env for this run.
  const scopeArg = flagVal('scope');
  if (scopeArg === 'internal' || scopeArg === 'external') config.api.scope = scopeArg;

  if (!config.api.email || !config.api.password) {
    ui.err('Chưa cấu hình tài khoản đăng nhập hệ thống để tải ảnh.');
    ui.dim('→ Mở file .env và điền: CMP_API_EMAIL, CMP_API_PASSWORD (và CMP_API_SCOPE nếu cần).');
    process.exit(1);
  }
  ui.ok(`Đăng nhập: ${c.bold(config.api.email)} (${config.api.scope}) qua ${config.api.baseUrl}`);

  const file = await pickFile();
  let rows: Record<string, any>[];
  try {
    rows = await readRows(file);
  } catch (e) {
    ui.err(errMsg(e));
    process.exit(1);
  }
  if (!rows.length) {
    ui.err('File rỗng hoặc không đọc được dữ liệu.');
    process.exit(1);
  }
  const columns = Object.keys(rows[0]); // original headers, in order

  const urlHeader = await resolveUrlColumn(rows, columns);

  // Image column: reuse an existing one (any casing) or append the requested name.
  const imageArg = flagVal('image-col') || DEFAULT_IMAGE_COL;
  const imageHeader = findHeader(columns, imageArg) ?? imageArg;
  const statusHeader = /_url$/i.test(imageHeader)
    ? imageHeader.replace(/_url$/i, '_status')
    : `${imageHeader}_status`;
  const outColumns = [...columns];
  for (const col of [imageHeader, statusHeader])
    if (!outColumns.includes(col)) outColumns.push(col);

  // Email-template name → goes into the S3 key path (marketings/{template}/...).
  // --yes is unattended: never block on a prompt — fall back to the default.
  let template = (flagVal('template') || '').trim();
  if (!template && !flag('yes')) {
    template = (
      await input({
        message: 'Tên email-template (dùng cho đường dẫn ảnh, vd: followup):',
        default: 'touch',
        validate: (v) => (v.trim() ? true : 'Không được để trống.'),
      })
    ).trim();
  }
  if (!template) template = 'touch';

  const resume = !flag('fresh'); // re-runs skip rows already done; --fresh redoes all

  // Build distinct targets; classify every row up front for the result file.
  const targetByUrl = new Map<string, CaptureTarget>();
  const rowUrl: (string | null)[] = []; // url per row (null = nothing to do)
  const preStatus: (string | null)[] = []; // a status fixed before the run (skip/invalid)
  let invalid = 0;
  let preFilled = 0;
  for (const row of rows) {
    const url = toUrl(row[urlHeader]);
    if (!url) {
      rowUrl.push(null);
      preStatus.push('bỏ qua (thiếu/không hợp lệ url)');
      invalid++;
      continue;
    }
    if (resume && String(row[imageHeader] ?? '').trim()) {
      rowUrl.push(url);
      preStatus.push('bỏ qua (đã có ảnh)');
      preFilled++;
      continue;
    }
    rowUrl.push(url);
    preStatus.push(null);
    if (!targetByUrl.has(url)) targetByUrl.set(url, { url, slug: urlSlug(url) });
  }
  const targets = [...targetByUrl.values()];

  // Output format follows the input by default (csv→csv, xlsx→xlsx); an explicit
  // --out with a .csv/.xlsx extension overrides it.
  const outArg = flagVal('out');
  const inputIsExcel = ['.xlsx', '.xls'].includes(extname(file).toLowerCase());
  const outIsXlsx = outArg ? /\.xlsx$/i.test(outArg) : inputIsExcel;
  const outPath = outArg
    ? cleanPath(outArg)
    : join(
        dirname(file),
        `${basename(file, extname(file))}.enriched.${outIsXlsx ? 'xlsx' : 'csv'}`,
      );

  ui.summary('CHUẨN BỊ', [
    ['File nguồn', relRoot(file)],
    ['Cột URL', urlHeader],
    ['Cột ghi link', imageHeader],
    ['Email-template', template],
    ['Số dòng', rows.length],
    ['URL sẽ xử lý', targets.length, 'ok'],
    preFilled ? ['Đã có link (bỏ qua)', preFilled, 'warn'] : null,
    invalid ? ['Thiếu/không hợp lệ URL', invalid, 'warn'] : null,
    ['File kết quả', relRoot(outPath)],
  ]);

  if (!targets.length) {
    ui.warn('Không có URL nào cần xử lý. Kết thúc.');
    process.exit(0);
  }
  if (!flag('yes')) {
    const go = await confirm({
      message: `Bắt đầu chụp + tải ${targets.length} ảnh?`,
      default: true,
    });
    if (!go) {
      ui.dim('Đã huỷ.');
      process.exit(0);
    }
  }

  const api = createCmpApi(config.api);
  // Sign in once before the slow capture so a wrong password / unreachable server
  // fails fast instead of after screenshotting every site (and primes the token).
  const spin = makeSpinner('Đăng nhập hệ thống...').start();
  try {
    await api.verifyAuth();
    spin.stop();
    ui.ok('Đăng nhập hệ thống thành công.');
  } catch (e) {
    spin.stop();
    const msg = errMsg(e);
    if (/HTTP 401/.test(msg)) {
      ui.err('Sai tài khoản hoặc mật khẩu hệ thống.');
      ui.dim('→ Kiểm tra CMP_API_EMAIL / CMP_API_PASSWORD / CMP_API_SCOPE trong .env.');
    } else {
      ui.err(`Không đăng nhập được hệ thống: ${msg}`);
    }
    process.exit(1);
  }

  const store = createEnrichStore(`${basename(file)}-${template}`);
  if (flag('fresh')) store.reset();

  // Merge the per-URL checkpoint back onto every row and write the result file.
  // Called periodically DURING the run (so a killed long run still leaves a usable
  // partial file) and once at the end. Idempotent: re-running just refreshes cells.
  const statusText = (url: string): { link: string; status: string } => {
    const r = store.loadRecords()[url];
    if (r?.status === 'ok' && r.imageUrl) return { link: r.imageUrl, status: 'ok' };
    if (r?.status === 'error') return { link: '', status: `lỗi: ${r.error ?? 'không rõ'}` };
    return { link: '', status: 'chưa xử lý' };
  };
  // Fold the current checkpoint state into every row (in place, idempotent).
  const mergeRows = (): void => {
    rows.forEach((row, i) => {
      if (preStatus[i]) {
        // invalid / already-filled rows keep their existing link cell.
        row[statusHeader] = preStatus[i];
        if (!(imageHeader in row)) row[imageHeader] = '';
        return;
      }
      const { link, status } = statusText(rowUrl[i] as string);
      if (link) row[imageHeader] = link;
      else if (!(imageHeader in row)) row[imageHeader] = '';
      row[statusHeader] = status;
    });
  };
  // Final write: CSV (sync) or XLSX (exceljs, async) per the chosen format.
  const writeOutput = async (): Promise<boolean> => {
    mergeRows();
    try {
      if (outIsXlsx) await writeEnrichedXlsx(outPath, rows, outColumns);
      else writeEnrichedCsv(outPath, rows, outColumns);
      return true;
    } catch {
      return false;
    }
  };

  ensureDirs();
  // Partial-file flush every FLUSH_EVERY rows on big runs, so a killed long run
  // still leaves a usable file. CSV only (sync, no mid-run races); the per-row JSON
  // checkpoint guarantees resume regardless, and xlsx is written once at the end.
  const FLUSH_EVERY = 100;
  const flushCsv = (): void => {
    mergeRows();
    try {
      writeEnrichedCsv(outPath, rows, outColumns);
    } catch {
      // a periodic flush failure must not abort the run
    }
  };
  const reporter = makeReporter();
  ui.step('1', 'Chụp ảnh và tải lên');
  let outcomes: EnrichOutcome[];
  try {
    outcomes = await enrichImages(targets, {
      capture: config.capture,
      api,
      store,
      template,
      resume,
      onProgress: (evt) => {
        reporter(evt);
        if (!outIsXlsx && targets.length > FLUSH_EVERY && evt.done % FLUSH_EVERY === 0) flushCsv();
      },
    });
  } catch (e) {
    await writeOutput(); // salvage whatever finished before the fatal error
    ui.err(`Lỗi nghiêm trọng (không phải lỗi từng dòng): ${errMsg(e)}`);
    ui.dim('Tiến trình đã lưu — chạy lại lệnh để tiếp tục từ chỗ dở.');
    process.exit(1);
  }

  if (!(await writeOutput())) {
    ui.err('Không ghi được file kết quả (kiểm tra quyền ghi / dung lượng đĩa).');
    process.exit(1);
  }

  const ok = outcomes.filter((o) => o.status === 'ok').length;
  const skipped = outcomes.filter((o) => o.status === 'skip').length;
  const failed = outcomes.filter((o) => o.status === 'error');
  ui.summary('KẾT QUẢ', [
    ['Tải lên thành công', ok, 'ok'],
    skipped ? ['Bỏ qua (đã có)', skipped, 'warn'] : null,
    preFilled ? ['Dòng đã có link', preFilled, 'warn'] : null,
    invalid ? ['Dòng thiếu URL', invalid, 'warn'] : null,
    failed.length ? ['Thất bại', failed.length, 'err'] : null,
  ]);
  if (failed.length) {
    failed.slice(0, 10).forEach((f) => ui.dim(`• ${f.url}: ${f.error}`));
    if (failed.length > 10) ui.dim(`• ... và ${failed.length - 10} lỗi khác`);
  }
  ui.ok(`File kết quả: ${c.bold(relRoot(outPath))}`);
  if (failed.length)
    ui.dim('Mẹo: chạy lại lệnh sẽ tự bỏ qua URL đã tải xong, chỉ thử lại dòng lỗi.');
  console.log();
}

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
