// Three-level QA (preflight geometry & mid-motion caption collision, per-frame visual & audio media inspection,
// 12-cell timecoded contact sheet & 20–30 s audible sample), delivery targets, Studio navigation, and A11 A/B review (T10).
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { humanSession } from './approvals.ts';
import {
  ASSET_NAME, SAFE_AREA, getAsset, preflightShots, readAsset, registerAsset,
} from './assets.ts';
import { localSubtitleSlices } from './compiler.ts';
import { latest } from './content.ts';
import { currentBudget } from './ledger.ts';
import { type Db, type Issue, type Outcome, getProject, newId, openStore, summary, transaction } from './project-store.ts';
import { renderOp } from './render.ts';
import { FPS, RATE, SAMPLES_PER_FRAME } from './timebase.ts';
import {
  DEFAULT_MEDIA_SPEC, type DeclaredHold, INSPECTOR, type ShotWindow,
  analyzeAudio, buildContactSheet, extractFramePng,
  inspectTechnical, locateShot, measureIsolatedVoice, renderWaveformPng, scanVideoFrames,
} from '../tools/inspect_media/adapter.ts';
import { CAPTION_BOX_NORM, type NormBox, interpolateBox } from '../tools/render_shot/adapter.ts';

const RUBRIC_ITEMS = ['identity_continuity', 'av_sync', 'diagram_accuracy', 'mobile_legibility', 'cut_pacing'] as const;
const VERDICTS = new Set(['improved', 'unchanged', 'regressed']);
const REGRESSION_ACTIONS = new Set(['required_fix', 'accepted_with_reason']);
const AUDIO_TECH_CODES = new Set(['AUDIO_TRACK', 'AUDIO_CODEC', 'SAMPLE_RATE', 'AUDIO_SPAN', 'AUDIO_GAP']);
const EXPORT_TECH_CODES = new Set(['CONTAINER', 'DURATION_PROFILE', 'TARGET_FRAMES', 'INPUT_FILE', 'INPUT_CHANGED', 'DECODE', 'FFPROBE_UNAVAILABLE']);

function boxOverlap(a: NormBox, b: NormBox) {
  const x0 = Math.max(a.left, b.left), y0 = Math.max(a.top, b.top);
  const x1 = Math.min(a.right, b.right), y1 = Math.min(a.bottom, b.bottom);
  const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
  const inter = w * h;
  if (inter <= 0) return { area: 0, iou: 0 };
  const areaA = Math.max(0, a.right - a.left) * Math.max(0, a.bottom - a.top);
  const areaB = Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
  const union = areaA + areaB - inter;
  return { area: inter, iou: union > 0 ? Number((inter / union).toFixed(4)) : 0 };
}

function scaleBox(box: NormBox, zoom: number): NormBox {
  const s = (v: number) => 0.5 + (v - 0.5) * zoom;
  return { left: s(box.left), top: s(box.top), right: s(box.right), bottom: s(box.bottom) };
}

// Select contiguous representative shots totaling 20–30 s (600–900 frames), or all shots when the timeline is <= 30 s.
function selectSampleShots(timelineShots: any[], requested?: string[]): string[] {
  if (requested?.length) return requested;
  const total = timelineShots.reduce((s, sh) => s + sh.local_frames, 0);
  if (total <= 30 * FPS) return timelineShots.map((s) => s.shot_id);
  const minF = 20 * FPS, maxF = 30 * FPS;
  let best: string[] = [];
  for (let i = 0; i < timelineShots.length; i += 1) {
    let sum = 0;
    const pick: string[] = [];
    for (let j = i; j < timelineShots.length; j += 1) {
      sum += timelineShots[j].local_frames;
      pick.push(timelineShots[j].shot_id);
      if (sum >= minF && sum <= maxF) return pick;
      if (sum > maxF) break;
    }
    if (pick.length > best.length) best = pick;
  }
  return best.length ? best : [timelineShots[0].shot_id];
}

export interface DeliveryTargetRequest {
  project_id: string;
  target_id: string;
  version: string;
  lufs_min: number;
  lufs_max: number;
  max_true_peak_dbtp: number;
  notes?: string;
}

export function targetOp(project: string, request: DeliveryTargetRequest): Outcome {
  const db = openStore(project);
  const id = request.project_id;
  return transaction(db, () => {
    const reject = (issue: Issue) => summary(db, id, 'REJECTED', [issue]);
    if (!getProject(db, id)) return reject({ code: 'PROJECT_NOT_FOUND', ref: id });
    if (!ASSET_NAME.test(request.target_id ?? '') || !request.version
      || typeof request.lufs_min !== 'number' || typeof request.lufs_max !== 'number'
      || request.lufs_min >= request.lufs_max || typeof request.max_true_peak_dbtp !== 'number') {
      return reject({ code: 'DELIVERY_TARGET_INVALID', target_id: request.target_id ?? null });
    }
    const existing = db.prepare('SELECT * FROM delivery_targets WHERE project_id = ? AND target_id = ? AND version = ?')
      .get(id, request.target_id, request.version) as any;
    const now = new Date().toISOString();
    if (!existing) {
      db.prepare(`INSERT INTO delivery_targets (row_id, project_id, target_id, version, lufs_min, lufs_max, max_true_peak_dbtp, notes, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        newId('tgt'), id, request.target_id, request.version,
        request.lufs_min, request.lufs_max, request.max_true_peak_dbtp, request.notes ?? '', now,
      );
    }
    const targets = db.prepare('SELECT target_id, version, lufs_min, lufs_max, max_true_peak_dbtp, notes, recorded_at FROM delivery_targets WHERE project_id = ? ORDER BY recorded_at')
      .all(id);
    return summary(db, id, existing ? 'REPLAYED' : 'REGISTERED', [], { targets });
  });
}

export interface QaRequest {
  project_id: string;
  scope?: 'sample' | 'final' | 'shot';
  media_ref?: string;
  render_sample?: boolean;
  shot_ids?: string[];
  timeline_version?: number;
  plan_ref?: string | null;
  seed?: number;
  profile?: string;
  target_seconds?: number;
  freeze_threshold_frames?: number;
  silence_threshold_frames?: number;
}

export function qaOp(project: string, request: QaRequest): Outcome {
  const db = openStore(project);
  const id = request.project_id;
  const reject = (issues: Issue[]) => summary(db, id, 'REJECTED', issues);
  const projectRow = getProject(db, id);
  if (!projectRow) return reject([{ code: 'PROJECT_NOT_FOUND', ref: id }]);
  const scope = request.scope ?? 'sample';
  if (!['sample', 'final', 'shot'].includes(scope)) return reject([{ code: 'QA_SCOPE_INVALID', scope }]);
  for (const field of ['freeze_threshold_frames', 'silence_threshold_frames'] as const) {
    const value = request[field];
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) return reject([{ code: 'QA_THRESHOLD_INVALID', field, value: String(value) }]);
  }

  const timelineRow = latest(db, id, 'timeline', request.timeline_version);
  if (!timelineRow) return reject([{ code: 'TIMELINE_MISSING', timeline_version: request.timeline_version ?? null }]);
  const timelineDoc = timelineRow.document;
  const timeline = timelineDoc.timeline;
  const boardRow = latest(db, id, 'storyboard', timeline.storyboard_version)!;
  const storyboard = boardRow.document.storyboard;
  const dslByShot = new Map<string, any>(boardRow.document.dsl.shots.map((s: any) => [s.shot_id, s]));
  const sbByShot = new Map<string, any>(storyboard.shots.map((s: any) => [s.shot_id, s]));
  const pinnedAlign = getAsset(db, timeline.alignment_ref)!;
  const alignRow = latest(db, id, 'alignment', pinnedAlign.meta.alignment_version)!;
  const audioRow = latest(db, id, 'audio', alignRow.document.alignment.audio_version)!;
  const scriptRow = latest(db, id, 'script', storyboard.script_version);
  const evidenceRow = latest(db, id, 'evidence');

  // Optional: render a representative 20–30 s audible sample first.
  let mediaRef = request.media_ref ?? null;
  let sampleInfo: Record<string, unknown> | null = null;
  let activeShotIds = request.shot_ids;
  if (request.render_sample) {
    activeShotIds = selectSampleShots(timeline.shots, request.shot_ids);
    const rendered = renderOp(project, {
      project_id: id, scope: 'master', target_id: 'sample', shot_ids: activeShotIds,
      timeline_version: timelineRow.version, plan_ref: request.plan_ref, seed: request.seed ?? 7,
    });
    if (rendered.exitCode !== 0) return rendered;
    const m = rendered.report.master as any;
    mediaRef = m.artifact_ref;
    sampleInfo = {
      artifact_ref: m.artifact_ref, path: m.path, sha256: m.sha256,
      frame_count: m.frame_count, duration_seconds: m.duration_seconds,
      shot_ids: activeShotIds, input_snapshot_hash: rendered.report.input_snapshot_hash,
    };
  }
  if (!mediaRef) return reject([{ code: 'QA_MEDIA_REQUIRED', project_id: id }]);

  const mediaAsset = getAsset(db, mediaRef);
  const mediaBytes = mediaAsset && readAsset(project, mediaAsset);
  if (!mediaAsset || !mediaBytes) return reject([{ code: 'ASSET_NOT_FOUND', shot_id: 'master', asset_ref: mediaRef }]);
  const mediaPath = join(project, mediaAsset.path);

  // Determine shots covered by this inspected clip and build their contiguous windows in clip coordinates.
  let scopedShots: any[] = activeShotIds?.length
    ? activeShotIds.map((sid) => timeline.shots.find((s: any) => s.shot_id === sid)).filter(Boolean)
    : timeline.shots;
  if (!activeShotIds?.length && Array.isArray(mediaAsset.meta?.shot_refs)) {
    const byShotRef = mediaAsset.meta.shot_refs.map((ref: string) => getAsset(db, ref)?.meta?.shot_id).filter(Boolean);
    if (byShotRef.length) {
      const matched = byShotRef.map((sid: string) => timeline.shots.find((s: any) => s.shot_id === sid)).filter(Boolean);
      if (matched.length) scopedShots = matched;
    }
  }
  let cursor = 0;
  const shotWindows: (ShotWindow & { original_range: { start: number; end: number }; local_frames: number })[] = scopedShots.map((sh) => {
    const win = {
      shot_id: sh.shot_id, chapter_id: sh.chapter_id,
      frame_range: { start: cursor, end: cursor + sh.local_frames },
      original_range: sh.absolute_range, local_frames: sh.local_frames,
    };
    cursor += sh.local_frames;
    return win;
  });
  const winByShot = new Map(shotWindows.map((w) => [w.shot_id, w]));

  // Declared reading holds come only from the storyboard DSL; a QA request cannot add its own.
  const declaredHolds: DeclaredHold[] = [];
  for (const w of shotWindows) {
    const dsl = dslByShot.get(w.shot_id);
    for (const h of dsl?.holds ?? []) {
      if (h?.local_range && h?.reason) {
        declaredHolds.push({
          shot_id: w.shot_id,
          frame_range: { start: w.frame_range.start + h.local_range.start, end: w.frame_range.start + h.local_range.end },
          kind: h.kind ?? 'static',
          reason: h.reason,
        });
      }
    }
  }

  // ---- Level 2: Run technical + per-frame visual + audio inspection first so we know real media hash & frames.
  const technical = inspectTechnical(mediaPath, DEFAULT_MEDIA_SPEC, request.profile, request.target_seconds);
  const targetHash = technical.media_hash ?? mediaAsset.sha256;
  const inspectedFrames = Number(technical.observed.frames ?? 0);
  const canDecodeVideo = !technical.issues.includes('DECODE') && !technical.issues.includes('INPUT_FILE');
  // A request may tighten the policy thresholds but never loosen them.
  const freezeThreshold = Math.min(request.freeze_threshold_frames ?? 60, 60);
  const silenceThreshold = Math.min(request.silence_threshold_frames ?? 30, 30);
  const visual = canDecodeVideo
    ? scanVideoFrames(mediaPath, shotWindows, declaredHolds, freezeThreshold)
    : { ok: false as const, frame_count: 0, flashes: [], blacks: [], freezes: [], declared_holds: [], motion_heatmap: { per_second: [], mean_mad: 0 } };
  const hasAudio = canDecodeVideo && !technical.issues.includes('AUDIO_TRACK');
  const audio = hasAudio
    ? analyzeAudio(mediaPath, inspectedFrames, shotWindows, declaredHolds, silenceThreshold)
    : { ok: false as const, loudness: null, frames: [], silence_ranges: [] };

  // Measure isolated voice WAV over the inspected shot intervals (A10 §4).
  const masterWavAsset = getAsset(db, audioRow.document.master_ref);
  const masterWavBytes = masterWavAsset && readAsset(project, masterWavAsset);
  const measuredIntervals = shotWindows.map((w) => ({
    shot_id: w.shot_id,
    clip_frame_range: w.frame_range,
    master_frame_range: w.original_range,
    master_sample_range: { start: w.original_range.start * SAMPLES_PER_FRAME, end: w.original_range.end * SAMPLES_PER_FRAME },
  }));
  const isolatedVoice = masterWavBytes
    ? measureIsolatedVoice(masterWavBytes, shotWindows.map((w) => w.original_range))
    : null;

  // ---- Collect QA issues, evidence assets, bounding boxes, and CLI diagnostic codes.
  const qaIssues: {
    issue_id: string; target_id: string; frame_range: { start: number; end: number } | null;
    severity: 'blocking' | 'review' | 'info';
    category: 'structure' | 'visual' | 'continuity' | 'audio' | 'facts' | 'export';
    message: string; evidence_refs: string[];
  }[] = [];
  const cliIssues: Issue[] = [];
  const inspectedRefs = new Set<string>([mediaRef, timeline.alignment_ref, audioRow.document.master_ref]);
  const defectFrameRefs = new Map<number, string>();
  const bounding_boxes: {
    shot_id: string; element_id: string; frame_range: { start: number; end: number };
    peak_overlap_frame: number; element_box: NormBox; caption_box: NormBox; iou: number;
  }[] = [];

  let issueSeq = 1;
  const nextIssueId = () => `qa_${String(issueSeq++).padStart(3, '0')}`;

  // Helper to extract & register a defect frame PNG once per frame index.
  const pendingDefectFrames = new Map<number, Buffer>();
  const ensureDefectFrame = (frameIndex: number): string | null => {
    if (!canDecodeVideo || frameIndex < 0 || frameIndex >= inspectedFrames) return null;
    if (!pendingDefectFrames.has(frameIndex)) {
      const png = extractFramePng(mediaPath, frameIndex);
      if (png) pendingDefectFrames.set(frameIndex, png);
    }
    return pendingDefectFrames.has(frameIndex) ? `__frame_${frameIndex}` : null;
  };

  // ---- Level 1: Preflight geometry, references, mid-motion caption collisions, and facts.
  const preflightReqs = scopedShots.map((sh) => {
    const sb = sbByShot.get(sh.shot_id)!;
    const dsl = dslByShot.get(sh.shot_id)!;
    inspectedRefs.add(sb.scene_ref);
    return {
      shot_id: sh.shot_id,
      scene_ref: sb.scene_ref,
      camera: { zoom: dsl?.zoom ?? 1 },
      character: sb.character_actions?.[0],
    };
  });
  const pre = preflightShots(db, project, id, preflightReqs);
  for (const issue of pre.issues) {
    const targetId = String(issue.shot_id ?? 'master');
    const win = winByShot.get(targetId);
    qaIssues.push({
      issue_id: nextIssueId(),
      target_id: ASSET_NAME.test(targetId) ? targetId : 'master',
      frame_range: win ? win.frame_range : null,
      severity: 'blocking',
      category: issue.code === 'COVERAGE_INSUFFICIENT' || issue.code === 'ELEMENT_OUTSIDE_SAFE_AREA' ? 'visual' : 'structure',
      message: `${issue.code}: ${issue.asset_ref ?? targetId}`,
      evidence_refs: issue.asset_ref ? [String(issue.asset_ref)] : [mediaRef],
    });
    cliIssues.push(issue);
  }

  // Mid-motion geometry & caption safe-area collision check across every local frame of every diagram element.
  for (const w of shotWindows) {
    const sb = sbByShot.get(w.shot_id)!;
    const dsl = dslByShot.get(w.shot_id)!;
    const zoom = dsl?.zoom ?? 1;
    const sceneAsset = getAsset(db, sb.scene_ref);
    const sceneBytes = sceneAsset && readAsset(project, sceneAsset);
    if (!sceneBytes) continue;
    const scene = JSON.parse(sceneBytes.toString('utf8'));
    const localSubs = localSubtitleSlices(alignRow.document.subtitles.cues, w.original_range.start, w.original_range.end);

    for (const layer of scene.layers ?? []) {
      const lAsset = getAsset(db, layer.asset_ref);
      if (!lAsset || lAsset.kind !== 'diagram') continue;
      inspectedRefs.add(lAsset.asset_ref);
      const lBytes = readAsset(project, lAsset);
      if (!lBytes) continue;
      const spec = JSON.parse(lBytes.toString('utf8'));
      for (const el of spec.elements ?? []) {
        let colStart = -1, colEnd = -1, peakFrame = -1, peakIou = 0;
        let peakBox: NormBox | null = null;
        let safeStart = -1, safeEnd = -1;
        for (let lf = 0; lf < w.local_frames; lf += 1) {
          const box = scaleBox(interpolateBox(el, lf), zoom);
          const outside = box.left < SAFE_AREA.left || box.top < SAFE_AREA.top || box.right > SAFE_AREA.right || box.bottom > SAFE_AREA.bottom;
          if (outside) {
            if (safeStart < 0) safeStart = lf;
            safeEnd = lf + 1;
          }
          const subActive = localSubs.some((s) => lf >= s.start && lf < s.end);
          if (subActive) {
            const ov = boxOverlap(box, CAPTION_BOX_NORM);
            if (ov.area > 0) {
              if (colStart < 0) colStart = lf;
              colEnd = lf + 1;
              if (ov.iou > peakIou) { peakIou = ov.iou; peakFrame = lf; peakBox = box; }
            }
          }
        }
        if (colStart >= 0 && peakBox) {
          const absRange = { start: w.frame_range.start + colStart, end: w.frame_range.start + colEnd };
          const absPeak = w.frame_range.start + peakFrame;
          bounding_boxes.push({
            shot_id: w.shot_id, element_id: el.element_id, frame_range: absRange,
            peak_overlap_frame: absPeak, element_box: peakBox, caption_box: CAPTION_BOX_NORM, iou: peakIou,
          });
          const fToken = ensureDefectFrame(absPeak);
          qaIssues.push({
            issue_id: nextIssueId(), target_id: w.shot_id, frame_range: absRange,
            severity: 'blocking', category: 'visual',
            message: `CAPTION_COLLISION: element ${el.element_id} overlaps active caption at frames [${absRange.start}, ${absRange.end}) (peak frame ${absPeak}, iou ${peakIou})`,
            evidence_refs: fToken ? [fToken, lAsset.asset_ref] : [lAsset.asset_ref],
          });
          cliIssues.push({ code: 'CAPTION_COLLISION', shot_id: w.shot_id, element_id: el.element_id, start: absRange.start, end: absRange.end, peak_frame: absPeak });
        } else if (safeStart >= 0 && el.motion?.keyframes?.length) {
          const absRange = { start: w.frame_range.start + safeStart, end: w.frame_range.start + safeEnd };
          const fToken = ensureDefectFrame(absRange.start);
          qaIssues.push({
            issue_id: nextIssueId(), target_id: w.shot_id, frame_range: absRange,
            severity: 'blocking', category: 'visual',
            message: `ELEMENT_OUTSIDE_SAFE_AREA: moving element ${el.element_id} leaves safe area at frames [${absRange.start}, ${absRange.end})`,
            evidence_refs: fToken ? [fToken, lAsset.asset_ref] : [lAsset.asset_ref],
          });
          cliIssues.push({ code: 'ELEMENT_OUTSIDE_SAFE_AREA', shot_id: w.shot_id, asset_ref: lAsset.asset_ref, element_id: el.element_id });
        }
      }
    }
  }

  // Fact trace check on cited claims (Level 1 facts).
  if (scriptRow && evidenceRow) {
    const claims = new Map<string, any>((evidenceRow.document.claims ?? []).map((c: any) => [c.claim_id, c]));
    const sectionIds = new Set(scopedShots.map((sh) => sbByShot.get(sh.shot_id)?.section_id));
    for (const sec of scriptRow.document.sections ?? []) {
      if (!sectionIds.has(sec.section_id)) continue;
      for (const cid of sec.claim_ids ?? []) {
        const claim = claims.get(cid);
        if (!claim || claim.status !== 'supported') {
          qaIssues.push({
            issue_id: nextIssueId(), target_id: sec.section_id, frame_range: null,
            severity: 'blocking', category: 'facts',
            message: `CLAIM_${claim ? claim.status.toUpperCase() : 'UNKNOWN'}: claim ${cid} in ${sec.section_id} is not supported`,
            evidence_refs: [mediaRef],
          });
          cliIssues.push({ code: claim?.status === 'disputed' ? 'CLAIM_DISPUTED' : 'CLAIM_UNSUPPORTED', section_id: sec.section_id, claim_id: cid });
        }
      }
    }
  }

  // ---- Level 2 issues: technical checks, visual anomalies, declared holds, audio silence & delivery targets.
  for (const code of technical.issues) {
    const category = AUDIO_TECH_CODES.has(code) ? 'audio' : EXPORT_TECH_CODES.has(code) ? 'export' : 'visual';
    qaIssues.push({
      issue_id: nextIssueId(), target_id: 'master',
      frame_range: inspectedFrames > 0 ? { start: 0, end: inspectedFrames } : null,
      severity: 'blocking', category,
      message: `MEDIA_${code}: technical inspection failed (${code})`,
      evidence_refs: [mediaRef],
    });
    cliIssues.push({ code: `MEDIA_${code}`, media_issue: code });
  }

  for (const fl of visual.flashes) {
    const fToken = ensureDefectFrame(fl.frame_range.start);
    qaIssues.push({
      issue_id: nextIssueId(), target_id: fl.shot_id, frame_range: fl.frame_range,
      severity: 'blocking', category: 'visual',
      message: `SINGLE_FRAME_FLASH (${fl.kind}): frame [${fl.frame_range.start}, ${fl.frame_range.end}) peak luma ${fl.peak_luma}`,
      evidence_refs: fToken ? [fToken] : [mediaRef],
    });
    cliIssues.push({ code: 'SINGLE_FRAME_FLASH', shot_id: fl.shot_id, start: fl.frame_range.start, end: fl.frame_range.end });
  }

  for (const bl of visual.blacks) {
    const fToken = ensureDefectFrame(bl.frame_range.start);
    qaIssues.push({
      issue_id: nextIssueId(), target_id: bl.shot_id, frame_range: bl.frame_range,
      severity: 'blocking', category: 'visual',
      message: `UNINTENDED_BLACK: frames [${bl.frame_range.start}, ${bl.frame_range.end}) mean luma ${bl.mean_luma}`,
      evidence_refs: fToken ? [fToken] : [mediaRef],
    });
    cliIssues.push({ code: 'UNINTENDED_BLACK', shot_id: bl.shot_id, start: bl.frame_range.start, end: bl.frame_range.end });
  }

  for (const fr of visual.freezes) {
    const fToken = ensureDefectFrame(fr.frame_range.start);
    qaIssues.push({
      issue_id: nextIssueId(), target_id: fr.shot_id, frame_range: fr.frame_range,
      severity: 'blocking', category: 'visual',
      message: `UNDECLARED_FREEZE: static run [${fr.frame_range.start}, ${fr.frame_range.end}) (${fr.frames} frames)`,
      evidence_refs: fToken ? [fToken] : [mediaRef],
    });
    cliIssues.push({ code: 'UNDECLARED_FREEZE', shot_id: fr.shot_id, start: fr.frame_range.start, end: fr.frame_range.end, frames: fr.frames });
  }

  for (const hold of visual.declared_holds) {
    qaIssues.push({
      issue_id: nextIssueId(), target_id: hold.shot_id, frame_range: hold.frame_range,
      severity: 'info', category: 'continuity',
      message: `DECLARED_HOLD_PRESERVED: ${hold.reason}`,
      evidence_refs: [mediaRef],
    });
  }

  for (const sil of audio.silence_ranges) {
    qaIssues.push({
      issue_id: nextIssueId(), target_id: sil.shot_id, frame_range: sil.frame_range,
      severity: 'blocking', category: 'audio',
      message: `UNINTENDED_SILENCE: frames [${sil.frame_range.start}, ${sil.frame_range.end}) (${sil.duration_seconds}s)`,
      evidence_refs: ['__waveform_png', '__waveform_json'],
    });
    cliIssues.push({ code: 'UNINTENDED_SILENCE', shot_id: sil.shot_id, start: sil.frame_range.start, end: sil.frame_range.end });
  }

  // Delivery target loudness & true-peak check.
  const registeredTargets = db.prepare('SELECT target_id, version, lufs_min, lufs_max, max_true_peak_dbtp, notes FROM delivery_targets WHERE project_id = ? ORDER BY recorded_at')
    .all(id) as { target_id: string; version: string; lufs_min: number; lufs_max: number; max_true_peak_dbtp: number; notes: string }[];
  const targetEvaluations: any[] = [];
  if (!registeredTargets.length) {
    qaIssues.push({
      issue_id: nextIssueId(), target_id: 'master', frame_range: null,
      severity: 'review', category: 'audio',
      message: 'DELIVERY_TARGET_MISSING: no delivery target loudness range registered before G3',
      evidence_refs: [mediaRef],
    });
    cliIssues.push({ code: 'DELIVERY_TARGET_MISSING', project_id: id });
  } else if (audio.loudness) {
    for (const t of registeredTargets) {
      const lufsOk = audio.loudness.integrated_lufs >= t.lufs_min && audio.loudness.integrated_lufs <= t.lufs_max;
      const peakOk = audio.loudness.max_true_peak_dbtp <= t.max_true_peak_dbtp;
      targetEvaluations.push({ ...t, lufs_ok: lufsOk, true_peak_ok: peakOk });
      if (!lufsOk) {
        qaIssues.push({
          issue_id: nextIssueId(), target_id: 'master', frame_range: inspectedFrames > 0 ? { start: 0, end: inspectedFrames } : null,
          severity: 'blocking', category: 'audio',
          message: `LOUDNESS_OUT_OF_RANGE (${t.target_id}@${t.version}): ${audio.loudness.integrated_lufs} LUFS outside [${t.lufs_min}, ${t.lufs_max}]`,
          evidence_refs: ['__waveform_png'],
        });
        cliIssues.push({ code: 'LOUDNESS_OUT_OF_RANGE', target_id: t.target_id, version: t.version, lufs: audio.loudness.integrated_lufs, min: t.lufs_min, max: t.lufs_max });
      }
      if (!peakOk) {
        qaIssues.push({
          issue_id: nextIssueId(), target_id: 'master', frame_range: inspectedFrames > 0 ? { start: 0, end: inspectedFrames } : null,
          severity: 'blocking', category: 'audio',
          message: `TRUE_PEAK_EXCEEDED (${t.target_id}@${t.version}): ${audio.loudness.max_true_peak_dbtp} dBTP > ${t.max_true_peak_dbtp} dBTP`,
          evidence_refs: ['__waveform_png'],
        });
        cliIssues.push({ code: 'TRUE_PEAK_EXCEEDED', target_id: t.target_id, version: t.version, true_peak: audio.loudness.max_true_peak_dbtp, max: t.max_true_peak_dbtp });
      }
    }
  }

  // ---- Level 3: Generate & register contact sheet (3x4), waveform JSON/PNG, motion heatmap, defect frames, and QAReport.
  const issueRanges = qaIssues.filter((i) => i.severity !== 'info' && i.frame_range).map((i) => i.frame_range!);
  const holdRanges = visual.declared_holds.map((h) => h.frame_range);
  const contactSheetBuilt = canDecodeVideo && inspectedFrames > 0
    ? buildContactSheet(mediaPath, inspectedFrames, shotWindows, issueRanges, holdRanges)
    : null;
  const waveformPngBytes = renderWaveformPng(audio.frames, shotWindows, audio.silence_ranges, audio.loudness);
  const waveformJsonData = {
    project_id: id, target_hash: targetHash, sample_rate_hz: RATE, fps: FPS,
    frame_count: audio.frames.length, loudness: audio.loudness, isolated_voice: isolatedVoice,
    silence_ranges: audio.silence_ranges, frames: audio.frames,
  };

  const persisted = transaction(db, () => {
    const waveJsonAsset = registerAsset(db, project, id, `qa_waveform_${scope}`, 'qa-waveform', 'json',
      JSON.stringify(waveformJsonData, null, 2), { target_hash: targetHash, scope });
    const wavePngAsset = registerAsset(db, project, id, `qa_waveform_img_${scope}`, 'qa-waveform-image', 'png',
      waveformPngBytes, { target_hash: targetHash, scope });
    const motionAsset = registerAsset(db, project, id, `qa_motion_${scope}`, 'qa-motion', 'json',
      JSON.stringify(visual.motion_heatmap, null, 2), { target_hash: targetHash, scope });
    const sheetAsset = contactSheetBuilt
      ? registerAsset(db, project, id, `qa_contact_sheet_${scope}`, 'qa-contact-sheet', 'png',
        contactSheetBuilt.png, { target_hash: targetHash, scope, grid: contactSheetBuilt.grid, cells: contactSheetBuilt.cells })
      : null;

    for (const [fIdx, png] of pendingDefectFrames.entries()) {
      const a = registerAsset(db, project, id, `qa_defect_f${String(fIdx).padStart(6, '0')}`, 'qa-defect-frame', 'png',
        png, { target_hash: targetHash, frame: fIdx, scope });
      defectFrameRefs.set(fIdx, a.asset_ref);
    }

    // Resolve placeholder evidence tokens to real registered AssetRefs.
    for (const iss of qaIssues) {
      iss.evidence_refs = iss.evidence_refs.map((r) => {
        if (r === '__waveform_png') return wavePngAsset.asset_ref;
        if (r === '__waveform_json') return waveJsonAsset.asset_ref;
        if (r.startsWith('__frame_')) return defectFrameRefs.get(Number(r.slice('__frame_'.length))) ?? mediaRef!;
        return r;
      });
    }
    inspectedRefs.add(waveJsonAsset.asset_ref);
    inspectedRefs.add(wavePngAsset.asset_ref);
    inspectedRefs.add(motionAsset.asset_ref);
    if (sheetAsset) inspectedRefs.add(sheetAsset.asset_ref);

    const blockingCount = qaIssues.filter((i) => i.severity === 'blocking').length;
    const reviewCount = qaIssues.filter((i) => i.severity === 'review').length;
    const result: 'pass' | 'fail' | 'needs_review' = blockingCount > 0 ? 'fail' : reviewCount > 0 ? 'needs_review' : 'pass';
    const qaVersion = ((db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM qa_reports WHERE project_id = ?').get(id) as { v: number }).v) + 1;

    const qa_report = {
      project_id: id,
      version: qaVersion,
      target_hash: targetHash,
      result,
      issues: qaIssues,
      inspected_refs: [...inspectedRefs],
    };

    const studio_links = qaIssues.map((iss) => {
      const range = iss.frame_range ?? { start: 0, end: Math.max(1, inspectedFrames) };
      const loc = locateShot(shotWindows, range.start);
      return {
        issue_id: iss.issue_id,
        shot_id: loc.shot_id,
        chapter_id: loc.chapter_id,
        absolute_frame_range: range,
        local_frame_range: { start: loc.local_frame, end: loc.local_frame + (range.end - range.start) },
        time_range_seconds: { start: Number((range.start / FPS).toFixed(3)), end: Number((range.end / FPS).toFixed(3)) },
        sample_range: { start: range.start * SAMPLES_PER_FRAME, end: range.end * SAMPLES_PER_FRAME },
        waveform_ref: waveJsonAsset.asset_ref,
        waveform_png_ref: wavePngAsset.asset_ref,
        contact_sheet_ref: sheetAsset?.asset_ref ?? null,
        frame_evidence_refs: iss.evidence_refs,
      };
    });

    const contact_sheet = sheetAsset && contactSheetBuilt ? {
      asset_ref: sheetAsset.asset_ref, path: sheetAsset.path, sha256: sheetAsset.sha256,
      width: contactSheetBuilt.width, height: contactSheetBuilt.height,
      grid: contactSheetBuilt.grid, cells: contactSheetBuilt.cells,
    } : null;

    const waveform = {
      json_ref: waveJsonAsset.asset_ref, json_path: waveJsonAsset.path,
      png_ref: wavePngAsset.asset_ref, png_path: wavePngAsset.path,
      sample_rate_hz: RATE, frame_count: audio.frames.length, silence_ranges: audio.silence_ranges,
    };

    const audio_metrics = {
      final_mix: audio.loudness,
      isolated_voice: isolatedVoice,
      measured_intervals: measuredIntervals,
      delivery_targets: targetEvaluations,
    };

    const bundle = {
      qa_report,
      scope,
      inspector: INSPECTOR,
      target_hash: targetHash,
      sample: sampleInfo,
      levels: {
        preflight: { shots_checked: scopedShots.length, issues: pre.issues, bounding_boxes },
        media_qa: {
          technical,
          visual_anomalies: { flashes: visual.flashes, blacks: visual.blacks, freezes: visual.freezes },
          audio_metrics,
        },
        sample_qa: { contact_sheet, waveform, motion_heatmap_ref: motionAsset.asset_ref },
      },
      bounding_boxes,
      declared_holds: visual.declared_holds,
      contact_sheet,
      waveform,
      audio_metrics,
      motion_heatmap: { asset_ref: motionAsset.asset_ref, path: motionAsset.path, ...visual.motion_heatmap },
      studio_links,
      shot_windows: shotWindows,
    };

    const reportAsset = registerAsset(db, project, id, `qa_report_${scope}`, 'qa-report', 'json',
      JSON.stringify(qa_report, null, 2), { target_hash: targetHash, scope, version: qaVersion, result, blocking_count: blockingCount });

    db.prepare(`INSERT INTO qa_reports (qa_id, project_id, version, scope, target_hash, result, blocking_count, asset_ref, report_body, bundle_body, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newId('qa'), id, qaVersion, scope, targetHash, result, blockingCount, reportAsset.asset_ref,
      JSON.stringify(qa_report), JSON.stringify(bundle), new Date().toISOString(),
    );

    return { qa_report, reportAsset, bundle, blockingCount, waveJsonAsset, sheetAsset };
  });

  const currency = currentBudget(db, id)?.currency ?? 'CNY';
  const inspect_media_input = {
    media_ref: mediaRef,
    expected_spec: DEFAULT_MEDIA_SPEC,
    sample_ranges: inspectedFrames > 0 ? [{ start: 0, end: inspectedFrames }] : [],
  };
  const tool_result = {
    status: canDecodeVideo ? (hasAudio ? 'succeeded' : 'partial') : 'failed',
    job_id: newId('qa'),
    artifact_refs: [persisted.reportAsset.asset_ref, ...(persisted.sheetAsset ? [persisted.sheetAsset.asset_ref] : []), persisted.waveJsonAsset.asset_ref],
    warnings: persisted.qa_report.issues.filter((i) => i.severity !== 'info').map((i) => i.message),
    cost: { currency, estimated_minor: 0, actual_minor: 0 },
    retryable: false,
    next_action: persisted.qa_report.result === 'fail' ? 'review' : 'continue',
  };

  const out = summary(db, id, persisted.qa_report.result.toUpperCase(), cliIssues, {
    qa_report_ref: persisted.reportAsset.asset_ref,
    ...persisted.bundle,
    inspect_media_input,
    tool_result,
  });
  return { report: out.report, exitCode: persisted.qa_report.result === 'fail' ? 1 : 0 };
}

// Shared Studio reader: load the persisted QA bundle for a project (or specific media hash) from SQLite.
export function getLatestQaBundle(db: Db, projectId: string, targetHash?: string): any | null {
  const row = targetHash
    ? db.prepare('SELECT bundle_body FROM qa_reports WHERE project_id = ? AND target_hash = ? ORDER BY version DESC LIMIT 1').get(projectId, targetHash) as { bundle_body: string } | undefined
    : db.prepare('SELECT bundle_body FROM qa_reports WHERE project_id = ? ORDER BY version DESC LIMIT 1').get(projectId) as { bundle_body: string } | undefined;
  return row ? JSON.parse(row.bundle_body) : null;
}

// Shared Studio navigation helper: jump from one QA result (by issue_id, contact-sheet cell 1..12, or absolute frame)
// directly to the shot, local frame range, and exact audio waveform sample range.
export function resolveStudioTarget(qaOutput: any, query: { issue_id?: string; cell?: number; frame?: number }) {
  if (query.issue_id) {
    const link = (qaOutput.studio_links ?? []).find((l: any) => l.issue_id === query.issue_id);
    if (!link) throw new Error(`unknown QA issue_id: ${query.issue_id}`);
    return link;
  }
  const waveform_ref = qaOutput.waveform?.json_ref ?? null;
  const waveform_png_ref = qaOutput.waveform?.png_ref ?? null;
  const contact_sheet_ref = qaOutput.contact_sheet?.asset_ref ?? null;
  if (query.cell !== undefined) {
    const cell = (qaOutput.contact_sheet?.cells ?? []).find((c: any) => c.cell === query.cell);
    if (!cell) throw new Error(`unknown contact-sheet cell: ${query.cell}`);
    const range = { start: cell.frame, end: cell.frame + 1 };
    return {
      cell: cell.cell,
      shot_id: cell.shot_id,
      chapter_id: cell.chapter_id,
      absolute_frame_range: range,
      local_frame_range: { start: cell.local_frame, end: cell.local_frame + 1 },
      time_range_seconds: { start: cell.seconds, end: Number(((cell.frame + 1) / FPS).toFixed(3)) },
      sample_range: { start: cell.frame * SAMPLES_PER_FRAME, end: (cell.frame + 1) * SAMPLES_PER_FRAME },
      waveform_ref,
      waveform_png_ref,
      contact_sheet_ref,
    };
  }
  const frame = query.frame ?? 0;
  const loc = locateShot(qaOutput.shot_windows ?? [], frame);
  return {
    shot_id: loc.shot_id,
    chapter_id: loc.chapter_id,
    absolute_frame_range: { start: frame, end: frame + 1 },
    local_frame_range: { start: loc.local_frame, end: loc.local_frame + 1 },
    time_range_seconds: { start: Number((frame / FPS).toFixed(3)), end: Number(((frame + 1) / FPS).toFixed(3)) },
    sample_range: { start: frame * SAMPLES_PER_FRAME, end: (frame + 1) * SAMPLES_PER_FRAME },
    waveform_ref,
    waveform_png_ref,
    contact_sheet_ref,
  };
}

// ---- A11 Blinded A/B Comparison & Human Subjective Review ----

export function compareOp(project: string, request: any, token = process.env.SVS_SESSION_TOKEN): Outcome {
  const db = openStore(project);
  const id = request.project_id;
  const reject = (issue: Issue) => summary(db, id, 'REJECTED', [issue]);
  if (!getProject(db, id)) return reject({ code: 'PROJECT_NOT_FOUND', ref: id });

  if (request.action === 'prepare') {
    const baseAsset = getAsset(db, request.baseline_ref);
    const upgAsset = getAsset(db, request.upgrade_ref);
    if (!baseAsset || !readAsset(project, baseAsset)) return reject({ code: 'ASSET_NOT_FOUND', shot_id: 'baseline', asset_ref: request.baseline_ref });
    if (!upgAsset || !readAsset(project, upgAsset)) return reject({ code: 'ASSET_NOT_FOUND', shot_id: 'upgrade', asset_ref: request.upgrade_ref });
    if (!['historical', 'controlled_baseline'].includes(request.baseline_kind)) {
      return reject({ code: 'COMPARE_INVALID', detail: 'baseline_kind must be historical or controlled_baseline' });
    }
    const seed = request.seed ?? 1;
    if (!Number.isInteger(seed) || seed < 0) return reject({ code: 'SEED_INVALID', seed });

    const baseTech = inspectTechnical(join(project, baseAsset.path));
    const upgTech = inspectTechnical(join(project, upgAsset.path));
    if (baseTech.observed.frames !== upgTech.observed.frames
      || baseTech.observed.width !== upgTech.observed.width
      || baseTech.observed.height !== upgTech.observed.height
      || baseTech.observed.sample_rate_hz !== upgTech.observed.sample_rate_hz) {
      return reject({
        code: 'COMPARE_SPEC_MISMATCH',
        baseline_frames: baseTech.observed.frames ?? 0,
        upgrade_frames: upgTech.observed.frames ?? 0,
      });
    }

    const flip = (createHash('sha256').update(`${seed}:${baseAsset.sha256}:${upgAsset.sha256}`).digest()[0] & 1) === 1;
    const clip_a = flip
      ? { asset_ref: upgAsset.asset_ref, sha256: upgAsset.sha256, path: upgAsset.path }
      : { asset_ref: baseAsset.asset_ref, sha256: baseAsset.sha256, path: baseAsset.path };
    const clip_b = flip
      ? { asset_ref: baseAsset.asset_ref, sha256: baseAsset.sha256, path: baseAsset.path }
      : { asset_ref: upgAsset.asset_ref, sha256: upgAsset.sha256, path: upgAsset.path };
    const comparison_id = newId('cmp');
    if (request.target_hash !== undefined && request.target_hash !== upgAsset.sha256) {
      return reject({ code: 'COMPARE_TARGET_MISMATCH', target_hash: request.target_hash, upgrade_hash: upgAsset.sha256 });
    }
    const target_hash = upgAsset.sha256;
    const historical_comparison_status = request.baseline_kind === 'historical' ? 'READY' : 'NOT_RUN';
    const blinded_packet = {
      comparison_id, target_hash, baseline_kind: request.baseline_kind, historical_comparison_status,
      spec: { frames: upgTech.observed.frames, width: upgTech.observed.width, height: upgTech.observed.height, fps: FPS, sample_rate_hz: upgTech.observed.sample_rate_hz },
      clip_a, clip_b,
      rubric: [...RUBRIC_ITEMS],
    };
    const unblinding_key = {
      comparison_id, seed, baseline_kind: request.baseline_kind,
      clip_a_role: flip ? 'upgrade' : 'baseline',
      clip_b_role: flip ? 'baseline' : 'upgrade',
      baseline_ref: baseAsset.asset_ref, upgrade_ref: upgAsset.asset_ref,
    };

    const saved = transaction(db, () => {
      const keyAsset = registerAsset(db, project, id, 'ab_unblinding_key', 'qa-ab-key', 'json',
        JSON.stringify(unblinding_key, null, 2), { comparison_id, target_hash });
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO ab_comparisons (comparison_id, project_id, target_hash, baseline_kind, seed, blinded_body, key_body, review_body, open_required_fixes, recorded_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`).run(
        comparison_id, id, target_hash, request.baseline_kind, seed,
        JSON.stringify(blinded_packet), JSON.stringify(unblinding_key), now, now,
      );
      return keyAsset;
    });

    return summary(db, id, 'PREPARED', [], {
      comparison: {
        comparison_id, target_hash, baseline_kind: request.baseline_kind, historical_comparison_status,
        blinded_packet, unblinding_key_ref: saved.asset_ref, open_required_fixes: 0,
      },
    });
  }

  if (request.action === 'review') {
    const session = humanSession(db, token);
    if (!session) return reject({ code: 'HUMAN_REQUIRED', action: 'record_ab_review' });
    const row = db.prepare('SELECT * FROM ab_comparisons WHERE project_id = ? AND comparison_id = ?').get(id, request.comparison_id) as any;
    if (!row) return reject({ code: 'COMPARE_NOT_FOUND', comparison_id: request.comparison_id });
    if (!request.audio_listening?.phone_speaker || !request.audio_listening?.headphones) {
      return reject({ code: 'COMPARE_INVALID', detail: 'audio_listening requires phone_speaker and headphones observations' });
    }
    if (!Array.isArray(request.shots) || !request.shots.length) {
      return reject({ code: 'COMPARE_INVALID', detail: 'at least one shot observation is required' });
    }

    let openFixes = 0;
    const normalizedShots = [];
    for (const sh of request.shots) {
      if (!sh.shot_id || !sh.timecode_a || !sh.timecode_b || !sh.items) {
        return reject({ code: 'COMPARE_INVALID', detail: `shot ${sh.shot_id ?? 'unknown'} missing timecodes or items` });
      }
      const normItems: Record<string, any> = {};
      for (const key of RUBRIC_ITEMS) {
        const entry = sh.items[key];
        if (!entry || !VERDICTS.has(entry.verdict) || !entry.reason) {
          return reject({ code: 'COMPARE_INVALID', detail: `shot ${sh.shot_id} item ${key} requires valid verdict and reason` });
        }
        if (entry.verdict === 'regressed') {
          if (!REGRESSION_ACTIONS.has(entry.action)) {
            return reject({ code: 'COMPARE_INVALID', detail: `regressed item ${sh.shot_id}.${key} requires action (required_fix or accepted_with_reason)` });
          }
          const status = entry.action === 'required_fix' ? 'open' : 'accepted';
          if (status === 'open') openFixes += 1;
          normItems[key] = { verdict: entry.verdict, reason: entry.reason, action: entry.action, resolution_status: status };
        } else {
          normItems[key] = { verdict: entry.verdict, reason: entry.reason };
        }
      }
      normalizedShots.push({ shot_id: sh.shot_id, timecode_a: sh.timecode_a, timecode_b: sh.timecode_b, items: normItems });
    }

    const review = {
      comparison_id: row.comparison_id,
      reviewer_id: session.reviewer_id,
      session_id: session.session_id,
      recorded_at: new Date().toISOString(),
      audio_listening: request.audio_listening,
      shots: normalizedShots,
    };
    transaction(db, () => {
      db.prepare('UPDATE ab_comparisons SET review_body = ?, open_required_fixes = ?, updated_at = ? WHERE comparison_id = ?')
        .run(JSON.stringify(review), openFixes, review.recorded_at, row.comparison_id);
    });
    return summary(db, id, 'RECORDED', [], {
      comparison: {
        comparison_id: row.comparison_id, target_hash: row.target_hash, baseline_kind: row.baseline_kind,
        open_required_fixes: openFixes, review, unblinding_key: JSON.parse(row.key_body),
      },
    });
  }

  if (request.action === 'close_fix') {
    const session = humanSession(db, token);
    if (!session) return reject({ code: 'HUMAN_REQUIRED', action: 'close_required_fix' });
    const row = db.prepare('SELECT * FROM ab_comparisons WHERE project_id = ? AND comparison_id = ?').get(id, request.comparison_id) as any;
    if (!row || !row.review_body) return reject({ code: 'COMPARE_NOT_FOUND', comparison_id: request.comparison_id });
    const review = JSON.parse(row.review_body);
    const shot = review.shots.find((s: any) => s.shot_id === request.shot_id);
    const entry = shot?.items?.[request.item];
    if (!entry || entry.action !== 'required_fix') {
      return reject({ code: 'COMPARE_INVALID', detail: `no required_fix for ${request.shot_id}.${request.item}` });
    }
    entry.resolution_status = 'closed';
    entry.closed_by = session.reviewer_id;
    entry.resolution_notes = request.resolution_notes ?? '';
    entry.closed_at = new Date().toISOString();
    let openFixes = 0;
    for (const s of review.shots) {
      for (const k of RUBRIC_ITEMS) {
        if (s.items[k]?.action === 'required_fix' && s.items[k]?.resolution_status !== 'closed') openFixes += 1;
      }
    }
    transaction(db, () => {
      db.prepare('UPDATE ab_comparisons SET review_body = ?, open_required_fixes = ?, updated_at = ? WHERE comparison_id = ?')
        .run(JSON.stringify(review), openFixes, entry.closed_at, row.comparison_id);
    });
    return summary(db, id, 'CLOSED', [], {
      comparison: { comparison_id: row.comparison_id, target_hash: row.target_hash, open_required_fixes: openFixes, review },
    });
  }

  return reject({ code: 'COMPARE_INVALID', detail: `unknown action ${request.action}` });
}
