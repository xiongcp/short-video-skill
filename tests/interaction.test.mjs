import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateStageObjects,
  layoutStage,
  renderSendPacket,
  renderStage,
} from '../skills/topic-to-video/scripts/lib/stage.mjs';
import { layoutElements, renderDiagram } from '../skills/topic-to-video/scripts/lib/templates.mjs';
import { drawHost, forwardKinematics } from '../skills/topic-to-video/scripts/lib/rig.mjs';
import { evaluateHostAt, inferSentenceBeat } from '../skills/topic-to-video/scripts/lib/motion.mjs';
import { GROUND_Y } from '../skills/topic-to-video/scripts/lib/world.mjs';

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/assets/host/manifest.json'), 'utf8'));
const H = manifest.height_px;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function makeStagePlan(visualData, cues = [], { hostX = 320, customProps = [] } = {}) {
  const stageLayout = layoutStage(visualData, { prevHostX: hostX, customProps });
  return {
    id: 'sh-test',
    shot: {
      id: 'sh-test',
      layout: 'stage',
      visual: { template: 'stage', data: visualData },
      cues,
    },
    startState: { x: stageLayout.hostX, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' },
    stageLayout,
    elements: stageLayout.elements,
    customProps,
    cues,
  };
}

function makeFlowPlan(visualData, cues = []) {
  const visual = { template: 'flow', data: visualData };
  const elements = layoutElements(visual, 'full');
  return {
    id: 'sh-flow',
    shot: {
      id: 'sh-flow',
      layout: 'full',
      visual,
      cues,
    },
    elements,
    customProps: [],
    cues,
  };
}

function extractPathPoints(svgFragment) {
  const pts = [];
  for (const m of svgFragment.matchAll(/([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)) {
    pts.push([Number(m[2]), Number(m[3])]);
  }
  return pts;
}

function centroidOfSvg(svgFragment) {
  const pts = extractPathPoints(svgFragment);
  assert.ok(pts.length > 0, 'expected path coordinates inside SVG fragment');
  const sum = pts.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
  return [sum[0] / pts.length, sum[1] / pts.length];
}

test('1. state cues transition over 0.3s, open interaction transitions to open, and diagram templates support common overlays', () => {
  const visualData = {
    heading: '状态切换测试',
    objects: [
      { prop: 'doc', label: '文件', at: 'left', state: 'fresh' },
      { prop: 'fridge', label: '冰箱', at: 'center', state: 'closed' },
      { prop: 'box', label: '箱子', at: 'right', state: 'count:1' },
    ],
  };
  const cues = [
    { sentence: 0, do: 'state', target: 0, value: 'expired', timeMs: 1000 },
    { sentence: 0, do: 'open', target: 1, timeMs: 2000 },
    { sentence: 0, do: 'state', target: 2, value: 'crossed', timeMs: 3000 },
    { sentence: 0, do: 'state', target: 2, value: 'count:2', timeMs: 4000 },
  ];
  const plan = makeStagePlan(visualData, cues);

  // Before cue (t = 0.5): initial states intact
  const before = evaluateStageObjects(plan, 0.5, null);
  assert.equal(before.objectStates[0].state, 'fresh');
  assert.equal(before.objectStates[0].stateProgress, 1);
  assert.equal(before.objectStates[1].state, 'closed');
  assert.equal(before.objectStates[2].state, 'count:1');
  const svgBefore = renderStage(visualData, {
    style: 'paper',
    seed: 'st1',
    elementStates: before.objectStates,
    layoutResult: plan.stageLayout,
  });
  assert.ok(svgBefore.vectorSvg.includes('data-state="fresh"'));
  assert.ok(svgBefore.vectorSvg.includes('data-state="closed"'));

  // 0.15s after state cue 0 (t = 1.15): in transition (0 < stateProgress < 1)
  const midState = evaluateStageObjects(plan, 1.15, null);
  assert.equal(midState.objectStates[0].state, 'expired');
  assert.equal(midState.objectStates[0].prevState, 'fresh');
  assert.ok(midState.objectStates[0].stateProgress > 0 && midState.objectStates[0].stateProgress < 1);

  // 0.35s after state cue 0 (t = 1.35): settled as expired
  const afterState = evaluateStageObjects(plan, 1.35, null);
  assert.equal(afterState.objectStates[0].state, 'expired');
  assert.equal(afterState.objectStates[0].stateProgress, 1);
  const svgExpired = renderStage(visualData, {
    style: 'paper',
    seed: 'st1',
    elementStates: afterState.objectStates,
    layoutResult: plan.stageLayout,
  });
  assert.ok(svgExpired.vectorSvg.includes('data-state="expired"'));

  // open interaction cue: during open (t = 2.3) transitioning, after open ends (t = 2.7) settled to 'open'
  const midOpen = evaluateStageObjects(plan, 2.3, null);
  assert.equal(midOpen.objectStates[1].state, 'open');
  assert.ok(midOpen.objectStates[1].stateProgress > 0 && midOpen.objectStates[1].stateProgress < 1);
  const afterOpen = evaluateStageObjects(plan, 2.7, null);
  assert.equal(afterOpen.objectStates[1].state, 'open');
  assert.equal(afterOpen.objectStates[1].stateProgress, 1);
  const svgOpen = renderStage(visualData, {
    style: 'paper',
    seed: 'st1',
    elementStates: afterOpen.objectStates,
    layoutResult: plan.stageLayout,
  });
  assert.ok(svgOpen.vectorSvg.includes('data-state="open"'));

  // crossed state at t = 3.15 (mid) and t = 3.35 (settled)
  const midCross = evaluateStageObjects(plan, 3.15, null);
  assert.ok(midCross.objectStates[2].stateProgress > 0 && midCross.objectStates[2].stateProgress < 1);
  const afterCross = evaluateStageObjects(plan, 3.35, null);
  assert.equal(afterCross.objectStates[2].state, 'crossed');
  assert.equal(afterCross.objectStates[2].stateProgress, 1);
  const svgCross = renderStage(visualData, {
    style: 'paper',
    seed: 'st1',
    elementStates: afterCross.objectStates,
    layoutResult: plan.stageLayout,
  });
  assert.ok(svgCross.vectorSvg.includes('data-state="crossed"'));
  assert.ok(svgCross.vectorSvg.includes('data-overlay="crossed"'));

  // count:* settled after 0.35s, and midpoint (sp=0.5) on a tall fridge keeps digit aligned inside badge circle (<= 1px)
  const afterCount = evaluateStageObjects(plan, 4.35, null);
  assert.equal(afterCount.objectStates[2].state, 'count:2');
  const svgCount = renderStage(visualData, {
    style: 'paper',
    seed: 'st1',
    elementStates: afterCount.objectStates,
    layoutResult: plan.stageLayout,
  });
  assert.ok(svgCount.textItems.some((ti) => ti.key === 'stage-count-2' && ti.text === '2'));

  const fridgeCountVisual = {
    objects: [{ prop: 'fridge', label: '冰箱', at: 'center', state: 'count:1' }],
  };
  const fridgePlan = makeStagePlan(fridgeCountVisual, [
    { sentence: 0, do: 'state', target: 0, value: 'count:2', timeMs: 1000 },
  ]);
  const fridgeMid = evaluateStageObjects(fridgePlan, 1.15, null);
  assert.ok(Math.abs(fridgeMid.objectStates[0].stateProgress - 0.5) < 1e-6);
  const fridgeMidRender = renderStage(fridgeCountVisual, {
    style: 'paper',
    seed: 'cnt-mid',
    elementStates: fridgeMid.objectStates,
    layoutResult: fridgePlan.stageLayout,
  });
  const fridgeBox = fridgePlan.elements[0].bbox;
  const fridgeRad = Math.max(16, Math.min(28, Math.min(fridgeBox.w, fridgeBox.h) * 0.24));
  const expectedBadgeX = fridgeBox.x + fridgeBox.w - fridgeRad * 0.25;
  const expectedBadgeY = fridgeBox.y + fridgeRad * 0.25;
  const badgeText = fridgeMidRender.textItems.find((ti) => ti.key === 'stage-count-0');
  assert.ok(badgeText);
  assert.ok(Math.hypot(badgeText.x - expectedBadgeX, badgeText.y - expectedBadgeY) <= 1, `badge text (${badgeText.x}, ${badgeText.y}) drifted from circle (${expectedBadgeX}, ${expectedBadgeY})`);
  assert.ok(badgeText.fontSize > Math.round(fridgeRad * 1.2), 'flipScale enlarges count fontSize in place');

  // interactionStarts from hostMeta overrides cue.timeMs / 1000
  const delayed = evaluateStageObjects(plan, 1.35, {
    x: 320,
    interactionStarts: new Map([[0, 2.0]]),
  });
  assert.equal(delayed.objectStates[0].state, 'fresh', 'state cue waits for interactionStarts[0]=2.0');

  // Non-stage templates (bullets/cycle/bars) support common state overlays + count:*
  const bullets = { template: 'bullets', data: { items: ['第一项', '第二项', '第三项', '第四项', '第五项', '第六项'] } };
  const diag = renderDiagram(bullets, {
    layout: 'full',
    style: 'paper',
    seed: 'ov1',
    elementStates: [
      { state: 'crossed', stateProgress: 1 },
      { state: 'stamped', stateProgress: 1 },
      { state: 'broken', stateProgress: 1 },
      { state: 'dim', stateProgress: 1 },
      { state: 'active', stateProgress: 1 },
      { state: 'count:42', stateProgress: 1 },
    ],
  });
  assert.ok(!diag.vectorSvg.includes('<text'), 'renderDiagram vectorSvg must stay text-free');
  assert.ok(diag.vectorSvg.includes('data-overlay="crossed"'));
  assert.ok(diag.vectorSvg.includes('data-overlay="stamped"'));
  assert.ok(diag.vectorSvg.includes('data-overlay="broken"'));
  assert.ok(diag.vectorSvg.includes('data-overlay="active"'));
  assert.ok(diag.vectorSvg.includes('data-badge="count"'));
  assert.ok(diag.vectorSvg.includes('opacity="0.45"'), 'dim state lowers opacity to 0.45');
  assert.ok(diag.textItems.some((ti) => ti.text === '42'), 'count:* emits badge digit textItem');

  const cycle = { template: 'cycle', data: { items: [{ label: '一' }, { label: '二' }, { label: '三' }] } };
  const cycleOut = renderDiagram(cycle, {
    layout: 'full',
    style: 'paper',
    seed: 'ov2',
    elementStates: [{ state: 'stamped', stateProgress: 1 }, { state: 'dim', stateProgress: 1 }, { state: 'count:9', stateProgress: 1 }],
  });
  assert.ok(!cycleOut.vectorSvg.includes('<text'));
  assert.ok(cycleOut.vectorSvg.includes('data-overlay="stamped"'));
  assert.ok(cycleOut.vectorSvg.includes('opacity="0.45"'));
  assert.ok(cycleOut.textItems.some((ti) => ti.text === '9'));
});

test('2. push and pull shift dx by ~+-160px away/toward host, clamp to [120, 1800], and overshoot smoothly', () => {
  const visualData = {
    objects: [
      { prop: 'box', label: '中箱', at: 'center' },
      { prop: 'box', label: '边箱', at: 'right' },
    ],
  };

  // Push from left (host at 600 < center 960 -> +160px)
  const pushPlan = makeStagePlan(visualData, [{ sentence: 0, do: 'push', target: 0, timeMs: 1000 }], { hostX: 600 });
  const pushMid = evaluateStageObjects(pushPlan, 1.45, { x: 600 });
  assert.ok(pushMid.objectStates[0].dx > 160, `expected push overshoot > 160 mid-motion, got ${pushMid.objectStates[0].dx}`);
  const pushDone = evaluateStageObjects(pushPlan, 1.8, { x: 600 });
  assert.ok(Math.abs(pushDone.objectStates[0].dx - 160) < 1e-6, `expected +160px push, got ${pushDone.objectStates[0].dx}`);

  // Pull from left (host at 600 < center 960 -> -160px toward host)
  const pullPlan = makeStagePlan(visualData, [{ sentence: 0, do: 'pull', target: 0, timeMs: 1000 }], { hostX: 600 });
  const pullMid = evaluateStageObjects(pullPlan, 1.45, { x: 600 });
  assert.ok(pullMid.objectStates[0].dx < -160, `expected pull overshoot < -160 mid-motion, got ${pullMid.objectStates[0].dx}`);
  const pullDone = evaluateStageObjects(pullPlan, 1.8, { x: 600 });
  assert.ok(Math.abs(pullDone.objectStates[0].dx + 160) < 1e-6, `expected -160px pull, got ${pullDone.objectStates[0].dx}`);

  // Push from right (host at 1400 > center 960 -> -160px away from host)
  const pushRightDone = evaluateStageObjects(pushPlan, 1.8, { x: 1400 });
  assert.ok(Math.abs(pushRightDone.objectStates[0].dx + 160) < 1e-6);

  // Clamping at right stage edge [120, 1800]
  const edgePlan = makeStagePlan(visualData, [{ sentence: 0, do: 'push', target: 1, timeMs: 1000 }], { hostX: 1200 });
  const edgeBox = edgePlan.elements[1].bbox;
  const edgeMid = evaluateStageObjects(edgePlan, 1.45, { x: 1200 });
  const edgeDone = evaluateStageObjects(edgePlan, 1.8, { x: 1200 });
  for (const st of [edgeMid.objectStates[1], edgeDone.objectStates[1]]) {
    assert.ok(edgeBox.x + st.dx >= 120 - 1e-6);
    assert.ok(edgeBox.x + st.dx + edgeBox.w <= 1800 + 1e-6);
  }
  assert.ok(Math.abs(edgeBox.x + edgeDone.objectStates[1].dx + edgeBox.w - 1800) < 1e-6, 'clamped flush to 1800');

  // Walking past pushed object toward an opposite-side interaction cue (auto_approach) must not flip dx
  const walkPlan = makeStagePlan(
    {
      objects: [
        { prop: 'box', label: '中箱', at: 'center' },
        { prop: 'fridge', label: '右冰箱', at: 'right', state: 'closed' },
      ],
    },
    [
      { sentence: 0, do: 'push', target: 0, timeMs: 1000 },
      { sentence: 0, do: 'open', target: 1, timeMs: 2000 },
    ],
    { hostX: 320 },
  );
  const walkStarts = new Map([[0, 1.0], [1, 4.0]]);
  const duringWalkA = evaluateStageObjects(walkPlan, 2.5, { x: 1000, interactionStarts: walkStarts });
  const duringWalkB = evaluateStageObjects(walkPlan, 3.2, { x: 1350, interactionStarts: walkStarts });
  assert.ok(Math.abs(duringWalkA.objectStates[0].dx - 160) < 1e-6, `expected stable +160 during walk past center, got ${duringWalkA.objectStates[0].dx}`);
  assert.ok(Math.abs(duringWalkB.objectStates[0].dx - 160) < 1e-6, `expected stable +160 after crossing center, got ${duringWalkB.objectStates[0].dx}`);

  // Blocked-side placement: fridge blocks box's left standSpot so host stands on right despite startState.x=320; later move keeps -160
  const blockedPlan = makeStagePlan(
    {
      objects: [
        { prop: 'fridge', label: '左冰箱', at: 0.43 },
        { prop: 'box', label: '右箱', at: 'center' },
      ],
    },
    [
      { sentence: 0, do: 'push', target: 1, timeMs: 1000 },
      { sentence: 0, do: 'move', target: 'left', timeMs: 2500 },
    ],
    { hostX: 320 },
  );
  const boxRightSpot = blockedPlan.elements[1].standSpots.right;
  const blockedDuringPush = evaluateStageObjects(blockedPlan, 1.7, { x: boxRightSpot });
  const blockedAfterMove = evaluateStageObjects(blockedPlan, 3.0, { x: 320 });
  assert.ok(Math.abs(blockedDuringPush.objectStates[1].dx + 160) < 1e-6, `expected -160 when pushed from right standSpot, got ${blockedDuringPush.objectStates[1].dx}`);
  assert.ok(Math.abs(blockedAfterMove.objectStates[1].dx + 160) < 1e-6, `expected -160 to stay stable after later move, got ${blockedAfterMove.objectStates[1].dx}`);
});

test('3. carry and hold_up follow handPos/carriedPos into frontVectorSvg and return to backVectorSvg when dropped', () => {
  const visualData = {
    objects: [
      { prop: 'package', label: '包裹', at: 'center' },
      { prop: 'fridge', label: '冰箱', at: 'left' },
    ],
  };
  const plan = makeStagePlan(visualData, [
    { sentence: 0, do: 'carry', target: 0, timeMs: 500 },
    { sentence: 0, do: 'hold_up', target: 0, timeMs: 2000 },
    { sentence: 0, do: 'carry', target: 'none', timeMs: 4000 },
  ]);
  const pkg = plan.elements[0];

  // Carried: follows carriedPos/handPos, placed in frontVectorSvg only
  const carriedMeta = {
    x: 620,
    interacting: true,
    interaction: {
      kind: 'carry',
      targetIdx: 0,
      phase: 'hold',
      handPos: [680, 660],
      carriedIdx: 0,
      carriedPos: [680, 660],
      droppedSpots: {},
    },
  };
  const carriedEval = evaluateStageObjects(plan, 1.0, carriedMeta);
  const cst = carriedEval.objectStates[0];
  assert.equal(cst.carried, true);
  assert.equal(cst.inFront, true);
  assert.ok(Math.abs(pkg.anchors.handle[0] + cst.dx - 680) < 1e-6);
  assert.ok(Math.abs(pkg.anchors.handle[1] + cst.dy - 660) < 1e-6);

  const carriedRender = renderStage(visualData, {
    style: 'paper',
    seed: 'lyr1',
    elementStates: carriedEval.objectStates,
    layoutResult: plan.stageLayout,
  });
  assert.ok(carriedRender.frontVectorSvg.includes('data-icon="package"'));
  assert.ok(!carriedRender.backVectorSvg.includes('data-icon="package"'));
  assert.ok(carriedRender.backVectorSvg.includes('data-icon="fridge"'));

  // Hold up: follows handPos, placed in frontVectorSvg only
  const holdMeta = {
    x: 620,
    interacting: true,
    interaction: {
      kind: 'hold_up',
      targetIdx: 0,
      phase: 'hold',
      handPos: [620, 420],
      carriedIdx: null,
      carriedPos: null,
      droppedSpots: {},
    },
  };
  const holdEval = evaluateStageObjects(plan, 2.5, holdMeta);
  const hst = holdEval.objectStates[0];
  assert.equal(hst.heldUp, true);
  assert.equal(hst.inFront, true);
  assert.ok(Math.abs(pkg.bbox.x + pkg.bbox.w / 2 + hst.dx - 620) < 1e-6);
  assert.ok(Math.abs(pkg.bbox.y + pkg.bbox.h + hst.dy - 420) < 1e-6);

  const holdRender = renderStage(visualData, {
    style: 'paper',
    seed: 'lyr1',
    elementStates: holdEval.objectStates,
    layoutResult: plan.stageLayout,
  });
  assert.ok(holdRender.frontVectorSvg.includes('data-icon="package"'));
  assert.ok(!holdRender.backVectorSvg.includes('data-icon="package"'));

  // Dropped at droppedSpots[0]: returns to backVectorSvg
  const droppedMeta = {
    x: 1100,
    interacting: false,
    interaction: {
      kind: 'idle',
      targetIdx: null,
      phase: null,
      handPos: [1100, 750],
      carriedIdx: null,
      carriedPos: null,
      droppedSpots: { 0: { x: 1160, y: 930 } },
    },
  };
  const dropEval = evaluateStageObjects(plan, 4.2, droppedMeta);
  const dst = dropEval.objectStates[0];
  assert.equal(dst.carried, false);
  assert.equal(dst.heldUp, false);
  assert.equal(dst.inFront, false);
  assert.ok(Math.abs(pkg.bbox.x + pkg.bbox.w / 2 + dst.dx - 1160) < 1e-6);
  assert.ok(Math.abs(pkg.bbox.y + pkg.bbox.h + dst.dy - 930) < 1e-6);

  const dropRender = renderStage(visualData, {
    style: 'paper',
    seed: 'lyr1',
    elementStates: dropEval.objectStates,
    layoutResult: plan.stageLayout,
  });
  assert.equal(dropRender.frontVectorSvg, '');
  assert.ok(dropRender.backVectorSvg.includes('data-icon="package"'));
});

test('4. draw cue reveals object label character by character over [t0, t0 + 1] and full text at t >= t0 + 1', () => {
  const visualData = {
    heading: '白板书写',
    objects: [{ prop: 'whiteboard', label: '缓存命中流程', at: 'center' }],
  };
  const plan = makeStagePlan(visualData, [{ sentence: 0, do: 'draw', target: 0, timeMs: 1000 }]);

  const labelAt = (t, headingOpacity = 1) => {
    const ev = evaluateStageObjects(plan, t, null);
    const r = renderStage(visualData, {
      style: 'paper',
      seed: 'drw1',
      elementStates: ev.objectStates,
      layoutResult: plan.stageLayout,
      headingOpacity,
    });
    return { ev, r, text: r.textItems.find((ti) => ti.key === 'stage-label-0')?.text ?? '' };
  };

  // Before t0: not drawn yet
  const pre = labelAt(0.5);
  assert.equal(pre.ev.objectStates[0].drawProgress, 0);
  assert.equal(pre.text, '');

  // Progressive reveal during [1.0, 2.0]
  const early = labelAt(1.2);
  const mid = labelAt(1.5);
  const late = labelAt(1.8);
  assert.ok(early.text.length >= 1 && early.text.length < '缓存命中流程'.length);
  assert.ok(mid.text.length > early.text.length && mid.text.length < '缓存命中流程'.length);
  assert.ok(late.text.length > mid.text.length && late.text.length < '缓存命中流程'.length);
  assert.ok('缓存命中流程'.startsWith(late.text));

  // Complete at t >= t0 + 1
  const done = labelAt(2.0);
  assert.equal(done.ev.objectStates[0].drawProgress, 1);
  assert.equal(done.text, '缓存命中流程');

  // headingOpacity fades both underline and heading textItem
  const fadedHead = labelAt(2.0, 0.35);
  assert.ok(fadedHead.r.backVectorSvg.includes('opacity="0.35"'));
  assert.equal(fadedHead.r.textItems.find((ti) => ti.key === 'stage-heading').opacity, 0.35);
});

test('5. send cue renders package near quadratic Bezier midpoint at t0+0.4 on stage links[0] and flow arrows, leaves nothing outside [0,0.8], and triggers bump > 0 on arrival', () => {
  // 5a. renderSendPacket unit checks
  assert.equal(renderSendPacket([100, 500], [500, 500], 'package', 0), '');
  assert.equal(renderSendPacket([100, 500], [500, 500], 'package', 1), '');
  assert.equal(renderSendPacket([100, 500], [500, 500], 'package', -0.1), '');
  assert.equal(renderSendPacket([100, 500], [500, 500], 'package', 1.2), '');

  // 5b. Stage links[0] send
  const stageVisual = {
    objects: [
      { prop: 'fridge', label: '缓存', at: 'left' },
      { prop: 'shop', label: '超市', at: 'right' },
    ],
    links: [{ from: 0, to: 1, style: 'solid', label: '请求' }],
  };
  const stagePlan = makeStagePlan(stageVisual, [{ sentence: 0, do: 'send', target: 0, value: 'package', timeMs: 1000 }]);

  // t < t0
  const preSend = evaluateStageObjects(stagePlan, 0.9, null);
  assert.equal(preSend.sends.length, 0);
  assert.equal(preSend.objectStates[1].bump, 0);
  const svgPre = renderStage(stageVisual, {
    style: 'paper',
    seed: 'snd1',
    elementStates: preSend.objectStates,
    sends: preSend.sends,
    layoutResult: stagePlan.stageLayout,
  });
  assert.ok(!svgPre.vectorSvg.includes('data-send-packet'));

  // t = t0 + 0.4 -> u = 0.5, midpoint of Bezier arc in frontVectorSvg
  const midSend = evaluateStageObjects(stagePlan, 1.4, null);
  assert.equal(midSend.sends.length, 1);
  assert.ok(Math.abs(midSend.sends[0].u - 0.5) < 1e-6);
  const svgMid = renderStage(stageVisual, {
    style: 'paper',
    seed: 'snd1',
    elementStates: midSend.objectStates,
    sends: midSend.sends,
    layoutResult: stagePlan.stageLayout,
  });
  assert.ok(!svgMid.vectorSvg.includes('<text'));
  assert.ok(svgMid.frontVectorSvg.includes('data-send-packet="package"'));
  assert.ok(!svgMid.backVectorSvg.includes('data-send-packet'));

  const lnk = stagePlan.stageLayout.links[0];
  const [x1, y1] = lnk.fromPt;
  const [x2, y2] = lnk.toPt;
  const dist = Math.hypot(x2 - x1, y2 - y1) || 1;
  const bendAmt = Math.min(44, dist * 0.12);
  const mx = (x1 + x2) / 2 + ((y2 - y1) / dist) * bendAmt;
  const my = (y1 + y2) / 2 - ((x2 - x1) / dist) * bendAmt;
  const expMidX = 0.25 * x1 + 0.5 * mx + 0.25 * x2;
  const expMidY = 0.25 * y1 + 0.5 * my + 0.25 * y2;
  const pktChunk = svgMid.frontVectorSvg.slice(svgMid.frontVectorSvg.indexOf('data-send-packet="package"'));
  const [pktCx, pktCy] = centroidOfSvg(pktChunk);
  assert.ok(Math.hypot(pktCx - expMidX, pktCy - expMidY) < 12, `packet center (${pktCx}, ${pktCy}) expected near (${expMidX}, ${expMidY})`);

  // t > t0 + 0.85 -> no residual packet, destination object triggers bump > 0
  const arrivalEval = evaluateStageObjects(stagePlan, 1.88, null);
  assert.equal(arrivalEval.sends.length, 0);
  assert.ok(arrivalEval.objectStates[1].bump > 0, `expected bump > 0 after arrival at 0.8s, got ${arrivalEval.objectStates[1].bump}`);
  const svgArrival = renderStage(stageVisual, {
    style: 'paper',
    seed: 'snd1',
    elementStates: arrivalEval.objectStates,
    sends: arrivalEval.sends,
    layoutResult: stagePlan.stageLayout,
  });
  assert.ok(!svgArrival.vectorSvg.includes('data-send-packet'));
  const expScale = Number((1 + 0.08 * arrivalEval.objectStates[1].bump).toFixed(2));
  assert.ok(svgArrival.vectorSvg.includes(`scale(${expScale})`), `expected bounce scale(${expScale}) in SVG`);

  const settledEval = evaluateStageObjects(stagePlan, 2.2, null);
  assert.equal(settledEval.objectStates[1].bump, 0);

  // 5c. Flow arrow send
  const flowVisual = { template: 'flow', data: { nodes: ['起点', '终点'], icons: ['browser', 'server'] } };
  const flowPlan = makeFlowPlan(flowVisual.data, [{ sentence: 0, do: 'send', target: 1, value: 'package', timeMs: 1000 }]);

  const flowPre = evaluateStageObjects(flowPlan, 0.8, null);
  assert.equal(flowPre.sends.length, 0);
  const flowPreSvg = renderDiagram(flowVisual, { layout: 'full', style: 'paper', seed: 'fl1', elementStates: flowPre.objectStates, sends: flowPre.sends });
  assert.ok(!flowPreSvg.vectorSvg.includes('data-send-packet'));

  const flowMid = evaluateStageObjects(flowPlan, 1.4, null);
  assert.equal(flowMid.sends.length, 1);
  assert.equal(flowMid.sends[0].targetIdx, 1);
  const flowMidSvg = renderDiagram(flowVisual, { layout: 'full', style: 'paper', seed: 'fl1', elementStates: flowMid.objectStates, sends: flowMid.sends });
  assert.ok(!flowMidSvg.vectorSvg.includes('<text'));
  assert.ok(flowMidSvg.vectorSvg.includes('data-send-packet="package"'));

  const n0 = flowPlan.elements[0].bbox;
  const n1 = flowPlan.elements[1].bbox;
  const fx1 = n0.x + n0.w + 8;
  const fy1 = n0.y + n0.h / 2;
  const fx2 = n1.x - 8;
  const fy2 = n1.y + n1.h / 2;
  const flowExpX = (fx1 + fx2) / 2;
  const flowExpY = 0.25 * fy1 + 0.5 * ((fy1 + fy2) / 2 - 14) + 0.25 * fy2;
  const flowPktChunk = flowMidSvg.vectorSvg.slice(flowMidSvg.vectorSvg.indexOf('data-send-packet="package"'));
  const [fCx, fCy] = centroidOfSvg(flowPktChunk);
  assert.ok(Math.hypot(fCx - flowExpX, fCy - flowExpY) < 12, `flow packet (${fCx}, ${fCy}) expected near (${flowExpX}, ${flowExpY})`);

  const flowArr = evaluateStageObjects(flowPlan, 1.9, null);
  assert.equal(flowArr.sends.length, 0);
  assert.ok(flowArr.objectStates[1].bump > 0, 'flow destination node gets bump > 0 after 0.8s');
  const flowArrSvg = renderDiagram(flowVisual, { layout: 'full', style: 'paper', seed: 'fl1', elementStates: flowArr.objectStates, sends: flowArr.sends });
  assert.ok(!flowArrSvg.vectorSvg.includes('data-send-packet'));

  // 5d. Custom prop send packet
  const customProp = {
    id: 'c_token',
    label: '令牌',
    height: 0.25,
    layer: 'mid',
    parts: [{ shape: 'circle', cx: 0, cy: 0, r: 0.7, fill: 'yellow' }],
  };
  const customPkt = renderSendPacket([200, 500], [600, 500], 'c_token', 0.5, { customProps: [customProp] });
  assert.ok(customPkt.includes('data-send-packet="c_token"'));
  assert.ok(customPkt.includes('data-icon="c_token"'));
  assert.ok(!customPkt.includes('<text'));
});

function makeHostStagePlan(visualData, cues = [], { hostX = 320, durationSec = 8, startOverrides = {}, sentences = [] } = {}) {
  const stageLayout = layoutStage(visualData, { prevHostX: hostX });
  return {
    id: 'sh-host-inter',
    seed: 'sh-host-inter',
    theme: 'light',
    style: 'paper',
    ground: GROUND_Y,
    durationSec,
    shot: {
      id: 'sh-host-inter',
      layout: 'stage',
      visual: { template: 'stage', data: visualData },
      cues,
    },
    startState: {
      x: stageLayout.hostX,
      view: 'three_quarter',
      facing: 1,
      gesture: 'idle',
      expr: 'explaining',
      prop: 'none',
      ...startOverrides,
    },
    stageLayout,
    elements: stageLayout.elements,
    customProps: [],
    cues,
    sentences,
  };
}

function fkOf(hostState) {
  return forwardKinematics(manifest, hostState.angles, {
    view: hostState.view,
    facing: hostState.facing,
    x: hostState.x,
    ground: hostState.ground,
    lift: hostState.lift,
    seatY: hostState.seatY ?? null,
  });
}

test('6. all 8 stage interactions reach target anchors within 2px at peak and react responds to good vs bad object states', () => {
  // 6a. open (0.6s): fridge handle within <= 2px at peak
  const openPlan = makeHostStagePlan(
    { objects: [{ prop: 'fridge', label: '冰箱', at: 'center', state: 'closed' }] },
    [{ sentence: 0, do: 'open', target: 0, timeMs: 500 }],
    { hostX: 1120 },
  );
  const openStart = evaluateHostAt(manifest, openPlan, 0.5).interactionStarts?.get(0);
  assert.ok(Number.isFinite(openStart), 'open returns interactionStarts');
  const openPeak = evaluateHostAt(manifest, openPlan, openStart + 0.3);
  assert.equal(openPeak.interacting, true);
  assert.equal(openPeak.interaction?.kind, 'open');
  const openFk = fkOf(openPeak);
  const fridgeHandle = openPlan.elements[0].anchors.handle;
  assert.ok(dist(openFk.points.l_hand, fridgeHandle) <= 2, `open hand err=${dist(openFk.points.l_hand, fridgeHandle).toFixed(2)}`);
  assert.ok(dist(openPeak.interaction.handPos, openFk.points.l_hand) <= 0.5);

  // 6b. carry (pickup peak 0.35s): box handle within <= 2px even though box handle is low (needs crouch/lean)
  const carryPlan = makeHostStagePlan(
    { objects: [{ prop: 'box', label: '箱子', at: 'center' }] },
    [{ sentence: 0, do: 'carry', target: 0, timeMs: 500 }],
    { hostX: 800 },
  );
  const carryStart = evaluateHostAt(manifest, carryPlan, 0.5).interactionStarts?.get(0);
  const carryPeak = evaluateHostAt(manifest, carryPlan, carryStart + 0.35);
  assert.equal(carryPeak.interacting, true);
  assert.equal(carryPeak.interaction?.kind, 'carry');
  assert.equal(carryPeak.interaction?.carriedIdx, 0);
  const carryFk = fkOf(carryPeak);
  const boxHandle = carryPlan.elements[0].anchors.handle;
  assert.ok(dist(carryFk.points.l_hand, boxHandle) <= 2, `carry pickup hand err=${dist(carryFk.points.l_hand, boxHandle).toFixed(2)}`);

  // 6c. push & pull (0.7s): tracks animated object side/handle within <= 2px at peak while leaning forward/back
  const pushPlan = makeHostStagePlan(
    { objects: [{ prop: 'box', label: '推箱', at: 'center' }] },
    [{ sentence: 0, do: 'push', target: 0, timeMs: 500 }],
    { hostX: 800 },
  );
  const pushPeakT = 0.5 + 0.35;
  const pushPeak = evaluateHostAt(manifest, pushPlan, pushPeakT);
  assert.equal(pushPeak.interacting, true);
  assert.equal(pushPeak.interaction?.kind, 'push');
  assert.ok(Number.isFinite(pushPeak.interaction?.standX), 'push exposes interaction.standX');
  assert.ok(pushPeak.angles.waist > 8, `push leans forward (waist=${pushPeak.angles.waist})`);
  const pushStage = evaluateStageObjects(pushPlan, pushPeakT, pushPeak);
  const pushSidePt = [pushPlan.elements[0].bbox.x + pushStage.objectStates[0].dx, pushPlan.elements[0].anchors.handle[1]];
  const pushFk = fkOf(pushPeak);
  assert.ok(dist(pushFk.points.l_hand, pushSidePt) <= 2, `push hand err=${dist(pushFk.points.l_hand, pushSidePt).toFixed(2)}`);

  const pullPlan = makeHostStagePlan(
    { objects: [{ prop: 'box', label: '拉箱', at: 'center' }] },
    [{ sentence: 0, do: 'pull', target: 0, timeMs: 500 }],
    { hostX: 800 },
  );
  const pullPeakT = 0.5 + 0.35;
  const pullPeak = evaluateHostAt(manifest, pullPlan, pullPeakT);
  assert.equal(pullPeak.interacting, true);
  assert.equal(pullPeak.interaction?.kind, 'pull');
  assert.ok(pullPeak.angles.waist < -5, `pull leans back (waist=${pullPeak.angles.waist})`);
  const pullStage = evaluateStageObjects(pullPlan, pullPeakT, pullPeak);
  const pullAnchorPt = [pullPlan.elements[0].anchors.handle[0] + pullStage.objectStates[0].dx, pullPlan.elements[0].anchors.handle[1]];
  const pullFk = fkOf(pullPeak);
  assert.ok(dist(pullFk.points.l_hand, pullAnchorPt) <= 2, `pull hand err=${dist(pullFk.points.l_hand, pullAnchorPt).toFixed(2)}`);

  // 6d. hold_up (1.5s): both arms overhead to [x, headTop - 24] within <= 2px, then returns after 1.5s
  const holdPlan = makeHostStagePlan(
    { objects: [{ prop: 'package', label: '包裹', at: 'center' }] },
    [{ sentence: 0, do: 'hold_up', target: 0, timeMs: 500 }],
    { hostX: 830 },
  );
  const holdStart = evaluateHostAt(manifest, holdPlan, 0.5).interactionStarts?.get(0);
  const holdPeak = evaluateHostAt(manifest, holdPlan, holdStart + 0.75);
  assert.equal(holdPeak.interacting, true);
  assert.equal(holdPeak.interaction?.kind, 'hold_up');
  const holdFk = fkOf(holdPeak);
  const overheadTarget = [holdPeak.x, holdFk.points.head_center[1] - holdFk.R - 24];
  assert.ok(dist(holdFk.points.l_hand, overheadTarget) <= 2, `hold_up l_hand err=${dist(holdFk.points.l_hand, overheadTarget).toFixed(2)}`);
  assert.ok(dist(holdFk.points.r_hand, overheadTarget) <= 2, `hold_up r_hand err=${dist(holdFk.points.r_hand, overheadTarget).toFixed(2)}`);
  const holdAfter = evaluateHostAt(manifest, holdPlan, holdStart + 1.6);
  assert.equal(holdAfter.interacting, false);
  const holdAfterStage = evaluateStageObjects(holdPlan, holdStart + 1.6, holdAfter);
  assert.equal(holdAfterStage.objectStates[0].heldUp, false);

  // 6e. draw (1.0s): sweeps across anchors.front and lands within <= 2px of anchors.front at peak (0.5s)
  const drawPlan = makeHostStagePlan(
    { objects: [{ prop: 'whiteboard', label: '缓存流程图', at: 'center' }] },
    [{ sentence: 0, do: 'draw', target: 0, timeMs: 500 }],
    { hostX: 600 },
  );
  const drawStart = evaluateHostAt(manifest, drawPlan, 0.5).interactionStarts?.get(0);
  const drawEarly = evaluateHostAt(manifest, drawPlan, drawStart + 0.125);
  const drawPeak = evaluateHostAt(manifest, drawPlan, drawStart + 0.5);
  assert.equal(drawPeak.interacting, true);
  assert.equal(drawPeak.interaction?.kind, 'draw');
  const drawFkPeak = fkOf(drawPeak);
  const drawFkEarly = fkOf(drawEarly);
  assert.ok(dist(drawFkPeak.points.l_hand, drawPlan.elements[0].anchors.front) <= 2,
    `draw peak hand err=${dist(drawFkPeak.points.l_hand, drawPlan.elements[0].anchors.front).toFixed(2)}`);
  assert.ok(Math.abs(drawFkEarly.points.l_hand[0] - drawFkPeak.points.l_hand[0]) > 15, 'draw sweeps horizontally across whiteboard');

  // 6f. sit_on: pelvis aligns to seat within <= 2px
  const sitPlan = makeHostStagePlan(
    { objects: [{ prop: 'chair', label: '椅子', at: 'center' }] },
    [{ sentence: 0, do: 'sit_on', target: 0, timeMs: 500 }],
    { hostX: 960 },
  );
  const sitState = evaluateHostAt(manifest, sitPlan, 1.2);
  assert.equal(sitState.interacting, true);
  assert.equal(sitState.interaction?.kind, 'sit_on');
  const sitFk = fkOf(sitState);
  assert.ok(Math.abs(sitFk.points.pelvis[1] - sitPlan.elements[0].anchors.seat[1]) <= 2,
    `sit_on pelvisY=${sitFk.points.pelvis[1]} vs seatY=${sitPlan.elements[0].anchors.seat[1]}`);

  // 6g. react (0.8s, no walk): faces target; bad state recoils back; good state cheers with raised hands
  const reactBadPlan = makeHostStagePlan(
    { objects: [{ prop: 'doc', label: '旧文件', at: 'left', state: 'fresh' }] },
    [
      { sentence: 0, do: 'state', target: 0, value: 'expired', timeMs: 400 },
      { sentence: 0, do: 'react', target: 0, timeMs: 600 },
    ],
    { hostX: 1100, startOverrides: { facing: 1 } },
  );
  const badPre = evaluateHostAt(manifest, reactBadPlan, 0.5);
  const badPeak = evaluateHostAt(manifest, reactBadPlan, 1.0);
  assert.equal(badPeak.interacting, true);
  assert.equal(badPeak.interaction?.kind, 'react');
  assert.equal(badPeak.facing, -1, 'react turns to face object on left');
  assert.ok((badPeak.x - badPre.x) * badPeak.facing < -5, `expired react recoils backward: x ${badPre.x} -> ${badPeak.x}, facing=${badPeak.facing}`);
  assert.ok(badPeak.angles.waist < -4, `expired react leans torso back (waist=${badPeak.angles.waist})`);

  const reactGoodPlan = makeHostStagePlan(
    { objects: [{ prop: 'doc', label: '新文件', at: 'right', state: 'fresh' }] },
    [{ sentence: 0, do: 'react', target: 0, timeMs: 500 }],
    { hostX: 400, startOverrides: { facing: -1 } },
  );
  const goodPeak = evaluateHostAt(manifest, reactGoodPlan, 0.9);
  const goodFk = fkOf(goodPeak);
  assert.equal(goodPeak.facing, 1, 'react faces object on right');
  assert.ok(goodFk.points.l_hand[1] < goodFk.points.head_center[1] && goodFk.points.r_hand[1] < goodFk.points.head_center[1],
    'fresh react raises both hands overhead to cheer');
});

test('7. auto-approach walks from x=240 to fridge at x=1320 before executing open, synchronizing stage state via interactionStarts', () => {
  const plan = makeHostStagePlan(
    { objects: [{ prop: 'fridge', label: '冰箱', at: 'mid-right', state: 'closed' }] },
    [{ sentence: 0, do: 'open', target: 0, timeMs: 500 }],
    { hostX: 240, durationSec: 8, startOverrides: { x: 240 } },
  );

  // Immediately after cue (t=1.0): host must be walking toward fridge, not reaching from x=240
  const walking = evaluateHostAt(manifest, plan, 1.0);
  assert.equal(walking.view, 'side', 'host is walking before reaching fridge');
  assert.ok(walking.x > 240 && walking.x < 1200, `host mid-walk at x=${walking.x}`);
  assert.equal(walking.interacting, false);
  const walkingStage = evaluateStageObjects(plan, 1.0, walking);
  assert.equal(walkingStage.objectStates[0].state, 'closed', 'fridge stays closed until host arrives');

  // After arrival: interactionStarts[0] marks when open begins
  const openStart = walking.interactionStarts.get(0);
  assert.ok(openStart > 2.5, `expected auto-approach arrival > 2.5s, got ${openStart}`);
  const openPeak = evaluateHostAt(manifest, plan, openStart + 0.3);
  assert.equal(openPeak.interacting, true);
  assert.equal(openPeak.interaction?.kind, 'open');
  const peakFk = fkOf(openPeak);
  assert.ok(dist(peakFk.points.l_hand, plan.elements[0].anchors.handle) <= 2,
    `after auto-approach open hand err=${dist(peakFk.points.l_hand, plan.elements[0].anchors.handle).toFixed(2)}`);

  const openStage = evaluateStageObjects(plan, openStart + 0.3, openPeak);
  assert.equal(openStage.objectStates[0].state, 'open');
  assert.ok(openStage.objectStates[0].stateProgress > 0 && openStage.objectStates[0].stateProgress < 1);

  // Cumulative push offset: push box +160px then open it — open must aim at pushed handle, not original handle
  const pushThenOpenPlan = makeHostStagePlan(
    { objects: [{ prop: 'box', label: '推开箱', at: 'center', state: 'closed' }] },
    [
      { sentence: 0, do: 'push', target: 0, timeMs: 200 },
      { sentence: 0, do: 'open', target: 0, timeMs: 1200 },
    ],
    { hostX: 800, durationSec: 6 },
  );
  const openAfterPushStart = evaluateHostAt(manifest, pushThenOpenPlan, 0.1).interactionStarts.get(1);
  const openAfterPushPeak = evaluateHostAt(manifest, pushThenOpenPlan, openAfterPushStart + 0.3);
  const openAfterPushStage = evaluateStageObjects(pushThenOpenPlan, openAfterPushStart + 0.3, openAfterPushPeak);
  const shiftedBoxHandle = [
    pushThenOpenPlan.elements[0].anchors.handle[0] + openAfterPushStage.objectStates[0].dx,
    pushThenOpenPlan.elements[0].anchors.handle[1],
  ];
  assert.ok(openAfterPushStage.objectStates[0].dx > 150, `box pushed before open (dx=${openAfterPushStage.objectStates[0].dx})`);
  assert.ok(dist(fkOf(openAfterPushPeak).points.l_hand, shiftedBoxHandle) <= 2,
    `post-push open targets shifted handle err=${dist(fkOf(openAfterPushPeak).points.l_hand, shiftedBoxHandle).toFixed(2)}`);
});

test('8. carry chain drops held prop, follows host across move, drops at feet on carry:none, and auto-drops on carrying a second object', () => {
  const visualData = {
    objects: [
      { prop: 'package', label: '包裹', at: 'left' },
      { prop: 'cup', label: '咖啡', at: 'mid-left' },
    ],
  };
  const cues = [
    { sentence: 0, do: 'carry', target: 0, timeMs: 200 },
    { sentence: 0, do: 'move', target: 'right', timeMs: 1200 },
    { sentence: 0, do: 'carry', target: 'none', timeMs: 6000 },
  ];
  const plan = makeHostStagePlan(visualData, cues, {
    hostX: 480,
    durationSec: 8,
    startOverrides: { prop: 'phone' },
  });

  // Before carry: holding phone
  const pre = evaluateHostAt(manifest, plan, 0.1);
  assert.equal(pre.prop, 'phone');
  assert.equal(pre.interaction, null);

  // After carry pickup (t = 1.0): phone dropped, carrying object 0
  const startCarry = pre.interactionStarts.get(0);
  const holding = evaluateHostAt(manifest, plan, startCarry + 0.65);
  assert.equal(holding.prop, 'none', 'held prop auto-dropped on carry');
  assert.equal(holding.interacting, true);
  assert.equal(holding.interaction?.carriedIdx, 0);
  assert.ok(Array.isArray(holding.interaction?.carriedPos));

  // After move to right (t = 5.5): host and carriedPos both moved right together
  const moved = evaluateHostAt(manifest, plan, 5.5);
  assert.ok(moved.x > 1400, `host moved right to x=${moved.x}`);
  assert.equal(moved.interaction?.carriedIdx, 0);
  assert.ok(moved.interaction.carriedPos[0] > 1400, `carriedPos followed host to x=${moved.interaction.carriedPos[0]}`);
  const movedStage = evaluateStageObjects(plan, 5.5, moved);
  assert.equal(movedStage.objectStates[0].carried, true);
  assert.equal(movedStage.objectStates[0].inFront, true);

  // After carry: 'none' (t = 6.2): cleared and dropped near host's right position
  const dropped = evaluateHostAt(manifest, plan, 6.2);
  assert.equal(dropped.interacting, false);
  assert.equal(dropped.interaction?.carriedIdx, null);
  assert.equal(dropped.interaction?.carriedPos, null);
  assert.ok(dropped.interaction?.droppedSpots?.[0], 'records droppedSpots[0]');
  assert.equal(dropped.interaction.droppedSpots[0].y, GROUND_Y);
  assert.ok(dropped.interaction.droppedSpots[0].x > 1400, `dropped near right spot: ${dropped.interaction.droppedSpots[0].x}`);
  const droppedStage = evaluateStageObjects(plan, 6.2, dropped);
  assert.equal(droppedStage.objectStates[0].carried, false);
  assert.equal(droppedStage.objectStates[0].inFront, false);

  // Direct carry swap: carry 0 then carry 1 auto-drops 0
  const swapPlan = makeHostStagePlan(
    visualData,
    [
      { sentence: 0, do: 'carry', target: 0, timeMs: 200 },
      { sentence: 0, do: 'carry', target: 1, timeMs: 1500 },
    ],
    { hostX: 480, durationSec: 5 },
  );
  const swap1Start = evaluateHostAt(manifest, swapPlan, 0.1).interactionStarts.get(1);
  const swapped = evaluateHostAt(manifest, swapPlan, swap1Start + 0.4);
  assert.equal(swapped.interaction?.carriedIdx, 1);
  assert.ok(swapped.interaction?.droppedSpots?.[0], 'carrying object 1 auto-drops object 0');
  assert.equal(swapped.interaction.droppedSpots[0].y, GROUND_Y);
});

test('9. sit_on aligns pelvis to seatY without feet poking below ground=930 and stands up on next move', () => {
  for (const size of ['md', 'sm']) {
    const plan = makeHostStagePlan(
      { objects: [{ prop: 'chair', label: '椅子', at: 'center', size }] },
      [
        { sentence: 0, do: 'sit_on', target: 0, timeMs: 300 },
        { sentence: 0, do: 'move', target: 'right', timeMs: 3000 },
      ],
      { hostX: 960, durationSec: 6 },
    );
    const seatPt = plan.elements[0].anchors.seat;
    const seated = evaluateHostAt(manifest, plan, 1.5);
    assert.equal(seated.interacting, true);
    assert.equal(seated.interaction?.kind, 'sit_on');
    const fk = fkOf(seated);
    assert.ok(Math.abs(fk.points.pelvis[1] - seatPt[1]) <= 4, `${size} chair pelvis[1]=${fk.points.pelvis[1]} vs seatY=${seatPt[1]}`);
    const sole = (manifest.figure.foot[1] * H) / 2;
    for (const k of ['l_ankle', 'l_toe', 'r_ankle', 'r_toe']) {
      assert.ok(fk.points[k][1] + sole <= GROUND_Y + 0.5, `${size} chair ${k} foot y=${fk.points[k][1] + sole} <= ${GROUND_Y}`);
    }
    const svg = drawHost(manifest, seated);
    assert.ok(svg.includes('data-host="xiaoqing"'));

    // Next move stands up and walks away
    const stoodUp = evaluateHostAt(manifest, plan, 3.3);
    assert.equal(stoodUp.view, 'side');
    assert.equal(stoodUp.seatY ?? null, null);
    assert.equal(stoodUp.interacting, false);
    assert.ok(stoodUp.x > seatPt[0] + 10, `host stood up and walked right: x=${stoodUp.x}`);
  }
});

test('10. micro-cooperation turns head on reveal, nods on highlight/state, and stage inferSentenceBeat skips interactions and repeated holds', () => {
  const basePlan = makeHostStagePlan(
    { objects: [{ prop: 'doc', label: '文档', at: 'right', state: 'fresh' }] },
    [],
    { hostX: 320, durationSec: 5 },
  );
  const revPlan = makeHostStagePlan(
    { objects: [{ prop: 'doc', label: '文档', at: 'right', state: 'fresh' }] },
    [{ sentence: 0, do: 'reveal', target: 0, timeMs: 1000 }],
    { hostX: 320, durationSec: 5 },
  );
  const noRev = evaluateHostAt(manifest, basePlan, 1.2);
  const atRev = evaluateHostAt(manifest, revPlan, 1.2);
  assert.ok(Math.abs(atRev.angles.head - noRev.angles.head) >= 3, `head turns on reveal (base=${noRev.angles.head}, rev=${atRev.angles.head})`);
  assert.ok(atRev.gaze[0] > 0.03, `gaze turns toward right element (${atRev.gaze})`);
  const afterRev = evaluateHostAt(manifest, revPlan, 1.8);
  assert.ok(Math.abs(afterRev.angles.head - evaluateHostAt(manifest, basePlan, 1.8).angles.head) < 0.5, 'reveal head turn settles after 0.6s');

  const hlPlan = makeHostStagePlan(
    { objects: [{ prop: 'doc', label: '文档', at: 'right', state: 'fresh' }] },
    [{ sentence: 0, do: 'highlight', target: 0, timeMs: 1000 }],
    { hostX: 320, durationSec: 5 },
  );
  const stPlan = makeHostStagePlan(
    { objects: [{ prop: 'doc', label: '文档', at: 'right', state: 'fresh' }] },
    [{ sentence: 0, do: 'state', target: 0, value: 'expired', timeMs: 1000 }],
    { hostX: 320, durationSec: 5 },
  );
  const atHl = evaluateHostAt(manifest, hlPlan, 1.15);
  const atSt = evaluateHostAt(manifest, stPlan, 1.15);
  const baseNod = evaluateHostAt(manifest, basePlan, 1.15);
  assert.ok(atHl.angles.head > baseNod.angles.head + 2, `highlight triggers nod (${atHl.angles.head} vs ${baseNod.angles.head})`);
  assert.ok(atSt.angles.head > baseNod.angles.head + 2, `state change triggers nod (${atSt.angles.head} vs ${baseNod.angles.head})`);

  // Stage sentence beat skips sentences with explicit interaction cues and does not repeat prior hold gesture across a once gesture
  const beatStagePlan = makeHostStagePlan(
    { objects: [{ prop: 'fridge', label: '冰箱', at: 'mid-right', state: 'closed' }] },
    [
      { sentence: 0, do: 'gesture', target: 'present', timeMs: 100 },
      { sentence: 1, do: 'open', target: 0, timeMs: 2100 },
    ],
    {
      hostX: 1500,
      durationSec: 6,
      sentences: [
        { index: 0, startMs: 0, endMs: 1800, text: '先看看这里。' },
        { index: 1, startMs: 2000, endMs: 3800, text: '打开冰箱看一眼。' },
        { index: 2, startMs: 4000, endMs: 5800, text: '继续往下看。' },
      ],
    },
  );
  // Sentence 1 has explicit `open` -> should perform open, not synthesize an overriding auto-beat gesture
  const duringS1 = evaluateHostAt(manifest, beatStagePlan, 2.4);
  assert.equal(duringS1.interaction?.kind, 'open');
  // Sentence 2 auto-beat skips repeating sentence 0's hold gesture 'present'
  const duringS2 = evaluateHostAt(manifest, beatStagePlan, 4.6);
  assert.notEqual(duringS2.gesture, 'present', 'auto-beat on stage shot skips repeating prior hold gesture');
  assert.equal(inferSentenceBeat('继续往下看。', { index: 2, prevGesture: 'present' }).gesture !== 'present', true);
});
