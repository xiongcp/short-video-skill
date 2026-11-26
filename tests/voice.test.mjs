import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recommendVoice } from '../skills/topic-to-video/scripts/doctor.mjs';
import { readWavPcm } from '../skills/topic-to-video/scripts/lib/mouth.mjs';
import { parseArgs, runAudition } from '../skills/topic-to-video/scripts/render.mjs';
import { auditionCommand, auditionVoices, pitchToEdge, resolveVoice, selectPresets, sentenceHash, synthesizeProject } from '../skills/topic-to-video/scripts/lib/tts.mjs';

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

test('selectPresets takes preset IDs and the prefixes female, male and child, in table order', () => {
  assert.equal(selectPresets().length, 8);
  assert.deepEqual(selectPresets('male'), ['male-sunny', 'male-passion', 'male-pro']);
  assert.deepEqual(selectPresets('female'), ['female-warm', 'female-lively', 'female-dongbei', 'female-shaanxi']);
  assert.deepEqual(selectPresets('child,female-warm'), ['female-warm', 'child-cute']);
  assert.throws(() => selectPresets('male-deep'), /male-deep/);
});

test('auditionCommand uses the project edge-tts command, else the recommended one, and never macOS say', () => {
  const say = 'say -v Tingting -o {out} {text}';
  const uvx = `uvx --from edge-tts ${EDGE}`;
  assert.equal(auditionCommand({ provider: 'command', command: EDGE }, uvx), EDGE);
  assert.equal(auditionCommand({ provider: 'command', command: say }, uvx), uvx);
  assert.equal(auditionCommand({ provider: 'undecided' }, say), null);
  assert.equal(auditionCommand(undefined, undefined), null);
});

test('auditionVoices writes one trimmed clip per preset and all.wav, and leaves project.json and audio/ alone', () => {
  const { dir, command, calls } = scratch();
  const p = minimal();
  p.sections[0].pronunciation = [{ term: '阳光', reading: '太阳光' }];
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  const before = readFileSync(join(dir, 'project.json'), 'utf8');
  const r = auditionVoices(p, dir, { presets: selectPresets('male'), command });
  assert.equal(r.text, '天空为什么是蓝的？答案藏在太阳光里。');
  assert.deepEqual(r.presets.map((x) => [x.preset, x.name, x.voice, x.speed, x.file]), [
    ['male-sunny', '男声·云希', 'zh-CN-YunxiNeural', 0.92, 'out/audition/01-male-sunny.wav'],
    ['male-passion', '男声·云健', 'zh-CN-YunjianNeural', 0.98, 'out/audition/02-male-passion.wav'],
    ['male-pro', '男声·云扬', 'zh-CN-YunyangNeural', 0.92, 'out/audition/03-male-pro.wav'],
  ]);
  assert.deepEqual(calls().map((c) => `${c.voice} ${c.rate} ${c.pitch}`), ['zh-CN-YunxiNeural -8% +0Hz', 'zh-CN-YunjianNeural -2% +0Hz', 'zh-CN-YunyangNeural -8% +0Hz']);
  for (const x of r.presets) assert.ok(x.duration_ms >= 440 && x.duration_ms <= 510, `trimmed like the real voice-over: ${x.duration_ms}`);
  assert.deepEqual(readdirSync(join(dir, 'out/audition')).sort(), ['01-male-sunny.wav', '02-male-passion.wav', '03-male-pro.wav', 'all.wav']);
  const all = readWavPcm(readFileSync(join(dir, r.all)));
  const expected = r.presets.reduce((sum, x) => sum + x.duration_ms, 0) + 2 * 800;
  assert.ok(Math.abs(all.durationMs - expected) <= 3, `all.wav ${all.durationMs} ms, expected ${expected} ms`);
  assert.equal(readFileSync(join(dir, 'project.json'), 'utf8'), before);
  assert.equal(existsSync(join(dir, 'audio')), false);
});

test('a second, shorter audition leaves no clips from the first one and keeps other files', () => {
  const { dir, command } = scratch();
  const p = minimal();
  auditionVoices(p, dir, { presets: selectPresets('male'), command });
  writeFileSync(join(dir, 'out/audition/备注.txt'), '留着');
  auditionVoices(p, dir, { presets: ['child-cute'], command });
  assert.deepEqual(readdirSync(join(dir, 'out/audition')).sort(), ['01-child-cute.wav', 'all.wav', '备注.txt']);
});

test('doctor recommends edge-tts, then uvx, then say, then import, and leaves voice and speed to the preset', () => {
  assert.deepEqual(recommendVoice({ edgeTts: true, uvx: true, say: true }), { provider: 'command', command: EDGE });
  assert.deepEqual(recommendVoice({ uvx: true, say: true }), { provider: 'command', command: `uvx --from edge-tts ${EDGE}` });
  assert.deepEqual(recommendVoice({ say: true }), { provider: 'command', voice: 'Tingting', command: 'say -v Tingting -o {out} {text}' });
  assert.deepEqual(recommendVoice({}), { provider: 'import' });
  const copied = { ...recommendVoice({ edgeTts: true }), preset: 'male-sunny' };
  assert.deepEqual(resolveVoice(copied), { voice: 'zh-CN-YunxiNeural', speed: 0.92, rate: '-8%', pitch: '+0Hz' });
});

test('render.mjs reads the word after --audition as a preset list only when it looks like one', () => {
  assert.deepEqual(parseArgs(['proj', '--audition']), { projectDir: 'proj', audition: true });
  assert.deepEqual(parseArgs(['proj', '--audition', 'male,female-warm']), { projectDir: 'proj', audition: true, auditionList: 'male,female-warm' });
  assert.deepEqual(parseArgs(['--audition', 'proj']), { projectDir: 'proj', audition: true });
  assert.deepEqual(parseArgs(['proj', '--audition', 'male-deep']), { projectDir: 'proj', audition: true, auditionList: 'male-deep' });
  assert.deepEqual(parseArgs(['proj', '--preset', 'slow']), { projectDir: 'proj', preset: 'slow' });
});

test('--audition needs FFmpeg and an edge-tts command but not resvg, and reports a bad list instead of throwing', () => {
  const { dir, command } = scratch();
  writeFileSync(join(dir, 'project.json'), JSON.stringify(minimal()));
  const doc = (ffmpeg, recommended_voice) => ({ checks: { ffmpeg: { ok: ffmpeg }, resvg: { ok: false } }, recommended_voice });
  assert.deepEqual(runAudition({ projectDir: dir }, doc(false, recommendVoice({ edgeTts: true }))), { ok: false, message: '试听需要 FFmpeg' });
  assert.deepEqual(runAudition({ projectDir: dir }, doc(true, recommendVoice({ say: true }))), { ok: false, message: '试听需要 edge-tts 或 uvx' });
  const bad = runAudition({ projectDir: dir, auditionList: 'male-deep' }, doc(true, { provider: 'command', command }));
  assert.equal(bad.ok, false);
  assert.match(bad.message, /male-deep/);
  const r = runAudition({ projectDir: dir, auditionList: 'child' }, doc(true, { provider: 'command', command }));
  assert.deepEqual([r.ok, r.presets.map((x) => x.file)], [true, ['out/audition/01-child-cute.wav']]);
});
