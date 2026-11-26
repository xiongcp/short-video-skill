import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pitchToEdge, resolveVoice, sentenceHash, synthesizeProject } from '../skills/topic-to-video/scripts/lib/tts.mjs';

const minimal = () => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));
const EDGE = 'edge-tts --voice {voice} --rate={rate} --pitch={pitch} --text {text} --write-media {out} --write-subtitles {sub}';

// A stand-in for edge-tts: logs the flags it got as one JSON line to argv[2], then writes a 0.5 s 48 kHz WAV with
// speech from 0.05 s to 0.45 s and a one-cue VTT. Its file name contains "edge-tts", so a command running it counts
// as an edge-tts command; it writes WAV, so tts.mjs needs no FFmpeg for it.
const FAKE_EDGE = `
import { appendFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(3);
const flag = (name) => args[args.indexOf(name) + 1];
const eq = (name) => args.find((a) => a.startsWith(name + '='))?.slice(name.length + 1);
appendFileSync(process.argv[2], JSON.stringify({ voice: flag('--voice'), rate: eq('--rate'), pitch: eq('--pitch'), text: flag('--text') }) + '\\n');
const sr = 48000, n = 24000;
const buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
for (let i = 2400; i < 21600; i++) buf.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 300 * i / sr)), 44 + i * 2);
writeFileSync(flag('--write-media'), buf);
writeFileSync(flag('--write-subtitles'), 'WEBVTT\\n\\n00:00:00.050 --> 00:00:00.450\\n' + flag('--text') + '\\n');
`;

/** A scratch project folder with the fake edge-tts; calls() lists what each run of it received, in order. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'svs-voice-'));
  const fake = join(dir, 'fake-edge-tts.mjs');
  const log = join(dir, 'calls.jsonl');
  writeFileSync(fake, FAKE_EDGE);
  const command = `${process.execPath} ${fake} ${log} ${EDGE.slice('edge-tts '.length)}`;
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []);
  return { dir, command, calls };
}

test('resolveVoice: a preset supplies voice and speed, explicit fields win, and no preset keeps the old defaults', () => {
  assert.deepEqual(resolveVoice({ provider: 'command', preset: 'male-sunny' }), { voice: 'zh-CN-YunxiNeural', speed: 0.92, rate: '-8%', pitch: '+0Hz' });
  assert.deepEqual(resolveVoice({ provider: 'command', preset: 'male-sunny', voice: 'zh-CN-YunjianNeural', speed: 1.1, pitch: -3 }),
    { voice: 'zh-CN-YunjianNeural', speed: 1.1, rate: '+10%', pitch: '-3Hz' });
  assert.deepEqual(resolveVoice({ provider: 'command' }), { voice: 'zh-CN-XiaoxiaoNeural', speed: 1, rate: '-4%', pitch: '+0Hz' });
  assert.throws(() => resolveVoice({ provider: 'command', preset: 'male-deep' }), /male-deep/);
  assert.deepEqual([0, 5, -3, -20].map((hz) => pitchToEdge(hz)), ['+0Hz', '+5Hz', '-3Hz', '-20Hz']);
});

test('the command gets the preset voice, rate and pitch; a new preset re-synthesizes and an unchanged run reuses the cache', async () => {
  const { dir, command, calls } = scratch();
  const p = minimal();
  p.voice = { provider: 'command', preset: 'male-sunny', command };
  await synthesizeProject(p, dir);
  assert.deepEqual(calls(), [
    { voice: 'zh-CN-YunxiNeural', rate: '-8%', pitch: '+0Hz', text: '天空为什么是蓝的？' },
    { voice: 'zh-CN-YunxiNeural', rate: '-8%', pitch: '+0Hz', text: '答案藏在阳光里。' },
  ]);
  p.voice.preset = 'female-warm';
  await synthesizeProject(p, dir);
  await synthesizeProject(p, dir);
  assert.deepEqual(calls().map((c) => `${c.voice} ${c.rate}`), [
    'zh-CN-YunxiNeural -8%', 'zh-CN-YunxiNeural -8%', 'zh-CN-XiaoxiaoNeural -4%', 'zh-CN-XiaoxiaoNeural -4%',
  ]);
});

test('an unknown preset stops synthesis with its name instead of falling back to 晓晓', async () => {
  const { dir, command, calls } = scratch();
  const p = minimal();
  p.voice = { provider: 'command', preset: 'male-deep', command };
  await assert.rejects(synthesizeProject(p, dir), /male-deep/);
  assert.deepEqual(calls(), []);
});

test('without a preset or pitch the cache key is the one older projects stored, so their audio is reused', () => {
  // The formula tts.mjs used before presets existed.
  const legacy = (spokenText, voice) => createHash('sha256').update(JSON.stringify({
    spokenText, provider: voice.provider, voice: voice.voice ?? '', model: voice.model ?? '', speed: voice.speed ?? 1, command: voice.command ?? '',
  })).digest('hex');
  const old = 'edge-tts --voice {voice} --rate={rate} --text {text} --write-media {out} --write-subtitles {sub}';
  for (const voice of [
    { provider: 'command', voice: 'zh-CN-XiaoxiaoNeural', speed: 0.96, command: old },
    { provider: 'command', command: old },
    { provider: 'command', voice: 'Tingting', command: 'say -v Tingting -o {out} {text}' },
    { provider: 'command', voice: 'zh-CN-XiaoxiaoNeural', speed: 0.96, command: old, pitch: 0 },
  ]) assert.equal(sentenceHash('天空为什么是蓝的？', voice), legacy('天空为什么是蓝的？', voice), JSON.stringify(voice));
  const sunny = { provider: 'command', preset: 'male-sunny', command: EDGE };
  assert.notEqual(sentenceHash('天空为什么是蓝的？', sunny), sentenceHash('天空为什么是蓝的？', { ...sunny, pitch: -3 }));
});
