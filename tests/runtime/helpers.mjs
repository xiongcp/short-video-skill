// Shared fixtures for runtime tests: temporary projects, real fonts, local WAV files and CLI calls.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { crc32, deflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Songti.ttc',
  '/System/Library/Fonts/Hiragino Sans GB.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

export const realFont = FONT_CANDIDATES.find((path) => existsSync(path));

export function makeProject() {
  return mkdtempSync(join(tmpdir(), 'svs-t01-'));
}

export function installFont(project, relative) {
  const target = join(project, relative);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(realFont, target);
  return target;
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
}

// Deterministic speech-like PCM: a 220 Hz voice with 0.25 s syllables and 0.15 s pauses.
export function writeWav(path, options = {}) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, wavBytes(options));
  return path;
}

export function wavBytes({ seconds = 12, rate = 48000, channels = 1 } = {}) {
  const frames = Math.round(seconds * rate);
  const data = Buffer.alloc(frames * channels * 2);
  for (let i = 0; i < frames; i += 1) {
    const t = i / rate;
    const voiced = t % 0.4 < 0.25 ? 1 : 0;
    const value = Math.round(voiced * 0.5 * 32767 * Math.sin(2 * Math.PI * 220 * t));
    for (let c = 0; c < channels; c += 1) data.writeInt16LE(value, (i * channels + c) * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function runCli(args, env = {}) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings',
    join(ROOT, 'runtime', 'cli.ts'), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* the assertion reports raw output */ }
  return { code: result.status, json, stdout: result.stdout, stderr: result.stderr };
}

// Async variant for tests that also run an in-process server (spawnSync would block its event loop).
export async function runCliAsync(args, env = {}) {
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', join(ROOT, 'runtime', 'cli.ts'), ...args],
    { env: { ...process.env, ...env } });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.on('close', resolve));
  let json = null;
  try { json = JSON.parse(stdout); } catch { /* the assertion reports raw output */ }
  return { code, json, stdout, stderr };
}

// Solid-colour RGBA PNG for redistributable test art (no third-party pixels).
export function pngBytes(width, height, [r, g, b, a] = [40, 60, 90, 255]) {
  const row = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x += 1) row.set([r, g, b, a], 1 + x * 4);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type, data) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
