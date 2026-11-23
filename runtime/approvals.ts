// Human gate decisions G1–G5, bound to (project_id, gate, target_hash) and to an authenticated host session.
import { createHash, randomBytes } from 'node:crypto';
import { type Db, type Issue, appendEvent, newId, openStore, precheck, requestHash, summary, transaction } from './project-store.ts';

// Event that produces each gate's material, the state where it is reviewed, and where a rejection re-enters.
export const GATES: Record<string, { material: string; review: string; reenter: string }> = {
  G1: { material: 'evidence_saved', review: 'RESEARCH_REVIEW', reenter: 'RESEARCH_RUNNING' },
  G2: { material: 'script_saved', review: 'SCRIPT_REVIEW', reenter: 'SCRIPT_RUNNING' },
  G3: { material: 'sample_rendered', review: 'SAMPLE_REVIEW', reenter: 'RENDERING' },
  G4: { material: 'master_checked', review: 'FINAL_REVIEW', reenter: 'FINAL_RENDER' },
  G5: { material: 'manifest_prepared', review: 'EXPORT_REVIEW', reenter: 'APPROVED' },
};
export const MATERIAL_EVENTS = new Set(Object.values(GATES).map((gate) => gate.material));

const tokenHash = (token: string) => 'sha256:' + createHash('sha256').update(token).digest('hex');

// Host-side authentication hook. It is deliberately not a CLI operation, so an agent cannot mint a human session.
export function createSession(project: string, { reviewer_id, kind }: { reviewer_id: string; kind: 'human' | 'agent' }) {
  const token = randomBytes(32).toString('hex');
  const db = openStore(project);
  db.prepare('INSERT INTO sessions (session_id, reviewer_id, kind, token_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(newId('ses'), reviewer_id, kind, tokenHash(token), new Date().toISOString());
  return token;
}

export interface Session { session_id: string; reviewer_id: string; kind: string }

export function humanSession(db: Db, token: string | undefined): Session | undefined {
  const session = token ? db.prepare('SELECT session_id, reviewer_id, kind FROM sessions WHERE token_hash = ?').get(tokenHash(token)) as
    Session | undefined : undefined;
  return session?.kind === 'human' ? session : undefined;
}

export function currentTarget(db: Db, projectId: string, gate: string): string | null {
  const row = db.prepare('SELECT payload FROM events WHERE project_id = ? AND event = ? ORDER BY version DESC LIMIT 1')
    .get(projectId, GATES[gate].material) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload).artifact_hash : null;
}

// Gate requirements need the latest decision on the current material to be an approval.
// QA facts (sample_qa_pass / final_qa_pass) are checked against recorded T10 qa_reports when present;
// if no QA report is recorded yet for that hash, falls back to payload.checks for legacy workflow tests.
export function requirementIssues(db: Db, projectId: string, requires: string[], payload: any): Issue[] {
  return requires.flatMap((name): Issue[] => {
    if (!GATES[name]) {
      if (name === 'sample_qa_pass' || name === 'final_qa_pass') {
        const qaTarget = name === 'sample_qa_pass'
          ? (payload?.target_hash ?? currentTarget(db, projectId, 'G3'))
          : (payload?.artifact_hash ?? payload?.target_hash);
        if (qaTarget) {
          const qa = db.prepare('SELECT result, blocking_count FROM qa_reports WHERE project_id = ? AND target_hash = ? ORDER BY version DESC LIMIT 1')
            .get(projectId, qaTarget) as { result: string; blocking_count: number } | undefined;
          if (qa) {
            return qa.result === 'fail' || qa.blocking_count > 0
              ? [{ code: 'QA_BLOCKING_ISSUES', requirement: name, target_hash: qaTarget, blocking_count: qa.blocking_count }]
              : [];
          }
        }
      }
      if (name === 'archive_hashes_match') {
        const manifestHash = payload?.manifest_hash ?? currentTarget(db, projectId, 'G5');
        if (manifestHash) {
          const pkg = db.prepare('SELECT verified FROM packages WHERE project_id = ? AND manifest_hash = ? ORDER BY version DESC LIMIT 1')
            .get(projectId, manifestHash) as { verified: number } | undefined;
          if (pkg) {
            return pkg.verified === 1
              ? []
              : [{ code: 'ARCHIVE_VERIFY_FAILED', manifest_hash: manifestHash }];
          }
        }
      }
      return payload?.checks?.[name] === true ? [] : [{ code: 'REQUIREMENT_UNMET', requirement: name }];
    }
    const target = currentTarget(db, projectId, name);
    const latest = db.prepare('SELECT decision FROM approvals WHERE project_id = ? AND gate = ? AND target_hash = ? ORDER BY version DESC LIMIT 1')
      .get(projectId, name, target) as { decision: string } | undefined;
    if (latest?.decision === 'approve') return [];
    const older = db.prepare("SELECT target_hash FROM approvals WHERE project_id = ? AND gate = ? AND decision = 'approve' AND target_hash != ? ORDER BY version DESC LIMIT 1")
      .get(projectId, name, target) as { target_hash: string } | undefined;
    return [older
      ? { code: 'APPROVAL_STALE', gate: name, current_target_hash: target, approved_target_hash: older.target_hash }
      : { code: 'APPROVAL_MISSING', gate: name, current_target_hash: target }];
  });
}

export interface DecisionRequest {
  project_id: string; expected_version: number; idempotency_key: string;
  gate: string; target_hash: string; decision: string; notes: string;
}

export function decide(project: string, request: DecisionRequest, token = process.env.SVS_SESSION_TOKEN) {
  const db = openStore(project);
  return transaction(db, () => {
    const reject = (issue: Issue) => summary(db, request.project_id, 'REJECTED', [issue]);
    if ('reviewer_id' in request || 'reviewer' in request) return reject({ code: 'REVIEWER_IN_REQUEST', gate: request.gate });
    const session = humanSession(db, token);
    if (!session) return reject({ code: 'APPROVAL_UNAUTHENTICATED', gate: request.gate });

    const hash = requestHash({ ...request, session_id: session.session_id });
    const pre = precheck(db, request, hash);
    if (pre.done) return pre.done;
    const gate = GATES[request.gate];
    if (!gate || !['approve', 'reject'].includes(request.decision)) return reject({ code: 'DECISION_INVALID', gate: request.gate, decision: request.decision });
    const target = currentTarget(db, request.project_id, request.gate);
    if (!target || request.target_hash !== target) {
      return reject({ code: 'APPROVAL_TARGET_MISMATCH', gate: request.gate, target_hash: request.target_hash, current_target_hash: target });
    }
    if (request.gate === 'G3' && request.decision === 'approve') {
      const qa = db.prepare('SELECT result, blocking_count FROM qa_reports WHERE project_id = ? AND target_hash = ? ORDER BY version DESC LIMIT 1')
        .get(request.project_id, target) as { result: string; blocking_count: number } | undefined;
      if (qa && (qa.result === 'fail' || qa.blocking_count > 0)) {
        return reject({ code: 'QA_BLOCKING_ISSUES', gate: 'G3', target_hash: target, blocking_count: qa.blocking_count });
      }
      const openRow = db.prepare('SELECT COALESCE(SUM(open_required_fixes), 0) AS n FROM ab_comparisons WHERE project_id = ? AND target_hash = ?')
        .get(request.project_id, target) as { n: number };
      if (openRow.n > 0) {
        return reject({ code: 'REQUIRED_FIXES_OPEN', gate: 'G3', target_hash: target, open_count: openRow.n });
      }
    }

    const current = pre.project;
    const to = request.decision === 'reject' && current.state === gate.review ? gate.reenter : current.state;
    const { gate: gateId, target_hash, decision, notes } = request;
    const eventId = appendEvent(db, current, { idempotency_key: request.idempotency_key, payload: { gate: gateId, target_hash, decision, notes } },
      hash, 'approval_recorded', to, `human:${session.reviewer_id}`);
    const approval = { project_id: request.project_id, version: current.version + 1, approval_id: newId('apv'), gate: gateId, target_hash,
      reviewer_id: session.reviewer_id, decision, recorded_at: new Date().toISOString(), notes: notes ?? '' };
    db.prepare(`INSERT INTO approvals (approval_id, project_id, version, gate, target_hash, reviewer_id, decision, recorded_at, notes, session_id, event_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(approval.approval_id, approval.project_id, approval.version, gateId, target_hash,
      approval.reviewer_id, decision, approval.recorded_at, approval.notes, session.session_id, eventId);
    return summary(db, request.project_id, 'APPLIED', [], { event_id: eventId, approval });
  });
}
