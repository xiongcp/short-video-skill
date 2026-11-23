// T01 / A01: environment doctor and the thinnest audible technical clip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { installFont, makeProject, realFont, runCli, writeJson, writeWav } from './helpers.mjs';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const sha256 = (path) => 'sha256:' + createHash('sha256').update(readFileSync(path)).digest('hex');

function probe(path, stream, entries) {
  const run = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', stream,
    '-show_entries', `stream=${entries}`, '-of', 'json', path], { encoding: 'utf8' });
  return JSON.parse(run.stdout).streams[0];
}

function decode(path, args) {
  return spawnSync('ffmpeg', ['-v', 'error', '-i', path, ...args, '-'], { maxBuffer: 1 << 30 }).stdout;
}

function preview(project, wav) {
  const request = writeJson(join(project, 'requests', 'preview.json'), { audio: wav });
  return runCli(['preview', '--project', project, '--request', request]);
}

const FONT = 'assets/fonts/caption-zh.ttc';

function doctor(project, extra = []) {
  const request = writeJson(join(project, 'requests', 'doctor.json'), {
    fonts: [{ id: 'caption-zh', path: FONT }],
  });
  return runCli(['doctor', '--project', project, '--request', request, ...extra]);
}

test('doctor reports a missing agreed font as a blocked caption capability', { skip: !realFont && 'no real font on this host' }, () => {
  const project = makeProject();
  const font = installFont(project, FONT);

  const ready = doctor(project);
  assert.equal(ready.code, 0, ready.stdout + ready.stderr);
  assert.equal(ready.json.capabilities.captions.status, 'READY');

  renameSync(font, font + '.moved');
  const missing = doctor(project);
  assert.equal(missing.code, 1, missing.stdout + missing.stderr);
  const captions = missing.json.capabilities.captions;
  assert.equal(captions.status, 'BLOCKED');
  assert.deepEqual(captions.missing_fonts, [{ id: 'caption-zh', path: FONT }]);
  const issue = missing.json.issues.find((item) => item.code === 'FONT_MISSING');
  assert.ok(issue, JSON.stringify(missing.json.issues));
  assert.equal(issue.capability, 'captions');
  assert.equal(issue.ref, 'caption-zh');
  // Audio and encoding are still reported when captions are blocked.
  assert.equal(missing.json.capabilities.audio_encode.status, 'READY');
  assert.equal(missing.json.capabilities.video_encode.status, 'READY');
});

test('preview turns a 12 s 48 kHz WAV into 360 decoded frames with sound and visible motion', { skip: !hasFfmpeg && 'FFmpeg/ffprobe unavailable' }, () => {
  const project = makeProject();
  const wav = writeWav(join(project, 'audio', 'tech.wav'), { seconds: 12 });
  const result = preview(project, 'audio/tech.wav');
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(result.json.status, 'PASS');
  const master = join(project, result.json.archive.master.path);

  const video = probe(master, 'v:0', 'codec_name,pix_fmt,width,height,r_frame_rate,nb_read_frames');
  assert.deepEqual(video, { codec_name: 'h264', width: 1920, height: 1080, pix_fmt: 'yuv420p', r_frame_rate: '30/1', nb_read_frames: '360' });
  const audio = probe(master, 'a:0', 'codec_name,sample_rate,channels');
  assert.deepEqual(audio, { codec_name: 'aac', sample_rate: '48000', channels: 2 });

  const pcm = decode(master, ['-vn', '-ac', '1', '-f', 'f32le']);
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
  const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  assert.ok(rms > 0.01, `audio RMS ${rms} is not audible`);

  const size = 1920 * 1080 * 3;
  const rgb = decode(master, ['-vf', String.raw`select=eq(n\,0)+eq(n\,180)+eq(n\,359)`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24']);
  assert.equal(rgb.length, 3 * size);
  const [first, middle, last] = [0, 1, 2].map((i) => rgb.subarray(i * size, (i + 1) * size));
  for (const [a, b, name] of [[first, middle, '0-180'], [middle, last, '180-359'], [first, last, '0-359']]) {
    assert.ok(!a.equals(b), `frames ${name} are identical`);
  }

  const archive = result.json.archive;
  assert.equal(archive.source_audio.sha256, sha256(wav));
  for (const item of [archive.master, archive.render_config, archive.probe, ...archive.frames]) {
    assert.ok(existsSync(join(project, item.path)), item.path);
    assert.equal(item.sha256, sha256(join(project, item.path)), item.path);
  }
  assert.deepEqual(archive.frames.map((item) => item.frame), [0, 180, 359]);
  assert.equal(result.json.character_fixture.original, false);
});

test('preview rejects a 44.1 kHz WAV before rendering', { skip: !hasFfmpeg && 'FFmpeg/ffprobe unavailable' }, () => {
  const project = makeProject();
  writeWav(join(project, 'audio', 'cd.wav'), { seconds: 1, rate: 44100 });
  const result = preview(project, 'audio/cd.wav');
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.equal(result.json.status, 'FAIL');
  assert.deepEqual(result.json.issues.map((item) => item.code), ['AUDIO_SAMPLE_RATE']);
  assert.equal(result.json.archive, undefined);
});
