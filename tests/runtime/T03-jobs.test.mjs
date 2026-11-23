// T03 / A03: permissions, budget reservations, idempotent provider submission and reconciliation of unknown receipts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeProject, runCliAsync, writeJson } from './helpers.mjs';
import { createSession } from '../../runtime/approvals.ts';
import { startProvider } from './fake-provider.mjs';

let n = 0;
async function call(project, op, request, env = {}) {
  const path = writeJson(join(project, 'requests', `${String(n++).padStart(3, '0')}-${op}.json`), request);
  return runCliAsync([op, '--project', project, '--request', path], env);
}

// A project with a human-confirmed 100-unit limit, wired to a provider test endpoint.
async function setup(providerOptions = {}, limit = 100) {
  const project = makeProject();
  const provider = await startProvider(providerOptions);
  try {
    const init = await call(project, 'init', { project_id: 'cache-demo', title: '缓存原理', mode: 'quality' });
    assert.equal(init.code, 0, init.stdout + init.stderr);
    if (limit !== null) {
      const owner = createSession(project, { reviewer_id: 'owner', kind: 'human' });
      const budget = await call(project, 'budget', { project_id: 'cache-demo', currency: 'CNY', project_limit_minor: limit }, { SVS_SESSION_TOKEN: owner });
      assert.equal(budget.code, 0, budget.stdout + budget.stderr);
    }
  } catch (error) {
    await provider.close();
    throw error;
  }
  const env = { SVS_PROVIDER_URL: provider.url };
  const submit = (key, extra = {}) => call(project, 'submit', { project_id: 'cache-demo', idempotency_key: key, skill_id: 'audio-production',
    tool: 'generate_tts', provider: 'test-provider', quote_minor: 70, payload: { section_id: 'sec-001' }, ...extra }, env);
  const reconcile = (key) => call(project, 'reconcile', { project_id: 'cache-demo', idempotency_key: key }, env);
  const ledger = async () => (await call(project, 'ledger', { project_id: 'cache-demo' })).json;
  return { project, provider, submit, reconcile, ledger };
}

test('paid work needs a budget confirmed by a human session', async () => {
  const { project, provider, submit } = await setup({}, null);
  try {
    const unconfigured = await submit('tts-1');
    assert.deepEqual(unconfigured.json.issues.map((item) => item.code), ['BUDGET_UNCONFIGURED']);
    const agent = createSession(project, { reviewer_id: 'writer-bot', kind: 'agent' });
    const byAgent = await call(project, 'budget', { project_id: 'cache-demo', currency: 'CNY', project_limit_minor: 100 }, { SVS_SESSION_TOKEN: agent });
    assert.deepEqual(byAgent.json.issues.map((item) => item.code), ['HUMAN_REQUIRED']);
    assert.equal(provider.counts.posts, 0);
  } finally { await provider.close(); }
});

test('two concurrent 70-unit intents under a 100 limit leave one reservation and 30 available', async () => {
  const { provider, submit, ledger } = await setup({ dropReceipt: true });
  try {
    const results = await Promise.all([submit('tts-a'), submit('tts-b', { payload: { section_id: 'sec-002' } })]);
    const statuses = results.map((result) => result.json.status).sort();
    assert.deepEqual(statuses, ['REJECTED', 'UNKNOWN'], results.map((r) => r.stdout + r.stderr).join('\n'));
    const rejected = results.find((result) => result.json.status === 'REJECTED');
    assert.deepEqual(rejected.json.issues.map((item) => [item.code, item.available_minor]), [['BUDGET_EXCEEDED', 30]]);
    assert.equal(provider.counts.accepted, 1);
    const book = await ledger();
    assert.deepEqual([book.held_minor, book.available_minor, book.spent_minor], [70, 30, 0]);
    assert.deepEqual(book.entries.map((entry) => [entry.operation, entry.amount_minor]), [['reserve', 70]]);
  } finally { await provider.close(); }
});

test('repeating an intent reaches the provider once', async () => {
  const { provider, submit, ledger } = await setup({}, 1000);
  try {
    const first = await submit('tts-1');
    const again = await submit('tts-1');
    assert.equal(first.json.status, 'SUCCEEDED', first.stdout + first.stderr);
    assert.deepEqual([again.json.status, again.json.job_id], ['SUCCEEDED', first.json.job_id]);
    const changed = await submit('tts-1', { payload: { section_id: 'sec-999' } });
    assert.deepEqual(changed.json.issues.map((item) => item.code), ['IDEMPOTENCY_CONFLICT']);
    await Promise.all([1, 2, 3, 4].map(() => submit('tts-2')));
    assert.deepEqual([provider.counts.posts, provider.counts.accepted], [2, 2]);
    const book = await ledger();
    assert.equal(book.entries.filter((entry) => entry.operation === 'settle').length, 2);
    assert.deepEqual([book.spent_minor, book.held_minor], [120, 0]);
  } finally { await provider.close(); }
});

test('a lost receipt is reconciled by the original key after restart and settled exactly once', async () => {
  const { provider, submit, reconcile, ledger } = await setup({ dropReceipt: true });
  try {
    const lost = await submit('tts-1');
    assert.equal(lost.json.status, 'UNKNOWN', lost.stdout + lost.stderr);
    assert.deepEqual([lost.json.tool_result.retryable, lost.json.tool_result.next_action], [false, 'reconcile']);
    const resubmitted = await submit('tts-1');
    assert.equal(resubmitted.json.status, 'UNKNOWN');
    assert.equal(provider.counts.posts, 1);

    provider.dropReceipt = false;
    const settled = await reconcile('tts-1');
    const repeated = await reconcile('tts-1');
    assert.equal(settled.json.status, 'SUCCEEDED', settled.stdout + settled.stderr);
    assert.equal(repeated.json.status, 'SUCCEEDED');
    const book = await ledger();
    assert.deepEqual(book.entries.map((entry) => [entry.operation, entry.amount_minor, entry.external_receipt]),
      [['reserve', 70, null], ['settle', 60, 'rcpt-1'], ['release', 70, null]]);
    assert.deepEqual([book.spent_minor, book.held_minor, book.available_minor], [60, 0, 40]);
    assert.equal(provider.counts.posts, 1);
  } finally { await provider.close(); }
});

test('without a lookup API the job stays UNKNOWN and its reservation pending verification', async () => {
  const { provider, submit, reconcile, ledger } = await setup({ dropReceipt: true, queryEnabled: false });
  try {
    await submit('tts-1');
    const pending = await reconcile('tts-1');
    assert.equal(pending.json.status, 'UNKNOWN');
    assert.deepEqual(pending.json.issues.map((item) => item.code), ['PENDING_VERIFICATION']);
    const book = await ledger();
    assert.deepEqual([book.held_minor, book.pending_verification_minor, book.available_minor], [70, 70, 30]);
    assert.deepEqual(book.entries.map((entry) => entry.operation), ['reserve']);
  } finally { await provider.close(); }
});

test('a skill cannot call a tool outside its permissions', async () => {
  const { provider, submit, ledger } = await setup();
  try {
    const denied = await submit('tts-1', { skill_id: 'script-writer' });
    assert.deepEqual(denied.json.issues.map((item) => [item.code, item.skill_id, item.tool]), [['TOOL_NOT_PERMITTED', 'script-writer', 'generate_tts']]);
    assert.equal(provider.counts.posts, 0);
    assert.deepEqual((await ledger()).entries, []);
  } finally { await provider.close(); }
});
