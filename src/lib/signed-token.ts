// Generic signed token: round-trips an arbitrary string value through a
// tamper-proof, URL-safe token. Domain-free on purpose — it signs sellers today,
// and stays reusable for any future entity (products, campaigns, …).
//
//   token = base64url(value) "." base64url( HMAC-SHA256(secret, base64url(value))[:16] )
//
// • signToken(value, secret) — embeds the value and signs it.
// • readToken(token, secret) — returns the value only if the signature verifies,
//   else null (forged, edited, or signed with a different secret).
//
// Deterministic (same value+secret → same token) and stateless: no DB, no cookie.
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

export function signToken(value: string, secret: string): string {
  const payload = Buffer.from(String(value), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

// Returns the original value only when the signature verifies (constant-time),
// else null.
export function readToken(token: string, secret: string): string | null {
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
