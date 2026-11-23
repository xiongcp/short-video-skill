// Budget and ledger in minor currency units. Only reserve/settle/release rows move money; balances are derived.
import { humanSession } from './approvals.ts';
import { type Db, type Outcome, getProject, newId, openStore, summary, transaction } from './project-store.ts';

export interface LedgerRow {
  project_id: string; version: number; entry_id: string; job_id: string; reservation_id: string | null;
  operation: 'reserve' | 'settle' | 'release' | 'cache_hit'; currency: string; amount_minor: number;
  recorded_at: string; external_receipt: string | null;
}

export const currentBudget = (db: Db, projectId: string) =>
  db.prepare('SELECT currency, project_limit_minor FROM budgets WHERE project_id = ? ORDER BY rowid DESC LIMIT 1').get(projectId) as
    { currency: string; project_limit_minor: number } | undefined;

export function record(db: Db, projectId: string, entry: Pick<LedgerRow, 'job_id' | 'reservation_id' | 'operation' | 'amount_minor' | 'external_receipt'>) {
  const version = Number((db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM ledger WHERE project_id = ?').get(projectId) as { v: number }).v);
  db.prepare(`INSERT INTO ledger (entry_id, project_id, version, job_id, reservation_id, operation, currency, amount_minor, recorded_at, external_receipt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(newId('led'), projectId, version, entry.job_id, entry.reservation_id, entry.operation,
    currentBudget(db, projectId)!.currency, entry.amount_minor, new Date().toISOString(), entry.external_receipt);
}

type JobMoney = { project_id: string; job_id: string; reservation_id: string; quote_minor: number };

export function reserve(db: Db, job: JobMoney) {
  record(db, job.project_id, { job_id: job.job_id, reservation_id: job.reservation_id, operation: 'reserve', amount_minor: job.quote_minor, external_receipt: null });
}

// A confirmed charge settles the actual cost and releases the whole reservation.
export function settle(db: Db, job: JobMoney, costMinor: number, receipt: string) {
  record(db, job.project_id, { job_id: job.job_id, reservation_id: job.reservation_id, operation: 'settle', amount_minor: costMinor, external_receipt: receipt });
  release(db, job);
}

export function release(db: Db, job: JobMoney) {
  record(db, job.project_id, { job_id: job.job_id, reservation_id: job.reservation_id, operation: 'release', amount_minor: job.quote_minor, external_receipt: null });
}

export function balance(db: Db, projectId: string) {
  const budget = currentBudget(db, projectId);
  const sum = (operation: string) => Number((db.prepare('SELECT COALESCE(SUM(amount_minor), 0) AS s FROM ledger WHERE project_id = ? AND operation = ?')
    .get(projectId, operation) as { s: number }).s);
  const held = sum('reserve') - sum('release');
  const spent = sum('settle');
  const pending = Number((db.prepare(`SELECT COALESCE(SUM(quote_minor), 0) AS s FROM jobs WHERE project_id = ? AND state IN ('UNKNOWN', 'SUBMITTING')`)
    .get(projectId) as { s: number }).s);
  return {
    currency: budget?.currency ?? null, limit_minor: budget?.project_limit_minor ?? null,
    held_minor: held, spent_minor: spent, pending_verification_minor: pending,
    available_minor: budget ? budget.project_limit_minor - held - spent : null,
  };
}

// Setting or raising the limit is human-only (policies/permissions.yaml: authorize_budget_increase).
export function setBudget(project: string, request: { project_id: string; currency: string; project_limit_minor: number },
  token = process.env.SVS_SESSION_TOKEN): Outcome {
  const db = openStore(project);
  return transaction(db, () => {
    const reject = (code: string, extra = {}) => summary(db, request.project_id, 'REJECTED', [{ code, ...extra }]);
    if (!getProject(db, request.project_id)) return reject('PROJECT_NOT_FOUND', { ref: request.project_id });
    const session = humanSession(db, token);
    if (!session) return reject('HUMAN_REQUIRED', { action: 'authorize_budget_increase' });
    if (!/^[A-Z]{3}$/.test(request.currency ?? '') || !Number.isInteger(request.project_limit_minor) || request.project_limit_minor < 0) {
      return reject('BUDGET_INVALID');
    }
    db.prepare('INSERT INTO budgets (budget_id, project_id, currency, project_limit_minor, reviewer_id, session_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(newId('bud'), request.project_id, request.currency, request.project_limit_minor, session.reviewer_id, session.session_id, new Date().toISOString());
    return summary(db, request.project_id, 'APPLIED', [], { budget: balance(db, request.project_id) });
  });
}

export function ledger(project: string, request: { project_id: string }): Outcome {
  const db = openStore(project);
  if (!getProject(db, request.project_id)) return summary(db, request.project_id, 'REJECTED', [{ code: 'PROJECT_NOT_FOUND', ref: request.project_id }]);
  const entries = db.prepare('SELECT project_id, version, entry_id, job_id, reservation_id, operation, currency, amount_minor, recorded_at, external_receipt FROM ledger WHERE project_id = ? ORDER BY version').all(request.project_id);
  const jobs = db.prepare('SELECT job_id, idempotency_key, skill_id, tool, provider, provider_job_id, state, reservation_id, quote_minor, cost_minor, external_receipt, attempt FROM jobs WHERE project_id = ? ORDER BY created_at').all(request.project_id);
  return summary(db, request.project_id, 'OK', [], { ...balance(db, request.project_id), entries, jobs });
}
