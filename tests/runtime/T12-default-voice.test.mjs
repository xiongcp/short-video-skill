// T12 default narration voice: Kokoro-82M v1.1-zh (Apache-2.0) run locally through kokoro-onnx, with the macOS system
// voice kept as a fallback engine. Output follows the project's audio contract (48 kHz, 16-bit PCM WAV, mono) and carries
// its provenance, ready for the `audio` import path. Each engine's tests skip where it is not installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject } from './helpers.mjs';
import { DEFAULT_ENGINE, DEFAULT_VOICE, SAY_VOICE, kokoroAvailable, sectionTakes, synthesize } from '../../assets/default-voice/voice.ts';

const kokoro = kokoroAvailable();
const say = process.platform === 'darwin'
  && (spawnSync('say', ['-v', '?'], { encoding: 'utf8' }).stdout ?? '').split('\n').some((line) => line.startsWith(`${SAY_VOICE} `));

function wavInfo(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  let at = 12, fmt, data;
  while (at < bytes.length) {
    const id = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4);
    if (id === 'fmt ') fmt = { format: bytes.readUInt16LE(at + 8), channels: bytes.readUInt16LE(at + 10), rate: bytes.readUInt32LE(at + 12), bits: bytes.readUInt16LE(at + 22) };
    if (id === 'data') data = bytes.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  return { ...fmt, data };
}
function assertNarration(path, result) {
  const info = wavInfo(readFileSync(path));
  assert.deepEqual([info.format, info.channels, info.rate, info.bits], [1, 1, 48000, 16]);
  const seconds = info.data.length / 2 / 48000;
  assert.ok(seconds > 1 && seconds < 12, `duration ${seconds}s`);
  let peak = 0;
  for (let i = 0; i < info.data.length; i += 2) peak = Math.max(peak, Math.abs(info.data.readInt16LE(i)));
  assert.ok(peak > 1000, 'narration is audible');
  assert.equal(result.samples, info.data.length / 2);
  assert.match(result.sha256, /^sha256:[0-9a-f]{64}$/);
}

test('the default engine is the local neural voice', () => {
  assert.equal(DEFAULT_ENGINE, 'kokoro');
  assert.match(DEFAULT_VOICE, /^z[fm]_\d{3}$/);
});

test('kokoro renders mixed Chinese/English narration reproducibly, with model provenance and term readings', { skip: !kokoro && 'Kokoro not installed' }, () => {
  const dir = makeProject();
  const text = '大家好，我是晴。今天聊聊 HTTP 缓存和 Nginx。';
  const pronunciation = [{ term: 'Nginx', reading: 'engine x' }];
  const a = synthesize(text, join(dir, 'a.wav'), { pronunciation });
  assertNarration(join(dir, 'a.wav'), a);
  assert.equal(a.engine, 'kokoro');
  assert.equal(a.voice, DEFAULT_VOICE);
  assert.equal(a.model, 'kokoro-v1.1-zh');
  assert.match(a.model_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.text, text);
  assert.equal(a.reading_text, '大家好，我是晴。今天聊聊 HTTP 缓存和 engine x。');
  assert.ok(a.phonemes.includes('ʧ') || /[a-zˈˌ]{3}/.test(a.phonemes), 'English words are phonemized, not dropped');
  assert.ok(!a.phonemes.includes('❓'), 'no unknown tokens');
  const b = synthesize(text, join(dir, 'b.wav'), { pronunciation });
  assert.equal(b.sha256, a.sha256, 'same text, voice and model give the same take');
});

test('the macOS system voice stays available as an engine', { skip: !say && 'macOS voice unavailable' }, () => {
  const dir = makeProject();
  const result = synthesize('大家好，我是晴。今天聊聊缓存。', join(dir, 'hello.wav'), { engine: 'macos-say' });
  assertNarration(join(dir, 'hello.wav'), result);
  assert.equal(result.engine, 'macos-say');
  assert.equal(result.voice, SAY_VOICE);
});

test('sectionTakes writes one take per script section, applying the section readings', { skip: !kokoro && 'Kokoro not installed' }, () => {
  const dir = makeProject();
  const script = { sections: [
    { section_id: 'sec_001', narration: '先看第一段。', pronunciation: [] },
    { section_id: 'sec_002', narration: '浏览器有副本，再问 Nginx 副本是否新鲜。', pronunciation: [{ term: 'Nginx', reading: 'engine x' }] }] };
  const takes = sectionTakes(script, dir, 'incoming');
  assert.deepEqual(takes.map((t) => t.section_id), ['sec_001', 'sec_002']);
  for (const take of takes) {
    assert.ok(existsSync(join(dir, take.import.path)));
    assert.equal(take.import.recordist, `kokoro:${DEFAULT_VOICE}`);
  }
  assert.match(takes[1].provenance.reading_text, /engine x/);
});
