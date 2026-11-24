import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pngSize } from './helpers/png.mjs';

const HOST = join(import.meta.dirname, '../skills/topic-to-video/assets/host');
const json = (file) => JSON.parse(readFileSync(join(HOST, file), 'utf8'));
const sha256 = (file) => createHash('sha256').update(readFileSync(join(HOST, file))).digest('hex');

test('manifest lists four bodies and a 4×4 face atlas', () => {
  const m = json('manifest.json');
  assert.deepEqual(Object.keys(m.bodies), ['idle', 'point_right', 'wave', 'emphasize']);
  assert.deepEqual(m.faces.rows, ['explaining', 'focused', 'happy', 'curious']);
  assert.deepEqual(m.faces.columns, ['closed', 'half', 'open', 'blink']);
});

test('every sprite matches its recorded hash and size', () => {
  const m = json('manifest.json');
  for (const { file, sha256: hash } of Object.values(m.bodies)) {
    assert.equal(sha256(file), hash, file);
    assert.deepEqual(pngSize(readFileSync(join(HOST, file))), m.canvas, file);
  }
  const [x, y, w, h] = m.faces.rect;
  assert.ok(x >= 0 && y >= 0 && x + w <= m.canvas.width && y + h <= m.canvas.height, 'face rect inside the canvas');
  assert.equal(sha256(m.faces.file), m.faces.sha256);
  assert.deepEqual(pngSize(readFileSync(join(HOST, m.faces.file))), { width: 4 * w, height: 4 * h });
});

test('profile names the same expressions and gestures as the sprites', () => {
  const m = json('manifest.json');
  const p = json('profile.json');
  assert.deepEqual(p.expressions, m.faces.rows);
  assert.deepEqual(p.gestures, Object.keys(m.bodies));
  assert.ok(p.prompt_lock.zh.length > 0 && p.prompt_lock.en.length > 0);
});

test('host folder stays within 1.2 MB and declares a usage state', () => {
  const total = readdirSync(HOST).reduce((sum, f) => sum + statSync(join(HOST, f)).size, 0);
  assert.ok(total <= 1.2 * 1024 * 1024, `host assets are ${total} bytes`);
  assert.ok(['pending', 'cleared'].includes(json('rights.json').usage));
});
