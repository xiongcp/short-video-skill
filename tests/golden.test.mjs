import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digestProject, goldenCases, sceneTour } from './helpers/golden.mjs';

const file = join(import.meta.dirname, 'fixtures/golden-16x9.json');

test('scene tour covers all 8 scenes, all 8 templates and all 3 layouts', () => {
  const p = sceneTour();
  assert.deepEqual(new Set(p.shots.filter((s) => s.scene).map((s) => s.scene)).size, 8);
  assert.equal(new Set(p.shots.map((s) => s.visual.template)).size, 9); // 8 diagram templates + stage
  assert.deepEqual([...new Set(p.shots.map((s) => s.layout))].sort(), ['full', 'host-left', 'stage']);
});

test('16:9 frames and ASS stay identical to the recorded golden hashes (竖屏设计 §8.1)', () => {
  const actual = Object.fromEntries(Object.entries(goldenCases()).map(([name, p]) => [name, digestProject(p)]));
  if (process.env.UPDATE_GOLDEN === '1') {
    writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  assert.ok(existsSync(file), '先在改代码之前运行 UPDATE_GOLDEN=1 node --test tests/golden.test.mjs 录一次金样');
  assert.deepEqual(actual, JSON.parse(readFileSync(file, 'utf8')));
});
