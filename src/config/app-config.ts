import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Config } from '../core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..', '..');

// Running version (from package.json) — shown on the banner so you can tell which
// release a machine is on. ROOT walks up to the repo root, so it resolves the
// same whether this runs from src/ or dist/.
export const VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version || '?';
  } catch {
    return '?';
  }
})();

// Gmail/Workspace/365 show app passwords as four space-separated groups that
// must be sent WITHOUT the spaces; operators paste them verbatim. Strip spaces
// only for that exact shape, so a real password with spaces is never altered.
function normalizeSmtpPass(raw: string | undefined): string {
  const s = String(raw ?? '').trim();
  return /^(\w{4} ){3}\w{4}$/.test(s) ? s.replace(/ /g, '') : s;
}

// A factory, not a singleton (V2's multi-tenant layer needs one config per sending
// account). Env-derived strings are coerced to '' so the result matches Config;
// checkEnv() still blocks an empty REQUIRED value before any send.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mailsPerHour = Number(env.MAILS_PER_HOUR || 100);
  const fromEmail = env.MAIL_FROM_EMAIL || env.SMTP_USER || '';
  // List-Unsubscribe = a clean opt-out instead of a spam report. The operator must
  // honor "unsubscribe" replies by adding them to the suppression list.
  const unsubscribe = fromEmail ? `mailto:${fromEmail}?subject=unsubscribe` : '';
  return {
    smtp: {
      host: env.SMTP_HOST || '',
      port: Number(env.SMTP_PORT || 465),
      secure: String(env.SMTP_SECURE) === 'true',
      user: env.SMTP_USER || '',
      pass: normalizeSmtpPass(env.SMTP_PASS),
    },
    mail: {
      fromName: env.MAIL_FROM_NAME || 'ComacPro JSC',
      fromEmail,
      // BCC a copy to your own/archive address — rides the proven SMTP transaction,
      // invisible to the recipient. Comma-separate for several addresses.
      bcc: env.MAIL_BCC || '',
      unsubscribe,
      subjectTemplate:
        env.MAIL_SUBJECT ||
        '{{from_name}} — Your Equipment Is Now Visible to {{seller_name}} on comacpro.net',
      template: env.MAIL_TEMPLATE || 'touch',
      // 'smtp' = deliver over SMTP; 'outlook-draft' = open a pre-filled draft in
      // classic Outlook (Windows) to send by hand. --draft overrides per run.
      transport: env.MAIL_TRANSPORT === 'outlook-draft' ? 'outlook-draft' : 'smtp',
    },
    // SMTP only DELIVERS; when saveSent is on we APPEND a copy over IMAP. Defaults
    // reuse the SMTP account so Mắt Bão / cPanel need only IMAP_SAVE_SENT=true.
    imap: {
      saveSent: String(env.IMAP_SAVE_SENT) === 'true',
      host: env.IMAP_HOST || env.SMTP_HOST || '',
      port: Number(env.IMAP_PORT || 993),
      secure: String(env.IMAP_SECURE ?? 'true') === 'true',
      user: env.IMAP_USER || env.SMTP_USER || '',
      pass: normalizeSmtpPass(env.IMAP_PASS || env.SMTP_PASS),
      sentFolder: env.IMAP_SENT_FOLDER || '', // '' → auto-detect via \Sent special-use
    },
    throttle: {
      mailsPerHour,
      mailDelayMs: Math.ceil(3_600_000 / Math.max(1, mailsPerHour)),
    },
    capture: {
      concurrency: Number(env.SCREENSHOT_CONCURRENCY || 4),
      width: Number(env.SHOT_WIDTH || 1280), // layout viewport (desktop look)
      height: Number(env.SHOT_HEIGHT || 900),
      fullPage: String(env.SHOT_FULL_PAGE) === 'true',
      // Downscale output to emailWidth px (Gmail clips emails > ~102KB); 720px is
      // retina-sharp at the ~270px the email displays it.
      emailWidth: Number(env.SHOT_EMAIL_WIDTH || 720),
      quality: Number(env.SHOT_QUALITY || 80),
    },
    // Signed seller-identity token appended to the CTA shop_url at send time. No
    // secret set → feature off, links ship clean (today's behaviour). The receiver
    // resolves the seller with readToken(token, SHOP_URL_TOKEN_SECRET).
    tracking: {
      tokenSecret: env.SHOP_URL_TOKEN_SECRET || '',
      tokenParam: env.SHOP_URL_TOKEN_PARAM || 'ref',
    },
  };
}
