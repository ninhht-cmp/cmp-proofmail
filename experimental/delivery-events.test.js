// Tests for the isolated Tier-B ESP layer. Not part of the shipped CLI flow —
// run with `npm run test:experimental`. See experimental/README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { createSuppressionStore, createCampaignStore, paths } from '../dist/adapters/storage.js';
import {
  applyDeliveryEvents,
  normalizeSes,
  normalizeSendgrid,
  normalizeEvents,
} from './delivery-events.js';

const SUPP = paths.suppression().replace(/suppression\.json$/, '__test_supp_esp.json');
const newSupp = () => createSuppressionStore(SUPP);
const cleanSupp = () => rmSync(SUPP, { force: true });

test('normalizeSes: bounce / complaint / delivery → normalized shape', () => {
  const bounce = normalizeSes({
    notificationType: 'Bounce',
    mail: { messageId: 'm1' },
    bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'dead@x.com' }] },
  });
  assert.deepEqual(bounce, [
    { email: 'dead@x.com', type: 'bounce', subtype: 'Permanent', messageId: 'm1', provider: 'ses' },
  ]);

  assert.equal(
    normalizeSes({
      notificationType: 'Complaint',
      complaint: { complainedRecipients: [{ emailAddress: 'c@x.com' }] },
    })[0].type,
    'complaint',
  );
  assert.equal(
    normalizeSes({ notificationType: 'Delivery', delivery: { recipients: ['ok@x.com'] } })[0].type,
    'delivered',
  );
});

test('normalizeSendgrid: maps events, drops unknown', () => {
  const evs = normalizeSendgrid([
    { email: 'ok@x.com', event: 'delivered', sg_message_id: 's1', timestamp: 1700000000 },
    { email: 'dead@x.com', event: 'dropped' },
    { email: 'spam@x.com', event: 'spamreport' },
    { email: 'slow@x.com', event: 'deferred' },
    { email: 'noise@x.com', event: 'open' }, // unknown → dropped
  ]);
  assert.deepEqual(
    evs.map((e) => `${e.email}:${e.type}`),
    ['ok@x.com:delivered', 'dead@x.com:bounce', 'spam@x.com:complaint', 'slow@x.com:deferred'],
  );
  assert.equal(evs[1].subtype, 'Permanent', 'dropped is permanent');
  assert.ok(evs[0].at.startsWith('2023-'), 'unix ts → ISO');
});

test('applyDeliveryEvents: suppresses hard bounce + complaint, NOT transient/delivered', () => {
  cleanSupp();
  const s = newSupp();
  const summary = applyDeliveryEvents(
    [
      { email: 'dead@x.com', type: 'bounce', subtype: 'Permanent' },
      { email: 'soft@x.com', type: 'bounce', subtype: 'Transient' },
      { email: 'spam@x.com', type: 'complaint' },
      { email: 'ok@x.com', type: 'delivered' },
      { type: 'bounce' }, // no email → ignored
    ],
    { suppression: s },
  );
  assert.equal(summary.suppressed, 2);
  assert.equal(summary.ignored, 1);
  assert.deepEqual([...s.loadSet()].sort(), ['dead@x.com', 'spam@x.com']);
  assert.equal(s.isSuppressed('soft@x.com'), false, 'transient bounce is not suppressed');
  cleanSupp();
});

test('applyDeliveryEvents: stamps deliveryStatus on an existing campaign record only', () => {
  const ID = '__test_delivery';
  const campaign = createCampaignStore(ID);
  rmSync(campaign.file, { force: true });
  campaign.markSent('ok@x.com', { attempts: 1 });

  const summary = applyDeliveryEvents(
    [
      { email: 'ok@x.com', type: 'delivered', at: '2026-01-01T00:00:00.000Z' },
      { email: 'stranger@x.com', type: 'delivered' }, // not in this campaign → no-op
    ],
    { campaignStore: campaign },
  );
  assert.equal(summary.recorded, 1);
  assert.equal(campaign.loadRecords()['ok@x.com'].deliveryStatus, 'delivered');
  assert.equal(campaign.loadRecords()['stranger@x.com'], undefined);
  rmSync(campaign.file, { force: true });
  rmSync(paths.report(ID), { force: true });
});

test('normalizeEvents: dispatch + passthrough + bad provider', () => {
  assert.equal(
    normalizeEvents('sendgrid', [{ email: 'a@x.com', event: 'delivered' }])[0].type,
    'delivered',
  );
  assert.deepEqual(normalizeEvents('normalized', [{ email: 'a@x.com', type: 'bounce' }]), [
    { email: 'a@x.com', type: 'bounce' },
  ]);
  assert.throws(() => normalizeEvents('mailchimp', []), /không hỗ trợ/);
});
