// Sends the whole campaign: throttle + retry + checkpoint (no double-sends).
// Silent and global-free — everything arrives by argument, progress via onProgress.
import { sleep, errMsg } from '../../lib/util.js';
import { createTransport, buildRawMessage } from '../../adapters/smtp-transport.js';
import { createSentArchiver } from '../../adapters/imap-sent.js';
import {
  paths,
  createCampaignStore,
  createSuppressionStore,
  missingBrandAssets,
  brandAssets,
  brandAssetSrcs,
} from '../../adapters/storage.js';
import { buildHtml, buildSubject, buildText, subjectTemplateFor } from '../render/template.js';
import { shopUrlFor, utmCampaignFor } from '../render/shop-url.js';
import type { Seller, CaptureResult, Config, CampaignResult } from '../types.js';

// Inline brand-chrome attachments, built from the same brandAssets the template
// draws so the attachments and the {{assets.*}} cid refs can never disagree.
const BRAND_ATTACHMENTS = brandAssets.map((a) => ({
  filename: a.file,
  path: paths.asset(a.file),
  cid: a.cid,
}));

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 3000; // × attempt number

// 5xx = permanent rejection (dead/blocked address) — not worth retrying.
const isPermanentSmtp = (err: any): boolean => {
  const code = err?.responseCode;
  return code >= 500 && code < 600;
};

// recordSent / recordFailed: the SINGLE place an outcome record is shaped, so the
// bulk and manual flows can never drift.
export function recordSent(
  campaign: any,
  seller: Seller,
  { attempts, info }: { attempts: number; info?: { messageId?: string | null } | null },
): void {
  campaign.markSent(seller.email, {
    seller_name: seller.seller_name,
    shop_url: seller.shop_url,
    phone: seller.phone || '',
    attempts,
    messageId: info?.messageId || null,
  });
}

export function recordFailed(
  campaign: any,
  suppression: any,
  seller: Seller,
  { attempts, err }: { attempts: number; err: any },
): boolean {
  const permanent = isPermanentSmtp(err);
  campaign.markFailed(seller.email, {
    seller_name: seller.seller_name,
    shop_url: seller.shop_url,
    phone: seller.phone || '',
    attempts,
    responseCode: err?.responseCode || err?.code || null,
    permanent,
    error: errMsg(err),
  });
  // A permanent hard bounce must never be re-mailed in any future campaign.
  if (permanent) suppression.suppress(seller.email, { reason: 'hard-bounce', source: 'smtp-5xx' });
  return permanent;
}

// List-Unsubscribe gives a clean opt-out instead of a spam report (one-click
// https is a V2/ESP concern).
function complianceHeaders({ unsubscribe }: { unsubscribe?: string }): Record<string, string> {
  return unsubscribe ? { 'List-Unsubscribe': `<${unsubscribe}>` } : {};
}

// The SINGLE place an outgoing message is shaped (real send / test send / archive
// copy can't drift). bcc is deliberately NOT set here: the raw-send path
// serializes this verbatim and a streamTransport does NOT strip a Bcc header — it
// would leak the archive address to the recipient. bcc is applied per-path
// instead (sendOne's bcc field, or the envelope in the archiver path).
export function buildMessage(
  seller: Seller,
  { config, overrideTo }: { config: Config; overrideTo?: string },
) {
  // Tokenize ONCE here so the HTML and text parts carry the same CTA link (and the
  // screenshot capture, which uses seller.shop_url directly, stays un-tokenized).
  // new Date() per call is fine at month granularity — every mail in a run shares the
  // month (a run spans only tens of minutes); see utmCampaignFor.
  const shopUrl = shopUrlFor(seller, {
    ...config.tracking,
    utmCampaign: utmCampaignFor(config.mail.template, new Date()),
  });
  const html = buildHtml(seller, {
    imageSrc: 'cid:shopshot',
    assets: brandAssetSrcs(),
    template: config.mail.template,
    shopUrl,
    unsubscribe: config.mail.unsubscribe,
  });
  const text = buildText(seller, {
    fromName: config.mail.fromName,
    contact: config.mail.fromEmail,
    template: config.mail.template,
    shopUrl,
  });
  const attachments = [
    ...BRAND_ATTACHMENTS,
    { filename: 'shop.jpg', path: paths.shot(seller.slug), cid: 'shopshot' },
  ];
  const subjectTemplate = subjectTemplateFor(config.mail.template, config.mail.subjectTemplate);

  return {
    from: `"${config.mail.fromName}" <${config.mail.fromEmail}>`,
    to: overrideTo || seller.email,
    subject: buildSubject(seller, { fromName: config.mail.fromName, subjectTemplate }),
    html,
    text,
    attachments,
    headers: complianceHeaders(config.mail),
  };
}

// Raw-send envelope recipients: the seller plus any bcc archive addresses. bcc
// rides the envelope ONLY (never a header), so it stays invisible to the seller.
export function envelopeRecipients(seller: Seller, config: Config): string[] {
  const to = [seller.email];
  if (config.mail.bcc)
    to.push(
      ...String(config.mail.bcc)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  return to;
}

// One mail to a chosen address (no-archiver real send + test send). bcc is
// skipped on a test send (overrideTo) so a self-test doesn't fan out copies.
export async function sendOne(
  transport: any,
  seller: Seller,
  { config, overrideTo }: { config: Config; overrideTo?: string },
): Promise<any> {
  const base = buildMessage(seller, { config, overrideTo });
  // Spread (not mutate) so buildMessage's return stays bcc-free elsewhere — the leak guard.
  const msg = config.mail.bcc && !overrideTo ? { ...base, bcc: config.mail.bcc } : base;
  return transport.sendMail(msg);
}

type ArchiveOutcome = 'saved' | 'failed' | 'skipped' | 'none';

// Sends one mail and, if an archiver is live, files a Sent-folder copy over IMAP.
// Archiving NEVER blocks delivery — the mail is already out — so failures are
// swallowed and reported via the returned status (BCC + report still cover them).
export async function deliverAndArchive(
  transport: any,
  seller: Seller,
  { config, archiver }: { config: Config; archiver: any },
): Promise<{ info: any; archive: ArchiveOutcome }> {
  if (!archiver) return { info: await sendOne(transport, seller, { config }), archive: 'none' };
  if (archiver.disabled)
    return { info: await sendOne(transport, seller, { config }), archive: 'skipped' };
  // Build the MIME once; send those bytes then append the SAME bytes, so the
  // archived copy is byte-identical (same Message-ID) to what was received.
  const built = await buildRawMessage(buildMessage(seller, { config }));
  const envelope = { from: config.mail.fromEmail, to: envelopeRecipients(seller, config) };
  const info = await transport.sendMail({ envelope, raw: built.message });
  try {
    await archiver.append(built.message);
    return { info, archive: 'saved' };
  } catch {
    return { info, archive: 'failed' };
  }
}

type SendOutcome =
  | { ok: true; attempts: number; info: any; archive: ArchiveOutcome }
  | { ok: false; attempts: number; err: any };

// Deliver ONE mail with bounded retry (skip retries on a permanent 5xx). Owns no
// shared state — the caller keeps the checkpoint write, the tallies, the throttle.
async function sendOneWithRetry(
  tx: any,
  seller: Seller,
  { config, archiver }: { config: Config; archiver: any },
): Promise<SendOutcome> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { info, archive } = await deliverAndArchive(tx, seller, { config, archiver });
      return { ok: true, attempts: attempt, info, archive };
    } catch (err) {
      if (attempt < MAX_RETRIES && !isPermanentSmtp(err)) {
        await sleep(RETRY_BACKOFF_MS * attempt);
      } else {
        return { ok: false, attempts: attempt, err };
      }
    }
  }
  // Unreachable (the final attempt always returns) — keeps the return type total.
  return { ok: false, attempts: MAX_RETRIES, err: new Error('unreachable') };
}

interface SendCampaignOpts {
  config: Config;
  store?: any; // CampaignStore (DI); CLI omits it and builds one from campaignId.
  suppression?: any; // global do-not-send list (DI); defaults to the file store.
  campaignId?: string; // stable key so a re-run of the same list resumes.
  transport?: any;
  resume?: boolean;
  dryRun?: boolean;
  onProgress?: (e: any) => void;
}

export async function sendCampaign(
  cards: CaptureResult[],
  {
    config,
    store,
    suppression,
    campaignId,
    transport,
    resume = true,
    dryRun = false,
    onProgress,
  }: SendCampaignOpts,
): Promise<CampaignResult> {
  const campaign = store || createCampaignStore(campaignId);
  const suppress = suppression || createSuppressionStore();
  const already: Set<string> = resume ? campaign.loadSent() : new Set();
  if (!resume) campaign.reset();

  // Drop suppressed (hard bounces / complaints) before anything else.
  const queue = cards.filter((c) => c.shot);
  const suppressedSet: Set<string> = suppress.loadSet();
  const mailable = queue.filter((c) => !suppressedSet.has(String(c.email).toLowerCase()));
  const pending = mailable.filter((c) => !already.has(c.email));
  const log: CampaignResult = {
    sent: [],
    failed: [],
    skippedAlready: mailable.length - pending.length,
    skippedSuppressed: queue.length - mailable.length,
  };

  if (dryRun) {
    pending.forEach((seller, i) => {
      log.sent.push(seller.email);
      onProgress?.({ done: i + 1, total: pending.length, seller, ok: true, dryRun: true });
    });
    return log;
  }

  // Fail fast: a missing brand image would make EVERY email throw at attach time.
  const missingAssets = missingBrandAssets();
  if (missingAssets.length) {
    throw new Error(`Thiếu ảnh thương hiệu trong assets/: ${missingAssets.join(', ')}`);
  }

  // Reuse a caller-supplied transport (V2) or own one for the run (CLI).
  const ownTransport = !transport;
  const tx = transport || createTransport(config.smtp);
  try {
    await tx.verify();
  } catch (e) {
    if (ownTransport) tx.close();
    throw new Error(`Không kết nối được máy chủ gửi mail: ${errMsg(e)}`, { cause: e });
  }

  // Optional IMAP archiving — best-effort; a failed connection never blocks sending.
  let archiver: any = null;
  if (config.imap?.saveSent) {
    try {
      archiver = await createSentArchiver(config.imap);
      log.archive = { folder: archiver.folder, saved: 0, failed: 0, skipped: 0 };
    } catch (e) {
      log.archive = { folder: null, saved: 0, failed: 0, skipped: 0, connectError: errMsg(e) };
    }
  }

  try {
    for (let i = 0; i < pending.length; i++) {
      const seller = pending[i];
      const res = await sendOneWithRetry(tx, seller, { config, archiver });
      if (res.ok) {
        log.sent.push(seller.email);
        // Tally archive outcome so saved+failed+skipped always equals sent.
        if (log.archive && log.archive.folder) {
          if (res.archive === 'saved') log.archive.saved++;
          else if (res.archive === 'failed') log.archive.failed++;
          else if (res.archive === 'skipped') log.archive.skipped++;
        }
        // Checkpoint immediately — a hard crash must not re-send on resume.
        recordSent(campaign, seller, { attempts: res.attempts, info: res.info });
      } else {
        log.failed.push({ email: seller.email, error: errMsg(res.err) });
        recordFailed(campaign, suppress, seller, { attempts: res.attempts, err: res.err });
      }
      onProgress?.({ done: i + 1, total: pending.length, seller, ok: res.ok });
      if (i < pending.length - 1) await sleep(config.throttle.mailDelayMs);
    }
  } finally {
    // Surface why IMAP archiving stopped, so the CLI can point to BCC + the report.
    if (log.archive && archiver?.disabledReason)
      log.archive.disabledReason = archiver.disabledReason;
    if (log.archive && archiver?.lastError) log.archive.lastError = archiver.lastError;
    if (archiver) await archiver.close().catch(() => {});
    if (ownTransport) tx.close();
  }

  return log;
}
