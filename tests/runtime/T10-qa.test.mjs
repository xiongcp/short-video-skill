// T10 / A10 & A11: three-level QA (preflight geometry & mid-motion caption collision, per-frame visual & audio
// technical inspection, 12-cell timecoded contact sheet & 20–30 s audible sample), delivery targets, Studio
// shot/waveform navigation from the same QA result, and blinded A/B subjective review gating G3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, pngBytes, runCliAsync, wavBytes, writeJson, writeWav } from './helpers.mjs';
import { createSession } from '../../runtime/approvals.ts';

const ID = 'qa-demo';
const ref = (name, v = 1) => `asset://${ID}/${name}/v${v}`;
const sha256 = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const RIGHTS = { holder: 'project owner', license: 'owner-original', source: 'test fixture generated in code', original: true };

const RIG = {
  rig: 'simulated-2d', version: '1.0', canvas: { width: 240, height: 270 },
  colors: { hair: [70, 40, 30, 255], skin: [245, 215, 190, 255], coat: [30, 45, 90, 255], eye: [30, 30, 40, 255], mouth: [150, 50, 60, 255] },
  poses: { neutral: { ParamAngleX: 0, ParamArmR: 0, ParamEyeOpen: 1, ParamMouthOpenY: 0 } },
  angles: { front: { ParamAngleX: 0 }, three_quarter: { ParamAngleX: 0.6 } },
  expressions: { explaining: { ParamEyeOpen: 1 }, focused: { ParamEyeOpen: 0.35 } },
  gestures: { idle: { ParamArmR: 0 }, point_right: { ParamArmR: 0.6 }, wave: { ParamArmR: 0.8, oscillate: { amplitude: 0.15, period_frames: 12 } } },
  visemes: { closed: 0, rest: 0.1, rounded: 0.5, open: 1 },
  physics: { hair: { stiffness: 60, damping: 8 } },
  blink: { chance: 0.05, frames: 3 },
};
const PROFILE = {
  character_id: 'host_main', style_lock: ['墨蓝短外套'], rig_ref: ref('host_rig'), voice_ref: ref('host_voice'),
  supported_angles: ['front', 'three_quarter'], expressions: ['explaining', 'focused'], gestures: ['idle', 'point_right', 'wave'],
  parameters: [{ parameter_id: 'ParamAngleX', min: -1, max: 1 }, { parameter_id: 'ParamArmR', min: 0, max: 1 },
    { parameter_id: 'ParamEyeOpen', min: 0, max: 1 }, { parameter_id: 'ParamMouthOpenY', min: 0, max: 1 }],
};
const host = (expression = 'explaining', gesture = 'wave', angle = 'front') =>
  ({ character_ref: ref('host_main'), angle, expression, gesture, gaze: 'camera' });

// Diagram element safe at rest (bottom 0.72 <= 0.85) that dips into caption band mid-motion (local frame 15: bottom 0.94).
const MOVING_DIAGRAM = {
  elements: [
    {
      element_id: 'card_a',
      box: { left: 0.20, top: 0.55, right: 0.50, bottom: 0.72 },
      motion: {
        keyframes: [
          { local_frame: 0, box: { left: 0.20, top: 0.55, right: 0.50, bottom: 0.72 } },
          { local_frame: 15, box: { left: 0.20, top: 0.80, right: 0.50, bottom: 0.94 } },
          { local_frame: 29, box: { left: 0.20, top: 0.55, right: 0.50, bottom: 0.72 } },
        ],
      },
    },
  ],
};
const STATIC_DIAGRAM = {
  elements: [
    { element_id: 'browser', box: { left: 0.15, top: 0.28, right: 0.40, bottom: 0.52 } },
    { element_id: 'server', box: { left: 0.60, top: 0.28, right: 0.85, bottom: 0.52 } },
  ],
};

let seq = 0;
async function call(project, op, request, env = {}) {
  const path = writeJson(join(project, 'requests', `${String(seq++).padStart(4, '0')}-${op}.json`), request);
  return runCliAsync([op, '--project', project, '--request', path], env);
}
async function ok(promise) {
  const result = await promise;
  assert.equal(result.code, 0, result.stdout + result.stderr);
  return result.json;
}
const status = async (project) => (await call(project, 'status', { project_id: ID })).json;
const envelope = async (project, key) => ({ project_id: ID, expected_version: (await status(project)).version, idempotency_key: key });

function wavWithSilence({ seconds, silenceStartSec, silenceEndSec, rate = 48000, channels = 1 }) {
  const buf = wavBytes({ seconds, rate, channels });
  const startSample = Math.round(silenceStartSec * rate);
  const endSample = Math.round(silenceEndSec * rate);
  for (let i = startSample; i < endSample; i += 1) {
    for (let c = 0; c < channels; c += 1) buf.writeInt16LE(0, 44 + (i * channels + c) * 2);
  }
  return buf;
}

function runFfmpeg(args) {
  const res = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
}

// Build a 4-shot studio for A10 defect injection:
// - shot_001: host (1 s, frames 0..30) -> will receive 1-frame white flash at frame 15
// - shot_002: moving diagram (1 s, frames 30..60) -> mid-motion caption collision at frames ~40..50
// - shot_003: static diagram (3 s, frames 60..150) -> undeclared long freeze + black frames 100..105 + 1.5s unintended silence
// - shot_004: static diagram (3 s, frames 150..240) -> declared reading hold (preserved with reason)
async function defectStudio() {
  const project = makeProject();
  await ok(call(project, 'init', { project_id: ID, title: 'T10自动QA缺陷注入', mode: 'draft' }));
  const owner = { SVS_SESSION_TOKEN: createSession(project, { reviewer_id: 'owner', kind: 'human' }) };
  await ok(call(project, 'brief', { ...(await envelope(project, 'brief')), topic: '缓存原理', audience: '开发者', scope: ['命中'],
    keywords: ['缓存'], language: 'zh-CN', style_profile: 'anime-clean', overrides: { duration_target_seconds: 60 } }));
  await ok(call(project, 'event', { ...(await envelope(project, 'res')), event: 'research_started', payload: {} }));
  await ok(call(project, 'evidence', { ...(await envelope(project, 'ev')), sources: [], claims: [], links: [] }));
  await ok(call(project, 'event', { ...(await envelope(project, 'to-sc')), event: 'draft_script_requested', payload: {} }));
  const sections = [
    { section_id: 'sec_001', title: '开场', narration: '先看主持人开场。', claim_ids: [], pronunciation: [], visual_intent: '主持人', duration_estimate_frames: 30, cues: [] },
    { section_id: 'sec_002', title: '动画', narration: '再看移动卡片和字幕区域。', claim_ids: [], pronunciation: [], visual_intent: '卡片动画', duration_estimate_frames: 30, cues: [] },
    { section_id: 'sec_003', title: '长静止', narration: '这里演示未声明静止与静音。', claim_ids: [], pronunciation: [], visual_intent: '图解', duration_estimate_frames: 90, cues: [] },
    { section_id: 'sec_004', title: '读图停留', narration: '请通读三层缓存命中率对比。', claim_ids: [], pronunciation: [], visual_intent: '静态读图', duration_estimate_frames: 90, cues: [] },
  ];
  await ok(call(project, 'script', { ...(await envelope(project, 'sc')), script_id: 'ep', sections }));
  await ok(call(project, 'event', { ...(await envelope(project, 'to-au')), event: 'draft_audio_requested', payload: {} }));

  const file = (name, bytes) => { mkdirSync(join(project, 'incoming'), { recursive: true }); writeFileSync(join(project, 'incoming', name), bytes); return `incoming/${name}`; };
  const reg = (name, kind, path, extra = {}) => ok(call(project, 'register', { project_id: ID, name, kind, path, rights: RIGHTS, ...extra }));
  await reg('studio_backdrop', 'background', file('backdrop.png', pngBytes(2880, 1620, [24, 38, 72, 255])));
  await reg('host_rig', 'rig', file('rig.json', JSON.stringify(RIG)));
  await reg('host_voice', 'voice', file('voice.wav', wavBytes({ seconds: 1 })));
  await reg('host_main', 'character', file('host.png', pngBytes(1200, 1600, [200, 120, 90, 255])), { profile: PROFILE });
  await reg('diagram_moving', 'diagram', file('diagram-moving.json', JSON.stringify(MOVING_DIAGRAM)));
  await reg('diagram_static', 'diagram', file('diagram-static.json', JSON.stringify(STATIC_DIAGRAM)));
  await reg('subtitle_style', 'other', file('subtitle-style.json', JSON.stringify({ color: '#FFFFFF', outline: '#101820' })));
  for (const name of ['studio_backdrop', 'host_rig', 'host_voice', 'host_main', 'diagram_moving', 'diagram_static', 'subtitle_style']) {
    await ok(call(project, 'clear', { project_id: ID, asset_ref: ref(name), usage: 'cleared', notes: '测试授权' }, owner));
  }
  await ok(call(project, 'scene', { project_id: ID, name: 'studio_host', template: 'host', focus: '主持人', layers: [{ asset_ref: ref('studio_backdrop') }] }));
  await ok(call(project, 'scene', { project_id: ID, name: 'scene_moving', template: 'diagram', focus: '移动卡片',
    layers: [{ asset_ref: ref('studio_backdrop') }, { asset_ref: ref('diagram_moving'), element_ids: ['card_a'], claim_ids: [] }] }));
  await ok(call(project, 'scene', { project_id: ID, name: 'scene_static', template: 'diagram', focus: '对比图解',
    layers: [{ asset_ref: ref('studio_backdrop') }, { asset_ref: ref('diagram_static'), element_ids: ['browser', 'server'], claim_ids: [] }] }));

  writeWav(join(project, 'incoming', 'sec_001.wav'), { seconds: 1 });
  writeWav(join(project, 'incoming', 'sec_002.wav'), { seconds: 1 });
  // Inject 1.5 s unintended silence inside sec_003 (local 0.5 s .. 2.0 s -> master 2.5 s .. 4.0 s -> frames 75..120).
  writeFileSync(join(project, 'incoming', 'sec_003.wav'), wavWithSilence({ seconds: 3, silenceStartSec: 0.5, silenceEndSec: 2.0 }));
  writeWav(join(project, 'incoming', 'sec_004.wav'), { seconds: 3 });
  await ok(call(project, 'audio', { ...(await envelope(project, 'audio')), sections: [
    { section_id: 'sec_001', import: { path: 'incoming/sec_001.wav', recordist: 'owner', voice_ref: ref('host_voice') } },
    { section_id: 'sec_002', import: { path: 'incoming/sec_002.wav', recordist: 'owner', voice_ref: ref('host_voice') } },
    { section_id: 'sec_003', import: { path: 'incoming/sec_003.wav', recordist: 'owner', voice_ref: ref('host_voice') } },
    { section_id: 'sec_004', import: { path: 'incoming/sec_004.wav', recordist: 'owner', voice_ref: ref('host_voice') } },
  ] }));
  await ok(call(project, 'align', { ...(await envelope(project, 'align')), audio_version: 1, engine: { name: 'fixture-aligner', version: '1.0' },
    sections: [
      { section_id: 'sec_001', words: [{ text: '先看主持人开场', start_sample: 0, end_sample: 44000, confidence: 0.95 }] },
      { section_id: 'sec_002', words: [{ text: '再看移动卡片和字幕区域', start_sample: 0, end_sample: 44000, confidence: 0.95 }] },
      { section_id: 'sec_003', words: [{ text: '这里演示未声明静止与静音', start_sample: 0, end_sample: 22000, confidence: 0.95 }] },
      { section_id: 'sec_004', words: [{ text: '请通读三层缓存命中率对比', start_sample: 0, end_sample: 130000, confidence: 0.95 }] },
    ], marks: [], subtitle_style_ref: ref('subtitle_style') }));
  await ok(call(project, 'storyboard', { ...(await envelope(project, 'board')), alignment_version: 1,
    chapters: [{ chapter_id: 'ch_001', title: '全片', section_ids: ['sec_001', 'sec_002', 'sec_003', 'sec_004'], continuity_in: '起点', continuity_out: '终点' }],
    shots: [
      { shot_id: 'shot_001', chapter_id: 'ch_001', section_id: 'sec_001', start: { section_id: 'sec_001' }, purpose: '开场', camera: 'medium',
        scene_ref: ref('studio_host'), scene_layers: [ref('studio_backdrop')], character_actions: [host('explaining', 'wave')], audio_anchors: [], visual_cues: [], depends_on: [] },
      { shot_id: 'shot_002', chapter_id: 'ch_001', section_id: 'sec_002', start: { section_id: 'sec_002' }, purpose: '移动卡片', camera: 'wide',
        scene_ref: ref('scene_moving'), scene_layers: [ref('studio_backdrop'), ref('diagram_moving')], character_actions: [], audio_anchors: [], visual_cues: [], depends_on: [] },
      { shot_id: 'shot_003', chapter_id: 'ch_001', section_id: 'sec_003', start: { section_id: 'sec_003' }, purpose: '未声明静止', camera: 'wide',
        scene_ref: ref('scene_static'), scene_layers: [ref('studio_backdrop'), ref('diagram_static')], character_actions: [], audio_anchors: [], visual_cues: [], depends_on: [] },
      { shot_id: 'shot_004', chapter_id: 'ch_001', section_id: 'sec_004', start: { section_id: 'sec_004' }, purpose: '静态读图停留', camera: 'wide',
        scene_ref: ref('scene_static'), scene_layers: [ref('studio_backdrop'), ref('diagram_static')], character_actions: [], audio_anchors: [], visual_cues: [], depends_on: [],
        holds: [{ local_range: { start: 0, end: 90 }, reason: '让观众通读三层缓存命中率对比图' }] },
    ] }));
  const compiled = await ok(call(project, 'compile', { ...(await envelope(project, 'compile')) }));
  const plan = await ok(call(project, 'plan', { project_id: ID, timeline_version: 1, shots: [
    { shot_id: 'shot_001', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral',
      actions: [{ local_range: { start: 0, end: 30 }, action: host('explaining', 'wave'), cue_id: null }] },
  ] }));
  const rendered = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: plan.asset.asset_ref, seed: 7 }));
  return { project, owner, timeline: compiled.document.timeline, planRef: plan.asset.asset_ref, master: rendered.master };
}

// Build a clean 22-second quality-mode studio (for 20–30 s audible sample, G3 gate and A11 A/B comparison).
async function cleanSampleStudio(mode = 'quality') {
  const project = makeProject();
  await ok(call(project, 'init', { project_id: ID, title: 'T10有声样片与评审', mode }));
  const owner = { SVS_SESSION_TOKEN: createSession(project, { reviewer_id: 'owner', kind: 'human' }) };
  await ok(call(project, 'brief', { ...(await envelope(project, 'brief')), topic: '缓存原理', audience: '开发者', scope: ['命中'],
    keywords: ['缓存'], language: 'zh-CN', style_profile: 'anime-clean', overrides: { duration_target_seconds: 60 } }));
  await ok(call(project, 'event', { ...(await envelope(project, 'res')), event: 'research_started', payload: {} }));
  const ev = await ok(call(project, 'evidence', { ...(await envelope(project, 'ev')), sources: [], claims: [], links: [] }));
  if (mode === 'quality') {
    await ok(call(project, 'decide', { ...(await envelope(project, 'g1')), gate: 'G1', target_hash: ev.content_hash, decision: 'approve', notes: 'ok' }, owner));
    await ok(call(project, 'event', { ...(await envelope(project, 'to-sc')), event: 'research_accepted', payload: {} }));
  } else {
    await ok(call(project, 'event', { ...(await envelope(project, 'to-sc')), event: 'draft_script_requested', payload: {} }));
  }
  // 22 seconds total across 3 shots: 8s host + 7s diagram (with cues + declared reading hold) + 7s host.
  const sections = [
    { section_id: 'sec_001', title: '开场提问', narration: '为什么缓存能让网页加载快十倍。', claim_ids: [], pronunciation: [], visual_intent: '主持人', duration_estimate_frames: 240, cues: [] },
    { section_id: 'sec_002', title: '请求路径', narration: '浏览器先查本地副本再决定是否回源。', claim_ids: [], pronunciation: [], visual_intent: '流程图', duration_estimate_frames: 210, cues: [] },
    { section_id: 'sec_003', title: '结论总结', narration: '合理设置过期策略即可兼顾新鲜与速度。', claim_ids: [], pronunciation: [], visual_intent: '主持人总结', duration_estimate_frames: 210, cues: [] },
  ];
  const sc = await ok(call(project, 'script', { ...(await envelope(project, 'sc')), script_id: 'sample-ep', sections }));
  if (mode === 'quality') {
    await ok(call(project, 'decide', { ...(await envelope(project, 'g2')), gate: 'G2', target_hash: sc.content_hash, decision: 'approve', notes: 'ok' }, owner));
    await ok(call(project, 'event', { ...(await envelope(project, 'to-au')), event: 'script_accepted', payload: {} }));
  } else {
    await ok(call(project, 'event', { ...(await envelope(project, 'to-au')), event: 'draft_audio_requested', payload: {} }));
  }
  const file = (name, bytes) => { mkdirSync(join(project, 'incoming'), { recursive: true }); writeFileSync(join(project, 'incoming', name), bytes); return `incoming/${name}`; };
  const reg = (name, kind, path, extra = {}) => ok(call(project, 'register', { project_id: ID, name, kind, path, rights: RIGHTS, ...extra }));
  await reg('studio_backdrop', 'background', file('backdrop.png', pngBytes(2880, 1620, [24, 38, 72, 255])));
  await reg('host_rig', 'rig', file('rig.json', JSON.stringify(RIG)));
  await reg('host_voice', 'voice', file('voice.wav', wavBytes({ seconds: 1 })));
  await reg('host_main', 'character', file('host.png', pngBytes(1200, 1600, [200, 120, 90, 255])), { profile: PROFILE });
  await reg('diagram_static', 'diagram', file('diagram-static.json', JSON.stringify(STATIC_DIAGRAM)));
  await reg('subtitle_style', 'other', file('subtitle-style.json', JSON.stringify({ color: '#FFFFFF', outline: '#101820' })));
  for (const name of ['studio_backdrop', 'host_rig', 'host_voice', 'host_main', 'diagram_static', 'subtitle_style']) {
    await ok(call(project, 'clear', { project_id: ID, asset_ref: ref(name), usage: 'cleared', notes: '测试授权' }, owner));
  }
  await ok(call(project, 'scene', { project_id: ID, name: 'studio_host', template: 'host', focus: '主持人', layers: [{ asset_ref: ref('studio_backdrop') }] }));
  await ok(call(project, 'scene', { project_id: ID, name: 'scene_static', template: 'diagram', focus: '请求流程图',
    layers: [{ asset_ref: ref('studio_backdrop') }, { asset_ref: ref('diagram_static'), element_ids: ['browser', 'server'], claim_ids: [] }] }));
  writeWav(join(project, 'incoming', 'sec_001.wav'), { seconds: 8 });
  writeWav(join(project, 'incoming', 'sec_002.wav'), { seconds: 7 });
  writeWav(join(project, 'incoming', 'sec_003.wav'), { seconds: 7 });
  await ok(call(project, 'audio', { ...(await envelope(project, 'audio')), sections: [
    { section_id: 'sec_001', import: { path: 'incoming/sec_001.wav', recordist: 'owner', voice_ref: ref('host_voice') } },
    { section_id: 'sec_002', import: { path: 'incoming/sec_002.wav', recordist: 'owner', voice_ref: ref('host_voice') } },
    { section_id: 'sec_003', import: { path: 'incoming/sec_003.wav', recordist: 'owner', voice_ref: ref('host_voice') } },
  ] }));
  await ok(call(project, 'align', { ...(await envelope(project, 'align')), audio_version: 1, engine: { name: 'fixture-aligner', version: '1.0' },
    sections: [
      { section_id: 'sec_001', words: [{ text: '为什么缓存能让网页加载快十倍', start_sample: 0, end_sample: 380000, confidence: 0.95 }] },
      { section_id: 'sec_002', words: [{ text: '浏览器先查本地副本再决定是否回源', start_sample: 0, end_sample: 330000, confidence: 0.95 }] },
      { section_id: 'sec_003', words: [{ text: '合理设置过期策略即可兼顾新鲜与速度', start_sample: 0, end_sample: 330000, confidence: 0.95 }] },
    ], marks: [], subtitle_style_ref: ref('subtitle_style') }));
  await ok(call(project, 'storyboard', { ...(await envelope(project, 'board')), alignment_version: 1,
    chapters: [{ chapter_id: 'ch_001', title: '缓存机制', section_ids: ['sec_001', 'sec_002', 'sec_003'], continuity_in: '空场', continuity_out: '总结' }],
    shots: [
      { shot_id: 'shot_001', chapter_id: 'ch_001', section_id: 'sec_001', start: { section_id: 'sec_001' }, purpose: '开场', camera: 'medium',
        scene_ref: ref('studio_host'), scene_layers: [ref('studio_backdrop')], character_actions: [host('explaining', 'wave')], audio_anchors: [], visual_cues: [], depends_on: [] },
      { shot_id: 'shot_002', chapter_id: 'ch_001', section_id: 'sec_002', start: { section_id: 'sec_002' }, purpose: '请求图解', camera: 'wide',
        scene_ref: ref('scene_static'), scene_layers: [ref('studio_backdrop'), ref('diagram_static')], character_actions: [], audio_anchors: [],
        visual_cues: [
          { target_ref: ref('diagram_static'), element_id: 'browser', operation: 'highlight', at: { local_frame: 30 } },
          { target_ref: ref('diagram_static'), element_id: 'server', operation: 'highlight', at: { local_frame: 120 } },
        ], depends_on: [],
        holds: [{ local_range: { start: 0, end: 210 }, reason: '图解阅读停留：对比本地缓存与回源路径' }] },
      { shot_id: 'shot_003', chapter_id: 'ch_001', section_id: 'sec_003', start: { section_id: 'sec_003' }, purpose: '总结', camera: 'medium',
        scene_ref: ref('studio_host'), scene_layers: [ref('studio_backdrop')], character_actions: [host('focused', 'point_right')], audio_anchors: [], visual_cues: [], depends_on: [] },
    ] }));
  const compiled = await ok(call(project, 'compile', { ...(await envelope(project, 'compile')) }));
  const plan = await ok(call(project, 'plan', { project_id: ID, timeline_version: 1, shots: [
    { shot_id: 'shot_001', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral',
      actions: [{ local_range: { start: 0, end: 240 }, action: host('explaining', 'wave'), cue_id: null }] },
    { shot_id: 'shot_003', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral',
      actions: [{ local_range: { start: 0, end: 210 }, action: host('focused', 'point_right'), cue_id: null }] },
  ] }));
  return { project, owner, timeline: compiled.document.timeline, planRef: plan.asset.asset_ref };
}

test('A10 injected defects: single-frame white flash, mid-motion caption collision, unintended black, long freeze, silence, missing audio and preserved reading hold', async () => {
  const { project, owner, master } = await defectStudio();
  // Inject a 1-frame white flash at frame 15 and unintended black at frames [100, 105) on a real encoded MP4.
  const defectMp4 = join(project, 'incoming', 'fault-injected.mp4');
  runFfmpeg([
    '-i', join(project, master.path),
    '-vf', "drawbox=enable='eq(n,15)':x=0:y=0:w=iw:h=ih:color=white:t=fill,drawbox=enable='between(n,100,104)':x=0:y=0:w=iw:h=ih:color=black:t=fill",
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-threads', '1', '-bf', '0', '-g', '30', '-video_track_timescale', '15360',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart', defectMp4,
  ]);
  const defectHash = sha256(readFileSync(defectMp4));
  const regDefect = await ok(call(project, 'register', { project_id: ID, name: 'fault_media', kind: 'video', path: 'incoming/fault-injected.mp4', rights: RIGHTS }));
  await ok(call(project, 'clear', { project_id: ID, asset_ref: regDefect.asset.asset_ref, usage: 'cleared', notes: '故障注入测试片' }, owner));
  await ok(call(project, 'target', { project_id: ID, target_id: 'web-standard', version: '1.0', lufs_min: -24, lufs_max: -8, max_true_peak_dbtp: -1.0 }));

  const res = await call(project, 'qa', { project_id: ID, scope: 'sample', media_ref: regDefect.asset.asset_ref, freeze_threshold_frames: 45, silence_threshold_frames: 30 });
  assert.equal(res.code, 1, 'blocking defects must return non-zero exit code');
  const out = res.json;
  assert.equal(out.qa_report.target_hash, defectHash, 'QAReport must bind exact inspected media SHA-256');
  assert.equal(out.qa_report.result, 'fail');

  const blocking = out.qa_report.issues.filter((i) => i.severity === 'blocking');
  // 1. Mid-motion caption collision on shot_002 with bounding boxes
  const collision = out.bounding_boxes.find((b) => b.shot_id === 'shot_002' && b.element_id === 'card_a');
  assert.ok(collision, 'mid-motion caption collision must be caught');
  assert.ok(collision.frame_range.start >= 30 && collision.frame_range.end <= 60);
  assert.ok(collision.iou > 0);
  assert.ok(blocking.some((i) => i.target_id === 'shot_002' && i.category === 'visual' && i.frame_range.start >= 30 && i.frame_range.end <= 60));

  // 2. Single-frame white flash at exact frame 15 (shot_001)
  const flash = out.levels.media_qa.visual_anomalies.flashes.find((f) => f.frame_range.start === 15 && f.frame_range.end === 16);
  assert.ok(flash, 'single-frame white flash at frame 15 must be caught');
  assert.equal(flash.shot_id, 'shot_001');
  assert.ok(blocking.some((i) => i.target_id === 'shot_001' && i.frame_range?.start === 15 && i.frame_range?.end === 16 && i.evidence_refs.length > 0));

  // 3. Unintended black frames at [100, 105) (shot_003)
  const black = out.levels.media_qa.visual_anomalies.blacks.find((b) => b.frame_range.start === 100 && b.frame_range.end === 105);
  assert.ok(black, 'unintended black frames [100, 105) must be caught');
  assert.equal(black.shot_id, 'shot_003');

  // 4. Undeclared long freeze on shot_003 vs preserved declared reading hold on shot_004
  assert.ok(out.levels.media_qa.visual_anomalies.freezes.some((f) => f.shot_id === 'shot_003'), 'undeclared freeze on shot_003 must be caught');
  assert.ok(!out.levels.media_qa.visual_anomalies.freezes.some((f) => f.shot_id === 'shot_004'), 'declared hold on shot_004 must NOT be flagged as freeze defect');
  const preserved = out.declared_holds.find((h) => h.shot_id === 'shot_004');
  assert.ok(preserved, 'declared hold must be preserved');
  assert.equal(preserved.reason, '让观众通读三层缓存命中率对比图');
  assert.ok(out.qa_report.issues.some((i) => i.severity === 'info' && i.target_id === 'shot_004' && i.message.includes('让观众通读三层缓存命中率对比图')));

  // 5. Unintended silence inside shot_003 + loudness/true-peak + waveform + 12-cell contact sheet
  assert.ok(out.waveform.silence_ranges.some((s) => s.shot_id === 'shot_003'), 'unintended silence in shot_003 must be detected');
  assert.equal(typeof out.audio_metrics.final_mix.integrated_lufs, 'number');
  assert.equal(typeof out.audio_metrics.final_mix.max_true_peak_dbtp, 'number');
  assert.equal(out.contact_sheet.grid, '3x4');
  assert.equal(out.contact_sheet.cells.length, 12);
  assert.ok(existsSync(join(project, out.contact_sheet.path)));
  assert.ok(existsSync(join(project, out.waveform.png_path)));

  // 5b. Request-level overrides cannot weaken policy: holds come only from the storyboard DSL and thresholds are capped.
  const held = await call(project, 'qa', { project_id: ID, scope: 'sample', media_ref: regDefect.asset.asset_ref,
    freeze_threshold_frames: 45, silence_threshold_frames: 30,
    declared_holds: [{ shot_id: 'shot_003', local_range: { start: 0, end: 10000 }, kind: 'static', reason: '试图掩盖静止' }] });
  assert.equal(held.code, 1, 'a request-level hold must not unblock QA');
  assert.ok(held.json.levels.media_qa.visual_anomalies.freezes.some((f) => f.shot_id === 'shot_003'), 'request-level hold must not hide the freeze');
  assert.ok(held.json.waveform.silence_ranges.some((s) => s.shot_id === 'shot_003'), 'request-level hold must not hide the silence');
  assert.ok(!held.json.declared_holds.some((h) => h.shot_id === 'shot_003'), 'request-level holds must be ignored');
  const policy = await call(project, 'qa', { project_id: ID, scope: 'sample', media_ref: regDefect.asset.asset_ref });
  const loose = await call(project, 'qa', { project_id: ID, scope: 'sample', media_ref: regDefect.asset.asset_ref,
    freeze_threshold_frames: 100000, silence_threshold_frames: 100000 });
  assert.equal(loose.code, 1, 'loosened thresholds must still block');
  assert.deepEqual(loose.json.levels.media_qa.visual_anomalies.freezes, policy.json.levels.media_qa.visual_anomalies.freezes, 'freeze threshold capped at policy default');
  assert.ok(loose.json.waveform.silence_ranges.some((s) => s.shot_id === 'shot_003'), 'silence threshold capped at policy default');
  for (const bad of ['abc', 0, -5, 1.5]) {
    const invalid = await call(project, 'qa', { project_id: ID, scope: 'sample', media_ref: regDefect.asset.asset_ref, freeze_threshold_frames: bad });
    assert.equal(invalid.json.issues[0]?.code, 'QA_THRESHOLD_INVALID', `freeze threshold ${JSON.stringify(bad)} must be rejected`);
  }
  const invalidSilence = await call(project, 'qa', { project_id: ID, scope: 'sample', media_ref: regDefect.asset.asset_ref, silence_threshold_frames: 'abc' });
  assert.equal(invalidSilence.json.issues[0]?.code, 'QA_THRESHOLD_INVALID');

  // 6. Missing audio track MP4 must fail with AUDIO_TRACK hard defect
  const noAudioMp4 = join(project, 'incoming', 'no-audio.mp4');
  runFfmpeg(['-i', join(project, master.path), '-c:v', 'copy', '-an', noAudioMp4]);
  const noAudioHash = sha256(readFileSync(noAudioMp4));
  const regNoAudio = await ok(call(project, 'register', { project_id: ID, name: 'no_audio_media', kind: 'video', path: 'incoming/no-audio.mp4', rights: RIGHTS }));
  const noAudioQa = await call(project, 'qa', { project_id: ID, scope: 'sample', media_ref: regNoAudio.asset.asset_ref });
  assert.equal(noAudioQa.code, 1);
  assert.equal(noAudioQa.json.qa_report.target_hash, noAudioHash);
  assert.ok(noAudioQa.json.levels.media_qa.technical.issues.includes('AUDIO_TRACK'));
  assert.ok(noAudioQa.json.qa_report.issues.some((i) => i.severity === 'blocking' && i.category === 'audio'));
});

test('Three-level QA renders a 22 s audible sample, checks delivery targets, wires sample_qa_pass and exposes Studio shot+waveform links', async () => {
  const { project, owner, planRef } = await cleanSampleStudio('quality');
  await ok(call(project, 'event', { ...(await envelope(project, 'req-s')), event: 'sample_render_requested', payload: {} }));

  // 1. Render 22 s audible sample and run QA WITHOUT a registered delivery target -> flags DELIVERY_TARGET_MISSING (needs_review).
  const firstQa = await call(project, 'qa', { project_id: ID, scope: 'sample', render_sample: true, plan_ref: planRef, seed: 7 });
  assert.equal(firstQa.code, 0, firstQa.stdout + firstQa.stderr);
  assert.ok(firstQa.json.sample.duration_seconds >= 20 && firstQa.json.sample.duration_seconds <= 30, 'sample must be 20–30 s');
  assert.equal(firstQa.json.sample.frame_count, 660);
  assert.equal(firstQa.json.qa_report.result, 'needs_review');
  assert.ok(firstQa.json.issues.some((i) => i.code === 'DELIVERY_TARGET_MISSING'));
  assert.equal(firstQa.json.contact_sheet.cells.length, 12);
  assert.ok(firstQa.json.audio_metrics.final_mix.integrated_lufs > -40);
  assert.ok(firstQa.json.audio_metrics.isolated_voice.integrated_lufs > -40);

  // 2. Register delivery target version -> re-running QA passes cleanly with zero blocking/review issues.
  await ok(call(project, 'target', { project_id: ID, target_id: 'bilibili-1080p', version: '2026.1', lufs_min: -22, lufs_max: -6, max_true_peak_dbtp: -1.0 }));
  const cleanQa = await ok(call(project, 'qa', { project_id: ID, scope: 'sample', media_ref: firstQa.json.sample.artifact_ref }));
  assert.equal(cleanQa.qa_report.result, 'pass');
  assert.equal(cleanQa.qa_report.target_hash, firstQa.json.sample.sha256);

  // 3. Studio navigation links let the UI jump to exact shot + local frame + waveform sample range from the same QA result.
  const { resolveStudioTarget } = await import('../../runtime/qa.ts');
  const cellNav = resolveStudioTarget(cleanQa, { cell: 5 });
  assert.ok(cellNav.shot_id);
  assert.equal(cellNav.waveform_ref, cleanQa.waveform.json_ref);
  assert.equal(cellNav.contact_sheet_ref, cleanQa.contact_sheet.asset_ref);
  assert.equal(cellNav.sample_range.start, cellNav.absolute_frame_range.start * 1600);
  assert.equal(cellNav.sample_range.end, cellNav.absolute_frame_range.end * 1600);

  // 4. Advance workflow using recorded QA fact (without payload.checks): QA_RUNNING -> SAMPLE_REVIEW.
  await ok(call(project, 'event', { ...(await envelope(project, 's-rend')), event: 'sample_rendered',
    payload: { artifact_hash: firstQa.json.sample.sha256, timeline_snapshot_hash: firstQa.json.sample.input_snapshot_hash } }));
  const checked = await ok(call(project, 'event', { ...(await envelope(project, 's-chk')), event: 'sample_checked', payload: {} }));
  assert.equal(checked.state, 'SAMPLE_REVIEW');

  // 5. Inspect adapter standalone contract check (InspectMediaInput + ToolResult + C01 rules).
  const insp = await ok(call(project, 'inspect', { project_id: ID, media_ref: firstQa.json.sample.artifact_ref }));
  assert.equal(insp.media_hash, firstQa.json.sample.sha256);
  assert.equal(insp.inspect_media_input.media_ref, firstQa.json.sample.artifact_ref);
  assert.equal(insp.tool_result.status, 'succeeded');
});

test('A11 blinded A/B comparison enforces human-only review and blocks G3 until open required fixes are closed', async () => {
  const { project, owner, planRef } = await cleanSampleStudio('quality');
  await ok(call(project, 'target', { project_id: ID, target_id: 'bilibili-1080p', version: '2026.1', lufs_min: -22, lufs_max: -6, max_true_peak_dbtp: -1.0 }));
  await ok(call(project, 'event', { ...(await envelope(project, 'req-s')), event: 'sample_render_requested', payload: {} }));

  // Produce upgrade sample (white captions) and a controlled baseline sample (recolored/simplified fixture) with identical script & voice.
  const upgradeQa = await ok(call(project, 'qa', { project_id: ID, scope: 'sample', render_sample: true, plan_ref: planRef, seed: 7 }));
  const baselineMp4 = join(project, 'incoming', 'controlled-baseline.mp4');
  // Controlled baseline: same duration, audio, script, spec (slightly desaturated to distinguish pixels deterministically).
  runFfmpeg([
    '-i', join(project, upgradeQa.sample.path),
    '-vf', 'eq=saturation=0.4:brightness=-0.03',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-threads', '1', '-bf', '0', '-g', '30', '-video_track_timescale', '15360',
    '-c:a', 'copy', '-movflags', '+faststart', baselineMp4,
  ]);
  const regBase = await ok(call(project, 'register', { project_id: ID, name: 'baseline_sample', kind: 'video', path: 'incoming/controlled-baseline.mp4', rights: RIGHTS }));

  // Move project into SAMPLE_REVIEW using the recorded passing QA fact.
  await ok(call(project, 'event', { ...(await envelope(project, 's-rend')), event: 'sample_rendered',
    payload: { artifact_hash: upgradeQa.sample.sha256, timeline_snapshot_hash: upgradeQa.sample.input_snapshot_hash } }));
  await ok(call(project, 'event', { ...(await envelope(project, 's-chk')), event: 'sample_checked', payload: {} }));

  // A comparison cannot be bound to a hash other than the upgrade clip it compares.
  const wrongTarget = await call(project, 'compare', {
    project_id: ID, action: 'prepare', target_hash: 'sha256:' + '0'.repeat(64),
    baseline_ref: regBase.asset.asset_ref, upgrade_ref: upgradeQa.sample.artifact_ref,
    baseline_kind: 'controlled_baseline', seed: 42,
  });
  assert.equal(wrongTarget.code, 1);
  assert.equal(wrongTarget.json.issues[0].code, 'COMPARE_TARGET_MISMATCH');

  // Prepare blinded A/B packet.
  const prep = await ok(call(project, 'compare', {
    project_id: ID, action: 'prepare', target_hash: upgradeQa.sample.sha256,
    baseline_ref: regBase.asset.asset_ref, upgrade_ref: upgradeQa.sample.artifact_ref,
    baseline_kind: 'controlled_baseline', seed: 42,
  }));
  assert.equal(prep.comparison.baseline_kind, 'controlled_baseline');
  assert.equal(prep.comparison.historical_comparison_status, 'NOT_RUN');
  assert.ok(prep.comparison.blinded_packet.clip_a.asset_ref && prep.comparison.blinded_packet.clip_b.asset_ref);
  assert.equal(prep.comparison.blinded_packet.clip_a.role, undefined, 'blinded packet must not expose baseline/upgrade roles');

  const reviewPayload = {
    project_id: ID, action: 'review', comparison_id: prep.comparison.comparison_id,
    audio_listening: { phone_speaker: '人声清晰无遮挡', headphones: '切点无刺耳接缝', masked_words: [], mispronunciations: [], harsh_joins: [] },
    shots: [
      {
        shot_id: 'shot_001', timecode_a: '00:00.00-00:08.00', timecode_b: '00:00.00-00:08.00',
        items: {
          identity_continuity: { verdict: 'improved', reason: '服装与配色对比清晰' },
          av_sync: { verdict: 'unchanged', reason: '合成音测试节奏一致' },
          diagram_accuracy: { verdict: 'unchanged', reason: '主持人镜头无图解' },
          mobile_legibility: { verdict: 'regressed', reason: '字幕对比度偏低需调整', action: 'required_fix' },
          cut_pacing: { verdict: 'improved', reason: '节奏清晰' },
        },
      },
    ],
  };

  // Agent session cannot submit human A11 review.
  const agent = { SVS_SESSION_TOKEN: createSession(project, { reviewer_id: 'agent-1', kind: 'agent' }) };
  const agentRev = await call(project, 'compare', reviewPayload, agent);
  assert.equal(agentRev.code, 1);
  assert.equal(agentRev.json.issues[0].code, 'HUMAN_REQUIRED');

  // Human session records review with 1 open required_fix -> G3 approval must be BLOCKED!
  const rev = await ok(call(project, 'compare', reviewPayload, owner));
  assert.equal(rev.comparison.open_required_fixes, 1);
  const blockedG3 = await call(project, 'decide', { ...(await envelope(project, 'g3-blocked')), gate: 'G3', target_hash: upgradeQa.sample.sha256, decision: 'approve', notes: '尝试带未关闭必改项签发' }, owner);
  assert.equal(blockedG3.code, 1);
  assert.equal(blockedG3.json.issues[0].code, 'REQUIRED_FIXES_OPEN');

  // Close the required_fix as human -> G3 approval succeeds!
  const closed = await ok(call(project, 'compare', {
    project_id: ID, action: 'close_fix', comparison_id: prep.comparison.comparison_id,
    shot_id: 'shot_001', item: 'mobile_legibility', resolution_notes: '已复核并确认关闭必改项',
  }, owner));
  assert.equal(closed.comparison.open_required_fixes, 0);

  const g3Ok = await ok(call(project, 'decide', { ...(await envelope(project, 'g3-ok')), gate: 'G3', target_hash: upgradeQa.sample.sha256, decision: 'approve', notes: '必改项清零后放行' }, owner));
  assert.equal(g3Ok.approval.gate, 'G3');
});

test('Blocking QA report prevents sample_checked even if payload.checks tries to spoof sample_qa_pass', async () => {
  const { project, owner } = await cleanSampleStudio('quality');
  await ok(call(project, 'event', { ...(await envelope(project, 'req-s')), event: 'sample_render_requested', payload: {} }));

  // Create a broken (no-audio) MP4, run QA -> fails with blocking issue.
  const badMp4 = join(project, 'incoming', 'bad-sample.mp4');
  runFfmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-frames:v', '30', badMp4]);
  const badHash = sha256(readFileSync(badMp4));
  const regBad = await ok(call(project, 'register', { project_id: ID, name: 'bad_sample', kind: 'video', path: 'incoming/bad-sample.mp4', rights: RIGHTS }));
  const badQa = await call(project, 'qa', { project_id: ID, scope: 'sample', media_ref: regBad.asset.asset_ref });
  assert.equal(badQa.code, 1);
  assert.equal(badQa.json.qa_report.result, 'fail');

  await ok(call(project, 'event', { ...(await envelope(project, 's-rend')), event: 'sample_rendered', payload: { artifact_hash: badHash } }));
  const spoof = await call(project, 'event', { ...(await envelope(project, 's-spoof')), event: 'sample_checked', payload: { checks: { sample_qa_pass: true } } });
  assert.equal(spoof.code, 1);
  assert.equal(spoof.json.issues[0].code, 'QA_BLOCKING_ISSUES');
});

test('REFACTOR checks: persisted Studio bundle navigation, inspect path traversal & C01 negative parity, and loudness target violation', async () => {
  const { project, owner, master } = await defectStudio();
  // Register an intentionally strict loudness target so the 220 Hz fixture triggers LOUDNESS_OUT_OF_RANGE.
  await ok(call(project, 'target', { project_id: ID, target_id: 'strict-broadcast', version: '1.0', lufs_min: -32, lufs_max: -28, max_true_peak_dbtp: -1.0 }));
  const qaRes = await call(project, 'qa', { project_id: ID, scope: 'sample', media_ref: master.artifact_ref, freeze_threshold_frames: 45, silence_threshold_frames: 30 });
  assert.equal(qaRes.code, 1);
  assert.ok(qaRes.json.issues.some((i) => i.code === 'LOUDNESS_OUT_OF_RANGE'), 'out-of-range loudness must be flagged');

  // Reload persisted QA bundle from SQLite and navigate by issue_id, cell and frame from the same result.
  const { openStore } = await import('../../runtime/project-store.ts');
  const { getLatestQaBundle, resolveStudioTarget } = await import('../../runtime/qa.ts');
  const db = openStore(project);
  const saved = getLatestQaBundle(db, ID, master.sha256);
  db.close();
  assert.ok(saved, 'QA bundle must persist in SQLite');
  const firstCollision = saved.qa_report.issues.find((i) => i.target_id === 'shot_002' && i.severity === 'blocking');
  const byIssue = resolveStudioTarget(saved, { issue_id: firstCollision.issue_id });
  assert.equal(byIssue.shot_id, 'shot_002');
  assert.equal(byIssue.waveform_ref, saved.waveform.json_ref);
  assert.equal(byIssue.sample_range.start, byIssue.absolute_frame_range.start * 1600);
  const byFrame = resolveStudioTarget(saved, { frame: 160 });
  assert.equal(byFrame.shot_id, 'shot_004');
  assert.equal(byFrame.local_frame_range.start, 10);

  // Security: inspect rejects path traversal outside project root.
  const escaped = await call(project, 'inspect', { project_id: ID, path: '../../etc/passwd' });
  assert.equal(escaped.code, 1);
  assert.equal(escaped.json.issues[0].code, 'ASSET_PATH_INVALID');

  // C01 technical parity: proxy resolution + 44.1 kHz audio fails FRAME_SIZE and SAMPLE_RATE.
  const proxyMp4 = join(project, 'incoming', 'proxy-44k.mp4');
  runFfmpeg([
    '-f', 'lavfi', '-i', 'color=c=navy:s=1280x720:r=30:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=1',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-shortest', proxyMp4,
  ]);
  const inspProxy = await call(project, 'inspect', { project_id: ID, path: 'incoming/proxy-44k.mp4' });
  assert.equal(inspProxy.code, 1);
  assert.ok(inspProxy.json.technical.issues.includes('FRAME_SIZE'));
  assert.ok(inspProxy.json.technical.issues.includes('SAMPLE_RATE'));
});
