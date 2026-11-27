import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderProject } from '../skills/topic-to-video/scripts/lib/encode.mjs';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { makeWavBuffer } from '../skills/topic-to-video/scripts/lib/mouth.mjs';
import { runQa } from '../skills/topic-to-video/scripts/lib/qa.mjs';
import { buildShotPlans, portraitLayoutIssues, shotCacheKey } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { panGains } from '../skills/topic-to-video/scripts/lib/sound.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { parseArgs } from '../skills/topic-to-video/scripts/render.mjs';
import { fakeTiming, manifest, sceneTour } from './helpers/golden.mjs';
import { pngSize } from './helpers/png.mjs';

const plansOf = (p, frame) => buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest, frame ? { frame } : undefined);

test('parseArgs reads --ratio', () => {
  assert.equal(parseArgs(['proj', '--ratio', '9:16', '--preview']).ratio, '9:16');
  assert.equal(parseArgs(['proj']).ratio, undefined);
});

test('16:9 cache keys do not change; portrait keys differ', () => {
  const p = sceneTour();
  const land = plansOf(p);
  const explicit = plansOf(p, FRAMES['16:9']);
  const port = plansOf(p, FRAMES['9:16']);
  const key = (pl, w, h) => shotCacheKey(pl, { fps: 60, width: w, height: h, motionBlur: false });
  land.forEach((pl, i) => {
    assert.equal(key(pl, 1920, 1080), key(explicit[i], 1920, 1080));
    assert.notEqual(key(pl, 1920, 1080), key(port[i], 1080, 1920));
  });
});

test('panGains is proportional to the frame width', () => {
  assert.deepEqual(panGains(540, 1080), panGains(960));
  for (const v of panGains(540, 1080)) assert.ok(Math.abs(v - 1) < 1e-9);
  assert.deepEqual(panGains(1080, 1080), panGains(1920));
  for (const v of panGains(960)) assert.ok(Math.abs(v - 1) < 1e-9);
});

test('portraitLayoutIssues flags crowded stages and text outside the safe box, nothing in landscape', () => {
  const p = sceneTour();
  p.shots[0].visual.data.objects = ['fridge', 'box', 'shop', 'table', 'chair'].map((prop) => ({ prop }));
  p.shots[0].cues = [];
  p.shots[1].visual.data.heading = '一个特别特别特别长的竖屏标题文字';
  const issues = portraitLayoutIssues(manifest, plansOf(p, FRAMES['9:16']));
  assert.ok(issues.some((i) => i.code === 'STAGE_CROWDED' && i.shotId === 'sh01'));
  assert.ok(issues.some((i) => i.code === 'SAFE_ZONE_TEXT' && i.shotId === 'sh02'));
  assert.deepEqual(portraitLayoutIssues(manifest, plansOf(p)), []);
});

test('--ratio 9:16 on a 16:9 project renders 540×960 into out/9x16 with a portrait cover, ASS and safe sheet', async (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg unavailable');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'svs-portrait-'));
  try {
    const p = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));
    p.voice = { provider: 'import' };
    mkdirSync(join(dir, 'audio'), { recursive: true });
    for (const key of ['s01-0', 's01-1']) {
      const sr = 48000;
      const samples = new Int16Array(Math.round(sr * 0.6));
      for (let i = 2000; i < samples.length - 2000; i += 1) samples[i] = Math.round(9000 * Math.sin((2 * Math.PI * 330 * i) / sr));
      writeFileSync(join(dir, `audio/${key}.wav`), makeWavBuffer(samples, sr));
    }
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));
    const res = await renderProject(dir, { preview: true, ratio: '9:16', workers: 2 });
    assert.equal(res.outDir, join(dir, 'out/9x16'));
    assert.ok(res.videoPath.endsWith(join('out', '9x16', 'preview.mp4')));
    assert.ok(!existsSync(join(dir, 'out/preview.mp4')), 'landscape location untouched');
    const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', res.videoPath], { encoding: 'utf8' }).stdout);
    const v = probe.streams.find((s) => s.codec_type === 'video');
    assert.deepEqual([v.width, v.height], [540, 960]);
    assert.deepEqual(pngSize(readFileSync(join(res.outDir, 'cover.png'))), { width: 1080, height: 1920 });
    assert.match(readFileSync(join(res.outDir, 'captions.ass'), 'utf8'), /PlayResX: 1080/);
    const qa = await runQa(dir, {
      videoPath: res.videoPath, outDir: res.outDir, frame: res.frame, expectedSize: { width: res.width, height: res.height },
      expectedFps: res.fps, timeline: res.timeline, shotPlans: res.shotPlans, qaByShot: res.qaByShot, audio: res.audio, layoutIssues: res.layoutIssues,
    });
    assert.ok(!qa.issues.some((i) => i.code === 'SIZE_MISMATCH'));
    assert.ok(existsSync(join(res.outDir, 'contact.png')) && existsSync(join(res.outDir, 'contact-safe.png')));
    assert.match(readFileSync(join(res.outDir, 'qa.md'), 'utf8'), /真机遮挡：`not_checked`/);
    const wrong = await runQa(dir, { videoPath: res.videoPath, outDir: res.outDir, frame: res.frame, expectedSize: { width: 1080, height: 1920 }, expectedFps: res.fps, timeline: res.timeline, shotPlans: res.shotPlans });
    assert.ok(wrong.issues.some((i) => i.code === 'SIZE_MISMATCH'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
