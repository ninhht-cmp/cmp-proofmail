import type { Config } from '../core/types.js';

// Returns the list of missing settings (empty = OK). Takes config rather than
// reading env so it works at any layer. The Outlook-draft transport never opens
// an SMTP connection, so it only needs a From address (the draft is sent by hand
// from Outlook) — not the SMTP host/login/password.
export function checkEnv(config: Config): string[] {
  const missing: string[] = [];
  if (config.mail.transport === 'outlook-draft') {
    if (!config.mail.fromEmail)
      missing.push('MAIL_FROM_EMAIL (hoặc SMTP_USER) — địa chỉ gửi hiển thị trên nháp');
    return missing;
  }
  if (!config.smtp.host) missing.push('SMTP_HOST (máy chủ gửi mail)');
  if (!config.smtp.user) missing.push('SMTP_USER (email đăng nhập)');
  if (!config.smtp.pass) missing.push('SMTP_PASS (mật khẩu ứng dụng)');
  return missing;
}
