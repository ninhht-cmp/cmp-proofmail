import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signToken, readToken } from '../dist/lib/signed-token.js';
import { shopUrlFor, sellerSlugFromUrl, utmCampaignFor } from '../dist/core/render/shop-url.js';

const SECRET = 'test-secret-key';
const SLUG = 'zhicheng-construction-machinery-co-limited-7SriYk47cCnNayhx37CTzb';
const URL_REAL = `https://comacpro.net/seller/${SLUG}/products`;

test('signToken is deterministic — same value+secret yields the same token', () => {
  assert.equal(signToken(SLUG, SECRET), signToken(SLUG, SECRET));
});

test('readToken round-trips the original value from a valid token', () => {
  assert.equal(readToken(signToken(SLUG, SECRET), SECRET), SLUG);
});

test('readToken rejects a bad signature / tampered payload / wrong secret', () => {
  const tok = signToken(SLUG, SECRET);
  const [payload] = tok.split('.');
  assert.equal(readToken(`${payload}.AAAAAAAAAAAAAAAAAAAAAA`, SECRET), null);
  assert.equal(readToken(tok, 'other-secret'), null);
  assert.equal(readToken('garbage', SECRET), null);
  assert.equal(readToken(tok, ''), null);
});

test('sellerSlugFromUrl extracts the segment after /seller/, ignoring /products', () => {
  assert.equal(sellerSlugFromUrl(URL_REAL), SLUG);
  assert.equal(sellerSlugFromUrl(`https://comacpro.net/seller/${SLUG}`), SLUG);
  assert.equal(sellerSlugFromUrl('https://comacpro.net/about'), null);
  assert.equal(sellerSlugFromUrl('not a url'), null);
});

test('shopUrlFor returns the link unchanged when no secret is set (feature off)', () => {
  assert.equal(shopUrlFor({ shop_url: URL_REAL }, { tokenSecret: '' }), URL_REAL);
});

test('shopUrlFor appends a token that readToken resolves to the right seller slug', () => {
  const out = shopUrlFor({ shop_url: URL_REAL }, { tokenSecret: SECRET, tokenParam: 'ref' });
  const tok = new URL(out).searchParams.get('ref');
  assert.ok(tok, 'expected a ref param');
  assert.equal(readToken(tok, SECRET), SLUG);
});

test('shopUrlFor yields the same token across recipients of the same seller', () => {
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

test('shopUrlFor ships a clean link when the URL carries no seller slug (no junk token)', () => {
  const clean = 'https://comacpro.net/about';
  assert.equal(shopUrlFor({ shop_url: clean }, { tokenSecret: SECRET }), clean);
});

test('shopUrlFor honours a custom path segment', () => {
  const u = 'https://x.test/store/abc123/items';
  const out = shopUrlFor({ shop_url: u }, { tokenSecret: SECRET, pathSegment: 'store' });
  assert.equal(readToken(new URL(out).searchParams.get('ref'), SECRET), 'abc123');
});

// ── UTM marker (interim tracking; utm_source/utm_content fixed, utm_campaign per template, gated on a campaign) ──

test('shopUrlFor adds utm_source=email + utm_campaign + utm_content when a campaign is passed (no token)', () => {
  const url = new URL(shopUrlFor({ shop_url: URL_REAL }, { utmCampaign: 'touch' }));
  assert.equal(url.searchParams.get('utm_source'), 'email');
  assert.equal(url.searchParams.get('utm_campaign'), 'touch');
  assert.equal(url.searchParams.get('utm_content'), 'explore_store'); // CTA marker the FE keys on
  assert.equal(url.searchParams.get('ref'), null); // token off → no ref
});

test('shopUrlFor: utm_campaign reflects the mail template per design', () => {
  const followup = new URL(shopUrlFor({ shop_url: URL_REAL }, { utmCampaign: 'followup' }));
  assert.equal(followup.searchParams.get('utm_campaign'), 'followup');
});

test('shopUrlFor: utm_content is the fixed explore_store CTA marker regardless of template', () => {
  for (const c of ['touch', 'followup']) {
    const url = new URL(shopUrlFor({ shop_url: URL_REAL }, { utmCampaign: c }));
    assert.equal(url.searchParams.get('utm_content'), 'explore_store');
  }
});

test('utmCampaignFor composes <design>-<YYYY-MM> from the send month (zero-padded, local)', () => {
  assert.equal(utmCampaignFor('followup', new Date(2026, 5, 1)), 'followup-2026-06'); // month index 5 = June
  assert.equal(utmCampaignFor('touch', new Date(2026, 0, 31)), 'touch-2026-01');
  assert.equal(utmCampaignFor('touch', new Date(2026, 11, 9)), 'touch-2026-12');
});

test('shopUrlFor stamps the composed per-wave campaign as utm_campaign', () => {
  const campaign = utmCampaignFor('followup', new Date(2026, 5, 15)); // followup-2026-06
  const url = new URL(shopUrlFor({ shop_url: URL_REAL }, { utmCampaign: campaign }));
  assert.equal(url.searchParams.get('utm_campaign'), 'followup-2026-06');
  assert.equal(url.searchParams.get('utm_content'), 'explore_store');
});

test('shopUrlFor: no campaign and no secret → link unchanged', () => {
  assert.equal(shopUrlFor({ shop_url: URL_REAL }, {}), URL_REAL);
  assert.equal(shopUrlFor({ shop_url: URL_REAL }, { utmCampaign: '' }), URL_REAL);
});

test('shopUrlFor: UTM and token coexist (both markers present)', () => {
  const url = new URL(
    shopUrlFor({ shop_url: URL_REAL }, { tokenSecret: SECRET, utmCampaign: 'touch' }),
  );
  assert.equal(url.searchParams.get('utm_source'), 'email');
  assert.equal(url.searchParams.get('utm_campaign'), 'touch');
  assert.equal(readToken(url.searchParams.get('ref'), SECRET), SLUG);
});

test('shopUrlFor: UTM applies even when the URL names no seller (UTM is slug-independent)', () => {
  const url = new URL(
    shopUrlFor({ shop_url: 'https://comacpro.net/about' }, { utmCampaign: 'touch' }),
  );
  assert.equal(url.searchParams.get('utm_source'), 'email');
});

test('shopUrlFor: UTM preserves an existing query string', () => {
  const url = new URL(shopUrlFor({ shop_url: `${URL_REAL}?a=1` }, { utmCampaign: 'touch' }));
  assert.equal(url.searchParams.get('a'), '1');
  assert.equal(url.searchParams.get('utm_source'), 'email');
});
