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

test('SKILL.md has the required frontmatter and stays within 150 lines', () => {
  const file = join(SKILL, 'SKILL.md');
  const front = readFileSync(file, 'utf8').match(/^---\nname: topic-to-video\ndescription: (.+)\n---\n/);
  assert.ok(front, 'frontmatter must be exactly name and description');
  assert.ok(front[1].length <= 1024, `description has ${front[1].length} characters`);
  assert.match(front[1], /[一-鿿]/, 'description has Chinese');
  assert.match(front[1], /\bUse when\b/, 'description has an English trigger sentence');
  assert.ok(lines(file) <= 150, `${lines(file)} lines`);
});

test('every reference is linked from SKILL.md', () => {
  const skill = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  for (const name of readdirSync(join(SKILL, 'references'))) assert.ok(skill.includes(`](references/${name})`), `${name} is not linked`);
});

test('agents/openai.yaml gives Codex a display name and a default prompt', () => {
  const yaml = readFileSync(join(SKILL, 'agents/openai.yaml'), 'utf8');
  assert.match(yaml, /^interface:\n  display_name: "[^"]+"\n  short_description: "[^"]+"\n  default_prompt: "[^"]*\$topic-to-video[^"]*"\n$/);
});

test('agents/openai.yaml short_description is 25–64 characters', () => {
  const short = readFileSync(join(SKILL, 'agents/openai.yaml'), 'utf8').match(/short_description: "([^"]+)"/)[1];
  assert.ok([...short].length >= 25 && [...short].length <= 64, `${[...short].length} characters`);
});
