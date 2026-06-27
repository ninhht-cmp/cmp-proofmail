import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import {
  buildHtml,
  buildSubject,
  buildText,
  unknownSubjectVars,
  subjectTemplateFor,
} from '../dist/core/render/template.js';
import { paths, brandAssetSrcs } from '../dist/adapters/storage.js';

const seller = { seller_name: 'Mateco GmbH', shop_url: 'https://example.com/store/mateco' };
const assets = brandAssetSrcs();

test('buildSubject substitutes both variables', () => {
  const s = buildSubject(seller, {
    fromName: 'ComacPro JSC',
    subjectTemplate: '{{seller_name}} — {{from_name}}',
  });
  assert.equal(s, 'Mateco GmbH — ComacPro JSC');
});

test('buildSubject does NOT HTML-escape — a subject is a plain-text header', () => {
  // "A & B Co" must ship as-is in the subject, not "A &amp; B Co". Names with
  // & < > " are common, and a mail Subject header is never HTML.
  const s = buildSubject(
    { seller_name: 'A & B <Co>' },
    { fromName: 'X', subjectTemplate: 'Gian hàng của {{seller_name}}' },
  );
  assert.equal(s, 'Gian hàng của A & B <Co>');
});

test('unknownSubjectVars flags placeholders that would render blank', () => {
  // the real production typo this guard exists to catch
  assert.deepEqual(
    unknownSubjectVars('Partnership invitation for {{supplier_name}} — {{from_name}}'),
    ['supplier_name'],
  );
  assert.deepEqual(
    unknownSubjectVars('Partnership invitation for {{seller_name}} — {{from_name}}'),
    [],
  );
  assert.deepEqual(unknownSubjectVars('Static subject, no vars'), []);
});

test('buildHtml: no unresolved handlebars, dynamic fields + inline images present', () => {
  const html = buildHtml(seller, { imageSrc: 'cid:shopshot', assets });
  assert.equal(/{{[^}]+}}/.test(html), false, 'leftover {{...}}');
  assert.ok(html.includes('Mateco GmbH'), 'seller name');
  assert.ok(html.includes('href="https://example.com/store/mateco"'), 'CTA href');
  assert.ok(html.includes('src="cid:shopshot"'), 'inline screenshot');
  // The four brand-chrome images are referenced by their cid (no broken images).
  assert.ok(html.includes('src="cid:hdr"'), 'header image');
  assert.ok(html.includes('src="cid:svc"'), 'services image');
  assert.ok(html.includes('src="cid:adv"'), 'advantages image');
  assert.ok(html.includes('src="cid:ftr"'), 'footer image');
});

test('buildHtml: footer shows a clickable unsubscribe when one is provided', () => {
  const html = buildHtml(seller, {
    imageSrc: 'cid:shopshot',
    assets,
    unsubscribe: 'mailto:seller@comacpro.net?subject=unsubscribe',
  });
  assert.match(html, /href="mailto:seller@comacpro\.net\?subject(=|&#x3D;)unsubscribe"/);
  assert.ok(/>Unsubscribe<\/a>/.test(html), 'visible Unsubscribe link text');
});

test('buildHtml: no unsubscribe provided → no opt-out link, no leftover handlebars', () => {
  const html = buildHtml(seller, { imageSrc: 'cid:shopshot', assets });
  assert.ok(!html.includes('>Unsubscribe</a>'));
  assert.equal(/{{[^}]+}}/.test(html), false, 'no leftover {{...}}');
});

test('buildText renders the plain-text part from templates/<name>.txt.hbs', () => {
  const txt = buildText(seller, {
    fromName: 'ComacPro JSC',
    contact: 'seller@comacpro.net',
    template: 'touch',
  });
  assert.equal(/{{[^}]+}}/.test(txt), false, 'no leftover handlebars');
  assert.ok(txt.includes('Mateco GmbH'), 'seller name');
  assert.ok(txt.includes('https://example.com/store/mateco'), 'shop url');
  assert.ok(txt.includes('ComacPro JSC'), 'from name');
  assert.ok(/unsubscribe/i.test(txt), 'opt-out line present');
});

test('buildText falls back to a generic body when a template has no .txt twin', () => {
  const txt = buildText(seller, { fromName: 'X', contact: 'x@y.z', template: '__no_txt_twin__' });
  assert.ok(txt.includes('Mateco GmbH'));
  assert.ok(/unsubscribe/i.test(txt));
});

test('buildText does NOT HTML-escape — a CTA link with &/= stays a usable plain-text URL', () => {
  const shopUrl = 'https://example.com/store/mateco?utm_source=email&utm_campaign=touch';
  const txt = buildText(seller, { fromName: 'X', contact: 'x@y.z', shopUrl });
  assert.ok(txt.includes(shopUrl), 'plain-text link must be raw, not &amp;/&#x3D; escaped');
  assert.ok(!txt.includes('&amp;') && !txt.includes('&#x3D;'));
});

test('brandAssetSrcs: maps each brand image to its cid', () => {
  assert.equal(brandAssetSrcs().header, 'cid:hdr');
  assert.equal(brandAssetSrcs().footer, 'cid:ftr');
});

test('multi-template: a dropped-in templates/<name>.hbs renders by name', () => {
  const file = paths.template('__test_alt');
  writeFileSync(file, 'ALT {{seller_name}} → {{shop_url}} [{{assets.header}}]');
  try {
    const html = buildHtml(seller, { imageSrc: 'cid:x', assets, template: '__test_alt' });
    assert.equal(html, 'ALT Mateco GmbH → https://example.com/store/mateco [cid:hdr]');
  } finally {
    rmSync(file, { force: true });
  }
});

test('paths.template sanitizes the name (no traversal)', () => {
  assert.ok(paths.template('../../etc/passwd').endsWith('etcpasswd.hbs'));
  assert.ok(paths.template().endsWith('touch.hbs'));
});

test('subjectTemplateFor: falls back to MAIL_SUBJECT when a design ships no subject', () => {
  // 'touch' (default) has no .subject.hbs → uses the shared env subject verbatim.
  assert.equal(
    subjectTemplateFor('touch', 'ENV SUBJECT {{seller_name}}'),
    'ENV SUBJECT {{seller_name}}',
  );
});

test('subjectTemplateFor: a per-design subject overrides the fallback (newline stripped)', () => {
  const file = paths.subjectTemplate('__test_subj');
  // Trailing newline must not leak into the Subject header (would break it).
  writeFileSync(file, 'Re: hello {{seller_name}}\n');
  try {
    const src = subjectTemplateFor('__test_subj', 'ENV FALLBACK');
    assert.equal(src, 'Re: hello {{seller_name}}');
    // and it renders through buildSubject like any subject template
    assert.equal(
      buildSubject({ seller_name: 'Mateco' }, { fromName: 'X', subjectTemplate: src }),
      'Re: hello Mateco',
    );
  } finally {
    rmSync(file, { force: true });
  }
});

test('the shipped followup design carries its own subject (distinct from touch)', () => {
  const touchSubj = subjectTemplateFor('touch', 'DEFAULT');
  const followupSubj = subjectTemplateFor('followup', 'DEFAULT');
  assert.notEqual(followupSubj, touchSubj, 'followup must not reuse the touch subject');
  assert.ok(followupSubj.includes('{{seller_name}}'), 'still personalized');
});
