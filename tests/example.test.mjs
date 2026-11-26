import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkProject, estimateSeconds, lintScript } from '../skills/topic-to-video/scripts/lib/project.mjs';
import { lintStoryboard } from '../skills/topic-to-video/scripts/lib/match.mjs';
import { checkDerivedDocs } from './helpers/derived-docs.mjs';
import { validateProject } from './helpers/schema.mjs';

const DIR = join(import.meta.dirname, '../examples/cache-speed');
const read = (name) => readFileSync(join(DIR, name), 'utf8');
const project = JSON.parse(read('project.json'));

test('example matches the schema', () => {
  assert.deepEqual(validateProject(project).errors, []);
});

test('example has no cross-reference errors', () => {
  assert.deepEqual(checkProject(project), []);
});

test('example script follows the writing rules', () => {
  assert.deepEqual(lintScript(project), []);
  // Pre-Task-6 example was authored under the 8s STATIC_STRETCH threshold; Task 6 restores strict 0-warning check.
  assert.deepEqual(lintStoryboard(project).filter((w) => w.code !== 'STATIC_STRETCH'), []);
  assert.equal(Math.round(estimateSeconds(project)), 114);
});

test('example documents mirror project.json', () => {
  assert.deepEqual(checkDerivedDocs(project, read('讲稿.md'), read('分镜.md')), []);
});

test('example shows the new host acting: a move, a new gesture, a new expression and a prop', () => {
  const OLD_GESTURES = ['idle', 'point_right', 'wave', 'emphasize'];
  const OLD_EXPRESSIONS = ['explaining', 'focused', 'happy', 'curious'];
  const cues = project.shots.flatMap((s) => s.cues ?? []);
  const hosts = project.shots.filter((s) => s.host).map((s) => s.host);
  assert.ok(cues.some((c) => c.do === 'move'), 'a move cue');
  assert.ok(cues.some((c) => c.do === 'prop' && c.target !== 'none'), 'a prop cue');
  assert.ok(hosts.some((h) => !OLD_GESTURES.includes(h.gesture)), 'a new gesture');
  assert.ok(hosts.some((h) => !OLD_EXPRESSIONS.includes(h.expr)), 'a new expression');
  assert.ok(hosts.every((h) => h.gesture !== 'point_right'), 'the example uses point, not the old name');
});
