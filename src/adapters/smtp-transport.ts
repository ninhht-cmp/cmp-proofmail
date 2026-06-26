// Isolates nodemailer. Takes connection details as an argument (not global
// config) so V2 can build a transport per sending account.
import nodemailer from 'nodemailer';
import type { SmtpConfig } from '../core/types.js';

const MAX_MESSAGES_PER_CONNECTION = 50;

export function createTransport(smtp: SmtpConfig) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    pool: true,
    maxConnections: 1,
    maxMessages: MAX_MESSAGES_PER_CONNECTION,
  });
}

// Non-sending transport that serializes a message to raw RFC822 bytes, so the
// archived copy can be byte-identical (same Message-ID) to what was delivered.
let _mimeBuilder: ReturnType<typeof nodemailer.createTransport> | undefined;
export function buildRawMessage(messageOptions: any): Promise<any> {
  _mimeBuilder ??= nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'crlf',
  });
  return _mimeBuilder.sendMail(messageOptions); // → { message: Buffer, envelope, messageId }
}
