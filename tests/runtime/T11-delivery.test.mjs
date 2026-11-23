// T11 / A13 (Plan A — Headless Agent Skill Delivery):
// - Shared traceability (`trace`) from claim -> source and subtitle/word -> shot, refreshing after `revise`
// - ExportManifest (excluding G5 receipt), standalone XSS-safe HTML review report, G4/G5 binding & 1-byte tamper rejection
// - Archive packaging (`package`), extraction hash verification, `archive_verified` fact wiring -> DELIVERED
// - Archive restore (`restore`) into a brand-new directory, verifying all hashes and reopening for shot-level `revise` + `render`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, pngBytes, runCliAsync, wavBytes, writeJson, writeWav } from './helpers.mjs';
import { createSession } from '../../runtime/approvals.ts';

const ID = 'deliver-demo';
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
const DIAGRAM = {
  elements: [
    { element_id: 'browser', box: { left: 0.15, top: 0.28, right: 0.40, bottom: 0.52 } },
    { element_id: 'server', box: { left: 0.60, top: 0.28, right: 0.85, bottom: 0.52 } },
  ],
};
const host = (expression = 'explaining', gesture = 'wave', angle = 'front') =>
  ({ character_ref: ref('host_main'), angle, expression, gesture, gaze: 'camera' });

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

// Build a complete quality-mode project through FINAL_REVIEW or APPROVED (ready for manifest/packaging).
async function deliveryStudio({ mode = 'quality', signG4 = true, advanceApproved = true } = {}) {
  const project = makeProject();
  await ok(call(project, 'init', { project_id: ID, title: 'T11交付归档演示', mode }));
  const owner = { SVS_SESSION_TOKEN: createSession(project, { reviewer_id: 'owner', kind: 'human' }) };
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

test('Traceability navigates claim -> source and subtitle -> word, and refreshes after shot revision', async () => {
  const { project, timeline } = await deliveryStudio({ mode: 'quality', signG4: true, advanceApproved: true });

  const claimTrace = await ok(call(project, 'trace', { project_id: ID, claim_id: 'claim_ttl' }));
  assert.equal(claimTrace.claim_trace.claim.claim_id, 'claim_ttl');
  assert.equal(claimTrace.claim_trace.sources[0].source_id, 'rfc9111');
  assert.equal(claimTrace.claim_trace.sources[0].locator, 'Section 5.2.2.1');
  assert.equal(claimTrace.claim_trace.sources[0].relation, 'supports');

  const subTrace = await ok(call(project, 'trace', { project_id: ID, subtitle_index: 1 }));
  assert.equal(subTrace.subtitle_trace.cue.section_id, 'sec_002');
  assert.equal(subTrace.subtitle_trace.shot_id, 'shot_002');
  assert.ok(subTrace.subtitle_trace.words.some((w) => w.word_id === 'sec_002-w001' && w.text === '浏览器'));
  assert.equal(subTrace.revisions.timeline, 1);

  const wordTrace = await ok(call(project, 'trace', { project_id: ID, word_id: 'sec_002-w001' }));
  assert.equal(wordTrace.word_trace.word.word_id, 'sec_002-w001');
  assert.equal(wordTrace.word_trace.shot_id, 'shot_002');

  // Revise shot_001 expression and verify shared trace immediately reflects the updated storyboard/timeline revisions.
  await ok(call(project, 'revise', {
    ...(await envelope(project, 'rev-shot1')), request_text: '把第一镜表情改为专注',
    base_snapshot_hash: timeline.input_snapshot_hash, apply: true,
    patches: [{ target_id: 'shot_001', field: 'character_actions[0].expression', new_value: 'focused', reason: '强调问题' }],
  }));
  const refreshed = await ok(call(project, 'trace', { project_id: ID, shot_id: 'shot_001' }));
  assert.equal(refreshed.revisions.storyboard, 2);
  assert.equal(refreshed.revisions.timeline, 2);
  assert.equal(refreshed.shot_trace.storyboard_shot.character_actions[0].expression, 'focused');
});

test('Manifest and packager reject draft mode, missing/stale G4, agent G5, and 1-byte tampered manifest', async () => {
  // 1. Draft mode export is forbidden.
  const draft = await deliveryStudio({ mode: 'draft' });
  const draftExp = await call(draft.project, 'manifest', { ...(await envelope(draft.project, 'exp-draft')) });
  assert.equal(draftExp.code, 1);
  assert.equal(draftExp.json.issues[0].code, 'DRAFT_EXPORT_FORBIDDEN');

  // 2. Missing G4 rejects manifest preparation.
  const noG4 = await deliveryStudio({ mode: 'quality', signG4: false });
  const missingG4 = await call(noG4.project, 'manifest', { ...(await envelope(noG4.project, 'exp-nog4')) });
  assert.equal(missingG4.code, 1);
  assert.equal(missingG4.json.issues[0].code, 'APPROVAL_MISSING');
  assert.equal(missingG4.json.issues[0].gate, 'G4');

  // 3. Stale G4 rejects manifest preparation (G4 signed for older master_checked hash, then a newer master_checked arrives).
  const stale = await deliveryStudio({ mode: 'quality', signG4: true, advanceApproved: true });
  const altMp4 = join(stale.project, 'incoming', 'alt-master.mp4');
  copyFileSync(join(stale.project, stale.master.path), altMp4);
  // Make a second valid master with slightly altered brightness via FFmpeg so hash differs.
  const reenc = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-i', altMp4, '-vf', 'eq=brightness=0.02',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-threads', '1', '-bf', '0', '-g', '30', '-video_track_timescale', '15360',
    '-c:a', 'copy', join(stale.project, 'incoming', 'alt2.mp4'),
  ], { encoding: 'utf8' });
  assert.equal(reenc.status, 0, reenc.stderr);
  const altReg = await ok(call(stale.project, 'register', { project_id: ID, name: 'alt_master', kind: 'video', path: 'incoming/alt2.mp4', rights: RIGHTS }));
  await ok(call(stale.project, 'clear', { project_id: ID, asset_ref: altReg.asset.asset_ref, usage: 'cleared', notes: '测试备用母版' }, stale.owner));
  await ok(call(stale.project, 'qa', { project_id: ID, scope: 'final', media_ref: altReg.asset.asset_ref }));
  // Force a stale G4 condition by passing a different final_media_ref whose hash != approved G4 target_hash.
  const staleExp = await call(stale.project, 'manifest', { ...(await envelope(stale.project, 'exp-stale')), final_media_ref: altReg.asset.asset_ref });
  assert.equal(staleExp.code, 1);
  assert.equal(staleExp.json.issues[0].code, 'APPROVAL_STALE');
  assert.equal(staleExp.json.issues[0].gate, 'G4');

  // 4. Valid G4 -> manifest_prepared -> agent cannot sign G5 -> human signs G5 -> tamper 1 byte of manifest -> package rejects!
  const manOut = await ok(call(stale.project, 'manifest', { ...(await envelope(stale.project, 'exp-ok')) }));
  assert.equal(manOut.state, 'EXPORT_REVIEW');
  assert.ok(manOut.export_manifest.files.every((f) => f.asset_ref !== manOut.manifest_ref), 'ExportManifest must exclude itself');
  assert.ok(manOut.export_manifest.files.every((f) => !f.relative_path.includes('g5')), 'ExportManifest must exclude G5 receipt');

  const agentG5 = await call(stale.project, 'decide', {
    ...(await envelope(stale.project, 'g5-agent')), gate: 'G5', target_hash: manOut.manifest_hash, decision: 'approve', notes: 'forged',
  }, stale.agent);
  assert.equal(agentG5.code, 1);
  assert.equal(agentG5.json.issues[0].code, 'APPROVAL_UNAUTHENTICATED');

  const g5 = await ok(call(stale.project, 'decide', {
    ...(await envelope(stale.project, 'g5-ok')), gate: 'G5', target_hash: manOut.manifest_hash, decision: 'approve', notes: '清单已核对',
  }, stale.owner));
  await ok(call(stale.project, 'event', { ...(await envelope(stale.project, 'exp-auth')), event: 'export_authorized', payload: {} }));

  const manifestFile = join(stale.project, manOut.manifest_path);
  const originalManifestBytes = readFileSync(manifestFile);
  const tamperedBytes = Buffer.from(originalManifestBytes);
  tamperedBytes[tamperedBytes.length - 3] ^= 0x01; // Flip 1 byte
  writeFileSync(manifestFile, tamperedBytes);

  const tamperedPkg = await call(stale.project, 'package', {
    project_id: ID, manifest_ref: manOut.manifest_ref, manifest_hash: manOut.manifest_hash, g5_approval_id: g5.approval.approval_id,
  });
  assert.equal(tamperedPkg.code, 1);
  assert.equal(tamperedPkg.json.issues[0].code, 'MANIFEST_HASH_MISMATCH');
  assert.equal((await status(stale.project)).state, 'PACKAGING');
});

test('Valid packaging verifies every archived file, escapes HTML review report, and advances archive_verified -> DELIVERED', async () => {
  const ctx = await deliveryStudio({ mode: 'quality', signG4: true, advanceApproved: true });
  const manOut = await ok(call(ctx.project, 'manifest', { ...(await envelope(ctx.project, 'exp-ok')) }));
  const g5 = await ok(call(ctx.project, 'decide', {
    ...(await envelope(ctx.project, 'g5-ok')), gate: 'G5', target_hash: manOut.manifest_hash, decision: 'approve', notes: '允许打包',
  }, ctx.owner));
  await ok(call(ctx.project, 'event', { ...(await envelope(ctx.project, 'exp-auth')), event: 'export_authorized', payload: {} }));

  const pkgOut = await ok(call(ctx.project, 'package', {
    project_id: ID, manifest_ref: manOut.manifest_ref, manifest_hash: manOut.manifest_hash, g5_approval_id: g5.approval.approval_id,
  }));
  assert.equal(pkgOut.final_package.manifest_hash, manOut.manifest_hash);
  assert.equal(pkgOut.final_package.g5_approval_id, g5.approval.approval_id);
  assert.equal(pkgOut.final_package.verified_file_count, manOut.export_manifest.files.length);
  assert.equal(pkgOut.tool_result.status, 'succeeded');
  assert.ok(existsSync(join(ctx.project, pkgOut.archive_path)));

  // Advance PACKAGING -> DELIVERED via recorded `packages` fact without payload.checks.
  const delivered = await ok(call(ctx.project, 'event', {
    ...(await envelope(ctx.project, 'arch-ver')), event: 'archive_verified', payload: {},
  }));
  assert.equal(delivered.state, 'DELIVERED');

  // Verify standalone static HTML review report escaped untrusted source title/summary.
  const htmlEntry = manOut.export_manifest.files.find((f) => f.relative_path === 'deliverables/review-report.html');
  assert.ok(htmlEntry, 'deliverables/review-report.html must be in ExportManifest');
  const html = readFileSync(join(ctx.project, manOut.review_html_path), 'utf8');
  assert.ok(!html.includes('<script>alert("xss")</script>'), 'raw <script> must be escaped in review HTML');
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'raw <img> payload must be escaped in review HTML');
  assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
  assert.ok(html.includes('claim_ttl'));
});

test('Restoring archive into a new directory verifies every hash and reopens for shot-level revise and render', async () => {
  const ctx = await deliveryStudio({ mode: 'quality', signG4: true, advanceApproved: true });
  const manOut = await ok(call(ctx.project, 'manifest', { ...(await envelope(ctx.project, 'exp-ok')) }));
  const g5 = await ok(call(ctx.project, 'decide', {
    ...(await envelope(ctx.project, 'g5-ok')), gate: 'G5', target_hash: manOut.manifest_hash, decision: 'approve', notes: '允许打包',
  }, ctx.owner));
  await ok(call(ctx.project, 'event', { ...(await envelope(ctx.project, 'exp-auth')), event: 'export_authorized', payload: {} }));
  const pkgOut = await ok(call(ctx.project, 'package', {
    project_id: ID, manifest_ref: manOut.manifest_ref, manifest_hash: manOut.manifest_hash, g5_approval_id: g5.approval.approval_id,
  }));
  await ok(call(ctx.project, 'event', { ...(await envelope(ctx.project, 'arch-ver')), event: 'archive_verified', payload: {} }));

  const archiveAbs = join(ctx.project, pkgOut.archive_path);
  const restoreDir = join(makeProject(), 'restored-project');

  // 1. Restore into brand-new directory.
  const restored = await ok(call(ctx.project, 'restore', { archive_path: archiveAbs, target_dir: restoreDir }));
  assert.equal(restored.project_id, ID);
  assert.equal(restored.manifest_hash, manOut.manifest_hash);
  assert.equal(restored.reopened.state, 'APPROVED', 'archived DB snapshot represents clean APPROVED pre-manifest state');
  assert.equal(restored.reopened.all_assets_verified, true);

  // Check every file in ExportManifest exists in restoreDir with its exact original SHA-256 hash.
  for (const entry of manOut.export_manifest.files) {
    const filePath = join(restoreDir, entry.relative_path);
    assert.ok(existsSync(filePath), `restored file missing: ${entry.relative_path}`);
    assert.equal(sha256(readFileSync(filePath)), entry.hash, `restored hash mismatch for ${entry.relative_path}`);
  }

  // 2. Non-empty restore directory is rejected cleanly.
  const nonEmpty = await call(ctx.project, 'restore', { archive_path: archiveAbs, target_dir: restoreDir });
  assert.equal(nonEmpty.code, 1);
  assert.equal(nonEmpty.json.issues[0].code, 'RESTORE_DIR_NOT_EMPTY');

  // 3. Reopen restored project and perform shot-level revision + shot render inside the new directory!
  const reopenedDir = join(restoreDir, 'project');
  const st = await ok(call(reopenedDir, 'status', { project_id: ID }));
  assert.equal(st.project_id, ID);
  const resView = await ok(call(reopenedDir, 'resume', { project_id: ID }));
  assert.equal(resView.resolved.duration_target_seconds, 60);
  const traceView = await ok(call(reopenedDir, 'trace', { project_id: ID, claim_id: 'claim_ttl' }));
  assert.equal(traceView.claim_trace.sources[0].source_id, 'rfc9111');

  const rev = await ok(call(reopenedDir, 'revise', {
    ...(await envelope(reopenedDir, 'restore-rev')), request_text: '在还原目录中把第一镜表情改为专注',
    base_snapshot_hash: ctx.timeline.input_snapshot_hash, apply: true,
    patches: [{ target_id: 'shot_001', field: 'character_actions[0].expression', new_value: 'focused', reason: '还原后逐镜编辑验证' }],
  }));
  const shotRender = await ok(call(reopenedDir, 'render', {
    project_id: ID, scope: 'shot', target_id: 'shot_001', plan_ref: rev.plan_ref, seed: 7,
  }));
  assert.equal(shotRender.shots[0].shot_id, 'shot_001');
  assert.equal(shotRender.shots[0].cached, false);

  // 4. Corrupted archive fails verification without leaving restored files behind.
  const badArchive = join(makeProject(), 'corrupt.tar.gz');
  const rawTar = readFileSync(archiveAbs);
  const corruptTar = Buffer.from(rawTar);
  corruptTar[Math.floor(corruptTar.length / 2)] ^= 0xff;
  writeFileSync(badArchive, corruptTar);
  const failRestoreDir = join(makeProject(), 'should-not-exist');
  const failRes = await call(ctx.project, 'restore', { archive_path: badArchive, target_dir: failRestoreDir });
  assert.equal(failRes.code, 1);
  assert.ok(['ARCHIVE_VERIFY_FAILED', 'ARCHIVE_HASH_MISMATCH'].includes(failRes.json.issues[0].code));
  assert.equal(existsSync(join(failRestoreDir, 'project')), false);
  rmSync(restoreDir, { recursive: true, force: true });
});

test('REFACTOR checks: idempotent manifest replay, negative trace lookups, and modified source file rejection during packaging', async () => {
  const ctx = await deliveryStudio({ mode: 'quality', signG4: true, advanceApproved: true });
  const manEnv = await envelope(ctx.project, 'exp-replay-key');
  const manOut = await ok(call(ctx.project, 'manifest', manEnv));
  const replayed = await ok(call(ctx.project, 'manifest', manEnv));
  assert.equal(replayed.status, 'REPLAYED');
  assert.equal(replayed.manifest_ref, manOut.manifest_ref);
  assert.equal(replayed.manifest_hash, manOut.manifest_hash);

  // Negative trace diagnostics.
  const badClaim = await call(ctx.project, 'trace', { project_id: ID, claim_id: 'no_such_claim' });
  assert.equal(badClaim.code, 1);
  assert.equal(badClaim.json.issues[0].code, 'CLAIM_UNKNOWN');
  const badWord = await call(ctx.project, 'trace', { project_id: ID, word_id: 'no_such_word' });
  assert.equal(badWord.code, 1);
  assert.equal(badWord.json.issues[0].code, 'WORD_UNKNOWN');
  const badShot = await call(ctx.project, 'trace', { project_id: ID, shot_id: 'no_such_shot' });
  assert.equal(badShot.code, 1);
  assert.equal(badShot.json.issues[0].code, 'RENDER_TARGET_UNKNOWN');

  // Sign G5, advance PACKAGING, then corrupt a deliverable file on disk before calling `package` -> ASSET_FILE_CHANGED.
  const g5 = await ok(call(ctx.project, 'decide', {
    ...(await envelope(ctx.project, 'g5-ok')), gate: 'G5', target_hash: manOut.manifest_hash, decision: 'approve', notes: 'ok',
  }, ctx.owner));
  await ok(call(ctx.project, 'event', { ...(await envelope(ctx.project, 'exp-auth')), event: 'export_authorized', payload: {} }));

  const htmlPath = join(ctx.project, manOut.review_html_path);
  writeFileSync(htmlPath, 'tampered html');
  const failPkg = await call(ctx.project, 'package', {
    project_id: ID, manifest_ref: manOut.manifest_ref, manifest_hash: manOut.manifest_hash, g5_approval_id: g5.approval.approval_id,
  });
  assert.equal(failPkg.code, 1);
  assert.equal(failPkg.json.issues[0].code, 'ASSET_FILE_CHANGED');
});
