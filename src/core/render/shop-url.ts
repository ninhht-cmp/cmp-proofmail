// Builds the CTA href that goes INTO the email: the seller's shop_url with a
// signed shop-identity token appended, so a click is attributed to the shop that
// owns the link — never to whichever account the visitor happens to be logged in.
//
// Scope is the CTA link ONLY. seller.shop_url doubles as the Playwright capture
// target (src/core/capture/store-capturer.ts); that path must keep using the RAW
// url so the screenshot hits a clean storefront and we don't record a phantom
// click while capturing.
//
// The feature is opt-in: with no secret configured — or a shop_url we can't parse
// or identify — the link ships untouched, identical to the pre-token behaviour.
// Pure: the secret arrives by argument, never from env.
import { signShopToken } from '../../lib/shop-token.js';
import type { Seller } from '../types.js';

// comacpro.net routes a storefront as /seller/<shopId>/... — this is the segment
// that precedes the shop id. A constant, not config: it's a fixed property of the
// marketplace's URL scheme, not an operator knob. The functions take it as an
// argument purely so tests can exercise other shapes.
const SHOP_ID_MARKER = 'seller';

// The marketplace keys a shop by the path segment that FOLLOWS `marker`:
//   https://comacpro.net/seller/<shopId>/products  ->  <shopId>
// Operating on an already-parsed pathname keeps URL parsing in one place.
function shopIdFromPath(pathname: string, marker: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const i = segments.indexOf(marker);
  return i >= 0 && segments[i + 1] ? decodeURIComponent(segments[i + 1]) : null;
}

// Standalone resolver (used by callers/tests that hold a URL string, not a Seller).
export function shopIdFromUrl(shopUrl: string, marker = SHOP_ID_MARKER): string | null {
  try {
    return shopIdFromPath(new URL(shopUrl).pathname, marker);
  } catch {
    return null;
  }
}

export function shopUrlFor(
  seller: Pick<Seller, 'shop_url'>,
  // Defaults make a partial config (a V2 caller or test that omits `tracking`)
  // mean "feature off" rather than throw.
  {
    tokenSecret = '',
    tokenParam = 'ref',
    idPathMarker = SHOP_ID_MARKER,
  }: { tokenSecret?: string; tokenParam?: string; idPathMarker?: string } = {},
): string {
  if (!tokenSecret) return seller.shop_url;
  // Parse once: reused for both the shop-id lookup and the query-param write.
  let url: URL;
  try {
    url = new URL(seller.shop_url);
  } catch {
    return seller.shop_url;
  }
  const shopId = shopIdFromPath(url.pathname, idPathMarker);
  // No identifiable shop → ship a clean link rather than a token that resolves to
  // nothing on the receiving end.
  if (!shopId) return seller.shop_url;
  // searchParams.set preserves any existing query string instead of clobbering it.
  url.searchParams.set(tokenParam, signShopToken(shopId, tokenSecret));
  return url.toString();
}
