import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ahogePoints, drawHost, resolvePose } from '../skills/topic-to-video/scripts/lib/rig.mjs';
import { evaluateHostAt, fidgetSchedule, inferSentenceBeat, simulateAhogeSpring } from '../skills/topic-to-video/scripts/lib/motion.mjs';

// 小青人设设计 (H): the 呆毛, bigger faces, amazed, five persona gestures, outfits, auto beats and fidgets.
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/assets/host/manifest.json'), 'utf8'));
const H = manifest.height_px;
const R = (manifest.joints.head.length * H) / 2;
const draw = (state) => drawHost(manifest, { gesture: 'idle', expr: 'explaining', x: 400, ground: 930, seed: 'sh01', ...state });
const START = { x: 320, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' };
const plan = (cues, extra = {}) => ({
  seed: 'sh07', durationSec: 6, startState: START, cues, elements: [],
  sentences: [{ index: 0, startMs: 0, endMs: 5800, text: '讲一句。' }], ...extra,
});
const NEW_GESTURES = ['snap', 'lean_in', 'startle', 'double_take', 'scratch_head'];

test('the five persona gestures are written inside the joint ranges', () => {
  for (const g of NEW_GESTURES) {
    const pose = resolvePose(manifest, g);
    for (const [joint, deg] of Object.entries(pose.angles)) {
      const [lo, hi] = manifest.joints[joint].range;
      assert.ok(deg >= lo && deg <= hi, `${g} ${joint} ${deg}`);
    }
  }
  assert.deepEqual(NEW_GESTURES.map((g) => resolvePose(manifest, g).type), ['once', 'hold', 'once', 'once', 'once']);
  assert.deepEqual(['snap', 'startle', 'double_take', 'scratch_head'].map((g) => resolvePose(manifest, g).seconds), [0.7, 0.8, 1, 1.2]);
});

test('a persona once gesture plays, then the host goes back to the hold gesture', () => {
  for (const g of ['snap', 'startle', 'double_take', 'scratch_head']) {
    const p = plan([{ sentence: 0, do: 'gesture', target: 'present', timeMs: 0 }, { sentence: 0, do: 'gesture', target: g, timeMs: 1000 }]);
    assert.equal(evaluateHostAt(manifest, p, 1.2).gesture, g);
    assert.equal(evaluateHostAt(manifest, p, 1 + resolvePose(manifest, g).seconds + 0.35).gesture, 'present');
  }
});

test('amazed draws two star eyes, a grin and the sparkle', () => {
  const svg = draw({ expr: 'amazed' });
  assert.equal((svg.match(/data-eye="star"/g) ?? []).length, 2);
  assert.match(svg, /data-symbol="sparkle"/);
  assert.equal(manifest.expressions.amazed.mouth, 'grin');
});

test('faces are 25% stronger than rig v2: brow angle, brow lift and eye scale', () => {
  const v2 = {
    explaining: [-4, 0], focused: [12, -0.006], happy: [-8, 0.012], curious: [0, 0.004],
    surprised: [-6, 0.025], worried: [-18, 0.01], frustrated: [20, -0.008], proud: [4, 0],
  };
  for (const [expr, [angle, lift]] of Object.entries(v2)) {
    const brow = manifest.expressions[expr].brow;
    assert.ok(Math.abs(brow.angle - 1.25 * angle) <= 0.01, `${expr} angle ${brow.angle}`);
    assert.ok(Math.abs(brow.lift - 1.25 * lift) <= 0.001, `${expr} lift ${brow.lift}`);
  }
  manifest.expressions.curious.eye_scale.forEach((s, i) => assert.ok(Math.abs(s - (1 + ([1.25, 0.8][i] - 1) * 1.25)) <= 0.01, `eye ${i}`));
});

test('surprised, happy and amazed stretch the head 6%; worried and frustrated squash it', () => {
  const squash = Object.fromEntries(Object.entries(manifest.expressions).map(([e, x]) => [e, x.squash ?? 0]));
  assert.deepEqual(squash, { explaining: 0, focused: 0, happy: 0.06, curious: 0, surprised: 0.06, worried: -0.06, frustrated: -0.06, proud: 0, amazed: 0.06 });
});

test('emotion symbols are drawn 1.3 times larger around their anchor', () => {
  assert.equal(manifest.figure.symbol_scale, 1.3);
  for (const expr of ['curious', 'surprised', 'worried', 'frustrated', 'proud', 'amazed']) {
    assert.match(draw({ expr }), /scale\(1\.3\) translate\([^)]*\)"><g data-symbol="/, expr);
  }
});

test('every expression draws the 呆毛 in the shape manifest.ahoge.by_expr gives it', () => {
  assert.deepEqual(Object.keys(manifest.ahoge.by_expr).sort(), Object.keys(manifest.expressions).sort());
  assert.deepEqual(manifest.ahoge.by_expr, {
    explaining: 'curl', focused: 'curl', curious: 'question', surprised: 'straight', worried: 'droop',
    frustrated: 'droop', happy: 'spring', proud: 'spring', amazed: 'spring',
  });
  for (const [expr, shape] of Object.entries(manifest.ahoge.by_expr)) {
    assert.match(draw({ expr }), new RegExp(`<g data-ahoge="${shape}" transform="[^"]+"><path data-part="ahoge"`), expr);
  }
});

test('the 呆毛 grows from the top of the head, turns with the head and mirrors with it', () => {
  const pts = ahogePoints(manifest, { expr: 'explaining' });
  assert.equal(pts.length, manifest.ahoge.count);
  assert.deepEqual(pts[0], [0, -0.98]);
  assert.ok(pts.every(([, v]) => v <= -0.98 + 1e-9), 'every point is above the root');
  const idle = resolvePose(manifest, 'idle').angles;
  const rotation = (svg) => Number(svg.match(/<g data-ahoge="curl" transform="translate\([^)]*\) rotate\((-?[\d.]+)\)/)[1]);
  assert.ok(Math.abs(rotation(draw({ angles: { ...idle, head: 30 } })) - rotation(draw({ angles: { ...idle, head: 0 } })) - 30) < 0.01);
  assert.match(draw({ facing: -1 }), /<g data-ahoge="curl" transform="[^"]*scale\(-1 1\)">/);
});

test('mix morphs between two shapes and bend swings the tip about the root', () => {
  const curl = ahogePoints(manifest, { expr: 'explaining' });
  const straight = ahogePoints(manifest, { expr: 'surprised' });
  const half = ahogePoints(manifest, { expr: 'surprised', fromExpr: 'explaining', mix: 0.5 });
  half.forEach(([u, v], i) => {
    assert.ok(Math.abs(u - (curl[i][0] + straight[i][0]) / 2) < 1e-9 && Math.abs(v - (curl[i][1] + straight[i][1]) / 2) < 1e-9, `point ${i}`);
  });
  const bent = ahogePoints(manifest, { expr: 'surprised', bend: 20 });
  assert.deepEqual(bent[0], straight[0]);
  assert.ok(bent.at(-1)[0] > straight.at(-1)[0] + 0.3, 'a positive bend leans the tip forward');
});

test('a head stretch draws the head taller than wide; a squash draws it wider', () => {
  const box = (svg) => {
    const d = svg.match(/data-part="head" d="([^"]+)"/)[1];
    const pts = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const span = (k) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]));
    return [span(0), span(1)];
  };
  const [w, h] = box(draw({ headStretch: 0.06 }));
  assert.ok(h > w * 1.08, `${w} x ${h}`);
  const [w2, h2] = box(draw({ headStretch: -0.06 }));
  assert.ok(w2 > h2 * 1.08, `${w2} x ${h2}`);
});

const OUTFITS = ['glasses', 'hardhat', 'chef_hat', 'apron'];

test('each outfit draws, a hat keeps the 呆毛 growing out of its crown, and an unknown outfit is an error', () => {
  for (const outfit of OUTFITS) assert.match(draw({ outfit }), new RegExp(`data-outfit="${outfit}"`), outfit);
  for (const outfit of ['hardhat', 'chef_hat']) {
    assert.equal(ahogePoints(manifest, { expr: 'explaining', outfit })[0][1], manifest.outfits[outfit].crown, outfit);
    const svg = draw({ outfit });
    assert.ok(svg.indexOf(`data-outfit="${outfit}"`) < svg.indexOf('data-part="ahoge"'), `${outfit} is drawn under the 呆毛`);
  }
  assert.doesNotMatch(draw({}), /data-outfit/);
  assert.throws(() => draw({ outfit: 'cape' }), /unknown outfit cape/);
});

test('glasses and the apron leave the 呆毛 where it grows', () => {
  const bare = ahogePoints(manifest, { expr: 'explaining' });
  assert.deepEqual(ahogePoints(manifest, { expr: 'explaining', outfit: 'glasses' }), bare);
  assert.deepEqual(ahogePoints(manifest, { expr: 'explaining', outfit: 'apron' }), bare);
});

test('outfits use the theme\'s ink, so a dark frame has no black outlines', () => {
  for (const outfit of OUTFITS) {
    const svg = draw({ outfit, theme: 'dark' });
    assert.ok(svg.includes(manifest.ink.body.dark), outfit);
    assert.ok(!svg.includes(`stroke="${manifest.ink.body.light}"`), outfit);
  }
});

test('at 540p the 呆毛, outfits and star eyes stay at least 1.5 px wide', () => {
  const small = { ...manifest, height_px: 200 };
  for (const outfit of OUTFITS) {
    for (const expr of ['amazed', 'curious']) {
      const svg = drawHost(small, { gesture: 'idle', expr, outfit, x: 200, ground: 465, seed: 'small' });
      for (const m of svg.matchAll(/A([\d.]+) ([\d.]+)/g)) assert.ok(Number(m[1]) * 2 >= 1.5 - 1e-6, `cap ${m[1]} in ${outfit} ${expr}`);
      for (const m of svg.matchAll(/stroke-width="([\d.]+)"/g)) assert.ok(Number(m[1]) >= 1.5 - 1e-6, `stroke ${m[1]} in ${outfit} ${expr}`);
    }
  }
});

test('evaluateHostAt passes the plan\'s outfit on to drawHost', () => {
  assert.equal(evaluateHostAt(manifest, plan([]), 1).outfit, 'none');
  const dressed = evaluateHostAt(manifest, plan([], { outfit: 'chef_hat' }), 1);
  assert.equal(dressed.outfit, 'chef_hat');
  assert.match(drawHost(manifest, dressed), /data-outfit="chef_hat"/);
});

const near = (a, b, eps) => a.every(([u, v], i) => Math.abs(u - b[i][0]) <= eps && Math.abs(v - b[i][1]) <= eps);
const exprAt = (target, ms = 1000) => plan([{ sentence: 0, do: 'gesture', target: 'idle', timeMs: 0 }, { sentence: 0, do: 'expr', target, timeMs: ms }]);

test('a new expression morphs the 呆毛 over 0.2 s', () => {
  const p = exprAt('surprised');
  const at = (t) => { const s = evaluateHostAt(manifest, p, t); return ahogePoints(manifest, { expr: s.expr, ...s.ahoge, bend: 0 }); };
  const curl = ahogePoints(manifest, { expr: 'explaining' });
  const straight = ahogePoints(manifest, { expr: 'surprised' });
  const mid = at(1.1);
  assert.ok(!near(mid, curl, 1e-3) && !near(mid, straight, 1e-3), 'halfway it is neither shape');
  mid.forEach(([, v], i) => assert.ok(v <= Math.max(curl[i][1], straight[i][1]) + 1e-9 && v >= Math.min(curl[i][1], straight[i][1]) - 1e-9, `point ${i}`));
  assert.ok(near(at(1.2), straight, 1e-9));
});

test('a jump kicks the 呆毛 and it settles within 2 px a second after the jump ends', () => {
  const p = plan([{ sentence: 0, do: 'gesture', target: 'idle', timeMs: 0 }, { sentence: 0, do: 'gesture', target: 'jump', timeMs: 1000 }]);
  const rest = ahogePoints(manifest, { expr: 'explaining' }).at(-1);
  const off = (t) => {
    const s = evaluateHostAt(manifest, p, t);
    const tip = ahogePoints(manifest, { expr: s.expr, ...s.ahoge }).at(-1);
    return Math.hypot(tip[0] - rest[0], tip[1] - rest[1]) * R;
  };
  assert.ok(off(1.15) > 6, `tip moved ${off(1.15)} px`);
  const settled = 1 + resolvePose(manifest, 'jump').seconds + 1;
  assert.ok(off(settled) <= 2, `tip ${off(settled)} px from rest`);
});

test('the 呆毛 spring gives the same bend at a time whatever frames came before', () => {
  const pulse = (ts) => (ts >= 0.5 && ts < 0.58 ? 30 : 0);
  assert.equal(simulateAhogeSpring(manifest, pulse, 1.0), simulateAhogeSpring(manifest, pulse, 1.0));
  assert.ok(Math.abs(simulateAhogeSpring(manifest, pulse, 0.7)) > 1);
  assert.ok(Math.abs(simulateAhogeSpring(manifest, pulse, 4)) < 0.01);
});

test('surprised stretches the head for 0.3 s and leans the body back, keeping the gesture', () => {
  const p = exprAt('surprised');
  assert.ok(evaluateHostAt(manifest, p, 1.1).headStretch > 0);
  assert.equal(evaluateHostAt(manifest, p, 1.3).headStretch, 0);
  assert.ok(evaluateHostAt(manifest, exprAt('worried'), 1.1).headStretch < 0);
  assert.equal(evaluateHostAt(manifest, exprAt('curious'), 1.1).headStretch, 0);
  const before = evaluateHostAt(manifest, p, 0.99);
  const during = evaluateHostAt(manifest, p, 1.15);
  assert.ok(during.angles.waist < before.angles.waist - 2, 'leans back');
  assert.equal(during.gesture, before.gesture);
});

test('persona once gestures move the body, not just the label', () => {
  for (const g of ['snap', 'startle', 'double_take', 'scratch_head']) {
    const p = plan([{ sentence: 0, do: 'gesture', target: 'idle', timeMs: 0 }, { sentence: 0, do: 'gesture', target: g, timeMs: 1000 }]);
    const hold = evaluateHostAt(manifest, p, 0.9).angles;
    const mid = evaluateHostAt(manifest, p, 1 + resolvePose(manifest, g).seconds / 2).angles;
    const maxDelta = Math.max(...Object.keys(hold).map((j) => Math.abs(mid[j] - hold[j])));
    assert.ok(maxDelta > 15, `${g} moves a joint by only ${maxDelta.toFixed(1)}°`);
  }
});

test('a snap shows a sparkle at the hand for its second half', () => {
  const p = plan([{ sentence: 0, do: 'gesture', target: 'snap', timeMs: 1000 }]);
  assert.equal(evaluateHostAt(manifest, p, 1.1).spark, 0);
  const s = evaluateHostAt(manifest, p, 1.45);
  assert.ok(s.spark > 0.5, `spark ${s.spark}`);
  assert.match(drawHost(manifest, s), /data-spark="1"/);
  assert.doesNotMatch(drawHost(manifest, evaluateHostAt(manifest, p, 2)), /data-spark/);
});

test('a startle hops back and a double take looks away, then back at the focus', () => {
  const startle = plan([{ sentence: 0, do: 'gesture', target: 'startle', timeMs: 1000 }]);
  const still = evaluateHostAt(manifest, startle, 0.9);
  const jolt = evaluateHostAt(manifest, startle, 1.15);
  assert.ok(jolt.lift > 0.01 && jolt.x < still.x - 3, `lift ${jolt.lift}, x ${still.x} → ${jolt.x}`);
  const take = plan([{ sentence: 0, do: 'gesture', target: 'double_take', timeMs: 1000 }]);
  assert.ok(evaluateHostAt(manifest, take, 1.3).gaze[0] < 0, 'looks away');
  assert.ok(evaluateHostAt(manifest, take, 1.55).gaze[0] > 0, 'looks back');
});

test('a shot that starts with a snap plays it, then stands idle', () => {
  const p = plan([], { startState: { ...START, gesture: 'snap' } });
  assert.equal(evaluateHostAt(manifest, p, 0.3).gesture, 'snap');
  assert.equal(evaluateHostAt(manifest, p, 1.2).gesture, 'idle');
});

test('at 540p the snap sparkle outline stays at least 1.5 px wide', () => {
  const small = { ...manifest, height_px: 200 };
  const svg = drawHost(small, { gesture: 'snap', expr: 'amazed', spark: 1, x: 200, ground: 465, seed: 'small-spark' });
  assert.match(svg, /data-spark="1"/);
  for (const m of svg.matchAll(/stroke-width="([\d.]+)"/g)) assert.ok(Number(m[1]) >= 1.5 - 1e-6, `stroke ${m[1]}`);
});

const longTake = (extra = {}) => plan([], { durationSec: 12, sentences: [{ index: 0, startMs: 0, endMs: 11800, text: '讲一句很长的话。' }], ...extra });
const fidgetsBetween = (p, from, to) => { const out = []; for (let t = from; t < to; t += 0.05) out.push(evaluateHostAt(manifest, p, t).fidget); return out; };

test('fidgets come only after 3 quiet seconds and the same way every render', () => {
  assert.ok(fidgetsBetween(longTake(), 0, 3).every((k) => k === null));
  assert.ok(fidgetsBetween(longTake(), 3, 7.5).some((k) => k !== null));
  assert.deepEqual(fidgetsBetween(longTake(), 3, 12), fidgetsBetween(longTake(), 3, 12));
  assert.deepEqual(fidgetSchedule([[0, 12]], 'sh01'), fidgetSchedule([[0, 12]], 'sh01'));
  assert.notDeepEqual(fidgetSchedule([[0, 30]], 'sh01'), fidgetSchedule([[0, 30]], 'sh02'));
  const gaps = fidgetSchedule([[0, 30]], 'sh01').map((f) => f.t0);
  assert.equal(gaps[0], 3);
  gaps.slice(1).forEach((t0, i) => assert.ok(t0 - gaps[i] >= 3 && t0 - gaps[i] <= 4, `gap ${t0 - gaps[i]}`));
});

test('no fidget while walking or during a once gesture', () => {
  const walk = longTake({ durationSec: 6, cues: [{ sentence: 0, do: 'move', target: 'right', timeMs: 0 }] });
  for (let t = 0; t < 6; t += 0.05) {
    const s = evaluateHostAt(manifest, walk, t);
    if (s.view === 'side') assert.equal(s.fidget, null, `walking at ${t}`);
  }
  const jump = longTake({ cues: [{ sentence: 0, do: 'gesture', target: 'jump', timeMs: 5000 }] });
  assert.ok(fidgetsBetween(jump, 5, 6.3).every((k) => k === null));
});

test('a seated host never floats: tiptoe is skipped while sitting', () => {
  const seated = plan([], { durationSec: 30, startState: { ...START, gesture: 'sit' }, sentences: [{ index: 0, startMs: 0, endMs: 29800, text: '讲。' }] });
  for (let t = 0; t < 30; t += 0.05) assert.equal(evaluateHostAt(manifest, seated, t).lift, 0, `t=${t}`);
});

test('auto beats: a question leans in, a reveal snaps, a surprise startles, and no sentence repeats the last', () => {
  assert.equal(inferSentenceBeat('还要从头下载吗？').gesture, 'lean_in');
  assert.equal(inferSentenceBeat('还要从头下载吗？', { prevGesture: 'lean_in' }).gesture, 'think');
  for (const s of ['原来浏览器早就存了一份。', '答案是三零四。', '所以说缓存不是白存的。', '这就是协商缓存。']) assert.equal(inferSentenceBeat(s).gesture, 'snap', s);
  for (const s of ['居然一个字节都没下载。', '竟然只花了一毫秒。', '没想到服务器只回了一句话。']) assert.equal(inferSentenceBeat(s).gesture, 'startle', s);
  assert.equal(inferSentenceBeat('居然一个字节都没下载。', { prevGesture: 'startle' }).gesture, 'double_take');
  assert.equal(inferSentenceBeat('原来如此！').gesture, 'snap', 'a reveal comes before the exclamation rule');
  assert.equal(inferSentenceBeat('这就是答案吗？').gesture, 'lean_in', 'a question comes first');
});

test('after two automatic snaps the next reveal takes the next candidate', () => {
  assert.equal(inferSentenceBeat('原来如此。', { autoSnaps: 1 }).gesture, 'snap');
  assert.equal(inferSentenceBeat('原来如此。', { autoSnaps: 2 }).gesture, 'present');
  assert.equal(inferSentenceBeat('原来如此。', { autoSnaps: 2, prevGesture: 'present' }).gesture, 'emphasize');
  const reveal = (i) => ({ index: i, startMs: i * 2000, endMs: i * 2000 + 1800, text: '原来是这样。' });
  const three = plan([], { durationSec: 8, sentences: [reveal(0), { index: 1, startMs: 2000, endMs: 3800, text: '讲一句。' }, reveal(2), { index: 3, startMs: 6000, endMs: 7800, text: '讲一句。' }] });
  assert.equal(evaluateHostAt(manifest, three, 7.9).endState.autoSnaps, 2);
  const capped = plan([], { startState: { ...START, autoSnaps: 2 }, sentences: [reveal(0)] });
  assert.notEqual(evaluateHostAt(manifest, capped, 0.2).gesture, 'snap');
});

test('a snap the agent writes always plays and does not count toward the cap', () => {
  const p = plan([{ sentence: 0, do: 'gesture', target: 'snap', timeMs: 0 }], { startState: { ...START, autoSnaps: 2 }, sentences: [{ index: 0, startMs: 0, endMs: 1800, text: '原来如此。' }] });
  assert.equal(evaluateHostAt(manifest, p, 0.2).gesture, 'snap');
  assert.equal(evaluateHostAt(manifest, p, 1).endState.autoSnaps, 2);
});
