import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { makeWavBuffer } from '../skills/topic-to-video/scripts/lib/mouth.mjs';
import { renderProject } from '../skills/topic-to-video/scripts/lib/encode.mjs';
import { analyzeFrameDiffs, analyzeMixLevels, checkAnchorSync, extractLumaFrames, runQa } from '../skills/topic-to-video/scripts/lib/qa.mjs';

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

test('runQa reports HOST_OBJECT_OVERLAP when qaByShot records objectOverlapFrames > 0, while clean stage renders have 0 overlap', async (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg unavailable');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'svs-qa-stage-'));
  try {
    const p = {
      ...minimal(),
      world: { metaphor: '缓存是桌上的文件', style: 'chalkboard', scene: 'office' },
      voice: { provider: 'import' },
      sections: [{ id: 's01', title: '舞台', text: '桌面文件就在眼前。' }],
      shots: [{
        id: 'sh01',
        section: 's01',
        sentences: [0],
        layout: 'stage',
        host: { expr: 'explaining', gesture: 'idle' },
        visual: {
          template: 'stage',
          data: {
            objects: [{ prop: 'doc', label: '缓存', at: 'mid-left' }],
          },
        },
        cues: [{ sentence: 0, do: 'move', target: 0 }],
        note: 'clean stage',
      }],
    };
    mkdirSync(join(dir, 'audio'), { recursive: true });
    const sr = 48000;
    const samples = new Int16Array(Math.round(sr * 1.2));
    for (let i = 1500; i < samples.length - 1500; i += 1) samples[i] = Math.round(8000 * Math.sin((2 * Math.PI * 330 * i) / sr));
    writeFileSync(join(dir, 'audio/s01-0.wav'), makeWavBuffer(samples, sr));
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));

    const rendered = await renderProject(dir, { preview: true, workers: 1 });
    assert.equal(rendered.qaByShot.sh01.objectOverlapFrames, 0, 'clean stage layout produces zero host-object overlap');
    const cleanQa = await runQa(dir, {
      videoPath: rendered.videoPath,
      expectedFps: rendered.fps,
      timeline: rendered.timeline,
      shotPlans: rendered.shotPlans,
      qaByShot: rendered.qaByShot,
    });
    assert.equal(cleanQa.ok, true, `unexpected QA issues: ${JSON.stringify(cleanQa.issues)}`);

    const overlapQa = await runQa(dir, {
      videoPath: rendered.videoPath,
      expectedFps: rendered.fps,
      timeline: rendered.timeline,
      shotPlans: rendered.shotPlans,
      qaByShot: { sh01: { objectOverlapFrames: 4 } },
    });
    const issue = overlapQa.issues.find((i) => i.code === 'HOST_OBJECT_OVERLAP');
    assert.ok(issue, `expected HOST_OBJECT_OVERLAP in ${JSON.stringify(overlapQa.issues)}`);
    assert.equal(issue.shotId, 'sh01');
    assert.equal(issue.frames, 4);
    assert.equal(overlapQa.ok, false);

    // Also verify encode.mjs records objectOverlapFrames > 0 when a crowded stage forces bodyBbox onto an object
    const crowdedDir = join(dir, 'crowded');
    mkdirSync(join(crowdedDir, 'audio'), { recursive: true });
    writeFileSync(join(crowdedDir, 'audio/s01-0.wav'), makeWavBuffer(samples.subarray(0, Math.round(sr * 0.5)), sr));
    const crowdedProj = {
      ...p,
      shots: [{
        ...p.shots[0],
        cues: [],
        visual: {
          template: 'stage',
          data: {
            objects: [
              { prop: 'shop', at: 'left', size: 'lg' },
              { prop: 'house', at: 'mid-left', size: 'lg' },
              { prop: 'car', at: 'center', size: 'lg' },
              { prop: 'truck', at: 'mid-right', size: 'lg' },
              { prop: 'whiteboard', at: 'right', size: 'lg' },
            ],
          },
        },
      }],
    };
    writeFileSync(join(crowdedDir, 'project.json'), JSON.stringify(crowdedProj, null, 2));
    const crowdedRendered = await renderProject(crowdedDir, { preview: true, workers: 1 });
    assert.ok(crowdedRendered.qaByShot.sh01.objectOverlapFrames > 0, `expected overlap frames > 0, got ${crowdedRendered.qaByShot.sh01.objectOverlapFrames}`);
    const crowdedQa = await runQa(crowdedDir, {
      videoPath: crowdedRendered.videoPath,
      expectedFps: crowdedRendered.fps,
      timeline: crowdedRendered.timeline,
      shotPlans: crowdedRendered.shotPlans,
      qaByShot: crowdedRendered.qaByShot,
    });
    assert.ok(crowdedQa.issues.some((i) => i.code === 'HOST_OBJECT_OVERLAP'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const MIX_SR = 48000;
const mixDb = (v) => 20 * Math.log10(v);
const toneAt = (n, hz, rmsDb, from = 0, to = n) => {
  const out = new Float32Array(n);
  const amp = 10 ** (rmsDb / 20) * Math.SQRT2;
  for (let i = from; i < to; i += 1) out[i] = amp * Math.sin((2 * Math.PI * hz * (i - from)) / MIX_SR);
  return out;
};
const noiseBurst = (n, rmsDb, from, len) => {
  const out = new Float32Array(n);
  let seed = 7;
  let sum = 0;
  for (let i = from; i < from + len; i += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    out[i] = seed / 1073741824 - 1;
    sum += out[i] * out[i];
  }
  const k = 10 ** (rmsDb / 20) / Math.sqrt(sum / len);
  for (let i = from; i < from + len; i += 1) out[i] *= k;
  return out;
};
const MIX_N = 3 * MIX_SR;
const SPEECH = [{ start: MIX_SR, end: 3 * MIX_SR }];
const mixFixture = ({ musicDb = -40, sfxDb = -34 } = {}) => ({
  voice: toneAt(MIX_N, 220, -20, SPEECH[0].start, SPEECH[0].end),
  musicMid: toneAt(MIX_N, 330, musicDb),
  sfxMid: noiseBurst(MIX_N, sfxDb, 96000 - 2400, 4800),
  intervals: SPEECH,
});

test('analyzeMixLevels passes music 20 dB and an effect 14 dB under the voice', () => {
  const res = analyzeMixLevels(mixFixture());
  assert.deepEqual(res.issues, []);
  assert.ok(Math.abs(res.musicMarginDb - 20) < 1, String(res.musicMarginDb));
  assert.ok(Math.abs(res.sfxMarginDb - 14) < 1, String(res.sfxMarginDb));
});

test('analyzeMixLevels reports music that is not ducked under speech once per sentence', () => {
  const res = analyzeMixLevels(mixFixture({ musicDb: -30 }));
  const music = res.issues.filter((i) => i.code === 'MUSIC_TOO_LOUD');
  assert.equal(music.length, 1);
  assert.ok(Math.abs(music[0].marginDb - 10) < 1);
  assert.match(music[0].message, /\d+\.\d 秒/);
  assert.ok(!res.issues.some((i) => i.code === 'SFX_OVER_VOICE'));
});

test('analyzeMixLevels reports an accent effect 10 dB too loud', () => {
  const res = analyzeMixLevels(mixFixture({ sfxDb: -24 }));
  const sfx = res.issues.filter((i) => i.code === 'SFX_OVER_VOICE');
  assert.equal(sfx.length, 1);
  assert.ok(Math.abs(sfx[0].atSec - 2) < 0.1, String(sfx[0].atSec));
  assert.ok(sfx[0].marginDb < 8);
});

test('analyzeMixLevels treats a 50 ms sentence as a single window', () => {
  const fx = mixFixture();
  const res = analyzeMixLevels({ ...fx, intervals: [{ start: MIX_SR, end: MIX_SR + 2400 }] });
  assert.ok(Number.isFinite(res.musicMarginDb) && Number.isFinite(res.sfxMarginDb));
  assert.equal(analyzeMixLevels({ ...fx, intervals: [] }).musicMarginDb, null);
});

const makeQaClip = (dir) => {
  const file = join(dir, 'out/clip.mp4');
  mkdirSync(join(dir, 'out'), { recursive: true });
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=320x180:r=60:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-shortest', file,
  ]);
  assert.equal(r.status, 0, String(r.stderr));
  return file;
};

test('runQa writes the sound section and the sound_mix review item', async (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg unavailable');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'svs-qa-sound-'));
  try {
    writeFileSync(join(dir, 'project.json'), JSON.stringify(minimal(), null, 2));
    const videoPath = makeQaClip(dir);

    const none = await runQa(dir, { videoPath, audio: null });
    assert.equal(none.audio, null);
    assert.equal(none.manual_review.sound_mix, 'not_checked');
    assert.match(readFileSync(join(dir, 'out/qa.md'), 'utf8'), /## 声音\n- 没有音效和音乐/);

    const missing = await runQa(dir, {
      videoPath,
      audio: {
        sfxCounts: { pop: 2, swish: 1 }, musicSource: 'synth:calm', musicLicense: null,
        voiceRefDb: -20, voiceMissing: true, levels: { musicMarginDb: null, sfxMarginDb: null, issues: [] },
      },
    });
    const md = readFileSync(join(dir, 'out/qa.md'), 'utf8');
    assert.equal(missing.audio.voice_missing, true);
    assert.deepEqual(missing.audio.sfx_counts, { pop: 2, swish: 1 });
    assert.equal(missing.audio.music_source, 'synth:calm');
    assert.ok(!missing.issues.some((i) => ['MUSIC_TOO_LOUD', 'SFX_OVER_VOICE'].includes(i.code)));
    assert.match(md, /音乐比人声低：没有人声，未检查/);
    assert.match(md, /音效：pop 2、swish 1（共 3 个）/);
    assert.match(md, /音乐：synth:calm（许可：内置合成，无版权问题）/);
    assert.match(md, /混音听感：`not_checked`/);
    const json = JSON.parse(readFileSync(join(dir, 'out/qa.json'), 'utf8'));
    assert.equal(json.manual_review.sound_mix, 'not_checked');
    assert.equal(json.audio.voice_missing, true);

    const loud = await runQa(dir, {
      videoPath,
      audio: {
        sfxCounts: {}, musicSource: 'music/bed.mp3', musicLicense: 'CC BY 4.0', musicWarning: 'MUSIC_SILENT',
        voiceRefDb: -20, voiceMissing: false,
        levels: { musicMarginDb: 10, sfxMarginDb: 12, issues: [{ code: 'MUSIC_TOO_LOUD', atSec: 1.2, marginDb: 10, message: '1.2 秒处音乐只比人声低 10.0 dB（下限 15 dB）' }] },
      },
    });
    const md2 = readFileSync(join(dir, 'out/qa.md'), 'utf8');
    assert.equal(loud.ok, false);
    assert.ok(loud.issues.some((i) => i.code === 'MUSIC_TOO_LOUD'));
    assert.ok(loud.warnings.some((w) => w.code === 'MUSIC_SILENT'));
    assert.match(md2, /音乐比人声低：最少 10\.0 dB（下限 15 dB）/);
    assert.match(md2, /音乐：music\/bed\.mp3（许可：CC BY 4\.0）/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('extractLumaFrames scales portrait to 90×160 and landscape to 160×90, and runQa passes frame and guards ratio', async (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg unavailable');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'svs-qa-luma-'));
  try {
    const makeHalfClip = (name, halfW, h) => {
      const file = join(dir, name);
      const r = spawnSync('ffmpeg', [
        '-v', 'error', '-y',
        '-filter_complex', `color=c=white:s=${halfW}x${h}:r=30:d=0.1[a];color=c=black:s=${halfW}x${h}:r=30:d=0.1[b];[a][b]hstack,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709`,
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=0.1',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
        '-c:a', 'aac', '-shortest', file,
      ]);
      assert.equal(r.status, 0, String(r.stderr));
      return file;
    };
    const portMp4 = makeHalfClip('port.mp4', 90, 320);
    const landMp4 = makeHalfClip('land.mp4', 160, 180);

    const pf = extractLumaFrames(portMp4, 'ffmpeg', FRAMES['9:16']);
    assert.ok(pf.length >= 2);
    assert.equal(pf[0].length, 90 * 160);
    assert.ok(pf[0][40] > 200 && pf[0][50] < 40 && pf[0][95] > 200, `portrait stride should be 90: [40]=${pf[0][40]} [50]=${pf[0][50]} [95]=${pf[0][95]}`);

    const lf = extractLumaFrames(landMp4);
    assert.ok(lf.length >= 2);
    assert.equal(lf[0].length, 160 * 90);
    assert.ok(lf[0][50] > 200 && lf[0][95] < 40 && lf[0][165] > 200, `landscape stride should be 160: [50]=${lf[0][50]} [95]=${lf[0][95]} [165]=${lf[0][165]}`);

    const logFile = join(dir, 'ffmpeg.log');
    const wrapper = join(dir, 'wrap-ffmpeg.sh');
    writeFileSync(wrapper, `#!/bin/sh\necho "$*" >> "${logFile}"\nexec ffmpeg "$@"\n`);
    chmodSync(wrapper, 0o755);

    const p = minimal();
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));
    await runQa(dir, { videoPath: portMp4, outDir: join(dir, 'out-p'), frame: FRAMES['9:16'], expectedFps: 30, ffmpeg: wrapper });
    assert.match(readFileSync(logFile, 'utf8'), /scale=90:160,format=gray/);

    writeFileSync(logFile, '');
    p.settings.ratio = 'constructor';
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));
    const protoQa = await runQa(dir, { videoPath: landMp4, outDir: join(dir, 'out-proto'), expectedFps: 30, ffmpeg: wrapper });
    assert.equal(protoQa.ok, true, JSON.stringify(protoQa.issues));
    assert.ok(!existsSync(join(dir, 'out-proto/contact-safe.png')));
    assert.match(readFileSync(logFile, 'utf8'), /scale=160:90,format=gray/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
