import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOOD_SPECS, schroederReverb, stereoRms, synthMusicBed } from '../skills/topic-to-video/scripts/lib/music.mjs';

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
