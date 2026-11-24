// T12 default material: an original vector host ("晴", rig `vector-2d`) drawn by an antialiased rasterizer from layered
// path data, and a default narration voice rendered locally. The rig keeps the T08 parameter set, so sequential baking,
// cache keys and hash-checked frame reads work unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { ID, alignedStudio, call, envelope, ok, ref } from './studio-fixture.mjs';
import { PARAMS, characterPlacement, initialState, render } from '../../tools/bake_character/adapter.ts';

const HOST = join(ROOT, 'assets', 'default-host');
const rig = () => JSON.parse(readFileSync(join(HOST, 'rig.json'), 'utf8'));
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const px = (buf, W, x, y) => [...buf.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];
const withParams = (r, params, extra = {}) => ({ ...initialState(r, 'neutral', 1), ...extra, params: { ...initialState(r, 'neutral', 1).params, ...params } });

test('vector-2d fills paths with antialiased straight alpha and no colour fringe', () => {
  const tiny = { rig: 'vector-2d', canvas: { width: 20, height: 20 }, poses: { neutral: {} }, head: { shift: 0 },
    parts: [{ id: 'square', fill: [30, 60, 90, 255], d: 'M 4.5 4.5 L 15.5 4.5 L 15.5 15.5 L 4.5 15.5 Z' }] };
  const out = render(tiny, initialState(tiny, 'neutral', 1));
  assert.equal(out.length, 20 * 20 * 4);
  assert.deepEqual(px(out, 20, 10, 10), [30, 60, 90, 255]);
  assert.equal(px(out, 20, 0, 0)[3], 0);
  const edge = px(out, 20, 4, 10);
  assert.ok(edge[3] > 100 && edge[3] < 160, `edge alpha ${edge[3]} should be about half`);
  assert.deepEqual(edge.slice(0, 3), [30, 60, 90], 'a partly covered pixel keeps the fill colour');
});

test('default host: rendering is deterministic and each parameter moves only its own layers', () => {
  const r = rig();
  const { width: W } = r.canvas;
  const base = render(r, withParams(r, {}));
  assert.equal(sha(base), sha(render(r, withParams(r, {}))));
  const variants = {
    arm: render(r, withParams(r, { ParamArmR: 1 })),
    mouth: render(r, withParams(r, { ParamMouthOpenY: 1 })),
    eyes: render(r, withParams(r, {}, { blink: 2 })),
    head: render(r, withParams(r, { ParamAngleX: 0.6 })),
  };
  for (const [name, frame] of Object.entries(variants)) assert.notEqual(sha(frame), sha(base), `${name} must change the frame`);
  // Raising the arm leaves the face untouched; opening the mouth leaves the eyes untouched.
  const region = (frame, [x0, y0, x1, y1]) => sha(Buffer.concat(Array.from({ length: y1 - y0 }, (_, k) => frame.subarray(((y0 + k) * W + x0) * 4, ((y0 + k) * W + x1) * 4))));
  assert.equal(region(variants.arm, r.regions.face), region(base, r.regions.face));
  assert.equal(region(variants.mouth, r.regions.eyes), region(base, r.regions.eyes));
  assert.notEqual(region(variants.mouth, r.regions.mouth), region(base, r.regions.mouth));
  // Hair and skin edges are antialiased.
  assert.ok([...base].some((v, i) => i % 4 === 3 && v > 0 && v < 255), 'edges must carry partial alpha');
});

test('placement: simulated-2d keeps its spot and a vector rig must fit inside the 1920×1080 frame', () => {
  assert.deepEqual(characterPlacement({ rig: 'simulated-2d', canvas: { width: 240, height: 270 } }), { x: 240, y: 540 });
  const r = rig();
  const at = characterPlacement(r);
  assert.ok(at.x >= 0 && at.y >= 0 && at.x + r.canvas.width <= 1920 && at.y + r.canvas.height <= 1080);
});

test('the default host plans and bakes through the T08 path', async () => {
  const profile = JSON.parse(readFileSync(join(HOST, 'profile.json'), 'utf8'));
  for (const id of PARAMS) assert.ok(profile.parameters.some((p) => p.parameter_id === id), `profile lists ${id}`);
  const studio = await alignedStudio({
    words: [{ section_id: 'sec_001', words: [['先', 0, 8000], ['看', 8000, 16000], ['第一段', 16000, 40000]] },
      { section_id: 'sec_002', words: [['浏览器', 2400, 12000], ['有', 12000, 16000], ['副本', 16000, 26000], ['再', 30000, 34000],
        ['看', 34000, 38000], ['副本', 38000, 48000], ['是否', 48000, 56000], ['新鲜', 56000, 70000]] }],
    rig: rig(), profile: { ...profile, rig_ref: ref('host_rig'), voice_ref: ref('host_voice') } });
  const { project } = studio;
  const host = (angle, gesture) => ({ character_ref: ref('host_main'), angle, expression: 'explaining', gesture, gaze: 'camera' });
  const shot = (shot_id, chapter_id, section_id) => ({ shot_id, chapter_id, section_id, start: { section_id }, purpose: shot_id, camera: 'medium',
    scene_ref: ref('studio_host'), scene_layers: [ref('studio_backdrop')], character_actions: [host('front', 'wave')], audio_anchors: [], visual_cues: [], depends_on: [] });
  await ok(call(project, 'storyboard', { ...(await envelope(project, 'board')), alignment_version: 1,
    chapters: [{ chapter_id: 'ch_001', title: '开场', section_ids: ['sec_001', 'sec_002'], continuity_in: '空舞台', continuity_out: '主持人指向' }],
    shots: [shot('shot_001', 'ch_001', 'sec_001'), shot('shot_002', 'ch_001', 'sec_002')] }));
  await ok(call(project, 'compile', { ...(await envelope(project, 'compile')) }));
  const plan = await ok(call(project, 'plan', { project_id: ID, timeline_version: 1, shots: [
    { shot_id: 'shot_001', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral',
      actions: [{ local_range: { start: 0, end: 30 }, action: host('three_quarter', 'wave'), cue_id: null }] }] }));
  const baked = await ok(call(project, 'bake', { project_id: ID, plan_ref: plan.asset.asset_ref, shot_id: 'shot_001', seed: 7, frames: [0, 29] }));
  assert.equal(baked.frames.length, 2);
  assert.notEqual(baked.frames[0].rgba_sha256, baked.frames[1].rgba_sha256);
});

test('the default host package ships its art, profile, rights and preview sheet', () => {
  for (const file of ['rig.json', 'profile.json', 'rights.json', 'host.png', 'preview.png']) assert.ok(existsSync(join(HOST, file)), `${file} exists`);
  const rights = JSON.parse(readFileSync(join(HOST, 'rights.json'), 'utf8'));
  assert.equal(rights.original, true);
  assert.equal(rig().rig, 'vector-2d');
});
