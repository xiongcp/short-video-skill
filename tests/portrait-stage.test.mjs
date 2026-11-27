import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES, textOutsideSafe } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { evaluateHostAt, resolveStandX } from '../skills/topic-to-video/scripts/lib/motion.mjs';
import { checkProject } from '../skills/topic-to-video/scripts/lib/project.mjs';
import { layoutStage, renderStage } from '../skills/topic-to-video/scripts/lib/stage.mjs';
import { manifest, sceneTour } from './helpers/golden.mjs';

const P = FRAMES['9:16'];
const three = { objects: [{ prop: 'fridge', label: '冰箱', at: 'left' }, { prop: 'box', label: '箱子', at: 'center' }, { prop: 'shop', label: '超市', at: 'right', size: 'sm' }] };

test('portrait stage lays three objects inside the portrait bounds on ground 1180', () => {
  const lay = layoutStage(three, { frame: P });
  assert.equal(lay.ok, true);
  for (const el of lay.elements) {
    assert.ok(el.bbox.x >= P.stage.bounds.minX - 1e-6 && el.bbox.x + el.bbox.w <= P.stage.bounds.maxX + 1e-6, `${el.prop} x`);
    if (el.layer === 'ground') assert.ok(Math.abs(el.bbox.y + el.bbox.h - 1180) < 1e-6, `${el.prop} on the ground`);
  }
  assert.ok(lay.hostX >= P.stage.hostMinX && lay.hostX <= P.stage.hostMaxX);
});

test('portrait stage with five ground objects is crowded, landscape is not', () => {
  const five = { objects: ['fridge', 'box', 'shop', 'table', 'chair'].map((prop) => ({ prop })) };
  assert.equal(layoutStage(five, { frame: P }).crowded, true);
  assert.equal(layoutStage(five).crowded, false);
});

test('resolveStandX uses the portrait spots and walk bounds', () => {
  assert.equal(resolveStandX('left', 490, [], P), 200);
  assert.equal(resolveStandX('center', 200, [], P), 490);
  assert.equal(resolveStandX('right', 200, [], P), 780);
  const edge = [{ bbox: { x: 880, y: 1000, w: 150, h: 180 } }];
  assert.ok(resolveStandX(0, 1000, edge, P) <= P.walk.maxX);
  assert.equal(resolveStandX('right', 320, []), 1600, 'landscape default unchanged');
});

test('evaluateHostAt walks to the portrait right spot and stands on the portrait ground', () => {
  const plan = {
    seed: 'sh-p', style: 'paper', durationSec: 4, frame: P,
    startState: { x: 200, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' },
    elements: [],
    cues: [{ sentence: 0, do: 'move', target: 'right', timeMs: 100 }],
    sentences: [{ index: 0, startMs: 0, endMs: 4000, text: '我们去右边。' }],
  };
  const end = evaluateHostAt(manifest, plan, 4);
  assert.ok(Math.abs(end.x - 780) < 1, `x=${end.x}`);
  assert.ok(Math.abs(end.bodyBbox.y + end.bodyBbox.h - 1180) < 1, 'feet on 1180');
});

test('renderStage puts the portrait heading in the title band', () => {
  const res = renderStage({ ...three, heading: '冰箱与超市' }, { frame: P, layoutResult: layoutStage(three, { frame: P }) });
  const heading = res.textItems.find((t) => t.key === 'stage-heading');
  assert.deepEqual([heading.x, heading.y], [540, 300]);
});

test('checkProject reports STAGE_CROWDED with the portrait geometry only for 9:16 projects', () => {
  const p = sceneTour();
  p.shots[0].visual.data.objects = ['fridge', 'box', 'shop', 'table', 'chair'].map((prop) => ({ prop }));
  p.shots[0].cues = [];
  assert.ok(!checkProject(p).some((e) => e.code === 'STAGE_CROWDED'), '16:9 fits');
  p.settings.ratio = '9:16';
  const crowded = checkProject(p).filter((e) => e.code === 'STAGE_CROWDED');
  assert.equal(crowded.length, 1);
  assert.match(crowded[0].message, /竖屏/);
});

test('checkProject falls back to 16:9 for prototype-key settings.ratio without throwing', () => {
  for (const ratio of ['constructor', 'toString']) {
    const p = sceneTour();
    p.settings.ratio = ratio;
    p.shots[0].visual.data.objects = ['fridge', 'box', 'shop', 'table', 'chair'].map((prop) => ({ prop }));
    p.shots[0].cues = [];
    const errs = checkProject(p);
    assert.ok(Array.isArray(errs));
    assert.ok(!errs.some((e) => e.code === 'STAGE_CROWDED'), `${ratio} falls back to 16:9`);
  }
});

test('portrait stage opens a host corridor for sh10-like 3 lower props and sh13-like 2 props without overlap', () => {
  const sh10 = {
    objects: [
      { prop: 'phone', label: '问超市', at: 'left' },
      { prop: 'shop', label: '超市', at: 'center', size: 'sm' },
      { prop: 'ticket', label: '缓存单', at: 'right' },
    ],
  };
  const lay10 = layoutStage(sh10, { hostAt: 0.72, frame: P });
  assert.equal(lay10.ok, true);
  assert.equal(lay10.crowded, false);
  const half = P.stage.bounds.hostClearWidth / 2;
  for (const el of lay10.elements) {
    assert.ok(el.bbox.x + el.bbox.w <= lay10.hostX - half + 1e-6 || el.bbox.x >= lay10.hostX + half - 1e-6, `${el.prop} clears host corridor`);
  }

  const sh13 = {
    objects: [
      { prop: 'fridge', label: '缓存', at: 'center' },
      { prop: 'ticket', label: '状态码', at: 'right', state: 'count:304' },
    ],
  };
  const lay13 = layoutStage(sh13, { hostAt: 'mid-right', frame: P });
  assert.equal(lay13.ok, true);
  assert.ok(lay13.hostX >= lay13.elements[0].bbox.x + lay13.elements[0].bbox.w + half - 1e-6, `host right of fridge: ${lay13.hostX}`);
  assert.ok(lay13.hostX <= lay13.elements[1].bbox.x - half + 1e-6, `host left of ticket: ${lay13.hostX}`);
});

test('portrait renderStage keeps edge prop labels, link labels and count badges inside textSafe at 1.03 zoom', () => {
  const [cx, cy] = P.center;
  const zoom = (items) => items.map((ti) => ({ ...ti, x: cx + (ti.x - cx) * 1.03, y: cy + (ti.y - cy) * 1.03 }));

  const sh10 = {
    objects: [
      { prop: 'phone', label: '问超市', at: 'left' },
      { prop: 'shop', label: '超市', at: 'center', size: 'sm' },
      { prop: 'ticket', label: '缓存单', at: 'right' },
    ],
    links: [{ from: 0, to: 1, label: '问一次超市' }],
  };
  const lay10 = layoutStage(sh10, { hostAt: 0.72, frame: P });
  const res10 = renderStage(sh10, { frame: P, layoutResult: lay10 });
  assert.deepEqual(textOutsideSafe(zoom(res10.textItems), P), []);

  const sh13 = {
    objects: [
      { prop: 'fridge', label: '缓存', at: 'center' },
      { prop: 'ticket', label: '状态码', at: 'right', state: 'count:304' },
    ],
  };
  const lay13 = layoutStage(sh13, { hostAt: 'mid-right', frame: P });
  const res13 = renderStage(sh13, { frame: P, layoutResult: lay13 });
  assert.deepEqual(textOutsideSafe(zoom(res13.textItems), P), []);
});
