// State service shared by the CLI and the future Studio UI: project creation and versioned, idempotent events.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATERIAL_EVENTS, requirementIssues } from './approvals.ts';
import { type Db, type Outcome, appendEvent, getProject, openStore, precheck, requestHash, summary, transaction } from './project-store.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ID = /^[a-z][a-z0-9_-]*$/;
const HASH = /^sha256:[0-9a-f]{64}$/;

export interface Transition { from: string; event: string; to: string; mode?: string; requires?: string[] }

// The workflow file uses one flow mapping per transition; anything else in that block is a hard error.
export function loadWorkflow(path = join(ROOT, 'workflows', 'topic-to-video.yaml')) {
  const text = readFileSync(path, 'utf8');
  const initial = /^initial:\s*(\S+)/m.exec(text)![1];
  const block = text.split(/^transitions:\s*$/m)[1].split(/^\S/m)[0];
  const transitions: Transition[] = block.split('\n').filter((line) => line.trim()).map((line) => {
    const body = /^\s*-\s*\{(.*)\}\s*$/.exec(line);
    if (!body) throw new Error(`unsupported workflow line: ${line}`);
    const fields: Record<string, any> = {};
    for (const [, key, list, value] of body[1].matchAll(/(\w+):\s*(?:\[([^\]]*)\]|([^,\s]+))/g)) {
      fields[key] = list !== undefined ? list.split(',').map((item) => item.trim()).filter(Boolean) : value;
    }
    return fields as Transition;
  });
  return { initial, transitions };
}

const WORKFLOW = loadWorkflow();

export function init(project: string, request: { project_id: string; title: string; mode: string }): Outcome {
  const db = openStore(project);
  return transaction(db, () => {
    if (!ID.test(request.project_id ?? '')) return summary(db, request.project_id, 'REJECTED', [{ code: 'PROJECT_ID_INVALID', ref: request.project_id }]);
    if (getProject(db, request.project_id)) return summary(db, request.project_id, 'REJECTED', [{ code: 'PROJECT_EXISTS', ref: request.project_id }]);
    db.prepare('INSERT INTO projects (project_id, title, mode, state, version) VALUES (?, ?, ?, ?, 1)')
      .run(request.project_id, request.title, request.mode, WORKFLOW.initial);
    return summary(db, request.project_id, 'CREATED');
  });
}

export function status(project: string, request: { project_id: string }): Outcome {
  const db = openStore(project);
  return getProject(db, request.project_id)
    ? summary(db, request.project_id, 'OK')
    : summary(db, request.project_id, 'REJECTED', [{ code: 'PROJECT_NOT_FOUND', ref: request.project_id }]);
}

export interface EventRequest {
  project_id: string; expected_version: number; idempotency_key: string; event: string; payload?: Record<string, unknown>;
}

export type Envelope = { project_id: string; expected_version: number; idempotency_key: string };

// One workflow step inside the caller's transaction, so content writes and state changes commit together.
export function advance(db: Db, request: Envelope, event: string, payload: Record<string, unknown>, hash: string):
  { done: Outcome } | { eventId: string } {
  const pre = precheck(db, request, hash);
  if (pre.done) return { done: pre.done };
  const current = pre.project;
  const reject = (issues: { code: string }[]) => ({ done: summary(db, request.project_id, 'REJECTED', issues) });
  const step = WORKFLOW.transitions.find((t) => t.from === current.state && t.event === event && (!t.mode || t.mode === current.mode));
  if (!step) return reject([{ code: 'TRANSITION_INVALID', state: current.state, event, mode: current.mode }]);
  if (MATERIAL_EVENTS.has(event) && !HASH.test(String(payload?.artifact_hash ?? ''))) return reject([{ code: 'ARTIFACT_HASH_REQUIRED', event }]);
  const unmet = requirementIssues(db, request.project_id, step.requires ?? [], payload);
  if (unmet.length) return reject(unmet);
  return { eventId: appendEvent(db, current, { idempotency_key: request.idempotency_key, payload }, hash, event, step.to, 'agent') };
}

export function submitEvent(project: string, request: EventRequest): Outcome {
  const db = openStore(project);
  return transaction(db, () => {
    const step = advance(db, request, request.event, request.payload ?? {}, requestHash(request));
    return 'done' in step ? step.done : summary(db, request.project_id, 'APPLIED', [], { event_id: step.eventId });
  });
}
