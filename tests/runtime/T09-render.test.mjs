// T09 / A09 & A12: shot/chapter/master rendering, local vs absolute cache keys, targeted revisions (caption recolor,
// single expression, chapter 4 shortened by 10 s → boundary frame 7,800 & 470 s master), and crash/corruption recovery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeProject, pngBytes, runCliAsync, wavBytes, writeJson, writeWav } from './helpers.mjs';
import { createSession } from '../../runtime/approvals.ts';

const ID = 'render-demo';
const ref = (name, v = 1) => `asset://${ID}/${name}/v${v}`;
const RIGHTS = { holder: 'project owner', license: 'owner-original', source: 'test fixture generated in code', original: true };

// Simulated 2D rig with two distinct expressions (`explaining` vs `focused`) that change the baked state and pixels.
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
const DIAGRAM = {
  elements: [
    { element_id: 'browser', box: { left: 0.15, top: 0.3, right: 0.35, bottom: 0.55 } },
    { element_id: 'server', box: { left: 0.65, top: 0.3, right: 0.85, bottom: 0.55 } },
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
const issues = (result, ...keys) => result.json.issues.map((item) => keys.map((key) => item[key]));

function probeMedia(file) {
  const out = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries',
    'format=format_name,duration:stream=codec_type,codec_name,width,height,pix_fmt,sample_rate,nb_read_frames',
    '-of', 'json', file], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  return JSON.parse(out.stdout);
}

const host = (expression = 'explaining', gesture = 'point_right', angle = 'front') =>
  ({ character_ref: ref('host_main'), angle, expression, gesture, gaze: 'camera' });

// Short 3-shot studio (shot_001 host, shot_002 host inheriting shot_001, shot_003 independent host).
async function shortStudio(mode = 'quality') {
  const project = makeProject();
  await ok(call(project, 'init', { project_id: ID, title: 'T09短片渲染', mode }));
  const owner = { SVS_SESSION_TOKEN: createSession(project, { reviewer_id: 'owner', kind: 'human' }) };
  await ok(call(project, 'brief', { ...(await envelope(project, 'brief')), topic: '缓存原理', audience: '开发者', scope: ['命中'],
    keywords: ['缓存'], language: 'zh-CN', style_profile: 'anime-clean', overrides: { duration_target_seconds: 60 } }));
  await ok(call(project, 'event', { ...(await envelope(project, 'research')), event: 'research_started', payload: {} }));
  const ev = await ok(call(project, 'evidence', { ...(await envelope(project, 'evidence')), sources: [], claims: [], links: [] }));
  if (mode === 'quality') {
    await ok(call(project, 'decide', { ...(await envelope(project, 'g1')), gate: 'G1', target_hash: ev.content_hash, decision: 'approve', notes: 'ok' }, owner));
    await ok(call(project, 'event', { ...(await envelope(project, 'to-script')), event: 'research_accepted', payload: {} }));
  } else {
    await ok(call(project, 'event', { ...(await envelope(project, 'to-script')), event: 'draft_script_requested', payload: {} }));
  }
  const sections = [
    { section_id: 'sec_001', title: '开场', narration: '先看第一段。', claim_ids: [], pronunciation: [], visual_intent: '主持人', duration_estimate_frames: 30, cues: [] },
    { section_id: 'sec_002', title: '副本', narration: '浏览器有副本，再看副本是否新鲜。', claim_ids: [], pronunciation: [], visual_intent: '对比', duration_estimate_frames: 60,
      cues: [{ cue_id: 'cue_copy_1', text: '副本' }, { cue_id: 'cue_copy_2', text: '副本' }] },
  ];
  const sc = await ok(call(project, 'script', { ...(await envelope(project, 'script')), script_id: 'episode', sections }));
  if (mode === 'quality') {
    await ok(call(project, 'decide', { ...(await envelope(project, 'g2')), gate: 'G2', target_hash: sc.content_hash, decision: 'approve', notes: 'ok' }, owner));
    await ok(call(project, 'event', { ...(await envelope(project, 'to-audio')), event: 'script_accepted', payload: {} }));
  } else {
    await ok(call(project, 'event', { ...(await envelope(project, 'to-audio')), event: 'draft_audio_requested', payload: {} }));
  }
  const file = (name, bytes) => { mkdirSync(join(project, 'incoming'), { recursive: true }); writeFileSync(join(project, 'incoming', name), bytes); return `incoming/${name}`; };
  const reg = (name, kind, path, extra = {}) => ok(call(project, 'register', { project_id: ID, name, kind, path, rights: RIGHTS, ...extra }));
  await reg('studio_backdrop', 'background', file('backdrop.png', pngBytes(2880, 1620, [24, 38, 72, 255])));
  await reg('host_rig', 'rig', file('rig.json', JSON.stringify(RIG)));
  await reg('host_voice', 'voice', file('voice.wav', wavBytes({ seconds: 1 })));
  await reg('host_main', 'character', file('host.png', pngBytes(1200, 1600, [200, 120, 90, 255])), { profile: PROFILE });
  await reg('diagram_cache', 'diagram', file('diagram.json', JSON.stringify(DIAGRAM)));
  await reg('subtitle_style', 'other', file('subtitle-style.json', JSON.stringify({ color: '#FFFFFF', outline: '#101820' })));
  for (const name of ['studio_backdrop', 'host_rig', 'host_voice', 'host_main', 'diagram_cache', 'subtitle_style']) {
    await ok(call(project, 'clear', { project_id: ID, asset_ref: ref(name), usage: 'cleared', notes: '测试授权' }, owner));
  }
  await ok(call(project, 'scene', { project_id: ID, name: 'studio_host', template: 'host', focus: '主持人', layers: [{ asset_ref: ref('studio_backdrop') }] }));
  await ok(call(project, 'scene', { project_id: ID, name: 'diagram_scene', template: 'diagram', focus: '结构图',
    layers: [{ asset_ref: ref('studio_backdrop') }, { asset_ref: ref('diagram_cache'), element_ids: ['browser', 'server'], claim_ids: [] }] }));

  writeWav(join(project, 'incoming', 'sec_001.wav'), { seconds: 1 });
  writeWav(join(project, 'incoming', 'sec_002.wav'), { seconds: 2 });
  await ok(call(project, 'audio', { ...(await envelope(project, 'audio')), sections: [
    { section_id: 'sec_001', import: { path: 'incoming/sec_001.wav', recordist: 'owner', voice_ref: ref('host_voice') } },
    { section_id: 'sec_002', import: { path: 'incoming/sec_002.wav', recordist: 'owner', voice_ref: ref('host_voice') } }] }));
  await ok(call(project, 'align', { ...(await envelope(project, 'align')), audio_version: 1, engine: { name: 'owner-aligner', version: '1.0' },
    sections: [
      { section_id: 'sec_001', words: [{ text: '先', start_sample: 0, end_sample: 8000, confidence: 0.95 },
        { text: '看', start_sample: 8000, end_sample: 16000, confidence: 0.95 }, { text: '第一段', start_sample: 16000, end_sample: 40000, confidence: 0.95 }] },
      { section_id: 'sec_002', words: [{ text: '浏览器', start_sample: 0, end_sample: 16000, confidence: 0.95 },
        { text: '有', start_sample: 16000, end_sample: 24000, confidence: 0.95 }, { text: '副本', start_sample: 24000, end_sample: 40000, confidence: 0.95 },
        { text: '再', start_sample: 48000, end_sample: 56000, confidence: 0.95 }, { text: '看', start_sample: 56000, end_sample: 64000, confidence: 0.95 },
        { text: '副本', start_sample: 64000, end_sample: 76000, confidence: 0.95 }, { text: '是否', start_sample: 76000, end_sample: 84000, confidence: 0.95 },
        { text: '新鲜', start_sample: 84000, end_sample: 94000, confidence: 0.95 }] },
    ], marks: [{ word_id: 'sec_001-w002', viseme: 'closed' }], subtitle_style_ref: ref('subtitle_style') }));
  await ok(call(project, 'storyboard', { ...(await envelope(project, 'board')), alignment_version: 1,
    chapters: [
      { chapter_id: 'ch_001', title: '开场', section_ids: ['sec_001'], continuity_in: '空舞台', continuity_out: '主持人挥手' },
      { chapter_id: 'ch_002', title: '副本', section_ids: ['sec_002'], continuity_in: '主持人挥手', continuity_out: '对比完成' }],
    shots: [
      { shot_id: 'shot_001', chapter_id: 'ch_001', section_id: 'sec_001', start: { section_id: 'sec_001' }, purpose: '开场提问', camera: 'medium',
        scene_ref: ref('studio_host'), scene_layers: [ref('studio_backdrop')], character_actions: [host('explaining', 'wave')], audio_anchors: [], visual_cues: [], depends_on: [] },
      { shot_id: 'shot_002', chapter_id: 'ch_002', section_id: 'sec_002', start: { section_id: 'sec_002' }, purpose: '承接讲解', camera: 'medium',
        scene_ref: ref('studio_host'), scene_layers: [ref('studio_backdrop')], character_actions: [host('explaining', 'point_right')], audio_anchors: ['cue_copy_1'], visual_cues: [], depends_on: ['shot_001'] },
      { shot_id: 'shot_003', chapter_id: 'ch_002', section_id: 'sec_002', start: { word_id: 'sec_002-w004', edge: 'start' }, purpose: '独立总结', camera: 'wide',
        scene_ref: ref('studio_host'), scene_layers: [ref('studio_backdrop')], character_actions: [host('explaining', 'idle')], audio_anchors: ['cue_copy_2'], visual_cues: [], depends_on: [] },
    ] }));
  const compiled = await ok(call(project, 'compile', { ...(await envelope(project, 'compile')) }));
  const plan = await ok(call(project, 'plan', { project_id: ID, timeline_version: 1, shots: [
    { shot_id: 'shot_001', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral',
      actions: [{ local_range: { start: 0, end: 30 }, action: host('explaining', 'wave'), cue_id: null }] },
    { shot_id: 'shot_002', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral',
      actions: [{ local_range: { start: 0, end: 30 }, action: host('explaining', 'point_right'), cue_id: 'cue_copy_1' }] },
    { shot_id: 'shot_003', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral',
      actions: [{ local_range: { start: 0, end: 30 }, action: host('explaining', 'idle'), cue_id: 'cue_copy_2' }] },
  ] }));
  return { project, owner, timeline: compiled.document.timeline, planRef: plan.asset.asset_ref };
}

// Multi-chapter studio: accepts custom per-chapter durations (seconds) and puts 2 shots inside chapter 4.
async function chapterStudio({ chapterSeconds, mode = 'draft' }) {
  const project = makeProject();
  const totalSec = chapterSeconds.reduce((a, b) => a + b, 0);
  const profile = totalSec >= 450 ? 'standard8' : 'short';
  const targetSec = profile === 'standard8' ? Math.max(450, Math.min(510, totalSec)) : Math.max(60, Math.min(180, totalSec));
  await ok(call(project, 'init', { project_id: ID, title: 'T09多章节目', mode }));
  const owner = { SVS_SESSION_TOKEN: createSession(project, { reviewer_id: 'owner', kind: 'human' }) };
  await ok(call(project, 'brief', { ...(await envelope(project, 'brief')), topic: '订单流转', audience: '工程师', scope: ['全链路'],
    keywords: ['订单'], language: 'zh-CN', style_profile: 'anime-clean', overrides: { duration_profile: profile, duration_target_seconds: targetSec } }));
  await ok(call(project, 'event', { ...(await envelope(project, 'research')), event: 'research_started', payload: {} }));
  await ok(call(project, 'evidence', { ...(await envelope(project, 'evidence')), sources: [], claims: [], links: [] }));
  await ok(call(project, 'event', { ...(await envelope(project, 'to-script')), event: 'draft_script_requested', payload: {} }));

  const sections = chapterSeconds.map((sec, i) => ({
    section_id: `sec_00${i + 1}`, title: `第${i + 1}章`,
    narration: i === 3 ? '第四章前半段讲解作业，第四章后半段确认提交。' : `第${i + 1}章说明核心流程。`,
    claim_ids: [], pronunciation: [], visual_intent: '图解与主持人', duration_estimate_frames: sec * 30, cues: [],
  }));
  await ok(call(project, 'script', { ...(await envelope(project, 'script')), script_id: 'long-ep', sections }));
  await ok(call(project, 'event', { ...(await envelope(project, 'to-audio')), event: 'draft_audio_requested', payload: {} }));

  const file = (name, bytes) => { mkdirSync(join(project, 'incoming'), { recursive: true }); writeFileSync(join(project, 'incoming', name), bytes); return `incoming/${name}`; };
  const reg = (name, kind, path, extra = {}) => ok(call(project, 'register', { project_id: ID, name, kind, path, rights: RIGHTS, ...extra }));
  await reg('studio_backdrop', 'background', file('backdrop.png', pngBytes(2880, 1620, [24, 38, 72, 255])));
  await reg('host_rig', 'rig', file('rig.json', JSON.stringify(RIG)));
  await reg('host_voice', 'voice', file('voice.wav', wavBytes({ seconds: 1 })));
  await reg('host_main', 'character', file('host.png', pngBytes(1200, 1600, [200, 120, 90, 255])), { profile: PROFILE });
  await reg('diagram_flow', 'diagram', file('diagram.json', JSON.stringify(DIAGRAM)));
  await reg('subtitle_style', 'other', file('subtitle-style.json', JSON.stringify({ color: '#FFFFFF', outline: '#101820' })));
  for (const name of ['studio_backdrop', 'host_rig', 'host_voice', 'host_main', 'diagram_flow', 'subtitle_style']) {
    await ok(call(project, 'clear', { project_id: ID, asset_ref: ref(name), usage: 'cleared', notes: '测试授权' }, owner));
  }
  await ok(call(project, 'scene', { project_id: ID, name: 'studio_host', template: 'host', focus: '主持人', layers: [{ asset_ref: ref('studio_backdrop') }] }));
  await ok(call(project, 'scene', { project_id: ID, name: 'diagram_flow_scene', template: 'diagram', focus: '流程图',
    layers: [{ asset_ref: ref('studio_backdrop') }, { asset_ref: ref('diagram_flow'), element_ids: ['browser', 'server'], claim_ids: [] }] }));

  // Generate exact-length WAVs and alignments per section.
  for (let i = 0; i < chapterSeconds.length; i += 1) {
    writeWav(join(project, 'incoming', `sec_00${i + 1}.wav`), { seconds: chapterSeconds[i] });
  }
  await ok(call(project, 'audio', { ...(await envelope(project, 'audio')), sections: chapterSeconds.map((_, i) => ({
    section_id: `sec_00${i + 1}`, import: { path: `incoming/sec_00${i + 1}.wav`, recordist: 'owner', voice_ref: ref('host_voice') },
  })) }));

  const alignSections = chapterSeconds.map((sec, i) => {
    const samples = sec * 48000;
    if (i === 3) {
      // Split ch_004 into two shots: first half = 50% (or fixed 50s in 110s -> 50s + 60s; after -10s -> 50s + 50s).
      const split = Math.floor(samples / 2);
      return {
        section_id: 'sec_004',
        words: [
          { text: '第四章前半段讲解作业', start_sample: 0, end_sample: split - 1600, confidence: 0.95 },
          { text: '第四章后半段确认提交', start_sample: split, end_sample: samples - 1600, confidence: 0.95 },
        ],
      };
    }
    return {
      section_id: `sec_00${i + 1}`,
      words: [{ text: `第${i + 1}章说明核心流程`, start_sample: 0, end_sample: samples - 1600, confidence: 0.95 }],
    };
  });
  await ok(call(project, 'align', { ...(await envelope(project, 'align')), audio_version: 1, engine: { name: 'owner-aligner', version: '1.0' },
    sections: alignSections, marks: [], subtitle_style_ref: ref('subtitle_style') }));

  const chapters = chapterSeconds.map((_, i) => ({
    chapter_id: `ch_00${i + 1}`, title: `第${i + 1}章`, section_ids: [`sec_00${i + 1}`],
    continuity_in: `第${i + 1}章起点`, continuity_out: `第${i + 1}章终点`,
  }));
  // Keep animated host on short chapters/shots so even 480s renders in seconds while exercising real character baking!
  const shots = [];
  const planShots = [];
  chapterSeconds.forEach((sec, i) => {
    const ch = `ch_00${i + 1}`, secId = `sec_00${i + 1}`;
    if (i === 3) {
      // Chapter 4 has 2 shots: shot_004a (diagram) and shot_004b (diagram with visual cue) — used for crash points & -10s cut!
      shots.push(
        { shot_id: 'shot_004a', chapter_id: ch, section_id: secId, start: { section_id: secId }, purpose: '第四章前半', camera: 'wide',
          scene_ref: ref('diagram_flow_scene'), scene_layers: [ref('studio_backdrop'), ref('diagram_flow')], character_actions: [], audio_anchors: [],
          visual_cues: [{ target_ref: ref('diagram_flow'), element_id: 'browser', operation: 'highlight', at: { local_frame: 10 } }], depends_on: [] },
        { shot_id: 'shot_004b', chapter_id: ch, section_id: secId, start: { word_id: 'sec_004-w002', edge: 'start' }, purpose: '第四章后半', camera: 'wide',
          scene_ref: ref('diagram_flow_scene'), scene_layers: [ref('studio_backdrop'), ref('diagram_flow')], character_actions: [], audio_anchors: [],
          visual_cues: [{ target_ref: ref('diagram_flow'), element_id: 'server', operation: 'highlight', at: { local_frame: 10 } }], depends_on: [] },
      );
    } else if (i === 0 || (i === 4 && sec <= 10)) {
      // Host shot in ch_001 (and ch_005 when short) to verify character baking + shift invariance.
      const shotId = `shot_00${i + 1}`;
      shots.push({ shot_id: shotId, chapter_id: ch, section_id: secId, start: { section_id: secId }, purpose: `主持人第${i + 1}章`, camera: 'medium',
        scene_ref: ref('studio_host'), scene_layers: [ref('studio_backdrop')], character_actions: [host('explaining', 'point_right')], audio_anchors: [], visual_cues: [], depends_on: [] });
      planShots.push({ shot_id: shotId, character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral',
        actions: [{ local_range: { start: 0, end: Math.min(30, sec * 30) }, action: host('explaining', 'point_right'), cue_id: null }] });
    } else {
      shots.push({ shot_id: `shot_00${i + 1}`, chapter_id: ch, section_id: secId, start: { section_id: secId }, purpose: `图解第${i + 1}章`, camera: 'wide',
        scene_ref: ref('diagram_flow_scene'), scene_layers: [ref('studio_backdrop'), ref('diagram_flow')], character_actions: [], audio_anchors: [],
        visual_cues: [{ target_ref: ref('diagram_flow'), element_id: i % 2 ? 'server' : 'browser', operation: 'highlight', at: { local_frame: 10 } }], depends_on: [] });
    }
  });
  await ok(call(project, 'storyboard', { ...(await envelope(project, 'board')), alignment_version: 1, chapters, shots }));
  const compiled = await ok(call(project, 'compile', { ...(await envelope(project, 'compile')) }));
  // Note: for 480s chapter 1 (600 frames), plan spans the host shot cleanly.
  const fixedPlanShots = planShots.map((ps) => {
    const cs = compiled.document.timeline.shots.find((s) => s.shot_id === ps.shot_id);
    return { ...ps, actions: [{ local_range: { start: 0, end: cs.local_frames }, action: host('explaining', 'point_right'), cue_id: null }] };
  });
  const plan = fixedPlanShots.length
    ? await ok(call(project, 'plan', { project_id: ID, timeline_version: 1, shots: fixedPlanShots }))
    : null;
  return { project, owner, timeline: compiled.document.timeline, planRef: plan?.asset.asset_ref ?? null };
}

test('cold and warm render persist RenderJob, ShotArtifacts and ChapterCheckpoint; quality master requires G3', async () => {
  const { project, owner, planRef } = await shortStudio('quality');

  // Quality mode refuses formal master render before G3 is signed.
  const blocked = await call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: planRef, seed: 7 });
  assert.equal(blocked.code, 1, blocked.stdout);
  assert.deepEqual(issues(blocked, 'code', 'gate'), [['APPROVAL_MISSING', 'G3']]);

  // Render sample (shot_001), advance sample_rendered -> QA -> human G3 -> FINAL_RENDER.
  await ok(call(project, 'event', { ...(await envelope(project, 'req-sample')), event: 'sample_render_requested', payload: {} }));
  const sample = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'sample', shot_ids: ['shot_001'], plan_ref: planRef, seed: 7 }));
  assert.equal(sample.master.frame_count, 30);
  await ok(call(project, 'event', { ...(await envelope(project, 'sample-done')), event: 'sample_rendered',
    payload: { artifact_hash: sample.master.sha256, timeline_snapshot_hash: sample.input_snapshot_hash } }));
  await ok(call(project, 'event', { ...(await envelope(project, 'sample-qa')), event: 'sample_checked', payload: { checks: { sample_qa_pass: true } } }));
  await ok(call(project, 'decide', { ...(await envelope(project, 'g3')), gate: 'G3', target_hash: sample.master.sha256, decision: 'approve', notes: '样片通过' }, owner));
  await ok(call(project, 'event', { ...(await envelope(project, 'g3-pass')), event: 'sample_accepted', payload: {} }));

  // Cold full master render reuses already-cached shot_001 from sample and renders shot_002 + shot_003!
  const cold = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: planRef, seed: 7 }));
  assert.equal(cold.status, 'RENDERED');
  assert.equal(cold.calls.tts, 0);
  assert.equal(cold.calls.shot_cached, 1);
  assert.equal(cold.calls.shot_rendered, 2);
  assert.equal(cold.master.frame_count, 90);
  assert.equal(cold.chapters.length, 2);
  assert.deepEqual(cold.chapters.map((c) => c.checkpoint.pending_shot_ids), [[], []]);
  assert.ok(cold.render_jobs.length >= 4);

  const probe = probeMedia(join(project, cold.master.path));
  const v = probe.streams.find((s) => s.codec_type === 'video');
  const a = probe.streams.find((s) => s.codec_type === 'audio');
  assert.deepEqual([v.codec_name, v.pix_fmt, v.width, v.height, Number(v.nb_read_frames)], ['h264', 'yuv420p', 1920, 1080, 90]);
  assert.deepEqual([a.codec_name, Number(a.sample_rate)], ['aac', 48000]);

  // Warm render hits 100% cache with zero bakes and zero shot renders.
  const warm = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: planRef, seed: 7 }));
  assert.equal(warm.status, 'CACHED');
  assert.deepEqual([warm.calls.bake_executed, warm.calls.shot_rendered, warm.calls.master_assembled], [0, 0, 0]);
  assert.equal(warm.master.sha256, cold.master.sha256);
});

test('caption recoloring produces zero bakes and zero TTS calls and invalidates G3 while keeping G1/G2', async () => {
  const { project, owner, timeline, planRef } = await shortStudio('quality');
  await ok(call(project, 'event', { ...(await envelope(project, 'req-s')), event: 'sample_render_requested', payload: {} }));
  const sample1 = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'sample', shot_ids: ['shot_001'], plan_ref: planRef, seed: 7 }));
  await ok(call(project, 'event', { ...(await envelope(project, 's-done')), event: 'sample_rendered',
    payload: { artifact_hash: sample1.master.sha256, timeline_snapshot_hash: sample1.input_snapshot_hash } }));
  await ok(call(project, 'event', { ...(await envelope(project, 's-qa')), event: 'sample_checked', payload: { checks: { sample_qa_pass: true } } }));
  await ok(call(project, 'decide', { ...(await envelope(project, 'g3-1')), gate: 'G3', target_hash: sample1.master.sha256, decision: 'approve', notes: 'ok' }, owner));
  await ok(call(project, 'event', { ...(await envelope(project, 's-acc')), event: 'sample_accepted', payload: {} }));
  const master1 = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: planRef, seed: 7 }));

  // Stale base_snapshot_hash is rejected.
  const stale = await call(project, 'revise', {
    project_id: ID, request_text: '改字幕颜色', base_snapshot_hash: 'sha256:' + '0'.repeat(64),
    patches: [{ target_id: 'subtitle_style', field: 'color', new_value: '#FFE066', reason: '提高对比度' }],
  });
  assert.equal(stale.code, 1);
  assert.deepEqual(issues(stale, 'code'), [['SNAPSHOT_STALE']]);

  // Plan and apply caption recolor.
  const planned = await ok(call(project, 'revise', {
    project_id: ID, request_text: '把字幕改成亮黄色', base_snapshot_hash: timeline.input_snapshot_hash, apply: false,
    patches: [{ target_id: 'subtitle_style', field: 'color', new_value: '#FFE066', reason: '提高移动端字幕可读性' }],
  }));
  assert.deepEqual(planned.change_plan.reopen_gates, ['G3', 'G4', 'G5']);
  assert.equal(planned.change_plan.estimated_cost.estimated_minor, 0);
  assert.ok(planned.change_plan.reuse.includes('audio'));

  const applied = await ok(call(project, 'revise', {
    ...(await envelope(project, 'rev-caption')), request_text: '把字幕改成亮黄色', base_snapshot_hash: timeline.input_snapshot_hash, apply: true,
    patches: [{ target_id: 'subtitle_style', field: 'color', new_value: '#FFE066', reason: '提高移动端字幕可读性' }],
  }));
  assert.equal(applied.state, 'COMPILED');
  assert.notEqual(applied.timeline.input_snapshot_hash, timeline.input_snapshot_hash);

  // Old G3 is now stale for the revised timeline; formal master is blocked until re-sampled & approved.
  const blockedMaster = await call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: applied.plan_ref, seed: 7 });
  assert.equal(blockedMaster.code, 1);
  assert.deepEqual(issues(blockedMaster, 'code', 'gate'), [['APPROVAL_STALE', 'G3']]);

  // Re-sample, re-sign G3 (G1/G2 were NOT reopened!), and render master v2: ZERO character bakes and ZERO TTS calls!
  await ok(call(project, 'event', { ...(await envelope(project, 'req-s2')), event: 'sample_render_requested', payload: {} }));
  const sample2 = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'sample', shot_ids: ['shot_001'], plan_ref: applied.plan_ref, seed: 7 }));
  assert.equal(sample2.calls.bake_executed, 0);
  assert.equal(sample2.calls.tts, 0);
  assert.notEqual(sample2.master.sha256, sample1.master.sha256);
  await ok(call(project, 'event', { ...(await envelope(project, 's2-done')), event: 'sample_rendered',
    payload: { artifact_hash: sample2.master.sha256, timeline_snapshot_hash: sample2.input_snapshot_hash } }));
  await ok(call(project, 'event', { ...(await envelope(project, 's2-qa')), event: 'sample_checked', payload: { checks: { sample_qa_pass: true } } }));
  await ok(call(project, 'decide', { ...(await envelope(project, 'g3-2')), gate: 'G3', target_hash: sample2.master.sha256, decision: 'approve', notes: '黄字通过' }, owner));
  await ok(call(project, 'event', { ...(await envelope(project, 's2-acc')), event: 'sample_accepted', payload: {} }));

  const master2 = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: applied.plan_ref, seed: 7 }));
  assert.deepEqual([master2.calls.tts, master2.calls.image, master2.calls.video, master2.calls.bake_executed], [0, 0, 0, 0]);
  assert.ok(master2.calls.bake_cached >= 3);
  assert.notEqual(master2.master.sha256, master1.master.sha256);
});

test('changing one expression affects only the shot and explicit end-state dependents; independent shots keep identical hashes', async () => {
  const { project, timeline, planRef } = await shortStudio('draft');
  const before = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: planRef, seed: 7 }));
  const shotMap = (r) => Object.fromEntries(r.shots.map((s) => [s.shot_id, s]));
  const b = shotMap(before);

  const revised = await ok(call(project, 'revise', {
    ...(await envelope(project, 'rev-expr')), request_text: '把第一镜表情改为专注', base_snapshot_hash: timeline.input_snapshot_hash, apply: true,
    patches: [{ target_id: 'shot_001', field: 'character_actions[0].expression', new_value: 'focused', reason: '强调关键问题' }],
  }));
  assert.ok(revised.change_plan.invalidate.includes('shot_001'));
  assert.ok(revised.change_plan.invalidate.includes('shot_002'));
  assert.ok(!revised.change_plan.invalidate.includes('shot_003'));
  assert.ok(revised.change_plan.reuse.includes('shot_003'));

  const after = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: revised.plan_ref, seed: 7 }));
  const a = shotMap(after);
  assert.equal(after.calls.tts, 0);
  // shot_001 (changed) and shot_002 (explicitly inherits shot_001 end state) recomputed.
  assert.equal(a.shot_001.cached, false);
  assert.equal(a.shot_002.cached, false);
  assert.notEqual(a.shot_001.sha256, b.shot_001.sha256);
  assert.notEqual(a.shot_002.sha256, b.shot_002.sha256);
  // shot_003 (independent) kept identical bake key, local cache key, and MP4 hash with zero work!
  assert.equal(a.shot_003.cached, true);
  assert.equal(a.shot_003.bake_cache_key, b.shot_003.bake_cache_key);
  assert.equal(a.shot_003.local_cache_key, b.shot_003.local_cache_key);
  assert.equal(a.shot_003.sha256, b.shot_003.sha256);
  assert.deepEqual([after.calls.bake_executed, after.calls.bake_cached, after.calls.shot_rendered, after.calls.shot_cached], [2, 1, 2, 1]);
});

test('cutting ten seconds from chapter four moves the boundary to frame 7,800, reuses shifted local layers and produces a 470-second master', async () => {
  // Exact 7-chapter 480-second boundaries matching kafka-to-doris: ch4 is [4800, 8100).
  const { project, timeline, planRef } = await chapterStudio({ chapterSeconds: [20, 50, 90, 110, 100, 80, 30], mode: 'draft' });
  const before = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: planRef, seed: 7 }));
  assert.equal(before.master.frame_count, 14400);
  assert.deepEqual(before.chapters.find((c) => c.chapter_id === 'ch_004').checkpoint.frame_range, { start: 4800, end: 8100 });
  const beforeByShot = Object.fromEntries(before.shots.map((s) => [s.shot_id, s]));

  // Shorten chapter 4 (sec_004) from 110 s to 100 s (-10 s = -300 frames = -480,000 samples).
  writeWav(join(project, 'incoming', 'sec_004_short.wav'), { seconds: 100 });
  const revised = await ok(call(project, 'revise', {
    ...(await envelope(project, 'rev-ch4-cut')), request_text: '第四章旁白缩减 10 秒', base_snapshot_hash: timeline.input_snapshot_hash, apply: true,
    patches: [{
      target_id: 'sec_004', field: 'audio', reason: '删去冗余示例，缩短 10 秒',
      new_value: {
        import: { path: 'incoming/sec_004_short.wav', recordist: 'owner', voice_ref: ref('host_voice') },
        words: [
          { text: '第四章前半段讲解作业', start_sample: 0, end_sample: 2400000 - 1600, confidence: 0.95 },
          { text: '第四章后半段确认提交', start_sample: 2400000, end_sample: 4800000 - 1600, confidence: 0.95 },
        ],
      },
    }],
  }));
  assert.deepEqual(revised.change_plan.reopen_gates, ['G2', 'G3', 'G4', 'G5']);
  assert.equal(revised.timeline.total_frames, 14100);
  const ch4After = revised.storyboard.chapters.find((c) => c.chapter_id === 'ch_004');
  assert.deepEqual(ch4After.frame_range, { start: 4800, end: 7800 });

  const after = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: revised.plan_ref, seed: 7 }));
  assert.equal(after.calls.tts, 0);
  assert.equal(after.calls.bake_executed, 0);
  // Only the 2 shots of ch_004 re-rendered; ch_001..ch_003 AND shifted ch_005..ch_007 hit cache!
  assert.equal(after.calls.shot_rendered, 2);
  assert.equal(after.calls.shot_cached, 6);
  for (const id of ['shot_001', 'shot_002', 'shot_003', 'shot_005', 'shot_006', 'shot_007']) {
    const s = after.shots.find((x) => x.shot_id === id);
    assert.equal(s.cached, true, `${id} should hit local cache across shift`);
    assert.equal(s.local_cache_key, beforeByShot[id].local_cache_key);
    assert.equal(s.sha256, beforeByShot[id].sha256);
  }
  assert.deepEqual(after.chapters.find((c) => c.chapter_id === 'ch_004').checkpoint.frame_range, { start: 4800, end: 7800 });
  assert.deepEqual(after.chapters.find((c) => c.chapter_id === 'ch_005').checkpoint.frame_range, { start: 7800, end: 10800 });
  assert.equal(after.master.frame_count, 14100);
  assert.equal(after.master.duration_seconds, 470);

  const probe = probeMedia(join(project, after.master.path));
  const v = probe.streams.find((s) => s.codec_type === 'video');
  const a = probe.streams.find((s) => s.codec_type === 'audio');
  assert.deepEqual([v.codec_name, v.pix_fmt, v.width, v.height, Number(v.nb_read_frames)], ['h264', 'yuv420p', 1920, 1080, 14100]);
  assert.deepEqual([a.codec_name, Number(a.sample_rate)], ['aac', 48000]);
});

test('crash recovery in chapter four (temp write, atomic rename, index) and corrupt cached shot claim only unfinished or damaged units', async () => {
  const sizes = [1, 1, 1, 2, 1];
  const clean = await chapterStudio({ chapterSeconds: sizes, mode: 'draft' });
  const refRun = await ok(call(clean.project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: clean.planRef, seed: 7 }));
  const refShots = Object.fromEntries(refRun.shots.map((s) => [s.shot_id, s.sha256]));

  // 1. Stop worker in chapter 4 right after temporary write (shot_004b).
  const pTmp = await chapterStudio({ chapterSeconds: sizes, mode: 'draft' });
  const crash1 = await call(pTmp.project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: pTmp.planRef, seed: 7 },
    { SVS_RENDER_STOP_AT: 'shot_004b:after_tmp_write' });
  assert.equal(crash1.code, 137);
  assert.ok(readdirSync(join(pTmp.project, 'assets', 'render_shot_shot_004b')).some((f) => f.endsWith('.tmp')));
  const rec1 = await ok(call(pTmp.project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: pTmp.planRef, seed: 7 }));
  assert.equal(rec1.recovery.removed_temp_files.length, 1);
  assert.deepEqual(rec1.recovery.reset_jobs.map((j) => j.target_id), ['shot_004b']);
  // shot_001, shot_002, shot_003, shot_004a cached (4); only shot_004b and shot_005 rendered (2)!
  assert.deepEqual([rec1.calls.shot_cached, rec1.calls.shot_rendered], [4, 2]);
  assert.equal(rec1.master.sha256, refRun.master.sha256);
  assert.deepEqual(Object.fromEntries(rec1.shots.map((s) => [s.shot_id, s.sha256])), refShots);

  // 2. Stop worker in chapter 4 right after atomic rename, BEFORE index insertion (shot_004b).
  const pRen = await chapterStudio({ chapterSeconds: sizes, mode: 'draft' });
  const crash2 = await call(pRen.project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: pRen.planRef, seed: 7 },
    { SVS_RENDER_STOP_AT: 'shot_004b:after_rename' });
  assert.equal(crash2.code, 137);
  assert.ok(existsSync(join(pRen.project, 'assets', 'render_shot_shot_004b', 'v1.mp4')));
  const dbRen = new DatabaseSync(join(pRen.project, 'studio.sqlite'));
  assert.equal(dbRen.prepare("SELECT COUNT(*) AS n FROM assets WHERE name = 'render_shot_shot_004b'").get().n, 0);
  dbRen.close();
  const rec2 = await ok(call(pRen.project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: pRen.planRef, seed: 7 }));
  assert.equal(rec2.recovery.removed_orphan_files.length, 1);
  assert.deepEqual([rec2.calls.shot_cached, rec2.calls.shot_rendered], [4, 2]);
  assert.equal(rec2.master.sha256, refRun.master.sha256);

  // 3. Stop worker in chapter 4 right after index insertion (shot_004a): checkpoint has shot_004a complete & shot_004b pending.
  const pIdx = await chapterStudio({ chapterSeconds: sizes, mode: 'draft' });
  const crash3 = await call(pIdx.project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: pIdx.planRef, seed: 7 },
    { SVS_RENDER_STOP_AT: 'shot_004a:after_index' });
  assert.equal(crash3.code, 137);
  const rec3 = await ok(call(pIdx.project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: pIdx.planRef, seed: 7 }));
  // shot_004a was already indexed & verified so it must NOT be re-rendered!
  assert.deepEqual([rec3.calls.shot_cached, rec3.calls.shot_rendered], [4, 2]);
  assert.equal(rec3.master.sha256, refRun.master.sha256);

  // 4. Corrupt an indexed cached shot (shot_002) on a completed project: recover + render rebuilds ONLY shot_002!
  const shot2 = rec3.shots.find((s) => s.shot_id === 'shot_002');
  writeFileSync(join(pIdx.project, shot2.path), Buffer.from('corrupted-shot-bytes'));
  const probeRec = await ok(call(pIdx.project, 'recover', { project_id: ID }));
  assert.ok(probeRec.recovery.corrupt_artifacts.some((a) => a.target_id === 'shot_002'));
  assert.ok(probeRec.recovery.invalidated_checkpoints.includes('ch_002'));
  assert.ok(probeRec.recovery.verified_checkpoints.includes('ch_001'));

  const healed = await ok(call(pIdx.project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: pIdx.planRef, seed: 7 }));
  assert.deepEqual([healed.calls.bake_executed, healed.calls.shot_cached, healed.calls.shot_rendered], [0, 5, 1]);
  assert.equal(healed.shots.find((s) => s.shot_id === 'shot_002').cached, false);
  assert.equal(healed.master.sha256, refRun.master.sha256);

  // 5. Corrupt a cached character-bake trajectory dependency: recovery invalidates the bake + dependent shot_001 only!
  const shot1 = healed.shots.find((s) => s.shot_id === 'shot_001');
  const dbBake = new DatabaseSync(join(pIdx.project, 'studio.sqlite'));
  const bakePath = dbBake.prepare('SELECT path FROM assets WHERE asset_ref = ?').get(shot1.bake_asset_ref).path;
  dbBake.close();
  writeFileSync(join(pIdx.project, bakePath), Buffer.from('corrupt-trajectory'));
  const healedBake = await ok(call(pIdx.project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: pIdx.planRef, seed: 7 }));
  assert.ok(healedBake.recovery.corrupt_artifacts.some((a) => a.asset_ref === shot1.bake_asset_ref));
  assert.deepEqual([healedBake.calls.bake_executed, healedBake.calls.shot_cached, healedBake.calls.shot_rendered], [1, 5, 1]);
  assert.equal(healedBake.master.sha256, refRun.master.sha256);
});
