// Paid provider jobs: permission check, reservation + intent in one transaction, submit with the original key,
// and reconciliation of unknown receipts by that key. UNKNOWN work is never resubmitted (policies/budget.yaml).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { balance, currentBudget, release, reserve, settle } from './ledger.ts';
import { type Db, type Issue, type Outcome, getProject, newId, openStore, requestHash, summary, transaction } from './project-store.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// policies/permissions.yaml lists `skill: [tool, ...]` under `skills:`; anything unlisted is denied.
function loadPermissions(path = join(ROOT, 'policies', 'permissions.yaml')) {
  const block = readFileSync(path, 'utf8').split(/^skills:\s*$/m)[1].split(/^\S/m)[0];
  return Object.fromEntries([...block.matchAll(/^\s+([\w-]+):\s*\[([^\]]*)\]/gm)]
    .map(([, skill, tools]) => [skill, tools.split(',').map((tool) => tool.trim()).filter(Boolean)]));
}
const PERMISSIONS: Record<string, string[]> = loadPermissions();

export interface JobRow {
  job_id: string; project_id: string; idempotency_key: string; request_hash: string; tool: string; provider: string; provider_job_id: string | null;
  state: 'SUBMITTING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; reservation_id: string; quote_minor: number; cost_minor: number | null;
  external_receipt: string | null; payload: string;
}
export interface SubmitRequest {
  project_id: string; idempotency_key: string; skill_id: string; tool: string; provider: string; quote_minor: number; payload?: object;
}

export const getJob = (db: Db, projectId: string, key: string) =>
  db.prepare('SELECT * FROM jobs WHERE project_id = ? AND idempotency_key = ?').get(projectId, key) as unknown as JobRow | undefined;
const providerKey = (job: JobRow) => `${job.project_id}:${job.idempotency_key}`;

// Tools whose accepted response carries an artifact (e.g. generate_tts audio) store it in the settling transaction
// and describe it in every report of that job, including replays and reconciliation.
export interface ArtifactHandler { store(db: Db, project: string, job: JobRow, data: any): void; describe(db: Db, job: JobRow): object }
const HANDLERS = new Map<string, ArtifactHandler>();
export const onArtifact = (tool: string, handler: ArtifactHandler) => HANDLERS.set(tool, handler);

type ProviderOutcome =
  | { kind: 'accepted'; provider_job_id: string; cost_minor: number; receipt: string; data: any }
  | { kind: 'rejected'; http_status: number }
  | { kind: 'not_found' } | { kind: 'lookup_unsupported' } | { kind: 'unknown'; detail: string };

// Provider response parsing only; no ledger writes happen here.
async function callProvider(url: string | undefined, method: 'POST' | 'GET', job: JobRow, body?: object): Promise<ProviderOutcome> {
  if (!url) return { kind: 'unknown', detail: 'SVS_PROVIDER_URL is not configured' };
  try {
    const path = method === 'POST' ? '/jobs' : `/jobs/${encodeURIComponent(providerKey(job))}`;
    const response = await fetch(url + path, { method, headers: { 'content-type': 'application/json', 'idempotency-key': providerKey(job) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    if (response.ok) {
      const data = await response.json();
      return { kind: 'accepted', provider_job_id: String(data.provider_job_id), cost_minor: Number(data.cost_minor), receipt: String(data.receipt), data };
    }
    if (method === 'GET' && response.status === 404) return { kind: 'not_found' };
    if (method === 'GET' && response.status === 501) return { kind: 'lookup_unsupported' };
    if (method === 'POST' && response.status >= 400 && response.status < 500) return { kind: 'rejected', http_status: response.status };
    return { kind: 'unknown', detail: `HTTP ${response.status}` };
  } catch (error) {
    return { kind: 'unknown', detail: (error as Error).cause ? String((error as any).cause.code ?? (error as Error).message) : (error as Error).message };
  }
}

// Ledger side: apply a provider outcome to a job exactly once.
function applyOutcome(db: Db, project: string, job: JobRow, outcome: ProviderOutcome): Issue[] {
  const current = getJob(db, job.project_id, job.idempotency_key)!;
  if (current.state === 'SUCCEEDED' || current.state === 'FAILED') return [];
  const update = (state: string) =>
    db.prepare('UPDATE jobs SET state = ?, updated_at = ? WHERE job_id = ?').run(state, new Date().toISOString(), job.job_id);
  switch (outcome.kind) {
    case 'accepted':
      db.prepare("UPDATE jobs SET state = 'SUCCEEDED', provider_job_id = ?, cost_minor = ?, external_receipt = ?, updated_at = ? WHERE job_id = ?")
        .run(outcome.provider_job_id, outcome.cost_minor, outcome.receipt, new Date().toISOString(), job.job_id);
      settle(db, job, outcome.cost_minor, outcome.receipt);
      HANDLERS.get(job.tool)?.store(db, project, getJob(db, job.project_id, job.idempotency_key)!, outcome.data);
      return [];
    case 'rejected':
      update('FAILED');
      release(db, job);
      return [{ code: 'PROVIDER_REJECTED', http_status: outcome.http_status }];
    case 'lookup_unsupported':
      update('UNKNOWN');
      return [{ code: 'PENDING_VERIFICATION', job_id: job.job_id, held_minor: job.quote_minor }];
    case 'not_found':
      update('UNKNOWN');
      return [{ code: 'PROVIDER_NO_RECORD', job_id: job.job_id, held_minor: job.quote_minor }];
    case 'unknown':
      update('UNKNOWN');
      return [{ code: 'RECEIPT_UNKNOWN', job_id: job.job_id, detail: outcome.detail }];
  }
}

function jobReport(db: Db, job: JobRow, issues: Issue[] = []): Outcome {
  const now = getJob(db, job.project_id, job.idempotency_key)!;
  const status = ({ SUCCEEDED: 'succeeded', FAILED: 'failed', UNKNOWN: 'unknown', SUBMITTING: 'unknown' } as const)[now.state];
  const tool_result = {
    status, job_id: now.job_id, artifact_refs: [], warnings: [],
    cost: { currency: currentBudget(db, now.project_id)!.currency, estimated_minor: now.quote_minor, actual_minor: now.cost_minor },
    retryable: false, next_action: status === 'succeeded' ? 'continue' : status === 'unknown' ? 'reconcile' : 'ask_user',
  };
  const artifact = now.state === 'SUCCEEDED' ? HANDLERS.get(now.tool)?.describe(db, now) : undefined;
  return summary(db, now.project_id, now.state, issues, { job_id: now.job_id, tool_result, balance: balance(db, now.project_id), ...artifact });
}

export async function submitJob(project: string, request: SubmitRequest, providerUrl = process.env.SVS_PROVIDER_URL): Promise<Outcome> {
  const db = openStore(project);
  const hash = requestHash(request);
  const phase = transaction(db, (): { done: Outcome } | { job: JobRow } => {
    const reject = (issue: Issue) => ({ done: summary(db, request.project_id, 'REJECTED', [issue]) });
    if (!getProject(db, request.project_id)) return reject({ code: 'PROJECT_NOT_FOUND', ref: request.project_id });
    if (!PERMISSIONS[request.skill_id]?.includes(request.tool)) return reject({ code: 'TOOL_NOT_PERMITTED', skill_id: request.skill_id, tool: request.tool });
    const existing = getJob(db, request.project_id, request.idempotency_key);
    if (existing) {
      return existing.request_hash === hash ? { done: jobReport(db, existing, existing.state === 'UNKNOWN' ? [{ code: 'RECEIPT_UNKNOWN', job_id: existing.job_id }] : []) }
        : reject({ code: 'IDEMPOTENCY_CONFLICT', ref: request.idempotency_key, job_id: existing.job_id });
    }
    if (!Number.isInteger(request.quote_minor) || request.quote_minor < 0) return reject({ code: 'QUOTE_REQUIRED' });
    if (!currentBudget(db, request.project_id)) return reject({ code: 'BUDGET_UNCONFIGURED' });
    const { available_minor } = balance(db, request.project_id);
    if (available_minor! < request.quote_minor) return reject({ code: 'BUDGET_EXCEEDED', quote_minor: request.quote_minor, available_minor });
    const now = new Date().toISOString();
    const job = { job_id: newId('job'), reservation_id: newId('res') };
    db.prepare(`INSERT INTO jobs (job_id, project_id, idempotency_key, request_hash, skill_id, tool, provider, provider_job_id, state, reservation_id, quote_minor, cost_minor, external_receipt, attempt, created_at, updated_at, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'SUBMITTING', ?, ?, NULL, NULL, 1, ?, ?, ?)`).run(job.job_id, request.project_id, request.idempotency_key, hash,
      request.skill_id, request.tool, request.provider, job.reservation_id, request.quote_minor, now, now, JSON.stringify(request.payload ?? {}));
    const created = getJob(db, request.project_id, request.idempotency_key)!;
    reserve(db, created);
    return { job: created };
  });
  if ('done' in phase) return phase.done;
  const outcome = await callProvider(providerUrl, 'POST', phase.job, { tool: request.tool, payload: request.payload ?? {}, quote_minor: request.quote_minor });
  return transaction(db, () => jobReport(db, phase.job, applyOutcome(db, project, phase.job, outcome)));
}

export async function reconcileJob(project: string, request: { project_id: string; idempotency_key: string }, providerUrl = process.env.SVS_PROVIDER_URL): Promise<Outcome> {
  const db = openStore(project);
  const job = getJob(db, request.project_id, request.idempotency_key);
  if (!job) return summary(db, request.project_id, 'REJECTED', [{ code: 'JOB_NOT_FOUND', ref: request.idempotency_key }]);
  if (job.state === 'SUCCEEDED' || job.state === 'FAILED') return jobReport(db, job);
  const outcome = await callProvider(providerUrl, 'GET', job);
  return transaction(db, () => jobReport(db, job, applyOutcome(db, project, job, outcome)));
}
