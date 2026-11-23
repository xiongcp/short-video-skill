// T06 / A06: versioned asset registration with human usage clearance, host/diagram/illustration scene templates,
// and formal-assembly preflight (pinned versions, cleared usage, registered angles, zoom coverage, safe areas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, pngBytes, runCli, writeJson, wavBytes } from './helpers.mjs';
import { createSession } from '../../runtime/approvals.ts';

const ID = 'host-demo';
const ref = (name, v = 1) => `asset://${ID}/${name}/v${v}`;
let n = 0;
const call = (project, op, request, env = {}) =>
  runCli([op, '--project', project, '--request', writeJson(join(project, 'requests', `${String(n++).padStart(3, '0')}-${op}.json`), request)], env);
function ok(result) {
  assert.equal(result.code, 0, result.stdout + result.stderr);
  return result.json;
}
const RIGHTS = { holder: 'project owner', license: 'owner-original', source: 'test fixture generated in code', original: true };
function file(project, name, bytes) {
  mkdirSync(join(project, 'incoming'), { recursive: true });
  writeFileSync(join(project, 'incoming', name), bytes);
  return `incoming/${name}`;
}
const register = (project, name, kind, path, extra = {}) => call(project, 'register', { project_id: ID, name, kind, path, rights: RIGHTS, ...extra });
const PROFILE = (rig = ref('host_rig')) => ({ character_id: 'host_main', style_lock: ['墨蓝短外套', '栗色齐肩发'], rig_ref: rig, voice_ref: ref('host_voice'),
  supported_angles: ['front', 'three_quarter'], expressions: ['neutral', 'explaining'], gestures: ['idle', 'point_right'], parameters: [{ parameter_id: 'ParamMouthOpenY', min: 0, max: 1 }] });
const DIAGRAM = { elements: [{ element_id: 'browser', box: { left: 0.15, top: 0.3, right: 0.35, bottom: 0.55 } }, { element_id: 'server', box: { left: 0.65, top: 0.3, right: 0.85, bottom: 0.55 } }] };
const action = (angle = 'front', character = ref('host_main')) => ({ character_ref: character, angle, expression: 'explaining', gesture: 'point_right', gaze: 'camera' });

// A project with cleared host art, rig, voice, a 2880×1620 backdrop, a procedural diagram and two scenes.
function studio() {
  const project = makeProject();
  ok(call(project, 'init', { project_id: ID, title: '主持人素材', mode: 'quality' }));
  const owner = { SVS_SESSION_TOKEN: createSession(project, { reviewer_id: 'owner', kind: 'human' }) };
  ok(register(project, 'studio_backdrop', 'background', file(project, 'backdrop.png', pngBytes(2880, 1620))));
  ok(register(project, 'host_rig', 'rig', file(project, 'rig.json', JSON.stringify({ rig: 'fixture', parameters: ['ParamMouthOpenY'] }))));
  ok(register(project, 'host_voice', 'voice', file(project, 'voice.wav', wavBytes({ seconds: 1 }))));
  ok(register(project, 'host_main', 'character', file(project, 'host.png', pngBytes(1200, 1600, [200, 120, 90, 255])), { profile: PROFILE() }));
  ok(register(project, 'diagram_cache', 'diagram', file(project, 'diagram.json', JSON.stringify(DIAGRAM))));
  for (const name of ['studio_backdrop', 'host_rig', 'host_voice', 'host_main', 'diagram_cache']) {
    ok(call(project, 'clear', { project_id: ID, asset_ref: ref(name), usage: 'cleared', notes: '原创测试素材' }, owner));
  }
  ok(call(project, 'scene', { project_id: ID, name: 'studio_host', template: 'host', focus: '主持人双眼和手势', layers: [{ asset_ref: ref('studio_backdrop') }] }));
  ok(call(project, 'scene', { project_id: ID, name: 'diagram_ch_002', template: 'diagram', focus: '浏览器和服务器分列两端',
    layers: [{ asset_ref: ref('studio_backdrop') }, { asset_ref: ref('diagram_cache'), element_ids: ['browser', 'server'], claim_ids: ['reuse'] }] }));
  return { project, owner };
}
const preflight = (project, shots) => call(project, 'preflight', { project_id: ID, shots });
const issues = (result, ...keys) => result.json.issues.map((item) => keys.map((key) => item[key]));

test('formal assembly names the asset for a missing rig version, uncleared usage and an unregistered angle', () => {
  const { project, owner } = studio();
  ok(register(project, 'host_alt', 'character', file(project, 'alt.png', pngBytes(1200, 1600)), { profile: PROFILE(ref('host_rig', 2)) }));
  ok(call(project, 'clear', { project_id: ID, asset_ref: ref('host_alt'), usage: 'cleared', notes: '' }, owner));
  ok(register(project, 'backdrop_pending', 'background', file(project, 'pending.png', pngBytes(2880, 1620))));
  ok(call(project, 'scene', { project_id: ID, name: 'studio_pending', template: 'host', focus: '待授权背景', layers: [{ asset_ref: ref('backdrop_pending') }] }));
  const result = preflight(project, [
    { shot_id: 'shot_001', scene_ref: ref('studio_host'), character: action('front', ref('host_alt')), camera: { zoom: 1 } },
    { shot_id: 'shot_002', scene_ref: ref('studio_pending'), camera: { zoom: 1 } },
    { shot_id: 'shot_003', scene_ref: ref('studio_host'), character: action('side_90'), camera: { zoom: 1 } },
  ]);
  assert.equal(result.code, 1, result.stdout);
  assert.deepEqual(issues(result, 'code', 'shot_id', 'asset_ref'), [
    ['ASSET_NOT_FOUND', 'shot_001', ref('host_rig', 2)],
    ['ASSET_NOT_CLEARED', 'shot_002', ref('backdrop_pending')],
    ['ANGLE_UNREGISTERED', 'shot_003', ref('host_main')]]);
  assert.equal(result.json.issues[2].angle, 'side_90');
});

test('a full-frame 1920×1080 bitmap fails coverage for a native 1.5× push-in; vector diagrams pass', () => {
  const { project, owner } = studio();
  ok(register(project, 'backdrop_hd', 'background', file(project, 'hd.png', pngBytes(1920, 1080))));
  ok(call(project, 'clear', { project_id: ID, asset_ref: ref('backdrop_hd'), usage: 'cleared', notes: '' }, owner));
  ok(call(project, 'scene', { project_id: ID, name: 'studio_hd', template: 'host', focus: '1080p 背景', layers: [{ asset_ref: ref('backdrop_hd') }] }));
  const failed = preflight(project, [{ shot_id: 'shot_push', scene_ref: ref('studio_hd'), camera: { zoom: 1.5 } }]);
  assert.deepEqual(issues(failed, 'code', 'asset_ref', 'width', 'height', 'required_width', 'required_height'),
    [['COVERAGE_INSUFFICIENT', ref('backdrop_hd'), 1920, 1080, 2880, 1620]]);
  ok(preflight(project, [{ shot_id: 'shot_static', scene_ref: ref('studio_hd'), camera: { zoom: 1 } },
    { shot_id: 'shot_push', scene_ref: ref('studio_host'), camera: { zoom: 1.5 } }]));
});

test('diagram elements must stay inside the safe area at the shot zoom', () => {
  const { project } = studio();
  ok(preflight(project, [{ shot_id: 'shot_diagram', scene_ref: ref('diagram_ch_002'), camera: { zoom: 1 } }]));
  const pushed = preflight(project, [{ shot_id: 'shot_diagram', scene_ref: ref('diagram_ch_002'), camera: { zoom: 1.5 } }]);
  assert.deepEqual(issues(pushed, 'code', 'shot_id', 'asset_ref', 'element_id'),
    [['ELEMENT_OUTSIDE_SAFE_AREA', 'shot_diagram', ref('diagram_cache'), 'browser'], ['ELEMENT_OUTSIDE_SAFE_AREA', 'shot_diagram', ref('diagram_cache'), 'server']]);
});

test('usage clearance is human-only and prior versions stay resolvable', () => {
  const { project, owner } = studio();
  ok(register(project, 'backdrop_v', 'background', file(project, 'v1.png', pngBytes(2880, 1620, [10, 10, 10, 255]))));
  const agent = call(project, 'clear', { project_id: ID, asset_ref: ref('backdrop_v'), usage: 'cleared', notes: '' },
    { SVS_SESSION_TOKEN: createSession(project, { reviewer_id: 'writer-bot', kind: 'agent' }) });
  assert.deepEqual(issues(agent, 'code'), [['HUMAN_REQUIRED']]);
  ok(call(project, 'clear', { project_id: ID, asset_ref: ref('backdrop_v'), usage: 'cleared', notes: '' }, owner));
  const again = ok(register(project, 'backdrop_v', 'background', 'incoming/v1.png'));
  assert.deepEqual([again.status, again.asset.asset_ref], ['REPLAYED', ref('backdrop_v')]);
  const second = ok(register(project, 'backdrop_v', 'background', file(project, 'v2.png', pngBytes(2880, 1620, [250, 250, 250, 255]))));
  assert.equal(second.asset.asset_ref, ref('backdrop_v', 2));
  assert.equal(second.asset.usage, 'pending');
  ok(call(project, 'scene', { project_id: ID, name: 'studio_v1', template: 'host', focus: '旧版背景', layers: [{ asset_ref: ref('backdrop_v') }] }));
  const pinned = ok(preflight(project, [{ shot_id: 'shot_v1', scene_ref: ref('studio_v1'), camera: { zoom: 1 } }]));
  const background = pinned.resolved[0].assets.find((a) => a.asset_ref === ref('backdrop_v'));
  assert.notEqual(background.sha256, second.asset.sha256);
});

test('the three scene templates fix layer roles and reject mismatched layer kinds', () => {
  const { project, owner } = studio();
  ok(register(project, 'layer_illustration', 'illustration', file(project, 'ill.png', pngBytes(2880, 1620, [240, 200, 60, 255]))));
  ok(call(project, 'clear', { project_id: ID, asset_ref: ref('layer_illustration'), usage: 'cleared', notes: '' }, owner));
  const illustration = ok(call(project, 'scene', { project_id: ID, name: 'illustration_ch_001', template: 'illustration', focus: '两扇浏览器窗口',
    layers: [{ asset_ref: ref('studio_backdrop') }, { asset_ref: ref('layer_illustration'), element_ids: ['beat_002'] }] }));
  assert.deepEqual(illustration.scene.layers.map((l) => [l.role, l.z]), [['background', 0], ['illustration', 1]]);
  assert.deepEqual([illustration.scene.template, illustration.scene.scene_ref, illustration.scene.coordinate_system], ['illustration', ref('illustration_ch_001'), 'normalized_top_left']);
  assert.deepEqual(illustration.scene.safe_area, { left: 0.07, top: 0.07, right: 0.93, bottom: 0.85 });
  const wrong = call(project, 'scene', { project_id: ID, name: 'diagram_bad', template: 'diagram', focus: '错层',
    layers: [{ asset_ref: ref('studio_backdrop') }, { asset_ref: ref('layer_illustration') }] });
  assert.deepEqual(issues(wrong, 'code', 'asset_ref', 'expected', 'kind'), [['LAYER_KIND_MISMATCH', ref('layer_illustration'), 'diagram', 'illustration']]);
  const unknown = call(project, 'scene', { project_id: ID, name: 'x', template: 'poster', focus: 'x', layers: [] });
  assert.deepEqual(issues(unknown, 'code'), [['TEMPLATE_UNKNOWN']]);
});

test('host and diagram shots resolve through one path and pin every asset by hash', () => {
  const { project } = studio();
  const result = ok(preflight(project, [
    { shot_id: 'shot_host', scene_ref: ref('studio_host'), character: action('three_quarter'), camera: { zoom: 1.2 } },
    { shot_id: 'shot_diagram', scene_ref: ref('diagram_ch_002'), camera: { zoom: 1 } },
  ]));
  const pins = result.resolved.map((shot) => [shot.shot_id, shot.assets.map((a) => [a.asset_ref, a.kind])]);
  assert.deepEqual(pins, [
    ['shot_host', [[ref('studio_host'), 'scene'], [ref('studio_backdrop'), 'background'], [ref('host_main'), 'character'], [ref('host_rig'), 'rig'], [ref('host_voice'), 'voice']]],
    ['shot_diagram', [[ref('diagram_ch_002'), 'scene'], [ref('studio_backdrop'), 'background'], [ref('diagram_cache'), 'diagram']]]]);
  assert.ok(result.resolved.every((shot) => shot.assets.every((a) => /^sha256:[0-9a-f]{64}$/.test(a.sha256) && a.usage === 'cleared')));
  assert.deepEqual(result.resolved[0].character.supported_angles, ['front', 'three_quarter']);
});

test('a scene name cannot escape the project asset directory', async () => {
  const { project } = studio();
  const { existsSync } = await import('node:fs');
  const escaped = call(project, 'scene', { project_id: ID, name: '../../escaped', template: 'host', focus: 'x', layers: [{ asset_ref: ref('studio_backdrop') }] });
  assert.deepEqual(issues(escaped, 'code', 'name'), [['ASSET_KIND_INVALID', '../../escaped']]);
  assert.equal(existsSync(join(project, '..', 'escaped')), false);
});
