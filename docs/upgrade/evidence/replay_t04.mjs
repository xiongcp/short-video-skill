// Rebuild A04 evidence: brief → offline search of owner-authorized fixture material → evidence with a source conflict →
// G1 reject/approve → script rejected for an unsupported claim → script v1 → G2 reject → manuscript v2 keeps section IDs → G2.
// Sources are local fixtures and the human sessions are created by this script (the Studio host comes with T11).
// usage: node docs/upgrade/evidence/replay_t04.mjs <run_id> [python]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT, makeProject, runCli, writeJson } from '../../../tests/runtime/helpers.mjs';
import { createSession } from '../../../runtime/approvals.ts';

const [runId, python = 'python3'] = process.argv.slice(2);
if (!runId) throw new Error('usage: replay_t04.mjs <run_id> [python]');
const out = join(ROOT, 'docs', 'upgrade', 'evidence', 'runs', runId, 'A04');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'audit'), { recursive: true });
const sha256 = (data) => 'sha256:' + createHash('sha256').update(data).digest('hex');
const example = (name) => JSON.parse(readFileSync(join(ROOT, 'examples', 'topic-cache-speed', `${name}.json`), 'utf8'));
const save = (name, value) => writeFileSync(join(out, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');

const dir = makeProject();
const id = 'cache-speed';
const audit = [];
function call(label, op, request, env = {}, session = null) {
  const seq = audit.length;
  const run = runCli([op, '--project', dir, '--request', writeJson(join(dir, 'requests', `${seq}.json`), request)], env);
  const entry = { seq, label, op, session, request, exit_code: run.code, response: run.json };
  writeFileSync(join(out, 'audit', `${String(seq).padStart(3, '0')}-${label}.json`), JSON.stringify(entry, null, 2) + '\n');
  audit.push(entry);
  return run.json;
}
const env = (key) => ({ project_id: id, expected_version: call(`status-before-${key}`, 'status', { project_id: id }).version, idempotency_key: key });
const event = (key, name) => call(key, 'event', { ...env(key), event: name, payload: {} });

// Owner-authorized local material (fixture): two guide versions that disagree, one unlisted file.
const materials = {
  'guide-v1.md': '# 团队缓存指南 v1\n\n第一段介绍缓存。\n\n没有过期时间的响应一律不得复用。',
  'guide-v2.md': '# 团队缓存指南 v2\n\n没有过期时间时，允许按启发式新鲜度短暂复用。',
  'unlisted-draft.md': '未登记的草稿也提到过期时间，不应被检索到。',
};
mkdirSync(join(dir, 'materials'), { recursive: true });
for (const [name, text] of Object.entries(materials)) writeFileSync(join(dir, 'materials', name), text);
writeJson(join(dir, 'materials', 'authorized.json'), { source_policy_id: 'owner-materials', materials: [
  { source_id: 'team-guide-v1', path: 'guide-v1.md', sha256: sha256(materials['guide-v1.md']), title: '团队缓存指南 v1', url: 'https://example.invalid/guide/v1', published_on: '2023-03-01' },
  { source_id: 'team-guide-v2', path: 'guide-v2.md', sha256: sha256(materials['guide-v2.md']), title: '团队缓存指南 v2', url: 'https://example.invalid/guide/v2', published_on: '2025-06-01' },
] });

call('init', 'init', { project_id: id, title: '缓存为什么让网页变快', mode: 'quality' });
const owner = createSession(dir, { reviewer_id: 'owner', kind: 'human' });
const human = { SVS_SESSION_TOKEN: owner };
const brief = example('brief');
const savedBrief = call('brief', 'brief', { ...env('brief-1'), topic: brief.topic, audience: brief.audience, scope: brief.scope, keywords: brief.keywords,
  language: brief.language, style_profile: brief.style_profile, overrides: { duration_target_seconds: 120 } });
const resumed = call('resume', 'resume', { project_id: id });
const search = call('search', 'search', { project_id: id, input: { query: '过期时间', source_policy_id: 'owner-materials', question_id: 'q-expiry' } });
event('research-started', 'research_started');

const base = example('evidence-set');
const evidence = (key, resolutions) => call(key, 'evidence', { ...env(key),
  sources: [...base.sources, ...search.candidates.map((c) => ({ source_id: c.source_id, url: c.url, title: c.title, published_on: c.published_on,
    retrieved_on: c.retrieved_on, summary: c.excerpt }))],
  claims: [...base.claims.map(({ claim_id, statement, qualifier }) => ({ claim_id, statement, qualifier })),
    { claim_id: 'no-expiry', statement: '没有显式过期时间的响应一律不能复用。', qualifier: '' },
    { claim_id: 'always-half', statement: '缓存总能让任何网页的加载时间减半。', qualifier: '' }],
  links: [...base.claim_source_links, ...search.candidates.map((c) => ({ claim_id: 'no-expiry', source_id: c.source_id, locator: c.locator,
    relation: c.source_id === 'team-guide-v1' ? 'supports' : 'contradicts' }))],
  resolutions });
const evidence1 = evidence('evidence-1', {});
call('g1-reject', 'decide', { ...env('g1-reject'), gate: 'G1', target_hash: evidence1.content_hash, decision: 'reject', notes: 'no-expiry 的两版指南冲突尚未处理' }, human, 'human:owner');
const evidence2 = evidence('evidence-2', { 'no-expiry': '采用 v2：口播限定为“可能被启发式复用”，不使用“一律不能复用”。' });
const staleG1 = call('g1-approve-stale-hash', 'decide', { ...env('g1-stale'), gate: 'G1', target_hash: evidence1.content_hash, decision: 'approve', notes: '' }, human, 'human:owner');
const g1 = call('g1-approve', 'decide', { ...env('g1-approve'), gate: 'G1', target_hash: evidence2.content_hash, decision: 'approve', notes: '来源与冲突处理核对完毕' }, human, 'human:owner');
event('research-accepted', 'research_accepted');

const sections = example('script').sections.map((section) => ({ ...section, claim_ids: [...section.claim_ids] }));
sections[3].pronunciation = [{ term: '304', reading: '三零四' }];
const unsupported = call('script-cites-unsupported', 'script', { ...env('script-bad'), script_id: 'episode',
  sections: sections.map((section, i) => (i === 2 ? { ...section, claim_ids: [...section.claim_ids, 'always-half'] } : section)) });
const script1 = call('script-v1', 'script', { ...env('script-1'), script_id: 'episode', sections });
call('g2-reject', 'decide', { ...env('g2-reject'), gate: 'G2', target_hash: script1.content_hash, decision: 'reject', notes: '第二趟之前补一句“图标只是一份普通文件”' }, human, 'human:owner');
const revised = sections.map((section) => section.narration.replace('我们跟着它走两趟。', '我们跟着它，走两趟！'));
revised.splice(2, 0, '先说明一件事：图标也是一份普通的文件，和网页里的其他资源一样可以被缓存。');
const script2 = call('script-v2-manuscript', 'script', { ...env('script-2'), script_id: 'episode', manuscript: revised.join('\n\n') });
const g2 = call('g2-approve', 'decide', { ...env('g2-approve'), gate: 'G2', target_hash: script2.content_hash, decision: 'approve', notes: '讲稿与 120 秒时长确认' }, human, 'human:owner');
const accepted = event('script-accepted', 'script_accepted');

// Reviewable artifacts: source cards, versioned documents and a section-level diff of v1 → v2.
save('source-cards.json', search.candidates);
save('brief-v1.json', savedBrief.document);
save('evidence-v1.json', evidence1.document);
save('evidence-v2.json', evidence2.document);
save('script-v1.json', script1.document);
save('script-v2.json', script2.document);
const before = new Map(script1.document.sections.map((s) => [s.section_id, s]));
const diff = script2.document.sections.map((s) => ({ section_id: s.section_id,
  change: !before.has(s.section_id) ? 'added' : before.get(s.section_id).narration === s.narration ? 'unchanged' : 'edited',
  claim_ids: s.claim_ids, duration_estimate_frames: s.duration_estimate_frames }));
save('script-diff.json', diff);

const db = new DatabaseSync(join(dir, 'studio.sqlite'));
db.exec(`VACUUM INTO '${join(out, 'studio.sqlite')}'`);
const tables = {
  content: db.prepare('SELECT project_id, kind, version, hash, event_id, created_at FROM content ORDER BY kind, version').all(),
  approvals: db.prepare('SELECT approval_id, project_id, version, gate, target_hash, reviewer_id, decision, recorded_at, notes FROM approvals ORDER BY version').all(),
  events: db.prepare('SELECT version, event, from_state, to_state, actor, payload FROM events ORDER BY version').all(),
};
db.close();
rmSync(dir, { recursive: true, force: true });
save('tables.json', tables);
save('approvals.json', tables.approvals);

const rel = (name) => JSON.stringify(relative(ROOT, join(out, name)));
const check = spawnSync(python, ['-B', '-c', [
  'import json, sys', "sys.path.insert(0, 'evals')", 'from check_design import read_schemas, validate_contract',
  'schemas, registry = read_schemas()',
  `for name, file in (('topic-brief', ${rel('brief-v1.json')}), ('evidence-set', ${rel('evidence-v1.json')}), ('evidence-set', ${rel('evidence-v2.json')}), ('script', ${rel('script-v1.json')}), ('script', ${rel('script-v2.json')})):`,
  '    validate_contract(json.load(open(file)), name, schemas, registry); print(f"{file} valid against {name}")',
  `rows = json.load(open(${rel('approvals.json')}))`, "[validate_contract(row, 'workflow#Approval', schemas, registry) for row in rows]",
  "print(f'{len(rows)} approvals valid against workflow#Approval')",
  `validate_contract(json.load(open(${rel('audit/' + readdirSync(join(out, 'audit')).find((f) => f.endsWith('-search.json')))}))['response']['tool_result'], 'workflow#ToolResult', schemas, registry)`,
  "print('search tool_result valid against workflow#ToolResult')"].join('\n')], { cwd: ROOT, encoding: 'utf8' });
save('schema-check.txt', check.stdout + check.stderr);

const claimStatus = Object.fromEntries(evidence1.document.claims.map((c) => [c.claim_id, c.status]));
const checks = {
  duration_120_resumed: savedBrief.document.duration_target_seconds === 120 && resumed.resolved.target_frames === 3600,
  search_authorized_only: JSON.stringify(search.candidates.map((c) => [c.source_id, c.locator])) === '[["team-guide-v1","第 3 段"],["team-guide-v2","第 2 段"]]',
  conflict_keeps_locators: claimStatus['no-expiry'] === 'disputed' && /第 3 段.*第 2 段/.test(evidence1.document.conflicts[0].description),
  unsupported_marked: claimStatus['always-half'] === 'unsupported',
  stale_g1_rejected: staleG1.issues[0]?.code === 'APPROVAL_TARGET_MISMATCH',
  g1_binds_evidence_v2: g1.approval?.target_hash === evidence2.content_hash,
  script_unsupported_rejected: JSON.stringify(unsupported.issues.map((i) => [i.code, i.section_id, i.claim_id])) === '[["CLAIM_UNSUPPORTED","sec_003","always-half"]]',
  section_ids_kept: JSON.stringify(diff.map((d) => [d.section_id, d.change])) ===
    '[["sec_001","edited"],["sec_002","unchanged"],["sec_006","added"],["sec_003","unchanged"],["sec_004","unchanged"],["sec_005","unchanged"]]',
  claims_carried: JSON.stringify(script2.document.sections.find((s) => s.section_id === 'sec_004').claim_ids) === '["validate"]',
  audition_terms: JSON.stringify(script1.audition_terms) === '["304"]',
  g2_binds_script_v2: g2.approval?.target_hash === script2.content_hash && accepted.state === 'AUDIO_RUNNING',
  schemas_valid: check.status === 0,
};
const files = (d) => readdirSync(d).flatMap((name) => statSync(join(d, name)).isDirectory() ? files(join(d, name)) : [join(d, name)]);
const record = {
  task_id: 'T04', case_id: 'A04', run_id: runId, status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', evidence_level: 'RUNTIME',
  environment: { node: process.version, platform: `${process.platform}-${process.arch}`, python: spawnSync(python, ['--version'], { encoding: 'utf8' }).stdout.trim() },
  commands_and_exit_codes: [
    { command: `node docs/upgrade/evidence/replay_t04.mjs ${runId} ${basename(python)}`, note: 'each CLI call is saved under audit/ with request, exit code and response' },
    { command: `${basename(python)} -B -c <validate brief, evidence, script, approvals and the search ToolResult>`, exit_code: check.status, saved_as: 'schema-check.txt' },
  ],
  input_hashes: [...['examples/topic-cache-speed/brief.json', 'examples/topic-cache-speed/evidence-set.json', 'examples/topic-cache-speed/script.json',
    'profiles/duration.yaml', 'workflows/topic-to-video.yaml'].map((path) => ({ path, sha256: sha256(readFileSync(join(ROOT, path))) })),
    ...Object.entries(materials).map(([name, text]) => ({ path: `fixture materials/${name}`, sha256: sha256(text) }))],
  output_hashes: files(out).map((path) => ({ path: relative(out, path), sha256: sha256(readFileSync(path)) })),
  approval_hashes: tables.approvals.map((a) => ({ gate: a.gate, decision: a.decision, target_hash: a.target_hash, reviewer_id: a.reviewer_id })),
  observations: [
    `checks: ${JSON.stringify(checks)}`,
    `evidence v1 ${evidence1.content_hash}, v2 ${evidence2.content_hash}; script v1 ${script1.content_hash}, v2 ${script2.content_hash}`,
    `script v2 sections: ${diff.map((d) => `${d.section_id}:${d.change}`).join(', ')}; planned frames v1 ${script1.planned_frames}, v2 ${script2.planned_frames} (estimate at 4.5 characters per second until T05 measures audio)`,
    'scope: sources are local fixtures (example.invalid URLs, owner-authorized material written by this script); the G1/G2 sessions are created by this script, not by a Studio host; real research sources, a real reviewer and network search are NOT_RUN',
  ],
  evidence_paths: files(out).map((path) => relative(ROOT, path)),
  reviewer: null,
};
save('record.json', record);
console.log(JSON.stringify({ status: record.status, checks, calls: audit.length }));
