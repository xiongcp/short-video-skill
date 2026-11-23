// T12 production acceptance: owner attestation per episode (`attest`), the per-episode acceptance check (`accept`),
// and aggregation by run_id across episodes (`programme`). Production PASS requires every check; nothing here can
// make fixture material pass, because genuine voice, original art and a full watch-through are owner attestations
// recorded only through a passphrase-authenticated session.
import { join, resolve } from 'node:path';
import { GATES, currentTarget, humanSession, requirementIssues } from './approvals.ts';
import { getAsset } from './assets.ts';
import { latest } from './content.ts';
import { balance } from './ledger.ts';
import { type Db, type Issue, type Outcome, getProject, newId, openStore, summary, transaction } from './project-store.ts';
import { FPS } from './timebase.ts';
import { inspectTechnical } from '../tools/inspect_media/adapter.ts';

export const ATTESTATION_ITEMS = ['voice_genuine', 'art_original', 'sources_owner_approved', 'full_review_watched', 'cost_confirmed'] as const;
const SHORT_TARGETS = [60, 120, 180];
const LONG_WINDOW = { min: 450, max: 510 };
const GATE_IDS = Object.keys(GATES);


const latestPackage = (db: Db, projectId: string) =>
  db.prepare('SELECT package_id, manifest_hash, archive_hash FROM packages WHERE project_id = ? AND verified = 1 ORDER BY version DESC LIMIT 1')
    .get(projectId) as { package_id: string; manifest_hash: string; archive_hash: string } | undefined;

export interface AttestRequest {
  project_id: string; archive_hash: string; items: Record<string, unknown>;
  actual_cost_minor: number; currency: string; notes?: string;
}

// The owner states, item by item, what is genuine about the episode bound to its verified archive.
export function attestOp(project: string, request: AttestRequest, token = process.env.SVS_SESSION_TOKEN): Outcome {
  const db = openStore(project);
  return transaction(db, () => {
    const reject = (issue: Issue) => summary(db, request.project_id, 'REJECTED', [issue]);
    if (!getProject(db, request.project_id)) return reject({ code: 'PROJECT_NOT_FOUND', ref: request.project_id });
    const session = humanSession(db, token);
    if (!session) return reject({ code: 'HUMAN_REQUIRED', action: 'attest' });
    if (session.auth !== 'passphrase') return reject({ code: 'OWNER_AUTH_REQUIRED', action: 'attest' });
    const pkg = latestPackage(db, request.project_id);
    if (!pkg || pkg.archive_hash !== request.archive_hash) {
      return reject({ code: 'ATTESTATION_TARGET_MISMATCH', archive_hash: request.archive_hash, current_archive_hash: pkg?.archive_hash ?? null });
    }
    const items = request.items ?? {};
    const bad = ATTESTATION_ITEMS.find((item) => typeof items[item] !== 'boolean');
    if (bad || !Number.isInteger(request.actual_cost_minor) || request.actual_cost_minor < 0 || !request.currency) {
      return reject({ code: 'ATTESTATION_ITEMS_INVALID', item: bad ?? 'actual_cost_minor' });
    }
    const attestation_id = newId('att');
    db.prepare(`INSERT INTO attestations (attestation_id, project_id, package_id, archive_hash, items, actual_cost_minor, currency, reviewer_id, session_id, notes, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(attestation_id, request.project_id, pkg.package_id, pkg.archive_hash,
      JSON.stringify(Object.fromEntries(ATTESTATION_ITEMS.map((item) => [item, items[item]]))), request.actual_cost_minor, request.currency,
      session.reviewer_id, session.session_id, request.notes ?? '', new Date().toISOString());
    return summary(db, request.project_id, 'ATTESTED', [], { attestation_id, archive_hash: pkg.archive_hash, reviewer_id: session.reviewer_id });
  });
}

export interface AcceptRequest { project_id: string; run_id: string; criterion: 'A14' | 'A15'; target_seconds?: number }
interface Check { check: string; status: 'PASS' | 'MISSING'; issues: Issue[] }

function framesCheck(db: Db, project: string, request: AcceptRequest): { check: Check; frames: number | null } {
  const issues: Issue[] = [];
  const t = request.target_seconds;
  if (request.criterion === 'A14' && !SHORT_TARGETS.includes(t as number)) issues.push({ code: 'ACCEPT_TARGET_INVALID', target_seconds: t ?? null, allowed: SHORT_TARGETS.join('/') });
  if (request.criterion === 'A15' && t !== undefined && (t < LONG_WINDOW.min || t > LONG_WINDOW.max)) {
    issues.push({ code: 'ACCEPT_TARGET_INVALID', target_seconds: t, allowed: `${LONG_WINDOW.min}-${LONG_WINDOW.max}` });
  }
  const manifest = db.prepare('SELECT final_media_ref FROM export_manifests WHERE project_id = ? ORDER BY version DESC LIMIT 1')
    .get(request.project_id) as { final_media_ref: string } | undefined;
  const asset = manifest && getAsset(db, manifest.final_media_ref);
  if (!asset) return { check: { check: 'exact_frames', status: 'MISSING', issues: [...issues, { code: 'ACCEPT_MEDIA_MISSING' }] }, frames: null };
  const technical = inspectTechnical(join(project, asset.path));
  const frames = Number(technical.observed.frames ?? 0);
  if (technical.status !== 'PASS' || technical.media_hash !== asset.sha256) {
    issues.push({ code: 'ACCEPT_MEDIA_TECHNICAL', media_ref: asset.asset_ref, detail: technical.issues.join(',') || 'hash' });
  }
  if (request.criterion === 'A14' && t !== undefined && frames !== t * FPS) issues.push({ code: 'ACCEPT_FRAMES', frames, expected: t * FPS });
  if (request.criterion === 'A15') {
    if (t !== undefined && frames !== t * FPS) issues.push({ code: 'ACCEPT_FRAMES', frames, expected: t * FPS });
    else if (frames < LONG_WINDOW.min * FPS || frames > LONG_WINDOW.max * FPS) {
      issues.push({ code: 'ACCEPT_FRAMES', frames, expected: `${LONG_WINDOW.min * FPS}-${LONG_WINDOW.max * FPS}` });
    }
  }
  return { check: { check: 'exact_frames', status: issues.length ? 'MISSING' : 'PASS', issues }, frames };
}

// Every gate must be approved on its current material by a passphrase-authenticated owner session.
function gatesCheck(db: Db, projectId: string): Check {
  const issues = requirementIssues(db, projectId, GATE_IDS, {});
  for (const gate of GATE_IDS) {
    if (issues.some((i) => i.gate === gate)) continue;
    const row = db.prepare(`SELECT s.auth FROM approvals a JOIN sessions s ON s.session_id = a.session_id
      WHERE a.project_id = ? AND a.gate = ? AND a.decision = 'approve' ORDER BY a.version DESC LIMIT 1`).get(projectId, gate) as { auth: string } | undefined;
    if (row?.auth !== 'passphrase') issues.push({ code: 'ACCEPT_GATE_NOT_OWNER', gate });
  }
  return { check: 'gates', status: issues.length ? 'MISSING' : 'PASS', issues };
}

function episodeFacts(db: Db, projectId: string) {
  const chapters = new Set<string>((latest(db, projectId, 'storyboard')?.document?.storyboard?.chapters ?? []).map((c: any) => c.chapter_id));
  const plans = db.prepare('SELECT plan_body FROM change_plans WHERE project_id = ? AND applied_snapshot_hash IS NOT NULL').all(projectId) as { plan_body: string }[];
  const revised = plans.some((p) => (JSON.parse(p.plan_body).invalidate ?? []).filter((x: string) => chapters.has(x)).length >= 2);
  const recovered = Boolean(db.prepare("SELECT 1 FROM render_events WHERE project_id = ? AND run_id LIKE 'rec-%' LIMIT 1").get(projectId));
  return { revised, recovered };
}

export function episodeAcceptance(project: string, request: AcceptRequest) {
  const db = openStore(project);
  const p = getProject(db, request.project_id);
  if (!p) return null;
  const { check: frames, frames: measured } = framesCheck(db, project, request);
  const pkg = latestPackage(db, request.project_id);
  const att = db.prepare('SELECT archive_hash, items, actual_cost_minor FROM attestations WHERE project_id = ? ORDER BY rowid DESC LIMIT 1')
    .get(request.project_id) as { archive_hash: string; items: string; actual_cost_minor: number } | undefined;
  const attIssues: Issue[] = !att ? [{ code: 'ACCEPT_ATTESTATION_MISSING' }]
    : att.archive_hash !== pkg?.archive_hash ? [{ code: 'ACCEPT_ATTESTATION_STALE', archive_hash: att.archive_hash, current_archive_hash: pkg?.archive_hash ?? null }]
    : Object.entries(JSON.parse(att.items)).filter(([, v]) => v !== true).map(([item]) => ({ code: 'ACCEPT_ATTESTATION_ITEM', item }));
  const money = balance(db, request.project_id);
  const costIssues: Issue[] = !att ? [{ code: 'ACCEPT_COST_UNCONFIRMED' }] : [
    ...(att.actual_cost_minor !== money.spent_minor ? [{ code: 'ACCEPT_COST_MISMATCH', attested_minor: att.actual_cost_minor, ledger_minor: money.spent_minor }] : []),
    ...(money.pending_verification_minor > 0 ? [{ code: 'ACCEPT_COST_UNRECONCILED', pending_minor: money.pending_verification_minor }] : []),
  ];
  const check = (name: string, issues: Issue[]): Check => ({ check: name, status: issues.length ? 'MISSING' : 'PASS', issues });
  const checks: Check[] = [
    check('quality_mode', p.mode === 'quality' ? [] : [{ code: 'ACCEPT_DRAFT_MODE' }]),
    check('delivered', p.state === 'DELIVERED' ? [] : [{ code: 'ACCEPT_NOT_DELIVERED', state: p.state }]),
    frames,
    gatesCheck(db, request.project_id),
    check('archive', !pkg ? [{ code: 'ACCEPT_ARCHIVE_MISSING' }]
      : pkg.manifest_hash !== currentTarget(db, request.project_id, 'G5') ? [{ code: 'ACCEPT_ARCHIVE_STALE', manifest_hash: pkg.manifest_hash }] : []),
    check('attestation', attIssues),
    check('cost', costIssues),
  ];
  const missing = checks.filter((c) => c.status === 'MISSING').map((c) => c.check);
  return {
    run_id: request.run_id, criterion: request.criterion, target_seconds: request.target_seconds ?? null, frames: measured,
    status: missing.length ? 'INCOMPLETE' : 'PRODUCTION_PASS', evidence_level: missing.length ? 'BELOW_PRODUCTION' : 'PRODUCTION',
    checks, missing, facts: episodeFacts(db, request.project_id), issues: checks.flatMap((c) => c.issues),
  };
}

export function acceptOp(project: string, request: AcceptRequest): Outcome {
  const result = episodeAcceptance(project, request);
  if (!result) return { report: { status: 'REJECTED', issues: [{ code: 'PROJECT_NOT_FOUND', ref: request.project_id }] }, exitCode: 1 };
  return { report: { project_id: request.project_id, ...result }, exitCode: result.status === 'PRODUCTION_PASS' ? 0 : 1 };
}

type EpisodeResult = { run_id: string; criterion: string; target_seconds: number | null; status: string; checks: { check: string; status: string }[];
  facts: { revised: boolean; recovered: boolean } };

// A14: 60/120/180 s each with exact frames, at least one production PASS. A15: three production PASS episodes with
// distinct run_ids, at least one revised across chapters and recovered after a restart.
export function aggregateProgrammes(episodes: EpisodeResult[]) {
  const byCriterion = (c: string) => episodes.filter((e) => e.criterion === c);
  const dupes = (list: EpisodeResult[]) => [...new Set(list.map((e) => e.run_id).filter((id, i, all) => all.indexOf(id) !== i))]
    .map((run_id) => ({ code: 'PROGRAMME_RUN_ID_DUPLICATE', run_id }));
  const view = (list: EpisodeResult[]) => list.map(({ run_id, target_seconds, status, facts }) => ({ run_id, target_seconds, status, facts }));
  const short = byCriterion('A14');
  const shortIssues: Issue[] = [...dupes(short),
    ...SHORT_TARGETS.filter((t) => !short.some((e) => e.target_seconds === t && e.checks.find((c) => c.check === 'exact_frames')?.status === 'PASS'))
      .map((target_seconds) => ({ code: 'PROGRAMME_DURATION_MISSING', target_seconds })),
    ...(short.some((e) => e.status === 'PRODUCTION_PASS') ? [] : [{ code: 'PROGRAMME_PRODUCTION_MISSING', criterion: 'A14', required: 1 }])];
  const long = byCriterion('A15');
  const passed = [...new Set(long.filter((e) => e.status === 'PRODUCTION_PASS').map((e) => e.run_id))];
  const longIssues: Issue[] = [...dupes(long),
    ...(passed.length >= 3 ? [] : [{ code: 'PROGRAMME_PRODUCTION_MISSING', criterion: 'A15', required: 3, passed: passed.length }]),
    ...(long.some((e) => e.status === 'PRODUCTION_PASS' && e.facts.revised && e.facts.recovered) ? [] : [{ code: 'PROGRAMME_REVISION_MISSING' }])];
  const result = (issues: Issue[], list: EpisodeResult[]) => ({ status: issues.length ? 'INCOMPLETE' : 'PASS', issues, episodes: view(list) });
  return { A14: result(shortIssues, short), A15: result(longIssues, long) };
}

export interface ProgrammeRequest { episodes: (AcceptRequest & { project_dir: string })[] }

// Aggregate several episode projects (each in its own directory, relative to --project) by run_id.
export function programmeOp(project: string, request: ProgrammeRequest): Outcome {
  const results = (request.episodes ?? []).map((e) => episodeAcceptance(resolve(project, e.project_dir), e)
    ?? { run_id: e.run_id, criterion: e.criterion, target_seconds: e.target_seconds ?? null, status: 'INCOMPLETE', checks: [], missing: ['project'],
      facts: { revised: false, recovered: false }, issues: [{ code: 'PROJECT_NOT_FOUND', ref: e.project_id }] });
  const programmes = aggregateProgrammes(results);
  const pass = programmes.A14.status === 'PASS' && programmes.A15.status === 'PASS';
  return { report: { status: pass ? 'PASS' : 'INCOMPLETE', programmes, episodes: results, issues: [...programmes.A14.issues, ...programmes.A15.issues] }, exitCode: pass ? 0 : 1 };
}
