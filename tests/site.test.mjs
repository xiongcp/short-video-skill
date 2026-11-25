import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LABELS, cheatsheetSvg, heroSvg, svgHash } from '../tools/export-host.mjs';
import { pngSize, pngText } from './helpers/png.mjs';

const ROOT = join(import.meta.dirname, '..');
const SITE = join(ROOT, 'site');
const page = join(SITE, 'index.html');
const html = existsSync(page) ? readFileSync(page, 'utf8') : '';
const attrs = (name) => [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1]);
const manifest = JSON.parse(readFileSync(join(ROOT, 'skills/topic-to-video/assets/host/manifest.json'), 'utf8'));

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

test('the host cheatsheet was drawn from the current rig and names every gesture, expression and prop', () => {
  const png = readFileSync(join(SITE, 'assets/host-cheatsheet.png'));
  const svg = cheatsheetSvg(manifest);
  assert.deepEqual(pngSize(png), { width: 1800, height: 1600 });
  assert.equal(pngText(png, 'svg-sha256'), svgHash(svg), 'rig.mjs or manifest.json changed: run npm run export-host');
  for (const name of [...Object.keys(manifest.poses), ...Object.keys(manifest.expressions), ...Object.keys(manifest.props)]) {
    assert.ok(svg.includes(`>${name}</text>`), name);
    assert.ok(svg.includes(`>${LABELS[name]}</text>`), `${name} has a Chinese caption`);
  }
});

test('the hero host is the inline SVG the export tool draws', () => {
  const block = html.match(/<!-- host:hero -->([\s\S]*?)<!-- \/host:hero -->/);
  assert.ok(block, 'site/index.html has a host:hero block');
  assert.equal(block[1], heroSvg(manifest), 'rig.mjs or manifest.json changed: run npm run export-host');
});

test('the site no longer shows the old host', () => {
  for (const name of ['body-idle.png', 'body-wave.png', 'faces.png']) assert.ok(!existsSync(join(SITE, 'assets', name)), name);
  assert.ok(!html.includes('晴'));
});

test('Pages workflow publishes the site folder', () => {
  const yml = readFileSync(join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  assert.match(yml, /path: site\n/);
  assert.match(yml, /actions\/deploy-pages@v\d+/);
});

test('site does not describe L1 lip sync as a current capability', () => {
  assert.ok(!html.includes('口型随音量开合'));
});
