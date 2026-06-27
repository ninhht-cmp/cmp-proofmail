// Builds the CTA href that goes INTO the email: the seller's shop_url plus two
// independent markers:
//   • a UTM tag (utm_source=email, utm_campaign=<design>-<send-month>, utm_content=explore_store)
//     — lets the marketplace tell an email click from an organic visit, and which CTA and
//     wave it was. Applied whenever a campaign is passed (every real send does).
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

// utm_content pins WHICH CTA was clicked — intrinsic like utm_source (every mail here is
// the "Explore your store" button). It's the precise signal the FE keys on, and separates
// this CTA from the marketplace's own mail (unsubscribe/notification also use utm_source=email).
const UTM_CONTENT = 'explore_store';

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

// The utm_campaign VALUE on the CTA link: design + send-month, e.g. "followup-2026-06".
// Distinct from the local store id (campaignIdFor), which must stay date-free or a resume
// would re-send everyone. Month granularity = per-wave attribution that survives a
// same-month resume; the design prefix rolls a design's waves back up (campaign LIKE
// 'followup-%'). Local time = the operator's calendar month.
export function utmCampaignFor(template: string, date: Date): string {
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${template}-${month}`;
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
    url.searchParams.set('utm_content', UTM_CONTENT);
  }
  // Signed identity token — only when a secret is set AND the URL names a seller
  // (else there is nothing meaningful to sign).
  if (tokenSecret) {
    const sellerSlug = sellerSlugFromPath(url.pathname, pathSegment);
    if (sellerSlug) url.searchParams.set(tokenParam, signToken(sellerSlug, tokenSecret));
  }
  return url.toString();
}
