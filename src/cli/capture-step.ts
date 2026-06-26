// A lazily-launched browser shared across ONE manual session (both one-by-one
// flows use it). Lazy: the browser starts on the FIRST capture, so quitting
// without sending pays no startup cost.
import type { Browser } from 'playwright';
import { launchBrowser } from '../adapters/browser.js';
import { captureSeller } from '../core/capture/store-capturer.js';
import { makeSpinner } from './ui.js';
import type { Seller, CaptureResult, Config } from '../core/types.js';

export interface BrowserSession {
  capture(seller: Seller, opts: { config: Config }): Promise<CaptureResult>;
  close(): Promise<void>;
}

export function createBrowserSession(): BrowserSession {
  let browser: Browser | null = null;

  return {
    // Capture one storefront with an honest spinner over the launch + screenshot.
    // try/finally so a launchBrowser() throw can't leak the spinner's interval.
    async capture(seller, { config }) {
      const spin = makeSpinner(
        browser ? `Đang chụp gian hàng của ${seller.seller_name}...` : 'Đang mở trình duyệt...',
      ).start();
      try {
        browser ??= await launchBrowser();
        spin.update(`Đang chụp gian hàng của ${seller.seller_name}...`);
        return await captureSeller(browser, seller, { config });
      } finally {
        spin.stop();
      }
    },

    async close() {
      if (browser) await browser.close();
      browser = null;
    },
  };
}
