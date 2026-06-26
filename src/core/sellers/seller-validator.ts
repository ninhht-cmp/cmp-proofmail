// Pure: raw rows in, classified rows out — no file IO, no logging.
import { EMAIL_RE } from '../../lib/patterns.js';
import type { Seller, SkippedRow, DuplicateRow, ValidationResult } from '../types.js';

// shop_url is both the capture target and the CTA href — a missing scheme would
// silently break the button in already-sent mail.
const HTTP_URL_RE = /^https?:\/\/\S+$/i;

// Tolerate any header casing/spacing: "Shop URL" / "shop_url" both map to shop_url.
export function normalizeKey(key: string): string {
  return String(key)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function emailToSlug(email: string): string {
  return email.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
}

// Tiny deterministic hash (djb2 → base36). Not cryptographic — only disambiguates
// two emails that collapse to the same base slug. Inline → no node:crypto in core.
function shortHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// The three required columns (extras are ignored). "Name" also accepts the legacy
// "seller_name" header; a missing required column blocks the whole send.
const REQUIRED_COLUMNS = [
  { keys: ['name', 'seller_name'], label: 'Name' },
  { keys: ['email'], label: 'Email' },
  { keys: ['shop_url'], label: 'Shop URL' },
];

export function validateSellers(rawRows: Record<string, any>[]): ValidationResult {
  const columns = Object.keys(rawRows[0]).map(normalizeKey);
  const missingRequired = REQUIRED_COLUMNS.filter(
    (r) => !r.keys.some((k) => columns.includes(k)),
  ).map((r) => r.label);
  const rows = rawRows.map((row) => {
    const normalized: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[normalizeKey(key)] = typeof value === 'string' ? value.trim() : value;
    }
    return normalized;
  });

  const valid: Seller[] = [];
  const skipped: SkippedRow[] = [];
  const duplicates: DuplicateRow[] = [];
  const seenEmail = new Map<string, number>();

  rows.forEach((row, index) => {
    const line = index + 2; // +1 header row, +1 to 1-index, so it matches the spreadsheet
    const email = (row.email || '').toLowerCase();

    if (!email || !row.shop_url) {
      skipped.push({ line, reason: !email ? 'thiếu email' : 'thiếu shop_url' });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      skipped.push({ line, reason: `email không hợp lệ: ${email}` });
      return;
    }
    if (!HTTP_URL_RE.test(row.shop_url)) {
      skipped.push({ line, reason: `shop_url phải bắt đầu bằng http(s): ${row.shop_url}` });
      return;
    }
    const firstLine = seenEmail.get(email);
    if (firstLine !== undefined) {
      duplicates.push({ line, email, firstLine });
      return; // drop the duplicate, keep the first occurrence
    }

    seenEmail.set(email, line);
    valid.push({
      // Required header is "Name" (→ name); keep "seller_name" as a legacy alias.
      seller_name: row.name || row.seller_name || '(không tên)',
      email,
      shop_url: row.shop_url,
      // Optional, display-only (shown in the manual picker; never used to send).
      // Accept common header spellings → all normalize to one of these keys.
      phone: row.phone || row.sdt || row.phone_number || row.mobile || row['số_điện_thoại'] || '',
      slug: emailToSlug(email),
    });
  });

  // Slug-collision guard: two emails differing only in punctuation (a.b@ vs
  // a_b@) collapse to the same base slug → the SAME screenshot filename → a
  // seller could be mailed another's storefront proof. Disambiguate ONLY the
  // colliding slugs (append a short email hash); every non-colliding slug stays
  // byte-identical, so the screenshot cache and the stable-output guarantee
  // (NFR-5) still hold for the overwhelmingly common case.
  const slugUse = new Map<string, number>();
  for (const s of valid) slugUse.set(s.slug, (slugUse.get(s.slug) ?? 0) + 1);
  for (const s of valid) {
    if ((slugUse.get(s.slug) ?? 0) > 1) s.slug = `${s.slug}_${shortHash(s.email)}`;
  }

  return { valid, skipped, duplicates, columns, missingRequired };
}
