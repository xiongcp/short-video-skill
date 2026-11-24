// T12 default host motion: a bone hierarchy (torso → head, torso → upper arm → forearm → hand on both sides), spring
// dynamics with follow-through, idle life (breathing, sway, saccades) and speech-linked nods, brows and mouth shapes. All
// of it lives in the vector rig's `motion` block, is seeded and sequential, and leaves simulated-2d untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { actionTarget, bonePoint, initialState, render, step } from '../../tools/bake_character/adapter.ts';

const HOST = join(ROOT, 'assets', 'default-host');
const rig = JSON.parse(readFileSync(join(HOST, 'rig.json'), 'utf8'));
const profile = JSON.parse(readFileSync(join(HOST, 'profile.json'), 'utf8'));
const limits = new Map(profile.parameters.map((p) => [p.parameter_id, p]));
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const W = rig.canvas.width;
const region = (frame, [x0, y0, x1, y1]) => sha(Buffer.concat(Array.from({ length: y1 - y0 }, (_, k) => frame.subarray(((y0 + k) * W + x0) * 4, ((y0 + k) * W + x1) * 4))));
const posed = (params) => { const s = initialState(rig, 'neutral', 1); return { ...s, params: { ...s.params, ...params } }; };
const action = (gesture = 'idle', expression = 'explaining', angle = 'front', gaze = 'camera') => ({ angle, expression, gesture, gaze });
// Bake `frames` steps; `plan(f)` gives the action and viseme of frame f.
function bake(plan, frames, seed = 7) {
  let state = initialState(rig, 'neutral', seed);
  const out = [];
  for (let f = 0; f < frames; f += 1) {
    const { act, viseme = 'closed', phase = f } = plan(f);
    state = step(rig, state, actionTarget(rig, 'neutral', act, phase), viseme, limits);
    out.push(state);
  }
  return out;
}
const series = (states, id) => states.map((s) => s.params[id]);
const spread = (xs) => Math.max(...xs) - Math.min(...xs);

test('bones chain: the elbow bends the forearm and hand only, the shoulder carries the whole arm', () => {
  const base = render(rig, posed({}));
  const elbow = render(rig, posed({ ParamElbowR: 0.8 }));
  assert.equal(region(elbow, rig.regions.upper_arm_r), region(base, rig.regions.upper_arm_r), 'upper arm stays put');
  assert.notEqual(region(elbow, rig.regions.forearm_r), region(base, rig.regions.forearm_r), 'forearm moves');
  assert.equal(region(elbow, rig.regions.face), region(base, rig.regions.face));
  // The wrist follows the shoulder rotation and then the elbow rotation (forward kinematics).
  const wrist = rig.bones.find((b) => b.id === 'hand_r').pivot;
  const lifted = bonePoint(rig, posed({ ParamArmR: 0.7, ParamElbowR: 0 }).params, 'forearm_r', wrist);
  const bent = bonePoint(rig, posed({ ParamArmR: 0.7, ParamElbowR: -0.7 }).params, 'forearm_r', wrist);
  const shoulder = rig.bones.find((b) => b.id === 'upper_arm_r').pivot;
  const reach = (p) => Math.hypot(p[0] - shoulder[0], p[1] - shoulder[1]);
  assert.ok(lifted[0] > wrist[0] + 150, `raised arm reaches outward (${lifted})`);
  assert.ok(reach(bent) < reach(lifted) - 20, 'bending the elbow shortens the shoulder-to-wrist reach');
  // Both arms bend.
  const left = render(rig, posed({ ParamElbowL: 0.8 }));
  assert.notEqual(region(left, rig.regions.forearm_l), region(base, rig.regions.forearm_l));
});

test('head tilt turns the head about the neck without moving the jacket hem', () => {
  const base = render(rig, posed({}));
  const tilt = render(rig, posed({ ParamAngleZ: 1 }));
  assert.notEqual(region(tilt, rig.regions.face), region(base, rig.regions.face));
  assert.equal(region(tilt, rig.regions.hem), region(base, rig.regions.hem));
});

test('every listed gesture, expression and angle exists, and hands change shape per gesture', () => {
  for (const g of profile.gestures) assert.ok(rig.gestures[g], `gesture ${g}`);
  for (const e of profile.expressions) assert.ok(rig.expressions[e], `expression ${e}`);
  for (const a of profile.supported_angles) assert.ok(rig.angles[a], `angle ${a}`);
  for (const g of ['explain', 'emphasize']) assert.ok(profile.gestures.includes(g), `new gesture ${g}`);
  for (const e of ['happy', 'curious']) assert.ok(profile.expressions.includes(e), `new expression ${e}`);
  const hand = (shape) => render(rig, posed({ ParamHandR: shape }));
  const shapes = [0, 1, 2].map((s) => region(hand(s), rig.regions.hand_r));
  assert.equal(new Set(shapes).size, 3, 'relaxed, pointing and open hands differ');
  const smile = render(rig, posed({ ParamEyeSmile: 1 }));
  assert.notEqual(region(smile, rig.regions.eyes), region(render(rig, posed({})), rig.regions.eyes));
});

test('idle is alive: breathing, sway and saccades, all deterministic per seed', () => {
  const still = bake(() => ({ act: action() }), 240);
  assert.ok(spread(series(still.slice(60), 'ParamBreath')) > 0.5, 'breathing');
  assert.ok(spread(series(still.slice(60), 'ParamBodyX')) > 0.2, 'body sway');
  assert.ok(spread(series(still.slice(60), 'ParamAngleZ')) > 0.1, 'head drift');
  assert.ok(spread(series(still, 'ParamEyeBallX')) > 0.1, 'eyes move');
  assert.deepEqual(bake(() => ({ act: action() }), 240).at(-1), still.at(-1), 'same seed, same states');
  assert.notDeepEqual(bake(() => ({ act: action() }), 240, 99).map((s) => s.params.ParamEyeBallX), series(still, 'ParamEyeBallX'));
});

test('springs: a gesture change eases in, overshoots a little, settles, and the forearm trails the upper arm', () => {
  const states = bake((f) => ({ act: action(f < 30 ? 'idle' : 'point_right') }), 120);
  const goal = rig.gestures.point_right.ParamArmR;
  const arm = series(states, 'ParamArmR').slice(29);
  const deltas = arm.slice(1).map((v, k) => v - arm[k]);
  assert.ok(deltas[0] < 0.5 * Math.max(...deltas), 'eases in rather than jumping');
  assert.ok(Math.max(...arm) > goal + 0.005, 'overshoots');
  assert.ok(Math.max(...arm) < goal + 0.15, 'overshoot stays small');
  assert.ok(Math.abs(arm.at(-1) - goal) < 0.03, 'settles');
  // Follow-through: the elbow reaches half its travel later than the shoulder.
  const half = (id) => { const xs = series(states, id).slice(29), a = xs[0], b = rig.gestures.point_right[id]; return xs.findIndex((v) => Math.abs(v - a) >= Math.abs(b - a) / 2); };
  assert.ok(half('ParamElbowR') > half('ParamArmR'), `elbow ${half('ParamElbowR')} after shoulder ${half('ParamArmR')}`);
});

test('speech: a phrase onset nods and lifts the brows; rounded vowels narrow the mouth', () => {
  const talk = (f) => ({ act: action(), viseme: f < 40 ? 'closed' : f % 6 < 3 ? 'open' : 'rest' });
  const quiet = bake(() => ({ act: action() }), 60);
  const spoken = bake(talk, 60);
  const lift = (states, id) => Math.max(...series(states, id).slice(40, 56)) - series(states, id)[39];
  assert.ok(lift(spoken, 'ParamAngleY') > lift(quiet, 'ParamAngleY') + 0.15, 'nod at the onset');
  assert.ok(lift(spoken, 'ParamBrowY') > lift(quiet, 'ParamBrowY') + 0.15, 'brows lift');
  const rounded = bake((f) => ({ act: action(), viseme: f < 5 ? 'closed' : 'rounded' }), 15).at(-1);
  const open = bake((f) => ({ act: action(), viseme: f < 5 ? 'closed' : 'open' }), 15).at(-1);
  assert.ok(rounded.params.ParamMouthForm < -0.3 && open.params.ParamMouthForm > 0.1, 'mouth form follows the viseme');
  assert.notEqual(region(render(rig, rounded), rig.regions.mouth), region(render(rig, open), rig.regions.mouth));
});

test('gaze actions steer the eyes and stay within the profile limits', () => {
  const states = bake(() => ({ act: action('point_right', 'explaining', 'front', 'content') }), 60);
  assert.ok(states.at(-1).params.ParamEyeBallX > 0.4, 'looks toward the content');
  for (const s of states) for (const [id, v] of Object.entries(s.params)) {
    const l = limits.get(id);
    assert.ok(l, `profile lists ${id}`);
    assert.ok(v >= l.min && v <= l.max, `${id}=${v} within limits`);
  }
});
