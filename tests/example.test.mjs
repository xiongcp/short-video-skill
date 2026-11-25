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
  assert.deepEqual(lintStoryboard(project), []);
  assert.equal(Math.round(estimateSeconds(project)), 114);
});

test('example documents mirror project.json', () => {
  assert.deepEqual(checkDerivedDocs(project, read('讲稿.md'), read('分镜.md')), []);
});
