import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendOne, buildMessage, envelopeRecipients } from '../dist/core/mailer/campaign-sender.js';

const seller = {
  seller_name: 'Acme',
  email: 'a@acme.io',
  shop_url: 'https://x/acme',
  slug: 'acme',
};
// Mock transport captures the message instead of sending it (no network, no fs).
const capturing = () => {
  const box = {};
  return { box, tx: { sendMail: async (m) => ((box.msg = m), { messageId: '<x>' }) } };
};

test('sendOne sets List-Unsubscribe and a text part; subject is personalized', async () => {
  const { box, tx } = capturing();
  const config = {
    mail: {
      fromName: 'ComacPro JSC',
      fromEmail: 's@comacpro.net',
      unsubscribe: 'mailto:unsub@comacpro.net?subject=unsubscribe',
      subjectTemplate: 'Hi {{seller_name}} — {{from_name}}',
      template: 'intro',
    },
  };

  await sendOne(tx, seller, { config });

  assert.equal(
    box.msg.headers['List-Unsubscribe'],
    '<mailto:unsub@comacpro.net?subject=unsubscribe>',
  );
  assert.equal(box.msg.subject, 'Hi Acme — ComacPro JSC');
  assert.ok(box.msg.text.includes('Acme'), 'text part personalized');
  assert.ok(/unsubscribe/i.test(box.msg.text), 'text has opt-out line');
  assert.ok(box.msg.html.includes('Acme'), 'html part personalized');
});

test('sendOne omits compliance headers when unsubscribe is unset', async () => {
  const { box, tx } = capturing();
  const config = {
    mail: {
      fromName: 'X',
      fromEmail: 's@x.com',
      subjectTemplate: '{{seller_name}}',
      template: 'intro',
    },
  };

  await sendOne(tx, seller, { config });

  assert.deepEqual(box.msg.headers, {});
});

test('sendOne honors overrideTo (the test-send path)', async () => {
  const { box, tx } = capturing();
  const config = {
    mail: {
      fromName: 'X',
      fromEmail: 's@x.com',
      subjectTemplate: '{{seller_name}}',
      template: 'intro',
    },
  };

  await sendOne(tx, seller, { config, overrideTo: 'me@self.com' });

  assert.equal(box.msg.to, 'me@self.com');
});

test('sendOne sets bcc when MAIL_BCC is configured (mailbox copy)', async () => {
  const { box, tx } = capturing();
  const config = {
    mail: {
      fromName: 'X',
      fromEmail: 's@x.com',
      bcc: 'archive@x.com',
      subjectTemplate: '{{seller_name}}',
      template: 'intro',
    },
  };

  await sendOne(tx, seller, { config });

  assert.equal(box.msg.bcc, 'archive@x.com');
});

test('sendOne omits bcc on a test send so it does not fan out copies', async () => {
  const { box, tx } = capturing();
  const config = {
    mail: {
      fromName: 'X',
      fromEmail: 's@x.com',
      bcc: 'archive@x.com',
      subjectTemplate: '{{seller_name}}',
      template: 'intro',
    },
  };

  await sendOne(tx, seller, { config, overrideTo: 'me@self.com' });

  assert.equal(box.msg.bcc, undefined);
});

// Leak guard: the raw-send (IMAP archiver) path serializes buildMessage verbatim
// and a streamTransport does NOT strip a Bcc header — so buildMessage must NEVER
// carry bcc, or the recipient would see the operator's archive address.
test('buildMessage never carries bcc (so the raw/archived copy cannot leak it)', () => {
  const config = {
    mail: {
      fromName: 'X',
      fromEmail: 's@x.com',
      bcc: 'archive@x.com',
      subjectTemplate: '{{seller_name}}',
      template: 'intro',
    },
  };
  const msg = buildMessage(seller, { config });
  assert.equal(msg.bcc, undefined);
});

test('envelopeRecipients: bcc rides the envelope (delivered, invisible to recipient)', () => {
  const config = { mail: { fromEmail: 's@x.com', bcc: 'a@x.com, b@x.com' } };
  assert.deepEqual(envelopeRecipients(seller, config), ['a@acme.io', 'a@x.com', 'b@x.com']);
  assert.deepEqual(envelopeRecipients(seller, { mail: { fromEmail: 's@x.com' } }), ['a@acme.io']);
});
