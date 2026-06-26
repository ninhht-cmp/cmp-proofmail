// Isolates imapflow: files a copy of each sent mail into the "Sent" folder via
// IMAP APPEND (SMTP only delivers — it never stores a copy). OPTIONAL and
// best-effort: the reliable copy is the BCC and the authoritative history is the
// local report, so APPEND failures never block sending.
import { ImapFlow } from 'imapflow';
import { errMsg } from '../lib/util.js';
import type { ImapConfig } from '../core/types.js';

// Trip the breaker after this many APPENDs fail IN A ROW. We count failures, not
// reconnects — a benign idle-drop that reconnects and succeeds doesn't count.
const MAX_CONSECUTIVE_FAILURES = 3;

// cPanel/Dovecot nest under INBOX ('INBOX.Sent'); others use top-level 'Sent'.
// Used only when the server doesn't flag a \Sent special-use box.
const SENT_FALLBACKS = ['Sent', 'INBOX.Sent', 'Sent Items', 'Đã gửi'];

type MailboxInfo = { path: string; specialUse?: string };

// Pure folder selection (testable without a server): explicit name → \Sent
// special-use box → a known fallback → 'Sent'.
export function pickSentFolder(boxes: MailboxInfo[], preferred?: string): string {
  if (preferred) {
    const hit = boxes.find((b) => b.path === preferred);
    return hit ? hit.path : preferred; // honor even if LIST doesn't surface it
  }
  const special = boxes.find((b) => b.specialUse === '\\Sent');
  if (special) return special.path;
  const byName = boxes.find((b) => SENT_FALLBACKS.includes(b.path));
  return byName ? byName.path : 'Sent';
}

// Injectable so tests can drive the reconnect/breaker logic with a fake.
function defaultConnect(imap: ImapConfig): () => Promise<any> {
  return async () => {
    const c = new ImapFlow({
      host: imap.host,
      port: imap.port,
      secure: imap.secure,
      auth: { user: imap.user, pass: imap.pass },
      logger: false,
    });
    // Swallow background socket-drop 'error' so it can't crash the process — the
    // next append() sees .usable is false and reconnects.
    c.on('error', () => {});
    await c.connect();
    return c;
  };
}

export interface SentArchiver {
  readonly folder: string | null;
  readonly disabled: boolean;
  readonly disabledReason: string;
  readonly lastError: string;
  append(raw: Buffer | string): Promise<void>;
  close(): Promise<void>;
}

// A self-healing, self-limiting appender: reconnects before appending if the
// socket was idle-dropped (not counted as a failure); does NOT retry the APPEND
// itself (IMAP APPEND isn't idempotent → a committed-but-unacked one would
// duplicate); trips a breaker after MAX_CONSECUTIVE_FAILURES so a persistent
// fault never becomes a login storm. The first connect throws (caller decides
// whether to send without archiving); everything after is non-fatal.
export async function createSentArchiver(
  imap: ImapConfig,
  { connect }: { connect?: () => Promise<any> } = {},
): Promise<SentArchiver> {
  const open = connect || defaultConnect(imap);

  let client: any = null;
  let folder: string | null = null;
  let consecutiveFailures = 0;
  let disabled = false;
  let disabledReason = '';
  let lastError = '';

  async function openConnection() {
    client = await open();
    if (folder == null) folder = imap.sentFolder || pickSentFolder(await client.list(), '');
  }

  function dropConnection() {
    if (!client) return;
    try {
      client.close();
    } catch {
      /* ignore */
    }
    client = null;
  }

  await openConnection(); // surface auth/host problems up-front

  function tripBreaker() {
    disabled = true;
    disabledReason =
      `Máy chủ IMAP liên tục lỗi khi lưu vào hộp "${folder}" (${lastError}) — đã tắt ` +
      'lưu qua IMAP cho phần còn lại để tránh bị khoá. Bản sao vẫn được giữ qua BCC ' +
      'và báo cáo CSV.';
    dropConnection();
  }

  return {
    get folder() {
      return folder;
    },
    get disabled() {
      return disabled;
    },
    get disabledReason() {
      return disabledReason;
    },
    get lastError() {
      return lastError;
    },

    async append(raw: Buffer | string) {
      if (disabled) throw new Error(disabledReason);
      try {
        if (!client || !client.usable) await openConnection(); // reconnect after idle-drop
        // \Seen so the archived copy isn't counted as an unread "new" message.
        await client.append(folder, raw, ['\\Seen']);
        consecutiveFailures = 0;
        return;
      } catch (err) {
        lastError = errMsg(err);
        dropConnection();
        if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) tripBreaker();
        throw err;
      }
    },

    async close() {
      if (!client) return;
      try {
        await client.logout();
      } catch {
        try {
          client.close();
        } catch {
          /* ignore */
        }
      }
      client = null;
    },
  };
}
