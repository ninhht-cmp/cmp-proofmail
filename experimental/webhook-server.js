#!/usr/bin/env node
// Minimal ESP webhook receiver (Tier B) — a STARTER. POSTed events become
// suppression-list updates via the same applyDeliveryEvents core the importer uses.
// Env: WEBHOOK_PORT (8080), WEBHOOK_PROVIDER (ses|sendgrid|normalized),
//      WEBHOOK_SECRET (if set → require Authorization: Bearer <secret>).
//
// Before exposing publicly: verify the provider signature (SNS / SendGrid signed
// webhook), handle SNS SubscriptionConfirmation, and front it with HTTPS. In V2
// this is a normal authenticated API route reusing the same core.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createSuppressionStore } from '../dist/adapters/storage.js';
import { applyDeliveryEvents, normalizeEvents } from './delivery-events.js';

const PORT = Number(process.env.WEBHOOK_PORT || 8080);
const PROVIDER = process.env.WEBHOOK_PROVIDER || 'normalized';
const SECRET = process.env.WEBHOOK_SECRET || '';

const suppression = createSuppressionStore();

// Constant-time bearer check so a timing side-channel can't leak the secret.
function authorized(header) {
  if (!SECRET) return true;
  const expected = Buffer.from(`Bearer ${SECRET}`);
  const got = Buffer.from(String(header || ''));
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 5_000_000) reject(new Error('payload too large')); // 5MB guard
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const json = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'GET') return json(200, { ok: true, provider: PROVIDER });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  if (!authorized(req.headers.authorization)) {
    return json(401, { error: 'unauthorized' });
  }

  try {
    const body = await readBody(req);
    const events = normalizeEvents(PROVIDER, JSON.parse(body || 'null'));
    const summary = applyDeliveryEvents(events, { suppression });
    console.log(
      `[webhook] ${events.length} events → suppressed ${summary.suppressed} (total ${suppression.loadSet().size})`,
    );
    json(200, { received: events.length, summary });
  } catch (e) {
    json(400, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(
    `Webhook receiver lắng nghe http://localhost:${PORT} (provider: ${PROVIDER}${SECRET ? ', secret bật' : ''}).`,
  );
});
