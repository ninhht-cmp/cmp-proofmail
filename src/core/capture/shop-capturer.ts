// Screenshots seller storefronts via Playwright. Stays silent — progress is
// emitted through onProgress so the CLI/web layer decides how to display it.
import pLimit from 'p-limit';
import type { Browser } from 'playwright';
import { launchBrowser } from '../../adapters/browser.js';
import { paths, fileExists, ensureDirs } from '../../adapters/storage.js';
import type { Seller, CaptureResult, Config, CaptureConfig } from '../types.js';

const PAGE_GOTO_TIMEOUT_MS = 45_000;
const NETWORK_SETTLE_MS = 3_000; // best-effort idle wait; capped so chatty sites don't hang
const LAZYLOAD_SCROLL_PX = 400; // nudge to trigger lazy-loaded product images
const SCROLL_SETTLE_MS = 800;
const TOP_SETTLE_MS = 250; // let the page repaint after scrolling back to top

async function screenshotShop(
  browser: Browser,
  seller: Seller,
  { capture, skipExisting }: { capture: CaptureConfig; skipExisting?: boolean },
): Promise<CaptureResult> {
  const out = paths.shot(seller.slug);
  if (skipExisting && fileExists(out)) return { ...seller, shot: out, cached: true };

  // Desktop layout but rasterized at a fractional scale → output ~emailWidth px,
  // keeping the inline image tiny (Gmail clips emails over ~102KB).
  const scale = Math.min(2, Math.max(0.25, capture.emailWidth / capture.width));
  const ctx = await browser.newContext({
    viewport: { width: capture.width, height: capture.height },
    deviceScaleFactor: scale,
  });
  const page = await ctx.newPage();
  try {
    // 'networkidle' as a SHORT best-effort only: analytics/long-poll sites never
    // go idle, so waiting on it would eat the full timeout every capture.
    await page.goto(seller.shop_url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_GOTO_TIMEOUT_MS,
    });
    await page.waitForLoadState('networkidle', { timeout: NETWORK_SETTLE_MS }).catch(() => {});
    // Scroll down to trigger lazy-loaded images, then back to top so the shot
    // starts at the seller header (else the top is cropped).
    await page.evaluate((px) => window.scrollBy(0, px), LAZYLOAD_SCROLL_PX);
    await page.waitForTimeout(SCROLL_SETTLE_MS);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(TOP_SETTLE_MS);
    await page.screenshot({
      path: out,
      type: 'jpeg',
      quality: capture.quality,
      fullPage: capture.fullPage,
    });
    return { ...seller, shot: out, cached: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...seller, shot: null, error: `screenshot lỗi: ${msg}` };
  } finally {
    await ctx.close();
  }
}

// Capture ONE shop on a browser the caller owns (manual flow reuses one browser
// across the session; the cache makes re-picks instant).
export async function captureShop(
  browser: Browser,
  seller: Seller,
  { config, skipExisting = true }: { config: Config; skipExisting?: boolean },
): Promise<CaptureResult> {
  ensureDirs();
  return screenshotShop(browser, seller, { capture: config.capture, skipExisting });
}

type CaptureProgress = (e: {
  done: number;
  total: number;
  seller: Seller;
  result: CaptureResult;
}) => void;

export async function captureShops(
  sellers: Seller[],
  {
    config,
    skipExisting = true,
    onProgress,
  }: { config: Config; skipExisting?: boolean; onProgress?: CaptureProgress },
): Promise<CaptureResult[]> {
  ensureDirs();
  const browser = await launchBrowser();
  const limit = pLimit(config.capture.concurrency);
  let done = 0;
  try {
    return await Promise.all(
      sellers.map((seller) =>
        limit(async () => {
          const result = await screenshotShop(browser, seller, {
            capture: config.capture,
            skipExisting,
          });
          done += 1;
          onProgress?.({ done, total: sellers.length, seller, result });
          return result;
        }),
      ),
    );
  } finally {
    await browser.close();
  }
}
