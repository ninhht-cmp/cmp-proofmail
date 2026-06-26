// Render the EXACT email to a temp HTML file and open it in the browser (FR-7),
// without firing a test mail. Reuses the real buildHtml/buildSubject so the
// preview can't drift. CLI-only — it touches fs + the OS browser.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { brandAssets, paths } from '../adapters/storage.js';
import { buildHtml, buildSubject, subjectTemplateFor } from '../core/render/template.js';
import type { Seller, Config } from '../core/types.js';

// cid: refs only resolve in a mail client, so the preview uses file:// URLs.
const fileSrc = (p: string) => pathToFileURL(p).href;

const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (ch) =>
      (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<string, string>)[ch],
  );

// Build the preview HTML, write it to a temp file, return its path.
export function writeEmailPreview(
  seller: Seller,
  { config, shotPath }: { config: Config; shotPath: string },
): string {
  const assets = Object.fromEntries(brandAssets.map((a) => [a.key, fileSrc(paths.asset(a.file))]));
  const html = buildHtml(seller, {
    imageSrc: fileSrc(shotPath),
    assets,
    template: config.mail.template,
  });

  const subjectTemplate = subjectTemplateFor(config.mail.template, config.mail.subjectTemplate);
  const subject = buildSubject(seller, { fromName: config.mail.fromName, subjectTemplate });

  // A header strip showing the envelope (to / subject), marked as not-yet-sent.
  const head =
    `<div style="font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:12px 16px;background:#f4f1ec;border-bottom:1px solid #e0d8cc;color:#444">` +
    `<b>Tới:</b> ${escapeHtml(seller.email)} &nbsp;·&nbsp; <b>Tiêu đề:</b> ${escapeHtml(subject)} ` +
    `<span style="color:#b06a4a">— bản xem trước, CHƯA gửi</span></div>`;
  const doc =
    `<!doctype html><html lang="vi"><head><meta charset="utf-8">` +
    `<title>Xem trước — ${escapeHtml(seller.seller_name)}</title></head><body style="margin:0">${head}${html}</body></html>`;

  const out = resolve(tmpdir(), `proofmail-preview-${seller.slug}.html`);
  writeFileSync(out, doc);
  return out;
}

// Open a file in the OS default app. Best-effort → false if the launcher can't
// start, so the caller can print the path instead of crashing.
export function openInBrowser(file: string): Promise<boolean> {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const cmd = isMac ? 'open' : isWin ? 'cmd' : 'xdg-open';
  // Windows `start` needs an empty title arg first, else a quoted path is taken as the title.
  const args = isWin ? ['/c', 'start', '', file] : [file];
  return new Promise((res) => {
    try {
      const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
      child.on('error', () => res(false));
      child.unref();
      res(true);
    } catch {
      res(false);
    }
  });
}
