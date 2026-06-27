import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createSuppressionStore,
  createCampaignStore,
  missingBrandAssets,
  paths,
} from '../dist/adapters/storage.js';
import { sendCampaign } from '../dist/core/mailer/campaign-sender.js';

const SUPP = resolve(paths.stateDir, '__test_suppression.json');
const newSupp = () => createSuppressionStore(SUPP);
const cleanSupp = () => rmSync(SUPP, { force: true });

test('SuppressionStore: add once, query, persist across instances, remove', () => {
  cleanSupp();
  const s = newSupp();
  assert.equal(s.suppress('A@x.com', { reason: 'hard-bounce', source: 'smtp-5xx' }), true);
  assert.equal(s.suppress('a@x.com', { reason: 'other' }), false, 'dedupe (case-insensitive)');
  assert.equal(s.isSuppressed('a@x.com'), true);
  // a fresh instance reads from disk
  assert.equal(newSupp().isSuppressed('a@x.com'), true);
  assert.equal(newSupp().loadRecords()['a@x.com'].reason, 'hard-bounce', 'keeps first reason');
  assert.equal(s.remove('a@x.com'), true);
  assert.equal(newSupp().isSuppressed('a@x.com'), false);
  cleanSupp();
});

test('sendCampaign: skips suppressed up-front and auto-suppresses permanent 5xx', async () => {
  const ID = '__test_send_supp';
  const campaign = createCampaignStore(ID);
  rmSync(campaign.file, { force: true });
  cleanSupp();
  const suppression = newSupp();
  suppression.suppress('blocked@x.com', { reason: 'complaint', source: 'test' });

  const config = {
    mail: {
      fromName: 'X',
      fromEmail: 's@x.com',
      subjectTemplate: '{{seller_name}}',
      template: 'intro',
    },
    throttle: { mailDelayMs: 0 },
  };
  const sellers = [
    { email: 'ok@x.com', seller_name: 'OK', shop_url: 'https://x/ok', slug: 'ok', shot: true },
    { email: 'blocked@x.com', seller_name: 'Blk', shop_url: 'https://x/b', slug: 'b', shot: true },
    { email: 'dead@x.com', seller_name: 'Dead', shop_url: 'https://x/d', slug: 'd', shot: true },
  ];
  const tx = {
    verify: async () => true,
    close() {},
    sendMail: async (m) => {
      if (m.to === 'dead@x.com') {
        const e = new Error('550 No such user');
        e.responseCode = 550;
        throw e;
      }
      return { messageId: `<${m.to}>` };
    },
  };

  const r = await sendCampaign(sellers, {
    config,
    store: campaign,
    suppression,
    transport: tx,
    resume: true,
  });
  assert.equal(r.skippedSuppressed, 1, 'blocked@x.com skipped before sending');
  assert.deepEqual(r.sent, ['ok@x.com']);
  assert.deepEqual(
    r.failed.map((f) => f.email),
    ['dead@x.com'],
  );
  // the permanent 5xx is now on the do-not-send list
  assert.equal(suppression.isSuppressed('dead@x.com'), true);

  rmSync(campaign.file, { force: true });
  rmSync(paths.report(ID), { force: true });
  cleanSupp();
});

test('sendCampaign: retries a transient (4xx) failure, then records the send', async () => {
  // Locks the retry path (FR-6) extracted into sendOneWithRetry: a transient
  // failure must be retried, NOT counted as failed, and the eventual attempt
  // count recorded. (One real RETRY_BACKOFF_MS sleep — hence a touch slow.)
  const ID = '__test_retry';
  const campaign = createCampaignStore(ID);
  rmSync(campaign.file, { force: true });
  cleanSupp();
  const config = {
    mail: {
      fromName: 'X',
      fromEmail: 's@x.com',
      subjectTemplate: '{{seller_name}}',
      template: 'intro',
    },
    throttle: { mailDelayMs: 0 },
  };
  const sellers = [
    { email: 'flaky@x.com', seller_name: 'F', shop_url: 'https://x/f', slug: 'flaky', shot: true },
  ];
  let attempts = 0;
  const tx = {
    verify: async () => true,
    close() {},
    sendMail: async (m) => {
      attempts++;
      if (attempts < 2) {
        const e = new Error('451 Temporary failure'); // 4xx = transient → retry
        e.responseCode = 451;
        throw e;
      }
      return { messageId: `<${m.to}>` };
    },
  };

  const r = await sendCampaign(sellers, {
    config,
    store: campaign,
    suppression: newSupp(),
    transport: tx,
    resume: true,
  });
  assert.deepEqual(r.sent, ['flaky@x.com'], 'delivered after one retry');
  assert.equal(r.failed.length, 0, 'a transient failure is not a final failure');
  assert.equal(attempts, 2, 'retried exactly once');
  assert.equal(campaign.loadRecords()['flaky@x.com'].attempts, 2, 'attempt count recorded');

  rmSync(campaign.file, { force: true });
  rmSync(paths.report(ID), { force: true });
  cleanSupp();
});

test('preflight: missingBrandAssets reports gaps and sendCampaign fails fast', async () => {
  assert.deepEqual(missingBrandAssets(), [], 'all four assets present by default');

  // hide one asset, then restore no matter what
  const asset = paths.asset('mail_header.jpg');
  const bak = `${asset}.testbak`;
  renameSync(asset, bak);
  try {
    assert.deepEqual(missingBrandAssets(), ['mail_header.jpg']);
    await assert.rejects(
      sendCampaign(
        [{ email: 'a@x.com', seller_name: 'A', shop_url: 'https://x', slug: 'a', shot: true }],
        {
          config: {
            mail: {
              fromName: 'X',
              fromEmail: 's@x.com',
              subjectTemplate: '{{seller_name}}',
              template: 'intro',
            },
            throttle: { mailDelayMs: 0 },
          },
          store: createCampaignStore('__test_pf'),
          suppression: newSupp(),
          transport: {
            verify: async () => true,
            close() {},
            sendMail: async () => ({ messageId: '<x>' }),
          },
          resume: true,
        },
      ),
      /Thiếu ảnh thương hiệu/,
    );
  } finally {
    renameSync(bak, asset);
  }
  rmSync(createCampaignStore('__test_pf').file, { force: true });
  rmSync(paths.report('__test_pf'), { force: true });
  cleanSupp();
});
