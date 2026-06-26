#!/usr/bin/env node
// Dev-only: npm run screenshot [-- --file=data/sellers.csv]
// Captures storefronts without sending. Falls back to the sample file.
import { resolve } from 'node:path';
import { loadConfig, ROOT } from '../dist/config/app-config.js';
import { loadSellers } from '../dist/core/sellers/seller-loader.js';
import { captureStores } from '../dist/core/capture/store-capturer.js';
import { flagVal } from '../dist/cli/args.js';

const config = loadConfig();
const fileArg = flagVal('file');
const file = fileArg ? resolve(fileArg) : resolve(ROOT, 'data', 'sample-sellers.csv');

const { valid, skipped } = await loadSellers(file);
if (skipped.length) console.log(`⚠️  Bỏ qua ${skipped.length} dòng không hợp lệ.`);
console.log(`📸 Chụp ${valid.length} gian hàng (song song x${config.capture.concurrency})...`);

const res = await captureStores(valid, {
  config,
  onProgress: ({ done, total, seller, result }) => {
    const tag = result.cached ? 'cache' : result.error ? 'LỖI ' : 'ok  ';
    console.log(`  [${String(done).padStart(4)}/${total}] ${tag} ${seller.seller_name}`);
  },
});

const ok = res.filter((r) => r.shot).length;
console.log(`\n✅ Xong: ${ok}/${valid.length} ảnh. Lưu tại output/artifacts/`);
