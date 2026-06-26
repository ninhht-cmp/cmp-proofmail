// Renders the clickable HTML email from a Handlebars template. Templates are
// selected by name (default 'touch' = templates/touch.hbs); add a design by
// dropping a new templates/<name>.hbs — no code change.
import Handlebars from 'handlebars';
import { paths, readText, fileExists, fileMtimeMs } from '../../adapters/storage.js';

type Compiled = ReturnType<typeof Handlebars.compile>;

// Cached by name; re-compiles only when the .hbs mtime changes (V2 picks up hot edits).
const templateCache = new Map<string, { compiled: Compiled; mtime: number }>();

function getTemplate(name: string): Compiled {
  const file = paths.template(name);
  const mtime = fileMtimeMs(file);
  const hit = templateCache.get(name);
  if (hit && hit.mtime === mtime) return hit.compiled;
  const compiled = Handlebars.compile(readText(file));
  templateCache.set(name, { compiled, mtime });
  return compiled;
}

// The render context every template draws from — add a variable here to expose
// it to all templates at once.
function context(
  seller: { seller_name: string; shop_url: string },
  { imageSrc, assets }: { imageSrc: string; assets?: Record<string, string> },
) {
  return {
    seller_name: seller.seller_name,
    shop_url: seller.shop_url,
    shop_image_src: imageSrc,
    assets: assets || {}, // { header, services, advantages, footer } image srcs
  };
}

export function buildHtml(
  seller: { seller_name: string; shop_url: string },
  {
    imageSrc,
    assets = {},
    template = 'touch',
  }: { imageSrc: string; assets?: Record<string, string>; template?: string },
): string {
  return getTemplate(template)(context(seller, { imageSrc, assets }));
}

// Plain-text part (templates/<name>.txt.hbs). This generic body is the fallback
// when a design ships no .txt twin, so a send never breaks.
const DEFAULT_TEXT = `Dear {{seller_name}},

We created a preview store for you on our marketplace.
Explore your store: {{shop_url}}

Best regards,
{{from_name}}
{{contact}}

To stop receiving these emails, reply with "unsubscribe".`;

const textCache = new Map<string, { compiled: Compiled; mtime: number }>();
let defaultTextCompiled: Compiled | null = null;

function getTextTemplate(name: string): Compiled {
  const file = paths.textTemplate(name);
  if (!fileExists(file)) return (defaultTextCompiled ??= Handlebars.compile(DEFAULT_TEXT));
  const mtime = fileMtimeMs(file);
  const hit = textCache.get(name);
  if (hit && hit.mtime === mtime) return hit.compiled;
  const compiled = Handlebars.compile(readText(file));
  textCache.set(name, { compiled, mtime });
  return compiled;
}

// contact = the line shown under the signature (typically the sender address).
export function buildText(
  seller: { seller_name: string; shop_url: string },
  {
    fromName,
    contact = '',
    template = 'touch',
  }: { fromName: string; contact?: string; template?: string },
): string {
  return getTextTemplate(template)({
    seller_name: seller.seller_name,
    shop_url: seller.shop_url,
    from_name: fromName,
    contact,
  });
}

// Subject SOURCE for a design: templates/<name>.subject.hbs if present (a design
// can carry its own subject), else the shared MAIL_SUBJECT fallback.
const subjectSourceCache = new Map<string, { source: string; mtime: number }>();
export function subjectTemplateFor(name: string, fallback: string): string {
  const file = paths.subjectTemplate(name);
  if (!fileExists(file)) return fallback;
  const mtime = fileMtimeMs(file);
  const hit = subjectSourceCache.get(name);
  if (hit && hit.mtime === mtime) return hit.source;
  // Trim to one line — a newline in a Subject is header injection / breakage.
  const source =
    readText(file)
      .replace(/\r?\n.*$/s, '')
      .trim() || fallback;
  subjectSourceCache.set(name, { source, mtime });
  return source;
}

// The only variables a subject may use. Anything else (e.g. a typo'd
// {{supplier_name}}) renders blank; unknownSubjectVars warns instead.
export const SUBJECT_VARS = ['seller_name', 'from_name'];

// Subject {{placeholders}} not in SUBJECT_VARS (would render blank). AST-based.
export function unknownSubjectVars(
  subjectTemplate: string,
  known: string[] = SUBJECT_VARS,
): string[] {
  const found = new Set<string>();
  for (const stmt of Handlebars.parse(String(subjectTemplate || '')).body) {
    // AST nodes aren't discriminated here — narrow by the runtime `type` tag.
    const node = stmt as any;
    if (node.type === 'MustacheStatement' && node.path?.parts?.length) {
      found.add(node.path.parts[0]);
    }
  }
  return [...found].filter((v) => !known.includes(v));
}

// Cached by source string → each unique subject compiles once per campaign.
const subjectCache = new Map<string, Compiled>();

export function buildSubject(
  seller: { seller_name: string },
  { fromName, subjectTemplate }: { fromName: string; subjectTemplate: string },
): string {
  let compiled = subjectCache.get(subjectTemplate);
  if (!compiled) {
    // noEscape: a Subject is plain text, not HTML — else "A & B Co" ships as
    // "A &amp; B Co" (names with & < > " are common).
    compiled = Handlebars.compile(subjectTemplate, { noEscape: true });
    subjectCache.set(subjectTemplate, compiled);
  }
  return compiled({
    seller_name: seller.seller_name,
    from_name: fromName,
  });
}
