import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintStoryboard, normalizeText, STATIC_SECONDS, visualKeywords } from '../skills/topic-to-video/scripts/lib/match.mjs';
import { checkProject, estimateReport } from '../skills/topic-to-video/scripts/lib/project.mjs';

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

// Sentence 1 has 19 chars: 19 / 4 + 0.25 = 5.0 seconds.
const fiveSecondShot = () => {
  const p = minimal();
  p.sections[0].text = '天空为什么是蓝的？阳光穿过空气时蓝光被散射得更多一些。';
  p.shots[1] = { ...p.shots[1], sentences: [1], visual: { template: 'bullets', data: { items: ['阳光', '散射'] } }, cues: [] };
  return p;
};

test('STATIC_SECONDS is 4: 5s without cues warns STATIC_STRETCH, 3.5s does not, and checkProject has no errors', () => {
  assert.equal(STATIC_SECONDS, 4);
  const p = fiveSecondShot();
  assert.equal(estimateReport(p).shots[1].seconds, 5);
  assert.deepEqual(checkProject(p), []);
  assert.deepEqual(codes(p), ['STATIC_STRETCH /shots/1']);
  assert.match(lintStoryboard(p)[0].message, /sh02 在 0–5 秒之间画面没有变化，超过 4 秒/);

  p.sections[0].text = '天空为什么是蓝的？阳光被空气散射了。';
  assert.equal(estimateReport(p).shots[1].seconds, 2);
  assert.deepEqual(lintStoryboard(p), []);
});

test('a cue splits a shot into stretches of at most 4 seconds', () => {
  const p = minimal();
  p.sections[0].text = '阳光穿过空气时散射。蓝光从四面八方进来。';
  p.shots = [
    { ...p.shots[0], sentences: [0, 1], visual: { template: 'bullets', data: { items: ['阳光', '蓝光'] } }, cues: [] },
  ];
  assert.deepEqual(codes(p), ['STATIC_STRETCH /shots/0']);
  p.shots[0].cues = [{ sentence: 1, do: 'reveal', target: 1 }];
  assert.deepEqual(estimateReport(p).shots[0].starts, [0, 2.5]);
  assert.deepEqual(lintStoryboard(p), []);
});

test('a cue with an at keyword counts from that word, so one long sentence can change mid-way', () => {
  const p = fiveSecondShot();
  p.shots[1].cues = [{ sentence: 1, do: 'reveal', target: 1, at: '散射' }];
  assert.deepEqual(lintStoryboard(p), []);
  p.shots[1].cues = [{ sentence: 1, do: 'reveal', target: 1, at: '一些' }];
  assert.deepEqual(codes(p), ['STATIC_STRETCH /shots/1']);
  assert.match(lintStoryboard(p)[0].message, /sh02 在 0–4\.2 秒之间/);
});

test('EMPTY_START warns when every element of a full shot waits for a reveal that comes after the first second', () => {
  const p = minimal();
  p.sections[0].text = '不同颜色的光波长不一样。红光长，蓝光短。';
  p.shots = [
    { ...p.shots[0], sentences: [0], layout: 'host-left', host: { expr: 'curious', gesture: 'think' }, visual: { template: 'title', data: { heading: '波长' } }, cues: [] },
    { id: 'sh02', section: 's01', sentences: [1], layout: 'full', visual: { template: 'compare', data: { left: { label: '红光', rows: ['长'] }, right: { label: '蓝光', rows: ['短'] } } },
      cues: [{ sentence: 1, do: 'reveal', target: 0, at: '红光' }, { sentence: 1, do: 'reveal', target: 1, at: '蓝光' }], note: '红长蓝短' },
  ];
  assert.deepEqual(lintStoryboard(p), [], 'the first reveal lands at the shot start');
  p.sections[0].text = '不同颜色的光波长不一样。说到颜色，红光长，蓝光短。';
  assert.deepEqual(codes(p), ['EMPTY_START /shots/1']);
  assert.match(lintStoryboard(p).find((w) => w.code === 'EMPTY_START').message, /sh02 开头约 1\.\d 秒画面是空的/);
  p.shots[1].cues = [{ sentence: 1, do: 'reveal', target: 1, at: '蓝光' }];
  assert.deepEqual(lintStoryboard(p), [], 'one element shows from the start');
});

test('does not raise STATIC_STRETCH on an exact 4.0-second stretch despite floating-point drift', () => {
  const p = minimal();
  p.settings.sentence_gap_ms = 200;
  // With 200 ms gaps: 13 (3.45s), 15 (3.95s), 15 (3.95s), 4 (1.2s) chars put starts at [0, 3.5, 7.4, 11.4]; 11.4 - 7.4 is 4.000000000000001 in IEEE-754.
  p.sections[0].text = '阳光穿过大气层时先遇到空气。蓝光的波长很短容易向四周散射掉。红光波长很长能继续笔直地穿过去。天空蓝了。';
  p.shots = [{
    ...p.shots[0],
    sentences: [0, 1, 2, 3],
    visual: { template: 'bullets', data: { items: ['阳光', '蓝光', '红光'] } },
    cues: [
      { sentence: 1, do: 'reveal', target: 0 },
      { sentence: 2, do: 'reveal', target: 1 },
      { sentence: 3, do: 'reveal', target: 2 },
    ],
  }];
  assert.deepEqual(estimateReport(p).shots[0].starts, [0, 3.5, 7.4, 11.4]);
  assert.deepEqual(lintStoryboard(p), []);
});

test('cues on a sentence outside the shot raise neither STATIC_STRETCH, FOCUS_SPLIT nor MOVE_TOO_MANY, and do not satisfy POINT_MISSING', () => {
  const p = minimal();
  p.shots[1].cues = [{ sentence: 0, do: 'reveal', target: 0 }];
  assert.deepEqual(lintStoryboard(p), []);
  const q = acting();
  q.sections[0].text = '先看右边这张图。答案藏在阳光里。';
  q.shots[0].cues = [
    { sentence: 5, do: 'move', target: 1 },
    { sentence: 5, do: 'move', target: 2 },
    { sentence: 5, do: 'move', target: 'left' },
    { sentence: 5, do: 'reveal', target: 2 },
    { sentence: -1, do: 'gesture', target: 'point' },
  ];
  assert.deepEqual(codes(q), ['POINT_MISSING /shots/0']);
});

test('visualKeywords extracts heading and object labels from stage, time and label from timeline, and label from cycle', () => {
  assert.deepEqual(
    visualKeywords({
      template: 'stage',
      data: {
        heading: '冰箱与超市',
        objects: [{ prop: 'fridge', label: '缓存', at: 'left' }, { prop: 'shop', at: 'right' }],
        links: [{ from: 0, to: 1, label: '很远' }],
      },
    }),
    ['冰箱与超市', '缓存'],
  );
  assert.deepEqual(
    visualKeywords({
      template: 'timeline',
      data: { items: [{ time: '第1步', label: '发请求' }, { time: '第2步', label: '读缓存' }] },
    }),
    ['第1步', '发请求', '第2步', '读缓存'],
  );
  assert.deepEqual(
    visualKeywords({
      template: 'cycle',
      data: { items: [{ label: '提问' }, { label: '验证' }, { label: '总结' }] },
    }),
    ['提问', '验证', '总结'],
  );
});

test('stage shot saying 看这里 without pointing warns POINT_MISSING and NO_INTERACTION', () => {
  const p = minimal();
  p.world = { metaphor: '缓存是冰箱', style: 'paper', scene: 'kitchen' };
  p.sections[0].text = '看这里就明白了。答案藏在阳光里。';
  p.shots[0] = {
    id: 'sh01',
    section: 's01',
    sentences: [0],
    layout: 'stage',
    host: { expr: 'explaining', gesture: 'idle' },
    visual: { template: 'stage', data: { objects: [{ prop: 'fridge', label: '明白', at: 'center' }] } },
    note: '指着冰箱',
  };
  assert.deepEqual(codes(p), ['POINT_MISSING /shots/0', 'NO_INTERACTION /shots/0']);
  p.shots[0].host.gesture = 'tap';
  assert.deepEqual(lintStoryboard(p), []);
});

test('NO_INTERACTION warns on stage shots without interaction cues or tap, and clears with open or tap; host-left is exempt', () => {
  const p = minimal();
  p.world = { metaphor: '缓存是冰箱', style: 'paper', scene: 'kitchen' };
  p.sections[0].text = '冰箱就在这里。答案藏在阳光里。';
  p.shots = [
    {
      id: 'sh01',
      section: 's01',
      sentences: [0],
      layout: 'stage',
      host: { expr: 'explaining', gesture: 'idle' },
      visual: { template: 'stage', data: { objects: [{ prop: 'fridge', label: '冰箱', at: 'center' }] } },
      note: '展示冰箱',
    },
    { ...p.shots[1], sentences: [1] },
  ];
  assert.deepEqual(codes(p), ['NO_INTERACTION /shots/0']);
  // tap is a gesture, not a cue type: the message spells out the cue to write
  assert.match(lintStoryboard(p)[0].message, /react、open 等互动 cue，或 \{"do": "gesture", "target": "tap"\}/);

  p.shots[0].cues = [{ sentence: 0, do: 'open', target: 0 }];
  assert.deepEqual(lintStoryboard(p), []);

  p.shots[0].cues = [{ sentence: 0, do: 'gesture', target: 'tap' }];
  assert.deepEqual(lintStoryboard(p), []);

  // host-left without interaction cue does not warn NO_INTERACTION
  p.shots = [{
    id: 'sh01',
    section: 's01',
    sentences: [0],
    layout: 'host-left',
    host: { expr: 'explaining', gesture: 'idle' },
    visual: { template: 'bullets', data: { items: ['冰箱'] } },
    note: 'host-left 镜头',
  }];
  assert.deepEqual(lintStoryboard(p), []);
});

test('GESTURE_REPEAT warns on intra-shot repeat after host.gesture or between consecutive gesture cues', () => {
  const p = acting();
  p.shots[0].host = { expr: 'explaining', gesture: 'point' };
  p.shots[0].cues = [{ sentence: 0, do: 'gesture', target: 'point' }];
  assert.deepEqual(codes(p), ['GESTURE_REPEAT /shots/0/cues']);

  p.shots[0].host = { expr: 'explaining', gesture: 'idle' };
  p.shots[0].cues = [
    { sentence: 0, do: 'gesture', target: 'point' },
    { sentence: 1, do: 'gesture', target: 'point' },
  ];
  assert.deepEqual(codes(p), ['GESTURE_REPEAT /shots/0/cues']);

  p.shots[0].cues = [
    { sentence: 0, do: 'gesture', target: 'point' },
    { sentence: 1, do: 'gesture', target: 'think' },
    { sentence: 1, do: 'gesture', target: 'point' },
  ];
  assert.deepEqual(lintStoryboard(p), []);
});

test('GESTURE_REPEAT warns across adjacent host shots with identical host.gesture and no other gesture cue', () => {
  const p = minimal();
  p.sections[0].text = '阳光照亮大地。空气散射蓝光。';
  p.shots = [
    {
      id: 'sh01',
      section: 's01',
      sentences: [0],
      layout: 'host-left',
      host: { expr: 'explaining', gesture: 'point' },
      visual: { template: 'bullets', data: { items: ['阳光'] } },
      note: '第一镜',
    },
    {
      id: 'sh02',
      section: 's01',
      sentences: [1],
      layout: 'host-left',
      host: { expr: 'focused', gesture: 'point' },
      visual: { template: 'bullets', data: { items: ['蓝光'] } },
      note: '第二镜',
    },
  ];
  assert.deepEqual(codes(p), ['GESTURE_REPEAT /shots/1/host']);

  // Adding another gesture cue in the second shot clears GESTURE_REPEAT
  p.shots[1].cues = [{ sentence: 1, do: 'gesture', target: 'emphasize' }];
  assert.deepEqual(lintStoryboard(p), []);

  // Changing starting gesture in the second shot also clears GESTURE_REPEAT
  delete p.shots[1].cues;
  p.shots[1].host.gesture = 'present';
  assert.deepEqual(lintStoryboard(p), []);
});
