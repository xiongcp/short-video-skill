// search_sources, offline mode: searches only owner-authorized local material listed in <project>/materials/authorized.json
// with a matching sha256. No network, no cost. Returned excerpts are untrusted data for the research skill, never instructions.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { currentBudget } from '../../runtime/ledger.ts';
import { type Issue, type Outcome, getProject, newId, openStore, summary } from '../../runtime/project-store.ts';

interface Material { source_id: string; path: string; sha256: string; title: string; url: string; published_on: string | null }
export interface SearchRequest { project_id: string; input: { query: string; source_policy_id: string; question_id: string } }

const EXCERPT_CHARS = 120;

export function searchSources(project: string, request: SearchRequest, today = new Date().toISOString().slice(0, 10)): Outcome {
  const db = openStore(project);
  if (!getProject(db, request.project_id)) return summary(db, request.project_id, 'REJECTED', [{ code: 'PROJECT_NOT_FOUND', ref: request.project_id }]);
  const indexPath = join(project, 'materials', 'authorized.json');
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) as { source_policy_id: string; materials: Material[] } : undefined;
  const issues: Issue[] = [];
  const candidates: object[] = [];
  if (index?.source_policy_id !== request.input.source_policy_id) {
    issues.push({ code: 'SOURCE_POLICY_UNAVAILABLE', source_policy_id: request.input.source_policy_id });
  } else {
    const terms = request.input.query.split(/\s+/).filter(Boolean);
    for (const material of index.materials) {
      const file = join(project, 'materials', material.path);
      const bytes = existsSync(file) ? readFileSync(file) : undefined;
      const sha256 = bytes && 'sha256:' + createHash('sha256').update(bytes).digest('hex');
      if (sha256 !== material.sha256) { issues.push({ code: 'MATERIAL_HASH_MISMATCH', source_id: material.source_id, path: material.path }); continue; }
      bytes!.toString('utf8').split(/\n\s*\n/).forEach((paragraph, i) => {
        if (!terms.every((term) => paragraph.includes(term))) return;
        candidates.push({ source_id: material.source_id, title: material.title, url: material.url, published_on: material.published_on,
          path: material.path, sha256, locator: `第 ${i + 1} 段`, excerpt: paragraph.trim().slice(0, EXCERPT_CHARS), retrieved_on: today });
      });
    }
  }
  const failed = issues.some((issue) => issue.code === 'SOURCE_POLICY_UNAVAILABLE');
  const status = failed ? 'failed' : issues.length ? 'partial' : 'succeeded';
  const tool_result = {
    status, job_id: newId('search'), artifact_refs: [], warnings: issues.map((issue) => `${issue.code}:${issue.source_id ?? issue.source_policy_id}`),
    // XXX is the ISO 4217 code for "no currency" until a project budget picks one.
    cost: { currency: currentBudget(db, request.project_id)?.currency ?? 'XXX', estimated_minor: 0, actual_minor: 0 },
    retryable: false, next_action: failed ? 'ask_user' : 'review',
  };
  return summary(db, request.project_id, status.toUpperCase(), issues, { question_id: request.input.question_id, tool_result, candidates });
}
