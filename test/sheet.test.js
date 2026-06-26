import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheetUrl, sheetCsvUrl } from '../dist/adapters/google-sheet.js';
import { parseCsv } from '../dist/core/sellers/seller-loader.js';
import { validateSellers } from '../dist/core/sellers/seller-validator.js';

test('parseSheetUrl extracts id + gid (defaults gid 0); builds export url', () => {
  const u =
    'https://docs.google.com/spreadsheets/d/1y5nl2YnhG8DRWidY0SmQeRYoHxQ74HF1FQWx1saRTNs/edit?gid=432999072#gid=432999072';
  assert.deepEqual(parseSheetUrl(u), {
    id: '1y5nl2YnhG8DRWidY0SmQeRYoHxQ74HF1FQWx1saRTNs',
    gid: '432999072',
  });
  assert.equal(parseSheetUrl('https://docs.google.com/spreadsheets/d/ABC/edit').gid, '0');
  assert.throws(() => parseSheetUrl('https://example.com/x'), /không hợp lệ/);
  assert.ok(sheetCsvUrl({ id: 'ABC', gid: '7' }).endsWith('/ABC/export?format=csv&gid=7'));
});

test('parseCsv tolerates blank + duplicate headers (Google Sheet exports)', () => {
  // two blank header cells + the real columns, exactly like the exported sheet
  const csv =
    'Name,Email,Phone Number,,,Shop URL,Created At,Status\nAcme,a@x.com,123,,,https://x/a,,\n';
  const { valid } = validateSellers(parseCsv(csv));
  assert.equal(valid.length, 1);
  assert.equal(valid[0].seller_name, 'Acme');
  assert.equal(valid[0].email, 'a@x.com');
  assert.equal(valid[0].shop_url, 'https://x/a');
  assert.equal(valid[0].phone, '123');
});

test('parseCsv handles an Excel semicolon delimiter and a UTF-8 BOM', () => {
  // Excel "Save as CSV" in many locales → ';' separator
  const semi = validateSellers(parseCsv('Name;Email;Shop URL\nAcme;a@x.com;https://x/a\n'));
  assert.deepEqual(semi.missingRequired, []);
  assert.equal(semi.valid[0]?.email, 'a@x.com');

  // Excel "CSV UTF-8" prepends a BOM to the first header cell
  const bom = validateSellers(parseCsv('﻿Name,Email,Shop URL\nBeta,b@x.com,https://x/b\n'));
  assert.deepEqual(bom.missingRequired, []);
  assert.equal(bom.valid[0]?.seller_name, 'Beta');
});
