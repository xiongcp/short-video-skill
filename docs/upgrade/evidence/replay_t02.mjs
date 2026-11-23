// Rebuild A02 evidence: idempotent events, version conflicts, human-only gates, stale G2, draft export, concurrent writers.
// usage: node docs/upgrade/evidence/replay_t02.mjs <run_id> [python]
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT, makeProject, writeJson } from '../../../tests/runtime/helpers.mjs';
import { createSession } from '../../../runtime/approvals.ts';

const [runId, python = 'python3'] = process.argv.slice(2);
if (!runId) throw new Error('usage: replay_t02.mjs <run_id> [python]');
const out = join(ROOT, 'docs', 'upgrade', 'evidence', 'runs', runId, 'A02');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'audit'), { recursive: true });
const sha256 = (path) => 'sha256:' + createHash('sha256').update(readFileSync(path)).digest('hex');
const H = (c) => 'sha256:' + c.repeat(64);
const [EVIDENCE, SCRIPT, SCRIPT_V2, SAMPLE, MASTER, MANIFEST] = ['e', '1', '2', '5', '4', '6'].map(H);
const CLI = ['--experimental-strip-types', '--no-warnings', join(ROOT, 'runtime', 'cli.ts')];
const audit = [];

function call(project, label, op, request, session, record = true) {
  const path = writeJson(join(project, 'requests', 'last.json'), request);
  const env = { ...process.env, SVS_SESSION_TOKEN: session?.token ?? '' };
  const run = spawnSync(process.execPath, [...CLI, op, '--project', project, '--request', path], { encoding: 'utf8', env });
  const response = JSON.parse(run.stdout);
  if (!record) return response;
  const entry = { seq: audit.length, label, project_id: response.project_id, op,
    session: session ? `${session.kind}:${session.reviewer}` : null, request, exit_code: run.status, response };
  writeFileSync(join(out, 'audit', `${String(entry.seq).padStart(3, '0')}-${label}.json`), JSON.stringify(entry, null, 2) + '\n');
  audit.push(entry);
  return response;
}

function scenario(project, id, mode) {
  const sessions = {
    owner: { kind: 'human', reviewer: 'owner', token: createSession(project, { reviewer_id: 'owner', kind: 'human' }) },
    bot: { kind: 'agent', reviewer: 'writer-bot', token: createSession(project, { reviewer_id: 'writer-bot', kind: 'agent' }) },
  };
  call(project, `${id}-init`, 'init', { project_id: id, title: '缓存原理', mode });
  const version = () => call(project, 'status', 'status', { project_id: id }, null, false).version;
  const step = (label, event, payload = {}) => { const v = version(); return call(project, label, 'event', { project_id: id, expected_version: v, idempotency_key: `${event}-${v}`, event, payload }); };
  const decide = (label, gate, target_hash, decision = 'approve', session = sessions.owner, extra = {}) => {
    const v = version();
    return call(project, label, 'decide', { project_id: id, expected_version: v, idempotency_key: `${gate}-${decision}-${v}`, gate, target_hash, decision, notes: `${gate} ${decision}`, ...extra }, session);
  };
  return { sessions, step, decide, call: (label, op, request, session) => call(project, label, op, request, session) };
}

// Quality project: the full gate path with every negative case from the A02 card.
const quality = makeProject();
const q = scenario(quality, 'cache-demo', 'quality');
const brief = { project_id: 'cache-demo', expected_version: 1, idempotency_key: 'brief-1', event: 'brief_saved', payload: {} };
q.call('replay-first', 'event', brief);
q.call('replay-same-key-same-request', 'event', brief);
q.call('same-key-different-request', 'event', { ...brief, expected_version: 2, event: 'research_started' });
q.call('stale-expected-version', 'event', { ...brief, idempotency_key: 'research-1', event: 'research_started' });
q.step('research-started', 'research_started');
q.step('evidence-without-hash', 'evidence_saved');
q.step('evidence-saved', 'evidence_saved', { artifact_hash: EVIDENCE });
q.step('research-accepted-without-g1', 'research_accepted');
q.decide('g1-approve-owner', 'G1', EVIDENCE);
q.step('research-accepted', 'research_accepted');
q.step('script-v1-saved', 'script_saved', { artifact_hash: SCRIPT });
q.decide('g2-approve-v1', 'G2', SCRIPT);
q.decide('g2-reject-v1-reopens-script', 'G2', SCRIPT, 'reject');
q.step('script-v2-saved', 'script_saved', { artifact_hash: SCRIPT_V2 });
q.step('script-accepted-with-expired-g2', 'script_accepted');
q.decide('g2-approve-v2', 'G2', SCRIPT_V2);
q.step('script-accepted', 'script_accepted');
for (const event of ['audio_verified', 'alignment_verified', 'storyboard_saved', 'assets_resolved', 'snapshot_compiled', 'sample_render_requested']) q.step(event.replaceAll('_', '-'), event);
q.step('sample-rendered', 'sample_rendered', { artifact_hash: SAMPLE });
q.step('sample-checked', 'sample_checked', { checks: { sample_qa_pass: true } });
q.decide('g3-approve', 'G3', SAMPLE);
q.step('sample-accepted', 'sample_accepted');
q.step('master-checked-without-qa', 'master_checked', { artifact_hash: MASTER });
q.step('master-checked', 'master_checked', { artifact_hash: MASTER, checks: { final_qa_pass: true } });
q.decide('g4-forged-reviewer-field', 'G4', MASTER, 'approve', null, { reviewer_id: 'owner' });
q.decide('g4-agent-session', 'G4', MASTER, 'approve', q.sessions.bot);
q.decide('g4-no-session', 'G4', MASTER, 'approve', null);
q.step('master-accepted-without-g4', 'master_accepted');
q.decide('g4-approve-owner', 'G4', MASTER);
q.step('master-accepted', 'master_accepted');
q.step('manifest-prepared', 'manifest_prepared', { artifact_hash: MANIFEST });
q.decide('g5-bound-to-master-hash', 'G5', MASTER);
q.decide('g5-approve-manifest', 'G5', MANIFEST);
q.step('export-authorized', 'export_authorized');

// Draft project: reaches DRAFT_READY and cannot enter the export path.
const draft = makeProject();
const d = scenario(draft, 'cache-draft', 'draft');
for (const [event, payload] of [['brief_saved'], ['research_started'], ['evidence_saved', { artifact_hash: EVIDENCE }], ['draft_script_requested'],
  ['script_saved', { artifact_hash: SCRIPT }], ['draft_audio_requested'], ['audio_verified'], ['alignment_verified'], ['storyboard_saved'],
  ['assets_resolved'], ['snapshot_compiled']]) d.step(`draft-${event.replaceAll('_', '-')}`, event, payload);
d.step('draft-sample-render-requested', 'sample_render_requested');
d.step('draft-render-requested', 'draft_render_requested');
d.step('draft-labeled-checked', 'labeled_draft_checked', { checks: { playable: true, draft_marked: true, issues_recorded: true } });
for (const event of ['manifest_prepared', 'export_authorized', 'archive_verified']) d.step(`draft-${event.replaceAll('_', '-')}`, event, { artifact_hash: MANIFEST });

// Concurrent writers: eight processes race on the same expected_version.
const race = makeProject();
call(race, 'race-init', 'init', { project_id: 'race', title: 'race', mode: 'quality' });
const results = await Promise.all(Array.from({ length: 8 }, (_, i) => new Promise((resolve) => {
  const path = writeJson(join(race, 'requests', `race-${i}.json`), { project_id: 'race', expected_version: 1, idempotency_key: `race-${i}`, event: 'brief_saved', payload: {} });
  const child = spawn(process.execPath, [...CLI, 'event', '--project', race, '--request', path]);
  let stdout = '', stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });
  child.on('close', (code) => resolve({ code, status: stdout ? JSON.parse(stdout).status : null, crashed: !stdout, stderr: stderr.slice(0, 200) }));
})));
writeFileSync(join(out, 'concurrency.json'), JSON.stringify(results, null, 2) + '\n');

// Snapshots and table dumps (session token hashes are omitted).
const tables = {};
for (const [name, dir] of [['quality', quality], ['draft', draft], ['race', race]]) {
  const db = new DatabaseSync(join(dir, 'studio.sqlite'));
  db.exec(`VACUUM INTO '${join(out, `${name}.sqlite`)}'`);
  tables[name] = {
    projects: db.prepare('SELECT * FROM projects').all(),
    events: db.prepare('SELECT event_id, version, idempotency_key, event, from_state, to_state, actor, payload, recorded_at FROM events ORDER BY version').all(),
    approvals: db.prepare('SELECT * FROM approvals ORDER BY version').all(),
    sessions: db.prepare('SELECT session_id, reviewer_id, kind, created_at FROM sessions').all(),
  };
  db.close();
}
writeFileSync(join(out, 'tables.json'), JSON.stringify(tables, null, 2) + '\n');
const approvals = tables.quality.approvals.map(({ session_id, event_id, ...approval }) => approval);
writeFileSync(join(out, 'approvals.json'), JSON.stringify(approvals, null, 2) + '\n');
const schemaCheck = spawnSync(python, ['-B', '-c', [
  'import json, sys', "sys.path.insert(0, 'evals')", 'from check_design import read_schemas, validate_contract',
  'schemas, registry = read_schemas()', `rows = json.load(open(${JSON.stringify(relative(ROOT, join(out, 'approvals.json')))}))`,
  "[validate_contract(row, 'workflow#Approval', schemas, registry) for row in rows]",
  "print(f'{len(rows)} approvals valid against workflow.schema.json#/$defs/Approval')"].join('\n')], { cwd: ROOT, encoding: 'utf8' });
writeFileSync(join(out, 'approval-schema-check.txt'), schemaCheck.stdout + schemaCheck.stderr);

// Rejections must leave version and event count untouched ("zero unauthorized calls").
const rejections = audit.filter((entry) => entry.response.status === 'REJECTED').map((entry) => {
  const before = audit.slice(0, entry.seq).reverse().find((prior) => prior.project_id === entry.project_id && prior.response.version != null);
  return { seq: entry.seq, label: entry.label, codes: entry.response.issues.map((issue) => issue.code),
    version_unchanged: before ? before.response.version === entry.response.version && before.response.event_count === entry.response.event_count : null };
});
writeFileSync(join(out, 'rejections.json'), JSON.stringify(rejections, null, 2) + '\n');

const files = (dir) => readdirSync(dir).flatMap((name) => statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]);
const finalQuality = tables.quality.projects[0], finalDraft = tables.draft.projects[0];
const pass = finalQuality.state === 'PACKAGING' && finalDraft.state === 'DRAFT_READY' && schemaCheck.status === 0
  && rejections.every((item) => item.version_unchanged) && results.filter((r) => r.status === 'APPLIED').length === 1 && !results.some((r) => r.crashed);
const record = {
  task_id: 'T02', case_id: 'A02', run_id: runId, status: pass ? 'PASS' : 'FAIL', evidence_level: 'RUNTIME',
  environment: { node: process.version, platform: `${process.platform}-${process.arch}`, sqlite: new DatabaseSync(':memory:').prepare('SELECT sqlite_version() AS v').get().v,
    python: spawnSync(python, ['--version'], { encoding: 'utf8' }).stdout.trim() },
  commands_and_exit_codes: [
    { command: `node docs/upgrade/evidence/replay_t02.mjs ${runId} ${basename(python)}`, note: 'each CLI call is saved under audit/ with request, exit code and response' },
    { command: `${basename(python)} -B -c <validate approvals.json against workflow#Approval>`, exit_code: schemaCheck.status, saved_as: 'approval-schema-check.txt' },
  ],
  input_hashes: [{ path: 'workflows/topic-to-video.yaml', sha256: sha256(join(ROOT, 'workflows', 'topic-to-video.yaml')) },
    { path: 'policies/approval-gates.yaml', sha256: sha256(join(ROOT, 'policies', 'approval-gates.yaml')) }],
  output_hashes: files(out).map((path) => ({ path: relative(out, path), sha256: sha256(path) })),
  observations: [
    `${audit.length} CLI calls, ${rejections.length} rejected; every rejection left version and event count unchanged: ${rejections.every((item) => item.version_unchanged)}`,
    `quality project ended at ${finalQuality.state} v${finalQuality.version} with ${tables.quality.events.length} events and ${tables.quality.approvals.length} human decisions`,
    `draft project ended at ${finalDraft.state}; manifest_prepared/export_authorized/archive_verified rejected`,
    `8 concurrent writers: ${results.filter((r) => r.status === 'APPLIED').length} applied, ${results.filter((r) => r.status === 'REJECTED').length} rejected, ${results.filter((r) => r.crashed).length} crashed`,
    'human and agent sessions were created through the host-side createSession hook (simulated authentication); a real authenticated UI session arrives with T11, so UI receipts are NOT_RUN',
  ],
  evidence_paths: files(out).map((path) => relative(ROOT, path)),
  reviewer: null,
};
writeFileSync(join(out, 'record.json'), JSON.stringify(record, null, 2) + '\n');
for (const dir of [quality, draft, race]) rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ status: record.status, out: relative(ROOT, out), calls: audit.length, rejections: rejections.length }));
