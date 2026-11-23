// T08 / A08: CharacterActionPlan against the capability table, sequential baking at a fixed 1/30 s step (pose → lips →
// secondary motion), deterministic random frame reads, and inherited end states that feed the dependent shot's cache key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { ID, alignedStudio, call, envelope, issues, ok, ref } from './studio-fixture.mjs';

const sha = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
// A code-defined 2D rig: named poses, angle/expression/gesture targets, visemes, hair spring and seeded blinks.
const RIG = {
  rig: 'simulated-2d', version: '1.0', canvas: { width: 240, height: 270 },
  colors: { hair: [70, 40, 30, 255], skin: [245, 215, 190, 255], coat: [30, 45, 90, 255], eye: [30, 30, 40, 255], mouth: [150, 50, 60, 255] },
  poses: { neutral: { ParamAngleX: 0, ParamArmR: 0, ParamEyeOpen: 1, ParamMouthOpenY: 0 }, lean: { ParamAngleX: -0.3, ParamArmR: 0.2, ParamEyeOpen: 1, ParamMouthOpenY: 0 } },
  angles: { front: { ParamAngleX: 0 }, three_quarter: { ParamAngleX: 0.6 } },
  expressions: { explaining: { ParamEyeOpen: 1 } },
  gestures: { idle: { ParamArmR: 0 }, point_right: { ParamArmR: 0.6 }, wave: { ParamArmR: 0.8, oscillate: { amplitude: 0.15, period_frames: 12 } } },
  visemes: { closed: 0, rest: 0.1, rounded: 0.5, open: 1 },
  physics: { hair: { stiffness: 60, damping: 8 } },
  blink: { chance: 0.05, frames: 3 },
};
const PROFILE = { character_id: 'host_main', style_lock: ['墨蓝短外套'], rig_ref: ref('host_rig'), voice_ref: ref('host_voice'),
  supported_angles: ['front', 'three_quarter'], expressions: ['explaining'], gestures: ['idle', 'point_right', 'wave'],
  parameters: [{ parameter_id: 'ParamAngleX', min: -1, max: 1 }, { parameter_id: 'ParamArmR', min: 0, max: 1 },
    { parameter_id: 'ParamEyeOpen', min: 0, max: 1 }, { parameter_id: 'ParamMouthOpenY', min: 0, max: 1 }] };
// sec_001 words: 先 [0,5) 看 [5,10) 第一段 [10,25) in frames; 看 is marked as a lip closure.
const WORDS = [
  { section_id: 'sec_001', words: [['先', 0, 8000], ['看', 8000, 16000], ['第一段', 16000, 40000]] },
  { section_id: 'sec_002', words: [['浏览器', 2400, 12000], ['有', 12000, 16000], ['副本', 16000, 26000], ['再', 30000, 34000], ['看', 34000, 38000],
    ['副本', 38000, 48000], ['是否', 48000, 56000], ['新鲜', 56000, 70000]] },
];
const host = (angle = 'front', gesture = 'point_right') => ({ character_ref: ref('host_main'), angle, expression: 'explaining', gesture, gaze: 'camera' });
const hostShot = (shot_id, chapter_id, section_id, extra = {}) => ({ shot_id, chapter_id, section_id, start: { section_id }, purpose: shot_id, camera: 'medium',
  scene_ref: ref('studio_host'), scene_layers: [ref('studio_backdrop')], character_actions: [host()], audio_anchors: [], visual_cues: [], depends_on: [], ...extra });
const BOARD = {
  alignment_version: 1,
  chapters: [
    { chapter_id: 'ch_001', title: '开场', section_ids: ['sec_001'], continuity_in: '空舞台', continuity_out: '主持人挥手' },
    { chapter_id: 'ch_002', title: '副本', section_ids: ['sec_002'], continuity_in: '主持人挥手', continuity_out: '主持人指向副本' }],
  shots: [hostShot('shot_001', 'ch_001', 'sec_001'), hostShot('shot_002', 'ch_002', 'sec_002', { depends_on: ['shot_001'] })],
};
// shot_001 (30 frames): wave facing front, then turn the head while waving; shot_002 (61 frames) inherits its end state.
const planRequest = (firstGesture = 'wave') => ({ project_id: ID, timeline_version: 1, shots: [
  { shot_id: 'shot_001', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral', actions: [
    { local_range: { start: 0, end: 12 }, action: host('front', firstGesture), cue_id: null },
    { local_range: { start: 12, end: 30 }, action: host('three_quarter', firstGesture), cue_id: null }] },
  { shot_id: 'shot_002', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral', actions: [
    { local_range: { start: 0, end: 61 }, action: host('front', 'point_right'), cue_id: 'cue_copy_1' }] },
] });

async function bakeProject() {
  const studio = await alignedStudio({ words: WORDS, marks: [{ word_id: 'sec_001-w002', viseme: 'closed' }], rig: RIG, profile: PROFILE });
  const { project } = studio;
  await ok(call(project, 'storyboard', { ...(await envelope(project, 'board')), ...BOARD }));
  await ok(call(project, 'compile', { ...(await envelope(project, 'compile')) }));
  const plan = await ok(call(project, 'plan', planRequest()));
  return { ...studio, plan, planRef: plan.asset.asset_ref };
}
const bake = (project, planRef, shot_id, frames, seed = 7) => call(project, 'bake', { project_id: ID, plan_ref: planRef, shot_id, seed, frames });
const byFrame = (report) => Object.fromEntries(report.frames.map((f) => [f.frame, f.rgba_sha256]));

// Decode the filter-0 RGBA PNG written by the baker back to raw pixels.
function pngRgba(bytes) {
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  const idat = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at), type = bytes.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') idat.push(bytes.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat)), row = width * 4;
  return Buffer.concat(Array.from({ length: height }, (_, y) => { assert.equal(raw[y * (row + 1)], 0); return raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1)); }));
}

test('frames 29, 0, 15 and 0, 15, 29 read identical lossless RGBA; an independent shot bakes alone', async () => {
  const [a, b] = [await bakeProject(), await bakeProject()];
  assert.equal(a.plan.plan.storyboard_version, 1);
  const first = await ok(bake(a.project, a.planRef, 'shot_001', [29, 0, 15]));
  const second = await ok(bake(b.project, b.planRef, 'shot_001', [0, 15, 29]));
  assert.equal(first.status, 'BAKED');
  assert.deepEqual(first.baked.map((s) => [s.shot_id, s.cached]), [['shot_001', false]]);
  assert.deepEqual(byFrame(first), byFrame(second));
  assert.equal(first.bake.cache_key, second.bake.cache_key);
  assert.equal(new Set(Object.values(byFrame(first))).size, 3, 'first, middle and last frames differ');
  for (const frame of first.frames) assert.equal(sha(pngRgba(readFileSync(join(a.project, frame.png)))), frame.rgba_sha256);

  const again = await ok(bake(a.project, a.planRef, 'shot_001', [0, 15, 29]));
  assert.equal(again.status, 'CACHED');
  assert.deepEqual(byFrame(again), byFrame(first));

  // The snapshot records rig, physics, step order, seed and timestep; lips close on the marked word.
  const trajectory = JSON.parse(readFileSync(join(a.project, first.bake.path), 'utf8'));
  assert.deepEqual([trajectory.order, trajectory.fps, trajectory.seed, trajectory.frames.length], [['pose', 'lips', 'secondary'], 30, 7, 30]);
  assert.deepEqual(trajectory.physics, RIG.physics);
  assert.equal(trajectory.rig_ref, ref('host_rig'));
  const mouth = trajectory.frames.map((f) => f.params.ParamMouthOpenY);
  assert.deepEqual(mouth.slice(5, 10), [0, 0, 0, 0, 0]);
  assert.ok(mouth.slice(12, 21).every((v) => v > 0.5), JSON.stringify(mouth));
  const head = trajectory.frames.map((f) => f.params.ParamAngleX);
  assert.ok(head[11] < 0.01 && head[29] > 0.5, 'the head turns after frame 12');
});

test('an inheriting shot starts from the preceding end state; changing that state changes its cache key', async () => {
  const a = await bakeProject();
  const dependent = await ok(bake(a.project, a.planRef, 'shot_002', [0, 60]));
  assert.deepEqual(dependent.baked.map((s) => [s.shot_id, s.cached]), [['shot_001', false], ['shot_002', false]]);
  const previous = dependent.baked[0];
  assert.equal(dependent.bake.initial_state_hash, previous.end_state_hash);
  assert.deepEqual(dependent.bake.inherited_from, { shot_id: 'shot_001', cache_key: previous.cache_key, end_state_hash: previous.end_state_hash });

  const plan2 = await ok(call(a.project, 'plan', planRequest('point_right')));
  const changed = await ok(bake(a.project, plan2.asset.asset_ref, 'shot_002', [0]));
  assert.notEqual(changed.baked[0].end_state_hash, previous.end_state_hash);
  assert.equal(changed.bake.initial_state_hash, changed.baked[0].end_state_hash);
  assert.notEqual(changed.bake.cache_key, dependent.bake.cache_key);
  assert.notEqual(changed.frames[0].rgba_sha256, dependent.frames[0].rgba_sha256);
});

test('plan validation names shot and field; out-of-range frames and a restricted rig block baking', async () => {
  const a = await bakeProject();
  const bad = planRequest();
  bad.shots[0].initial_pose = 'flying';
  bad.shots[0].actions[0].action.gesture = 'dance';
  bad.shots[0].actions[1].local_range = { start: 12, end: 31 };
  bad.shots[0].actions.push({ local_range: { start: 5, end: 14 }, action: host(), cue_id: null });
  bad.shots[1].initial_pose = 'lean';
  bad.shots[1].actions[0].cue_id = 'cue_missing';
  bad.shots.push({ ...bad.shots[1], shot_id: 'shot_009', initial_pose: 'neutral', actions: [] });
  const rejected = await call(a.project, 'plan', bad);
  assert.equal(rejected.code, 1, rejected.stdout);
  assert.deepEqual(issues(rejected, 'code', 'shot_id', 'field'), [
    ['POSE_UNKNOWN', 'shot_001', 'initial_pose'],
    ['ACTION_UNREGISTERED', 'shot_001', 'actions[0].action.gesture'],
    ['ACTION_RANGE_INVALID', 'shot_001', 'actions[1].local_range'],
    ['ACTION_OVERLAP', 'shot_001', 'actions[2].local_range'],
    ['INHERITED_POSE_MISMATCH', 'shot_002', 'initial_pose'],
    ['CUE_UNKNOWN', 'shot_002', 'actions[0].cue_id'],
    ['PLAN_SHOT_UNKNOWN', 'shot_009', 'shot_id']]);
  assert.equal(rejected.json.issues[4].expected, 'neutral');

  const outside = await call(a.project, 'bake', { project_id: ID, plan_ref: a.planRef, shot_id: 'shot_001', seed: 7, frames: [30] });
  assert.deepEqual(issues(outside, 'code', 'shot_id', 'frame', 'frame_count'), [['FRAME_OUT_OF_RANGE', 'shot_001', 30, 30]]);
  await ok(call(a.project, 'clear', { project_id: ID, asset_ref: ref('host_rig'), usage: 'restricted', notes: '撤回 Rig 授权' }, a.owner));
  const blocked = await call(a.project, 'bake', { project_id: ID, plan_ref: a.planRef, shot_id: 'shot_001', seed: 7, frames: [0] });
  assert.deepEqual(issues(blocked, 'code', 'shot_id', 'asset_ref', 'usage'), [['ASSET_NOT_CLEARED', 'shot_001', ref('host_rig'), 'restricted']]);
});
