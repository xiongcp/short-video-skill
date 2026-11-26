import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FPS, manifest, soundFixture } from './helpers/sound-fixture.mjs';
import { speechIntervals } from '../skills/topic-to-video/scripts/lib/sound.mjs';
import {
  buildSoundtrack,
  duckingGains,
  fitMusicToLength,
  loadUserMusic,
  makeStereoWavBuffer,
  mixStems,
  MOOD_SPECS,
  schroederReverb,
  stereoRms,
  synthMusicBed,
  voiceReferenceDb,
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

test('mixStems scales the whole mix below 0.99 without changing the balance', () => {
  const voice = new Float32Array(100);
  const sfx = { left: new Float32Array(100), right: new Float32Array(100) };
  const music = { left: new Float32Array(100), right: new Float32Array(100) };
  voice[10] = 0.9;
  sfx.left[10] = 0.5;
  sfx.right[20] = 0.25;
  voice[20] = 0.5;
  const out = mixStems(voice, sfx, music);
  assert.ok(out.scale < 1);
  assert.ok(Math.max(...out.left.map(Math.abs), ...out.right.map(Math.abs)) <= 0.99 + 1e-6);
  assert.ok(Math.abs(out.left[10] - 1.4 * out.scale) < 1e-6);
  assert.ok(Math.abs(out.right[10] - 0.9 * out.scale) < 1e-6);
  assert.ok(Math.abs(out.right[20] / out.left[20] - 0.75 / 0.5) < 1e-6);
  assert.equal(mixStems(new Float32Array([0.5]), { left: new Float32Array(1), right: new Float32Array(1) }, { left: new Float32Array(1), right: new Float32Array(1) }).scale, 1);
});

test('makeStereoWavBuffer writes interleaved 16-bit stereo and clamps instead of wrapping', () => {
  const buf = makeStereoWavBuffer(new Float32Array([1.5, -1.5]), new Float32Array([0.5, 0]));
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.readUInt16LE(22), 2);
  assert.equal(buf.readUInt32LE(24), 48000);
  assert.equal(buf.readUInt16LE(34), 16);
  assert.equal(buf.readUInt32LE(40), 8);
  assert.equal(buf.readInt16LE(44), 32767);
  assert.equal(buf.readInt16LE(46), Math.round(0.5 * 32767));
  assert.equal(buf.readInt16LE(48), -32767);
  assert.equal(buf.length, 44 + 8);
});

const totalOf = (plans) => Math.round((plans.reduce((s, p) => s + p.frameCount, 0) * SR) / FPS);
const syntheticVoice = (plans, rmsDb = -20) => {
  const voice = new Float32Array(totalOf(plans));
  const amp = 10 ** (rmsDb / 20) * Math.SQRT2;
  for (const { start, end } of speechIntervals(plans, FPS)) {
    for (let i = start; i < Math.min(end, voice.length); i += 1) voice[i] = amp * Math.sin((2 * Math.PI * 220 * (i - start)) / SR);
  }
  return voice;
};
const buildFor = (project, allPlans, selectedPlans, voice) =>
  buildSoundtrack({ project, projectDir: tmpdir(), allPlans, selectedPlans, fps: FPS, voice, manifest, ffmpeg: 'ffmpeg' });

test('voiceReferenceDb measures speech spans only and reports missing voice as null', () => {
  const { plans } = soundFixture();
  const voice = syntheticVoice(plans);
  const ref = voiceReferenceDb(voice, speechIntervals(plans, FPS));
  assert.ok(Math.abs(ref + 20) < 0.5, String(ref));
  assert.equal(voiceReferenceDb(new Float32Array(voice.length), speechIntervals(plans, FPS)), null);
  assert.equal(voiceReferenceDb(voice, []), null);
});

test('buildSoundtrack puts the music 14 dB under the voice and ducks it 6 dB more while speaking', () => {
  const { project, plans } = soundFixture();
  const voice = syntheticVoice(plans);
  const track = buildFor(project, plans, plans, voice);
  const total = totalOf(plans);
  assert.equal(track.left.length, total);
  assert.equal(track.right.length, total);
  assert.ok(Math.abs(track.voiceRefDb + 20) < 0.5);
  assert.equal(track.voiceMissing, false);
  assert.equal(track.report.musicSource, 'synth:playful');
  assert.equal(track.report.musicLicense, null);
  assert.equal(track.report.sfxCounts.chime, 1);
  const g = duckingGains(track.intervals, total);
  const bed = track.stems.musicMid.map((v, i) => v / g[i]);
  let sum = 0;
  for (const v of bed) sum += v * v;
  assert.ok(Math.abs(db(Math.sqrt(sum / bed.length)) - (track.voiceRefDb - 14)) < 0.1, 'the bed sits at V - 14 dB');
  const mid = Math.round((track.intervals[1].start + track.intervals[1].end) / 2);
  assert.ok(Math.abs(g[mid] - FLOOR) < 1e-6, 'ducked by 6 dB mid-sentence');
  assert.ok(Math.abs(track.stems.musicMid[mid] - bed[mid] * FLOOR) < 1e-6);
  assert.ok(track.left.every(Number.isFinite) && track.right.every(Number.isFinite));
});

test('a silent voice falls back to V = -20 dBFS without NaN', () => {
  const { project, plans } = soundFixture();
  const track = buildFor(project, plans, plans, new Float32Array(totalOf(plans)));
  assert.equal(track.voiceMissing, true);
  assert.equal(track.voiceRefDb, -20);
  assert.ok(track.left.every(Number.isFinite) && track.right.every(Number.isFinite));
});

test('a --sample range plays the same stretch of music as the full render', () => {
  const { project, plans } = soundFixture();
  const full = buildFor(project, plans, plans, syntheticVoice(plans));
  const selected = plans.slice(1);
  const part = buildFor(project, plans, selected, syntheticVoice(selected));
  const offset = Math.round((plans[0].frameCount * SR) / FPS);
  const gFull = duckingGains(full.intervals, full.left.length);
  const gPart = duckingGains(part.intervals, part.left.length);
  assert.equal(part.left.length, totalOf(selected));
  for (let i = 0; i < part.left.length; i += 997) {
    const a = part.stems.musicMid[i] / gPart[i];
    const b = full.stems.musicMid[offset + i] / gFull[offset + i];
    assert.ok(Math.abs(a - b) < 1e-6, `sample ${i}: ${a} vs ${b}`);
  }
});

test('sound off leaves only the voice in the mix', () => {
  const { project, plans } = soundFixture();
  project.sound = { sfx: 'off', music: { mood: 'none' } };
  const voice = syntheticVoice(plans);
  const track = buildFor(project, plans, plans, voice);
  assert.equal(track.report.musicSource, null);
  assert.deepEqual(track.report.sfxCounts, {});
  assert.ok(track.stems.musicMid.every((v) => v === 0) && track.stems.sfxMid.every((v) => v === 0));
});
