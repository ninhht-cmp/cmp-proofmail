// Isolates Playwright. Tries bundled Chromium first, then system Edge/Chrome, so
// a blocked Chromium download (corporate proxy) doesn't stop a machine that
// already has a browser. All are Chromium, so the screenshot is identical.
import { chromium, type Browser, type LaunchOptions } from 'playwright';
import { errMsg } from '../lib/util.js';

const LAUNCH_ATTEMPTS: { label: string; options: LaunchOptions }[] = [
  { label: 'Chromium (đi kèm)', options: {} },
  { label: 'Microsoft Edge', options: { channel: 'msedge' } },
  { label: 'Google Chrome', options: { channel: 'chrome' } },
];

export async function launchBrowser(): Promise<Browser> {
  const failures: string[] = [];
  for (const attempt of LAUNCH_ATTEMPTS) {
    try {
      return await chromium.launch({ headless: true, ...attempt.options });
    } catch (err) {
      failures.push(`${attempt.label}: ${errMsg(err).split('\n')[0]}`);
    }
  }
  throw new Error(
    'Không mở được trình duyệt để chụp gian hàng. Hãy chạy "npx playwright install chromium", ' +
      'hoặc cài Microsoft Edge / Google Chrome rồi thử lại.\nĐã thử:\n  • ' +
      failures.join('\n  • '),
  );
}
