import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createCampaignStore, paths } from '../dist/adapters/storage.js';

const ID = '__test_store';
const cleanup = () => {
  rmSync(createCampaignStore(ID).file, { force: true });
  rmSync(paths.report(ID), { force: true });
};

test('markSent / markFailed: loadSent is success-only, records keep both', () => {
  cleanup();
  const s = createCampaignStore(ID);
  s.markSent('ok@x.com', { seller_name: 'OK Co', attempts: 1, messageId: '<m1>' });
  s.markFailed('bad@x.com', {
    seller_name: 'Bad Co',
    attempts: 3,
    responseCode: 550,
    permanent: true,
    error: 'No such user',
  });

  // Resume guard must NOT include the failed one — so it gets retried on re-run.
  assert.deepEqual([...s.loadSent()], ['ok@x.com']);

  const recs = s.loadRecords();
  assert.equal(recs['ok@x.com'].status, 'sent');
  assert.equal(recs['ok@x.com'].messageId, '<m1>');
  assert.equal(recs['bad@x.com'].status, 'failed');
  assert.equal(recs['bad@x.com'].permanent, true);
  cleanup();
});

test('persistence survives a fresh store instance (crash + resume)', () => {
  cleanup();
  createCampaignStore(ID).markSent('a@x.com', { attempts: 1 });
  // a brand-new instance reads the file from disk
  assert.deepEqual([...createCampaignStore(ID).loadSent()], ['a@x.com']);
  cleanup();
});

test('atomic write: file stays valid JSON and leaves no .tmp behind', () => {
  cleanup();
  const s = createCampaignStore(ID);
  s.markSent('a@x.com', { attempts: 1 });
  s.markFailed('b@x.com', { attempts: 2 });
  JSON.parse(readFileSync(s.file, 'utf8')); // parses = not truncated
  assert.equal(existsSync(s.file + '.tmp'), false, 'temp file renamed away, not left behind');
  cleanup();
});

test('reads legacy { sent:[...] } files (migration)', () => {
  cleanup();
  const file = createCampaignStore(ID).file;
  writeFileSync(file, JSON.stringify({ sent: ['legacy@x.com'] }));
  assert.deepEqual([...createCampaignStore(ID).loadSent()], ['legacy@x.com']);
  cleanup();
});

test('reset clears all records', () => {
  cleanup();
  const s = createCampaignStore(ID);
  s.markSent('a@x.com', {});
  s.reset();
  assert.equal(s.loadSent().size, 0);
  assert.deepEqual(s.loadRecords(), {});
  cleanup();
});

test('report() writes a CSV with header, rows, and RFC-4180 escaping', () => {
  cleanup();
  const s = createCampaignStore(ID);
  s.markSent('ok@x.com', {
    seller_name: 'OK Co',
    shop_url: 'https://x/ok',
    phone: '0909',
    attempts: 1,
    messageId: '<m1>',
  });
  s.markFailed('bad@x.com', {
    seller_name: 'Comma, Inc',
    attempts: 2,
    error: 'said "no"',
    responseCode: 421,
  });

  const csv = readFileSync(s.report(), 'utf8');
  assert.ok(csv.startsWith('﻿'), 'leads with a BOM so Excel reads it as UTF-8');
  const lines = csv.trim().split('\n');
  assert.equal(
    lines[0],
    'seller_name,email,shop_url,phone,status,updatedAt,attempts,responseCode,permanent,messageId,error,deliveryStatus,deliveryAt',
  );
  assert.ok(lines.some((l) => l.startsWith('OK Co,ok@x.com,https://x/ok,0909,sent,')));
  // comma + embedded quotes must be quoted/escaped
  assert.ok(csv.includes('"Comma, Inc"'));
  assert.ok(csv.includes('"said ""no"""'));
  cleanup();
});

test('report() neutralizes formula injection (= + - @) in a seller name', () => {
  cleanup();
  const s = createCampaignStore(ID);
  s.markSent('evil@x.com', {
    seller_name: '=HYPERLINK("http://evil","x")',
    shop_url: 'https://x/e',
    phone: '+84123', // leading + must also be defused
    attempts: 1,
  });
  const csv = readFileSync(s.report(), 'utf8');
  // Excel would evaluate a cell starting with =/+/-/@; the leading ' defuses it.
  // The field still gets RFC-4180 quoting (it has a comma), with the ' inside.
  assert.ok(csv.includes(`"'=HYPERLINK`), 'formula name is prefixed with a quote');
  assert.ok(csv.includes(`'+84123`), 'leading + is prefixed with a quote');
  // A benign name is untouched (no spurious quote prefix).
  assert.ok(!csv.includes(`'evil@x.com`), 'plain values are not prefixed');
  cleanup();
});
