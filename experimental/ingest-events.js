#!/usr/bin/env node
// Ingest ESP delivery events (Tier B) from a JSON file into the suppression list
// (and optionally a campaign report). Use this for batch/feedback imports, or as
// the exact call a live webhook handler makes — same core either way.
//
//   npm run ingest -- --file=events.json [--provider=ses|sendgrid|normalized] [--campaign=<id>]
//
// --provider  shape of the file (default: normalized = already our event shape)
// --campaign  also stamp delivered/bounce/complaint onto that campaign's report
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSuppressionStore, createCampaignStore } from '../dist/adapters/storage.js';
import { applyDeliveryEvents, normalizeEvents } from './delivery-events.js';
import { flagVal } from '../dist/cli/args.js';

const fileArg = flagVal('file');
if (!fileArg || !existsSync(resolve(fileArg))) {
  console.error(
    'Thiếu/không thấy file. Dùng: npm run ingest -- --file=events.json [--provider=ses|sendgrid] [--campaign=<id>]',
  );
  process.exit(1);
}

const provider = flagVal('provider') || 'normalized';
const campaignId = flagVal('campaign');

let payload;
try {
  payload = JSON.parse(readFileSync(resolve(fileArg), 'utf8'));
} catch (e) {
  console.error(`File không phải JSON hợp lệ: ${e.message}`);
  process.exit(1);
}

const events = normalizeEvents(provider, payload);
const suppression = createSuppressionStore();
const campaignStore = campaignId ? createCampaignStore(campaignId) : null;

const summary = applyDeliveryEvents(events, { suppression, campaignStore });

console.log(`Đã đọc ${events.length} sự kiện (provider: ${provider}).`);
console.log(
  `  delivered ${summary.delivered} · bounce ${summary.bounce} · complaint ${summary.complaint} · deferred ${summary.deferred}`,
);
console.log(
  `  → thêm ${summary.suppressed} địa chỉ vào suppression list (tổng: ${suppression.loadSet().size}).`,
);
if (campaignStore) {
  const report = campaignStore.report();
  console.log(`  → cập nhật ${summary.recorded} bản ghi; báo cáo: ${report}`);
}
if (summary.ignored) console.log(`  (bỏ qua ${summary.ignored} sự kiện không nhận dạng được)`);
