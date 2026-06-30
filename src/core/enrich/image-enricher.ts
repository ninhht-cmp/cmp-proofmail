// Orchestrates the enrich pipeline per URL: screenshot → upload to S3 → record
// the public link. Pure core: no terminal, no env, no globals — the API client
// and the checkpoint store arrive by ARGUMENT (DI), and progress leaves via
// onProgress. One bad URL is recorded and skipped, never aborts the run.
import pLimit from 'p-limit';
import { launchBrowser } from '../../adapters/browser.js';
import { captureBuffer } from '../capture/shop-capturer.js';
import { buildImageKey, type CmpApi } from '../../adapters/cmp-api.js';
import type { CaptureConfig, CaptureTarget } from '../types.js';
import type { EnrichRecord, createEnrichStore } from '../../adapters/storage.js';

const CONTENT_TYPE = 'image/jpeg'; // captureBuffer always emits JPEG

type EnrichStore = ReturnType<typeof createEnrichStore>;

// 'skip' is a run-time outcome (resume), not a persisted status — so override it.
export type EnrichOutcome = Omit<EnrichRecord, 'status'> & { status: 'ok' | 'error' | 'skip' };

export interface EnrichProgress {
  done: number;
  total: number;
  target: CaptureTarget;
  outcome: EnrichOutcome;
}

export interface EnrichDeps {
  capture: CaptureConfig;
  api: CmpApi;
  store: EnrichStore;
  /** email-template name → goes into the S3 key path. */
  template: string;
  /** Skip URLs already uploaded OK in a prior run (default true). */
  resume?: boolean;
  onProgress?: (e: EnrichProgress) => void;
}

async function processOne(
  browser: Awaited<ReturnType<typeof launchBrowser>>,
  target: CaptureTarget,
  {
    capture,
    api,
    template,
    date,
  }: { capture: CaptureConfig; api: CmpApi; template: string; date: Date },
): Promise<EnrichOutcome> {
  const shot = await captureBuffer(browser, target, capture);
  if ('error' in shot) return { url: target.url, status: 'error', error: shot.error };
  try {
    const key = buildImageKey({ template, slug: target.slug, date });
    const { url } = await api.uploadImage(shot.buffer, { key, contentType: CONTENT_TYPE });
    return { url: target.url, status: 'ok', imageUrl: url };
  } catch (err) {
    return {
      url: target.url,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Process distinct URL targets. Returns one outcome per target (same order). */
export async function enrichImages(
  targets: CaptureTarget[],
  { capture, api, store, template, resume = true, onProgress }: EnrichDeps,
): Promise<EnrichOutcome[]> {
  // One date for the whole run so every key lands in the same day folder, even if
  // a long run crosses midnight.
  const date = new Date();
  const alreadyDone = resume ? store.loadDone() : new Set<string>();
  const browser = await launchBrowser();
  const limit = pLimit(capture.concurrency);
  let done = 0;

  try {
    return await Promise.all(
      targets.map((target) =>
        limit(async (): Promise<EnrichOutcome> => {
          let outcome: EnrichOutcome;
          if (alreadyDone.has(target.url)) {
            const prev = store.loadRecords()[target.url];
            outcome = { url: target.url, status: 'skip', imageUrl: prev?.imageUrl };
          } else {
            outcome = await processOne(browser, target, { capture, api, template, date });
            // Persist per row so a crash/Ctrl-C resumes instead of re-uploading.
            if (outcome.status !== 'skip') {
              store.mark(target.url, {
                status: outcome.status,
                imageUrl: outcome.imageUrl,
                error: outcome.error,
              });
            }
          }
          done += 1;
          onProgress?.({ done, total: targets.length, target, outcome });
          return outcome;
        }),
      ),
    );
  } finally {
    await browser.close();
  }
}
