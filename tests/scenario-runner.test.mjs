import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { findProjects, inspectProject } from './scenarios/run.mjs';

const scratch = (name) => mkdtempSync(join(tmpdir(), `svs-${name}-`));
const put = (dir, path, content) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};

test('findProjects finds nested project.json files and skips .git, .agents and node_modules', () => {
  const dir = scratch('find');
  for (const p of ['a/project.json', 'b/c/project.json', '.agents/skills/x/project.json', '.git/project.json', 'node_modules/y/project.json', 'project.json.bak']) put(dir, p, '{}');
  assert.deepEqual(findProjects(dir).map((f) => relative(dir, f)).sort(), ['a/project.json', 'b/c/project.json']);
});

test('inspectProject reports unreadable JSON', () => {
  const dir = scratch('bad-json');
  put(dir, 'project.json', '{ not json');
  assert.match(inspectProject(join(dir, 'project.json')).parse_error, /JSON/);
});

test('inspectProject skips later checks when the schema fails', () => {
  const dir = scratch('bad-schema');
  put(dir, 'project.json', '{}');
  const r = inspectProject(join(dir, 'project.json'));
  assert.ok(r.schema_errors.length > 0);
  assert.equal(r.check_errors, 'skipped: schema errors');
});

test('inspectProject runs every check on the example', () => {
  const dir = scratch('example');
  cpSync(join(import.meta.dirname, '../examples/cache-speed'), dir, { recursive: true });
  const r = inspectProject(join(dir, 'project.json'));
  assert.deepEqual([r.schema_errors, r.check_errors, r.lint_warnings, r.derived_docs], [[], [], [], []]);
  assert.deepEqual(r.files, ['project.json', '分镜.md', '讲稿.md']);
});
