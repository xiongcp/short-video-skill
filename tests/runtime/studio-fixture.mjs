// Shared runtime fixture: a draft project at ALIGNMENT_READY (sec_001 = 48,000 samples, sec_002 = 96,504 samples with a
// repeated “副本”) plus cleared placeholder art, rig, voice, a diagram and host/pending/diagram scenes.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, makeProject, pngBytes, runCliAsync, wavBytes, writeJson, writeWav } from './helpers.mjs';
import { createSession } from '../../runtime/approvals.ts';

export const ID = 'direct-demo';
export const ref = (name, v = 1) => `asset://${ID}/${name}/v${v}`;
let n = 0;
export async function call(project, op, request, env = {}) {
  const path = writeJson(join(project, 'requests', `${String(n++).padStart(3, '0')}-${op}.json`), request);
  return runCliAsync([op, '--project', project, '--request', path], env);
}
export async function ok(promise) {
  const result = await promise;
  assert.equal(result.code, 0, result.stdout + result.stderr);
  return result.json;
}
export const status = async (project) => (await call(project, 'status', { project_id: ID })).json;
export const envelope = async (project, key) => ({ project_id: ID, expected_version: (await status(project)).version, idempotency_key: key });
export const issues = (result, ...keys) => result.json.issues.map((item) => keys.map((key) => item[key]));
const event = async (project, name) => ok(call(project, 'event', { ...(await envelope(project, name)), event: name, payload: {} }));

export const SECTIONS = [
  { section_id: 'sec_001', title: '开场', narration: '先看第一段。', claim_ids: [], pronunciation: [], visual_intent: '主持人', duration_estimate_frames: 30, cues: [] },
  { section_id: 'sec_002', title: '副本', narration: '浏览器有副本，再看副本是否新鲜。', claim_ids: [], pronunciation: [],
    visual_intent: '副本卡片', duration_estimate_frames: 60, cues: [{ cue_id: 'cue_copy_1', text: '副本' }, { cue_id: 'cue_copy_2', text: '副本' }] },
];
const RIGHTS = { holder: 'project owner', license: 'owner-original', source: 'test fixture generated in code', original: true };
export const PROFILE = (rig = ref('host_rig')) => ({ character_id: 'host_main', style_lock: ['墨蓝短外套'], rig_ref: rig, voice_ref: ref('host_voice'),
  supported_angles: ['front'], expressions: ['explaining'], gestures: ['idle', 'point_right'], parameters: [{ parameter_id: 'ParamMouthOpenY', min: 0, max: 1 }] });
export const FIXTURE_RIG = { rig: 'fixture', parameters: ['ParamMouthOpenY'] };
const DIAGRAM = { elements: [{ element_id: 'browser', box: { left: 0.15, top: 0.3, right: 0.35, bottom: 0.55 } }, { element_id: 'server', box: { left: 0.65, top: 0.3, right: 0.85, bottom: 0.55 } }] };

// words: per-section aligner output as [text, start, end] triples (section-local samples); marks: viseme marks.
export async function alignedStudio({ words, marks = [], rig = FIXTURE_RIG, profile = PROFILE() }) {
  const project = makeProject();
  await ok(call(project, 'init', { project_id: ID, title: '导演编译', mode: 'draft' }));
  const owner = { SVS_SESSION_TOKEN: createSession(project, { reviewer_id: 'owner', kind: 'human' }) };
  const brief = JSON.parse(readFileSync(join(ROOT, 'examples', 'topic-cache-speed', 'brief.json'), 'utf8'));
  await ok(call(project, 'brief', { ...(await envelope(project, 'brief')), topic: brief.topic, audience: brief.audience, scope: brief.scope,
    keywords: brief.keywords, language: brief.language, style_profile: brief.style_profile, overrides: { duration_target_seconds: 60 } }));
  await event(project, 'research_started');
  await ok(call(project, 'evidence', { ...(await envelope(project, 'evidence')), sources: [], claims: [], links: [] }));
  await event(project, 'draft_script_requested');
  await ok(call(project, 'script', { ...(await envelope(project, 'script')), script_id: 'episode', sections: SECTIONS }));
  await event(project, 'draft_audio_requested');
  writeWav(join(project, 'incoming', 'sec_001.wav'), { seconds: 1 });
  writeWav(join(project, 'incoming', 'sec_002.wav'), { seconds: 96504 / 48000 });
  const audio = await ok(call(project, 'audio', { ...(await envelope(project, 'audio')), sections: [
    { section_id: 'sec_001', import: { path: 'incoming/sec_001.wav', recordist: 'owner', voice_ref: ref('host_voice') } },
    { section_id: 'sec_002', import: { path: 'incoming/sec_002.wav', recordist: 'owner', voice_ref: ref('host_voice') } }] }));
  const sections = words.map(({ section_id, words: list }) => ({ section_id,
    words: list.map(([text, start_sample, end_sample]) => ({ text, start_sample, end_sample, confidence: 0.95 })) }));
  const alignment = await ok(call(project, 'align', { ...(await envelope(project, 'align')), audio_version: 1,
    engine: { name: 'owner-aligner', version: '1.0' }, sections, marks, subtitle_style_ref: ref('subtitle_style') }));

  const file = (name, bytes) => { mkdirSync(join(project, 'incoming'), { recursive: true }); writeFileSync(join(project, 'incoming', name), bytes); return `incoming/${name}`; };
  const register = (name, kind, path, extra = {}) => ok(call(project, 'register', { project_id: ID, name, kind, path, rights: RIGHTS, ...extra }));
  await register('studio_backdrop', 'background', file('backdrop.png', pngBytes(2880, 1620)));
  await register('host_rig', 'rig', file('rig.json', JSON.stringify(rig)));
  await register('host_voice', 'voice', file('voice.wav', wavBytes({ seconds: 1 })));
  await register('host_main', 'character', file('host.png', pngBytes(1200, 1600, [200, 120, 90, 255])), { profile });
  await register('diagram_cache', 'diagram', file('diagram.json', JSON.stringify(DIAGRAM)));
  await register('backdrop_pending', 'background', file('pending.png', pngBytes(2880, 1620, [90, 60, 40, 255])));
  for (const name of ['studio_backdrop', 'host_rig', 'host_voice', 'host_main', 'diagram_cache']) {
    await ok(call(project, 'clear', { project_id: ID, asset_ref: ref(name), usage: 'cleared', notes: '原创测试素材' }, owner));
  }
  await ok(call(project, 'scene', { project_id: ID, name: 'studio_host', template: 'host', focus: '主持人', layers: [{ asset_ref: ref('studio_backdrop') }] }));
  await ok(call(project, 'scene', { project_id: ID, name: 'studio_pending', template: 'host', focus: '待授权背景', layers: [{ asset_ref: ref('backdrop_pending') }] }));
  await ok(call(project, 'scene', { project_id: ID, name: 'diagram_ch_002', template: 'diagram', focus: '浏览器和服务器',
    layers: [{ asset_ref: ref('studio_backdrop') }, { asset_ref: ref('diagram_cache'), element_ids: ['browser', 'server'], claim_ids: [] }] }));
  return { project, owner, audio: audio.document, alignment: alignment.document };
}
