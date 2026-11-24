// T12 default narration voice: the macOS Mandarin system voice rendered locally and converted to the project's audio
// contract (48 kHz, 16-bit PCM WAV) with its provenance, ready for the `audio` import path. Skips where `say` or the
// voice is unavailable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject } from './helpers.mjs';
import { DEFAULT_VOICE, sectionTakes, synthesize } from '../../assets/default-voice/voice.ts';

const available = process.platform === 'darwin'
  && (spawnSync('say', ['-v', '?'], { encoding: 'utf8' }).stdout ?? '').split('\n').some((line) => line.startsWith(`${DEFAULT_VOICE} `));

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

test('synthesize renders Mandarin narration as 48 kHz 16-bit mono PCM with provenance', { skip: !available && 'macOS voice unavailable' }, () => {
  const dir = makeProject();
  const out = join(dir, 'hello.wav');
  const result = synthesize('大家好，我是晴。今天聊聊缓存。', out);
  const info = wavInfo(readFileSync(out));
  assert.deepEqual([info.format, info.channels, info.rate, info.bits], [1, 1, 48000, 16]);
  const seconds = info.data.length / 2 / 48000;
  assert.ok(seconds > 1 && seconds < 10, `duration ${seconds}s`);
  let peak = 0;
  for (let i = 0; i < info.data.length; i += 2) peak = Math.max(peak, Math.abs(info.data.readInt16LE(i)));
  assert.ok(peak > 1000, 'narration is audible');
  assert.equal(result.engine, 'macos-say');
  assert.equal(result.voice, DEFAULT_VOICE);
  assert.equal(result.samples, info.data.length / 2);
  assert.match(result.sha256, /^sha256:[0-9a-f]{64}$/);
});

test('sectionTakes writes one take per script section for the audio import path', { skip: !available && 'macOS voice unavailable' }, () => {
  const dir = makeProject();
  const script = { sections: [
    { section_id: 'sec_001', narration: '先看第一段。' },
    { section_id: 'sec_002', narration: '浏览器有副本，再看副本是否新鲜。' }] };
  const takes = sectionTakes(script, dir, 'incoming');
  assert.deepEqual(takes.map((t) => t.section_id), ['sec_001', 'sec_002']);
  for (const take of takes) {
    assert.ok(existsSync(join(dir, take.import.path)));
    assert.equal(take.import.recordist, `macos-say:${DEFAULT_VOICE}`);
  }
});
