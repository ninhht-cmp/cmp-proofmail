import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickSentFolder, createSentArchiver } from '../dist/adapters/imap-sent.js';

// A fake IMAP client whose append() behavior the test controls, injected via the
// `connect` option so the reconnect/breaker logic runs with no real server.
const SENT_BOX = [{ path: 'Sent', specialUse: '\\Sent' }];
const fakeConnect = (appendFn) => {
  let connects = 0;
  const connect = async () => {
    connects++;
    const c = {
      usable: true,
      list: async () => SENT_BOX,
      append: async (...args) => appendFn(c, ...args),
      close() {},
      logout: async () => {},
    };
    return c;
  };
  return { connect, connects: () => connects };
};
const cfg = { sentFolder: 'Sent' };

const boxes = [
  { path: 'INBOX' },
  { path: 'INBOX.Sent', specialUse: '\\Sent' },
  { path: 'INBOX.Trash', specialUse: '\\Trash' },
];

test('honors an explicit folder name that exists', () => {
  assert.equal(pickSentFolder(boxes, 'INBOX.Sent'), 'INBOX.Sent');
});

test('honors an explicit name even if LIST does not surface it', () => {
  assert.equal(pickSentFolder(boxes, 'Weird.Custom'), 'Weird.Custom');
});

test('auto-detects the \\Sent special-use folder when none specified', () => {
  assert.equal(pickSentFolder(boxes, ''), 'INBOX.Sent');
});

test('falls back to a known name when no special-use flag is present', () => {
  const flat = [{ path: 'INBOX' }, { path: 'Sent' }];
  assert.equal(pickSentFolder(flat, ''), 'Sent');
});

test('falls back to "Sent" when nothing matches', () => {
  assert.equal(pickSentFolder([{ path: 'INBOX' }], ''), 'Sent');
});

test('breaker trips after consecutive APPEND failures and then short-circuits', async () => {
  const { connect } = fakeConnect(() => {
    throw new Error('rejected');
  });
  const arc = await createSentArchiver(cfg, { connect });

  for (let i = 0; i < 6; i++) await arc.append(Buffer.from('x')).catch(() => {});

  assert.equal(arc.disabled, true);
  assert.match(arc.lastError, /rejected/);
  assert.match(arc.disabledReason, /tắt/); // operator-facing reason is set
});

test('idle-drop that reconnects then succeeds NEVER trips the breaker', async () => {
  // Server drops the socket after each append; every next append must reconnect,
  // yet each APPEND succeeds — so this must stay enabled (the target-host case).
  const { connect, connects } = fakeConnect((c) => {
    c.usable = false;
  });
  const arc = await createSentArchiver(cfg, { connect });

  for (let i = 0; i < 10; i++) await arc.append(Buffer.from('x'));

  assert.equal(arc.disabled, false);
  assert.ok(connects() > 5, 'reconnected repeatedly but stayed enabled');
});

test('a successful APPEND resets the consecutive-failure counter', async () => {
  let mode = 'fail';
  const { connect } = fakeConnect(() => {
    if (mode === 'fail') throw new Error('x');
  });
  const arc = await createSentArchiver(cfg, { connect });

  for (let i = 0; i < 2; i++) await arc.append(Buffer.from('x')).catch(() => {}); // 2 in a row
  mode = 'ok';
  await arc.append(Buffer.from('x')); // reset
  mode = 'fail';
  for (let i = 0; i < 2; i++) await arc.append(Buffer.from('x')).catch(() => {}); // 2 again

  assert.equal(arc.disabled, false); // never 3 failures in a row
});
