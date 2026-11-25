import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeWavBuffer } from '../skills/topic-to-video/scripts/lib/mouth.mjs';
import { renderProject } from '../skills/topic-to-video/scripts/lib/encode.mjs';
import { analyzeFrameDiffs, checkAnchorSync, runQa } from '../skills/topic-to-video/scripts/lib/qa.mjs';

const minimal = () => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));

test('analyzeFrameDiffs catches unplanned jumps and >=3 identical freeze frames inside motion windows', () => {
  const w = 160;
  const h = 90;
  const frame = (val) => Buffer.alloc(w * h, val);
  // Smooth ramp 10, 12, 14, then sudden jump to 200 (unplanned!), then 4 identical frames during motion
  const frames = [frame(10), frame(12), frame(14), frame(200), frame(200), frame(200), frame(200), frame(202)];
  const res = analyzeFrameDiffs(frames, { cutFrames: new Set([0]), motionFrames: new Set([3, 4, 5, 6]) });
  assert.ok(res.jumps.some((j) => j.frame === 3 && j.mad > 12), 'caught unplanned jump at frame 3');
  assert.ok(res.freezes.some((f) => f.startFrame === 3 && f.length >= 3), 'caught freeze of >=3 identical frames');

  // If frame 3 is an intentional cut, it is NOT reported as an unplanned jump
  const planned = analyzeFrameDiffs(frames, { cutFrames: new Set([0, 3]), motionFrames: new Set() });
  assert.equal(planned.jumps.length, 0);
});

test('checkAnchorSync catches a 2-frame sync error and passes within 1 frame', () => {
  const cues = [
    { shotId: 'sh01', do: 'reveal', at: '三零四', anchorMs: 1000, leadMs: 150, actualMs: 850, source: 'provider' },
    { shotId: 'sh02', do: 'highlight', at: '缓存', anchorMs: 2000, leadMs: 0, actualMs: 2040, source: 'provider' }, // 2.4 frames off at 60fps
  ];
  const issues = checkAnchorSync(cues, 60);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'SYNC_DRIFT');
  assert.equal(issues[0].shotId, 'sh02');
});

test('runQa catches BT.601 color, host occlusion and rushed moves, and passes a clean render with contact sheet', async (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg unavailable');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'svs-qa-test-'));
  try {
    const p = minimal();
    p.voice = { provider: 'import' };
    mkdirSync(join(dir, 'audio'), { recursive: true });
    for (const key of ['s01-0', 's01-1']) {
      const sr = 48000;
      const samples = new Int16Array(Math.round(sr * 0.5));
      for (let i = 1500; i < samples.length - 1500; i += 1) samples[i] = Math.round(8000 * Math.sin((2 * Math.PI * 330 * i) / sr));
      writeFileSync(join(dir, `audio/${key}.wav`), makeWavBuffer(samples, sr));
    }
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));

    const rendered = await renderProject(dir, { preview: true, workers: 2 });
    const cleanQa = await runQa(dir, {
      videoPath: rendered.videoPath,
      expectedFps: rendered.fps,
      timeline: rendered.timeline,
      shotPlans: rendered.shotPlans,
      qaByShot: rendered.qaByShot,
    });
    assert.equal(cleanQa.ok, true, `unexpected QA issues: ${JSON.stringify(cleanQa.issues)}`);
    assert.ok(existsSync(join(dir, 'out/qa.json')));
    assert.ok(existsSync(join(dir, 'out/qa.md')));
    assert.ok(existsSync(join(dir, 'out/contact.png')));
    assert.ok(readFileSync(join(dir, 'out/qa.md'), 'utf8').includes('not_checked'));

    // Deliberate bad BT.601 video + synthetic occlusion & rushed move metadata
    const badMp4 = join(dir, 'out/bad-bt601.mp4');
    spawnSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', rendered.videoPath,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'smpte170m',
      '-c:a', 'copy', badMp4,
    ]);
    const badQa = await runQa(dir, {
      videoPath: badMp4,
      expectedFps: rendered.fps,
      timeline: rendered.timeline,
      shotPlans: rendered.shotPlans,
      qaByShot: { sh01: { rushedMove: true, occludedFrames: 5 } },
    });
    const codes = badQa.issues.map((i) => i.code);
    assert.ok(codes.includes('COLOR_NOT_BT709'), `expected COLOR_NOT_BT709 in ${codes}`);
    assert.ok(codes.includes('HOST_OCCLUSION'), `expected HOST_OCCLUSION in ${codes}`);
    assert.ok(codes.includes('RUSHED_MOVE'), `expected RUSHED_MOVE in ${codes}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
