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
  ]);
});
