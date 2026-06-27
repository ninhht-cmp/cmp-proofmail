// Builds the CTA href that goes INTO the email: the seller's shop_url plus two
// independent markers:
//   • a UTM tag (utm_source=email + utm_campaign=<mail template>) — the provenance
//     marker that lets the marketplace tell an email click from an organic visit.
//     Applied whenever a campaign is passed (every real send does).
//   • a signed seller-identity token — so a click attributes to the seller who owns
//     the link, not the logged-in account. Only when a secret is configured.
//
// Scope is the CTA link ONLY. seller.shop_url doubles as the Playwright capture
// target (src/core/capture/shop-capturer.ts); that path must keep using the RAW
// url so the screenshot hits a clean storefront and we don't record a phantom
// click while capturing. With neither marker (and an unparseable URL) the link
// ships untouched. Pure: everything arrives by argument, never env.
import { signToken } from '../../lib/signed-token.js';
import type { Seller } from '../types.js';

// utm_source is intrinsic — this tool only ever sends email, so it's a constant,
// not config (no value to tune). utm_campaign varies (the mail template).
const UTM_SOURCE = 'email';

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
  // mean "every marker off" rather than throw.
  {
    tokenSecret = '',
    tokenParam = 'ref',
    pathSegment = SELLER_PATH_SEGMENT,
    utmCampaign = '',
  }: {
    tokenSecret?: string;
    tokenParam?: string;
    pathSegment?: string;
    utmCampaign?: string;
  } = {},
): string {
  // Nothing to append → return the link untouched (also the unparseable-URL escape).
  if (!tokenSecret && !utmCampaign) return seller.shop_url;
  let url: URL;
  try {
    url = new URL(seller.shop_url);
  } catch {
    return seller.shop_url;
  }
  // UTM provenance marker — independent of the token. searchParams.set preserves any
  // existing query string instead of clobbering it.
  if (utmCampaign) {
    url.searchParams.set('utm_source', UTM_SOURCE);
    url.searchParams.set('utm_campaign', utmCampaign);
  }
  // Signed identity token — only when a secret is set AND the URL names a seller
  // (else there is nothing meaningful to sign).
  if (tokenSecret) {
    const sellerSlug = sellerSlugFromPath(url.pathname, pathSegment);
    if (sellerSlug) url.searchParams.set(tokenParam, signToken(sellerSlug, tokenSecret));
  }
  return url.toString();
}
