import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSellers, normalizeKey } from '../dist/core/sellers/seller-validator.js';

const row = (over = {}) => ({
  seller_name: 'Acme',
  email: 'a@acme.example',
  shop_url: 'https://example.com/a',
  ...over,
});

test('normalizeKey tolerates casing / spaces / dashes', () => {
  assert.equal(normalizeKey('Shop URL'), 'shop_url');
  assert.equal(normalizeKey('  Seller-Name '), 'seller_name');
});

test('keeps a valid row and lowercases email + builds slug', () => {
  const { valid, skipped } = validateSellers([row({ email: 'A@Acme.Example' })]);
  assert.equal(skipped.length, 0);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].email, 'a@acme.example');
  assert.equal(valid[0].slug, 'a_acme_example');
});

test('disambiguates slugs that would collide, keeps the bare slug otherwise', () => {
  // a.b@ and a_b@ both naively collapse to 'a_b_x_io' → same screenshot file.
  // They must end up with DISTINCT slugs so neither gets the other's proof.
  const { valid } = validateSellers([row({ email: 'a.b@x.io' }), row({ email: 'a_b@x.io' })]);
  assert.equal(valid.length, 2);
  assert.notEqual(valid[0].slug, valid[1].slug, 'colliding emails get distinct slugs');
  assert.ok(valid[0].slug.startsWith('a_b_x_io_'), 'disambiguated from the base slug');
  // A non-colliding email keeps the simple, cache-stable slug (no suffix).
  assert.equal(validateSellers([row({ email: 'solo@x.io' })]).valid[0].slug, 'solo_x_io');
});

test('defaults a missing seller_name', () => {
  const { valid } = validateSellers([{ email: 'a@b.co', shop_url: 'https://x.io' }]);
  assert.equal(valid[0].seller_name, '(không tên)');
});

test('missingRequired flags absent required columns, ignores extras', () => {
  assert.deepEqual(
    validateSellers([{ Name: 'A', Email: 'a@b.co', 'Shop URL': 'https://x', Notes: 'x' }])
      .missingRequired,
    [],
  );
  assert.deepEqual(validateSellers([{ Name: 'A', 'Shop URL': 'https://x' }]).missingRequired, [
    'Email',
  ]);
  assert.deepEqual(validateSellers([{ Email: 'a@b.co' }]).missingRequired, ['Name', 'Shop URL']);
  // legacy "seller_name" still satisfies the Name requirement
  assert.deepEqual(
    validateSellers([{ seller_name: 'A', email: 'a@b.co', shop_url: 'https://x' }]).missingRequired,
    [],
  );
});

test('reads optional phone from common header spellings; empty when absent', () => {
  assert.equal(validateSellers([row({ phone: '+84 1' })]).valid[0].phone, '+84 1');
  assert.equal(validateSellers([row({ sdt: '0909' })]).valid[0].phone, '0909');
  assert.equal(validateSellers([row({ 'Số điện thoại': '0123' })]).valid[0].phone, '0123');
  assert.equal(validateSellers([row()]).valid[0].phone, '');
});

test('skips missing email and missing shop_url with a reason', () => {
  const { valid, skipped } = validateSellers([row({ email: '' }), row({ shop_url: '' })]);
  assert.equal(valid.length, 0);
  assert.equal(skipped.length, 2);
  assert.match(skipped[0].reason, /email/);
  assert.match(skipped[1].reason, /shop_url/);
});

test('skips an invalid email', () => {
  const { skipped } = validateSellers([row({ email: 'not-an-email' })]);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /không hợp lệ/);
});

test('skips a shop_url without http(s) scheme', () => {
  const { valid, skipped } = validateSellers([row({ shop_url: 'example.com/a' })]);
  assert.equal(valid.length, 0);
  assert.match(skipped[0].reason, /http/);
});

test('drops duplicate emails, keeping the first', () => {
  const { valid, duplicates } = validateSellers([
    row({ email: 'dup@x.io', seller_name: 'First' }),
    row({ email: 'DUP@x.io', seller_name: 'Second' }),
  ]);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].seller_name, 'First');
  assert.equal(duplicates.length, 1);
});

test('reports spreadsheet line numbers (header = line 1)', () => {
  const { skipped } = validateSellers([row(), row({ email: '' })]);
  assert.equal(skipped[0].line, 3); // 2nd data row → spreadsheet line 3
});
