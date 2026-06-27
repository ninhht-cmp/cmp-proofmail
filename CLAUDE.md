# CLAUDE.md — Proofmail project conventions

Guidance for humans (and AI agents) editing this code. Goal: keep the codebase
consistent and predictable, and stop past bugs from recurring.

## Language policy

The **engineering surface is English**; the **product surface is Vietnamese**.

| Surface | Language |
|---|---|
| Code, identifiers, code comments, dev docs (`CLAUDE.md`, `README.md`, `experimental/README.md`) | English |
| Runtime end-user output (CLI prompts, errors, UI) | Vietnamese, plain wording — no technical error codes |
| Operator & stakeholder guides (`HUONG-DAN-*.md`, `BUSINESS-REQUIREMENT.md`) | Vietnamese — their readers are the Vietnamese sales/ops team |

## Ubiquitous language — IMPORTANT

One concept = **one word in code**. The mail recipient is always **`seller`**.

⛔ Never use `supplier`, `supplier_name`, `ncc`, `vendor` in code/templates/env.
This isn't cosmetic: a subject of `{{supplier_name}}` once rendered EMPTY because the
renderer only supplies `seller_name` → every mail shipped without a recipient name.
(Vietnamese business docs say "nhà cung cấp / NCC" — that is the *same* concept as
`seller`, just the stakeholder-facing word.)

Template variables, by part — source of truth is the code, not this list:
- **Subject**: defaults to `MAIL_SUBJECT` (.env); a design may override via
  `templates/<name>.subject.hbs`. Either way only `{{seller_name}}`, `{{from_name}}`
  are valid (`SUBJECT_VARS` in `src/core/render/template.ts`). A wrong name warns at
  startup (`unknownSubjectVars`, checked against the effective subject).
- **HTML** (`templates/*.hbs`): `{{seller_name}}`, `{{shop_url}}`, `{{shop_image_src}}`, `{{assets.*}}`, `{{unsubscribe}}` (opt-out mailto; wrap usage in `{{#if unsubscribe}}`).
- **Text** (`templates/*.txt.hbs`): `{{seller_name}}`, `{{shop_url}}`, `{{from_name}}`, `{{contact}}`.

## Architecture — ports & adapters

```
cli/      → terminal interface. NO business logic here.
core/     → pure core: no terminal, no direct env reads, no globals.
            Receives config + stores by ARGUMENT (dependency injection).
adapters/ → I/O edge: nodemailer, Playwright, fs, Google Sheet. Isolates third-party libs.
config/   → reads .env → config object (loadConfig is a factory, not a singleton).
lib/      → pure utilities, no domain.
```

Golden rule: **`core/` must not import from `cli/`**, must not read `process.env`, must
not `console.log`. Progress leaves the core via the `onProgress` callback. This is what
lets V2 (web) wrap the core as a job without touching it.

## Naming

- Files/folders: **kebab-case** (`campaign-sender.ts`, `seller-validator.ts`).
- Functions: clear verbs (`captureShops`, `recordSent`, `loadSheetToFile`).
- Name by **function / the thing acted on**, not the input type: `captureShops` takes
  `Seller[]` but is named for *what it captures* = shops.
- **Ubiquitous language pins ONE concept** ("the recipient = `seller`"); it does NOT
  mean everything is named `seller`. Keep shared mechanics **generic** in `lib/`
  (`signToken`/`readToken`) so they extend; use a domain word only where it truly is
  that concept (`sellerSlug`, `shopUrlFor`).

## Comments

Comments explain **WHY, not WHAT**. The code already states what it does; a comment
earns its place only by capturing intent, a non-obvious constraint, a gotcha, or the
reasoning behind a decision. Don't restate the next line or narrate the obvious —
prefer one sharp comment over three redundant ones. Comment the surprising, not the
self-evident; match the density of the surrounding code.

## TypeScript & build — IMPORTANT

- Source is **TypeScript** in `src/` (`.ts`). `tsc` compiles to `dist/` (gitignored);
  **`node` always runs `dist/`** — no ts-node/tsx, no transpile at runtime.
- Import specifiers keep the **`.js`** suffix even in `.ts` files (NodeNext) — tsc
  resolves to `.ts` and emits `.js`. Don't switch them to `.ts`.
- `tsconfig.json`: `strict` ON but `noImplicitAny` OFF (gradual: an unannotated param
  is `any`; an annotated one is checked strictly). `noUnusedLocals` catches dead imports.
- Shared domain types live in **`src/core/types.ts`** (`Seller`/`Config`/`CampaignResult`…)
  — add/change shapes HERE, not scattered around.
- `typescript` + `@types/*` are **dependencies** (the build runs on the user's machine);
  only `prettier` is a devDependency. Lint = `tsc` + Prettier (NO ESLint).
- The launcher runs `npm run build` (incremental) then `dist/`. A type error = build
  failure = the tool reports it clearly instead of running wrong.

## Config & secrets

- Every operational value comes from `.env` (see `.env.example` — the source to copy).
- **Never** hardcode credentials. `.env` is gitignored → never ships (install is via
  `git clone`; untracked files never come along).
- New config: declare it in `loadConfig` (with a safe default) + add it to `.env.example`.

## Deliverability (currently Gmail SMTP)

- Every mail carries a `List-Unsubscribe` header + a visible HTML footer link, both
  `mailto:MAIL_FROM_EMAIL`, so recipients opt out instead of reporting spam. The reply is
  honored MANUALLY via `npm run suppress -- <email>` (or the suppress launcher), which adds
  the address to the suppression list. One-click https + auto-handling is an ESP/V2 concern.
- Business caveat: >500/day over Gmail risks a lock. For volume, switch to Amazon
  SES/SendGrid (change only `SMTP_*` in .env) + set up SPF/DKIM/DMARC for `comacpro.net`,
  and re-enable Tier B in `experimental/`.

## CTA link markers — click tracking

`shopUrlFor` (`core/render/shop-url.ts`), called once in `buildMessage`
(`campaign-sender.ts`), can stamp two INDEPENDENT markers onto the CTA `shop_url`.
Both are CTA-link only — screenshot capture always uses the raw `shop_url`.

**1. UTM marker — always on for real sends (interim tracking).** Adds
`utm_source=email` + `utm_campaign=<mail template>` so the marketplace can tell an email
click from an organic store visit (the FE fires `trackExploreClick` only when the marker
is present). `utm_source` is a constant (the tool only sends email — no env to tune); the
marker is applied whenever `shopUrlFor` gets a `utmCampaign`, which `buildMessage` always
passes (= the template name).

**2. Signed seller-identity token — OFF by default.** When `SHOP_URL_TOKEN_SECRET` is
set, appends `?ref=<token>`: `sellerSlug` (from `/seller/<slug>/`) signed with `signToken`
(`lib/signed-token.ts`, generic), resolved by the receiver via `readToken`. It makes a
click attribute to the seller who owns the link (not the logged-in account) and is
forgery-proof. Consumption (BE `trackExploreClick` v2 + FE) lives outside this tool;
enable once the BE is ready and both sides share one secret.

## `experimental/`

Tier B (ESP bounce/complaint: webhook + ingest + normalizer) is split out because it is
NOT yet in the live send flow. Don't let `src/` import from `experimental/`. Pull it into
the core when moving to a real ESP. See `experimental/README.md`.

## Tests

- `npm test` — `pretest` builds, then runs the core tests (`test/*.test.js`, importing
  from `dist/`). Must be green before committing.
- `npm run test:experimental` — Tier B tests (also builds first).
- Change behaviour → update/add the matching test (especially: store, validator, render,
  suppression, signed-token).

## Package manager

Use **npm** (pinned via `packageManager` in package.json). Commit `package-lock.json`.
Don't mix pnpm/yarn.

## Releases & versioning

The unit of release is a **git tag `vX.Y.Z`** (semver), NOT every commit on `main`. Each
machine pins to a tag; `update.sh`/`.bat` moves the tag (runs `npm test`, auto-rolls back
on failure). Therefore:
- `main` may hold WIP commits — they reach no one until tagged.
- To release: tests green → bump `version` in `package.json` (feature=minor, fix=patch,
  breaking=major) → `git tag vX.Y.Z` **matching** the version → push with `--tags`.
- `VERSION` (read from `package.json` in `app-config.ts`) shows on the banner → the tag and
  `package.json` must always match.
- `start.*` only ANNOUNCES a new tag (no auto `git pull`). Don't re-add auto-pull.
