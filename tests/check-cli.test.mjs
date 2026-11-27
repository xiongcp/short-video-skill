import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('check.mjs passes the example project and reports its estimates', () => {
  const { status, out } = run(EXAMPLE);
  assert.equal(status, 0);
  assert.deepEqual([out.errors, out.warnings, out.docs], [[], [], []]);
  assert.equal(Math.round(out.estimates.total_seconds), 63);
  assert.deepEqual(out.estimates.sections.map((s) => s.id), ['s01', 's02', 's03', 's04', 's05']);
  assert.equal(out.estimates.shots.length, 13);
  // sh05 第 0 句(s02·3)"如果响应允许缓存，内容就会留下。"有 14 字：14 / 4.5 + 0.25 = 3.36 → 3.4 秒后第 1 句开始
  assert.deepEqual(out.estimates.shots[4], { id: 'sh05', seconds: 6, starts: [0, 3.4] });
});

test('check.mjs accepts a project after step 1, before shots and 分镜.md exist', () => {
  const dir = copy();
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  project.shots = [];
  writeFileSync(join(dir, 'project.json'), JSON.stringify(project));
  rmSync(join(dir, '分镜.md'));
  rmSync(join(dir, '提示词包.md'), { force: true });
  const { status, out } = run(dir);
  assert.deepEqual([status, out.errors, out.docs], [0, [], []]);
});

test('check.mjs accepts a project with world after step 1, before shots and 分镜.md exist', () => {
  const dir = copy();
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  project.world = { metaphor: '缓存是家门口的冰箱', style: 'paper', scene: 'kitchen' };
  project.shots = [];
  writeFileSync(join(dir, 'project.json'), JSON.stringify(project));
  rmSync(join(dir, '分镜.md'));
  rmSync(join(dir, '提示词包.md'), { force: true });
  const { status, out } = run(dir);
  assert.deepEqual([status, out.errors, out.docs], [0, [], []]);
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
  const missing = run(dir);
  assert.deepEqual([missing.status, missing.out.errors, missing.out.docs], [1, [], ['缺少 分镜.md']]);
  writeFileSync(join(dir, '分镜.md'), '# 分镜\n');
  const { status, out } = run(dir);
  assert.equal(status, 1);
  assert.ok(out.docs.includes('分镜.md 没有列出镜头 sh01'));
});

test('check.mjs checks 提示词包.md when it exists', () => {
  const dir = copy();
  writeFileSync(join(dir, '提示词包.md'), '# 提示词包\n\n> 未经确认的方案\n\n### sh01（估时 6 秒）\n规格：……\n');
  const { status, out } = run(dir);
  assert.equal(status, 1);
  assert.ok(out.docs.includes('提示词包.md 没有镜头 sh02 的提示词'));
});

test('check.mjs reports storyboard warnings without failing', () => {
  const dir = copy();
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const idx = project.shots.findIndex((s) => s.visual.template === 'flow');
  project.shots[idx].visual.data.nodes = ['甲乙丙', '丁戊己', '庚辛壬'];
  project.shots[idx].cues = [];
  writeFileSync(join(dir, 'project.json'), JSON.stringify(project));
  const { status, out } = run(dir);
  assert.equal(status, 0);
  assert.deepEqual(out.warnings.map((w) => `${w.code} ${w.path}`), [`VISUAL_NOT_IN_NARRATION /shots/${idx}/visual`]);
});

test('check.mjs warns about a preset the voice command ignores and fails on an unknown preset', () => {
  const dir = copy();
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const write = (voice) => writeFileSync(join(dir, 'project.json'), JSON.stringify({ ...project, voice }));
  write({ provider: 'command', preset: 'male-sunny', command: 'say -v Tingting -o {out} {text}' });
  const warned = run(dir);
  assert.equal(warned.status, 0);
  assert.deepEqual(warned.out.warnings.map((w) => `${w.code} ${w.path}`), ['PRESET_UNUSED /voice/preset']);
  write({ provider: 'undecided', preset: 'male-deep' });
  const failed = run(dir);
  assert.equal(failed.status, 1);
  assert.deepEqual(failed.out.errors.map((e) => `${e.code} ${e.path}`), ['INVALID_VALUE /voice/preset']);
});

test('check.mjs warns, without failing, when the music file is missing', () => {
  const dir = copy();
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  project.sound = { music: { file: 'music/bgm.mp3', source: '用户自有', license: '用户自制' } };
  writeFileSync(join(dir, 'project.json'), JSON.stringify(project));
  const { status, out } = run(dir);
  assert.equal(status, 0);
  assert.deepEqual(out.warnings.map((w) => w.code), ['MUSIC_FILE_MISSING']);
});
