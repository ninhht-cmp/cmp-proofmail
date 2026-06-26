// Outlook-draft flow: screenshot → open a pre-filled draft in classic Outlook for
// the operator to send by hand. Nothing goes over SMTP. Since the send happens out
// of our sight, we mark "sent" only AFTER the operator confirms — keeping the
// hide-from-list / no-duplicate guarantees honest.
import { confirm } from '@inquirer/prompts';
import { basename } from 'node:path';
import { ROOT } from '../config/app-config.js';
import { buildMessage, recordSent } from '../core/mailer/campaign-sender.js';
import { fillOutlookDraft } from '../adapters/outlook-draft.js';
import { createCampaignStore, createSuppressionStore } from '../adapters/storage.js';
import { remainingSellers, pickSeller, PICK_QUIT } from './seller-picker.js';
import { campaignIdFor } from './template-picker.js';
import { createBrowserSession } from './capture-step.js';
import { errMsg } from '../lib/util.js';
import { ui, c } from './ui.js';
import type { Config, Seller } from '../core/types.js';

export async function runManualDraft({
  config,
  file,
  sellers,
}: {
  config: Config;
  file: string;
  sellers: Seller[];
}): Promise<void> {
  const base = basename(file).replace(/\.[^.]+$/, '');
  // Sent-state scoped per (list, design), same rule as the SMTP flow.
  const campaign = createCampaignStore(campaignIdFor(base, config.mail.template));
  const suppression = createSuppressionStore();

  // Lazily-launched browser for this session (starts on the first capture).
  const session = createBrowserSession();

  let sent = 0;
  let drafted = 0;
  try {
    while (true) {
      const remaining = remainingSellers(sellers, campaign, suppression);
      if (!remaining.length) {
        ui.ok('Đã xử lý hết các người bán trong danh sách.');
        break;
      }

      const seller = await pickSeller(remaining, {
        message: `Chọn người bán để soạn nháp (còn ${remaining.length}) — gõ để lọc theo tên/email/sđt:`,
      });
      if (seller === PICK_QUIT) break;
      // This flow passes no templateLabel, so PICK_SWITCH never occurs — guard
      // anyway to drop any control symbol and leave a concrete Seller.
      if (!seller || typeof seller === 'symbol') continue;

      // Capture the storefront on demand (cached → instant on re-pick).
      const shot = await session.capture(seller, { config });
      if (!shot.shot) {
        ui.err(`Chụp gian hàng lỗi — CHƯA soạn nháp: ${shot.error}`);
        continue;
      }

      // Render + open the draft in Outlook. The window stays open for review.
      try {
        const msg = buildMessage(seller, { config });
        await fillOutlookDraft(msg, { fromEmail: config.mail.fromEmail });
        drafted++;
        ui.ok(`Đã mở nháp trong Outlook cho ${c.bold(seller.seller_name)} <${seller.email}>.`);
      } catch (err) {
        ui.err(`Không mở được nháp Outlook — bỏ qua người này: ${errMsg(err)}`);
        continue;
      }

      // The operator sends it by hand in Outlook. Only mark "sent" once they say
      // so — otherwise leave the seller in the list to try again.
      const didSend = await confirm({
        message:
          'Bạn đã bấm GỬI trong Outlook cho người này chưa? (Chọn "không" nếu chưa/huỷ — sẽ giữ trong danh sách)',
        default: true,
      });
      if (didSend) {
        recordSent(campaign, seller, { attempts: 1, info: null });
        sent++;
        ui.ok(`Đã đánh dấu "đã gửi" — ${seller.seller_name} (ẩn khỏi danh sách).`);
      } else {
        ui.dim('Giữ trong danh sách để soạn lại sau.');
      }
    }
  } finally {
    await session.close();
    ui.line();
    ui.title('KẾT THÚC PHIÊN');
    ui.ok(`Đã đánh dấu đã gửi trong phiên này: ${c.bold(sent)}`);
    if (drafted > sent) ui.dim(`Đã mở nháp nhưng chưa xác nhận gửi: ${drafted - sent}`);
    const report = campaign.report();
    ui.dim(`Báo cáo chi tiết: ${report.replace(ROOT + '/', '')}`);
  }
}
