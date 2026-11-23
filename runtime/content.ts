// Versioned content objects (TopicBrief, EvidenceSet, ScriptDocument). Saving one also advances the workflow in the
// same transaction with artifact_hash = content hash, so G1/G2 bind the exact version a human reviewed.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Envelope, advance } from './orchestrator.ts';
import { currentBudget } from './ledger.ts';
import { type Db, type Issue, type Outcome, getProject, newId, openStore, precheck, requestHash, summary, transaction } from './project-store.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export type Kind = 'brief' | 'evidence' | 'script' | 'audio' | 'alignment' | 'storyboard' | 'timeline';

// profiles/duration.yaml: default_profile and per-profile min/target/max seconds.
function loadDurations(path = join(ROOT, 'profiles', 'duration.yaml')) {
  const text = readFileSync(path, 'utf8');
  const profiles: Record<string, { min_seconds: number; target_seconds: number; max_seconds: number }> = {};
  for (const [, name, body] of text.split(/^profiles:\s*$/m)[1].split(/^\S/m)[0].matchAll(/^  (\w+):\n((?:    .*\n?)*)/gm)) {
    const get = (key: string) => Number(new RegExp(`^\\s+${key}:\\s*(\\d+)`, 'm').exec(body)![1]);
    profiles[name] = { min_seconds: get('min_seconds'), target_seconds: get('target_seconds'), max_seconds: get('max_seconds') };
  }
  return { default_profile: /^default_profile:\s*(\w+)/m.exec(text)![1], profiles };
}
export const DURATIONS = loadDurations();

export function latest(db: Db, projectId: string, kind: Kind, version?: number) {
  const row = (version === undefined
    ? db.prepare('SELECT version, hash, body FROM content WHERE project_id = ? AND kind = ? ORDER BY version DESC LIMIT 1').get(projectId, kind)
    : db.prepare('SELECT version, hash, body FROM content WHERE project_id = ? AND kind = ? AND version = ?').get(projectId, kind, version)) as
    { version: number; hash: string; body: string } | undefined;
  return row ? { version: row.version, hash: row.hash, document: JSON.parse(row.body) } : undefined;
}

// Replay and version checks first (a replay returns the stored version), then build the next version, advance the
// workflow with its hash and store it under the new event.
// A replayed request returns the content stored under its event.
export function replayed(db: Db, done: Outcome): Outcome {
  const stored = db.prepare('SELECT hash, body FROM content WHERE event_id = ?').get((done.report as any).event_id ?? '') as { hash: string; body: string } | undefined;
  return stored && done.report.status === 'REPLAYED'
    ? { ...done, report: { ...done.report, content_hash: stored.hash, document: JSON.parse(stored.body) } } : done;
}

export function save(project: string, request: Envelope, kind: Kind, event: string, build: (db: Db, version: number) => { document?: any; issues?: Issue[]; extra?: object }): Outcome {
  const db = openStore(project);
  return transaction(db, () => {
    const requestDigest = requestHash(request);
    const pre = precheck(db, request, requestDigest);
    if (pre.done) return replayed(db, pre.done);
    const version = (latest(db, request.project_id, kind)?.version ?? 0) + 1;
    const built = build(db, version);
    if (built.issues?.length) return summary(db, request.project_id, 'REJECTED', built.issues);
    const hash = requestHash(built.document);
    const step = advance(db, request, event, { artifact_hash: hash }, requestDigest);
    if ('done' in step) return step.done;
    db.prepare('INSERT INTO content (content_id, project_id, kind, version, hash, body, event_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId('cnt'), request.project_id, kind, version, hash, JSON.stringify(built.document), step.eventId, new Date().toISOString());
    return summary(db, request.project_id, 'APPLIED', [], { event_id: step.eventId, content_hash: hash, document: built.document, ...built.extra });
  });
}

type Overrides = { duration_profile?: string; duration_target_seconds?: number };

// Shared by start (brief) and resume: explicit override > stored brief > profile target. A profile change without
// an explicit target falls back to that profile's target rather than keeping a target from another profile.
export function resolveDefaults(stored: Overrides | undefined, overrides: Overrides = {}):
  { issues: Issue[] } | { duration_profile: string; duration_target_seconds: number; target_frames: number } {
  const profile = overrides.duration_profile ?? stored?.duration_profile ?? DURATIONS.default_profile;
  const limits = DURATIONS.profiles[profile];
  if (!limits) return { issues: [{ code: 'DURATION_PROFILE_UNKNOWN', duration_profile: profile }] };
  const keep = overrides.duration_profile === undefined || overrides.duration_profile === stored?.duration_profile;
  const target = overrides.duration_target_seconds ?? (keep ? stored?.duration_target_seconds : undefined) ?? limits.target_seconds;
  if (!Number.isInteger(target) || target < limits.min_seconds || target > limits.max_seconds) {
    return { issues: [{ code: 'DURATION_OUT_OF_PROFILE', duration_profile: profile, duration_target_seconds: target, min_seconds: limits.min_seconds, max_seconds: limits.max_seconds }] };
  }
  return { duration_profile: profile, duration_target_seconds: target, target_frames: target * 30 };
}

export interface BriefRequest extends Envelope {
  topic: string; audience: string; scope: string[]; keywords: string[]; language?: string; style_profile: string; unknowns?: string[];
  overrides?: Overrides;
}

export function saveBrief(project: string, request: BriefRequest): Outcome {
  return save(project, request, 'brief', 'brief_saved', (db, version) => {
    const resolved = resolveDefaults(latest(db, request.project_id, 'brief')?.document, request.overrides);
    if ('issues' in resolved) return resolved;
    const { duration_profile: profile, duration_target_seconds: target } = resolved;
    return { document: {
      project_id: request.project_id, version, topic: request.topic, audience: request.audience, scope: request.scope, keywords: request.keywords,
      duration_profile: profile, duration_target_seconds: target, language: request.language ?? 'zh-CN', style_profile: request.style_profile,
      mode: getProject(db, request.project_id)!.mode, budget_policy: currentBudget(db, request.project_id) ? 'project-budget' : 'unconfigured',
      unknowns: request.unknowns ?? [],
    } };
  });
}

// Read-only view for picking a project back up: resolved duration and the latest version of each content kind.
export function resume(project: string, request: { project_id: string; overrides?: Overrides }): Outcome {
  const db = openStore(project);
  if (!getProject(db, request.project_id)) return summary(db, request.project_id, 'REJECTED', [{ code: 'PROJECT_NOT_FOUND', ref: request.project_id }]);
  const resolved = resolveDefaults(latest(db, request.project_id, 'brief')?.document, request.overrides);
  if ('issues' in resolved) return summary(db, request.project_id, 'REJECTED', resolved.issues);
  const content_versions = Object.fromEntries((['brief', 'evidence', 'script'] as Kind[]).map((kind) => [kind, latest(db, request.project_id, kind)?.version ?? 0]));
  return summary(db, request.project_id, 'OK', [], { resolved, content_versions });
}

interface Link { claim_id: string; source_id: string; locator: string; relation: 'supports' | 'limits' | 'contradicts' }
export interface EvidenceRequest extends Envelope {
  sources: { source_id: string; url: string; title: string; published_on: string | null; retrieved_on: string; summary: string }[];
  claims: { claim_id: string; statement: string; qualifier: string }[];
  links: Link[];
  resolutions?: Record<string, string>;
}

// Claim status follows from its links: support only → supported; support with limits → partial;
// support and contradiction → disputed (conflict keeps every locator); no support → unsupported.
export function saveEvidence(project: string, request: EvidenceRequest): Outcome {
  return save(project, request, 'evidence', 'evidence_saved', (_db, version) => {
    const sourceIds = new Set(request.sources.map((source) => source.source_id));
    const claimIds = new Set(request.claims.map((claim) => claim.claim_id));
    const invalid = request.links.filter((link) => !sourceIds.has(link.source_id) || !claimIds.has(link.claim_id));
    if (invalid.length) return { issues: invalid.map((link) => ({ code: 'EVIDENCE_LINK_INVALID', claim_id: link.claim_id, source_id: link.source_id })) };
    const conflicts: { claim_ids: string[]; description: string; resolution: string }[] = [];
    const claims = request.claims.map((claim) => {
      const links = request.links.filter((link) => link.claim_id === claim.claim_id);
      const has = (relation: string) => links.some((link) => link.relation === relation);
      const status = !has('supports') ? 'unsupported' : has('contradicts') ? 'disputed' : has('limits') ? 'partial' : 'supported';
      if (status === 'disputed') {
        conflicts.push({ claim_ids: [claim.claim_id], description: links.map((link) => `${link.source_id} @ ${link.locator}: ${link.relation}`).join('; '),
          resolution: request.resolutions?.[claim.claim_id] ?? '' });
      }
      return { claim_id: claim.claim_id, statement: claim.statement, status, qualifier: claim.qualifier };
    });
    return { document: { project_id: request.project_id, version, claims, sources: request.sources, claim_source_links: request.links, conflicts, review_status: 'pending' } };
  });
}

// Planned narration length until aligned audio exists (T05): about 4.5 Chinese characters per second.
const CHARS_PER_SECOND = 4.5;
export const normalize = (text: string) => text.replace(/[\s\p{P}]/gu, '');
const estimateFrames = (text: string) => Math.max(1, Math.ceil((normalize(text).length / CHARS_PER_SECOND) * 30));

function similarity(a: string, b: string) {
  const grams = (text: string) => { const s = normalize(text); return Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)); };
  const left = grams(a), right = grams(b);
  if (!left.length || !right.length) return normalize(a) === normalize(b) ? 1 : 0;
  const pool = new Map<string, number>();
  for (const gram of right) pool.set(gram, (pool.get(gram) ?? 0) + 1);
  let shared = 0;
  for (const gram of left) if (pool.get(gram)) { shared += 1; pool.set(gram, pool.get(gram)! - 1); }
  return (2 * shared) / (left.length + right.length);
}

// Paragraphs of an imported manuscript keep the ID of the previous paragraph they still resemble.
const SAME_PARAGRAPH = 0.6;
function sectionsFromManuscript(text: string, previous: any[]) {
  const unused = new Map(previous.map((section) => [section.section_id, section]));
  let next = Math.max(0, ...previous.map((section) => Number(/(\d+)$/.exec(section.section_id)?.[1] ?? 0))) + 1;
  return text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean).map((narration) => {
    let best: any, score = SAME_PARAGRAPH;
    for (const candidate of unused.values()) {
      const value = similarity(candidate.narration, narration);
      if (value >= score) { best = candidate; score = value; }
    }
    if (best) unused.delete(best.section_id);
    return {
      section_id: best?.section_id ?? `sec_${String(next++).padStart(3, '0')}`,
      title: best?.title ?? narration.split(/[，。？！、：,.?!:]/)[0].slice(0, 12),
      narration, claim_ids: best?.claim_ids ?? [], pronunciation: best?.pronunciation ?? [],
      visual_intent: best?.visual_intent ?? '待导演补充', duration_estimate_frames: estimateFrames(narration),
      cues: (best?.cues ?? []).filter((cue: any) => narration.includes(cue.text)),
    };
  });
}

export interface ScriptRequest extends Envelope { script_id: string; sections?: any[]; manuscript?: string }

export function saveScript(project: string, request: ScriptRequest): Outcome {
  return save(project, request, 'script', 'script_saved', (db, version) => {
    const evidence = latest(db, request.project_id, 'evidence');
    if (!evidence) return { issues: [{ code: 'EVIDENCE_MISSING' }] };
    const previous = latest(db, request.project_id, 'script')?.document.sections ?? [];
    const sections = request.manuscript !== undefined ? sectionsFromManuscript(request.manuscript, previous) : request.sections ?? [];
    const claims = new Map(evidence.document.claims.map((claim: any) => [claim.claim_id, claim]));
    const resolved = new Set(evidence.document.conflicts.filter((c: any) => c.resolution.trim()).flatMap((c: any) => c.claim_ids));
    const issues: Issue[] = sections.flatMap((section: any) => section.claim_ids.flatMap((claimId: string): Issue[] => {
      const claim: any = claims.get(claimId);
      if (!claim) return [{ code: 'CLAIM_UNKNOWN', section_id: section.section_id, claim_id: claimId }];
      if (claim.status === 'unsupported') return [{ code: 'CLAIM_UNSUPPORTED', section_id: section.section_id, claim_id: claimId }];
      if (claim.status === 'disputed' && !resolved.has(claimId)) return [{ code: 'CLAIM_DISPUTED', section_id: section.section_id, claim_id: claimId }];
      return [];
    }));
    if (issues.length) return { issues };
    const audition_terms = [...new Set(sections.flatMap((section: any) => section.pronunciation.map((item: any) => item.term)))];
    return {
      document: { project_id: request.project_id, version, script_id: request.script_id, evidence_version: evidence.version, review_status: 'pending', sections },
      extra: { audition_terms, planned_frames: sections.reduce((sum: number, section: any) => sum + section.duration_estimate_frames, 0) },
    };
  });
}
