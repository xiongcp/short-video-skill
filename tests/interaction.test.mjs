import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateStageObjects,
  layoutStage,
  renderSendPacket,
  renderStage,
} from '../skills/topic-to-video/scripts/lib/stage.mjs';
import { layoutElements, renderDiagram } from '../skills/topic-to-video/scripts/lib/templates.mjs';

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

  // count:* settled after 0.35s
  const afterCount = evaluateStageObjects(plan, 4.35, null);
  assert.equal(afterCount.objectStates[2].state, 'count:2');
  const svgCount = renderStage(visualData, {
    style: 'paper',
    seed: 'st1',
    elementStates: afterCount.objectStates,
    layoutResult: plan.stageLayout,
  });
  assert.ok(svgCount.textItems.some((ti) => ti.key === 'stage-count-2' && ti.text === '2'));

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
