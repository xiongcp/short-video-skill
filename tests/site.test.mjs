import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LABELS, cheatsheetSvg, heroSvg, svgHash } from '../tools/export-host.mjs';
import { pngSize, pngText } from './helpers/png.mjs';

const ROOT = join(import.meta.dirname, '..');
const SITE = join(ROOT, 'site');
const page = join(SITE, 'index.html');
const html = existsSync(page) ? readFileSync(page, 'utf8') : '';
const attrs = (name) => [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1]);
const manifest = JSON.parse(readFileSync(join(ROOT, 'skills/topic-to-video/assets/host/manifest.json'), 'utf8'));

test('site page is Chinese and describes L0 and L1 availability', () => {
  assert.match(html, /<html lang="zh-CN">/);
  assert.ok(html.includes('L0 文本包'));
  assert.ok(html.includes('L1 本地成片'));
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

test('the host cheatsheet was drawn from the current rig and names every gesture, expression, prop and outfit', () => {
  const png = readFileSync(join(SITE, 'assets/host-cheatsheet.png'));
  const svg = cheatsheetSvg(manifest);
  assert.deepEqual(pngSize(png), { width: 1800, height: 2480 });
  assert.equal(pngText(png, 'svg-sha256'), svgHash(svg), 'rig.mjs or manifest.json changed: run npm run export-host');
  for (const name of [...Object.keys(manifest.poses), ...Object.keys(manifest.expressions), ...Object.keys(manifest.props), ...Object.keys(manifest.outfits)]) {
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

test('site documents cross-agent install paths for agy, Claude Code and Codex', () => {
  assert.ok(html.includes('Claude Code') && html.includes('Codex') && html.includes('agy'));
});

test('site says the voice has 8 male and female presets to audition', () => {
  assert.ok(html.includes('男女声 8 个人设，可以先试听'));
});

test('the site describes the 呆毛 and shows the taller cheatsheet', () => {
  assert.ok(html.includes('呆毛'));
  assert.ok(html.includes('17 个动作、9 种表情、6 件手持道具和 4 套服装'));
  assert.match(html, /host-cheatsheet\.png" alt="[^"]*" width="1800" height="2480"/);
});

test('the site describes style packs, hand-drawn scenes, 72 built-in props and stage layout', () => {
  assert.ok(html.includes('风格包'));
  assert.ok(html.includes('场景'));
  assert.ok(html.includes('72 个内置'));
  assert.ok(!/60 (个)?(内置|手绘)/.test(html));
  assert.ok(html.includes('stage'));
});

const section = (id) => html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`))?.[0] ?? '';

test('the site leads with one-line video and embeds the real demo under 8 MB with a poster', () => {
  assert.ok(html.includes('说一句话，出一条中文知识解说视频'));
  const video = html.match(/<video\b[^>]*>/)?.[0];
  assert.ok(video, 'the page has a <video>');
  const src = video.match(/\ssrc="([^"]+)"/)?.[1] ?? html.match(/<source\s[^>]*src="([^"]+)"/)?.[1];
  const poster = video.match(/\sposter="([^"]+)"/)?.[1];
  assert.ok(src && poster, 'video has src and poster');
  assert.ok(existsSync(join(SITE, src)) && statSync(join(SITE, src)).size <= 8 * 1024 * 1024, `${src} exists and is at most 8 MB`);
  assert.ok(existsSync(join(SITE, poster)) && statSync(join(SITE, poster)).size <= 200 * 1024, `${poster} exists and is at most 200 KB`);
  assert.match(video, /controls/);
  assert.match(video, /playsinline/);
});

test('the site has Open Graph tags with a 1200x630 image', () => {
  for (const tag of ['og:title', 'og:description', 'og:image', 'twitter:card']) assert.ok(html.includes(`"${tag}"`), tag);
  assert.deepEqual(pngSize(readFileSync(join(SITE, 'assets/og.png'))), { width: 1200, height: 630 });
});

test('the install section verifies with doctor.mjs and the FAQ says edge-tts needs a network; no pre-release wording', () => {
  assert.ok(section('install').includes('doctor.mjs'));
  assert.ok(section('faq').includes('需要联网'));
  assert.ok(!html.includes('首版只做 16:9'));
  assert.ok(!html.includes('发布前实测后更新'));
  assert.ok(!html.includes('进行中'));
});

test('the inline host SVG now sits in the host section', () => {
  assert.ok(section('host').includes('<!-- host:hero -->'));
});

test('the site describes stage interactions, state/send and the upgraded fridge-supermarket example', () => {
  assert.ok(html.includes('同台互动'));
  assert.ok(html.includes('state') && html.includes('send'));
  assert.ok(html.includes('冰箱') && html.includes('超市'));
});
