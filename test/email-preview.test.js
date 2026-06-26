// The manual flow's pre-send preview (FR-7) renders the EXACT email to a temp
// HTML file. These cover the two things that make the preview trustworthy:
//   • it carries the real subject + seller name (render-true), and
//   • image refs are file:// (viewable in a browser), NOT cid: (mail-client only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { writeEmailPreview } from '../dist/cli/email-preview.js';

const seller = {
  seller_name: 'Công ty TNHH An <Phát>',
  email: 'anphat@example.com',
  shop_url: 'https://shop.example.com/an-phat',
  slug: '__test_preview',
};
// 'touch' design ships in templates/; subject has no per-design file → uses this fallback.
const config = {
  mail: {
    template: 'touch',
    fromName: 'CMP Shop',
    subjectTemplate: 'Gian hàng của {{seller_name}}',
  },
};

test('writeEmailPreview: render-true (subject + seller name) and browser-viewable srcs', () => {
  const out = writeEmailPreview(seller, { config, shotPath: '/tmp/shot_an_phat.jpg' });
  try {
    const html = readFileSync(out, 'utf8');
    // Subject rendered with the seller name, and HTML-escaped (no raw < > from the name).
    assert.ok(
      html.includes('Gian hàng của Công ty TNHH An &lt;Phát&gt;'),
      'subject rendered + escaped',
    );
    assert.ok(html.includes('anphat@example.com'), 'recipient shown');
    // Browser preview must resolve images → file:// URLs, never cid: refs.
    assert.ok(html.includes('file://'), 'images point at file:// URLs');
    assert.ok(!html.includes('cid:'), 'no cid: refs leaked into the browser preview');
    // Clearly marked as not-yet-sent so it is never mistaken for a sent copy.
    assert.ok(html.includes('CHƯA gửi'), 'marked as a preview');
  } finally {
    rmSync(out, { force: true });
  }
});
