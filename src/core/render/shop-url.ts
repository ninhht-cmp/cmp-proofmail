// Builds the CTA href that goes INTO the email: the seller's shop_url with a
// signed seller-identity token appended, so a click is attributed to the seller
// who owns the link — never to whichever account the visitor happens to be in.
//
// Scope is the CTA link ONLY. seller.shop_url doubles as the Playwright capture
// target (src/core/capture/shop-capturer.ts); that path must keep using the RAW
// url so the screenshot hits a clean storefront and we don't record a phantom
// click while capturing.
//
// The feature is opt-in: with no secret configured — or a shop_url we can't parse
// or identify — the link ships untouched, identical to the pre-token behaviour.
// Pure: the secret arrives by argument, never from env.
import { signToken } from '../../lib/signed-token.js';
import type { Seller } from '../types.js';

// The marketplace routes a storefront as /seller/<sellerSlug>/... — this is the
// path segment that precedes the slug. A constant, not config: it's a fixed
// property of the marketplace's URL scheme, not an operator knob. The functions
// take it as an argument purely so tests can exercise other shapes.
const SELLER_PATH_SEGMENT = 'seller';

// The marketplace keys a seller by the path segment that FOLLOWS `marker`:
//   https://comacpro.net/seller/<sellerSlug>/products  ->  <sellerSlug>
// Operating on an already-parsed pathname keeps URL parsing in one place.
function sellerSlugFromPath(pathname: string, marker: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const i = segments.indexOf(marker);
  return i >= 0 && segments[i + 1] ? decodeURIComponent(segments[i + 1]) : null;
}

// Standalone resolver (used by callers/tests that hold a URL string, not a Seller).
export function sellerSlugFromUrl(shopUrl: string, marker = SELLER_PATH_SEGMENT): string | null {
  try {
    return sellerSlugFromPath(new URL(shopUrl).pathname, marker);
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
    pathSegment = SELLER_PATH_SEGMENT,
  }: { tokenSecret?: string; tokenParam?: string; pathSegment?: string } = {},
): string {
  if (!tokenSecret) return seller.shop_url;
  // Parse once: reused for both the slug lookup and the query-param write.
  let url: URL;
  try {
    url = new URL(seller.shop_url);
  } catch {
    return seller.shop_url;
  }
  const sellerSlug = sellerSlugFromPath(url.pathname, pathSegment);
  // No identifiable seller → ship a clean link rather than a token that resolves
  // to nothing on the receiving end.
  if (!sellerSlug) return seller.shop_url;
  // searchParams.set preserves any existing query string instead of clobbering it.
  url.searchParams.set(tokenParam, signToken(sellerSlug, tokenSecret));
  return url.toString();
}
