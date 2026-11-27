import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { textBox } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { buildShotPlans, evaluateFrame, linkLabelsOverHost } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { chooseLinkLabelT } from '../skills/topic-to-video/scripts/lib/stage.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { fakeTiming, manifest } from './helpers/golden.mjs';

const curve = { p1: [1000, 700], m: [1380, 640], p2: [1700, 720] };
const at = (t) => (1 - t) ** 2 * curve.p1[0] + 2 * (1 - t) * t * curve.m[0] + t ** 2 * curve.p2[0];

test('a label whose midpoint lands on the host moves along the link to clear it', () => {
  const host = { x0: 1310, x1: 1450, y0: 530, y1: 930 };
  const t = chooseLinkLabelT(curve, { w: 60, h: 34 }, host);
  assert.notEqual(t, 0.5);
  const x = at(t);
  assert.ok(x + 30 < host.x0 || x - 30 > host.x1, `label at x=${x} still covers the host`);
});

test('a label that does not touch the host stays at the midpoint', () => {
  assert.equal(chooseLinkLabelT(curve, { w: 60, h: 34 }, { x0: 200, x1: 340, y0: 530, y1: 930 }), 0.5);
});

test('no link label of the example sh10 lands on the host in any frame', () => {
  const p = JSON.parse(readFileSync(join(import.meta.dirname, '../examples/cache-speed/project.json'), 'utf8'));
  const plan = buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest).find((pl) => pl.id === 'sh10');
  let over = 0;
  for (let f = 0; f < plan.frameCount; f += 2) {
    const { textItems, hostMeta } = evaluateFrame(manifest, plan, f / 60);
    const hb = hostMeta?.bodyBbox;
    if (!hb) continue;
    const hit = textItems.some((it) => it.key.startsWith('stage-link-') && (it.opacity ?? 1) > 0.02 && (() => {
      const b = textBox(it);
      return b.x < hb.x + hb.w && b.x + b.w > hb.x && b.y < hb.y + hb.h && b.y + b.h > hb.y;
    })());
    if (hit) over += 1;
  }
  assert.equal(over, 0);
});

test('linkLabelsOverHost counts only visible link labels that touch the host box', () => {
  const host = { x: 100, y: 500, w: 94, h: 430 };
  const label = (key, x, opacity = 1) => ({ key, text: '304', x, y: 700, fontSize: 30, opacity });
  assert.equal(linkLabelsOverHost([label('stage-link-0', 140)], host), true);
  assert.equal(linkLabelsOverHost([label('stage-link-0', 600)], host), false);
  assert.equal(linkLabelsOverHost([label('stage-link-0', 140, 0)], host), false);
  assert.equal(linkLabelsOverHost([label('stage-obj-0', 140)], host), false);
});
