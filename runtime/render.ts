// Shot/chapter/master rendering, content-addressed local vs assembly caching, checkpoints and crash recovery (T09).
// Local shot keys project only shot-local inputs (never absolute position); assembly keys bind ordered shots and audio.
// Every artifact is rendered to a temp file, verified with ffprobe, atomically renamed, and only then indexed in SQLite.
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { requirementIssues } from './approvals.ts';
import {
  type AssetRow, getAsset, indexAsset, invalidateAsset, isAssetInvalid,
  readAsset, reserveAssetTarget, sha256, usageOf, validAssetByMeta,
} from './assets.ts';
import { ensureShotBake } from './baker.ts';
import { localSubtitleSlices } from './compiler.ts';
import { latest } from './content.ts';
import { currentBudget } from './ledger.ts';
import { type Db, type Issue, type Outcome, getProject, newId, openStore, requestHash, summary, transaction } from './project-store.ts';
import { FPS } from './timebase.ts';
import {
  DEFAULT_OUTPUT_SPEC, RENDERER, type Rgb, assembleMaster, assembleVideo, parseColor, probeVideo, renderShotMedia,
} from '../tools/render_shot/adapter.ts';

const MANAGED_PREFIXES = ['render_', 'character_bake'];

function stopHook(targetId: string, stage: 'after_tmp_write' | 'after_rename' | 'after_index') {
  if (process.env.SVS_RENDER_STOP_AT === `${targetId}:${stage}`) process.exit(137);
}

function logEvent(db: Db, projectId: string, runId: string, scope: string, targetId: string, event: string, detail: object = {}, jobId: string | null = null) {
  db.prepare(`INSERT INTO render_events (project_id, run_id, job_id, scope, target_id, event, detail, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(projectId, runId, jobId, scope, targetId, event, JSON.stringify(detail), new Date().toISOString());
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

const relPosix = (root: string, full: string) => relative(root, full).split(sep).join('/');

export interface RecoveryReport {
  removed_temp_files: string[];
  removed_orphan_files: string[];
  corrupt_artifacts: { asset_ref: string; kind: string; target_id: string; path: string }[];
  reset_jobs: { job_id: string; scope: string; target_id: string; previous_state: string }[];
  verified_checkpoints: string[];
  invalidated_checkpoints: string[];
  events: { scope: string; target_id: string; event: string; detail: any }[];
}

// Startup reconciliation: clean incomplete .tmp and unindexed orphan render files, verify indexed artifacts and
// checkpoints, invalidate corrupt artifacts and their dependents, and reset interrupted RUNNING jobs.
export function reconcileRenderState(db: Db, project: string, projectId: string, runId: string): RecoveryReport {
  const removed_temp_files: string[] = [];
  const removed_orphan_files: string[] = [];
  const corrupt_artifacts: RecoveryReport['corrupt_artifacts'] = [];
  const reset_jobs: RecoveryReport['reset_jobs'] = [];
  const verified_checkpoints: string[] = [];
  const invalidated_checkpoints: string[] = [];
  const events: RecoveryReport['events'] = [];
  const record = (scope: string, targetId: string, event: string, detail: object = {}, jobId: string | null = null) => {
    logEvent(db, projectId, runId, scope, targetId, event, detail, jobId);
    events.push({ scope, target_id: targetId, event, detail });
  };

  return transaction(db, () => {
    const assetsRoot = join(project, 'assets');
    const indexedPaths = new Set(
      (db.prepare('SELECT path FROM assets WHERE project_id = ?').all(projectId) as { path: string }[])
        .map((r) => r.path.split(sep).join('/')),
    );

    // 1. Remove leftover temp files anywhere in assets/, and unindexed orphan files in managed render/bake dirs.
    for (const full of walkFiles(assetsRoot)) {
      const rel = relPosix(project, full);
      if (rel.endsWith('.tmp')) {
        rmSync(full, { force: true });
        removed_temp_files.push(rel);
        record('recovery', rel, 'temp_file_removed', { path: rel });
      } else {
        const folder = rel.split('/')[1] ?? '';
        if (MANAGED_PREFIXES.some((p) => folder.startsWith(p)) && !indexedPaths.has(rel)) {
          rmSync(full, { force: true });
          removed_orphan_files.push(rel);
          record('recovery', rel, 'orphan_file_removed', { path: rel });
        }
      }
    }

    // 2. Verify all non-invalidated render and bake assets against their recorded SHA-256 on disk.
    const rows = db.prepare(`SELECT a.asset_ref, a.name, a.version, a.kind, a.path, a.sha256, a.meta FROM assets a
      LEFT JOIN invalidated_assets inv ON inv.asset_ref = a.asset_ref
      WHERE a.project_id = ? AND inv.asset_ref IS NULL AND a.kind IN ('character-bake', 'render-shot', 'render-chapter', 'render-master')`)
      .all(projectId) as any[];
    const assets: AssetRow[] = rows.map((r) => ({ ...r, meta: JSON.parse(r.meta) }));
    const newlyInvalid = new Set<string>();
    for (const asset of assets) {
      if (!readAsset(project, asset)) {
        invalidateAsset(db, asset.asset_ref, 'corrupt_or_missing');
        newlyInvalid.add(asset.asset_ref);
        const target_id = String(asset.meta.target_id ?? asset.meta.shot_id ?? asset.name);
        corrupt_artifacts.push({ asset_ref: asset.asset_ref, kind: asset.kind, target_id, path: asset.path });
        record(asset.kind, target_id, 'artifact_corrupt', { asset_ref: asset.asset_ref, path: asset.path, expected_sha256: asset.sha256 });
      }
    }
    // Propagate invalidation from damaged bakes -> dependent shot renders -> chapters/masters.
    let changed = newlyInvalid.size > 0;
    while (changed) {
      changed = false;
      for (const asset of assets) {
        if (newlyInvalid.has(asset.asset_ref) || isAssetInvalid(db, asset.asset_ref)) continue;
        const deps: string[] = [
          ...(asset.meta.bake_asset_ref ? [asset.meta.bake_asset_ref] : []),
          ...(Array.isArray(asset.meta.shot_refs) ? asset.meta.shot_refs : []),
        ];
        if (deps.some((d) => newlyInvalid.has(d) || isAssetInvalid(db, d))) {
          invalidateAsset(db, asset.asset_ref, 'dependency_invalidated');
          newlyInvalid.add(asset.asset_ref);
          const target_id = String(asset.meta.target_id ?? asset.meta.shot_id ?? asset.name);
          record(asset.kind, target_id, 'artifact_dependency_invalidated', { asset_ref: asset.asset_ref });
          changed = true;
        }
      }
    }

    // 3. Reset interrupted RUNNING/QUEUED jobs and any SUCCEEDED job pointing at an invalidated artifact.
    const jobs = db.prepare('SELECT job_id, scope, target_id, state, body FROM render_jobs WHERE project_id = ?').all(projectId) as any[];
    for (const row of jobs) {
      const body = JSON.parse(row.body);
      const staleArtifact = row.state === 'SUCCEEDED' && (body.artifact_refs as string[]).some((ref) => isAssetInvalid(db, ref));
      if (row.state === 'RUNNING' || row.state === 'QUEUED' || staleArtifact) {
        body.state = 'FAILED';
        if (staleArtifact) body.artifact_refs = [];
        db.prepare('UPDATE render_jobs SET state = ?, body = ?, updated_at = ? WHERE job_id = ?')
          .run('FAILED', JSON.stringify(body), new Date().toISOString(), row.job_id);
        reset_jobs.push({ job_id: row.job_id, scope: row.scope, target_id: row.target_id, previous_state: row.state });
        record(row.scope, row.target_id, staleArtifact ? 'job_invalidated' : 'job_reset', { job_id: row.job_id, previous_state: row.state }, row.job_id);
      }
    }

    // 4. Verify the latest ChapterCheckpoint per chapter (both shot artifact hashes and continuity_state_hash).
    const chapterIds = (db.prepare('SELECT DISTINCT chapter_id FROM checkpoints WHERE project_id = ? ORDER BY chapter_id').all(projectId) as { chapter_id: string }[])
      .map((r) => r.chapter_id);
    for (const chapterId of chapterIds) {
      const row = db.prepare('SELECT body, continuity FROM checkpoints WHERE project_id = ? AND chapter_id = ? ORDER BY version DESC LIMIT 1')
        .get(projectId, chapterId) as { body: string; continuity: string } | undefined;
      if (!row) continue;
      const cp = JSON.parse(row.body);
      const continuity = JSON.parse(row.continuity);
      const continuityOk = requestHash(continuity) === cp.continuity_state_hash;
      const shotsOk = cp.completed_shots.every((s: any) => {
        if (isAssetInvalid(db, s.artifact_ref)) return false;
        const asset = getAsset(db, s.artifact_ref);
        return Boolean(asset && asset.sha256 === s.artifact_hash && readAsset(project, asset));
      });
      if (continuityOk && shotsOk) {
        verified_checkpoints.push(chapterId);
        record('chapter', chapterId, 'checkpoint_verified', { version: cp.version, completed: cp.completed_shots.length, pending: cp.pending_shot_ids.length });
      } else {
        invalidated_checkpoints.push(chapterId);
        record('chapter', chapterId, 'checkpoint_invalidated', { version: cp.version, continuity_ok: continuityOk, shots_ok: shotsOk });
      }
    }

    return { removed_temp_files, removed_orphan_files, corrupt_artifacts, reset_jobs, verified_checkpoints, invalidated_checkpoints, events };
  });
}

export function recoverOp(project: string, request: { project_id: string }): Outcome {
  const db = openStore(project);
  if (!getProject(db, request.project_id)) return summary(db, request.project_id, 'REJECTED', [{ code: 'PROJECT_NOT_FOUND', ref: request.project_id }]);
  const run_id = newId('rec');
  const recovery = reconcileRenderState(db, project, request.project_id, run_id);
  return summary(db, request.project_id, 'RECOVERED', [], { run_id, recovery });
}

function upsertRenderJob(db: Db, projectId: string, scope: 'shot' | 'chapter' | 'master', targetId: string,
  cacheKey: string, inputHashes: string[], currency: string, state: 'RUNNING' | 'SUCCEEDED' | 'FAILED', artifactRefs: string[]) {
  const key = `render:${scope}:${targetId}:${cacheKey.slice('sha256:'.length, 'sha256:'.length + 16)}`;
  const existing = db.prepare('SELECT job_id, version, attempt, body FROM render_jobs WHERE project_id = ? AND idempotency_key = ?')
    .get(projectId, key) as { job_id: string; version: number; attempt: number; body: string } | undefined;
  const now = new Date().toISOString();
  const job_id = existing?.job_id ?? newId('rjob');
  const version = existing ? existing.version + 1 : 1;
  const attempt = existing ? (state === 'RUNNING' ? existing.attempt + 1 : existing.attempt) : 1;
  const uniqueHashes = [...new Set(inputHashes)];
  const body = {
    project_id: projectId, version, job_id, scope, target_id: targetId, idempotency_key: key,
    input_hashes: uniqueHashes, provider: 'local-renderer', provider_job_id: null, state,
    cost_reservation: null, cost: { currency, estimated_minor: 0, actual_minor: 0 }, artifact_refs: artifactRefs, attempt,
  };
  if (existing) {
    db.prepare('UPDATE render_jobs SET version = ?, state = ?, attempt = ?, body = ?, updated_at = ? WHERE job_id = ?')
      .run(version, state, attempt, JSON.stringify(body), now, job_id);
  } else {
    db.prepare(`INSERT INTO render_jobs (job_id, project_id, version, scope, target_id, idempotency_key, cache_key, state, attempt, body, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(job_id, projectId, version, scope, targetId, key, cacheKey, state, attempt, JSON.stringify(body), now);
  }
  return body;
}

function saveCheckpoint(db: Db, projectId: string, chapter: any, inputSnapshotHash: string,
  completedShots: { shot_id: string; local_cache_key: string; artifact_ref: string; artifact_hash: string }[],
  pendingShotIds: string[], continuity: object) {
  const continuity_state_hash = requestHash(continuity);
  const latestCp = db.prepare('SELECT version, body, continuity FROM checkpoints WHERE project_id = ? AND chapter_id = ? ORDER BY version DESC LIMIT 1')
    .get(projectId, chapter.chapter_id) as { version: number; body: string; continuity: string } | undefined;
  if (latestCp) {
    const prev = JSON.parse(latestCp.body);
    if (prev.input_snapshot_hash === inputSnapshotHash && prev.continuity_state_hash === continuity_state_hash
      && JSON.stringify(prev.frame_range) === JSON.stringify(chapter.frame_range)
      && JSON.stringify(prev.completed_shots) === JSON.stringify(completedShots)
      && JSON.stringify(prev.pending_shot_ids) === JSON.stringify(pendingShotIds)) {
      return { checkpoint: prev, continuity: JSON.parse(latestCp.continuity) };
    }
  }
  const next = latestCp ? latestCp.version + 1 : 1;
  const body = {
    project_id: projectId, version: next, chapter_id: chapter.chapter_id, frame_range: chapter.frame_range,
    input_snapshot_hash: inputSnapshotHash, completed_shots: completedShots, pending_shot_ids: pendingShotIds, continuity_state_hash,
  };
  db.prepare(`INSERT INTO checkpoints (checkpoint_id, project_id, version, chapter_id, input_snapshot_hash, continuity_state_hash, body, continuity, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(newId('chk'), projectId, next, chapter.chapter_id, inputSnapshotHash, continuity_state_hash, JSON.stringify(body), JSON.stringify(continuity), new Date().toISOString());
  return { checkpoint: body, continuity };
}

interface CommitArtifactArgs {
  db: Db; project: string; projectId: string; runId: string; currency: string;
  scope: 'shot' | 'chapter' | 'master'; targetId: string; assetName: string; assetKind: string;
  cacheKey: string; inputHashes: string[]; expectedFrames: number; requireAudio?: boolean; fullDecode?: boolean;
  produce: (tmpFull: string) => void;
  meta: object; eventName: string; eventDetail: (asset: AssetRow) => object;
  afterIndexTx?: (asset: AssetRow) => void;
  faultTarget?: string;
}

// Unified 3-phase commit: reserve & mark RUNNING -> produce & probe temp file -> atomic rename -> index & mark SUCCEEDED.
function commitArtifact(args: CommitArtifactArgs): { issue: Issue } | { asset: AssetRow; job: any } {
  const { db, project, projectId, runId, currency, scope, targetId, assetName, assetKind, cacheKey, inputHashes } = args;
  const prep = transaction(db, () => {
    const job = upsertRenderJob(db, projectId, scope, targetId, cacheKey, inputHashes, currency, 'RUNNING', []);
    const target = reserveAssetTarget(db, project, projectId, assetName, 'mp4');
    logEvent(db, projectId, runId, scope, targetId, 'job_claimed', { cache_key: cacheKey, tmp: target.tmpPath, attempt: job.attempt }, job.job_id);
    return { job, target };
  });
  const tmpFull = join(project, prep.target.tmpPath), finalFull = join(project, prep.target.path);
  args.produce(tmpFull);
  const probed = probeVideo(tmpFull, Boolean(args.fullDecode));
  const videoOk = probed.ok && probed.video && probed.video.frames === args.expectedFrames
    && probed.video.codec_name === 'h264' && probed.video.pix_fmt === 'yuv420p';
  const audioOk = !args.requireAudio || Boolean(probed.ok && probed.audio && probed.audio.sample_rate === 48000 && probed.audio.codec_name === 'aac');
  if (!videoOk || !audioOk) {
    rmSync(tmpFull, { force: true });
    transaction(db, () => upsertRenderJob(db, projectId, scope, targetId, cacheKey, inputHashes, currency, 'FAILED', []));
    return { issue: { code: 'RENDER_VERIFY_FAILED', target_id: targetId, expected_frames: args.expectedFrames, decoded_frames: probed.ok ? (probed.video?.frames ?? 0) : 0 } };
  }
  const fileHash = sha256(readFileSync(tmpFull));
  if (args.faultTarget) stopHook(args.faultTarget, 'after_tmp_write');

  renameSync(tmpFull, finalFull);
  if (args.faultTarget) stopHook(args.faultTarget, 'after_rename');

  const committed = transaction(db, () => {
    const asset = indexAsset(db, projectId, assetName, prep.target.version, assetKind, prep.target.path, fileHash, args.meta);
    const job = upsertRenderJob(db, projectId, scope, targetId, cacheKey, inputHashes, currency, 'SUCCEEDED', [asset.asset_ref]);
    args.afterIndexTx?.(asset);
    logEvent(db, projectId, runId, scope, targetId, args.eventName, args.eventDetail(asset), job.job_id);
    return { asset, job };
  });
  if (args.faultTarget) stopHook(args.faultTarget, 'after_index');
  return committed;
}

export interface RenderRequest {
  project_id: string;
  scope: 'shot' | 'chapter' | 'master';
  target_id?: string;
  shot_ids?: string[];
  timeline_version?: number;
  plan_ref?: string | null;
  seed?: number;
}

export function renderOp(project: string, request: RenderRequest): Outcome {
  const started = Date.now();
  const db = openStore(project);
  const id = request.project_id;
  const reject = (issues: Issue[]) => summary(db, id, 'REJECTED', issues);
  const current = getProject(db, id);
  if (!current) return reject([{ code: 'PROJECT_NOT_FOUND', ref: id }]);
  if (!['shot', 'chapter', 'master'].includes(request.scope)) return reject([{ code: 'RENDER_SCOPE_INVALID', scope: request.scope }]);

  const timelineRow = latest(db, id, 'timeline', request.timeline_version);
  if (!timelineRow) return reject([{ code: 'TIMELINE_MISSING', timeline_version: request.timeline_version ?? null }]);
  const timelineDoc = timelineRow.document;
  const timeline = timelineDoc.timeline;
  const boardRow = latest(db, id, 'storyboard', timeline.storyboard_version)!;
  const storyboard = boardRow.document.storyboard;
  const dslByShot = new Map<string, any>(boardRow.document.dsl.shots.map((s: any) => [s.shot_id, s]));
  const pinnedAlign = getAsset(db, timeline.alignment_ref)!;
  const alignRow = latest(db, id, 'alignment', pinnedAlign.meta.alignment_version)!;
  const audioRow = latest(db, id, 'audio', alignRow.document.alignment.audio_version)!;
  const masterWavAsset = getAsset(db, audioRow.document.master_ref);
  const masterWavBytes = masterWavAsset && readAsset(project, masterWavAsset);
  if (!masterWavAsset || !masterWavBytes) return reject([{ code: 'ASSET_FILE_CHANGED', shot_id: 'master', asset_ref: audioRow.document.master_ref }]);

  const targetId = request.target_id ?? (request.scope === 'master' ? 'master' : '');
  const isSample = request.scope === 'master' && (targetId === 'sample' || Boolean(request.shot_ids?.length));

  // Formal full master in quality mode requires valid, non-stale G1/G2/G3 bound to the current timeline snapshot.
  if (current.mode === 'quality' && request.scope === 'master' && !isSample) {
    const gateIssues = requirementIssues(db, id, ['G1', 'G2', 'G3'], {});
    if (!gateIssues.some((i) => i.gate === 'G3')) {
      const sampleEvt = db.prepare("SELECT payload FROM events WHERE project_id = ? AND event = 'sample_rendered' ORDER BY version DESC LIMIT 1")
        .get(id) as { payload: string } | undefined;
      const samplePayload = sampleEvt ? JSON.parse(sampleEvt.payload) : null;
      if (samplePayload?.timeline_snapshot_hash && samplePayload.timeline_snapshot_hash !== timeline.input_snapshot_hash) {
        gateIssues.push({ code: 'APPROVAL_STALE', gate: 'G3', current_target_hash: timeline.input_snapshot_hash, approved_target_hash: samplePayload.artifact_hash });
      }
    }
    if (gateIssues.length) return reject(gateIssues);
  }

  // Select target shots in absolute timeline order.
  let selectedShots: any[] = [];
  if (request.scope === 'shot') {
    const found = timeline.shots.find((s: any) => s.shot_id === targetId);
    if (!found) return reject([{ code: 'RENDER_TARGET_UNKNOWN', scope: 'shot', target_id: targetId }]);
    selectedShots = [found];
  } else if (request.scope === 'chapter') {
    selectedShots = timeline.shots.filter((s: any) => s.chapter_id === targetId);
    if (!selectedShots.length) return reject([{ code: 'RENDER_TARGET_UNKNOWN', scope: 'chapter', target_id: targetId }]);
  } else if (request.shot_ids?.length) {
    const missing = request.shot_ids.filter((sid) => !timeline.shots.some((s: any) => s.shot_id === sid));
    if (missing.length) return reject(missing.map((sid) => ({ code: 'RENDER_TARGET_UNKNOWN', scope: 'shot', target_id: sid })));
    selectedShots = request.shot_ids.map((sid) => timeline.shots.find((s: any) => s.shot_id === sid));
  } else {
    selectedShots = timeline.shots;
  }

  // Resolve CharacterActionPlan if any selected shot has a character.
  const sbShotById = new Map<string, any>(storyboard.shots.map((s: any) => [s.shot_id, s]));
  const needsPlan = selectedShots.some((s) => sbShotById.get(s.shot_id)?.character_actions.length > 0);
  let plan: any = null, planAsset: AssetRow | undefined;
  if (request.plan_ref) {
    planAsset = getAsset(db, request.plan_ref);
    const bytes = planAsset?.kind === 'character-plan' ? readAsset(project, planAsset) : undefined;
    if (!bytes) return reject([{ code: 'PLAN_NOT_FOUND', plan_ref: request.plan_ref }]);
    if (planAsset!.meta.timeline_version !== timelineRow.version) {
      return reject([{ code: 'PLAN_TIMELINE_MISMATCH', plan_ref: request.plan_ref, plan_timeline_version: planAsset!.meta.timeline_version, timeline_version: timelineRow.version }]);
    }
    plan = JSON.parse(bytes.toString('utf8'));
  } else if (needsPlan) {
    const row = db.prepare(`SELECT asset_ref FROM assets WHERE project_id = ? AND kind = 'character-plan' AND json_extract(meta, '$.timeline_version') = ? ORDER BY version DESC LIMIT 1`)
      .get(id, timelineRow.version) as { asset_ref: string } | undefined;
    planAsset = row ? getAsset(db, row.asset_ref) : undefined;
    const bytes = planAsset && readAsset(project, planAsset);
    if (!bytes) return reject([{ code: 'PLAN_NOT_FOUND', plan_ref: null }]);
    plan = JSON.parse(bytes.toString('utf8'));
  }

  // Resolve subtitle style (color + hash pin).
  const styleRef: string = timelineDoc.subtitle_style_ref ?? alignRow.document.subtitles.style_ref;
  const styleAsset = getAsset(db, styleRef);
  const styleBytes = styleAsset ? readAsset(project, styleAsset) : undefined;
  const styleObj = styleBytes ? JSON.parse(styleBytes.toString('utf8')) : { color: '#FFFFFF' };
  const subtitleColor: Rgb = parseColor(styleObj.color) ?? [255, 255, 255];
  const stylePin = { asset_ref: styleRef, sha256: styleAsset?.sha256 ?? null, color: styleObj.color ?? '#FFFFFF' };

  const seed = request.seed ?? 7;
  if (!Number.isInteger(seed) || seed < 0) return reject([{ code: 'SEED_INVALID', seed }]);
  const currency = currentBudget(db, id)?.currency ?? 'CNY';
  const run_id = newId('run');

  // Always reconcile incomplete temps, unindexed orphans, corrupted artifacts and checkpoints before claiming work.
  const recovery = reconcileRenderState(db, project, id, run_id);

  // Verify every scene/layer asset in scope is present, unmodified and cleared.
  const pinIssues: Issue[] = [];
  const shotSceneData = new Map<string, { scene: any; sceneAsset: AssetRow; layers: { role: string; asset: AssetRow; bytes: Buffer }[] }>();
  for (const shot of selectedShots) {
    const sbShot = sbShotById.get(shot.shot_id)!;
    const sceneAsset = getAsset(db, sbShot.scene_ref);
    const sceneBytes = sceneAsset && readAsset(project, sceneAsset);
    if (!sceneAsset || !sceneBytes) { pinIssues.push({ code: 'ASSET_NOT_FOUND', shot_id: shot.shot_id, asset_ref: sbShot.scene_ref }); continue; }
    if (usageOf(db, sceneAsset.asset_ref) !== 'cleared') pinIssues.push({ code: 'ASSET_NOT_CLEARED', shot_id: shot.shot_id, asset_ref: sceneAsset.asset_ref, usage: usageOf(db, sceneAsset.asset_ref) });
    const scene = JSON.parse(sceneBytes.toString('utf8'));
    const layers: { role: string; asset: AssetRow; bytes: Buffer }[] = [];
    for (const layerRef of shot.layer_refs) {
      const lAsset = getAsset(db, layerRef);
      const lBytes = lAsset && readAsset(project, lAsset);
      if (!lAsset || !lBytes) { pinIssues.push({ code: 'ASSET_FILE_CHANGED', shot_id: shot.shot_id, asset_ref: layerRef }); continue; }
      const usage = usageOf(db, layerRef);
      if (usage !== 'cleared') pinIssues.push({ code: 'ASSET_NOT_CLEARED', shot_id: shot.shot_id, asset_ref: layerRef, usage });
      const role = scene.layers.find((l: any) => l.asset_ref === layerRef)?.role ?? lAsset.kind;
      layers.push({ role, asset: lAsset, bytes: lBytes });
    }
    shotSceneData.set(shot.shot_id, { scene, sceneAsset, layers });
  }
  if (pinIssues.length) return reject(pinIssues);

  const calls = {
    tts: 0, image: 0, video: 0,
    bake_executed: 0, bake_cached: 0,
    shot_rendered: 0, shot_cached: 0,
    chapter_assembled: 0, chapter_cached: 0,
    master_assembled: 0, master_cached: 0,
  };
  const render_jobs: any[] = [];
  const bakeResults = new Map<string, any>();
  const shotOutputs: any[] = [];
  const chaptersInScope = [...new Set(selectedShots.map((s) => s.chapter_id))];
  const completedByChapter = new Map<string, { shot_id: string; local_cache_key: string; artifact_ref: string; artifact_hash: string }[]>();
  const chapterShotIds = (chId: string) => selectedShots.filter((s) => s.chapter_id === chId).map((s) => s.shot_id);

  // 1. Render or reuse every shot in scope.
  for (const shot of selectedShots) {
    const sbShot = sbShotById.get(shot.shot_id)!;
    const dslShot = dslByShot.get(shot.shot_id)!;
    const zoom = dslShot.zoom ?? 1;
    const sceneInfo = shotSceneData.get(shot.shot_id)!;

    // Bake character sequentially (reusing T08 baker + cache) if this shot has a character in the plan.
    let bakeRes: any = null;
    if (sbShot.character_actions.length > 0 && plan) {
      const bakeIssues: Issue[] = [];
      const newlyBaked: any[] = [];
      bakeRes = transaction(db, () => ensureShotBake(db, project, id, timelineRow, plan, shot.shot_id, seed, bakeIssues, bakeResults, newlyBaked));
      if (bakeIssues.length || !bakeRes) return reject(bakeIssues.length ? bakeIssues : [{ code: 'BAKE_SHOT_NOT_IN_PLAN', shot_id: shot.shot_id, plan_ref: planAsset?.asset_ref ?? null }]);
      for (const item of newlyBaked) {
        if (item.cached) { calls.bake_cached += 1; logEvent(db, id, run_id, 'bake', item.shot_id, 'bake_reused', { cache_key: item.cache_key, asset_ref: item.asset_ref }); }
        else { calls.bake_executed += 1; logEvent(db, id, run_id, 'bake', item.shot_id, 'bake_executed', { cache_key: item.cache_key, asset_ref: item.asset_ref }); }
      }
    }

    // Local keys: project ONLY shot-local fields (no absolute_range, no timeline version, no full-program audio).
    const localSubs = localSubtitleSlices(alignRow.document.subtitles.cues, shot.absolute_range.start, shot.absolute_range.end);
    const visual_layer_key = requestHash({
      renderer: RENDERER, local_frames: shot.local_frames, camera: shot.camera, zoom,
      scene: { asset_ref: sceneInfo.sceneAsset.asset_ref, sha256: sceneInfo.sceneAsset.sha256 },
      layers: sceneInfo.layers.map((l) => ({ role: l.role, asset_ref: l.asset.asset_ref, sha256: l.asset.sha256 })),
      visual_cues: shot.visual_cues,
      character_bake: bakeRes ? { cache_key: bakeRes.cache_key, sha256: bakeRes.asset.sha256 } : null,
    });
    const local_cache_key = requestHash({
      renderer: RENDERER, local_frames: shot.local_frames, visual_layer_key,
      subtitle_style: localSubs.length ? stylePin : null, local_subtitles: localSubs,
    });

    const cachedAsset = validAssetByMeta(db, id, 'local_cache_key', local_cache_key);
    const cachedBytes = cachedAsset && readAsset(project, cachedAsset);
    let asset: AssetRow, cached = false, job: any;

    if (cachedAsset && cachedBytes && cachedAsset.meta.frame_count === shot.local_frames) {
      asset = cachedAsset;
      cached = true;
      calls.shot_cached += 1;
      job = transaction(db, () => {
        const j = upsertRenderJob(db, id, 'shot', shot.shot_id, local_cache_key, [local_cache_key], currency, 'SUCCEEDED', [asset.asset_ref]);
        logEvent(db, id, run_id, 'shot', shot.shot_id, 'cache_hit', { local_cache_key, asset_ref: asset.asset_ref }, j.job_id);
        return j;
      });
    } else {
      const bg = sceneInfo.layers.find((l) => l.role === 'background')!;
      const illus = sceneInfo.layers.find((l) => l.role === 'illustration');
      const diag = sceneInfo.layers.find((l) => l.role === 'diagram');
      const chapter = storyboard.chapters.find((c: any) => c.chapter_id === shot.chapter_id)!;
      const partialContinuity = {
        chapter_id: chapter.chapter_id, continuity_in: chapter.continuity_in, continuity_out: chapter.continuity_out,
        pose: bakeRes ? plan?.shots.find((p: any) => p.shot_id === shot.shot_id)?.exit_pose ?? null : null,
        stage_coordinates: sceneInfo.scene.coordinate_system, legend: sceneInfo.layers.filter((l) => l.role === 'diagram').map((l) => l.asset.asset_ref),
        sound_ref: audioRow.document.master_ref, inherited_end_state_hash: bakeRes?.trajectory.end_state_hash ?? null,
      };
      const committed = commitArtifact({
        db, project, projectId: id, runId: run_id, currency, scope: 'shot', targetId: shot.shot_id,
        assetName: `render_shot_${shot.shot_id}`, assetKind: 'render-shot', cacheKey: local_cache_key,
        inputHashes: [local_cache_key], expectedFrames: shot.local_frames, faultTarget: shot.shot_id,
        produce: (tmpFull) => renderShotMedia({
          outPath: tmpFull, localFrames: shot.local_frames, zoom, backgroundBytes: bg.bytes,
          illustrationBytes: illus?.bytes, diagramSpec: diag ? JSON.parse(diag.bytes.toString('utf8')) : undefined,
          visualCues: shot.visual_cues, character: bakeRes ? { rig: bakeRes.rig, trajectory: bakeRes.trajectory } : undefined,
          subtitles: localSubs, subtitleColor,
        }),
        meta: {
          target_id: shot.shot_id, shot_id: shot.shot_id, local_cache_key, visual_layer_key, frame_count: shot.local_frames,
          bake_asset_ref: bakeRes?.asset.asset_ref ?? null, bake_cache_key: bakeRes?.cache_key ?? null,
        },
        eventName: 'shot_indexed',
        eventDetail: (a) => ({ local_cache_key, asset_ref: a.asset_ref, sha256: a.sha256 }),
        afterIndexTx: (a) => {
          const list = completedByChapter.get(shot.chapter_id) ?? [];
          const nextCompleted = [...list, { shot_id: shot.shot_id, local_cache_key, artifact_ref: a.asset_ref, artifact_hash: a.sha256 }];
          const doneSet = new Set(nextCompleted.map((x) => x.shot_id));
          const pendingIds = chapterShotIds(shot.chapter_id).filter((sid) => !doneSet.has(sid));
          saveCheckpoint(db, id, chapter, timeline.input_snapshot_hash, nextCompleted, pendingIds, partialContinuity);
        },
      });
      if ('issue' in committed) return reject([committed.issue]);
      asset = committed.asset;
      job = committed.job;
      calls.shot_rendered += 1;
    }

    render_jobs.push(job);
    const layerRefs = [...shot.layer_refs, ...(bakeRes ? [bakeRes.asset.asset_ref] : []), ...(styleAsset ? [styleAsset.asset_ref] : [])];
    const shot_artifacts = {
      project_id: id, version: asset.version, job_id: job.job_id, scope: 'shot' as const, target_id: shot.shot_id,
      media_ref: asset.asset_ref, layer_refs: layerRefs, content_hash: asset.sha256, frame_count: shot.local_frames,
    };
    const out = {
      shot_id: shot.shot_id, chapter_id: shot.chapter_id, absolute_range: shot.absolute_range, local_frames: shot.local_frames,
      visual_layer_key, local_cache_key, bake_cache_key: bakeRes?.cache_key ?? null, bake_asset_ref: bakeRes?.asset.asset_ref ?? null,
      end_state_hash: bakeRes?.trajectory.end_state_hash ?? null,
      artifact_ref: asset.asset_ref, path: asset.path, sha256: asset.sha256, cached, shot_artifacts,
    };
    shotOutputs.push(out);
    const list = completedByChapter.get(shot.chapter_id) ?? [];
    list.push({ shot_id: shot.shot_id, local_cache_key, artifact_ref: asset.asset_ref, artifact_hash: asset.sha256 });
    completedByChapter.set(shot.chapter_id, list);
  }

  // 2. Assemble chapters and persist verified ChapterCheckpoints (with boundary continuity snapshots).
  const chapterOutputs: any[] = [];
  if (request.scope === 'chapter' || (request.scope === 'master' && !isSample)) {
    for (const chId of chaptersInScope) {
      const chapter = storyboard.chapters.find((c: any) => c.chapter_id === chId)!;
      const chShots = shotOutputs.filter((s) => s.chapter_id === chId);
      const completed = completedByChapter.get(chId) ?? [];
      const lastHost = [...chShots].reverse().find((s) => s.end_state_hash);
      const lastScene = shotSceneData.get(chShots.at(-1)!.shot_id)!;
      const legend = [...new Set(chShots.flatMap((s) => shotSceneData.get(s.shot_id)!.layers.filter((l) => l.role === 'diagram').map((l) => l.asset.asset_ref)))];
      const continuity = {
        chapter_id: chId, continuity_in: chapter.continuity_in, continuity_out: chapter.continuity_out,
        pose: lastHost ? plan?.shots.find((p: any) => p.shot_id === lastHost.shot_id)?.exit_pose ?? null : null,
        stage_coordinates: lastScene.scene.coordinate_system, legend,
        sound_ref: audioRow.document.master_ref, inherited_end_state_hash: lastHost?.end_state_hash ?? null,
      };
      const continuity_state_hash = requestHash(continuity);
      const chFrames = chShots.reduce((sum, s) => sum + s.local_frames, 0);
      const chapter_cache_key = requestHash({
        scope: 'chapter', chapter_id: chId, frame_range: chapter.frame_range, continuity_state_hash,
        ordered_shots: chShots.map((s) => ({ shot_id: s.shot_id, local_cache_key: s.local_cache_key, sha256: s.sha256 })),
      });
      const cachedCh = validAssetByMeta(db, id, 'chapter_cache_key', chapter_cache_key);
      const cachedChBytes = cachedCh && readAsset(project, cachedCh);
      let chAsset: AssetRow, chCached = false, chJob: any;

      if (cachedCh && cachedChBytes && cachedCh.meta.frame_count === chFrames) {
        chAsset = cachedCh;
        chCached = true;
        calls.chapter_cached += 1;
        chJob = transaction(db, () => {
          const j = upsertRenderJob(db, id, 'chapter', chId, chapter_cache_key, [chapter_cache_key, timeline.input_snapshot_hash], currency, 'SUCCEEDED', [chAsset.asset_ref]);
          logEvent(db, id, run_id, 'chapter', chId, 'cache_hit', { chapter_cache_key, asset_ref: chAsset.asset_ref }, j.job_id);
          return j;
        });
      } else {
        const committed = commitArtifact({
          db, project, projectId: id, runId: run_id, currency, scope: 'chapter', targetId: chId,
          assetName: `render_chapter_${chId}`, assetKind: 'render-chapter', cacheKey: chapter_cache_key,
          inputHashes: [chapter_cache_key, timeline.input_snapshot_hash], expectedFrames: chFrames,
          produce: (tmpFull) => assembleVideo(chShots.map((s) => join(project, s.path)), tmpFull),
          meta: { target_id: chId, chapter_id: chId, chapter_cache_key, frame_count: chFrames, shot_refs: chShots.map((s) => s.artifact_ref) },
          eventName: 'chapter_checkpointed',
          eventDetail: (a) => ({ chapter_cache_key, asset_ref: a.asset_ref, continuity_state_hash }),
        });
        if ('issue' in committed) return reject([committed.issue]);
        chAsset = committed.asset;
        chJob = committed.job;
        calls.chapter_assembled += 1;
      }
      const savedCp = transaction(db, () => saveCheckpoint(db, id, chapter, timeline.input_snapshot_hash, completed, [], continuity));
      render_jobs.push(chJob);
      chapterOutputs.push({ chapter_id: chId, chapter_cache_key, checkpoint: savedCp.checkpoint, continuity: savedCp.continuity,
        artifact_ref: chAsset.asset_ref, path: chAsset.path, sha256: chAsset.sha256, cached: chCached });
    }
  }

  // 3. Assemble final master (or representative sample) once, mixing and encoding 48 kHz AAC audio in a single pass.
  let masterOutput: any = null;
  if (request.scope === 'master') {
    const totalOutFrames = shotOutputs.reduce((sum, s) => sum + s.local_frames, 0);
    const frameRanges = shotOutputs.map((s) => s.absolute_range);
    const assembly_cache_key = requestHash({
      scope: 'master', target_id: targetId, output_spec: DEFAULT_OUTPUT_SPEC, total_frames: totalOutFrames,
      ordered_shots: shotOutputs.map((s) => ({ shot_id: s.shot_id, absolute_range: s.absolute_range, local_cache_key: s.local_cache_key, sha256: s.sha256 })),
      audio: { asset_ref: masterWavAsset.asset_ref, sha256: masterWavAsset.sha256 },
      subtitles: alignRow.document.srt_ref,
    });
    const render_shot_input = {
      scope: 'master' as const, target_id: targetId,
      timeline_ref: timelineDoc.timeline_ref ?? `asset://${id}/timeline/v${timelineRow.version}`,
      input_refs: [...shotOutputs.map((s) => s.artifact_ref), masterWavAsset.asset_ref, ...(planAsset ? [planAsset.asset_ref] : [])],
      output_spec: DEFAULT_OUTPUT_SPEC,
    };
    const cachedM = validAssetByMeta(db, id, 'assembly_cache_key', assembly_cache_key);
    const cachedMBytes = cachedM && readAsset(project, cachedM);
    let mAsset: AssetRow, mCached = false, mJob: any;

    if (cachedM && cachedMBytes && cachedM.meta.frame_count === totalOutFrames) {
      mAsset = cachedM;
      mCached = true;
      calls.master_cached += 1;
      mJob = transaction(db, () => {
        const j = upsertRenderJob(db, id, 'master', targetId, assembly_cache_key, [assembly_cache_key, timeline.input_snapshot_hash], currency, 'SUCCEEDED', [mAsset.asset_ref]);
        logEvent(db, id, run_id, 'master', targetId, 'cache_hit', { assembly_cache_key, asset_ref: mAsset.asset_ref }, j.job_id);
        return j;
      });
    } else {
      const committed = commitArtifact({
        db, project, projectId: id, runId: run_id, currency, scope: 'master', targetId,
        assetName: isSample ? 'render_sample' : 'render_master', assetKind: 'render-master', cacheKey: assembly_cache_key,
        inputHashes: [assembly_cache_key, timeline.input_snapshot_hash], expectedFrames: totalOutFrames,
        requireAudio: true, fullDecode: true,
        produce: (tmpFull) => assembleMaster(shotOutputs.map((s) => join(project, s.path)), masterWavBytes, frameRanges, tmpFull),
        meta: {
          target_id: targetId, assembly_cache_key, frame_count: totalOutFrames, shot_refs: shotOutputs.map((s) => s.artifact_ref),
          timeline_version: timelineRow.version, input_snapshot_hash: timeline.input_snapshot_hash,
        },
        eventName: 'master_assembled',
        eventDetail: (a) => ({ assembly_cache_key, asset_ref: a.asset_ref, frame_count: totalOutFrames }),
      });
      if ('issue' in committed) return reject([committed.issue]);
      mAsset = committed.asset;
      mJob = committed.job;
      calls.master_assembled += 1;
    }
    render_jobs.push(mJob);
    const shot_artifacts = {
      project_id: id, version: mAsset.version, job_id: mJob.job_id, scope: 'master' as const, target_id: targetId,
      media_ref: mAsset.asset_ref, layer_refs: [...shotOutputs.map((s) => s.artifact_ref), masterWavAsset.asset_ref],
      content_hash: mAsset.sha256, frame_count: totalOutFrames,
    };
    masterOutput = {
      target_id: targetId, assembly_cache_key, artifact_ref: mAsset.asset_ref, path: mAsset.path, sha256: mAsset.sha256,
      frame_count: totalOutFrames, duration_seconds: totalOutFrames / FPS, cached: mCached, shot_artifacts, render_shot_input,
    };
  }

  const allCached = calls.bake_executed === 0 && calls.shot_rendered === 0 && calls.chapter_assembled === 0 && calls.master_assembled === 0;
  const primaryRef = masterOutput?.artifact_ref ?? chapterOutputs.at(-1)?.artifact_ref ?? shotOutputs.at(-1)!.artifact_ref;
  const primaryJob = render_jobs.at(-1)!.job_id;
  return summary(db, id, allCached ? 'CACHED' : 'RENDERED', [], {
    run_id, timeline_version: timelineRow.version, input_snapshot_hash: timeline.input_snapshot_hash,
    elapsed_ms: Date.now() - started, calls, recovery, shots: shotOutputs, chapters: chapterOutputs, master: masterOutput, render_jobs,
    tool_result: {
      status: 'succeeded', job_id: primaryJob, artifact_refs: [primaryRef], warnings: [],
      cost: { currency, estimated_minor: 0, actual_minor: 0 }, retryable: false, next_action: isSample ? 'review' : 'continue',
    },
  });
}
