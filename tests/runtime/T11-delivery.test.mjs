// T11 / A13 (Plan A — Headless Agent Skill Delivery):
// - Shared traceability (`trace`) from claim -> source and subtitle/word -> shot, refreshing after `revise`
// - ExportManifest (excluding G5 receipt), standalone XSS-safe HTML review report, G4/G5 binding & 1-byte tamper rejection
// - Archive packaging (`package`), extraction hash verification, `archive_verified` fact wiring -> DELIVERED
// - Archive restore (`restore`) into a brand-new directory, verifying all hashes and reopening for shot-level `revise` + `render`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject } from './helpers.mjs';
import { ID, RIGHTS, call, deliveryStudio, envelope, ok, sha256, status } from './delivery-fixture.mjs';

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

  // 5. An archive carrying a file not listed in its ExportManifest is rejected and nothing is materialized.
  const plantedSrc = join(makeProject(), 'planted');
  mkdirSync(plantedSrc, { recursive: true });
  assert.equal(spawnSync('tar', ['-xzf', archiveAbs, '-C', plantedSrc]).status, 0);
  writeFileSync(join(plantedSrc, 'project', 'planted.txt'), 'not in manifest');
  const plantedArchive = join(makeProject(), 'planted.tar.gz');
  assert.equal(spawnSync('tar', ['-czf', plantedArchive, '-C', plantedSrc, ...readdirSync(plantedSrc)], { env: { ...process.env, COPYFILE_DISABLE: '1' } }).status, 0);
  const plantedDir = join(makeProject(), 'planted-restore');
  const plantedRes = await call(ctx.project, 'restore', { archive_path: plantedArchive, target_dir: plantedDir });
  assert.equal(plantedRes.code, 1);
  assert.equal(plantedRes.json.issues[0].code, 'ARCHIVE_UNLISTED_FILE');
  assert.equal(existsSync(join(plantedDir, 'project')), false);
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
