// Covers the per-design selection added to the CLI: discovering designs
// (listTemplates) and the (list, design) → campaign-id rule that lets the same
// seller be mailed once per design (e.g. 'touch' then 'followup') without ever
// double-sending the SAME design. Pure logic — no prompts involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import {
  paths,
  listTemplates,
  createCampaignStore,
  createSuppressionStore,
} from '../dist/adapters/storage.js';
import { campaignIdFor, DEFAULT_TEMPLATE } from '../dist/cli/template-picker.js';
import { remainingSellers } from '../dist/cli/seller-picker.js';

test('listTemplates: lists every <name>.hbs, excludes the .txt.hbs twins', () => {
  const names = listTemplates();
  // The two shipped designs are always present.
  assert.ok(names.includes('touch'), 'touch design (first-contact)');
  assert.ok(names.includes('followup'), 'followup design');
  // A .txt.hbs / .subject.hbs is a PART of a design, NOT a separate design.
  assert.ok(!names.some((n) => n.endsWith('.txt')), 'no .txt twins leaked in');
  assert.ok(!names.some((n) => n.endsWith('.subject')), 'no .subject parts leaked in');
  // The shipped followup.subject.hbs must not show up as a "followup.subject" design.
  assert.ok(!names.includes('followup.subject'), 'subject file not mistaken for a design');
  // The default design sorts first so it's the natural pick.
  assert.equal(names[0], 'touch');
});

test('listTemplates: picks up a dropped-in design, drops it when removed', () => {
  const file = paths.template('__test_design');
  writeFileSync(file, 'X {{seller_name}}');
  try {
    assert.ok(listTemplates().includes('__test_design'), 'new design discovered');
  } finally {
    rmSync(file, { force: true });
  }
  assert.ok(!listTemplates().includes('__test_design'), 'gone after removal');
});

test('campaignIdFor: default design keeps the legacy un-suffixed id', () => {
  // Back-compat: existing campaign-<file>.json (and its no-double-send guard)
  // must keep working for the default design ('touch') after this feature.
  assert.equal(DEFAULT_TEMPLATE, 'touch');
  assert.equal(campaignIdFor('danh-sach', DEFAULT_TEMPLATE), 'danh-sach');
  assert.equal(campaignIdFor('danh-sach', 'touch'), 'danh-sach');
});

test('campaignIdFor: a non-default design gets its own suffixed id', () => {
  // followup is a separate campaign → the same sellers re-open for it, and its
  // sent-state can never collide with the initial touch campaign.
  assert.equal(campaignIdFor('danh-sach', 'followup'), 'danh-sach__followup');
  assert.notEqual(campaignIdFor('danh-sach', 'followup'), campaignIdFor('danh-sach', 'touch'));
});

// The end-to-end guarantee behind prompt-free design selection: a seller mailed under the
// 'touch' design disappears from that design's remaining list, yet is still
// mailable under 'followup' — and once followed up, drops off there too.
test('per-design scoping: a sent touch re-opens for the followup design', () => {
  const BASE = '__test_seq';
  const touchStore = createCampaignStore(campaignIdFor(BASE, 'touch'));
  const followupStore = createCampaignStore(campaignIdFor(BASE, 'followup'));
  const suppFile = paths.report('__test_seq_supp'); // a throwaway path, no real suppressions
  const suppression = createSuppressionStore(suppFile);
  const cleanup = () => {
    rmSync(touchStore.file, { force: true });
    rmSync(followupStore.file, { force: true });
    rmSync(paths.report(campaignIdFor(BASE, 'touch')), { force: true });
    rmSync(paths.report(campaignIdFor(BASE, 'followup')), { force: true });
    rmSync(suppFile, { force: true });
  };
  cleanup();
  try {
    const sellers = [
      { seller_name: 'A', email: 'a@x.com', phone: '' },
      { seller_name: 'B', email: 'b@x.com', phone: '' },
    ];

    // Send the initial 'touch' to A.
    touchStore.markSent('a@x.com', { attempts: 1 });

    // A is hidden in the touch design, B still pending there.
    assert.deepEqual(
      remainingSellers(sellers, touchStore, suppression).map((s) => s.email),
      ['b@x.com'],
    );
    // But the followup design sees BOTH — A re-opens for the followup.
    assert.deepEqual(
      remainingSellers(sellers, followupStore, suppression).map((s) => s.email),
      ['a@x.com', 'b@x.com'],
    );

    // Follow up A → A drops off the followup list, independently of the touch one.
    followupStore.markSent('a@x.com', { attempts: 1 });
    assert.deepEqual(
      remainingSellers(sellers, followupStore, suppression).map((s) => s.email),
      ['b@x.com'],
    );
    // The touch design's state is untouched by the followup send.
    assert.deepEqual([...touchStore.loadSent()], ['a@x.com']);
  } finally {
    cleanup();
  }
});
