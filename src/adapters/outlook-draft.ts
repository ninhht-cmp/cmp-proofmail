// Opens a built message as a pre-filled DRAFT in classic Outlook (Windows-only;
// Outlook COM). This side just marshals the payload and runs the COM scripting in
// the sibling outlook-draft.ps1.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ROOT } from '../config/app-config.js';

// The .ps1 is a SOURCE asset (tsc emits only .js), so resolve it from the repo
// root's src/, not from this module's dist/ location.
const PS_SCRIPT = resolve(ROOT, 'src', 'adapters', 'outlook-draft.ps1');

export const OUTLOOK_DRAFT_SUPPORTED = process.platform === 'win32';

// The JSON the PowerShell side reads. HTML goes by path (not inlined) so a large
// body with quotes + Vietnamese never has to survive shell escaping.
export function buildDraftPayload(
  msg: any,
  { fromEmail = null, htmlPath }: { fromEmail?: string | null; htmlPath?: string } = {},
) {
  return {
    to: msg.to,
    subject: msg.subject,
    fromEmail: fromEmail || null,
    htmlPath,
    attachments: (msg.attachments || []).map((a: any) => ({
      path: a.path,
      cid: a.cid,
      filename: a.filename,
    })),
  };
}

function runPowerShell(payloadPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const ps = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        PS_SCRIPT,
        '-Payload',
        payloadPath,
      ],
      { windowsHide: true },
    );
    let stderr = '';
    ps.stderr.on('data', (d) => (stderr += d.toString()));
    ps.on('error', (e: NodeJS.ErrnoException) =>
      reject(
        e.code === 'ENOENT'
          ? new Error(
              'Không tìm thấy PowerShell — tính năng điền nháp Outlook chỉ chạy trên Windows.',
            )
          : e,
      ),
    );
    ps.on('close', (code) => {
      if (code === 0) return resolve();
      // exit 2 = Outlook COM unavailable (New Outlook / web); other = data/COM error.
      const detail = stderr.trim() || `PowerShell thoát với mã ${code}`;
      reject(new Error(detail));
    });
  });
}

// Opens `msg` as a draft in Outlook and resolves once the compose window is up.
// Does NOT send — the operator reviews and sends manually.
export async function fillOutlookDraft(
  msg: any,
  { fromEmail }: { fromEmail?: string } = {},
): Promise<void> {
  if (!OUTLOOK_DRAFT_SUPPORTED) {
    throw new Error('Chế độ điền nháp Outlook chỉ chạy trên Windows (cần Outlook Classic).');
  }
  const dir = mkdtempSync(join(tmpdir(), 'proofmail-draft-'));
  try {
    const htmlPath = join(dir, 'body.html');
    const jsonPath = join(dir, 'draft.json');
    writeFileSync(htmlPath, msg.html, 'utf8');
    writeFileSync(
      jsonPath,
      JSON.stringify(buildDraftPayload(msg, { fromEmail, htmlPath })),
      'utf8',
    );
    await runPowerShell(jsonPath);
  } finally {
    // olByValue copied the attachment bytes into the item and the HTML is loaded,
    // so the temp files are no longer needed once the window is open.
    rmSync(dir, { recursive: true, force: true });
  }
}
