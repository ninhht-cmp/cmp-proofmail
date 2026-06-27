#!/usr/bin/env node
// Reclaim disk on a staff machine: delete REGENERABLE junk only — storefront
// screenshots and the Google-Sheet CSV cache. Run via `npm run clean` or by
// double-clicking clean.bat / clean.command.
//
// SAFETY: an explicit allowlist, never a recursive wipe. output/state (send
// history + suppression list) and output/reports (audit CSVs) are NEVER touched —
// deleting those would cause double-sends or drop opt-outs. Standalone (no build
// needed) so it works even if dist/ is stale.
import { rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ONLY these. Keep this list tight — anything outside it is never removed.
const CLEANABLE = ['output/artifacts', 'output/sheets'];

let files = 0;
let bytes = 0;
for (const rel of CLEANABLE) {
  const dir = resolve(ROOT, rel);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    try {
      bytes += statSync(p).size;
      files += 1;
    } catch {
      /* ignore stat races */
    }
    rmSync(p, { recursive: true, force: true });
  }
}

const mb = (bytes / 1024 / 1024).toFixed(1);
console.log(`✅ Đã dọn ${files} file tạm (ảnh chụp gian hàng + cache), giải phóng ~${mb} MB.`);
console.log('   Giữ nguyên: lịch sử gửi, danh sách chặn (suppression) và báo cáo.');
