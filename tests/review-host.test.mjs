import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { frameSvg, h264RoundTrip, pairSvg, silhouetteSvg } from '../tools/review-host.mjs';
import { pngSize } from './helpers/png.mjs';

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/assets/host/manifest.json'), 'utf8'));

const solidPng = (width, height, fill = '#20a5a3') =>
  new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${fill}"/></svg>`).render().asPng();

test('frameSvg renders a 1920x1080 host-left review frame and scales cleanly to 540p', () => {
  const half = frameSvg(manifest, { scale: 0.5 });
  assert.ok(half.includes('width="960" height="540" viewBox="0 0 1920 1080"'));
  assert.ok(half.includes('data-host="xiaoqing"'));
  assert.ok(frameSvg(manifest).includes('width="1920"'));
});

test('pairSvg scales both PNGs proportionally to the target height side by side', () => {
  const svg = pairSvg(
    { png: solidPng(100, 50, '#1f1f1f'), label: 'Before' },
    { png: solidPng(200, 50, '#20a5a3'), label: 'After' },
  );
  const images = [...svg.matchAll(/<image\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(images.length, 2);
  assert.ok(images.every((img) => img.includes('height="900"')));
  assert.ok(images[0].includes('width="1800"'));
  assert.ok(images[1].includes('width="3600"'));
  assert.ok(svg.includes('data:image/png;base64,'));
  assert.ok(svg.includes('>Before</text>') && svg.includes('>After</text>'));
});

test('h264RoundTrip returns false without creating output when ffmpeg is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'review-host-test-'));
  try {
    const input = join(dir, 'in.png');
    const output = join(dir, 'out.png');
    writeFileSync(input, solidPng(64, 64));
    assert.equal(h264RoundTrip(input, output, { ffmpeg: 'no-such-ffmpeg' }), false);
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('h264RoundTrip produces a 1920x1080 PNG when ffmpeg is available', (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg not available');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'review-host-test-'));
  try {
    const input = join(dir, 'frame.png');
    const output = join(dir, 'frame-h264.png');
    writeFileSync(input, new Resvg(frameSvg(manifest), { font: { loadSystemFonts: true, defaultFontFamily: 'Hiragino Sans GB' } }).render().asPng());
    assert.equal(h264RoundTrip(input, output), true);
    assert.deepEqual(pngSize(readFileSync(output)), { width: 1920, height: 1080 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('silhouetteSvg shows six moods at 540p with the scarf and markers inked black', () => {
  const svg = silhouetteSvg(manifest);
  assert.ok(svg.includes('width="960" height="270" viewBox="0 0 1920 540"'));
  assert.equal((svg.match(/data-host="xiaoqing"/g) ?? []).length, 6);
  assert.equal((svg.match(/data-part="ahoge"/g) ?? []).length, 6);
  for (const color of [manifest.ink.accent, ...Object.values(manifest.ink.markers)]) assert.ok(!svg.includes(color), color);
});
