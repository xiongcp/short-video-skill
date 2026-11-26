import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drawIcon, ICONS } from '../skills/topic-to-video/scripts/lib/icons.mjs';
import { DIAGRAM_ZONES, layoutElements, renderDiagram, THEME_PALETTE } from '../skills/topic-to-video/scripts/lib/templates.mjs';
import { STYLE_PALETTES } from '../skills/topic-to-video/scripts/lib/world.mjs';

const schema = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/schema/project.schema.json'), 'utf8'));

test('icons.mjs implements all 60 props including all 24 schema icons deterministically in light and dark themes with no <text>', () => {
  assert.equal(ICONS.length, 60);
  for (const name of schema.$defs.icon.enum) {
    assert.ok(ICONS.includes(name), `schema icon ${name} in ICONS`);
  }
  for (const name of ICONS) {
    const a = drawIcon(name, { x: 100, y: 100, size: 48, seed: 'sh01' });
    const b = drawIcon(name, { x: 100, y: 100, size: 48, seed: 'sh01' });
    assert.equal(a, b, `${name} deterministic`);
    assert.ok(a.includes(`data-icon="${name}"`), name);
    assert.ok(a.includes('data-state="normal"'), `${name} emits data-state`);
    assert.ok(!a.includes('<text'), `${name} has no text`);
    const dark = drawIcon(name, { x: 100, y: 100, size: 48, theme: 'dark', seed: 'sh01' });
    assert.ok(!dark.includes('#1f1f1f'), `${name} dark theme has no light ink`);
  }
  assert.throws(() => drawIcon('dragon', { x: 0, y: 0 }), /unknown icon/);
});

test('all 6 diagram templates return pure vectorSvg, textItems and element bboxes inside their layout zone', () => {
  const visuals = [
    { template: 'title', data: { heading: '同一张图，两次打开', sub: '还要从头下载吗？' } },
    { template: 'bullets', data: { items: ['响应允许缓存', '把内容留下', '之后的请求能用'], icons: ['check', 'cache', 'clock'] } },
    { template: 'flow', data: { nodes: ['浏览器', '服务器', '屏幕'], icons: ['browser', 'server', 'image'] } },
    { template: 'compare', data: { left: { label: '第一趟', rows: ['去服务器', '等待返回'] }, right: { label: '第二趟', rows: ['本地直接用'] } } },
    { template: 'number', data: { value: '304', label: '资源未变化' } },
    { template: 'bars', data: { items: [{ label: '首次', value: 180 }, { label: '缓存', value: 12 }], unit: 'ms' } },
  ];

  for (const layout of ['host-left', 'full']) {
    const zone = DIAGRAM_ZONES[layout];
    for (const visual of visuals) {
      const out = renderDiagram(visual, { layout, theme: 'light', seed: 'sh01', t: 1.0, duration: 4.0 });
      assert.ok(!out.vectorSvg.includes('<text'), `${visual.template} vectorSvg stays text-free`);
      assert.ok(out.textItems.length >= 1, `${visual.template} emits text items`);
      const elems = layoutElements(visual, layout);
      assert.deepEqual(out.elements, elems);
      for (const el of elems) {
        assert.ok(el.bbox.x >= zone.x - 1 && el.bbox.x + el.bbox.w <= zone.x + zone.w + 1, `${layout} ${visual.template} x`);
        assert.ok(el.bbox.y >= zone.y - 1 && el.bbox.y + el.bbox.h <= zone.y + zone.h + 1, `${layout} ${visual.template} y`);
      }
    }
  }
});

test('highlight draws a hand-drawn emphasis circle/underline and number counts up over 0.8s', () => {
  const flow = { template: 'flow', data: { nodes: ['浏览器', '服务器'] } };
  const highlighted = renderDiagram(flow, {
    layout: 'full',
    seed: 'sh03',
    t: 1,
    duration: 4,
    elementStates: [{ opacity: 1, highlight: 1 }, { opacity: 1, highlight: 0 }],
  });
  assert.ok(highlighted.vectorSvg.includes('data-highlight="0"'));

  const numVis = { template: 'number', data: { value: '304', label: '状态码' } };
  const early = renderDiagram(numVis, { layout: 'full', seed: 'sh04', t: 0.2, duration: 3 });
  const late = renderDiagram(numVis, { layout: 'full', seed: 'sh04', t: 1.0, duration: 3 });
  const earlyVal = early.textItems.find((t) => t.key === 'number-value').text;
  const lateVal = late.textItems.find((t) => t.key === 'number-value').text;
  assert.ok(Number(earlyVal) < 304 && Number(earlyVal) > 0, `early count ${earlyVal}`);
  assert.equal(lateVal, '304');
});

function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test('timeline (2-5 items) and cycle (3-5 items) return pure vectorSvg, textItems, and non-overlapping bboxes inside zone', () => {
  const timelineVisuals = [
    {
      template: 'timeline',
      data: {
        items: [
          { time: '第1步', label: '发起请求', icon: 'browser' },
          { time: '第2步', label: '返回缓存' },
        ],
      },
    },
    {
      template: 'timeline',
      data: {
        items: [
          { time: '1991', label: 'HTTP/0.9', icon: 'doc' },
          { time: '1996', label: 'HTTP/1.0', icon: 'server' },
          { time: '1999', label: '持久连接', icon: 'network' },
          { time: '2015', label: '多路复用', icon: 'rocket' },
          { time: '2022', label: 'QUIC传输', icon: 'globe' },
        ],
      },
    },
  ];
  const cycleVisuals = [
    {
      template: 'cycle',
      data: {
        items: [
          { label: '提问', icon: 'bulb' },
          { label: '验证', icon: 'beaker' },
          { label: '总结' },
        ],
      },
    },
    {
      template: 'cycle',
      data: {
        items: [
          { label: '感知', icon: 'search' },
          { label: '判断', icon: 'brain' },
          { label: '执行', icon: 'gear' },
          { label: '反馈', icon: 'chart' },
          { label: '迭代', icon: 'clock' },
        ],
      },
    },
  ];

  for (const layout of ['host-left', 'full']) {
    const zone = DIAGRAM_ZONES[layout];
    for (const visual of [...timelineVisuals, ...cycleVisuals]) {
      const n = visual.data.items.length;
      const out = renderDiagram(visual, { layout, theme: 'light', seed: 'tc01', t: 1.0, duration: 4.0 });
      assert.ok(!out.vectorSvg.includes('<text'), `${layout} ${visual.template}(${n}) vectorSvg stays text-free`);
      const elems = layoutElements(visual, layout);
      assert.equal(elems.length, n, `${layout} ${visual.template}(${n}) element count`);
      assert.deepEqual(out.elements, elems);

      if (visual.template === 'timeline') {
        assert.equal(out.textItems.length, n * 2, `${layout} timeline(${n}) emits time + label per item`);
      } else {
        assert.equal(out.textItems.length, n, `${layout} cycle(${n}) emits label per item`);
      }

      for (let i = 0; i < elems.length; i += 1) {
        const b = elems[i].bbox;
        assert.ok(b.x >= zone.x - 1 && b.x + b.w <= zone.x + zone.w + 1, `${layout} ${visual.template}(${n})[${i}] x`);
        assert.ok(b.y >= zone.y - 1 && b.y + b.h <= zone.y + zone.h + 1, `${layout} ${visual.template}(${n})[${i}] y`);
        for (let j = i + 1; j < elems.length; j += 1) {
          assert.equal(boxesOverlap(b, elems[j].bbox), false, `${layout} ${visual.template}(${n})[${i},${j}] no overlap`);
        }
      }
    }
  }

  // cycle arrowProgress controls the clockwise arrow pointing into element i
  const cycle4 = {
    template: 'cycle',
    data: { items: [{ label: '一' }, { label: '二' }, { label: '三' }, { label: '四' }] },
  };
  const allArrows = renderDiagram(cycle4, { layout: 'full', seed: 'cyc-arr' });
  const hiddenArrow1 = renderDiagram(cycle4, {
    layout: 'full',
    seed: 'cyc-arr',
    elementStates: [{ arrowProgress: 1 }, { arrowProgress: 0 }, { arrowProgress: 1 }, { arrowProgress: 1 }],
  });
  assert.notEqual(allArrows.vectorSvg, hiddenArrow1.vectorSvg);
  assert.ok(hiddenArrow1.vectorSvg.length < allArrows.vectorSvg.length);
});

test('renderDiagram uses style pack palettes without #1f1f1f on dark styles and preserves legacy theme fallback', () => {
  const all8 = [
    { template: 'title', data: { heading: '标题测试', sub: '副标题' } },
    { template: 'bullets', data: { items: ['第一条', '第二条'], icons: ['check', 'cache'] } },
    { template: 'flow', data: { nodes: ['输入', '处理'], icons: ['browser', 'server'] } },
    { template: 'compare', data: { left: { label: '甲', rows: ['快'] }, right: { label: '乙', rows: ['稳'] } } },
    { template: 'number', data: { value: '99%', label: '命中率' } },
    { template: 'bars', data: { items: [{ label: '前', value: 80 }, { label: '后', value: 20 }], unit: 'ms' } },
    { template: 'timeline', data: { items: [{ time: 'T1', label: '开始', icon: 'clock' }, { time: 'T2', label: '结束', icon: 'check' }] } },
    { template: 'cycle', data: { items: [{ label: '读', icon: 'book' }, { label: '想', icon: 'brain' }, { label: '写', icon: 'doc' }] } },
  ];

  for (const style of ['blueprint', 'chalkboard']) {
    const pal = STYLE_PALETTES[style];
    for (const visual of all8) {
      const out = renderDiagram(visual, { layout: 'full', style, seed: 'st-dark', t: 1.0, duration: 4.0 });
      assert.ok(!out.vectorSvg.includes('<text'), `${style} ${visual.template} has no <text>`);
      assert.ok(!out.vectorSvg.includes('#1f1f1f'), `${style} ${visual.template} has no #1f1f1f ink`);
      assert.ok(out.vectorSvg.includes(pal.ink), `${style} ${visual.template} uses ${style}.ink`);
      for (const ti of out.textItems) {
        assert.notEqual(ti.color, '#1f1f1f', `${style} ${visual.template} textItem ${ti.key} not #1f1f1f`);
      }
    }
  }

  // Legacy theme without style remains compatible with THEME_PALETTE.light / dark
  const legacyLight = renderDiagram(all8[0], { layout: 'full', theme: 'light', seed: 'leg', t: 1 });
  const legacyDark = renderDiagram(all8[0], { layout: 'full', theme: 'dark', seed: 'leg', t: 1 });
  assert.ok(legacyLight.vectorSvg.includes(THEME_PALETTE.light.ink));
  assert.ok(legacyDark.vectorSvg.includes(THEME_PALETTE.dark.ink));
  assert.equal(legacyLight.textItems[0].color, THEME_PALETTE.light.ink);
  assert.equal(legacyDark.textItems[0].color, THEME_PALETTE.dark.ink);
});
