// Isolates the CMP backend (api.dev.cmpup.com) for the image-enrich tool:
// signin → Bearer token (auto-refresh), request a presigned S3 URL, then PUT the
// image bytes straight to S3. Nothing else in the codebase talks to this API, so
// every endpoint/shape detail and the auth lifecycle live HERE — the core only
// sees uploadImage(buffer, {key, contentType}).
import { errMsg, sleep } from '../lib/util.js';
import type { ApiConfig } from '../core/types.js';

const AUTH = '/v1/auth';
const PRESIGN = '/v1/files/create-presigned-url';
const REFRESH_SKEW_MS = 60_000; // refresh this long BEFORE expiry, not after a 401
// Backoff for transient failures (rate-limit / gateway / network). One delay per
// retry; length = number of retries after the first try.
const RETRY_DELAYS_MS = [500, 1500, 4000];

// Worth retrying: rate-limit, gateway/unavailable, and "couldn't connect" (status 0).
// A 4xx other than 429 is a real rejection — retrying just wastes time.
function isTransient(status: number): boolean {
  return status === 0 || status === 429 || status === 502 || status === 503 || status === 504;
}

// Retry a transient-failing call with exponential backoff + jitter. A permanent
// error (wrong key, 401, 4xx) throws immediately — only transient ones are retried.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : -1;
      if (i >= RETRY_DELAYS_MS.length || !isTransient(status)) throw err;
      await sleep(RETRY_DELAYS_MS[i] + Math.floor(Math.random() * 250));
    }
  }
}

// Two-digit-padded local date for the key path (BE convention: YYYY-MM-DD).
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// S3 key per BE convention: marketings/{email-template}/{YYYY-MM-DD}/{file}.
// We send this key; the BE may PREFIX it (e.g. userId on the external scope) and
// returns the REAL key in the response — so the public URL is built from THAT,
// never from this input (see composePublicUrl). slug must already be unique.
export function buildImageKey(opts: { template: string; slug: string; date?: Date }): string {
  const safe = (s: string) =>
    String(s)
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'x';
  return `marketings/${safe(opts.template)}/${ymd(opts.date ?? new Date())}/${safe(opts.slug)}.jpg`;
}

// Public link = originEndpoint + the BE-returned key. The exact join is the one
// thing still to confirm with BE (CDN host? path encoding?); keeping it in a
// single function makes that a one-line change. We percent-encode each path
// segment (slugs are already URL-safe, so this is a no-op for them) but preserve
// the '/' separators and the bucket origin.
export function composePublicUrl(originEndpoint: string, key: string): string {
  const base = String(originEndpoint).replace(/\/+$/, '');
  const path = String(key).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  return `${base}/${path}`;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

interface PresignData {
  key: string; // the key the BE actually uses (may be prefixed)
  preSignedUrl: string; // short-lived URL to PUT the bytes to
  originEndpoint: string; // bucket origin to build the public link from
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface CmpApi {
  /** Sign in once up front so a wrong password / unreachable server fails fast,
   * BEFORE the slow capture step — and primes the token for the upload calls. */
  verifyAuth(): Promise<void>;
  /** Upload one image; returns its public URL (and the real S3 key). */
  uploadImage(
    buffer: Buffer,
    opts: { key: string; contentType: string },
  ): Promise<{ url: string; key: string }>;
}

export function createCmpApi(cfg: ApiConfig): CmpApi {
  let token: TokenPair | null = null;

  // Read the { data } envelope, surfacing a clean message + HTTP status. A failed
  // signin/presign should say WHY (wrong creds vs server down) without leaking the body.
  async function call<T>(
    method: 'POST' | 'PUT',
    path: string,
    body: unknown,
    bearer?: string,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(cfg.baseUrl + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ApiError(`không kết nối được tới máy chủ: ${errMsg(err)}`, 0);
    }
    const text = await res.text();
    if (!res.ok) {
      throw new ApiError(
        `máy chủ trả lỗi HTTP ${res.status} ${shortBody(text)}`.trim(),
        res.status,
      );
    }
    try {
      return (JSON.parse(text)?.data ?? {}) as T;
    } catch {
      throw new ApiError('máy chủ trả về dữ liệu không hợp lệ', res.status);
    }
  }

  function store(data: { accessToken: string; refreshToken?: string; expiresIn?: number }): void {
    token = {
      accessToken: data.accessToken,
      // refreshToken is optional in the signin response — keep the previous one if absent.
      refreshToken: data.refreshToken || token?.refreshToken || '',
      expiresAt: Date.now() + Math.max(0, Number(data.expiresIn) || 0) * 1000,
    };
  }

  async function signin(): Promise<void> {
    const data = await call<{ accessToken: string; refreshToken?: string; expiresIn?: number }>(
      'POST',
      `${AUTH}/${cfg.scope}/signin`,
      { email: cfg.email, password: cfg.password },
    );
    if (!data.accessToken) throw new ApiError('đăng nhập không trả về accessToken', 0);
    store(data);
  }

  // Prefer refresh (cheap); fall back to a full signin if there's no refresh token
  // or it's rejected — so a long run never dies on an expired token mid-file.
  async function refresh(): Promise<void> {
    if (!token?.refreshToken) return signin();
    try {
      const data = await call<{ accessToken: string; refreshToken?: string; expiresIn?: number }>(
        'POST',
        `${AUTH}/${cfg.scope}/refresh`,
        { refreshToken: token.refreshToken },
      );
      store(data);
    } catch {
      await signin();
    }
  }

  async function bearer(): Promise<string> {
    if (!token) await signin();
    else if (Date.now() > token.expiresAt - REFRESH_SKEW_MS) await refresh();
    return token!.accessToken;
  }

  async function presign(key: string, contentType: string): Promise<PresignData> {
    const attempt = async () =>
      call<PresignData>('PUT', PRESIGN, { key, contentType }, await bearer());
    try {
      return await withRetry(attempt);
    } catch (err) {
      // Clock skew / revoked token → one forced re-signin and retry before giving up.
      if (err instanceof ApiError && err.status === 401) {
        await signin();
        return withRetry(attempt);
      }
      throw err;
    }
  }

  return {
    async verifyAuth() {
      await signin();
    },
    async uploadImage(buffer, { key, contentType }) {
      const { preSignedUrl, key: realKey, originEndpoint } = await presign(key, contentType);
      // Step 2: straight to S3. The presigned URL is self-authorizing — NO Bearer here.
      // Retry transient S3 failures (throttling/gateway); a presigned URL is valid for
      // minutes, so a few backoff retries comfortably fit.
      await withRetry(async () => {
        let put: Response;
        try {
          put = await fetch(preSignedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            // Cast at the edge: the DOM BodyInit (generic Uint8Array<ArrayBufferLike>)
            // doesn't line up with Node's Buffer typing, but undici accepts the bytes.
            body: buffer as unknown as BodyInit,
          });
        } catch (err) {
          throw new ApiError(`tải ảnh lên S3 lỗi: ${errMsg(err)}`, 0);
        }
        if (!put.ok) throw new ApiError(`tải ảnh lên S3 thất bại (HTTP ${put.status})`, put.status);
      });
      return { key: realKey, url: composePublicUrl(originEndpoint, realKey) };
    },
  };
}

// Trim an error body to one short line so messages stay readable in the CLI.
function shortBody(text: string): string {
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s ? `– ${s.slice(0, 140)}` : '';
}
