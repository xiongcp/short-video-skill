// Rebuild A08 runtime evidence with the simulated 2D rig: wave, close the lips on a marked word and turn the head; read the
// last/first/middle frames in two request orders (separate projects and processes); bake both shots with two worker orders
// running concurrently; show that the inheriting shot starts from the preceding end state and that changing that state
// changes its cache key; keep parameters, seed, pixel comparisons and boundary frames.
// Not covered: the approved original rig (A06), real speech (A05) and composited shot rendering (T09).
// usage: node docs/upgrade/evidence/replay_t08.mjs <run_id> [python]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { inflateSync } from 'node:zlib';
import { ROOT } from '../../../tests/runtime/helpers.mjs';
import { ID, alignedStudio, call as rawCall, envelope, ref } from '../../../tests/runtime/studio-fixture.mjs';
import { BAKER } from '../../../tools/bake_character/adapter.ts';

const [runId, python = 'python3'] = process.argv.slice(2);
if (!runId) throw new Error('usage: replay_t08.mjs <run_id> [python]');
const out = join(ROOT, 'docs', 'upgrade', 'evidence', 'runs', runId, 'A08');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'audit'), { recursive: true });
mkdirSync(join(out, 'frames'), { recursive: true });
const sha256 = (data) => 'sha256:' + createHash('sha256').update(data).digest('hex');
const save = (name, value) => writeFileSync(join(out, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');

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
const WORDS = [
  { section_id: 'sec_001', words: [['先', 0, 8000], ['看', 8000, 16000], ['第一段', 16000, 40000]] },
  { section_id: 'sec_002', words: [['浏览器', 2400, 12000], ['有', 12000, 16000], ['副本', 16000, 26000], ['再', 30000, 34000], ['看', 34000, 38000],
    ['副本', 38000, 48000], ['是否', 48000, 56000], ['新鲜', 56000, 70000]] },
];
const MARKS = [{ word_id: 'sec_001-w002', viseme: 'closed' }];
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
const planRequest = (firstGesture = 'wave') => ({ project_id: ID, timeline_version: 1, shots: [
  { shot_id: 'shot_001', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral', actions: [
    { local_range: { start: 0, end: 12 }, action: host('front', firstGesture), cue_id: null },
    { local_range: { start: 12, end: 30 }, action: host('three_quarter', firstGesture), cue_id: null }] },
  { shot_id: 'shot_002', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral', actions: [
    { local_range: { start: 0, end: 61 }, action: host('front', 'point_right'), cue_id: 'cue_copy_1' }] },
] });

const audit = [];
async function call(label, project, op, request, env = {}, session = null) {
  const seq = audit.length;
  audit.push(null);
  const run = await rawCall(project, op, request, env);
  const entry = { seq, label, op, session, request, exit_code: run.code, response: run.json };
  writeFileSync(join(out, 'audit', `${String(seq).padStart(3, '0')}-${label}.json`), JSON.stringify(entry, null, 2) + '\n');
  audit[seq] = entry;
  return run.json;
}
// Setup (alignment, cleared placeholder art, storyboard, compile) uses the shared test fixture; plan, bake and clear calls are audited.
async function studio(label) {
  const s = await alignedStudio({ words: WORDS, marks: MARKS, rig: RIG, profile: PROFILE });
  await rawCall(s.project, 'storyboard', { ...(await envelope(s.project, 'board')), ...BOARD });
  const compiled = await rawCall(s.project, 'compile', { ...(await envelope(s.project, 'compile')) });
  const plan = await call(`${label}-plan`, s.project, 'plan', planRequest());
  return { ...s, timeline: compiled.json.document.timeline, plan, planRef: plan.asset.asset_ref };
}
const bake = (label, s, shot_id, frames, planRef = s.planRef) => call(label, s.project, 'bake', { project_id: ID, plan_ref: planRef, shot_id, seed: 7, frames });
function rgba(project, path) {
  const bytes = readFileSync(join(project, path));
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), idat = [];
  for (let at = 8; at < bytes.length;) { const n = bytes.readUInt32BE(at); if (bytes.toString('ascii', at + 4, at + 8) === 'IDAT') idat.push(bytes.subarray(at + 8, at + 8 + n)); at += 12 + n; }
  const raw = inflateSync(Buffer.concat(idat)), row = width * 4;
  return Buffer.concat(Array.from({ length: height }, (_, y) => raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1))));
}
const differing = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a.readUInt32BE(i) !== b.readUInt32BE(i)) n += 1; return n; };
const all = (n) => Array.from({ length: n }, (_, i) => i);

// 1. Request order: last/first/middle in one project, first/middle/last in another.
const p1 = await studio('p1'), p2 = await studio('p2');
const lastFirst = await bake('p1-bake-shot_001-29-0-15', p1, 'shot_001', [29, 0, 15]);
const firstLast = await bake('p2-bake-shot_001-0-15-29', p2, 'shot_001', [0, 15, 29]);
const reread = await bake('p1-bake-shot_001-again', p1, 'shot_001', [0, 15, 29]);
const pixels = (a, b) => a.frames.map((f) => {
  const g = b.frames.find((x) => x.frame === f.frame);
  return { frame: f.frame, a: f.rgba_sha256, b: g.rgba_sha256, differing_pixels: differing(rgba(p1.project, f.png), rgba(p2.project, g.png)) };
});
const orderComparison = pixels(lastFirst, firstLast);
const motion = [[0, 15], [15, 29], [0, 29]].map(([x, y]) => ({ frames: [x, y],
  differing_pixels: differing(rgba(p1.project, lastFirst.frames.find((f) => f.frame === x).png), rgba(p1.project, lastFirst.frames.find((f) => f.frame === y).png)) }));

// 2. Worker order: two workers start concurrently, in opposite order, on fresh projects; every frame of both shots compared.
const p3 = await studio('p3'), p4 = await studio('p4');
const [w3a, w3b] = await Promise.all([bake('p3-worker-1-shot_002', p3, 'shot_002', all(61)), bake('p3-worker-2-shot_001', p3, 'shot_001', all(30))]);
const [w4a, w4b] = await Promise.all([bake('p4-worker-1-shot_001', p4, 'shot_001', all(30)), bake('p4-worker-2-shot_002', p4, 'shot_002', all(61))]);
const hashes = (r) => r.frames.map((f) => f.rgba_sha256);
const workerOrder = {
  shot_001_identical: JSON.stringify(hashes(w3b)) === JSON.stringify(hashes(w4a)),
  shot_002_identical: JSON.stringify(hashes(w3a)) === JSON.stringify(hashes(w4b)),
  shot_001_cache_keys: [w3b.bake.cache_key, w4a.bake.cache_key], shot_002_cache_keys: [w3a.bake.cache_key, w4b.bake.cache_key],
  statuses: { p3: [w3a.status, w3b.status], p4: [w4a.status, w4b.status] },
  // Each shot is baked once per project whichever worker gets there first.
  bake_assets: { p3: new Set([...w3a.baked, ...w3b.baked].map((b) => b.asset_ref)).size, p4: new Set([...w4a.baked, ...w4b.baked].map((b) => b.asset_ref)).size },
};

// 3. Inheritance: shot_002 starts from shot_001's end state; a different shot_001 plan changes shot_002's key.
const p5 = await studio('p5');
const dependent = await bake('p5-bake-shot_002', p5, 'shot_002', [0, 60]);
const plan2 = await call('p5-plan-point_right', p5.project, 'plan', planRequest('point_right'));
const changed = await bake('p5-bake-shot_002-plan2', p5, 'shot_002', [0, 60], plan2.asset.asset_ref);
const head = await bake('p5-bake-shot_001-boundary', p5, 'shot_001', [29]);
const inheritance = {
  initial_equals_previous_end: dependent.bake.initial_state_hash === dependent.baked[0].end_state_hash,
  inherited_from: dependent.bake.inherited_from,
  changed_end_state: changed.baked[0].end_state_hash !== dependent.baked[0].end_state_hash,
  changed_cache_key: changed.bake.cache_key !== dependent.bake.cache_key,
  changed_initial_equals_new_end: changed.bake.initial_state_hash === changed.baked[0].end_state_hash,
  boundary_differing_pixels: differing(rgba(p5.project, head.frames[0].png), rgba(p5.project, dependent.frames[0].png)),
};

// Keep parameters, plan, boundary and sample frames.
const trajectory = JSON.parse(readFileSync(join(p1.project, lastFirst.bake.path), 'utf8'));
const dependentTrajectory = JSON.parse(readFileSync(join(p5.project, dependent.bake.path), 'utf8'));
save('rig.json', RIG);
save('plan.json', p1.plan.plan);
save('trajectory-shot_001.json', trajectory);
save('trajectory-shot_002.json', dependentTrajectory);
save('timeline.json', p1.timeline);
const keep = (project, path, name) => { copyFileSync(join(project, path), join(out, 'frames', name)); return `frames/${name}`; };
const frames = {
  shot_001_f00000: keep(p1.project, lastFirst.frames.find((f) => f.frame === 0).png, 'shot_001-f00000.png'),
  shot_001_f00015: keep(p1.project, lastFirst.frames.find((f) => f.frame === 15).png, 'shot_001-f00015.png'),
  shot_001_f00029: keep(p1.project, lastFirst.frames.find((f) => f.frame === 29).png, 'shot_001-f00029.png'),
  boundary_shot_001_f00029: keep(p5.project, head.frames[0].png, 'boundary-shot_001-f00029.png'),
  boundary_shot_002_f00000: keep(p5.project, dependent.frames[0].png, 'boundary-shot_002-f00000.png'),
};
const mouth = trajectory.frames.map((f) => f.params.ParamMouthOpenY), angle = trajectory.frames.map((f) => f.params.ParamAngleX);
const comparisons = { request_order: orderComparison, motion_within_shot: motion, worker_order: workerOrder, inheritance,
  lips: { closed_frames_5_9: mouth.slice(5, 10), open_frames_12_20_min: Math.min(...mouth.slice(12, 21)) }, head_turn: { frame_11: angle[11], frame_29: angle[29] } };
save('comparisons.json', comparisons);
for (const s of [p1, p2, p3, p4, p5]) rmSync(s.project, { recursive: true, force: true });

// Contracts: the plan, the tool result and the bake input that T09 will submit.
const bakeInput = { shot_id: 'shot_001', character_plan_ref: p1.planRef, rig_ref: ref('host_rig'), fps: 30, frame_count: lastFirst.bake.frame_count };
save('bake-input.json', bakeInput);
save('tool-result.json', lastFirst.tool_result);
const check = spawnSync(python, ['-B', '-c', [
  'import json, sys', "sys.path.insert(0, 'evals')", 'from check_design import read_schemas, validate_contract', 'schemas, registry = read_schemas()',
  `for name, contract in [('plan.json', 'workflow#CharacterActionPlan'), ('bake-input.json', 'workflow#BakeCharacterInput'), ('tool-result.json', 'workflow#ToolResult'), ('timeline.json', 'workflow#CompiledTimeline')]:`,
  `    validate_contract(json.load(open(${JSON.stringify(relative(ROOT, out))} + '/' + name)), contract, schemas, registry); print(f"{name} valid against {contract}")`,
].join('\n')], { cwd: ROOT, encoding: 'utf8' });
save('schema-check.txt', check.stdout + check.stderr);

const checks = {
  request_order_identical: orderComparison.every((c) => c.a === c.b && c.differing_pixels === 0) && lastFirst.bake.cache_key === firstLast.bake.cache_key,
  visible_motion: motion.every((m) => m.differing_pixels > 0),
  reread_cached: reread.status === 'CACHED' && JSON.stringify(hashes(reread)) === JSON.stringify(hashes(firstLast)),
  independent_alone: JSON.stringify(lastFirst.baked.map((b) => b.shot_id)) === '["shot_001"]',
  worker_order_identical: workerOrder.shot_001_identical && workerOrder.shot_002_identical
    && workerOrder.shot_001_cache_keys[0] === workerOrder.shot_001_cache_keys[1] && workerOrder.shot_002_cache_keys[0] === workerOrder.shot_002_cache_keys[1]
    && workerOrder.bake_assets.p3 === 2 && workerOrder.bake_assets.p4 === 2,
  inheritance: inheritance.initial_equals_previous_end && inheritance.changed_end_state && inheritance.changed_cache_key && inheritance.changed_initial_equals_new_end,
  lips_closed: comparisons.lips.closed_frames_5_9.every((v) => v === 0) && comparisons.lips.open_frames_12_20_min > 0.5,
  head_turn: angle[11] < 0.01 && angle[29] > 0.5,
  snapshot_recorded: JSON.stringify(trajectory.order) === '["pose","lips","secondary"]' && trajectory.seed === 7 && trajectory.fps === 30
    && JSON.stringify(trajectory.physics) === JSON.stringify(RIG.physics) && trajectory.rig_sha256 === sha256(JSON.stringify(RIG)),
  schemas_valid: check.status === 0,
};
const files = (d) => readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? files(join(d, n)) : [join(d, n)]);
const record = {
  task_id: 'T08', case_id: 'A08', run_id: runId, status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', evidence_level: 'RUNTIME',
  environment: { node: process.version, platform: `${process.platform}-${process.arch}`, python: spawnSync(python, ['--version'], { encoding: 'utf8' }).stdout.trim(),
    baker: BAKER, rig: { type: RIG.rig, version: RIG.version, sha256: sha256(JSON.stringify(RIG)) }, seed: 7, step_seconds: '1/30' },
  commands_and_exit_codes: [
    { command: `node docs/upgrade/evidence/replay_t08.mjs ${runId} ${basename(python)}`, note: 'plan, bake and clear calls are saved under audit/; project setup uses tests/runtime/studio-fixture.mjs' },
    { command: `${basename(python)} -B -c <validate plan, bake input, tool result and timeline>`, exit_code: check.status, saved_as: 'schema-check.txt' },
  ],
  input_hashes: ['tools/bake_character/contract.yaml', 'schemas/workflow.schema.json', 'schemas/character.schema.json', 'tools/bake_character/adapter.ts', 'runtime/baker.ts']
    .map((path) => ({ path, sha256: sha256(readFileSync(join(ROOT, path))) })),
  output_hashes: files(out).filter((p) => !p.includes('/audit/')).map((path) => ({ path: relative(out, path), sha256: sha256(readFileSync(path)) })),
  observations: [
    `checks: ${JSON.stringify(checks)}`,
    'rig: code-defined simulated-2d rig (named poses, angle/expression/gesture targets, visemes, hair spring, seeded blinks) cleared by an owner session created by the test fixture; it stands in for the approved original rig',
    'determinism holds in this pinned environment (same Node, platform and baker version); cross-machine tolerance is not calibrated',
    'scope: the approved original rig and art (A06/A11), real speech (A05) and composited shot rendering and caching across revisions (T09) are NOT_RUN',
  ],
  evidence_paths: files(out).filter((p) => !p.includes('/audit/')).map((path) => relative(ROOT, path)).concat([relative(ROOT, join(out, 'audit')) + '/']),
  reviewer: null,
};
save('record.json', record);
console.log(JSON.stringify({ status: record.status, checks, calls: audit.length, frames }));
