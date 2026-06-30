// Every path and file IO lives here; core never builds paths or touches fs.
// The ArtifactStore (screenshots) and CampaignStore (sent-state) seams are kept
// explicit so V2 can swap fs → S3/DB without touching core.
import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  statSync,
  readdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { ROOT } from '../config/app-config.js';

const ARTIFACTS_DIR = resolve(ROOT, 'output', 'artifacts'); // regenerable, safe to delete
const STATE_DIR = resolve(ROOT, 'output', 'state');
const REPORTS_DIR = resolve(ROOT, 'output', 'reports');
const SHEETS_DIR = resolve(ROOT, 'output', 'sheets');
const TEMPLATES_DIR = resolve(ROOT, 'templates');
const ASSETS_DIR = resolve(ROOT, 'assets');

// The brand chrome — four fixed images. Single source of truth for the email:
// key = the {{assets.<key>}} template var, cid = the inline Content-ID, file = the JPEG.
export const brandAssets = [
  { key: 'header', cid: 'hdr', file: 'mail_header.jpg' },
  { key: 'services', cid: 'svc', file: 'mail_badge1.jpg' },
  { key: 'advantages', cid: 'adv', file: 'mail_badge2.jpg' },
  { key: 'footer', cid: 'ftr', file: 'mail_footer.jpg' },
];

// Sanitize a design name into a filename — no path traversal.
const safeName = (name: string) => String(name).replace(/[^a-z0-9_-]/gi, '') || 'touch';

export const paths = {
  artifactsDir: ARTIFACTS_DIR,
  stateDir: STATE_DIR,
  assetsDir: ASSETS_DIR,
  asset: (file: string) => resolve(ASSETS_DIR, file),
  shot: (slug: string) => resolve(ARTIFACTS_DIR, `shot_${slug}.jpg`),
  template: (name = 'touch') => resolve(TEMPLATES_DIR, `${safeName(name)}.hbs`),
  textTemplate: (name = 'touch') => resolve(TEMPLATES_DIR, `${safeName(name)}.txt.hbs`),
  subjectTemplate: (name = 'touch') => resolve(TEMPLATES_DIR, `${safeName(name)}.subject.hbs`),
  report: (id?: string) => resolve(REPORTS_DIR, `report-${safeId(id)}.csv`),
  suppression: () => resolve(STATE_DIR, 'suppression.json'),
  sheetCsv: (id: string, gid: string) =>
    resolve(SHEETS_DIR, `sheet-${safeId(id)}-${safeId(gid)}.csv`),
};

export const brandAssetSrcs = (): Record<string, string> =>
  Object.fromEntries(brandAssets.map((a) => [a.key, `cid:${a.cid}`]));

// Missing brand images (empty = all present). A missing one fails EVERY email at
// attach time, so callers check this up front and fail fast.
export const missingBrandAssets = (): string[] =>
  brandAssets.filter((a) => !existsSync(paths.asset(a.file))).map((a) => a.file);

// Selectable designs: each templates/<name>.hbs is one design; its .txt.hbs /
// .subject.hbs twins are PARTS of it, not designs. Default 'touch' sorts first.
export function listTemplates(): string[] {
  try {
    const names = readdirSync(TEMPLATES_DIR)
      .filter((f) => f.endsWith('.hbs') && !f.endsWith('.txt.hbs') && !f.endsWith('.subject.hbs'))
      .map((f) => f.slice(0, -'.hbs'.length))
      .sort((a, b) => (a === 'touch' ? -1 : b === 'touch' ? 1 : a.localeCompare(b)));
    return names;
  } catch {
    return [];
  }
}

export function ensureDirs(): void {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  mkdirSync(STATE_DIR, { recursive: true });
  mkdirSync(REPORTS_DIR, { recursive: true });
  mkdirSync(SHEETS_DIR, { recursive: true });
}

export const fileExists = (p: string): boolean => existsSync(p);
export const readText = (p: string): string => readFileSync(p, 'utf8');
export const fileMtimeMs = (p: string): number => {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};

// Stable, safe id from the source file → re-running the same list resumes.
const safeId = (id?: string): string =>
  String(id || 'default')
    .replace(/[^a-z0-9_-]+/gi, '_')
    .slice(0, 80) || 'default';

// Atomic write (temp + rename). A crash mid-write must never leave a truncated
// JSON checkpoint — it would parse to "empty" and silently re-send the whole campaign.
function atomicWrite(file: string, text: string): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

// Report columns, in order. status = our synchronous SMTP outcome; deliveryStatus
// = the later ESP verdict (delivered/bounce/complaint), filled by Tier B.
const REPORT_COLUMNS = [
  'seller_name',
  'email',
  'shop_url',
  'phone',
  'status',
  'updatedAt',
  'attempts',
  'responseCode',
  'permanent',
  'messageId',
  'error',
  'deliveryStatus',
  'deliveryAt',
];

// RFC-4180 quoting (SMTP error messages often hold commas/quotes/newlines), plus
// a formula-injection guard: Excel/Sheets evaluate a cell whose text starts with
// = + - @ (or a leading tab/CR) as a FORMULA — even when the CSV field was quoted,
// since quoting is only CSV transport. seller_name/error come from an uploaded
// list (semi-trusted), so a name like =HYPERLINK(...) would run on open. Prefix a
// single quote to neutralize it; Excel shows the quote-stripped text in the cell.
function csvField(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// A per-email outcome row. Loose by design: callers spread arbitrary fields and
// the CSV writer reads only REPORT_COLUMNS.
export interface CampaignRecord {
  email: string;
  status?: 'sent' | 'failed';
  updatedAt?: string;
  [key: string]: any;
}

export function writeCampaignReportCsv(
  campaignId: string | undefined,
  records: Record<string, CampaignRecord>,
): string {
  ensureDirs();
  const out = paths.report(campaignId);
  const rows = [REPORT_COLUMNS.join(',')];
  for (const r of Object.values(records)) {
    rows.push(REPORT_COLUMNS.map((k) => csvField(r[k])).join(','));
  }
  // BOM so Excel reads it as UTF-8 (else Vietnamese names show as mojibake on Windows).
  writeFileSync(out, '\uFEFF' + rows.join('\n') + '\n');
  return out;
}

// CampaignStore — per-email send outcome for ONE campaign, so a re-run/resume
// never re-sends a success and failures aren't lost. JSON map keyed by email.
// V2 backs this with a DB keyed by campaign id; the contract stays identical.
export function createCampaignStore(campaignId?: string) {
  const file = resolve(STATE_DIR, `campaign-${safeId(campaignId)}.json`);

  // Load once, mutate in memory, persist on every mark (one small write per email).
  let cache: { records: Record<string, CampaignRecord> } | null = null;
  function state(): { records: Record<string, CampaignRecord> } {
    if (cache) return cache;
    if (!existsSync(file)) return (cache = { records: {} });
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      if (raw.records) return (cache = { records: raw.records });
      // Legacy schema { sent:[emails] } → migrate to per-email records.
      const records: Record<string, CampaignRecord> = {};
      for (const email of raw.sent || []) records[email] = { email, status: 'sent' };
      return (cache = { records });
    } catch {
      return (cache = { records: {} });
    }
  }
  function persist() {
    try {
      ensureDirs();
      atomicWrite(
        file,
        JSON.stringify(
          { campaignId, updated: new Date().toISOString(), records: state().records },
          null,
          2,
        ),
      );
    } catch {
      // A failed checkpoint write must not abort the campaign in progress.
    }
  }
  function mark(email: string, status: 'sent' | 'failed', data: Record<string, any>) {
    state().records[email] = { email, status, ...data, updatedAt: new Date().toISOString() };
    persist();
  }

  return {
    file,
    // Resume guard: emails already sent OK (never re-send these).
    loadSent(): Set<string> {
      return new Set(
        Object.values(state().records)
          .filter((r) => r.status === 'sent')
          .map((r) => r.email),
      );
    },
    loadRecords(): Record<string, CampaignRecord> {
      return state().records;
    },
    markSent(email: string, data: Record<string, any> = {}) {
      mark(email, 'sent', data);
    },
    markFailed(email: string, data: Record<string, any> = {}) {
      mark(email, 'failed', data);
    },
    // Tier B: stamp a later async ESP outcome onto an existing record, keeping the
    // original send `status`. No-op if this campaign never sent to that email.
    markDelivery(email: string, { type, at }: { type?: string; at?: string } = {}): boolean {
      const rec = state().records[email];
      if (!rec) return false;
      rec.deliveryStatus = type;
      rec.deliveryAt = at || new Date().toISOString();
      persist();
      return true;
    },
    reset() {
      cache = { records: {} };
      persist();
    },
    report() {
      return writeCampaignReportCsv(campaignId, state().records);
    },
  };
}

// ─────────────────────────── Image enrich ───────────────────────────

export interface EnrichRecord {
  url: string;
  status: 'ok' | 'error';
  imageUrl?: string;
  error?: string;
  at?: string;
}

// EnrichStore — per-URL checkpoint for ONE enrich job (file + template), so a
// crash/resume never re-captures or re-uploads a URL already done. Keyed by URL
// because the output column is the image link FOR that URL; two rows sharing a URL
// share the link. Mirrors createCampaignStore (atomic write, JSON map).
export function createEnrichStore(jobId?: string) {
  const file = resolve(STATE_DIR, `enrich-${safeId(jobId)}.json`);
  let cache: Record<string, EnrichRecord> | null = null;
  function records(): Record<string, EnrichRecord> {
    if (cache) return cache;
    if (!existsSync(file)) return (cache = {});
    try {
      return (cache = JSON.parse(readFileSync(file, 'utf8')).records || {});
    } catch {
      return (cache = {});
    }
  }
  function persist() {
    try {
      ensureDirs();
      atomicWrite(
        file,
        JSON.stringify({ jobId, updated: new Date().toISOString(), records: records() }, null, 2),
      );
    } catch {
      // A failed checkpoint must not abort a run in progress; resume just redoes the row.
    }
  }
  return {
    file,
    // Resume guard: URLs uploaded OK (never re-capture/re-upload these).
    loadDone(): Set<string> {
      return new Set(
        Object.values(records())
          .filter((r) => r.status === 'ok' && r.imageUrl)
          .map((r) => r.url),
      );
    },
    loadRecords(): Record<string, EnrichRecord> {
      return records();
    },
    mark(url: string, rec: Omit<EnrichRecord, 'url' | 'at'>) {
      records()[url] = { url, ...rec, at: new Date().toISOString() };
      persist();
    },
    reset() {
      cache = {};
      persist();
    },
  };
}

// Write the enriched list to its OWN file (never the input). Preserves every
// original column in order; the image/status columns are appended by the caller.
// Same CSV safety as the campaign report: UTF-8 BOM + RFC-4180 + formula-injection
// guard (the list is semi-trusted — a cell like =HYPERLINK(...) must not execute).
export function writeEnrichedCsv(
  outPath: string,
  rows: Record<string, any>[],
  columns: string[],
): void {
  const lines = [columns.map(csvField).join(',')];
  for (const r of rows) lines.push(columns.map((col) => csvField(r[col])).join(','));
  atomicWrite(outPath, '\uFEFF' + lines.join('\n') + '\n');
}

// Same as writeEnrichedCsv but emits a real .xlsx (single sheet) so an xlsx input
// keeps an xlsx result. Cells are written as STRINGS (rows come in as strings),
// so a leading "=" is stored as text, not a live formula \u2014 no injection surface,
// no ' prefix needed (unlike CSV, where quoting is only transport). Original
// styles/extra sheets aren't carried over; the data + new columns are.
export async function writeEnrichedXlsx(
  outPath: string,
  rows: Record<string, any>[],
  columns: string[],
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(columns);
  for (const r of rows) ws.addRow(columns.map((col) => (r[col] == null ? '' : String(r[col]))));
  // exceljs has no atomic write; go via a temp file + rename so a crash mid-write
  // never leaves a half-written result over a good previous one.
  const tmp = `${outPath}.tmp`;
  await wb.xlsx.writeFile(tmp);
  renameSync(tmp, outPath);
}

// SuppressionStore — the GLOBAL do-not-send list (hard bounces / complaints). A
// dead address is dead for every campaign, so this is not per-campaign. V2 backs
// it with a DB table; the contract stays identical.
export function createSuppressionStore(file = paths.suppression()) {
  let cache: Record<string, any> | null = null;
  function records(): Record<string, any> {
    if (cache) return cache;
    if (!existsSync(file)) return (cache = {});
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      return (cache = raw.records || {});
    } catch {
      return (cache = {});
    }
  }
  function persist() {
    try {
      ensureDirs();
      atomicWrite(
        file,
        JSON.stringify({ updated: new Date().toISOString(), records: records() }, null, 2),
      );
    } catch {
      // a failed write must not abort the campaign in progress
    }
  }
  return {
    file,
    isSuppressed(email: string): boolean {
      return Boolean(records()[String(email).toLowerCase()]);
    },
    loadSet(): Set<string> {
      return new Set(Object.keys(records()));
    },
    loadRecords(): Record<string, any> {
      return records();
    },
    // Add once; keep the first reason/source so the original cause survives.
    suppress(
      email: string,
      { reason = 'unknown', source = 'manual' }: { reason?: string; source?: string } = {},
    ): boolean {
      const key = String(email).toLowerCase();
      if (!key || records()[key]) return false;
      records()[key] = { email: key, reason, source, at: new Date().toISOString() };
      persist();
      return true;
    },
    remove(email: string): boolean {
      const key = String(email).toLowerCase();
      if (!records()[key]) return false;
      delete records()[key];
      persist();
      return true;
    },
  };
}
