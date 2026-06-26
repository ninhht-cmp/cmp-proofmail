import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signShopToken, readShopToken } from '../dist/lib/shop-token.js';
import { shopUrlFor, shopIdFromUrl } from '../dist/core/render/shop-url.js';

const SECRET = 'test-secret-key';
const SHOP = 'zhicheng-construction-machinery-co-limited-7SriYk47cCnNayhx37CTzb';
const URL_REAL = `https://comacpro.net/seller/${SHOP}/products`;

test('signShopToken is deterministic — one shop yields one token (many recipients, one shop)', () => {
  assert.equal(signShopToken(SHOP, SECRET), signShopToken(SHOP, SECRET));
});

test('readShopToken resolves the original shop_id from a valid token', () => {
  assert.equal(readShopToken(signShopToken(SHOP, SECRET), SECRET), SHOP);
});

test('readShopToken rejects a bad signature / tampered payload / wrong secret', () => {
  const tok = signShopToken(SHOP, SECRET);
  const [payload] = tok.split('.');
  assert.equal(readShopToken(`${payload}.AAAAAAAAAAAAAAAAAAAAAA`, SECRET), null);
  assert.equal(readShopToken(tok, 'other-secret'), null);
  assert.equal(readShopToken('garbage', SECRET), null);
  assert.equal(readShopToken(tok, ''), null);
});

test('shopIdFromUrl extracts the segment after /seller/, ignoring /products', () => {
  assert.equal(shopIdFromUrl(URL_REAL), SHOP);
  assert.equal(shopIdFromUrl(`https://comacpro.net/seller/${SHOP}`), SHOP);
  assert.equal(shopIdFromUrl('https://comacpro.net/about'), null);
  assert.equal(shopIdFromUrl('not a url'), null);
});

test('shopUrlFor returns the link unchanged when no secret is set (feature off)', () => {
  assert.equal(shopUrlFor({ shop_url: URL_REAL }, { tokenSecret: '' }), URL_REAL);
});

test('shopUrlFor appends a token that readShopToken resolves to the right shop', () => {
  const out = shopUrlFor({ shop_url: URL_REAL }, { tokenSecret: SECRET, tokenParam: 'ref' });
  const tok = new URL(out).searchParams.get('ref');
  assert.ok(tok, 'expected a ref param');
  assert.equal(readShopToken(tok, SECRET), SHOP);
});

test('shopUrlFor yields the same token across recipients of the same shop', () => {
  const a = new URL(shopUrlFor({ shop_url: URL_REAL }, { tokenSecret: SECRET })).searchParams.get(
    'ref',
  );
  const b = new URL(shopUrlFor({ shop_url: URL_REAL }, { tokenSecret: SECRET })).searchParams.get(
    'ref',
  );
  assert.equal(a, b);
});

test('shopUrlFor preserves an existing query string instead of clobbering it', () => {
  const url = new URL(
    shopUrlFor({ shop_url: `${URL_REAL}?utm=fb` }, { tokenSecret: SECRET, tokenParam: 'ref' }),
  );
  assert.equal(url.searchParams.get('utm'), 'fb');
  assert.ok(url.searchParams.get('ref'));
});

test('shopUrlFor ships a clean link when the URL carries no shop id (no junk token)', () => {
  const clean = 'https://comacpro.net/about';
  assert.equal(shopUrlFor({ shop_url: clean }, { tokenSecret: SECRET }), clean);
});

test('shopUrlFor honours a custom path marker', () => {
  const u = 'https://x.test/store/abc123/items';
  const out = shopUrlFor({ shop_url: u }, { tokenSecret: SECRET, idPathMarker: 'store' });
  assert.equal(readShopToken(new URL(out).searchParams.get('ref'), SECRET), 'abc123');
});
