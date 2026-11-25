import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintStoryboard, normalizeText, visualKeywords } from '../skills/topic-to-video/scripts/lib/match.mjs';

const minimal = () => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));
const example = () => JSON.parse(readFileSync(join(import.meta.dirname, '../examples/cache-speed/project.json'), 'utf8'));
const codes = (p) => lintStoryboard(p).map((w) => `${w.code} ${w.path}`);

test('normalizeText turns Chinese number readings into digits', () => {
  assert.equal(normalizeText('返回三零四'), '返回304');
  assert.equal(normalizeText('三百零四'), '304');
  assert.equal(normalizeText('三点五秒'), '3.5秒');
  assert.equal(normalizeText('一万米'), '10000米');
  assert.equal(normalizeText('十五'), '15');
  assert.equal(normalizeText('HTTP 缓存'), 'http 缓存');
});

test('visualKeywords lists on-screen words and leaves out title cards', () => {
  assert.deepEqual(visualKeywords({ template: 'compare', data: { left: { label: '没变', rows: ['返回304'] }, right: { label: '已更新', rows: ['传回新正文'] } } }),
    ['没变', '返回304', '已更新', '传回新正文']);
  assert.deepEqual(visualKeywords({ template: 'bars', data: { items: [{ label: '首次', value: 3 }] } }), ['首次']);
  assert.deepEqual(visualKeywords({ template: 'number', data: { value: '304', label: '状态码' } }), ['304', '状态码']);
  assert.deepEqual(visualKeywords({ template: 'title', data: { heading: '标题' } }), []);
});

test('the example storyboard has no warnings', () => {
  assert.deepEqual(lintStoryboard(example()), []);
});

test('warns when none of a shot\'s keywords is in its narration', () => {
  const p = minimal();
  p.shots[1].visual.data.items = ['大气分子', '光的波长'];
  p.shots[1].cues = [];
  assert.deepEqual(codes(p), ['VISUAL_NOT_IN_NARRATION /shots/1/visual']);
  assert.match(lintStoryboard(p)[0].message, /sh02.*大气分子、光的波长/);
});

test('one matching keyword is enough', () => {
  const p = minimal();
  p.shots[1].visual.data.items = ['阳光', '光的波长'];
  p.shots[1].cues = [];
  assert.deepEqual(lintStoryboard(p), []);
});

test('matches Chinese number readings with digits on screen', () => {
  const p = minimal();
  p.sections[0].text = '天空为什么是蓝的？服务器返回三零四。';
  p.shots[1].visual = { template: 'flow', data: { nodes: ['询问', '返回304'] } };
  p.shots[1].cues = [];
  assert.deepEqual(lintStoryboard(p), []);
});

test('skips one-character keywords', () => {
  const p = minimal();
  p.shots[1].visual.data.items = ['光', '热'];
  p.shots[1].cues = [];
  assert.deepEqual(lintStoryboard(p), []);
});

test('warns when the host says 看右边 without pointing', () => {
  const p = minimal();
  p.sections[0].text = '先看右边这张图。答案藏在阳光里。';
  assert.deepEqual(codes(p), ['POINT_MISSING /shots/0']);
  assert.match(lintStoryboard(p)[0].message, /sh01 第 0 句说了“看右边”/);
});

test('a point_right gesture or gesture cue clears POINT_MISSING', () => {
  const p = minimal();
  p.sections[0].text = '先看右边这张图。答案藏在阳光里。';
  p.shots[0].host.gesture = 'point_right';
  assert.deepEqual(lintStoryboard(p), []);
  p.shots[0].host.gesture = 'idle';
  p.shots[0].cues = [{ sentence: 0, do: 'gesture', target: 'point_right' }];
  assert.deepEqual(lintStoryboard(p), []);
});

test('does not treat 这张图标 as pointing at the diagram', () => {
  const p = minimal();
  p.sections[0].text = '你见过这张图标吗？答案藏在阳光里。';
  assert.deepEqual(lintStoryboard(p), []);
});

test('full-screen shots are not checked for pointing', () => {
  const p = minimal();
  p.sections[0].text = '天空为什么是蓝的？看右边的阳光。';
  p.shots[1].visual.data.items = ['阳光'];
  p.shots[1].cues = [];
  assert.deepEqual(lintStoryboard(p), []);
});

test('survives a shot whose section or sentence is missing', () => {
  const p = minimal();
  p.shots[1].section = 's09';
  p.shots[0].sentences = [5];
  assert.doesNotThrow(() => lintStoryboard(p));
});

test('returns no warnings for a project with missing fields', () => {
  const p = minimal();
  delete p.shots;
  assert.deepEqual(lintStoryboard(p), []);
});
