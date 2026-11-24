import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '../skills/topic-to-video/scripts/check.mjs');
const EXAMPLE = join(import.meta.dirname, '../examples/cache-speed');
const run = (dir) => {
  const r = spawnSync(process.execPath, [CLI, dir], { encoding: 'utf8' });
  return { status: r.status, out: JSON.parse(r.stdout) };
};
const copy = () => {
  const dir = mkdtempSync(join(tmpdir(), 'svs-check-'));
  cpSync(EXAMPLE, dir, { recursive: true });
  return dir;
};

test('check.mjs passes the example project', () => {
  assert.deepEqual(run(EXAMPLE), { status: 0, out: { errors: [], warnings: [], docs: [] } });
});

test('check.mjs fails on unreadable JSON', () => {
  const dir = copy();
  writeFileSync(join(dir, 'project.json'), '{');
  const { status, out } = run(dir);
  assert.equal(status, 1);
  assert.equal(out.errors[0].code, 'PARSE_ERROR');
});

test('check.mjs fails when 分镜.md is missing or disagrees with project.json', () => {
  const dir = copy();
  rmSync(join(dir, '分镜.md'));
  assert.deepEqual(run(dir), { status: 1, out: { errors: [], warnings: [], docs: ['缺少 分镜.md'] } });
  writeFileSync(join(dir, '分镜.md'), '# 分镜\n');
  const { status, out } = run(dir);
  assert.equal(status, 1);
  assert.ok(out.docs.includes('分镜.md 没有列出镜头 sh01'));
});
