// Central domain types — the single source of truth for the shapes that cross
// module boundaries. Import with: `import type { Seller } from '../core/types.js'`
// (NodeNext: the specifier stays `.js`; tsc resolves it to this `.ts`).

// ─────────────────────────── Domain ───────────────────────────

/** A validated recipient — one accepted row of the uploaded list, ready to mail. */
export interface Seller {
  /** Display name (defaults to '(không tên)'). */
  seller_name: string;
  /** Lowercased, validated address. */
  email: string;
  /** http(s) storefront — capture target AND CTA href. */
  shop_url: string;
  /** Optional, display-only ('' when absent). */
  phone: string;
  /** Filesystem-safe, collision-free key (per email). */
  slug: string;
}

/** A Seller plus the storefront screenshot outcome. */
export type CaptureResult = Seller & {
  shot: string | null;
  cached?: boolean;
  error?: string;
};

/** A row dropped during validation, with a human-readable reason. */
export interface SkippedRow {
  line: number;
  reason: string;
}

export interface DuplicateRow {
  line: number;
  email: string;
  firstLine: number;
}

/** The result of validating an uploaded list. */
export interface ValidationResult {
  valid: Seller[];
  skipped: SkippedRow[];
  duplicates: DuplicateRow[];
  /** Normalized header names present. */
  columns: string[];
  /** Required columns absent (blocks the send). */
  missingRequired: string[];
}

export interface ArchiveLog {
  folder: string | null;
  saved: number;
  failed: number;
  skipped: number;
  connectError?: string;
  disabledReason?: string;
  lastError?: string;
}

/** Per-mail send outcome aggregated over a campaign. */
export interface CampaignResult {
  /** Emails delivered OK. */
  sent: string[];
  failed: { email: string; error: string }[];
  /** Already sent in a prior run (resume). */
  skippedAlready: number;
  /** On the global do-not-send list. */
  skippedSuppressed: number;
  /** Present only when IMAP archiving is on. */
  archive?: ArchiveLog;
}

// ─────────────────────────── Config ───────────────────────────
// Shapes represent the OPERATIONAL config after loadConfig(); the SMTP fields
// are guaranteed present for the smtp transport by checkEnv() before use.

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface MailConfig {
  fromName: string;
  fromEmail: string;
  bcc: string;
  unsubscribe: string;
  subjectTemplate: string;
  template: string;
  transport: 'smtp' | 'outlook-draft';
}

export interface ImapConfig {
  saveSent: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  sentFolder: string;
}

export interface ThrottleConfig {
  mailsPerHour: number;
  mailDelayMs: number;
}

export interface CaptureConfig {
  concurrency: number;
  width: number;
  height: number;
  fullPage: boolean;
  emailWidth: number;
  quality: number;
}

export interface TrackingConfig {
  /** HMAC secret for the seller-identity token; '' = feature off (clean link). */
  tokenSecret: string;
  /** Query param the token rides in (default 'ref'). */
  tokenParam: string;
}

/** The full operational config (factory output of loadConfig). */
export interface Config {
  smtp: SmtpConfig;
  mail: MailConfig;
  imap: ImapConfig;
  throttle: ThrottleConfig;
  capture: CaptureConfig;
  tracking: TrackingConfig;
}
