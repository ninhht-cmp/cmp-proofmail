import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftPayload, OUTLOOK_DRAFT_SUPPORTED } from '../dist/adapters/outlook-draft.js';

// The shape buildMessage() returns — only the fields the draft payload reads.
const msg = {
  to: 'a@acme.io',
  subject: 'Xin chào Acme',
  html: '<p>Acme · cid:shopshot</p>',
  attachments: [
    { filename: 'mail_header.jpg', path: '/x/assets/mail_header.jpg', cid: 'hdr' },
    { filename: 'shop.jpg', path: '/x/shots/acme.jpg', cid: 'shopshot' },
  ],
};

test('buildDraftPayload carries to/subject and the html-file path', () => {
  const p = buildDraftPayload(msg, { fromEmail: 's@comacpro.net', htmlPath: '/tmp/body.html' });
  assert.equal(p.to, 'a@acme.io');
  assert.equal(p.subject, 'Xin chào Acme');
  assert.equal(p.fromEmail, 's@comacpro.net');
  assert.equal(p.htmlPath, '/tmp/body.html');
});

test('buildDraftPayload maps each attachment to {path, cid, filename} for the cid: refs', () => {
  const p = buildDraftPayload(msg, { htmlPath: '/tmp/body.html' });
  assert.deepEqual(p.attachments, [
    { path: '/x/assets/mail_header.jpg', cid: 'hdr', filename: 'mail_header.jpg' },
    { path: '/x/shots/acme.jpg', cid: 'shopshot', filename: 'shop.jpg' },
  ]);
});

test('buildDraftPayload normalizes a missing fromEmail to null (default account)', () => {
  const p = buildDraftPayload(msg, { htmlPath: '/tmp/body.html' });
  assert.equal(p.fromEmail, null);
});

test('buildDraftPayload tolerates a message with no attachments', () => {
  const p = buildDraftPayload({ to: 'x@y.z', subject: 's', html: '' }, { htmlPath: '/tmp/b.html' });
  assert.deepEqual(p.attachments, []);
});

test('OUTLOOK_DRAFT_SUPPORTED reflects the current platform (Windows only)', () => {
  assert.equal(OUTLOOK_DRAFT_SUPPORTED, process.platform === 'win32');
});
