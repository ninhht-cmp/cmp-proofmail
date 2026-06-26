// Self-identifying, signed identity token for a shop.
//
//   token = base64url(shopId) "." base64url( HMAC-SHA256(secret, base64url(shopId))[:16] )
//
// Two halves: the SHOP ID (so the receiver can resolve WHICH shop straight from
// the token — no DB lookup, no cookie) and a SIGNATURE (so a forged/edited token
// is rejected). This is what lets attribution follow the clicked link, not the
// logged-in account: the link for shop B always carries B's signed id.
//
// • signShopToken — used by the send pipeline when building the CTA link.
// • readShopToken — used by the receiver (admin/FE): returns the shopId, or null
//   if the token was tampered with or signed by a different secret.
//
// Pure util — no domain types, no env; the secret is passed in.
import { createHmac, timingSafeEqual } from 'node:crypto';

// 16 bytes (128-bit) signature: unforgeable, short enough for a URL.
const SIG_BYTES = 16;

// Sign the already-base64url payload string (delimiter-safe: base64url has no '.').
function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(payloadB64)
    .digest()
    .subarray(0, SIG_BYTES)
    .toString('base64url');
}

export function signShopToken(shopId: string, secret: string): string {
  const payload = Buffer.from(String(shopId), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

// Returns the shopId only when the signature verifies (constant-time), else null.
export function readShopToken(token: string, secret: string): string | null {
  if (!secret || !token) return null;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    return Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}
