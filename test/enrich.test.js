// Enrich tool — the pure, no-network pieces that decide CORRECTNESS:
//   • buildImageKey follows the BE convention (marketings/{tpl}/{date}/{slug}.jpg)
//   • composePublicUrl joins origin + the BE-RETURNED key without double slashes
//   • createEnrichStore resumes only fully-uploaded URLs
//   • writeEnrichedCsv preserves columns and neutralizes formula injection
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import readXlsxFile from 'read-excel-file/node';
import { buildImageKey, composePublicUrl } from '../dist/adapters/cmp-api.js';
import {
  createEnrichStore,
  writeEnrichedCsv,
  writeEnrichedXlsx,
} from '../dist/adapters/storage.js';

test('buildImageKey: BE key convention, safe slug, fixed date', () => {
  const key = buildImageKey({
    template: 'Follow Up',
    slug: 'shop-com-abc',
    date: new Date('2026-06-30T10:00:00Z'),
  });
  assert.equal(key, 'marketings/follow-up/2026-06-30/shop-com-abc.jpg');
});

test('composePublicUrl: trims slashes, keeps path separators', () => {
  assert.equal(
    composePublicUrl('https://cdn.example.com/', '/marketings/a/b/x.jpg'),
    'https://cdn.example.com/marketings/a/b/x.jpg',
  );
  // The returned key (possibly prefixed) is used verbatim, just path-encoded.
  assert.equal(
    composePublicUrl('https://cdn.example.com', 'users/42/marketings/a/x.jpg'),
    'https://cdn.example.com/users/42/marketings/a/x.jpg',
  );
});

test('createEnrichStore: loadDone is upload-success-only (errors get retried)', () => {
  const ID = '__test_enrich';
  const file = createEnrichStore(ID).file;
  rmSync(file, { force: true });
  const s = createEnrichStore(ID);
  s.mark('https://a.com', { status: 'ok', imageUrl: 'https://cdn/x.jpg' });
  s.mark('https://b.com', { status: 'error', error: 'timeout' });
  // ok with no imageUrl must NOT count as done.
  s.mark('https://c.com', { status: 'ok' });

  assert.deepEqual([...createEnrichStore(ID).loadDone()].sort(), ['https://a.com']);
  rmSync(file, { force: true });
});

test('writeEnrichedCsv: preserves columns + BOM + formula-injection guard', () => {
  const out = '/tmp/__enrich_out.csv';
  rmSync(out, { force: true });
  writeEnrichedCsv(
    out,
    [{ name: '=cmd()', website: 'https://a.com', shop_image_url: 'https://cdn/x.jpg' }],
    ['name', 'website', 'shop_image_url'],
  );
  const text = readFileSync(out, 'utf8');
  assert.ok(text.startsWith('\uFEFF'), 'has UTF-8 BOM');
  assert.match(text, /name,website,shop_image_url/);
  // Leading "=" is neutralized with a single quote so Excel won't execute it.
  assert.match(text, /'=cmd\(\)/);
  rmSync(out, { force: true });
});

test('writeEnrichedXlsx: round-trips columns + values (xlsx in → xlsx out)', async () => {
  const out = '/tmp/__enrich_out.xlsx';
  rmSync(out, { force: true });
  await writeEnrichedXlsx(
    out,
    [{ name: 'Shop A', website: 'https://a.com', shop_image_url: 'https://cdn/x.jpg' }],
    ['name', 'website', 'shop_image_url'],
  );
  const [{ data }] = await readXlsxFile(out);
  assert.deepEqual(data[0], ['name', 'website', 'shop_image_url']);
  assert.deepEqual(data[1], ['Shop A', 'https://a.com', 'https://cdn/x.jpg']);
  rmSync(out, { force: true });
});
