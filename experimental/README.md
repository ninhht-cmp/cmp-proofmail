# experimental/ — Tier B (ESP delivery events)

> **Status: not part of the live CLI flow.** The code here works and has tests, but
> the current Gmail-SMTP send flow never calls it. It's split out so the core (`src/`)
> holds only what actually runs every day — less surface to read, maintain, and secure.

## What's here

| File | Role |
|---|---|
| `delivery-events.js` | Normalizes ESP bounce/complaint payloads (SES, SendGrid) into one shape; pushes hard bounces/complaints onto the suppression list. |
| `ingest-events.js`   | Loads ESP events from a JSON file (batch/feedback import). |
| `webhook-server.js`  | HTTP receiver for realtime ESP events — **STARTER only**, does not yet verify provider signatures. |

## When to use it

Only when moving from Gmail-SMTP to a **dedicated sending service** (Amazon SES /
SendGrid) — see the deliverability notes in `README.md` and `BUSINESS-REQUIREMENT.md`.
At that point this tier enables automation: the ESP reports a dead address → the tool
stops mailing it.

The **suppression list** itself (never re-mail a rejected address) already runs in the
core: `src/core/mailer/campaign-sender.js` adds permanently-rejected (5xx) addresses on
its own. Tier B here only adds an *asynchronous* event source from the ESP.

## Running

```bash
npm run test:experimental                                   # test this tier in isolation

node experimental/ingest-events.js --file=events.json --provider=ses
WEBHOOK_PROVIDER=sendgrid WEBHOOK_SECRET=... node experimental/webhook-server.js
```

Webhook config (only when running `webhook-server.js`):

```
WEBHOOK_PORT=8080
WEBHOOK_PROVIDER=normalized   # ses | sendgrid | normalized
WEBHOOK_SECRET=               # set → callers must send "Authorization: Bearer <secret>"
```

> Before exposing the webhook to the internet: verify provider signatures (SNS /
> SendGrid signed webhooks), handle SNS SubscriptionConfirmation, put it behind HTTPS.
