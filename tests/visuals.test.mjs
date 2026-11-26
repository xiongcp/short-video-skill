import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drawIcon, ICONS } from '../skills/topic-to-video/scripts/lib/icons.mjs';
import { DIAGRAM_ZONES, layoutElements, renderDiagram } from '../skills/topic-to-video/scripts/lib/templates.mjs';

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
