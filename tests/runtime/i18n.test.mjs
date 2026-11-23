// Runtime internationalization: stable codes, localized messages, zh-CN default, catalog parity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeProject, runCli, writeJson } from './helpers.mjs';
import { CATALOGS, DEFAULT_LOCALE } from '../../runtime/i18n.ts';

const CJK = /[一-鿿]/;

function missingFontDoctor(extra) {
  const project = makeProject();
  const request = writeJson(join(project, 'doctor.json'), { fonts: [{ id: 'caption-zh', path: 'fonts/absent.ttc' }] });
  return runCli(['doctor', '--project', project, '--request', request, ...extra]);
}

test('issue codes stay stable while messages follow --lang', () => {
  const zh = missingFontDoctor(['--lang', 'zh-CN']);
  const en = missingFontDoctor(['--lang', 'en']);
  const zhIssue = zh.json.issues.find((item) => item.code === 'FONT_MISSING');
  const enIssue = en.json.issues.find((item) => item.code === 'FONT_MISSING');
  assert.equal(zh.json.locale, 'zh-CN');
  assert.equal(en.json.locale, 'en');
  assert.match(zhIssue.message, CJK);
  assert.doesNotMatch(enIssue.message, CJK);
  assert.match(enIssue.message, /caption-zh/);
});

test('Chinese is the default locale', () => {
  const result = missingFontDoctor([]);
  assert.equal(DEFAULT_LOCALE, 'zh-CN');
  assert.equal(result.json.locale, 'zh-CN');
});

test('an unsupported locale is a usage error', () => {
  const result = missingFontDoctor(['--lang', 'fr']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /LOCALE_UNSUPPORTED/);
});

test('zh-CN and en catalogs define the same non-empty keys', () => {
  assert.deepEqual(Object.keys(CATALOGS).sort(), ['en', 'zh-CN']);
  const keys = (locale) => Object.keys(CATALOGS[locale]).sort();
  assert.deepEqual(keys('en'), keys('zh-CN'));
  for (const locale of Object.keys(CATALOGS)) {
    for (const [key, text] of Object.entries(CATALOGS[locale])) assert.ok(text.trim(), `${locale}.${key}`);
  }
});
