import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  duckingGains,
  fitMusicToLength,
  loadUserMusic,
  MOOD_SPECS,
  schroederReverb,
  stereoRms,
  synthMusicBed,
} from '../skills/topic-to-video/scripts/lib/music.mjs';

const SR = 48000;
const db = (v) => 20 * Math.log10(v);
const rmsAt = (bed, fromSec, toSec) => stereoRms(bed.left, bed.right, Math.round(fromSec * SR), Math.round((toSec - fromSec) * SR));

test('four moods are defined', () => {
  assert.deepEqual(Object.keys(MOOD_SPECS), ['calm', 'playful', 'curious', 'upbeat']);
});

for (const mood of Object.keys(MOOD_SPECS)) {
  test(`${mood} bed has the requested length, is deterministic and fades in and out`, () => {
    const a = synthMusicBed(mood, { durationSec: 12, seed: 'x' });
    const b = synthMusicBed(mood, { durationSec: 12, seed: 'x' });
    assert.equal(a.left.length, 12 * SR);
    assert.equal(a.right.length, 12 * SR);
    assert.deepEqual(a.left, b.left);
    assert.ok(a.left.every(Number.isFinite) && a.right.every(Number.isFinite));
    assert.ok(stereoRms(a.left, a.right) > 0);
    assert.ok(rmsAt(a, 0, 0.1) < rmsAt(a, 2, 4) / 10, 'fade in');
    assert.equal(a.left.at(-1), 0);
    assert.equal(a.right.at(-1), 0);
    assert.ok(rmsAt(a, 11.5, 12) < rmsAt(a, 5, 7) / 4, 'fade out');
  });
}

test('moods sound different', () => {
  const calm = synthMusicBed('calm', { durationSec: 4, seed: 'x' });
  const upbeat = synthMusicBed('upbeat', { durationSec: 4, seed: 'x' });
  assert.notDeepEqual(calm.left, upbeat.left);
});

test('a section breath empties the bar it falls in', () => {
  const bar = (4 * 60) / MOOD_SPECS.playful.bpm;
  const at = bar * 3 + 0.1;
  const plain = synthMusicBed('playful', { durationSec: 16, seed: 'x' });
  const breath = synthMusicBed('playful', { durationSec: 16, seed: 'x', breathAtSec: [at] });
  const from = bar * 3 + 0.3;
  const to = bar * 4 - 0.1;
  assert.ok(db(rmsAt(breath, from, to)) <= db(rmsAt(plain, from, to)) - 1.5);
});

test('a very short video still fades in and out', () => {
  const bed = synthMusicBed('calm', { durationSec: 3, seed: 'x' });
  assert.equal(bed.left.length, 3 * SR);
  assert.equal(bed.left[0], 0);
  assert.equal(bed.left.at(-1), 0);
  assert.ok(bed.left.every(Number.isFinite));
});

test('the reverb rings for a while and dies within two seconds', () => {
  const left = new Float32Array(3 * SR);
  const right = new Float32Array(3 * SR);
  left[0] = 1;
  right[0] = 1;
  schroederReverb(left, right, { wet: 1 });
  assert.ok(Math.abs(left[Math.round(0.3 * SR) + 7]) > 0 || stereoRms(left, right, Math.round(0.3 * SR), 4800) > 0);
  assert.ok(db(stereoRms(left, right, 2 * SR, SR) + 1e-12) < -60);
});

test('two minutes of music synthesize in under three seconds', () => {
  const t0 = performance.now();
  synthMusicBed('upbeat', { durationSec: 120, seed: 'x', breathAtSec: [30, 60, 90] });
  const ms = performance.now() - t0;
  assert.ok(ms < 3000, `${ms.toFixed(0)} ms`);
});

const FLOOR = 10 ** (-6 / 20);
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('ducking starts 120 ms ahead of speech, holds 300 ms after it and releases over 500 ms', () => {
  const g = duckingGains([{ start: 48000, end: 96000 }], 192000);
  assert.equal(g.length, 192000);
  for (const [i, want] of [[0, 1], [42240, 1], [49440, FLOOR], [72000, FLOOR], [110400, FLOOR], [134400, 1], [191999, 1]]) {
    assert.ok(near(g[i], want), `g[${i}] = ${g[i]}, want ${want}`);
  }
  assert.ok(g[45000] < 1 && g[45000] > FLOOR);
  assert.ok(g[120000] < 1 && g[120000] > FLOOR);
});

test('a 200 ms pause between two sentences keeps the music ducked', () => {
  const g = duckingGains([{ start: 48000, end: 96000 }, { start: 96000 + 9600, end: 150000 }], 240000);
  let max = 0;
  for (let i = 96000; i < 96000 + 9600; i += 1) max = Math.max(max, g[i]);
  assert.ok(near(max, FLOOR), `max ${max}`);
});

const sine = (sec, hz = 220) => Float32Array.from({ length: Math.round(sec * SR) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / SR));
const maxJump = (x) => {
  let m = 0;
  for (let i = 1; i < x.length; i += 1) m = Math.max(m, Math.abs(x[i] - x[i - 1]));
  return m;
};

test('a short music file loops with crossfaded seams and fades out', () => {
  const src = sine(1.5);
  const out = fitMusicToLength(src, src, 5 * SR, { sampleRate: SR });
  assert.equal(out.left.length, 5 * SR);
  assert.equal(out.right.length, 5 * SR);
  assert.ok(maxJump(out.left) <= 0.2);
  assert.equal(out.left.at(-1), 0);
  assert.ok(stereoRms(out.left, out.right, 3 * SR, SR / 2) > 0.1, 'the loop keeps playing');
});

test('a long music file is trimmed and ends at zero', () => {
  const src = sine(10);
  const out = fitMusicToLength(src, src, 5 * SR, { sampleRate: SR });
  assert.equal(out.left.length, 5 * SR);
  assert.equal(out.left.at(-1), 0);
  assert.equal(out.right.at(-1), 0);
  assert.ok(maxJump(out.left) <= 0.2);
});

test('a half-second music file still fills the video without NaN', () => {
  const src = sine(0.5);
  const out = fitMusicToLength(src, src, 5 * SR, { sampleRate: SR });
  assert.equal(out.left.length, 5 * SR);
  assert.ok(out.left.every(Number.isFinite) && out.right.every(Number.isFinite));
  assert.ok(stereoRms(out.left, out.right, 2 * SR, SR / 2) > 0.1);
});

const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

test('user music in mono at 44.1 kHz is decoded to stereo 48 kHz at the video length', (t) => {
  if (!hasFfmpeg()) return t.skip('ffmpeg unavailable');
  const dir = mkdtempSync(join(tmpdir(), 'music-'));
  const file = join(dir, 'mono.wav');
  const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=2', '-ac', '1', file]);
  assert.equal(made.status, 0, String(made.stderr));
  const out = loadUserMusic(file, 3 * SR);
  assert.equal(out.left.length, 3 * SR);
  assert.equal(out.right.length, 3 * SR);
  assert.equal(out.silent, false);
  assert.ok(out.left.every(Number.isFinite));
});

test('silent user music is reported as silent', (t) => {
  if (!hasFfmpeg()) return t.skip('ffmpeg unavailable');
  const dir = mkdtempSync(join(tmpdir(), 'music-'));
  const file = join(dir, 'quiet.wav');
  const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '2', file]);
  assert.equal(made.status, 0, String(made.stderr));
  assert.equal(loadUserMusic(file, 2 * SR).silent, true);
});

test('a missing user music file throws with its path', () => {
  const missing = join(tmpdir(), 'no-such-music-file.mp3');
  assert.throws(() => loadUserMusic(missing, SR), (err) => err.message.includes(missing));
});
