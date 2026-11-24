import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkDerivedDocs } from './helpers/derived-docs.mjs';

const project = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));
const script = '# 最小示例\n\n## s01 开场（约 4 秒）\n\n天空为什么是蓝的？答案藏在阳光里。\n';
const board = '| 镜头 |\n| --- |\n| sh01 |\n| sh02 |\n';

test('accepts documents that mirror the project', () => {
  assert.deepEqual(checkDerivedDocs(project, script, board), []);
});

test('tolerates reflowed script text', () => {
  assert.deepEqual(checkDerivedDocs(project, script.replace('？', '？\n\n'), board), []);
});

test('reports an edited section and a missing shot', () => {
  const edited = script.replace('答案藏在阳光里。', '答案在阳光里。');
  assert.deepEqual(checkDerivedDocs(project, edited, board.replace('| sh02 |', '| sh020 |')), [
    '讲稿.md 没有逐字包含段落 s01',
    '分镜.md 没有列出镜头 sh02',
    '分镜.md 有项目里没有的镜头 sh020',
  ]);
});

test('reports sections and shots the documents list but the project does not have', () => {
  assert.deepEqual(checkDerivedDocs(project, `${script}\n## s02 旧段落（约 3 秒）\n\n删掉的段落。\n`, `${board}| sh03 |\n`), [
    '讲稿.md 有项目里没有的段落 s02',
    '分镜.md 有项目里没有的镜头 sh03',
  ]);
});

const pack = (status, shots = ['sh01', 'sh02']) => `# 提示词包：最小示例\n\n> ${status}\n\n${shots.map((id) => `### ${id}（估时 2 秒）\n规格：……\n`).join('\n')}`;
const approved = { ...project, checkpoints: [{ stage: 'plan', revision: 1, at: '2026-11-24T10:00', note: '确认' }] };

test('accepts a prompt pack that matches the shots and the confirmation', () => {
  assert.deepEqual(checkDerivedDocs(approved, script, board, pack('方案已确认（revision 1，2026-11-24）')), []);
  assert.deepEqual(checkDerivedDocs(project, script, board, pack('未经确认的方案')), []);
});

test('reports a prompt pack with missing or extra shots', () => {
  assert.deepEqual(checkDerivedDocs(approved, script, board, pack('方案已确认（revision 1，2026-11-24）', ['sh01', 'sh09'])), [
    '提示词包.md 没有镜头 sh02 的提示词',
    '提示词包.md 有项目里没有的镜头 sh09',
  ]);
});

test('reports a prompt pack whose status line disagrees with the checkpoints', () => {
  assert.deepEqual(checkDerivedDocs(project, script, board, pack('方案已确认（revision 1，2026-11-24）')), ['提示词包.md 标题下第一行应写“未经确认的方案”']);
  assert.deepEqual(checkDerivedDocs({ ...approved, revision: 2, checkpoints: [...approved.checkpoints, { stage: 'plan', revision: 2, at: '2026-11-24T11:00', note: '确认' }] }, script, board, pack('方案已确认（revision 1，2026-11-24）')), ['提示词包.md 标题下第一行应写“方案已确认（revision 2，日期）”']);
});

test('skips the prompt pack comparison while a stale line is waiting for confirmation', () => {
  const stale = pack('方案已确认（revision 1，2026-11-24）', ['sh01']).replace('\n\n###', '\n> 以下镜头已过期，待确认后更新：sh02\n\n###');
  assert.deepEqual(checkDerivedDocs({ ...approved, revision: 2 }, script, board, stale), []);
});
