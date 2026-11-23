// Shared delivery fixture (moved from T11-delivery.test.mjs for reuse by T12): a quality-mode project built through
// FINAL_REVIEW or APPROVED with synthetic audio, code-generated art and a simulated rig.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, pngBytes, runCliAsync, wavBytes, writeJson, writeWav } from './helpers.mjs';
import { createSession } from '../../runtime/approvals.ts';

export const ID = 'deliver-demo';
export const ref = (name, v = 1) => `asset://${ID}/${name}/v${v}`;
export const sha256 = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
export const RIGHTS = { holder: 'project owner', license: 'owner-original', source: 'test fixture generated in code', original: true };

export const RIG = {
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
export const PROFILE = {
  character_id: 'host_main', style_lock: ['墨蓝短外套'], rig_ref: ref('host_rig'), voice_ref: ref('host_voice'),
  supported_angles: ['front', 'three_quarter'], expressions: ['explaining', 'focused'], gestures: ['idle', 'point_right', 'wave'],
  parameters: [{ parameter_id: 'ParamAngleX', min: -1, max: 1 }, { parameter_id: 'ParamArmR', min: 0, max: 1 },
    { parameter_id: 'ParamEyeOpen', min: 0, max: 1 }, { parameter_id: 'ParamMouthOpenY', min: 0, max: 1 }],
};
export const DIAGRAM = {
  elements: [
    { element_id: 'browser', box: { left: 0.15, top: 0.28, right: 0.40, bottom: 0.52 } },
    { element_id: 'server', box: { left: 0.60, top: 0.28, right: 0.85, bottom: 0.52 } },
  ],
};
export const host = (expression = 'explaining', gesture = 'wave', angle = 'front') =>
  ({ character_ref: ref('host_main'), angle, expression, gesture, gaze: 'camera' });

let seq = 0;
export async function call(project, op, request, env = {}) {
  const path = writeJson(join(project, 'requests', `${String(seq++).padStart(4, '0')}-${op}.json`), request);
  return runCliAsync([op, '--project', project, '--request', path], env);
}
export async function ok(promise) {
  const result = await promise;
  assert.equal(result.code, 0, result.stdout + result.stderr);
  return result.json;
}
export const status = async (project) => (await call(project, 'status', { project_id: ID })).json;
export const envelope = async (project, key) => ({ project_id: ID, expected_version: (await status(project)).version, idempotency_key: key });

// Build a complete quality-mode project through FINAL_REVIEW or APPROVED (ready for manifest/packaging).
export async function deliveryStudio({ mode = 'quality', signG4 = true, advanceApproved = true, ownerSession } = {}) {
  const project = makeProject();
  await ok(call(project, 'init', { project_id: ID, title: 'T11交付归档演示', mode }));
  // ownerSession lets a caller sign every gate with its own session (T12 uses a passphrase login).
  const owner = { SVS_SESSION_TOKEN: ownerSession ? ownerSession(project) : createSession(project, { reviewer_id: 'owner', kind: 'human' }) };
  const agent = { SVS_SESSION_TOKEN: createSession(project, { reviewer_id: 'agent-1', kind: 'agent' }) };

  await ok(call(project, 'brief', {
    ...(await envelope(project, 'brief')), topic: 'HTTP 缓存机制', audience: '开发者', scope: ['命中', '过期'],
    keywords: ['Cache-Control', 'ETag'], language: 'zh-CN', style_profile: 'anime-clean', overrides: { duration_target_seconds: 60 },
  }));
  await ok(call(project, 'event', { ...(await envelope(project, 'res')), event: 'research_started', payload: {} }));

  const ev = await ok(call(project, 'evidence', {
    ...(await envelope(project, 'ev')),
    sources: [{
      source_id: 'rfc9111', url: 'https://httpwg.org/specs/rfc9111.html',
      title: 'RFC 9111 HTTP Caching <script>alert("xss")</script>',
      published_on: '2022-06-01', retrieved_on: '2026-11-22',
      summary: 'HTTP 缓存语义规范 <img src=x onerror=alert(1)>',
    }],
    claims: [{ claim_id: 'claim_ttl', statement: 'max-age 指定响应可被复用的秒数', qualifier: '遵循 RFC 9111 §5.2.2.1' }],
    links: [{ claim_id: 'claim_ttl', source_id: 'rfc9111', locator: 'Section 5.2.2.1', relation: 'supports' }],
  }));

  if (mode === 'quality') {
    await ok(call(project, 'decide', { ...(await envelope(project, 'g1')), gate: 'G1', target_hash: ev.content_hash, decision: 'approve', notes: '来源已核验' }, owner));
    await ok(call(project, 'event', { ...(await envelope(project, 'to-sc')), event: 'research_accepted', payload: {} }));
  } else {
    await ok(call(project, 'event', { ...(await envelope(project, 'to-sc')), event: 'draft_script_requested', payload: {} }));
  }

  const sc = await ok(call(project, 'script', {
    ...(await envelope(project, 'sc')), script_id: 'cache-ep',
    sections: [
      { section_id: 'sec_001', title: '开场', narration: '先看第一段。', claim_ids: [], pronunciation: [], visual_intent: '主持人', duration_estimate_frames: 240, cues: [] },
      { section_id: 'sec_002', title: '规则', narration: '浏览器按响应头复用缓存。', claim_ids: ['claim_ttl'], pronunciation: [], visual_intent: '图解', duration_estimate_frames: 210, cues: [] },
      { section_id: 'sec_003', title: '总结', narration: '合理设置缓存可兼顾速度。', claim_ids: [], pronunciation: [], visual_intent: '主持人总结', duration_estimate_frames: 210, cues: [] },
    ],
  }));

  if (mode === 'quality') {
    await ok(call(project, 'decide', { ...(await envelope(project, 'g2')), gate: 'G2', target_hash: sc.content_hash, decision: 'approve', notes: '讲稿通过' }, owner));
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
  await reg('diagram_static', 'diagram', file('diagram.json', JSON.stringify(DIAGRAM)));
  await reg('subtitle_style', 'other', file('subtitle-style.json', JSON.stringify({ color: '#FFFFFF', outline: '#101820' })));
  for (const name of ['studio_backdrop', 'host_rig', 'host_voice', 'host_main', 'diagram_static', 'subtitle_style']) {
    await ok(call(project, 'clear', { project_id: ID, asset_ref: ref(name), usage: 'cleared', notes: '测试授权' }, owner));
  }
  await ok(call(project, 'scene', { project_id: ID, name: 'studio_host', template: 'host', focus: '主持人', layers: [{ asset_ref: ref('studio_backdrop') }] }));
  await ok(call(project, 'scene', {
    project_id: ID, name: 'scene_diagram', template: 'diagram', focus: '缓存图解',
    layers: [{ asset_ref: ref('studio_backdrop') }, { asset_ref: ref('diagram_static'), element_ids: ['browser', 'server'], claim_ids: ['claim_ttl'] }],
  }));

  writeWav(join(project, 'incoming', 'sec_001.wav'), { seconds: 8 });
  writeWav(join(project, 'incoming', 'sec_002.wav'), { seconds: 7 });
  writeWav(join(project, 'incoming', 'sec_003.wav'), { seconds: 7 });
  await ok(call(project, 'audio', {
    ...(await envelope(project, 'audio')),
    sections: [
      { section_id: 'sec_001', import: { path: 'incoming/sec_001.wav', recordist: 'owner', voice_ref: ref('host_voice') } },
      { section_id: 'sec_002', import: { path: 'incoming/sec_002.wav', recordist: 'owner', voice_ref: ref('host_voice') } },
      { section_id: 'sec_003', import: { path: 'incoming/sec_003.wav', recordist: 'owner', voice_ref: ref('host_voice') } },
    ],
  }));
  await ok(call(project, 'align', {
    ...(await envelope(project, 'align')), audio_version: 1, engine: { name: 'fixture-aligner', version: '1.0' },
    sections: [
      { section_id: 'sec_001', words: [{ text: '先看', start_sample: 0, end_sample: 190000, confidence: 0.95 }, { text: '第一段', start_sample: 190000, end_sample: 380000, confidence: 0.95 }] },
      { section_id: 'sec_002', words: [{ text: '浏览器', start_sample: 0, end_sample: 160000, confidence: 0.95 }, { text: '按响应头复用缓存', start_sample: 160000, end_sample: 330000, confidence: 0.95 }] },
      { section_id: 'sec_003', words: [{ text: '合理设置缓存可兼顾速度', start_sample: 0, end_sample: 330000, confidence: 0.95 }] },
    ],
    marks: [], subtitle_style_ref: ref('subtitle_style'),
  }));
  await ok(call(project, 'storyboard', {
    ...(await envelope(project, 'board')), alignment_version: 1,
    chapters: [{ chapter_id: 'ch_001', title: '缓存机制', section_ids: ['sec_001', 'sec_002', 'sec_003'], continuity_in: '空场', continuity_out: '总结' }],
    shots: [
      {
        shot_id: 'shot_001', chapter_id: 'ch_001', section_id: 'sec_001', start: { section_id: 'sec_001' }, purpose: '开场', camera: 'medium',
        scene_ref: ref('studio_host'), scene_layers: [ref('studio_backdrop')], character_actions: [host('explaining', 'wave')], audio_anchors: [], visual_cues: [], depends_on: [],
      },
      {
        shot_id: 'shot_002', chapter_id: 'ch_001', section_id: 'sec_002', start: { section_id: 'sec_002' }, purpose: '图解', camera: 'wide',
        scene_ref: ref('scene_diagram'), scene_layers: [ref('studio_backdrop'), ref('diagram_static')], character_actions: [], audio_anchors: [],
        visual_cues: [{ target_ref: ref('diagram_static'), element_id: 'browser', operation: 'highlight', at: { local_frame: 30 } }], depends_on: [],
        holds: [{ local_range: { start: 0, end: 210 }, reason: '读图停留：查看响应头缓存复用流程' }],
      },
      {
        shot_id: 'shot_003', chapter_id: 'ch_001', section_id: 'sec_003', start: { section_id: 'sec_003' }, purpose: '总结', camera: 'medium',
        scene_ref: ref('studio_host'), scene_layers: [ref('studio_backdrop')], character_actions: [host('explaining', 'point_right')], audio_anchors: [], visual_cues: [], depends_on: [],
      },
    ],
  }));
  const compiled = await ok(call(project, 'compile', { ...(await envelope(project, 'compile')) }));
  const plan = await ok(call(project, 'plan', {
    project_id: ID, timeline_version: 1,
    shots: [
      { shot_id: 'shot_001', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral',
        actions: [{ local_range: { start: 0, end: 240 }, action: host('explaining', 'wave'), cue_id: null }] },
      { shot_id: 'shot_003', character_ref: ref('host_main'), initial_pose: 'neutral', exit_pose: 'neutral',
        actions: [{ local_range: { start: 0, end: 210 }, action: host('explaining', 'point_right'), cue_id: null }] },
    ],
  }));

  await ok(call(project, 'target', { project_id: ID, target_id: 'web-standard', version: '2026.1', lufs_min: -24, lufs_max: -6, max_true_peak_dbtp: -1.0 }));
  if (mode !== 'quality') {
    const rendered = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: plan.asset.asset_ref, seed: 7 }));
    return { project, owner, agent, timeline: compiled.document.timeline, planRef: plan.asset.asset_ref, master: rendered.master };
  }

  await ok(call(project, 'event', { ...(await envelope(project, 'req-s')), event: 'sample_render_requested', payload: {} }));
  const sampleQa = await ok(call(project, 'qa', { project_id: ID, scope: 'sample', render_sample: true, plan_ref: plan.asset.asset_ref, seed: 7 }));
  await ok(call(project, 'event', { ...(await envelope(project, 's-rend')), event: 'sample_rendered',
    payload: { artifact_hash: sampleQa.sample.sha256, timeline_snapshot_hash: sampleQa.sample.input_snapshot_hash } }));
  await ok(call(project, 'event', { ...(await envelope(project, 's-chk')), event: 'sample_checked', payload: {} }));
  await ok(call(project, 'decide', { ...(await envelope(project, 'g3')), gate: 'G3', target_hash: sampleQa.sample.sha256, decision: 'approve', notes: '样片通过' }, owner));
  await ok(call(project, 'event', { ...(await envelope(project, 's-acc')), event: 'sample_accepted', payload: {} }));

  const masterRender = await ok(call(project, 'render', { project_id: ID, scope: 'master', target_id: 'master', plan_ref: plan.asset.asset_ref, seed: 7 }));
  const finalQa = await ok(call(project, 'qa', { project_id: ID, scope: 'final', media_ref: masterRender.master.artifact_ref }));
  await ok(call(project, 'event', { ...(await envelope(project, 'm-chk')), event: 'master_checked',
    payload: { artifact_hash: masterRender.master.sha256 } }));

  let g4 = null;
  if (signG4) {
    g4 = await ok(call(project, 'decide', { ...(await envelope(project, 'g4')), gate: 'G4', target_hash: masterRender.master.sha256, decision: 'approve', notes: '成片通过' }, owner));
    if (advanceApproved) {
      await ok(call(project, 'event', { ...(await envelope(project, 'm-acc')), event: 'master_accepted', payload: {} }));
    }
  }
  return {
    project, owner, agent, timeline: compiled.document.timeline, planRef: plan.asset.asset_ref,
    master: masterRender.master, finalQa, g4Approval: g4?.approval ?? null,
  };
}
