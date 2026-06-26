// Manual one-by-one send (the default flow): pick a seller → screenshot on demand
// → send → mark sent (hides it next round). State lives in the campaign store so a
// re-opened session resumes. No throttle (human pace); failures stay to retry.
import { select } from '@inquirer/prompts';
import { basename } from 'node:path';
import { ROOT } from '../config/app-config.js';
import { deliverAndArchive, recordSent, recordFailed } from '../core/mailer/campaign-sender.js';
import { createCampaignStore, createSuppressionStore, listTemplates } from '../adapters/storage.js';
import { createTransport } from '../adapters/smtp-transport.js';
import { createSentArchiver } from '../adapters/imap-sent.js';
import { remainingSellers, pickSeller, PICK_QUIT, PICK_SWITCH } from './seller-picker.js';
import { pickTemplate, campaignIdFor } from './template-picker.js';
import { writeEmailPreview, openInBrowser } from './email-preview.js';
import { createBrowserSession } from './capture-step.js';
import { errMsg } from '../lib/util.js';
import { ui, c, makeSpinner } from './ui.js';
import type { Config, Seller } from '../core/types.js';

export async function runManual({
  config,
  file,
  sellers,
}: {
  config: Config;
  file: string;
  sellers: Seller[];
}): Promise<void> {
  const base = basename(file).replace(/\.[^.]+$/, '');
  const suppression = createSuppressionStore();

  // Sent-state scoped per (list, design): switching design re-opens the whole list
  // (so 'followup' reaches everyone) while the SAME design never double-sends.
  // One cached store per design touched this session.
  const stores = new Map<string, ReturnType<typeof createCampaignStore>>();
  const storeFor = (tpl: string) => {
    let s = stores.get(tpl);
    if (!s) {
      s = createCampaignStore(campaignIdFor(base, tpl));
      stores.set(tpl, s);
    }
    return s;
  };
  let template = config.mail.template;
  let campaign = storeFor(template);
  // Only offer mid-session design switching when there's more than one design.
  const canSwitch = listTemplates().length > 1;

  const tx = createTransport(config.smtp);
  try {
    await tx.verify();
  } catch (e) {
    ui.err(`Không kết nối được máy chủ gửi mail: ${errMsg(e)}`);
    tx.close();
    return;
  }

  // Optional IMAP Sent-folder copy — best-effort; a failed connection just warns.
  let archiver: any = null;
  if (config.imap?.saveSent) {
    try {
      archiver = await createSentArchiver(config.imap);
    } catch (e) {
      ui.warn(
        `Không kết nối được IMAP để lưu hộp "Đã gửi": ${errMsg(e)} — mail vẫn gửi bình thường.`,
      );
    }
  }

  // Lazily-launched browser for this session (starts on the first capture).
  const session = createBrowserSession();

  let sent = 0;
  let failed = 0;
  let archived = 0;
  try {
    while (true) {
      // Recompute each round so a just-sent seller drops off and a 5xx-suppressed
      // one never reappears.
      const remaining = remainingSellers(sellers, campaign, suppression);
      if (!remaining.length) {
        ui.ok('Đã gửi hết các người bán trong danh sách.');
        break;
      }

      const seller = await pickSeller(remaining, {
        message: `Chọn người bán để gửi (còn ${remaining.length}) — gõ để lọc theo tên/email/sđt:`,
        templateLabel: canSwitch ? template : undefined,
      });
      if (seller === PICK_QUIT) break;
      // Switch design mid-session: the list re-populates against the new store next round.
      if (seller === PICK_SWITCH) {
        const next = await pickTemplate({ current: template });
        if (next !== template) {
          template = next;
          config.mail.template = template; // buildMessage reads this to render
          campaign = storeFor(template);
          ui.ok(`Đã đổi sang mẫu mail "${c.bold(template)}".`);
        }
        continue;
      }
      if (!seller) continue;

      // Capture the storefront on demand (cached → instant on re-pick).
      const shot = await session.capture(seller, { config });
      if (!shot.shot) {
        ui.err(`Chụp gian hàng lỗi — CHƯA gửi: ${shot.error}`);
        continue;
      }

      // Render-true browser preview before committing (FR-7) — loop, then decide.
      let go = false;
      let decided = false;
      while (!decided) {
        const action = await select({
          message: `Gửi mail (mẫu "${template}") tới ${seller.seller_name} <${seller.email}> — ${seller.shop_url} ?`,
          choices: [
            { name: 'Gửi', value: 'send' },
            { name: 'Xem trước trong trình duyệt', value: 'preview' },
            { name: 'Bỏ qua người này', value: 'skip' },
          ],
        });
        if (action === 'preview') {
          const p = writeEmailPreview(seller, { config, shotPath: shot.shot });
          const opened = await openInBrowser(p);
          ui.dim(
            opened
              ? `Đã mở bản xem trước trong trình duyệt: ${p}`
              : `Mở thủ công bản xem trước: ${p}`,
          );
          continue;
        }
        go = action === 'send';
        decided = true;
      }
      if (!go) continue;

      // Spinner over the real send: SMTP round-trip + (optional) IMAP append.
      const sending = makeSpinner(`Đang gửi mail tới ${seller.seller_name}...`).start();
      try {
        const { info, archive } = await deliverAndArchive(tx, seller, { config, archiver });
        recordSent(campaign, seller, { attempts: 1, info });
        sent++;
        if (archive === 'saved') archived++;
        sending.stop();
        ui.ok(
          `Đã gửi & đánh dấu "đã gửi" — ${seller.seller_name} (mẫu "${template}", ẩn khỏi danh sách).`,
        );
      } catch (err) {
        sending.stop();
        recordFailed(campaign, suppression, seller, { attempts: 1, err });
        failed++;
        ui.err(`Gửi lỗi — vẫn giữ trong danh sách để thử lại: ${errMsg(err)}`);
      }
    }
  } finally {
    // Runs even on Ctrl-C, so the report always reflects this session.
    await session.close();
    if (archiver) await archiver.close().catch(() => {});
    tx.close();
    const notArchived = sent - archived;
    ui.summary('KẾT THÚC PHIÊN', [
      ['Đã gửi phiên này', sent, 'ok'],
      archiver && archived ? [`Lưu hộp "${archiver.folder}"`, archived, 'ok'] : null,
      archiver && notArchived > 0 ? ['Chưa lưu vào "Đã gửi"', notArchived, 'warn'] : null,
      failed ? ['Lỗi', failed, 'err'] : null,
    ]);
    if (config.mail.bcc) ui.dim(`Bản sao đã BCC về: ${config.mail.bcc}`);
    if (archiver && notArchived > 0) ui.dim('(mail vẫn đã gửi; bản sao có qua BCC + báo cáo CSV).');
    if (archiver?.disabledReason) ui.warn(archiver.disabledReason);
    else if (archiver && !archived && archiver.lastError)
      ui.dim(`Lý do IMAP lỗi: ${archiver.lastError}`);
    // One report per design touched this session (each its own store/CSV).
    for (const [tpl, store] of stores) {
      ui.dim(`Báo cáo (mẫu "${tpl}"): ${store.report().replace(ROOT + '/', '')}`);
    }
  }
}
