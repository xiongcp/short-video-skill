import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runDoctor } from '../skills/topic-to-video/scripts/doctor.mjs';

const ROOT = join(import.meta.dirname, '..');
const RENDER = join(ROOT, 'skills/topic-to-video/scripts/render.mjs');
const doctor = await runDoctor();

const run = (args, env = {}) => {
  const res = spawnSync(process.execPath, [RENDER, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: res.status, json: JSON.parse(res.stdout), stderr: res.stderr };
};

const example = (mutate) => {
  const dir = mkdtempSync(join(tmpdir(), 'svs-cli-'));
  cpSync(join(ROOT, 'examples/cache-speed'), dir, { recursive: true });
  const p = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  mutate?.(p);
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  return dir;
};

test('a missing project folder reports PROJECT_NOT_FOUND as JSON without a stack trace', () => {
  const r = run([join(tmpdir(), 'svs-no-such-project'), '--preview']);
  assert.equal(r.status, doctor.l1_ready ? 1 : 2);
  if (doctor.l1_ready) assert.equal(r.json.code, 'PROJECT_NOT_FOUND');
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});

test('without FFmpeg it falls back to L0 with exit code 2 and the missing items', () => {
  const r = run([example(), '--preview'], { FFMPEG: join(tmpdir(), 'svs-no-ffmpeg') });
  assert.equal(r.status, 2);
  assert.equal(r.json.fallback, 'L0');
  assert.ok(r.json.missing.includes('ffmpeg'));
  assert.ok(r.json.hints.ffmpeg);
});

test('an undecided voice reports VOICE_UNDECIDED with a voice block that keeps the preset', { skip: !doctor.l1_ready }, () => {
  const dir = example();
  const r = run([dir, '--preview']);
  assert.equal(r.status, 1);
  assert.equal(r.json.code, 'VOICE_UNDECIDED');
  assert.equal(r.json.fix.voice.provider, doctor.recommended_voice.provider);
  if (/edge-tts/.test(r.json.fix.voice.command ?? '')) assert.equal(r.json.fix.voice.preset, 'female-warm');
  assert.ok(!existsSync(join(dir, 'out')));
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});

test('a project with errors reports PROJECT_INVALID before any audio is made', { skip: !doctor.l1_ready }, () => {
  const dir = example((p) => { p.shots[0].section = 's99'; });
  const r = run([dir, '--preview']);
  assert.equal(r.status, 1);
  assert.equal(r.json.code, 'PROJECT_INVALID');
  assert.ok(r.json.errors.length > 0);
  assert.ok(!existsSync(join(dir, 'audio')));
});

test('a bad --sample range fails before synthesis', { skip: !doctor.l1_ready }, () => {
  const dir = example((p) => { p.voice = { provider: 'command', command: 'false {out}' }; });
  const r = run([dir, '--preview', '--sample', 'sh99']);
  assert.equal(r.status, 1);
  assert.equal(r.json.code, 'SAMPLE_RANGE_INVALID');
  assert.ok(!existsSync(join(dir, 'audio')));
});

test('a TTS failure on the second sentence keeps the first in timing.json and says edge-tts needs a network', { skip: !doctor.l1_ready }, () => {
  const fake = join(mkdtempSync(join(tmpdir(), 'svs-tts-')), 'tts.mjs');
  // Succeeds once (writes 0.5 s of tone via ffmpeg), then fails like an offline edge-tts.
  writeFileSync(fake, `import { existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const [out] = process.argv.slice(2);
const marker = new URL('./count', import.meta.url);
if (existsSync(marker)) { console.error('Retrying...\\n  Cannot connect to host speech.platform.bing.com.'); process.exit(1); }
writeFileSync(marker, '1');
spawnSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=0.5', out]);
`);
  const dir = example((p) => { p.voice = { provider: 'command', command: `${process.execPath} ${fake} {out}` }; });
  const r = run([dir, '--preview']);
  assert.equal(r.status, 1);
  assert.equal(r.json.code, 'TTS_FAILED');
  assert.match(r.json.message, /联网/);
  assert.match(r.json.message, /say|录音/);
  // the last stderr line is quoted without its indent or a doubled full stop
  assert.match(r.json.message, /失败：Cannot connect to host speech\.platform\.bing\.com。edge-tts/);
  const timing = JSON.parse(readFileSync(join(dir, 'audio/timing.json'), 'utf8'));
  assert.ok(timing['s01-0']);
});

test('render.mjs runs when invoked through a symlinked skill directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svs-render-link-'));
  try {
    const link = join(dir, 'topic-to-video');
    symlinkSync(join(ROOT, 'skills/topic-to-video'), link, process.platform === 'win32' ? 'junction' : 'dir');
    const res = spawnSync(process.execPath, [join(link, 'scripts/render.mjs'), join(dir, 'missing-proj')], { encoding: 'utf8' });
    assert.equal(res.status, doctor.l1_ready ? 1 : 2);
    const report = JSON.parse(res.stdout);
    assert.equal(report.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
