import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { installHints, isCliEntry, runDoctor } from '../skills/topic-to-video/scripts/doctor.mjs';

const none = () => ({ ok: false });
const all = () => ({ ok: true, detail: 'x' });
const font = join(mkdtempSync(join(tmpdir(), 'svs-font-')), 'cjk.ttc');
writeFileSync(font, '');

test('a Linux box with no tools and no CJK font is not L1 ready and gets apt hints', async () => {
  const d = await runDoctor({ probe: none, fontCandidates: [], platform: 'linux', importResvg: async () => { throw new Error('no'); } });
  assert.equal(d.l1_ready, false);
  assert.equal(d.tts_ready, false);
  for (const item of ['ffmpeg', 'ffprobe', '@resvg/resvg-js', 'cjk-font']) assert.ok(d.missing.includes(item), item);
  assert.match(d.hints['cjk-font'], /fonts-noto-cjk/);
  assert.match(d.hints.ffmpeg, /apt-get install -y ffmpeg/);
  assert.match(d.hints.tts, /edge-tts/);
  assert.match(d.fallback, /cjk-font/);
});

test('tools, a font and uvx make it L1 and TTS ready with the uvx edge-tts command', async () => {
  const probe = (bin) => (bin === 'edge-tts' || bin === 'say' ? { ok: false } : all());
  const d = await runDoctor({ probe, fontCandidates: [font], platform: 'darwin', importResvg: async () => ({}) });
  assert.equal(d.l1_ready, true);
  assert.equal(d.tts_ready, true);
  assert.match(d.recommended_voice.command, /^uvx --from edge-tts edge-tts /);
  assert.deepEqual(d.hints, {});
});

test('installHints covers macOS and Windows package managers', () => {
  assert.match(installHints(['ffmpeg'], 'darwin').ffmpeg, /brew install ffmpeg/);
  assert.match(installHints(['ffmpeg'], 'win32').ffmpeg, /winget install/);
  assert.match(installHints(['@resvg/resvg-js'], 'darwin')['@resvg/resvg-js'], /npm install --prefix/);
});

test('isCliEntry and doctor.mjs CLI work when invoked through a symlinked directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svs-doc-link-'));
  try {
    const link = join(dir, 'topic-to-video');
    symlinkSync(join(import.meta.dirname, '../skills/topic-to-video'), link, process.platform === 'win32' ? 'junction' : 'dir');
    const doctorPath = join(import.meta.dirname, '../skills/topic-to-video/scripts/doctor.mjs');
    assert.equal(isCliEntry(pathToFileURL(doctorPath).href, join(link, 'scripts/doctor.mjs')), true);
    assert.equal(isCliEntry(pathToFileURL(doctorPath).href, undefined), false);
    assert.equal(isCliEntry(pathToFileURL(doctorPath).href, join(dir, 'missing.mjs')), false);

    const res = spawnSync(process.execPath, [join(link, 'scripts/doctor.mjs')], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    const report = JSON.parse(res.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.l0_ready, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
