// SQLite project store: one database per project directory, all writes inside BEGIN IMMEDIATE transactions.
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY, title TEXT NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('quality', 'draft')),
  state TEXT NOT NULL, version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id),
  idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, event TEXT NOT NULL,
  from_state TEXT NOT NULL, to_state TEXT NOT NULL, version INTEGER NOT NULL,
  payload TEXT NOT NULL, actor TEXT NOT NULL, recorded_at TEXT NOT NULL,
  UNIQUE (project_id, idempotency_key), UNIQUE (project_id, version));
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY, reviewer_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('human', 'agent')),
  token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (
  approval_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id), version INTEGER NOT NULL,
  gate TEXT NOT NULL, target_hash TEXT NOT NULL, reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')), recorded_at TEXT NOT NULL, notes TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(session_id), event_id TEXT NOT NULL REFERENCES events(event_id));
CREATE TABLE IF NOT EXISTS content (
  content_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id),
  kind TEXT NOT NULL CHECK (kind IN ('brief', 'evidence', 'script', 'audio', 'alignment', 'storyboard', 'timeline')), version INTEGER NOT NULL, hash TEXT NOT NULL,
  body TEXT NOT NULL, event_id TEXT NOT NULL REFERENCES events(event_id), created_at TEXT NOT NULL,
  UNIQUE (project_id, kind, version));
CREATE TABLE IF NOT EXISTS budgets (
  budget_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id), currency TEXT NOT NULL,
  project_limit_minor INTEGER NOT NULL CHECK (project_limit_minor >= 0), reviewer_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(session_id), recorded_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id), idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL, skill_id TEXT NOT NULL, tool TEXT NOT NULL, provider TEXT NOT NULL, provider_job_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('SUBMITTING', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
  reservation_id TEXT NOT NULL, quote_minor INTEGER NOT NULL, cost_minor INTEGER, external_receipt TEXT,
  attempt INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}',
  UNIQUE (project_id, idempotency_key));
CREATE TABLE IF NOT EXISTS assets (
  asset_ref TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id), name TEXT NOT NULL, version INTEGER NOT NULL,
  kind TEXT NOT NULL, path TEXT NOT NULL, sha256 TEXT NOT NULL, meta TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (project_id, name, version));
CREATE TABLE IF NOT EXISTS asset_usage (
  usage_id TEXT PRIMARY KEY, asset_ref TEXT NOT NULL REFERENCES assets(asset_ref),
  usage TEXT NOT NULL CHECK (usage IN ('pending', 'cleared', 'restricted')), reviewer_id TEXT NOT NULL, session_id TEXT,
  notes TEXT NOT NULL, recorded_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ledger (
  entry_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id), version INTEGER NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(job_id), reservation_id TEXT,
  operation TEXT NOT NULL CHECK (operation IN ('reserve', 'settle', 'release', 'cache_hit')), currency TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0), recorded_at TEXT NOT NULL, external_receipt TEXT,
  UNIQUE (project_id, version));
CREATE TABLE IF NOT EXISTS render_jobs (
  job_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id), version INTEGER NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('asset', 'shot', 'chapter', 'master')), target_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, cache_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('QUEUED', 'RESERVED', 'SUBMITTING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'CANCELLED')),
  attempt INTEGER NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (project_id, idempotency_key));
CREATE TABLE IF NOT EXISTS render_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(project_id),
  run_id TEXT NOT NULL, job_id TEXT, scope TEXT NOT NULL, target_id TEXT NOT NULL,
  event TEXT NOT NULL, detail TEXT NOT NULL, recorded_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS checkpoints (
  checkpoint_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id), version INTEGER NOT NULL,
  chapter_id TEXT NOT NULL, input_snapshot_hash TEXT NOT NULL, continuity_state_hash TEXT NOT NULL,
  body TEXT NOT NULL, continuity TEXT NOT NULL, recorded_at TEXT NOT NULL,
  UNIQUE (project_id, chapter_id, version));
CREATE TABLE IF NOT EXISTS change_plans (
  plan_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id), version INTEGER NOT NULL,
  base_snapshot_hash TEXT NOT NULL, request_body TEXT NOT NULL, plan_body TEXT NOT NULL,
  applied_snapshot_hash TEXT, recorded_at TEXT NOT NULL,
  UNIQUE (project_id, version));
CREATE TABLE IF NOT EXISTS invalidated_assets (
  asset_ref TEXT PRIMARY KEY REFERENCES assets(asset_ref), reason TEXT NOT NULL, recorded_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS qa_reports (
  qa_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id), version INTEGER NOT NULL,
  scope TEXT NOT NULL, target_hash TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'needs_review')), blocking_count INTEGER NOT NULL,
  asset_ref TEXT NOT NULL, report_body TEXT NOT NULL, bundle_body TEXT NOT NULL, recorded_at TEXT NOT NULL,
  UNIQUE (project_id, version));
CREATE TABLE IF NOT EXISTS delivery_targets (
  row_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id),
  target_id TEXT NOT NULL, version TEXT NOT NULL, lufs_min REAL NOT NULL, lufs_max REAL NOT NULL,
  max_true_peak_dbtp REAL NOT NULL, notes TEXT NOT NULL, recorded_at TEXT NOT NULL,
  UNIQUE (project_id, target_id, version));
CREATE TABLE IF NOT EXISTS ab_comparisons (
  comparison_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id),
  target_hash TEXT NOT NULL, baseline_kind TEXT NOT NULL, seed INTEGER NOT NULL,
  blinded_body TEXT NOT NULL, key_body TEXT NOT NULL, review_body TEXT,
  open_required_fixes INTEGER NOT NULL DEFAULT 0, recorded_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS export_manifests (
  manifest_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id), version INTEGER NOT NULL,
  manifest_ref TEXT NOT NULL, manifest_hash TEXT NOT NULL, g4_approval_id TEXT NOT NULL,
  final_media_ref TEXT NOT NULL, qa_ref TEXT NOT NULL, body TEXT NOT NULL, recorded_at TEXT NOT NULL,
  UNIQUE (project_id, version));
CREATE TABLE IF NOT EXISTS owner_credentials (
  reviewer_id TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attestations (
  attestation_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id), package_id TEXT NOT NULL,
  archive_hash TEXT NOT NULL, items TEXT NOT NULL, actual_cost_minor INTEGER NOT NULL CHECK (actual_cost_minor >= 0),
  currency TEXT NOT NULL, reviewer_id TEXT NOT NULL, session_id TEXT NOT NULL REFERENCES sessions(session_id),
  notes TEXT NOT NULL, recorded_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS packages (
  package_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(project_id), version INTEGER NOT NULL,
  manifest_hash TEXT NOT NULL, g5_approval_id TEXT NOT NULL, archive_ref TEXT NOT NULL, archive_hash TEXT NOT NULL,
  verified_file_count INTEGER NOT NULL, verified INTEGER NOT NULL CHECK (verified IN (0, 1)),
  body TEXT NOT NULL, recorded_at TEXT NOT NULL,
  UNIQUE (project_id, version));
`;

export type Db = DatabaseSync;
export interface ProjectRow { project_id: string; title: string; mode: string; state: string; version: number }

export function openStore(project: string): Db {
  // Writers queue on BEGIN IMMEDIATE instead of failing with "database is locked".
  const db = new DatabaseSync(join(project, 'studio.sqlite'), { timeout: 10000 });
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // T12: sessions record how they were authenticated and when they expire; databases from T01–T11 gain the columns.
  const sessionColumns = new Set((db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]).map((c) => c.name));
  if (!sessionColumns.has('auth')) db.exec("ALTER TABLE sessions ADD COLUMN auth TEXT NOT NULL DEFAULT 'host-hook'");
  if (!sessionColumns.has('expires_at')) db.exec('ALTER TABLE sessions ADD COLUMN expires_at TEXT');
  return db;
}

export function transaction<T>(db: Db, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// Canonical JSON (sorted keys) so equal requests hash equally regardless of key order.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as any)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const requestHash = (request: unknown) => 'sha256:' + createHash('sha256').update(canonical(request)).digest('hex');
export const newId = (prefix: string) => `${prefix}-${randomUUID()}`;

export const getProject = (db: Db, id: string) =>
  db.prepare('SELECT * FROM projects WHERE project_id = ?').get(id) as unknown as ProjectRow | undefined;

export const eventCount = (db: Db, id: string) =>
  Number((db.prepare('SELECT COUNT(*) AS n FROM events WHERE project_id = ?').get(id) as { n: number }).n);

export type Issue = { code: string } & Record<string, unknown>;
export type Outcome = { report: { issues: Issue[] } & Record<string, unknown>; exitCode: number };

export function summary(db: Db, projectId: string, status: string, issues: Issue[] = [], extra: object = {}): Outcome {
  const project = getProject(db, projectId);
  return {
    report: { status, project_id: projectId, state: project?.state ?? null, version: project?.version ?? null,
      event_count: project ? eventCount(db, projectId) : 0, ...extra, issues },
    exitCode: issues.length ? 1 : 0,
  };
}

export function appendEvent(db: Db, project: ProjectRow, request: { idempotency_key: string; payload?: unknown },
  hash: string, event: string, to: string, actor: string) {
  const eventId = newId('evt');
  db.prepare(`INSERT INTO events (event_id, project_id, idempotency_key, request_hash, event, from_state, to_state, version, payload, actor, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(eventId, project.project_id, request.idempotency_key, hash, event,
    project.state, to, project.version + 1, JSON.stringify(request.payload ?? {}), actor, new Date().toISOString());
  db.prepare('UPDATE projects SET state = ?, version = version + 1 WHERE project_id = ?').run(to, project.project_id);
  return eventId;
}

// Shared preamble for every versioned write: idempotent replay first, then optimistic version check.
export function precheck(db: Db, request: { project_id: string; expected_version: number; idempotency_key: string }, hash: string) {
  const project = getProject(db, request.project_id);
  if (!project) return { done: summary(db, request.project_id, 'REJECTED', [{ code: 'PROJECT_NOT_FOUND', ref: request.project_id }]) };
  const prior = db.prepare('SELECT event_id, request_hash FROM events WHERE project_id = ? AND idempotency_key = ?')
    .get(request.project_id, request.idempotency_key) as { event_id: string; request_hash: string } | undefined;
  if (prior) {
    return { done: prior.request_hash === hash
      ? summary(db, request.project_id, 'REPLAYED', [], { event_id: prior.event_id })
      : summary(db, request.project_id, 'REJECTED', [{ code: 'IDEMPOTENCY_CONFLICT', ref: request.idempotency_key, event_id: prior.event_id }]) };
  }
  if (request.expected_version !== project.version) {
    return { done: summary(db, request.project_id, 'REJECTED', [{ code: 'VERSION_CONFLICT', expected_version: request.expected_version, current_version: project.version }]) };
  }
  return { project };
}
