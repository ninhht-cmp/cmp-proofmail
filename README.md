# Proofmail

> Personalized storefront-proof emails for sellers.

Proofmail screenshots each seller's storefront, drops it into a design template, and
sends a personalized email. One template produces both the **HTML email** (with a
clickable CTA) **and** its **plain-text** counterpart from a single source, so the two
never drift. The storefront image is **inlined** in the email (not a separate attachment).

- **Two send modes** — interactive per-seller (default) or bulk (`--auto`).
- **Resumable** — a crash mid-run never re-sends; already-sent sellers are skipped.
- **Cross-platform** — pure-JS, one zip runs on Windows, macOS, and Linux.

---

## Quick start

### For operators (sales team)

1. Install **Node.js LTS**: <https://nodejs.org>.
2. Copy `.env.example` to `.env` and fill in your sending email + password.
   Step-by-step: [`HUONG-DAN-CAU-HINH-ENV.md`](HUONG-DAN-CAU-HINH-ENV.md).
3. Drop your list (`.csv`/`.xlsx`) into **`data/`** (see `data/sample-sellers.csv` for columns).
4. Double-click **`start.bat`** (Windows) or **`start.sh`** (macOS/Linux) and follow the prompts.

> The tool always sends one preview mail to you first and asks for confirmation before
> sending for real. Full operator guide: [`HUONG-DAN-NHAN-VIEN.md`](HUONG-DAN-NHAN-VIEN.md).

### For developers

```bash
npm install
npx playwright install chromium
cp .env.example .env          # configure (see HUONG-DAN-CAU-HINH-ENV.md)

npm start                     # build (tsc) → interactive wizard (default)
npm start -- --auto           # bulk send mode
```

---

## Sending modes

| | Interactive (default) | Bulk (`--auto`) |
|---|---|---|
| Best for | small, hand-picked batches | large campaigns (hundreds–thousands) |
| Pace | human-paced (no throttle) | throttled by `MAILS_PER_HOUR`, runs for hours |
| Preview | real email opens in the browser before each send | one test mail to yourself + typed `GUI` to confirm |
| Lock risk | low (spread out) | high past Gmail limits → use an ESP (see [Deliverability](#deliverability--scale)) |
| Switch template mid-run | yes | one template per run |

**Outlook draft mode** (`--draft`, or `MAIL_TRANSPORT=outlook-draft`): does not send over
SMTP. It builds each mail and opens a prefilled **draft in Outlook "Classic"** (Windows)
for you to review and send by hand; "sent" is only recorded after you confirm. Needs only
`MAIL_FROM_EMAIL` (no `SMTP_HOST`/`PASS`). Windows + Outlook Classic only.

### CLI reference

```bash
npm run build                                              # build once (or `npm start -- <flags>`)
node dist/cli/main.js --sheet="<Google Sheets link>"       # read list from a Google Sheet
node dist/cli/main.js --file=data/sellers.xlsx             # interactive send from a file
node dist/cli/main.js --draft --file=data/sellers.xlsx     # fill Outlook drafts, send by hand (Windows)
node dist/cli/main.js --auto --file=data/sellers.csv --yes # bulk send, no prompts (careful!)
npm run screenshot                                         # capture storefronts only
npm run enrich -- --file=data/list.csv --template=followup # screenshot → upload S3 → write link col
```

`--file=` source file · `--sheet=` Google Sheet link · `--auto` bulk · `--draft` Outlook
drafts · `--dry` dry run (with `--auto`) · `--yes` skip confirmation.

### Image-enrich tool (`npm run enrich`)

A standalone command (NOT part of the send flow): a file with a URL column →
screenshot each site → upload to S3 via the CMP API → write the public link into a
**new** `*.enriched.*` file (input untouched). Output format follows the input
(csv→csv, xlsx→xlsx via exceljs; override with `--out=name.csv|.xlsx`). Reuses the
capture/file/CLI machinery; the only new edges are `adapters/cmp-api.ts`
(signin/refresh + presigned-url + S3 PUT) and `core/enrich/image-enricher.ts`.
Operator guide: `HUONG-DAN-ENRICH-ANH.md`.

```bash
npm run enrich            # wizard: pick file, URL column (auto-detected), template
npm run enrich -- --file=data/list.csv --template=followup --url-col=website \
  --image-col=shop_image_url --scope=internal --yes --fresh --out=result.csv
```

Needs `CMP_API_EMAIL` / `CMP_API_PASSWORD` (+ `CMP_API_SCOPE`, `CMP_API_BASE_URL`) in
`.env` — see `HUONG-DAN-CAU-HINH-ENV.md` §8. Signs in once up front (fail-fast), resumes
by URL (re-runs skip rows already uploaded; `--fresh` redoes all). The public URL is built
from the BE-returned `key` + `originEndpoint`, so it's robust to scope-based key prefixing.

---

## Build & TypeScript

Source is **TypeScript** in `src/`; `tsc` compiles to `dist/` (gitignored) and **`node`
runs `dist/`** — no ts-node/tsx, no runtime transpile.

```bash
npm run build         # tsc: typecheck + emit dist/ (incremental → fast after the first run)
npm run typecheck     # tsc --noEmit
npm run format        # Prettier (write); format:check to verify only
npm test              # pretest builds, then runs tests against dist/
```

- **Run = build then node dist.** The launcher (`start.*`) runs `npm run build`
  (incremental, near-instant when sources are unchanged) then `node dist/cli/main.js`. A
  type error is a build failure — the tool reports it instead of running wrong. Types are
  the machine-enforced contract; `src/core/types.ts` is the single source for
  `Seller`/`Config`/`CampaignResult`.
- **Split dev/runtime deps.** The user install runs `npm install --omit=dev`. `typescript`
  is a **dependency** (pure JS, no binary download) so it builds on staff machines; only
  `prettier` is a devDependency. CI gate: **build → format:check → test → test:experimental**.
- **Package manager: npm**, pinned via `packageManager` in `package.json`. One lockfile
  (`package-lock.json`); don't mix pnpm/yarn.

See [`CLAUDE.md`](CLAUDE.md) for the full engineering conventions.

---

## Architecture

**Ports & adapters.** `core/` is the pure business core (no terminal, no global config);
`adapters/` talk to the outside world (SMTP, browser, disk); `cli/` is just one interface
around the core. A future web V2 only adds a `server/` that chains
`core/capture → render → mailer` (already decoupled, config injected) — **without touching
the core**.

```
start.bat / start.sh                ← double-click entry point (runs the pinned release)
update.bat / update.sh              ← update to a new release (runs tests, auto-rollback on failure)
rollback.bat / rollback.sh          ← return to the previous release
clean.bat / clean.sh                ← reclaim disk: delete screenshots + sheet cache (keeps send history & suppression)
suppress.bat / suppress.sh          ← add an email to the do-not-send list (honor an unsubscribe request)
data/                               ← drop seller lists here
templates/touch.hbs                 ← default HTML design (one source for email + image)
templates/touch.txt.hbs             ← plain-text twin (same data, never drifts)
templates/followup.hbs              ← follow-up design (sent after 'touch' to the same seller)
templates/followup.subject.hbs      ← optional per-design subject (absent → MAIL_SUBJECT)
                                      Add a design: drop templates/<name>.hbs (+ .txt.hbs, + .subject.hbs);
                                      pick it in the CLI (or MAIL_TEMPLATE=<name> / --template <name>)
.env                                ← SMTP config (never committed)

scripts/                            ← dev/maintenance commands (NOT part of the wizard)
├── screenshot.js                   ← capture storefronts only (npm run screenshot)
├── clean.js                        ← delete regenerable junk: artifacts + sheet cache (npm run clean)
└── suppress.js                     ← add an email to the do-not-send list (npm run suppress -- <email>)

experimental/                       ← Tier B (ESP bounce/complaint) — NOT in the live flow
├── delivery-events.js              ← normalize ESP events (SES/SendGrid) → suppression
├── ingest-events.js                ← load ESP events from JSON
└── webhook-server.js               ← webhook receiver (starter) — see experimental/README.md

tsconfig.json                       ← tsc config (strict, src/ → dist/, incremental)
src/                                ← TypeScript source (.ts) — edit code here
├── cli/                            ← terminal interface (wraps the core)
│   ├── main.ts                     ← entry: pick source → manual (default) / --auto
│   ├── manual-flow.ts              ← interactive per-seller send (pick → capture → preview → send)
│   ├── manual-draft-flow.ts        ← Outlook draft flow (Windows)
│   ├── capture-step.ts             ← lazy browser session + spinner (shared by both manual flows)
│   ├── seller-picker.ts            ← pick/filter sellers (shared)
│   ├── template-picker.ts          ← pick design + campaignIdFor
│   ├── email-preview.ts            ← render the real email to temp HTML + open browser
│   ├── args.ts                     ← parse flags (--file=, --sheet=, --auto…)
│   ├── enrich-main.ts              ← entry for `npm run enrich`: file → screenshot → S3 → link col
│   └── ui.ts                       ← palette + banner + progress bar (ETA) + result panel
├── core/                           ← pure business core (no terminal, no global config)
│   ├── types.ts                    ← domain TYPE definitions (Seller/Config/CampaignResult…) — single source
│   ├── sellers/
│   │   ├── seller-loader.ts        ← read CSV/XLSX → rows (tolerates blank/duplicate headers)
│   │   └── seller-validator.ts     ← validate, dedupe, generate slug (pure)
│   ├── capture/
│   │   └── shop-capturer.ts        ← screenshot storefronts (Playwright, parallel, cached) + captureBuffer
│   ├── enrich/
│   │   └── image-enricher.ts       ← orchestrate screenshot → upload per URL (resume, per-row errors)
│   ├── render/
│   │   ├── template.ts             ← Handlebars: build HTML + plain-text + subject (compile cache)
│   │   └── shop-url.ts             ← build the CTA shop_url (+ UTM marker / seller identity token)
│   └── mailer/
│       └── campaign-sender.ts      ← send (throttle, retry, checkpoint, anti-spam headers)
├── adapters/                       ← I/O edge (isolates third-party libs)
│   ├── browser.ts                  ← launch Chromium
│   ├── smtp-transport.ts           ← create the nodemailer transport
│   ├── google-sheet.ts             ← read a Google Sheet via CSV export (read-only)
│   ├── cmp-api.ts                  ← CMP backend: signin/refresh (Bearer) + presigned-url + S3 PUT
│   ├── imap-sent.ts                ← save a copy to the "Sent" folder over IMAP (best-effort)
│   ├── outlook-draft.ts (+ .ps1)   ← open a draft in Outlook Classic (Windows; .ps1 is the source asset)
│   └── storage.ts                  ← all paths + file read/write in one place (atomic writes)
├── config/
│   ├── app-config.ts               ← read .env → config object (factory, not a singleton)
│   └── env-check.ts                ← report missing config
└── lib/                            ← pure utilities, no domain (usable from any layer)
    ├── util.ts                     ← sleep(...), errMsg(...)
    ├── patterns.ts                 ← EMAIL_RE (single source for validator + CLI)
    └── signed-token.ts             ← signToken/readToken (HMAC, generic — signs any string)

dist/                               ← build output (tsc) — node runs here; gitignored, don't edit
test/                               ← unit tests (.js, import from dist/) — npm test (builds first)
output/artifacts/                   ← screenshots: shot_*.jpg (safe to delete, regenerated)
output/state/campaign-<id>.json     ← per-campaign send progress (id from source name; V2 → DB)
output/state/suppression.json       ← global do-not-send list (bounce/complaint)
output/reports/report-<id>.csv      ← send report (Name/Email/Shop URL/Status/Created At…)
```

### Highlights

- **Interactive wizard** (Vietnamese) for non-technical staff; **flags** for developers.
- Reads **CSV and Excel (.xlsx)**; matches columns regardless of case/whitespace.
- **Validates on read**: drops rows missing/with bad emails, dedupes, reports why.
- **Real email preview** in the browser (interactive) · **test send** + typed `GUI` (bulk).
- **Throttle** by `MAILS_PER_HOUR` + **retry** on transient errors (bulk).
- **Checkpoint**: re-runs never double-send; safe to interrupt.
- **Progress bar with ETA** + a compact result panel.

---

## Deliverability & scale

- Gmail caps at ~500 mails/day (Workspace ~2000). Exceeding it risks an **account lock**.
- For volume, switch to **Amazon SES** (~$0.1/1000) / SendGrid / Resend — change only the
  four `SMTP_*` lines in `.env`, no code change.
- Configure **SPF + DKIM + DMARC** for the domain to stay out of spam.
- A per-mail `List-Unsubscribe` header is added automatically so recipients opt out
  instead of reporting spam.

---

## Cross-platform packaging

The tool **ships source** (not bundled libs/browser); the launcher installs on the user's
machine. Because every dependency is pure JS, **one zip serves all three OSes** — no
per-platform build.

### Install (one command per OS)

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/ninhht-cmp/cmp-proofmail/main/install.ps1 | iex
```
```bash
# macOS / Linux (Terminal)
curl -fsSL https://raw.githubusercontent.com/ninhht-cmp/cmp-proofmail/main/install.sh | bash
```

The installer `git clone`s the repo to `~/cmp-proofmail` (keeps `.git` for later updates),
creates **Desktop + Start Menu shortcuts** ("Proofmail" → `start.bat`) so staff launch it like
an app, and runs the launcher to install deps + create `.env`. A clone preserves tracked files per
`.gitattributes`, so EOL is always correct (`start.bat`=CRLF, `start.sh`=LF) and `.env`,
`node_modules`, and real seller data (all untracked) never come along. Only requirement on
the user machine: **Git**.

The launcher checks **Node.js ≥ 20**, runs `npm install` + downloads Chromium (falls back
to Edge/Chrome on download failure — same Chromium engine, identical screenshots), and
creates `.env` from the template if missing.

### Per-OS notes

| OS | Gotcha | Fix |
|---|---|---|
| **Windows 10/11** | SmartScreen warns on a downloaded `.bat` | **"More info" → "Run anyway"** (once). Edge is preinstalled, so Chromium download isn't a blocker. |
| **macOS** | Gatekeeper blocks a downloaded `.command` | **Right-click → Open** (first time). Or: `xattr -dr com.apple.quarantine <tool-dir>` |
| **macOS/Linux** | `.sh`/`.command` "permission denied" (rare) | `chmod +x start.sh start.command` |
| **Linux** | No Edge/Chrome + Chromium missing system libs | `npx playwright install --with-deps chromium` (needs sudo), or install Google Chrome |

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Node.js not installed" / "too old" | Missing or Node < 20 | Install **LTS** from nodejs.org; open a **new window** (PATH refresh) |
| Hangs on Chromium download | Proxy/firewall blocks the CDN | Wait — on failure it falls back to Edge/Chrome. Or install Chrome first. |
| "Can't open a browser to capture" | No Chromium **and** no Edge/Chrome | Install Chrome, or `npx playwright install chromium` |
| Banner shows boxes on old cmd | cmd.exe font lacks the glyphs | Cosmetic — use Windows Terminal |
| Login error when sending | Wrong/missing App Password | Gmail/365 need an **App Password**; the tool strips pasted spaces |

---

## Distribution & internal deployment

Internal-use software (see `LICENSE.txt`), deployed in three layers.

### 1 — Access & secret boundary

- The repo is **public** so staff install with one command (no invites/logins to manage).
- **Consequence:** anyone with the URL can read the **source**. Acceptable here — the logic
  isn't a trade secret, and the code is readable on the user's machine regardless of
  packaging.
- What actually needs protecting — **SMTP credentials + the seller list** — is **not** in
  the repo (see layer 2). A public repo doesn't expose them.
- If hiding the source ever becomes a real requirement, move to **V2 (web app)** on your own
  server — not a private repo + zip.

### 2 — Secret protection (already in place)

- `.env` (SMTP password) is **never** committed — `.gitignore` guarantees it, so `git clone`
  never pulls it to a user machine.
- **No hardcoded** passwords. Each person fills their own `.env`.
- Real seller data in `data/` is never packaged (only the sample file is tracked).

### 3 — Distribution & updates (by release tag, with rollback)

The tool **does not auto-`git pull`**. Each machine **pins a release** (`vX.Y.Z` tag) that
passed tests; updating is a deliberate, tested, reversible action — so a bad release never
drags down a working one.

**On a staff machine:**

1. Install **Git** once + run the installer → `git clone` to `~/cmp-proofmail`.
2. **Run `start`** as usual — it runs the pinned release. If a newer release exists, the
   launcher prints one line ("New version vX.Y.Z available") and still runs the current one.
3. To upgrade: **run `update`** (`update.sh`/`.bat`). It records the current version →
   checks out the newest tag → `npm install` → runs `npm test`. **Tests fail → it rolls
   back immediately.** Pass → the new version is live.
4. A release that passed tests but misbehaves in practice: **run `rollback`** → return to the
   previous version (stored in `.proofmail-prev-version`). Or any version:
   `git checkout v1.0.0 && npm install`.

**To cut a release (tool maintainer):**

```bash
npm test                                  # 1) tests green
# 2) bump version in package.json (semver: feature → minor, fix → patch)
git commit -am "release: v1.1.0"          # 3) commit, tag MATCHING the version, push both
git tag v1.1.0
git push && git push --tags
```

Only **`v*`-tagged** commits reach staff (via `update`). Untagged commits on `main` reach
no one — push WIP freely. The running version shows on the **banner**
(`✻ PROOFMAIL  vX.Y.Z`) so you can tell which machine is on which release.

> **On "protecting the code":** since the tool runs on staff machines, reading the code
> can't be fully prevented (even an `.exe` can be extracted). This is fine — the logic
> isn't secret. What matters — **SMTP credentials + the seller list** — is covered by
> layers 1 & 2. For true source protection, move to an **internal web app** (see
> `BUSINESS-REQUIREMENT.md`): code runs on the company server, staff access via browser +
> login, never seeing the code or holding credentials. The current core is reused as-is.
