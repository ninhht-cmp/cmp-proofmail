#!/usr/bin/env node
// Add an email to the do-not-send (suppression) list so a recipient who asked to
// unsubscribe is NEVER mailed again. This closes the loop on the email's opt-out
// link: the request arrives as an "unsubscribe" reply, and an operator records it
// here instead of hand-editing JSON.
//   npm run suppress -- nguoiban@example.com    (one-shot, e.g. a manager)
//   double-click suppress.bat / suppress.command (prompts for the address)
import { input } from '@inquirer/prompts';
import { createSuppressionStore } from '../dist/adapters/storage.js';
import { EMAIL_RE } from '../dist/lib/patterns.js';

const normalize = (s) =>
  String(s || '')
    .trim()
    .toLowerCase();

// Email is positional: `npm run suppress -- a@b.com` → process.argv[2]. Absent
// (double-clicked launcher) → prompt for it.
let email = normalize(process.argv[2]);
if (!email) {
  email = normalize(
    await input({
      message: 'Nhập email cần thêm vào danh sách KHÔNG gửi lại:',
      validate: (v) => (EMAIL_RE.test(normalize(v)) ? true : 'Email không hợp lệ — nhập lại.'),
    }),
  );
} else if (!EMAIL_RE.test(email)) {
  console.error(`❌ Email không hợp lệ: ${email}`);
  process.exit(1);
}

const added = createSuppressionStore().suppress(email, { reason: 'unsubscribe', source: 'manual' });
console.log(
  added
    ? `✅ Đã thêm ${email} vào danh sách không gửi lại — từ giờ sẽ không gửi cho địa chỉ này.`
    : `ℹ️  ${email} đã có trong danh sách không gửi từ trước.`,
);
