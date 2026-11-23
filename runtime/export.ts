// Shared project snapshot & traceability (`trace`), standalone static HTML review summary, and tamper-evident
// ExportManifest preparation (T11, Plan A headless delivery pipeline, skills/delivery-packager).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { currentTarget, requirementIssues } from './approvals.ts';
import { type AssetRow, getAsset, readAsset, registerAsset, sha256 } from './assets.ts';
import { latest } from './content.ts';
import { toolVersion } from './doctor.ts';
import { balance } from './ledger.ts';
import { type Envelope, advance } from './orchestrator.ts';
import { type Db, type Issue, type Outcome, getProject, newId, openStore, precheck, requestHash, summary, transaction } from './project-store.ts';
import { FPS, toFrame } from './timebase.ts';
import { INSPECTOR } from '../tools/inspect_media/adapter.ts';
import { RENDERER } from '../tools/render_shot/adapter.ts';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isExportArtifact(kind: string): boolean {
  return kind.startsWith('export-') || kind === 'final-package';
}

// Shared snapshot reader used by `trace`, `manifest`, and `package` so all paths read consistent revisions.
export function getProjectSnapshot(db: Db, projectId: string) {
  const projectRow = getProject(db, projectId);
  const brief = latest(db, projectId, 'brief');
  const evidence = latest(db, projectId, 'evidence');
  const script = latest(db, projectId, 'script');
  const audio = latest(db, projectId, 'audio');
  const alignment = latest(db, projectId, 'alignment');
  const storyboard = latest(db, projectId, 'storyboard');
  const timeline = latest(db, projectId, 'timeline');

  const qaRow = db.prepare(`SELECT qa_id, version, scope, target_hash, result, blocking_count, asset_ref, report_body, bundle_body, recorded_at
    FROM qa_reports WHERE project_id = ? ORDER BY version DESC LIMIT 1`).get(projectId) as any;
  const qa = qaRow ? {
    ...qaRow,
    report: JSON.parse(qaRow.report_body),
    bundle: JSON.parse(qaRow.bundle_body),
  } : null;

  const approvals = db.prepare(`SELECT approval_id, project_id, version, gate, target_hash, reviewer_id, decision, recorded_at, notes
    FROM approvals WHERE project_id = ? ORDER BY version ASC`).all(projectId) as any[];
  const latestApprovals: Record<string, any> = {};
  for (const a of approvals) latestApprovals[a.gate] = a;

  const cost = {
    budget: balance(db, projectId),
    ledger: ledgerSnapshot(db, projectId),
  };

  const activeAssets = (db.prepare(`SELECT a.asset_ref, a.name, a.version, a.kind, a.path, a.sha256, a.meta, a.created_at
    FROM assets a LEFT JOIN invalidated_assets inv ON inv.asset_ref = a.asset_ref
    WHERE a.project_id = ? AND inv.asset_ref IS NULL ORDER BY a.rowid ASC`).all(projectId) as any[])
    .map((r) => ({ ...r, meta: JSON.parse(r.meta) }) as AssetRow & { created_at: string });

  const sourcesById = new Map<string, any>((evidence?.document?.sources ?? []).map((s: any) => [s.source_id, s]));
  const links: any[] = evidence?.document?.claim_source_links ?? [];
  const claimToSources = new Map<string, { claim: any; sources: any[] }>();
  for (const claim of evidence?.document?.claims ?? []) {
    const claimLinks = links.filter((l) => l.claim_id === claim.claim_id).map((l) => ({
      ...(sourcesById.get(l.source_id) ?? { source_id: l.source_id }),
      locator: l.locator,
      relation: l.relation,
    }));
    claimToSources.set(claim.claim_id, { claim, sources: claimLinks });
  }

  const tokens: any[] = alignment?.document?.alignment?.tokens ?? [];
  const cues: any[] = alignment?.document?.subtitles?.cues ?? [];
  const tlShots: any[] = timeline?.document?.timeline?.shots ?? [];
  const subtitleToWords = cues.map((cue, index) => {
    let words = tokens.filter((t) => {
      if (t.section_id !== cue.section_id) return false;
      const f = toFrame(t.start_sample);
      return f >= cue.range.start && f < cue.range.end;
    });
    if (!words.length) {
      words = tokens.filter((t) => {
        if (t.section_id !== cue.section_id) return false;
        const s = toFrame(t.start_sample), e = Math.max(toFrame(t.end_sample), s + 1);
        return e > cue.range.start && s < cue.range.end;
      });
    }
    const shot = tlShots.find((s) => s.absolute_range.end > cue.range.start && s.absolute_range.start < cue.range.end);
    return {
      index,
      cue,
      shot_id: shot?.shot_id ?? null,
      chapter_id: shot?.chapter_id ?? null,
      words,
    };
  });

  return {
    project: projectRow,
    revisions: {
      brief: brief?.version ?? 0,
      evidence: evidence?.version ?? 0,
      script: script?.version ?? 0,
      audio: audio?.version ?? 0,
      alignment: alignment?.version ?? 0,
      storyboard: storyboard?.version ?? 0,
      timeline: timeline?.version ?? 0,
      qa: qa?.version ?? 0,
    },
    brief,
    evidence,
    script,
    audio,
    alignment,
    storyboard,
    timeline,
    qa,
    approvals,
    latestApprovals,
    cost,
    activeAssets,
    claimToSources,
    subtitleToWords,
  };
}

function ledgerSnapshot(db: Db, projectId: string) {
  const entries = db.prepare('SELECT project_id, version, entry_id, job_id, reservation_id, operation, currency, amount_minor, recorded_at, external_receipt FROM ledger WHERE project_id = ? ORDER BY version')
    .all(projectId);
  const jobs = db.prepare('SELECT job_id, idempotency_key, skill_id, tool, provider, provider_job_id, state, reservation_id, quote_minor, cost_minor, external_receipt, attempt FROM jobs WHERE project_id = ? ORDER BY created_at')
    .all(projectId);
  return { entries, jobs };
}

export interface TraceRequest {
  project_id: string;
  claim_id?: string;
  subtitle_index?: number;
  word_id?: string;
  shot_id?: string;
}

export function traceOp(project: string, request: TraceRequest): Outcome {
  const db = openStore(project);
  const id = request.project_id;
  if (!getProject(db, id)) return summary(db, id, 'REJECTED', [{ code: 'PROJECT_NOT_FOUND', ref: id }]);
  const snap = getProjectSnapshot(db, id);
  const reject = (issue: Issue) => summary(db, id, 'REJECTED', [issue]);

  let claim_trace: any = null;
  if (request.claim_id !== undefined) {
    const found = snap.claimToSources.get(request.claim_id);
    if (!found) return reject({ code: 'CLAIM_UNKNOWN', section_id: 'trace', claim_id: request.claim_id });
    const citing_sections = (snap.script?.document?.sections ?? [])
      .filter((s: any) => (s.claim_ids ?? []).includes(request.claim_id))
      .map((s: any) => ({ section_id: s.section_id, title: s.title }));
    claim_trace = { ...found, citing_sections };
  }

  let subtitle_trace: any = null;
  if (request.subtitle_index !== undefined) {
    if (!Number.isInteger(request.subtitle_index) || request.subtitle_index < 0 || request.subtitle_index >= snap.subtitleToWords.length) {
      return reject({ code: 'FRAME_OUT_OF_RANGE', shot_id: 'subtitles', frame_count: snap.subtitleToWords.length, frame: request.subtitle_index });
    }
    subtitle_trace = snap.subtitleToWords[request.subtitle_index];
  }

  let word_trace: any = null;
  if (request.word_id !== undefined) {
    const tokens: any[] = snap.alignment?.document?.alignment?.tokens ?? [];
    const word = tokens.find((t) => t.word_id === request.word_id);
    if (!word) return reject({ code: 'WORD_UNKNOWN', word_id: request.word_id });
    const wf = toFrame(word.start_sample);
    const shot = (snap.timeline?.document?.timeline?.shots ?? []).find((s: any) => wf >= s.absolute_range.start && wf < s.absolute_range.end);
    const matchingCues = snap.subtitleToWords.filter((s) => s.words.some((w: any) => w.word_id === word.word_id));
    word_trace = {
      word,
      frame: wf,
      shot_id: shot?.shot_id ?? null,
      chapter_id: shot?.chapter_id ?? null,
      subtitle_cues: matchingCues.map((s) => ({ index: s.index, cue: s.cue })),
    };
  }

  let shot_trace: any = null;
  if (request.shot_id !== undefined) {
    const sbShot = (snap.storyboard?.document?.storyboard?.shots ?? []).find((s: any) => s.shot_id === request.shot_id);
    const tlShot = (snap.timeline?.document?.timeline?.shots ?? []).find((s: any) => s.shot_id === request.shot_id);
    if (!sbShot && !tlShot) return reject({ code: 'RENDER_TARGET_UNKNOWN', scope: 'shot', target_id: request.shot_id });
    const sec = (snap.script?.document?.sections ?? []).find((s: any) => s.section_id === sbShot?.section_id);
    const range = tlShot?.absolute_range ?? sbShot?.frame_range;
    const cues = range ? snap.subtitleToWords.filter((s) => s.cue.range.end > range.start && s.cue.range.start < range.end) : [];
    const claims = (sec?.claim_ids ?? []).map((cid: string) => snap.claimToSources.get(cid)).filter(Boolean);
    shot_trace = { storyboard_shot: sbShot ?? null, timeline_shot: tlShot ?? null, section: sec ?? null, subtitle_cues: cues, claims };
  }

  return summary(db, id, 'OK', [], {
    revisions: snap.revisions,
    claim_trace,
    subtitle_trace,
    word_trace,
    shot_trace,
    claims: [...snap.claimToSources.values()],
    subtitles: snap.subtitleToWords,
  });
}

// Standalone zero-dependency static HTML5 review summary (all dynamic fields strictly escaped).
export function buildReviewHtml(
  snap: ReturnType<typeof getProjectSnapshot>,
  opts: { manifestVersion: number; finalMediaSha256: string; qaReport: any; approvalsG1ToG4: any[]; hasContactSheet: boolean; hasWaveform: boolean },
): string {
  const claimRows = [...snap.claimToSources.values()].map(({ claim, sources }) => {
    const srcHtml = sources.map((s) =>
      `<li><strong>${escapeHtml(s.source_id)}</strong>: ${escapeHtml(s.title)} [${escapeHtml(s.locator)}, ${escapeHtml(s.relation)}] (${escapeHtml(s.url)})</li>`,
    ).join('');
    return `<tr><td>${escapeHtml(claim.claim_id)}</td><td>${escapeHtml(claim.status)}</td><td>${escapeHtml(claim.statement)}<br><small>${escapeHtml(claim.qualifier)}</small></td><td><ul>${srcHtml}</ul></td></tr>`;
  }).join('\n');

  const shotRows = (snap.timeline?.document?.timeline?.shots ?? []).map((sh: any) => {
    const sb = (snap.storyboard?.document?.storyboard?.shots ?? []).find((x: any) => x.shot_id === sh.shot_id);
    return `<tr><td>${escapeHtml(sh.shot_id)}</td><td>${escapeHtml(sh.chapter_id)}</td><td>[${sh.absolute_range.start}, ${sh.absolute_range.end})</td><td>${sh.local_frames}</td><td>${escapeHtml(sh.camera)}</td><td>${escapeHtml(sb?.purpose ?? '')}</td></tr>`;
  }).join('\n');

  const qaRows = (opts.qaReport?.issues ?? []).map((iss: any) =>
    `<tr><td>${escapeHtml(iss.issue_id)}</td><td>${escapeHtml(iss.severity)}</td><td>${escapeHtml(iss.category)}</td><td>${escapeHtml(iss.target_id)}</td><td>${iss.frame_range ? `[${iss.frame_range.start}, ${iss.frame_range.end})` : '-'}</td><td>${escapeHtml(iss.message)}</td></tr>`,
  ).join('\n');

  const approvalRows = opts.approvalsG1ToG4.map((a: any) =>
    `<tr><td>${escapeHtml(a.gate)}</td><td>${escapeHtml(a.decision)}</td><td>${escapeHtml(a.reviewer_id)}</td><td><code>${escapeHtml(a.target_hash)}</code></td><td>${escapeHtml(a.recorded_at)}</td><td>${escapeHtml(a.notes)}</td></tr>`,
  ).join('\n');

  const links: [string, string][] = [
    ['final.mp4', '成片视频 (MP4)'],
    ['subtitles.srt', '字幕文件 (SRT)'],
    ['voice-master.wav', '主音轨 (48 kHz WAV)'],
    ['sources.json', '来源与论点映射 (JSON)'],
    ['qa-report.json', '质检报告 (QAReport JSON)'],
    ['cost-ledger.json', '成本账本 (JSON)'],
    ['approvals-g1-g4.json', 'G1–G4 人工审批记录 (JSON)'],
    ['chapters.json', '章节时间戳 (JSON)'],
  ];
  if (opts.hasContactSheet) links.push(['contact-sheet.png', '3×4 时间码联系表 (PNG)']);
  if (opts.hasWaveform) links.push(['waveform.png', '音频波形图 (PNG)']);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(snap.project?.title ?? snap.project?.project_id)} — 审片与交付汇总 (v${opts.manifestVersion})</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px auto; max-width: 1120px; color: #162032; background: #f8fafc; line-height: 1.5; }
  h1, h2 { color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; }
  .meta { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px 18px; margin-bottom: 18px; }
  .files { display: flex; flex-wrap: wrap; gap: 10px; list-style: none; padding: 0; }
  .files a { display: inline-block; padding: 6px 12px; background: #e2e8f0; color: #0f172a; text-decoration: none; border-radius: 6px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; background: #fff; margin-bottom: 20px; font-size: 13px; }
  th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all; }
</style>
</head>
<body>
  <h1>${escapeHtml(snap.project?.title ?? '')} (${escapeHtml(snap.project?.project_id)})</h1>
  <div class="meta">
    <div><strong>清单版本:</strong> v${opts.manifestVersion} · <strong>模式:</strong> ${escapeHtml(snap.project?.mode)} · <strong>主题:</strong> ${escapeHtml(snap.brief?.document?.topic ?? '')}</div>
    <div><strong>正式母版哈希:</strong> <code>${escapeHtml(opts.finalMediaSha256)}</code></div>
    <div><strong>预算消耗:</strong> 币种 ${escapeHtml(snap.cost.budget.currency ?? 'N/A')} · 已结算 ${escapeHtml(snap.cost.budget.spent_minor ?? 0)} · 预留 ${escapeHtml(snap.cost.budget.held_minor ?? 0)}</div>
  </div>
  <h2>交付物索引 (Deliverables)</h2>
  <ul class="files">
    ${links.map(([href, label]) => `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`).join('\n    ')}
  </ul>
  ${opts.hasContactSheet ? '<h2>3×4 联系表与波形预览</h2><p><img src="contact-sheet.png" alt="contact sheet" style="max-width:100%;border:1px solid #cbd5e1"></p>' : ''}
  ${opts.hasWaveform ? '<p><img src="waveform.png" alt="waveform" style="max-width:100%;border:1px solid #cbd5e1"></p>' : ''}
  <h2>论点与来源追溯 (Claims &amp; Sources)</h2>
  <table><thead><tr><th>论点 ID</th><th>状态</th><th>陈述与限定</th><th>支持来源</th></tr></thead><tbody>${claimRows}</tbody></table>
  <h2>分镜时间线 (Shots)</h2>
  <table><thead><tr><th>镜头</th><th>章节</th><th>绝对帧区间</th><th>局部帧数</th><th>景别</th><th>目的</th></tr></thead><tbody>${shotRows}</tbody></table>
  <h2>质检报告摘要 (QA: ${escapeHtml(opts.qaReport?.result ?? 'unknown')})</h2>
  <table><thead><tr><th>编号</th><th>级别</th><th>类别</th><th>目标</th><th>帧区间</th><th>说明</th></tr></thead><tbody>${qaRows || '<tr><td colspan="6">无问题</td></tr>'}</tbody></table>
  <h2>人类审批记录 (G1–G4)</h2>
  <table><thead><tr><th>门禁</th><th>决定</th><th>审核人</th><th>目标哈希</th><th>时间</th><th>备注</th></tr></thead><tbody>${approvalRows}</tbody></table>
</body>
</html>
`;
}

export interface ManifestRequest extends Envelope {
  final_media_ref?: string;
  qa_ref?: string;
  include_review_html?: boolean;
}

export function manifestOp(project: string, request: ManifestRequest): Outcome {
  const db = openStore(project);
  const id = request.project_id;
  const reject = (issues: Issue[]) => summary(db, id, 'REJECTED', issues);
  const projectRow = getProject(db, id);
  if (!projectRow) return reject([{ code: 'PROJECT_NOT_FOUND', ref: id }]);
  if (projectRow.mode !== 'quality') return reject([{ code: 'DRAFT_EXPORT_FORBIDDEN', mode: projectRow.mode }]);

  const digest = requestHash(request);
  const preRead = precheck(db, request, digest);
  if (preRead.done) {
    if (preRead.done.report.status === 'REPLAYED') {
      const evt = db.prepare('SELECT payload FROM events WHERE event_id = ?').get((preRead.done.report as any).event_id ?? '') as { payload: string } | undefined;
      const evtRef = evt ? JSON.parse(evt.payload).manifest_ref : null;
      const row = (evtRef
        ? db.prepare('SELECT manifest_ref, manifest_hash, body FROM export_manifests WHERE project_id = ? AND manifest_ref = ?').get(id, evtRef)
        : db.prepare('SELECT manifest_ref, manifest_hash, body FROM export_manifests WHERE project_id = ? ORDER BY version DESC LIMIT 1').get(id)) as
        { manifest_ref: string; manifest_hash: string; body: string } | undefined;
      if (row) {
        const asset = getAsset(db, row.manifest_ref);
        return { ...preRead.done, report: { ...preRead.done.report, manifest_ref: row.manifest_ref, manifest_path: asset?.path ?? null, manifest_hash: row.manifest_hash, export_manifest: JSON.parse(row.body) } };
      }
    }
    return preRead.done;
  }

  // Validate G4 state and non-stale G4 approval before taking snapshot or entering write transaction.
  if (!['APPROVED', 'FINAL_REVIEW'].includes(projectRow.state)) {
    return reject([{ code: 'TRANSITION_INVALID', state: projectRow.state, event: 'manifest_prepared', mode: projectRow.mode }]);
  }
  const g4Target = currentTarget(db, id, 'G4');
  if (!g4Target) return reject([{ code: 'MASTER_MISSING', project_id: id }]);
  const g4Issues = requirementIssues(db, id, ['G4'], {});
  if (g4Issues.length) return reject(g4Issues);
  if (projectRow.state !== 'APPROVED') {
    return reject([{ code: 'TRANSITION_INVALID', state: projectRow.state, event: 'manifest_prepared', mode: projectRow.mode }]);
  }

  let finalMediaAsset: AssetRow | undefined;
  if (request.final_media_ref) {
    finalMediaAsset = getAsset(db, request.final_media_ref);
  } else {
    const row = db.prepare(`SELECT a.asset_ref FROM assets a LEFT JOIN invalidated_assets inv ON inv.asset_ref = a.asset_ref
      WHERE a.project_id = ? AND inv.asset_ref IS NULL AND a.kind = 'render-master' AND a.sha256 = ? ORDER BY a.version DESC LIMIT 1`)
      .get(id, g4Target) as { asset_ref: string } | undefined;
    finalMediaAsset = row ? getAsset(db, row.asset_ref) : undefined;
  }
  if (!finalMediaAsset) return reject([{ code: 'MASTER_MISSING', project_id: id, target_hash: g4Target }]);
  const finalMediaBytes = readAsset(project, finalMediaAsset);
  if (!finalMediaBytes) return reject([{ code: 'ASSET_FILE_CHANGED', shot_id: 'master', asset_ref: finalMediaAsset.asset_ref }]);
  if (finalMediaAsset.sha256 !== g4Target) {
    return reject([{ code: 'APPROVAL_STALE', gate: 'G4', current_target_hash: finalMediaAsset.sha256, approved_target_hash: g4Target }]);
  }

  const g4Row = db.prepare(`SELECT approval_id, target_hash FROM approvals WHERE project_id = ? AND gate = 'G4' AND target_hash = ? AND decision = 'approve' ORDER BY version DESC LIMIT 1`)
    .get(id, g4Target) as { approval_id: string; target_hash: string } | undefined;
  if (!g4Row) return reject([{ code: 'APPROVAL_MISSING', gate: 'G4', current_target_hash: g4Target }]);

  const qaRow = request.qa_ref
    ? db.prepare('SELECT qa_id, target_hash, result, blocking_count, asset_ref, report_body, bundle_body FROM qa_reports WHERE project_id = ? AND asset_ref = ? ORDER BY version DESC LIMIT 1')
      .get(id, request.qa_ref) as any
    : db.prepare('SELECT qa_id, target_hash, result, blocking_count, asset_ref, report_body, bundle_body FROM qa_reports WHERE project_id = ? AND target_hash = ? ORDER BY version DESC LIMIT 1')
      .get(id, g4Target) as any;
  if (!qaRow) return reject([{ code: 'QA_MISSING', target_hash: g4Target }]);
  if (qaRow.target_hash !== g4Target) return reject([{ code: 'APPROVAL_STALE', gate: 'G4', current_target_hash: qaRow.target_hash, approved_target_hash: g4Target }]);
  if (qaRow.result === 'fail' || qaRow.blocking_count > 0) {
    return reject([{ code: 'QA_BLOCKING_ISSUES', requirement: 'final_qa_pass', target_hash: g4Target, blocking_count: qaRow.blocking_count }]);
  }
  const qaAsset = getAsset(db, qaRow.asset_ref);
  if (!qaAsset || !readAsset(project, qaAsset)) return reject([{ code: 'ASSET_FILE_CHANGED', shot_id: 'qa', asset_ref: qaRow.asset_ref }]);

  const snap = getProjectSnapshot(db, id);
  const srtRef: string | undefined = snap.alignment?.document?.srt_ref;
  const wavRef: string | undefined = snap.audio?.document?.master_ref;
  const srtAsset = srtRef ? getAsset(db, srtRef) : undefined;
  const wavAsset = wavRef ? getAsset(db, wavRef) : undefined;
  if (!srtAsset || !readAsset(project, srtAsset)) return reject([{ code: 'ASSET_NOT_FOUND', shot_id: 'subtitles', asset_ref: srtRef ?? 'missing' }]);
  if (!wavAsset || !readAsset(project, wavAsset)) return reject([{ code: 'ASSET_NOT_FOUND', shot_id: 'audio', asset_ref: wavRef ?? 'missing' }]);

  const projectAssetsToArchive = snap.activeAssets.filter((a) => !isExportArtifact(a.kind));
  for (const a of projectAssetsToArchive) {
    if (!readAsset(project, a)) return reject([{ code: 'ASSET_FILE_CHANGED', shot_id: a.name, asset_ref: a.asset_ref }]);
  }

  // Take a clean WAL-safe SQLite snapshot before writing export artifacts into the live DB.
  const snapTmpDir = mkdtempSync(join(tmpdir(), 'svs-db-snap-'));
  const snapTmpPath = join(snapTmpDir, 'studio.sqlite');
  let dbSnapBytes: Buffer;
  try {
    db.prepare('VACUUM INTO ?').run(snapTmpPath);
    const snapDb = new DatabaseSync(snapTmpPath);
    try {
      snapDb.exec(`
        UPDATE sessions SET token_hash = 'redacted:' || session_id;
        DELETE FROM asset_usage WHERE asset_ref IN (SELECT asset_ref FROM assets WHERE kind LIKE 'export-%' OR kind = 'final-package');
        DELETE FROM invalidated_assets WHERE asset_ref IN (SELECT asset_ref FROM assets WHERE kind LIKE 'export-%' OR kind = 'final-package');
        DELETE FROM assets WHERE kind LIKE 'export-%' OR kind = 'final-package';
        PRAGMA journal_mode = DELETE;
      `);
    } finally {
      snapDb.close();
    }
    dbSnapBytes = readFileSync(snapTmpPath);
  } finally {
    rmSync(snapTmpDir, { recursive: true, force: true });
  }

  const qaBundle = JSON.parse(qaRow.bundle_body);
  const qaReport = JSON.parse(qaRow.report_body);
  const contactSheetAsset = qaBundle?.contact_sheet?.asset_ref ? getAsset(db, qaBundle.contact_sheet.asset_ref) : undefined;
  const waveformImgAsset = qaBundle?.waveform?.png_ref ? getAsset(db, qaBundle.waveform.png_ref) : undefined;
  const hasContactSheet = Boolean(contactSheetAsset && readAsset(project, contactSheetAsset));
  const hasWaveform = Boolean(waveformImgAsset && readAsset(project, waveformImgAsset));

  const approvalsG1ToG4 = snap.approvals.filter((a) => ['G1', 'G2', 'G3', 'G4'].includes(a.gate));
  const sourcesDoc = {
    project_id: id,
    brief: snap.brief?.document ?? null,
    evidence: snap.evidence?.document ?? null,
    script: snap.script?.document ?? null,
    claim_to_sources: [...snap.claimToSources.values()],
  };
  const costDoc = {
    project_id: id,
    budget: snap.cost.budget,
    entries: snap.cost.ledger.entries,
    jobs: snap.cost.ledger.jobs,
  };
  const chaptersDoc = {
    project_id: id,
    timeline_version: snap.timeline?.version ?? 0,
    total_frames: snap.timeline?.document?.timeline?.total_frames ?? 0,
    fps: FPS,
    chapters: (snap.storyboard?.document?.storyboard?.chapters ?? []).map((c: any) => ({
      chapter_id: c.chapter_id,
      title: c.title,
      frame_range: c.frame_range,
      start_seconds: Number((c.frame_range.start / FPS).toFixed(3)),
      end_seconds: Number((c.frame_range.end / FPS).toFixed(3)),
      continuity_in: c.continuity_in,
      continuity_out: c.continuity_out,
    })),
  };

  return transaction(db, () => {
    const pre = precheck(db, request, digest);
    if (pre.done) return pre.done;

    const manifestVersion = Number((db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM export_manifests WHERE project_id = ?').get(id) as { v: number }).v);
    const includeHtml = request.include_review_html !== false;

    const sourcesAsset = registerAsset(db, project, id, 'export_sources', 'export-sources', 'json', JSON.stringify(sourcesDoc, null, 2) + '\n', { manifest_version: manifestVersion });
    const costAsset = registerAsset(db, project, id, 'export_cost', 'export-cost', 'json', JSON.stringify(costDoc, null, 2) + '\n', { manifest_version: manifestVersion });
    const approvalsAsset = registerAsset(db, project, id, 'export_approvals', 'export-approvals', 'json', JSON.stringify({ project_id: id, approvals: approvalsG1ToG4 }, null, 2) + '\n', { manifest_version: manifestVersion });
    const chaptersAsset = registerAsset(db, project, id, 'export_chapters', 'export-chapters', 'json', JSON.stringify(chaptersDoc, null, 2) + '\n', { manifest_version: manifestVersion });
    const dbSnapAsset = registerAsset(db, project, id, 'export_project_db', 'export-project-db', 'sqlite', dbSnapBytes, { manifest_version: manifestVersion });
    const reviewHtmlAsset = includeHtml
      ? registerAsset(db, project, id, 'export_review_html', 'export-review-html', 'html',
        buildReviewHtml(snap, { manifestVersion, finalMediaSha256: finalMediaAsset!.sha256, qaReport, approvalsG1ToG4, hasContactSheet, hasWaveform }),
        { manifest_version: manifestVersion })
      : null;

    const files: { relative_path: string; asset_ref: string; hash: string; role: string }[] = [
      { relative_path: 'deliverables/final.mp4', asset_ref: finalMediaAsset!.asset_ref, hash: finalMediaAsset!.sha256, role: 'video' },
      { relative_path: 'deliverables/subtitles.srt', asset_ref: srtAsset.asset_ref, hash: srtAsset.sha256, role: 'subtitles' },
      { relative_path: 'deliverables/voice-master.wav', asset_ref: wavAsset.asset_ref, hash: wavAsset.sha256, role: 'audio' },
      { relative_path: 'deliverables/sources.json', asset_ref: sourcesAsset.asset_ref, hash: sourcesAsset.sha256, role: 'sources' },
      { relative_path: 'deliverables/qa-report.json', asset_ref: qaAsset.asset_ref, hash: qaAsset.sha256, role: 'qa' },
      { relative_path: 'deliverables/cost-ledger.json', asset_ref: costAsset.asset_ref, hash: costAsset.sha256, role: 'cost' },
      { relative_path: 'deliverables/approvals-g1-g4.json', asset_ref: approvalsAsset.asset_ref, hash: approvalsAsset.sha256, role: 'approvals' },
      { relative_path: 'deliverables/chapters.json', asset_ref: chaptersAsset.asset_ref, hash: chaptersAsset.sha256, role: 'chapters' },
      ...(hasContactSheet ? [{ relative_path: 'deliverables/contact-sheet.png', asset_ref: contactSheetAsset!.asset_ref, hash: contactSheetAsset!.sha256, role: 'qa' }] : []),
      ...(hasWaveform ? [{ relative_path: 'deliverables/waveform.png', asset_ref: waveformImgAsset!.asset_ref, hash: waveformImgAsset!.sha256, role: 'qa' }] : []),
      ...(reviewHtmlAsset ? [{ relative_path: 'deliverables/review-report.html', asset_ref: reviewHtmlAsset.asset_ref, hash: reviewHtmlAsset.sha256, role: 'other' }] : []),
      { relative_path: 'project/studio.sqlite', asset_ref: dbSnapAsset.asset_ref, hash: dbSnapAsset.sha256, role: 'editable_project' },
      ...projectAssetsToArchive.map((a) => ({
        relative_path: `project/${a.path.split(sep).join('/')}`,
        asset_ref: a.asset_ref,
        hash: a.sha256,
        role: 'editable_project',
      })),
    ];

    const version_pins = [
      { component: 'node', version: process.version },
      { component: 'ffmpeg', version: toolVersion('ffmpeg') ?? 'unknown' },
      { component: 'renderer', version: `${RENDERER.name}@${RENDERER.version}` },
      { component: 'inspector', version: `${INSPECTOR.name}@${INSPECTOR.version}` },
      { component: 'packager', version: 'package-project@1.0.0' },
    ];

    const exportManifest = {
      project_id: id,
      version: manifestVersion,
      final_media_ref: finalMediaAsset!.asset_ref,
      qa_ref: qaAsset.asset_ref,
      g4_approval_id: g4Row.approval_id,
      files,
      version_pins,
    };

    const manifestBytes = Buffer.from(JSON.stringify(exportManifest, null, 2) + '\n', 'utf8');
    const manifestHash = sha256(manifestBytes);
    const manifestAsset = registerAsset(db, project, id, 'export_manifest', 'export-manifest', 'json', manifestBytes,
      { manifest_version: manifestVersion, g4_approval_id: g4Row.approval_id, final_media_ref: finalMediaAsset!.asset_ref });

    const step = advance(db, request, 'manifest_prepared',
      { artifact_hash: manifestHash, manifest_ref: manifestAsset.asset_ref, g4_approval_id: g4Row.approval_id }, digest);
    if ('done' in step) return step.done;

    const prevManifestRow = manifestVersion > 1
      ? db.prepare('SELECT body FROM export_manifests WHERE project_id = ? AND version = ?').get(id, manifestVersion - 1) as { body: string } | undefined
      : undefined;
    const prevByPath = new Map<string, string>(prevManifestRow
      ? JSON.parse(prevManifestRow.body).files.map((f: any) => [f.relative_path, f.hash])
      : []);
    const diff_from_previous = {
      added: files.filter((f) => !prevByPath.has(f.relative_path)).map((f) => f.relative_path),
      replaced: files.filter((f) => prevByPath.has(f.relative_path) && prevByPath.get(f.relative_path) !== f.hash).map((f) => f.relative_path),
      unchanged: files.filter((f) => prevByPath.get(f.relative_path) === f.hash).map((f) => f.relative_path),
    };

    db.prepare(`INSERT INTO export_manifests (manifest_id, project_id, version, manifest_ref, manifest_hash, g4_approval_id, final_media_ref, qa_ref, body, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newId('man'), id, manifestVersion, manifestAsset.asset_ref, manifestHash,
      g4Row.approval_id, finalMediaAsset!.asset_ref, qaAsset.asset_ref, JSON.stringify(exportManifest), new Date().toISOString(),
    );

    return summary(db, id, 'APPLIED', [], {
      event_id: step.eventId,
      manifest_ref: manifestAsset.asset_ref,
      manifest_path: manifestAsset.path,
      manifest_hash: manifestHash,
      export_manifest: exportManifest,
      review_html_path: reviewHtmlAsset?.path ?? null,
      diff_from_previous,
    });
  });
}
