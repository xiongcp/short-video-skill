// Rebuild A03 evidence against the local provider test endpoint (tests/runtime/fake-provider.mjs); no real vendor or money.
// usage: node docs/upgrade/evidence/replay_t03.mjs <run_id> [python]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT, makeProject, runCliAsync, writeJson } from '../../../tests/runtime/helpers.mjs';
import { startProvider } from '../../../tests/runtime/fake-provider.mjs';
import { createSession } from '../../../runtime/approvals.ts';

const [runId, python = 'python3'] = process.argv.slice(2);
if (!runId) throw new Error('usage: replay_t03.mjs <run_id> [python]');
const out = join(ROOT, 'docs', 'upgrade', 'evidence', 'runs', runId, 'A03');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'audit'), { recursive: true });
const sha256 = (path) => 'sha256:' + createHash('sha256').update(readFileSync(path)).digest('hex');
const audit = [];
let nextSeq = 0;

async function call(project, label, op, request, env = {}, session = null) {
  const seq = nextSeq++; // allocated before awaiting so concurrent calls never share a request file
  const path = writeJson(join(project, 'requests', `${seq}.json`), request);
  const run = await runCliAsync([op, '--project', project, '--request', path], env);
  const entry = { seq, label, op, session, request, exit_code: run.code, response: run.json };
  writeFileSync(join(out, 'audit', `${String(entry.seq).padStart(3, '0')}-${label}.json`), JSON.stringify(entry, null, 2) + '\n');
  audit.push(entry);
  return run.json;
}

async function project(id, providerOptions, limit) {
  const dir = makeProject();
  const provider = await startProvider(providerOptions);
  await call(dir, `${id}-init`, 'init', { project_id: id, title: id, mode: 'quality' });
  const owner = createSession(dir, { reviewer_id: 'owner', kind: 'human' });
  const bot = createSession(dir, { reviewer_id: 'writer-bot', kind: 'agent' });
  const env = { SVS_PROVIDER_URL: provider.url };
  const budget = (label, token, session, amount = limit) =>
    call(dir, label, 'budget', { project_id: id, currency: 'CNY', project_limit_minor: amount }, { SVS_SESSION_TOKEN: token }, session);
  const submit = (label, key, extra = {}) => call(dir, label, 'submit', { project_id: id, idempotency_key: key, skill_id: 'audio-production',
    tool: 'generate_tts', provider: 'test-provider', quote_minor: 70, payload: { section_id: key }, ...extra }, env);
  const reconcile = (label, key) => call(dir, label, 'reconcile', { project_id: id, idempotency_key: key }, env);
  const ledger = (label) => call(dir, label, 'ledger', { project_id: id });
  return { id, dir, provider, owner, bot, budget, submit, reconcile, ledger };
}

const phases = [];
const snap = (name, p) => phases.push({ phase: name, project_id: p.id, provider_counts: { ...p.provider.counts } });

// A: limit 100, two concurrent 70-unit intents, a lost receipt, restart and reconciliation by the original key.
const a = await project('budget-race', { dropReceipt: true }, 100);
await a.submit('a-submit-before-budget', 'tts-0');
await a.budget('a-budget-by-agent', a.bot, 'agent:writer-bot');
await a.budget('a-budget-by-owner', a.owner, 'human:owner');
await a.submit('a-permission-denied', 'tts-x', { skill_id: 'script-writer' });
snap('A before race', a);
await Promise.all([a.submit('a-race-left', 'tts-a'), a.submit('a-race-right', 'tts-b')]);
snap('A after race (receipt dropped)', a);
await a.ledger('a-ledger-after-race');
const unknownKey = audit.filter((e) => e.label.startsWith('a-race')).find((e) => e.response.status === 'UNKNOWN').request.idempotency_key;
await a.submit('a-resubmit-unknown', unknownKey);
snap('A after resubmitting the unknown key', a);
a.provider.dropReceipt = false;
await a.reconcile('a-reconcile-after-restart', unknownKey);
await a.reconcile('a-reconcile-again', unknownKey);
snap('A after reconciliation', a);
await a.ledger('a-ledger-final');

// B: provider without a lookup API keeps the job UNKNOWN with the balance pending verification.
const b = await project('no-lookup', { dropReceipt: true, queryEnabled: false }, 100);
await b.budget('b-budget-by-owner', b.owner, 'human:owner');
await b.submit('b-submit-receipt-dropped', 'tts-1');
await b.reconcile('b-reconcile-unsupported', 'tts-1');
snap('B after reconcile attempt', b);
await b.ledger('b-ledger-final');

// C: repeated and concurrent duplicates of one intent reach the provider once.
const c = await project('repeat-intent', {}, 1000);
await c.budget('c-budget-by-owner', c.owner, 'human:owner');
await c.submit('c-submit', 'tts-1');
await c.submit('c-submit-same-key', 'tts-1');
await c.submit('c-submit-same-key-new-payload', 'tts-1', { payload: { section_id: 'changed' } });
await Promise.all([1, 2, 3, 4].map((i) => c.submit(`c-concurrent-duplicate-${i}`, 'tts-2')));
snap('C after duplicates', c);
await c.ledger('c-ledger-final');

writeFileSync(join(out, 'provider-counts.json'), JSON.stringify(phases, null, 2) + '\n');
writeFileSync(join(out, 'provider-requests.json'), JSON.stringify(Object.fromEntries([a, b, c].map((p) => [p.id, p.provider.log])), null, 2) + '\n');

const tables = {};
for (const p of [a, b, c]) {
  await p.provider.close();
  const db = new DatabaseSync(join(p.dir, 'studio.sqlite'));
  db.exec(`VACUUM INTO '${join(out, `${p.id}.sqlite`)}'`);
  tables[p.id] = {
    budgets: db.prepare('SELECT budget_id, currency, project_limit_minor, reviewer_id, recorded_at FROM budgets').all(),
    jobs: db.prepare('SELECT * FROM jobs ORDER BY created_at').all(),
    ledger: db.prepare('SELECT project_id, version, entry_id, job_id, reservation_id, operation, currency, amount_minor, recorded_at, external_receipt FROM ledger ORDER BY version').all(),
  };
  db.close();
  rmSync(p.dir, { recursive: true, force: true });
}
writeFileSync(join(out, 'tables.json'), JSON.stringify(tables, null, 2) + '\n');
const ledgerRows = Object.values(tables).flatMap((t) => t.ledger);
const toolResults = audit.filter((e) => e.response?.tool_result).map((e) => e.response.tool_result);
writeFileSync(join(out, 'ledger-entries.json'), JSON.stringify(ledgerRows, null, 2) + '\n');
writeFileSync(join(out, 'tool-results.json'), JSON.stringify(toolResults, null, 2) + '\n');
const check = spawnSync(python, ['-B', '-c', [
  'import json, sys', "sys.path.insert(0, 'evals')", 'from check_design import read_schemas, validate_contract',
  'schemas, registry = read_schemas()',
  `for name, file in (('workflow#LedgerEntry', ${JSON.stringify(relative(ROOT, join(out, 'ledger-entries.json')))}), ('workflow#ToolResult', ${JSON.stringify(relative(ROOT, join(out, 'tool-results.json')))})):`,
  '    rows = json.load(open(file))', '    [validate_contract(row, name, schemas, registry) for row in rows]', "    print(f'{len(rows)} rows valid against {name}')"].join('\n')],
{ cwd: ROOT, encoding: 'utf8' });
writeFileSync(join(out, 'schema-check.txt'), check.stdout + check.stderr);

const final = (label) => audit.find((e) => e.label === label).response;
const race = audit.filter((e) => e.label.startsWith('a-race')).map((e) => e.response.status).sort();
const afterRace = final('a-ledger-after-race'), aFinal = final('a-ledger-final'), bFinal = final('b-ledger-final'), cFinal = final('c-ledger-final');
const settles = (rows) => rows.filter((r) => r.operation === 'settle').length;
const checks = {
  race_one_reservation: JSON.stringify(race) === '["REJECTED","UNKNOWN"]' && afterRace.held_minor === 70 && afterRace.available_minor === 30,
  unknown_not_resubmitted: phases[2].provider_counts.posts === 1,
  reconciled_once: aFinal.spent_minor === 60 && aFinal.held_minor === 0 && settles(aFinal.entries) === 1,
  no_lookup_pending: bFinal.pending_verification_minor === 70 && bFinal.available_minor === 30 && settles(bFinal.entries) === 0,
  duplicates_once: phases.at(-1).provider_counts.posts === 2 && phases.at(-1).provider_counts.accepted === 2 && settles(cFinal.entries) === 2,
  permission_denied_no_call: phases[0].provider_counts.posts === 0,
  agent_budget_denied: final('a-budget-by-agent').issues[0].code === 'HUMAN_REQUIRED',
  schemas_valid: check.status === 0,
};
const files = (dir) => readdirSync(dir).flatMap((name) => statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]);
const record = {
  task_id: 'T03', case_id: 'A03', run_id: runId, status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', evidence_level: 'RUNTIME',
  environment: { node: process.version, platform: `${process.platform}-${process.arch}`, python: spawnSync(python, ['--version'], { encoding: 'utf8' }).stdout.trim(),
    provider: 'local HTTP test endpoint tests/runtime/fake-provider.mjs (simulated vendor, price 60 minor units, no real money)' },
  commands_and_exit_codes: [
    { command: `node docs/upgrade/evidence/replay_t03.mjs ${runId} ${basename(python)}`, note: 'each CLI call is saved under audit/ with request, exit code and response' },
    { command: `${basename(python)} -B -c <validate ledger-entries.json and tool-results.json>`, exit_code: check.status, saved_as: 'schema-check.txt' },
  ],
  input_hashes: ['policies/budget.yaml', 'policies/permissions.yaml'].map((path) => ({ path, sha256: sha256(join(ROOT, path)) })),
  output_hashes: files(out).map((path) => ({ path: relative(out, path), sha256: sha256(path) })),
  observations: [
    `checks: ${JSON.stringify(checks)}`,
    `race under limit 100: statuses ${JSON.stringify(race)}; after race held ${afterRace.held_minor}, available ${afterRace.available_minor}`,
    `after reconciliation: spent ${aFinal.spent_minor}, held ${aFinal.held_minor}, available ${aFinal.available_minor}, provider posts ${phases[3].provider_counts.posts}, queries ${phases[3].provider_counts.queries}`,
    `no lookup API: pending_verification ${bFinal.pending_verification_minor}, available ${bFinal.available_minor}`,
    'scope: the vendor is a local test endpoint; each CLI call is a separate process, so reconciliation runs after a process restart; real vendor credentials and receipts are NOT_RUN',
  ],
  evidence_paths: files(out).map((path) => relative(ROOT, path)),
  reviewer: null,
};
writeFileSync(join(out, 'record.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ status: record.status, checks, calls: audit.length }));
