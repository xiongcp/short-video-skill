import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { makeWavBuffer } from '../skills/topic-to-video/scripts/lib/mouth.mjs';
import { buildShotPlans, evaluateFrame, shotCacheKey } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildChapters, buildSubtitlesAss, buildSubtitlesSrt, renderProject } from '../skills/topic-to-video/scripts/lib/encode.mjs';

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/assets/host/manifest.json'), 'utf8'));
const minimal = () => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));

test('scene chains host continuity across shots, computes morph/layout transitions, and builds frame-number-free cache keys', () => {
  const p = minimal();
  p.shots[0].visual = { template: 'flow', data: { nodes: ['阳光', '空气'] } };
  p.shots[1].visual = { template: 'flow', data: { nodes: ['空气', '散射'] } };
  p.shots[1].cues = [{ sentence: 1, do: 'reveal', target: 1 }];
  const timing = {
    's01-0': { file: 'audio/s01-0.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'aaa' },
    's01-1': { file: 'audio/s01-1.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'bbb' },
  };
  const tl = buildTimeline(p, timing, 60);
  const plans = buildShotPlans(p, tl, manifest);
  assert.equal(plans.length, 2);
  // Shot 1 transitions from host-left -> full and shares element "空气"
  assert.equal(plans[1].transition.kind, 'morph');
  assert.equal(plans[1].transition.layoutSwitch, 'host-left->full');
  const early = evaluateFrame(manifest, plans[1], 0.15);
  assert.ok(!early.vectorSvg.includes('<text'), 'vectorSvg stays text-free for fast resvg');
  assert.ok(early.vectorSvg.includes('data-host="xiaoqing"'), 'host trots out during layout switch');
  assert.equal(early.isFastMotion, true);

  // Cache key of shot 1 does NOT depend on shot 0's duration (only prevEndState + shot 1's own audio hashes)
  const keyA = shotCacheKey(plans[1], { fps: 60, width: 1920, height: 1080, motionBlur: false });
  const tl2 = buildTimeline(p, { ...timing, 's01-0': { ...timing['s01-0'], duration_ms: 2500 } }, 60);
  const plans2 = buildShotPlans(p, tl2, manifest);
  const keyB = shotCacheKey(plans2[1], { fps: 60, width: 1920, height: 1080, motionBlur: false });
  assert.equal(keyA, keyB, 'later shot cache key is invariant to earlier shot duration');
});

test('subtitles (SRT + ASS with keyword highlight) and chapters are generated accurately', () => {
  const p = minimal();
  p.shots[1].cues[0].at = '阳光';
  const timing = {
    's01-0': { file: 'audio/s01-0.wav', duration_ms: 1500, speech: [0, 1500], source: 'estimate', words: [] },
    's01-1': { file: 'audio/s01-1.wav', duration_ms: 1500, speech: [0, 1500], source: 'estimate', words: [] },
  };
  const tl = buildTimeline(p, timing, 60);
  const srt = buildSubtitlesSrt(p, tl);
  const ass = buildSubtitlesAss(p, tl);
  const chapters = buildChapters(p, tl);
  assert.ok(srt.includes('天空为什么是蓝的？'));
  assert.ok(srt.includes('答案藏在阳光里。'));
  assert.ok(ass.includes('{\\c&HA3A520&}阳光{\\r}'), 'ASS preserves keyword color highlight');
  assert.ok(chapters.includes('00:00 开场'));
});

test('renderProject renders a valid 60fps BT.709 MP4, cover, captions and chapters end-to-end (smoke test)', async (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg unavailable');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'svs-render-smoke-'));
  try {
    const p = minimal();
    p.settings.fps = 60;
    p.voice = { provider: 'import' };
    mkdirSync(join(dir, 'audio'), { recursive: true });
    // Two 0.6s 48kHz speech-like WAVs
    for (const [key, freq] of [['s01-0', 320], ['s01-1', 440]]) {
      const sr = 48000;
      const samples = new Int16Array(Math.round(sr * 0.6));
      for (let i = 2000; i < samples.length - 2000; i += 1) {
        samples[i] = Math.round(9000 * Math.sin((2 * Math.PI * freq * i) / sr));
      }
      writeFileSync(join(dir, `audio/${key}.wav`), makeWavBuffer(samples, sr));
    }
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));

    // Pass a relative projectDir to verify FFmpeg concat handles relative paths cleanly
    const relDir = relative(process.cwd(), dir);
    const res = await renderProject(relDir, { preview: true, workers: 2, runQa: false });
    assert.ok(existsSync(res.videoPath), 'preview.mp4 created');
    assert.ok(existsSync(join(dir, 'out/captions.srt')));
    assert.ok(existsSync(join(dir, 'out/captions.ass')));
    assert.ok(existsSync(join(dir, 'out/cover.png')));
    assert.ok(existsSync(join(dir, 'out/chapters.txt')));

    const probe = JSON.parse(spawnSync('ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', res.videoPath,
    ], { encoding: 'utf8' }).stdout);
    const v = probe.streams.find((s) => s.codec_type === 'video');
    const a = probe.streams.find((s) => s.codec_type === 'audio');
    assert.equal(v.width, 960);
    assert.equal(v.height, 540);
    assert.equal(v.r_frame_rate, '30/1');
    assert.equal(v.pix_fmt, 'yuv420p');
    assert.equal(v.color_space, 'bt709');
    assert.equal(a.sample_rate, '48000');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
