import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutStage,
  renderStage,
  SIZE_MULTIPLIERS,
  STAGE_BOUNDS,
  STAGE_SLOTS,
} from '../skills/topic-to-video/scripts/lib/stage.mjs';
import { GROUND_Y, STYLE_PALETTES } from '../skills/topic-to-video/scripts/lib/world.mjs';
import { PROP_META } from '../skills/topic-to-video/scripts/lib/icons.mjs';
import { drawHost, forwardKinematics } from '../skills/topic-to-video/scripts/lib/rig.mjs';
import { evaluateHostAt, resolveStandX } from '../skills/topic-to-video/scripts/lib/motion.mjs';

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/assets/host/manifest.json'), 'utf8'));

const SAMPLE_FISHTANK = {
  id: 'c_fishtank',
  label: '鱼缸',
  height: 0.5,
  layer: 'ground',
  parts: [
    { shape: 'rect', x: -0.9, y: -0.5, w: 1.8, h: 1.5, fill: 'soft_accent' },
    { shape: 'circle', cx: -0.3, cy: 0.2, r: 0.15, fill: 'yellow' },
  ],
};

function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test('stage constants match spec and slot/ratio positioning and size multipliers work accurately', () => {
  assert.deepEqual(STAGE_SLOTS, {
    left: 240,
    'mid-left': 600,
    center: 960,
    'mid-right': 1320,
    right: 1680,
  });
  assert.deepEqual(SIZE_MULTIPLIERS, { sm: 0.75, md: 1, lg: 1.3 });
  assert.deepEqual(STAGE_BOUNDS, {
    minX: 120,
    maxX: 1800,
    titleTop: 48,
    titleBottom: 150,
    airTopMin: 160,
    airBottomMax: 470,
    midDefaultBottom: 762,
    subtitleSafeY: 950,
    gap: 40,
    hostClearWidth: 200,
    minScale: 0.6,
  });

  // Check each named slot independently
  for (const [slot, expectedX] of Object.entries(STAGE_SLOTS)) {
    const res = layoutStage({
      objects: [{ prop: 'box', label: '箱子', at: slot }],
    });
    assert.equal(res.ok, true);
    assert.equal(res.crowded, false);
    assert.equal(res.scale, 1);
    const el = res.elements[0];
    const center = el.bbox.x + el.bbox.w / 2;
    assert.ok(Math.abs(center - expectedX) < 1e-6, `slot ${slot} center=${center} expected=${expectedX}`);
  }

  // Ratio 0.5 -> 960, ratio 0.2 -> 384
  const ratioRes = layoutStage({
    objects: [
      { prop: 'cup', label: 'A', at: 0.2 },
      { prop: 'cup', label: 'B', at: 0.5 },
    ],
  });
  assert.ok(Math.abs((ratioRes.elements[0].bbox.x + ratioRes.elements[0].bbox.w / 2) - 384) < 1e-6);
  assert.ok(Math.abs((ratioRes.elements[1].bbox.x + ratioRes.elements[1].bbox.w / 2) - 960) < 1e-6);

  // Size multipliers: sm=0.75, md=1, lg=1.3
  const sizeRes = layoutStage({
    objects: [
      { prop: 'box', at: 'left', size: 'sm' },
      { prop: 'box', at: 'center', size: 'md' },
      { prop: 'box', at: 'right', size: 'lg' },
    ],
  });
  assert.equal(sizeRes.ok, true);
  assert.equal(sizeRes.scale, 1);
  const baseH = 400 * PROP_META.box.height;
  assert.ok(Math.abs(sizeRes.elements[0].bbox.h - baseH * 0.75) < 1e-6);
  assert.ok(Math.abs(sizeRes.elements[1].bbox.h - baseH * 1.0) < 1e-6);
  assert.ok(Math.abs(sizeRes.elements[2].bbox.h - baseH * 1.3) < 1e-6);
});

test('vertical layers place ground at y=930, mid on same-slot ground top or y=762, and air in [160, 470]', () => {
  const res = layoutStage({
    objects: [
      { prop: 'table', label: '桌子', at: 'center' },
      { prop: 'cup', label: '咖啡', at: 'center' },
      { prop: 'laptop', label: '电脑', at: 'left' },
      { prop: 'cloud', label: '云端', at: 'right' },
    ],
  });
  assert.equal(res.ok, true);
  const [table, cup, laptop, cloud] = res.elements;

  // ground touches GROUND_Y = 930
  assert.equal(table.layer, 'ground');
  assert.ok(Math.abs((table.bbox.y + table.bbox.h) - GROUND_Y) < 1e-6);

  // mid stacked on same-slot ground object rests on table.bbox.y
  assert.equal(cup.layer, 'mid');
  assert.ok(Math.abs((cup.bbox.y + cup.bbox.h) - table.bbox.y) < 1e-6, `cup bottom=${cup.bbox.y + cup.bbox.h}, table top=${table.bbox.y}`);

  // standalone mid rests at y = 762
  assert.equal(laptop.layer, 'mid');
  assert.ok(Math.abs((laptop.bbox.y + laptop.bbox.h) - STAGE_BOUNDS.midDefaultBottom) < 1e-6);

  // air stays inside [160, 470]
  assert.equal(cloud.layer, 'air');
  assert.ok(cloud.bbox.y >= STAGE_BOUNDS.airTopMin - 1e-6);
  assert.ok(cloud.bbox.y + cloud.bbox.h <= STAGE_BOUNDS.airBottomMax + 1e-6);

  // anchors are in world pixel coordinates inside bbox & standSpots clamped to [120, 1800]
  for (const el of res.elements) {
    for (const k of ['handle', 'top', 'front']) {
      const pt = el.anchors[k];
      assert.ok(Array.isArray(pt) && pt.length === 2);
      assert.ok(pt[0] >= el.bbox.x - 1e-6 && pt[0] <= el.bbox.x + el.bbox.w + 1e-6);
      assert.ok(pt[1] >= el.bbox.y - 1e-6 && pt[1] <= el.bbox.y + el.bbox.h + 1e-6);
    }
    assert.ok(el.standSpots.left >= 120 && el.standSpots.left <= 1800);
    assert.ok(el.standSpots.right >= 120 && el.standSpots.right <= 1800);
  }
  assert.ok(table.anchors.seat, 'table has world-space seat anchor');
});

test('same-layer overlap pushes objects apart >= 40px within stage bounds and reserves 200px clear hostX', () => {
  // Two ground objects placed at the exact same slot
  const res = layoutStage({
    objects: [
      { prop: 'fridge', label: '冰箱', at: 'center' },
      { prop: 'server', label: '服务器', at: 'center' },
      { prop: 'cloud', label: '云1', at: 'mid-right' },
      { prop: 'plane', label: '飞机', at: 'mid-right' },
    ],
  });
  assert.equal(res.ok, true);
  const [fridge, server, cloud, plane] = res.elements;

  const groundPair = [fridge, server].sort((a, b) => a.bbox.x - b.bbox.x);
  assert.ok(groundPair[1].bbox.x - (groundPair[0].bbox.x + groundPair[0].bbox.w) >= 40 - 1e-6);

  const airPair = [cloud, plane].sort((a, b) => a.bbox.x - b.bbox.x);
  assert.ok(airPair[1].bbox.x - (airPair[0].bbox.x + airPair[0].bbox.w) >= 40 - 1e-6);

  for (const el of res.elements) {
    assert.ok(el.bbox.x >= 120 - 1e-6);
    assert.ok(el.bbox.x + el.bbox.w <= 1800 + 1e-6);
    assert.ok(el.bbox.y >= 160 - 1e-6);
    assert.ok(el.bbox.y + el.bbox.h < 950);
  }

  // Host clearance when prevHostX is clear vs occupied
  const clearPref = layoutStage(
    { objects: [{ prop: 'fridge', at: 'center' }] },
    { prevHostX: 320 },
  );
  assert.equal(clearPref.hostX, 320);

  // prevHostX = 320 is occupied by shop at left/320 -> picks nearest clear spot with 200px clearance
  const occupiedPref = layoutStage(
    { objects: [{ prop: 'shop', at: 0.2 }] },
    { prevHostX: 320 },
  );
  assert.equal(occupiedPref.ok, true);
  const shop = occupiedPref.elements[0];
  const hostZone = { x: occupiedPref.hostX - 100, y: 530, w: 200, h: 400 };
  assert.equal(boxesOverlap(hostZone, shop.bbox), false, 'host 200px corridor must not overlap ground object');
  assert.notEqual(occupiedPref.hostX, 320);

  // Explicit hostAt overrides prevHostX when clear
  const explicitHost = layoutStage(
    { objects: [{ prop: 'fridge', at: 'left' }] },
    { hostAt: 'right', prevHostX: 600 },
  );
  assert.equal(explicitHost.hostX, 1680);
});

test('cross-layer 2D overlap and host avoidance for freestanding mid objects', () => {
  // 1. Freestanding mid (browser at mid-left) + tall ground (shop at center) do not overlap in 2D
  const freestandingPlusGround = layoutStage({
    objects: [
      { prop: 'browser', label: '浏览器', at: 'mid-left' },
      { prop: 'shop', label: '超市', at: 'center' },
    ],
  });
  assert.equal(freestandingPlusGround.ok, true);
  const [browserEl, shopEl] = freestandingPlusGround.elements;
  assert.equal(boxesOverlap(browserEl.bbox, shopEl.bbox), false, 'freestanding mid must not overlap tall ground in 2D');
  assert.ok(shopEl.bbox.x - (browserEl.bbox.x + browserEl.bbox.w) >= 40 - 1e-6);

  // 2. Stacked mid on tall ground + air in the same column do not overlap in 2D (scales down cleanly, or crowded if impossible)
  const stackedPlusAir = layoutStage({
    objects: [
      { prop: 'shop', label: '超市', at: 'center' },
      { prop: 'browser', label: '招牌屏', at: 'center' },
      { prop: 'cloud', label: '云端', at: 'center' },
    ],
  });
  assert.equal(stackedPlusAir.ok, true);
  assert.ok(stackedPlusAir.scale < 1 && stackedPlusAir.scale >= 0.6);
  const [sShop, sBrowser, sCloud] = stackedPlusAir.elements;
  assert.ok(Math.abs((sBrowser.bbox.y + sBrowser.bbox.h) - sShop.bbox.y) < 1e-6);
  assert.equal(boxesOverlap(sBrowser.bbox, sCloud.bbox), false, 'stacked mid must not overlap air in 2D');

  const impossibleStackAir = layoutStage({
    objects: [
      { prop: 'shop', at: 'center', size: 'lg' },
      { prop: 'browser', at: 'center', size: 'lg' },
      { prop: 'window', at: 'center', size: 'lg' },
    ],
  });
  assert.equal(impossibleStackAir.ok, false);
  assert.equal(impossibleStackAir.crowded, true);

  // 3. Stage with only freestanding mid (browser at left) avoids host corridor around prevHostX=320
  const midOnlyHost = layoutStage(
    { objects: [{ prop: 'browser', label: '浏览器', at: 'left' }] },
    { prevHostX: 320 },
  );
  assert.equal(midOnlyHost.ok, true);
  const [midBrowser] = midOnlyHost.elements;
  const hostZone = { x: midOnlyHost.hostX - 100, y: 530, w: 200, h: 400 };
  assert.equal(boxesOverlap(hostZone, midBrowser.bbox), false, 'host 200px corridor must avoid freestanding mid intersecting host height');
  assert.notEqual(midOnlyHost.hostX, 320);
});

test('crowded stage scales down >= 0.6 first and reports ok=false crowded=true when 0.6 still cannot fit', () => {
  // 5 lg boxes across all 5 slots have no 200px host gap at scale=1.0, so auto-scale shrinks to fit (>= 0.6)
  const scaledBoxes = layoutStage({
    objects: [
      { prop: 'box', at: 'left', size: 'lg' },
      { prop: 'box', at: 'mid-left', size: 'lg' },
      { prop: 'box', at: 'center', size: 'lg' },
      { prop: 'box', at: 'mid-right', size: 'lg' },
      { prop: 'box', at: 'right', size: 'lg' },
    ],
  });
  assert.equal(scaledBoxes.ok, true);
  assert.equal(scaledBoxes.crowded, false);
  assert.ok(scaledBoxes.scale < 1 && scaledBoxes.scale >= 0.6, `expected scale in [0.6, 1), got ${scaledBoxes.scale}`);

  // 5 lg servers exceed [120, 1800] width at scale=1.0, so auto-scale shrinks to fit (>= 0.6)
  const scaledServers = layoutStage({
    objects: [
      { prop: 'server', at: 'center', size: 'lg' },
      { prop: 'server', at: 'center', size: 'lg' },
      { prop: 'server', at: 'center', size: 'lg' },
      { prop: 'server', at: 'center', size: 'lg' },
      { prop: 'server', at: 'center', size: 'lg' },
    ],
  });
  assert.equal(scaledServers.ok, true);
  assert.equal(scaledServers.crowded, false);
  assert.ok(scaledServers.scale < 1 && scaledServers.scale >= 0.6, `expected scale in [0.6, 1), got ${scaledServers.scale}`);

  for (const res of [scaledBoxes, scaledServers]) {
    const sorted = [...res.elements].sort((a, b) => a.bbox.x - b.bbox.x);
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(sorted[i].bbox.x - (sorted[i - 1].bbox.x + sorted[i - 1].bbox.w) >= 40 - 1e-6);
    }
    const hostBox = { x: res.hostX - 100, y: 530, w: 200, h: 400 };
    for (const el of sorted) {
      assert.equal(boxesOverlap(hostBox, el.bbox), false);
      assert.ok(el.bbox.x >= 120 - 1e-6 && el.bbox.x + el.bbox.w <= 1800 + 1e-6);
    }
  }

  // 5 lg huge ground objects exceed capacity even at scale 0.6 -> crowded
  const tooCrowded = layoutStage({
    objects: [
      { prop: 'shop', at: 'left', size: 'lg' },
      { prop: 'house', at: 'mid-left', size: 'lg' },
      { prop: 'car', at: 'center', size: 'lg' },
      { prop: 'truck', at: 'mid-right', size: 'lg' },
      { prop: 'whiteboard', at: 'right', size: 'lg' },
    ],
  });
  assert.equal(tooCrowded.ok, false);
  assert.equal(tooCrowded.crowded, true);
});

test('layoutStage is deterministic and renderStage emits pure vectorSvg, heading, smart labels, links, count:* badges, and states', () => {
  const visualData = {
    heading: '家门口的冰箱',
    objects: [
      { prop: 'table', label: '工作台', at: 'mid-left' },
      { prop: 'cup', label: '热咖啡', at: 'mid-left', state: 'count:12' },
      { prop: 'window', label: '天窗', at: 'center', size: 'lg' },
      { prop: 'c_fishtank', label: '鱼缸', at: 'right', state: 'active' },
    ],
    links: [
      { from: 0, to: 3, style: 'dashed', label: '很远' },
      { from: 1, to: 0, style: 'solid', label: '放在上面' },
    ],
  };

  const layA = layoutStage(visualData, { customProps: [SAMPLE_FISHTANK] });
  const layB = layoutStage(visualData, { customProps: [SAMPLE_FISHTANK] });
  assert.deepEqual(layA, layB);
  assert.equal(layA.links.length, 2);
  for (const lnk of layA.links) {
    assert.ok(Array.isArray(lnk.fromPt) && lnk.fromPt.length === 2);
    assert.ok(Array.isArray(lnk.toPt) && lnk.toPt.length === 2);
  }

  const outA = renderStage(visualData, {
    style: 'chalkboard',
    seed: 'sh05',
    t: 1,
    duration: 4,
    customProps: [SAMPLE_FISHTANK],
    layoutResult: layA,
  });
  const outB = renderStage(visualData, {
    style: 'chalkboard',
    seed: 'sh05',
    t: 1,
    duration: 4,
    customProps: [SAMPLE_FISHTANK],
  });

  assert.equal(outA.vectorSvg, outB.vectorSvg);
  assert.deepEqual(outA.textItems, outB.textItems);
  assert.equal(outA.frontVectorSvg, '');
  assert.equal(outA.vectorSvg, outA.backVectorSvg + outA.frontVectorSvg);
  assert.ok(!outA.vectorSvg.includes('<text'), 'vectorSvg must contain zero <text>');
  assert.ok(!outA.vectorSvg.includes('#1f1f1f'), 'chalkboard style must not emit light ink');
  assert.ok(outA.vectorSvg.includes(STYLE_PALETTES.chalkboard.ink));
  assert.ok(outA.vectorSvg.includes('data-icon="c_fishtank"'));
  assert.ok(outA.vectorSvg.includes('data-badge="count"'));
  assert.ok(outA.vectorSvg.includes('data-link="0"') && outA.vectorSvg.includes('data-link-style="dashed"'));
  assert.ok(outA.vectorSvg.includes('data-link="1"') && outA.vectorSvg.includes('data-link-style="solid"'));

  // Heading at y=92
  const headingItem = outA.textItems.find((ti) => ti.text === '家门口的冰箱');
  assert.ok(headingItem);
  assert.equal(headingItem.y, 92);

  // table label conflicts with cup resting on top of table -> moves to table.y + table.h * 0.55
  const tableEl = layA.elements[0];
  const tableLabel = outA.textItems.find((ti) => ti.text === '工作台');
  assert.ok(tableLabel);
  assert.ok(Math.abs(tableLabel.y - (tableEl.bbox.y + tableEl.bbox.h * 0.55)) < 1e-6);

  // window (lg air) has y = 179.8 so y - 24 = 155.8 < 160 -> moves to window.y + window.h * 0.55
  const winEl = layA.elements[2];
  const winLabel = outA.textItems.find((ti) => ti.text === '天窗');
  assert.ok(winLabel);
  assert.ok(Math.abs(winLabel.y - (winEl.bbox.y + winEl.bbox.h * 0.55)) < 1e-6);

  // fishtank has nothing above or <160 -> stays at y - 24
  const tankEl = layA.elements[3];
  const tankLabel = outA.textItems.find((ti) => ti.text === '鱼缸');
  assert.ok(tankLabel);
  assert.ok(Math.abs(tankLabel.y - (tankEl.bbox.y - 24)) < 1e-6);

  // count:12 emits '12' textItem centered inside count badge circle
  const countItem = outA.textItems.find((ti) => ti.text === '12');
  assert.ok(countItem);
  const cupEl = layA.elements[1];
  const rad = Math.max(16, Math.min(28, Math.min(cupEl.bbox.w, cupEl.bbox.h) * 0.24));
  assert.ok(Math.abs(countItem.x - (cupEl.bbox.x + cupEl.bbox.w - rad * 0.25)) < 1e-6);
  assert.ok(Math.abs(countItem.y - (cupEl.bbox.y + rad * 0.25)) < 1e-6);

  // link labels present
  assert.ok(outA.textItems.find((ti) => ti.text === '很远'));
  assert.ok(outA.textItems.find((ti) => ti.text === '放在上面'));

  // elementStates: highlight, reveal (opacity: 0), tapShake
  const hiddenOut = renderStage(visualData, {
    style: 'paper',
    seed: 'sh05',
    customProps: [SAMPLE_FISHTANK],
    elementStates: [
      { opacity: 1, highlight: 1, tapShake: 1 },
      { opacity: 0, dy: 24, scale: 0.96 },
      { opacity: 1 },
      { opacity: 1 },
    ],
  });
  assert.ok(hiddenOut.vectorSvg.includes('data-highlight="0"'));
  assert.ok(hiddenOut.vectorSvg.includes('rotate(2)'));
  assert.equal(hiddenOut.textItems.find((ti) => ti.text === '热咖啡'), undefined);
  assert.equal(hiddenOut.textItems.find((ti) => ti.text === '12'), undefined);
});

test('stage move uses standSpots empty side, tap reaches anchors.front with tapImpact > 0.5, and drawHost supports style', () => {
  // 1. resolveStandX respects standSpots and avoids blocked edge spot
  const edgeLay = layoutStage({ objects: [{ prop: 'fridge', at: 'left' }] }, { hostAt: 'right' });
  assert.equal(resolveStandX(0, 120, edgeLay.elements), Math.round(edgeLay.elements[0].standSpots.right));

  // 2. move to stage object 0 stands on empty side within reach of anchors.front, and tap hits anchors.front
  const lay = layoutStage({ objects: [{ prop: 'doc', label: '文件', at: 'center' }] }, { prevHostX: 320 });
  const docEl = lay.elements[0];
  const plan = {
    seed: 'sh-tap',
    style: 'chalkboard',
    durationSec: 4,
    ground: GROUND_Y,
    startState: { x: lay.hostX, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' },
    elements: lay.elements,
    cues: [
      { sentence: 0, do: 'move', target: 0, timeMs: 100 },
      { sentence: 0, do: 'gesture', target: 'tap', timeMs: 100 },
    ],
    sentences: [{ index: 0, startMs: 0, endMs: 4000, text: '看这份文件。' }],
  };
  // Move 320 -> ~838 at 360px/s takes ~1.44s, starting at 0.1s -> ends ~1.54s; tap peaks at +0.3s (~1.84s)
  let peakTap = null;
  for (let t = 1.5; t <= 2.4; t += 0.02) {
    const s = evaluateHostAt(manifest, plan, t);
    if (s.gesture === 'tap' && (!peakTap || s.tapImpact > peakTap.tapImpact)) peakTap = s;
  }
  assert.ok(peakTap, 'tap plays after arriving at stage object');
  assert.ok(peakTap.tapImpact > 0.5, `expected tapImpact > 0.5, got ${peakTap.tapImpact}`);
  assert.ok(Math.abs(peakTap.x - docEl.standSpots.left) <= 3, `host stands at empty left standSpot (${peakTap.x} vs ${docEl.standSpots.left})`);
  assert.equal(peakTap.style, 'chalkboard');

  const fk = forwardKinematics(manifest, peakTap.angles, {
    view: peakTap.view,
    facing: peakTap.facing,
    x: peakTap.x,
    ground: peakTap.ground,
    lift: peakTap.lift,
  });
  const handErr = Math.hypot(fk.points.l_hand[0] - docEl.anchors.front[0], fk.points.l_hand[1] - docEl.anchors.front[1]);
  assert.ok(handErr <= 15, `tap hand (${fk.points.l_hand}) should reach anchors.front (${docEl.anchors.front}), err=${handErr.toFixed(2)}`);

  // 3. drawHost accepts style='chalkboard' (dark body ink #f2f2f2, keeps teal scarf #20a5a3)
  const hostSvg = drawHost(manifest, peakTap);
  assert.ok(hostSvg.includes(manifest.ink.body.dark), 'chalkboard uses dark-bg light ink #f2f2f2');
  assert.ok(!hostSvg.includes(manifest.ink.body.light), 'chalkboard does not use #1f1f1f');
  assert.ok(hostSvg.includes(manifest.ink.accent), 'teal scarf #20a5a3 stays constant');
  assert.throws(() => drawHost(manifest, { gesture: 'idle', expr: 'explaining', style: 'invalid_style' }), /unknown style/);
});
