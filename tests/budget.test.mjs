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

// Line counts alone miss long lines: a 49-line entry can still be 20 KB. Bytes are what fill the context.
const KB = 1024;
const bytes = (file) => statSync(file).size;

test('SKILL.md stays within 8 KB and each reference within 10 KB', () => {
  assert.ok(bytes(join(SKILL, 'SKILL.md')) <= 8 * KB, `SKILL.md: ${bytes(join(SKILL, 'SKILL.md'))} bytes`);
  for (const name of readdirSync(join(SKILL, 'references'))) {
    const file = join(SKILL, 'references', name);
    assert.ok(bytes(file) <= 10 * KB, `${name}: ${bytes(file)} bytes`);
  }
});

// 24 KB until S1, 28 KB until V, 30 KB until H. The owner raised it to 100 KB on 2026-11-25 after checking what
// Hermes, Claude Code, Codex and Antigravity load (小青人设设计 §5.1); the per-file caps above stay.
test('a full L0 run reads at most 100 KB of skill files', () => {
  const read = ['SKILL.md', 'references/script.md', 'references/world.md', 'references/storyboard.md', 'references/prompt-pack.md', 'assets/host/profile.json'];
  const total = read.reduce((sum, f) => sum + bytes(join(SKILL, f)), 0);
  assert.ok(total <= 100 * KB, `${total} bytes`);
});

// Hermes lists a skill by the first 60 characters of its description (skills.index_desc_limit, 小青人设设计 §5.1).
test('the first 60 characters of the description say what the skill makes', () => {
  const description = readFileSync(join(SKILL, 'SKILL.md'), 'utf8').match(/^description: (.+)$/m)[1];
  const head = [...description].slice(0, 60).join('');
  assert.match(head, /中文知识解说视频/);
  assert.match(head, /分镜/);
});
