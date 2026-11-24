import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKILL = join(import.meta.dirname, '../skills/topic-to-video');
const MB = 1024 * 1024;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
const lines = (file) => readFileSync(file, 'utf8').replace(/\n$/, '').split('\n').length;

test('skill folder stays within 5 MB and 45 files', () => {
  const all = files(SKILL);
  const bytes = all.reduce((sum, file) => sum + statSync(file).size, 0);
  assert.ok(all.length <= 45, `${all.length} files`);
  assert.ok(bytes <= 5 * MB, `${bytes} bytes`);
});

test('each reference stays within 250 lines', () => {
  const dir = join(SKILL, 'references');
  const refs = existsSync(dir) ? readdirSync(dir).map((f) => join(dir, f)) : [];
  for (const file of refs) assert.ok(lines(file) <= 250, `${file}: ${lines(file)} lines`);
});

test('skill depends on at most one npm runtime package', () => {
  const pkg = join(SKILL, 'scripts/package.json');
  const deps = existsSync(pkg) ? Object.keys(JSON.parse(readFileSync(pkg, 'utf8')).dependencies ?? {}) : [];
  assert.ok(deps.length <= 1, deps.join(', '));
});
