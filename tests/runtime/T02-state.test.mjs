// T02 / A02: persisted project state, versions, idempotent events and human approvals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeProject, runCli, writeJson } from './helpers.mjs';
import { createSession } from '../../runtime/approvals.ts';

let requestCount = 0;
function call(project, op, request, env) {
  const path = writeJson(join(project, 'requests', `${String(requestCount++).padStart(3, '0')}-${op}.json`), request);
  return runCli([op, '--project', project, '--request', path], env);
}

function init(mode = 'quality') {
  const project = makeProject();
  const created = call(project, 'init', { project_id: 'cache-demo', title: '缓存原理', mode });
  assert.equal(created.code, 0, created.stdout + created.stderr);
  return project;
}

const event = (project, expected_version, idempotency_key, name, payload = {}) =>
  call(project, 'event', { project_id: 'cache-demo', expected_version, idempotency_key, event: name, payload });

test('a new project starts at NEW with version 1', () => {
  const project = makeProject();
  const created = call(project, 'init', { project_id: 'cache-demo', title: '缓存原理', mode: 'quality' });
  assert.equal(created.code, 0, created.stdout + created.stderr);
  assert.deepEqual([created.json.state, created.json.version], ['NEW', 1]);
});

test('replaying the same event with the same key returns the original event once', () => {
  const project = init();
  const first = event(project, 1, 'brief-1', 'brief_saved', { artifact_hash: 'sha256:' + 'a'.repeat(64) });
  const again = event(project, 1, 'brief-1', 'brief_saved', { artifact_hash: 'sha256:' + 'a'.repeat(64) });
  assert.equal(first.code, 0, first.stdout + first.stderr);
  assert.equal(again.code, 0, again.stdout + again.stderr);
  assert.equal(first.json.status, 'APPLIED');
  assert.equal(again.json.status, 'REPLAYED');
  assert.equal(again.json.event_id, first.json.event_id);
  assert.deepEqual([again.json.state, again.json.version, again.json.event_count], ['BRIEF_READY', 2, 1]);
});

test('the same key with a different payload is rejected without a new event', () => {
  const project = init();
  event(project, 1, 'brief-1', 'brief_saved', { artifact_hash: 'sha256:' + 'a'.repeat(64) });
  const clash = event(project, 2, 'brief-1', 'research_started');
  assert.equal(clash.code, 1, clash.stdout + clash.stderr);
  assert.equal(clash.json.status, 'REJECTED');
  assert.equal(clash.json.issues[0].code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(clash.json.event_count, 1);
});

test('a stale expected_version is rejected and returns the current version', () => {
  const project = init();
  event(project, 1, 'brief-1', 'brief_saved', { artifact_hash: 'sha256:' + 'a'.repeat(64) });
  const stale = event(project, 1, 'research-1', 'research_started');
  assert.equal(stale.code, 1, stale.stdout + stale.stderr);
  assert.deepEqual(stale.json.issues.map((item) => [item.code, item.current_version]), [['VERSION_CONFLICT', 2]]);
  assert.deepEqual([stale.json.state, stale.json.event_count], ['BRIEF_READY', 1]);
});

// ---- Gates: decisions come only from an authenticated human session held by the host. ----
const H = (c) => 'sha256:' + c.repeat(64);
const EVIDENCE = H('e'), SCRIPT = H('1'), SCRIPT_V2 = H('2'), SAMPLE = H('5'), MASTER = H('4'), MANIFEST = H('6');

function step(project, name, payload = {}) {
  const now = call(project, 'status', { project_id: 'cache-demo' });
  return event(project, now.json.version, `${name}-${now.json.version}`, name, payload);
}

function decide(project, token, gate, target_hash, decision = 'approve', extra = {}) {
  const now = call(project, 'status', { project_id: 'cache-demo' });
  return call(project, 'decide', { project_id: 'cache-demo', expected_version: now.json.version,
    idempotency_key: `${gate}-${now.json.version}`, gate, target_hash, decision, notes: `${gate} ${decision}`, ...extra },
  token ? { SVS_SESSION_TOKEN: token } : {});
}

function ok(result) {
  assert.equal(result.code, 0, result.stdout + result.stderr);
  return result;
}

function walk(project, steps) {
  for (const [name, payload] of steps) ok(step(project, name, payload));
}

const TO_RESEARCH_REVIEW = [['brief_saved'], ['research_started'], ['evidence_saved', { artifact_hash: EVIDENCE }]];

test('a quality gate event needs a human approval bound to the current material', () => {
  const project = init();
  const owner = createSession(project, { reviewer_id: 'owner', kind: 'human' });
  walk(project, TO_RESEARCH_REVIEW.slice(0, 2));
  assert.equal(step(project, 'evidence_saved').json.issues[0].code, 'ARTIFACT_HASH_REQUIRED');
  ok(step(project, 'evidence_saved', { artifact_hash: EVIDENCE }));

  const blocked = step(project, 'research_accepted');
  assert.equal(blocked.code, 1, blocked.stdout);
  assert.deepEqual(blocked.json.issues.map((item) => [item.code, item.gate]), [['APPROVAL_MISSING', 'G1']]);
  assert.equal(blocked.json.state, 'RESEARCH_REVIEW');

  const approval = ok(decide(project, owner, 'G1', EVIDENCE));
  assert.deepEqual([approval.json.approval.reviewer_id, approval.json.approval.target_hash], ['owner', EVIDENCE]);
  assert.equal(ok(step(project, 'research_accepted')).json.state, 'SCRIPT_RUNNING');
});

test('an agent cannot sign G4 for itself; G4 binds the master and G5 the manifest', () => {
  const project = init();
  const owner = createSession(project, { reviewer_id: 'owner', kind: 'human' });
  const agent = createSession(project, { reviewer_id: 'writer-bot', kind: 'agent' });
  walk(project, TO_RESEARCH_REVIEW);
  ok(decide(project, owner, 'G1', EVIDENCE));
  walk(project, [['research_accepted'], ['script_saved', { artifact_hash: SCRIPT }]]);
  ok(decide(project, owner, 'G2', SCRIPT));
  walk(project, [['script_accepted'], ['audio_verified'], ['alignment_verified'], ['storyboard_saved'], ['assets_resolved'],
    ['snapshot_compiled'], ['sample_render_requested'], ['sample_rendered', { artifact_hash: SAMPLE }],
    ['sample_checked', { checks: { sample_qa_pass: true } }]]);
  ok(decide(project, owner, 'G3', SAMPLE));
  ok(step(project, 'sample_accepted'));
  assert.equal(step(project, 'master_checked', { artifact_hash: MASTER }).json.issues[0].code, 'REQUIREMENT_UNMET');
  ok(step(project, 'master_checked', { artifact_hash: MASTER, checks: { final_qa_pass: true } }));

  const before = call(project, 'status', { project_id: 'cache-demo' }).json;
  const forged = decide(project, null, 'G4', MASTER, 'approve', { reviewer_id: 'owner' });
  const asAgent = decide(project, agent, 'G4', MASTER);
  const anonymous = decide(project, null, 'G4', MASTER);
  assert.equal(forged.json.issues[0].code, 'REVIEWER_IN_REQUEST');
  assert.equal(asAgent.json.issues[0].code, 'APPROVAL_UNAUTHENTICATED');
  assert.equal(anonymous.json.issues[0].code, 'APPROVAL_UNAUTHENTICATED');
  const after = call(project, 'status', { project_id: 'cache-demo' }).json;
  assert.deepEqual([after.version, after.event_count, after.state], [before.version, before.event_count, 'FINAL_REVIEW']);
  assert.equal(step(project, 'master_accepted').json.issues[0].code, 'APPROVAL_MISSING');

  ok(decide(project, owner, 'G4', MASTER));
  walk(project, [['master_accepted'], ['manifest_prepared', { artifact_hash: MANIFEST }]]);
  const wrongTarget = decide(project, owner, 'G5', MASTER);
  assert.deepEqual(wrongTarget.json.issues.map((item) => [item.code, item.current_target_hash]), [['APPROVAL_TARGET_MISMATCH', MANIFEST]]);
  ok(decide(project, owner, 'G5', MANIFEST));
  assert.equal(ok(step(project, 'export_authorized')).json.state, 'PACKAGING');
});

test('a G2 approval expires when the script it approved is replaced', () => {
  const project = init();
  const owner = createSession(project, { reviewer_id: 'owner', kind: 'human' });
  walk(project, TO_RESEARCH_REVIEW);
  ok(decide(project, owner, 'G1', EVIDENCE));
  walk(project, [['research_accepted'], ['script_saved', { artifact_hash: SCRIPT }]]);
  ok(decide(project, owner, 'G2', SCRIPT));
  const reopened = ok(decide(project, owner, 'G2', SCRIPT, 'reject'));
  assert.equal(reopened.json.state, 'SCRIPT_RUNNING');
  ok(step(project, 'script_saved', { artifact_hash: SCRIPT_V2 }));

  const expired = step(project, 'script_accepted');
  assert.deepEqual(expired.json.issues.map((item) => [item.code, item.gate, item.current_target_hash]), [['APPROVAL_STALE', 'G2', SCRIPT_V2]]);
  assert.equal(expired.json.state, 'SCRIPT_REVIEW');
});

test('a draft cannot be exported or delivered', () => {
  const project = init('draft');
  walk(project, [...TO_RESEARCH_REVIEW, ['draft_script_requested'], ['script_saved', { artifact_hash: SCRIPT }],
    ['draft_audio_requested'], ['audio_verified'], ['alignment_verified'], ['storyboard_saved'], ['assets_resolved'], ['snapshot_compiled']]);
  assert.equal(step(project, 'sample_render_requested').json.issues[0].code, 'TRANSITION_INVALID');
  walk(project, [['draft_render_requested'], ['labeled_draft_checked', { checks: { playable: true, draft_marked: true, issues_recorded: true } }]]);
  const before = call(project, 'status', { project_id: 'cache-demo' }).json;
  assert.equal(before.state, 'DRAFT_READY');
  for (const name of ['manifest_prepared', 'export_authorized', 'archive_verified']) {
    assert.equal(step(project, name, { artifact_hash: MANIFEST }).json.issues[0].code, 'TRANSITION_INVALID', name);
  }
  const after = call(project, 'status', { project_id: 'cache-demo' }).json;
  assert.deepEqual([after.version, after.event_count], [before.version, before.event_count]);
});

test('a fresh process reads back the same stage, version and event count', () => {
  const project = init();
  walk(project, TO_RESEARCH_REVIEW);
  const last = step(project, 'research_accepted');
  const reread = call(project, 'status', { project_id: 'cache-demo' });
  assert.deepEqual([reread.json.state, reread.json.version, reread.json.event_count],
    [last.json.state, last.json.version, last.json.event_count]);
  assert.deepEqual([reread.json.state, reread.json.event_count], ['RESEARCH_REVIEW', 3]);
});

test('concurrent writers on one version yield one event and version conflicts, never a crash', async () => {
  const { spawn } = await import('node:child_process');
  const { ROOT } = await import('./helpers.mjs');
  const project = init();
  const runs = Array.from({ length: 6 }, (_, i) => {
    const path = writeJson(join(project, 'requests', `race-${i}.json`),
      { project_id: 'cache-demo', expected_version: 1, idempotency_key: `race-${i}`, event: 'brief_saved', payload: {} });
    const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', join(ROOT, 'runtime', 'cli.ts'),
      'event', '--project', project, '--request', path]);
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    return new Promise((resolve) => child.on('close', (code) => resolve({ code, stdout, stderr })));
  });
  const results = await Promise.all(runs);
  for (const result of results) assert.ok([0, 1].includes(result.code), result.stderr);
  const statuses = results.map((result) => JSON.parse(result.stdout).status).sort();
  assert.deepEqual(statuses, ['APPLIED', 'REJECTED', 'REJECTED', 'REJECTED', 'REJECTED', 'REJECTED']);
  const final = call(project, 'status', { project_id: 'cache-demo' }).json;
  assert.deepEqual([final.version, final.event_count], [2, 1]);
});
