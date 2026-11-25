import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SITE = join(ROOT, 'site');
const page = join(SITE, 'index.html');
const html = existsSync(page) ? readFileSync(page, 'utf8') : '';
const attrs = (name) => [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1]);
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

test('site page is Chinese and says L1 is still in development', () => {
  assert.match(html, /<html lang="zh-CN">/);
  assert.ok(html.includes('开发中'));
});

test('site local links and images resolve relative to site/', () => {
  const css = [...html.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);
  const local = [...attrs('href'), ...attrs('src'), ...css].filter((u) => !/^(https?:|mailto:|data:|#)/.test(u));
  assert.ok(local.length > 0);
  for (const u of local) {
    assert.ok(!u.startsWith('/'), `${u} must be relative so the page works under /short-video-skill/`);
    assert.ok(existsSync(join(SITE, decodeURI(u))), `${u} is missing`);
  }
});

test('in-page anchors point at existing ids', () => {
  const ids = new Set(attrs('id'));
  const anchors = attrs('href').filter((h) => h.startsWith('#') && h.length > 1);
  assert.ok(anchors.length > 0);
  for (const href of anchors) assert.ok(ids.has(href.slice(1)), href);
});

test('host images on the site match the skill assets', () => {
  for (const name of ['body-idle.png', 'body-wave.png', 'faces.png']) {
    assert.equal(sha(join(SITE, 'assets', name)), sha(join(ROOT, 'skills/topic-to-video/assets/host', name)), name);
  }
});

test('Pages workflow publishes the site folder', () => {
  const yml = readFileSync(join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  assert.match(yml, /path: site\n/);
  assert.match(yml, /actions\/deploy-pages@v\d+/);
});

test('site does not describe L1 lip sync as a current capability', () => {
  assert.ok(!html.includes('口型随音量开合'));
});
