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

test('point, the old point_right, present or tap, as a gesture or a cue, clears POINT_MISSING', () => {
  const p = minimal();
  p.sections[0].text = '先看右边这张图。答案藏在阳光里。';
  for (const gesture of ['point', 'point_right', 'present', 'tap']) {
    p.shots[0].host.gesture = gesture;
    assert.deepEqual(lintStoryboard(p), [], gesture);
  }
  p.shots[0].host.gesture = 'idle';
  p.shots[0].cues = [{ sentence: 0, do: 'gesture', target: 'point' }];
  assert.deepEqual(lintStoryboard(p), []);
  p.shots[0].cues[0].target = 'think';
  assert.match(lintStoryboard(p)[0].message, /point、present 或 tap/);
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

test('reads colloquial numbers with a trailing digit and percentages', () => {
  assert.equal(normalizeText('一万五'), '15000');
  assert.equal(normalizeText('三百五'), '350');
  assert.equal(normalizeText('两千三'), '2300');
  assert.equal(normalizeText('一千零五'), '1005');
  assert.equal(normalizeText('百分之三十'), '30%');
});

test('does not warn when the narration says 一万五 and the screen shows 15000', () => {
  const p = minimal();
  p.sections[0].text = '天空为什么是蓝的？大约一万五。';
  p.shots[1].visual = { template: 'number', data: { value: '15000', label: '次' } };
  p.shots[1].cues = [];
  assert.deepEqual(lintStoryboard(p), []);
});

test('survives visual data whose lists are not arrays', () => {
  const p = minimal();
  p.shots[1].cues = [];
  for (const visual of [
    { template: 'compare', data: { left: { label: '甲', rows: 5 }, right: { label: '乙', rows: '丙' } } },
    { template: 'flow', data: { nodes: '阳光' } },
    { template: 'bars', data: { items: '阳光' } },
  ]) {
    p.shots[1].visual = visual;
    assert.doesNotThrow(() => lintStoryboard(p), visual.template);
  }
});

// A host-left bullets shot over both sentences of the fixture, so cues can walk between elements.
const acting = () => {
  const p = minimal();
  p.shots = [{ ...p.shots[0], sentences: [0, 1], visual: { template: 'bullets', data: { items: ['阳光', '空气', '散射'] } } }];
  return p;
};

test('warns about more than two moves in one shot', () => {
  const p = acting();
  p.shots[0].cues = [{ sentence: 0, do: 'move', target: 0 }, { sentence: 1, do: 'move', target: 1 }, { sentence: 1, do: 'move', target: 'left' }];
  assert.deepEqual(codes(p), ['MOVE_TOO_MANY /shots/0/cues']);
  assert.match(lintStoryboard(p)[0].message, /sh01 有 3 次 move，最多 2 次/);
  p.shots[0].cues.pop();
  assert.deepEqual(lintStoryboard(p), []);
});

test('warns when a sentence moves to one element and reveals another', () => {
  const p = acting();
  p.shots[0].cues = [{ sentence: 1, do: 'move', target: 1 }, { sentence: 1, do: 'reveal', target: 2 }];
  assert.deepEqual(codes(p), ['FOCUS_SPLIT /shots/0/cues']);
  assert.match(lintStoryboard(p)[0].message, /sh01 第 1 句 move 到元素 1，reveal 的却是元素 2/);
});

test('one focus per sentence: the same element, a preset spot or different sentences are fine', () => {
  const p = acting();
  p.shots[0].cues = [{ sentence: 1, do: 'move', target: 2 }, { sentence: 1, do: 'reveal', target: 2 }];
  assert.deepEqual(lintStoryboard(p), []);
  p.shots[0].cues = [{ sentence: 1, do: 'move', target: 'right' }, { sentence: 1, do: 'highlight', target: 0 }];
  assert.deepEqual(lintStoryboard(p), []);
  p.shots[0].cues = [{ sentence: 0, do: 'move', target: 1 }, { sentence: 1, do: 'highlight', target: 0 }];
  assert.deepEqual(lintStoryboard(p), []);
});

// Sentences 1 and 2 have 15 and 17 characters: they start at 0 and 4 seconds, and the shot lasts about 9 seconds.
const longShot = () => {
  const p = minimal();
  p.sections[0].text = '天空为什么是蓝的？阳光穿过空气时蓝光被散射得更多。散射的蓝光从四面八方进入我们的眼睛。';
  p.shots[1] = { ...p.shots[1], sentences: [1, 2], visual: { template: 'bullets', data: { items: ['阳光', '散射'] } }, cues: [] };
  return p;
};

test('warns when the picture stays still for more than 8 seconds by the estimate', () => {
  const p = longShot();
  assert.deepEqual(codes(p), ['STATIC_STRETCH /shots/1']);
  assert.match(lintStoryboard(p)[0].message, /sh02 在 0–9 秒之间画面没有变化，超过 8 秒/);
});

test('a cue splits a long shot into stretches under 8 seconds', () => {
  const p = longShot();
  p.shots[1].cues = [{ sentence: 2, do: 'reveal', target: 1 }];
  assert.deepEqual(lintStoryboard(p), []);
});

test('cues on a sentence outside the shot raise neither STATIC_STRETCH nor FOCUS_SPLIT', () => {
  const p = minimal();
  p.shots[1].cues = [{ sentence: 0, do: 'reveal', target: 0 }];
  assert.deepEqual(lintStoryboard(p), []);
  const q = acting();
  q.shots[0].cues = [{ sentence: 5, do: 'move', target: 1 }, { sentence: 5, do: 'reveal', target: 2 }];
  assert.deepEqual(lintStoryboard(q), []);
});
