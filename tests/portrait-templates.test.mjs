import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES, textBox } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { layoutElements, renderDiagram } from '../skills/topic-to-video/scripts/lib/templates.mjs';

const P = FRAMES['9:16'];
const VISUALS = {
  title: { template: 'title', data: { heading: '一二三四五六七八九十一二三四五六', sub: '一二三四五六七八九十一二三四五六七八九十一二三四' } },
  bullets: { template: 'bullets', data: { items: ['一二三四五六七八九十一二三四', '短', '中等长度', '第四条'] } },
  flow: { template: 'flow', data: { nodes: ['一二三四五六', '二', '三', '四', '五'] } },
  compare: { template: 'compare', data: { left: { label: '一二三四五六七八', rows: ['一二三四五六七八九十一二', '二', '三'] }, right: { label: '右', rows: ['一二三四五六七八九十一二'] } } },
  number: { template: 'number', data: { value: '12345678', label: '一二三四五六七八九十一二' } },
  bars: { template: 'bars', data: { items: [1, 2, 3, 4, 5].map((v) => ({ label: `第${v}`, value: v * 10 })), unit: '毫秒' } },
  timeline: { template: 'timeline', data: { items: ['一', '二', '三', '四', '五'].map((d) => ({ time: `第${d}天`, label: '一二三四五六七八' })) } },
  cycle: { template: 'cycle', data: { items: ['请求', '缓存', '复用', '过期', '再问'].map((label) => ({ label })) } },
};
const inside = (b, s) => b.x >= s.x - 1e-6 && b.y >= s.y - 1e-6 && b.x + b.w <= s.x + s.w + 1e-6 && b.y + b.h <= s.y + s.h + 1e-6;
const overlap = (a, b) => a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 && a.y < b.y + b.h - 1e-6 && a.y + a.h > b.y + 1e-6;

for (const layout of ['host-left', 'full']) {
  for (const [name, visual] of Object.entries(VISUALS)) {
    test(`portrait ${layout} ${name}: elements inside the zone, no overlap, text inside the safe box`, () => {
      const zone = P.zones[layout];
      const els = layoutElements(visual, layout, null, P);
      els.forEach((el, i) => {
        assert.ok(inside(el.bbox, zone), `${name}[${i}] inside zone`);
        els.slice(i + 1).forEach((o, j) => assert.ok(!overlap(el.bbox, o.bbox), `${name}[${i}] vs [${i + 1 + j}]`));
      });
      const res = renderDiagram(visual, { layout, frame: P, t: 5, duration: 5 });
      for (const ti of res.textItems) assert.ok(inside(textBox(ti), P.textSafe), `${name} text ${ti.key} at ${ti.x},${ti.y} size ${ti.fontSize}`);
    });
  }
}

test('portrait flow stacks nodes top to bottom with downward arrows; bullets use one column', () => {
  const flow = layoutElements(VISUALS.flow, 'full', null, P);
  for (let i = 1; i < flow.length; i += 1) assert.ok(flow[i].bbox.y >= flow[i - 1].bbox.y + flow[i - 1].bbox.h);
  const bullets = layoutElements(VISUALS.bullets, 'host-left', null, P);
  assert.equal(new Set(bullets.map((b) => b.bbox.x)).size, 1);
});

test('portrait timeline alternates cards left and right of a vertical axis; cycle is nearly round', () => {
  const tl = layoutElements(VISUALS.timeline, 'full', null, P);
  const axisX = P.zones.full.x + P.zones.full.w / 2;
  tl.forEach((el, i) => assert.ok(i % 2 === 0 ? el.bbox.x + el.bbox.w <= axisX : el.bbox.x >= axisX));
  const cy = layoutElements(VISUALS.cycle, 'full', null, P).map((e) => [e.bbox.x + e.bbox.w / 2, e.bbox.y + e.bbox.h / 2]);
  const xs = cy.map((c) => c[0]);
  const ys = cy.map((c) => c[1]);
  const rx = (Math.max(...xs) - Math.min(...xs)) / 2;
  const ry = (Math.max(...ys) - Math.min(...ys)) / 2;
  assert.ok(rx / ry < 1.3, `rx/ry=${rx / ry}`);
});
