// T12 prerequisite: owner passphrase sign-in. Only someone who knows the owner's passphrase can obtain a
// short-lived human session; sessions minted by the host hook (tests, replays) are marked `host-hook`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { makeProject, runCli, writeJson } from './helpers.mjs';
import { createSession, humanSession } from '../../runtime/approvals.ts';
import { openStore } from '../../runtime/project-store.ts';
import { ownerLogin, setupOwner } from '../../runtime/owner.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const PASS = 'correct horse battery staple';
let n = 0;
const call = (project, op, request, env) =>
  runCli([op, '--project', project, '--request', writeJson(join(project, 'requests', `${n++}-${op}.json`), request)], env);

function project() {
  const dir = makeProject();
  assert.equal(call(dir, 'init', { project_id: 'owner-demo', title: '所有者登录', mode: 'quality' }).code, 0);
  return dir;
}

test('owner setup rejects a weak passphrase and refuses to overwrite an existing credential', () => {
  const dir = project();
  assert.equal(setupOwner(dir, { reviewer_id: 'owner', passphrase: 'short' }).report.issues[0].code, 'OWNER_PASSPHRASE_WEAK');
  const ok = setupOwner(dir, { reviewer_id: 'owner', passphrase: PASS });
  assert.equal(ok.exitCode, 0);
  assert.equal(ok.report.status, 'OWNER_CONFIGURED');
  assert.equal(setupOwner(dir, { reviewer_id: 'owner', passphrase: 'another long passphrase' }).report.issues[0].code, 'OWNER_EXISTS');
});

test('login needs the right passphrase and yields a passphrase-authenticated human session', () => {
  const dir = project();
  setupOwner(dir, { reviewer_id: 'owner', passphrase: PASS });
  assert.equal(ownerLogin(dir, { reviewer_id: 'owner', passphrase: 'wrong passphrase here' }).report.issues[0].code, 'OWNER_AUTH_FAILED');
  assert.equal(ownerLogin(dir, { reviewer_id: 'nobody', passphrase: PASS }).report.issues[0].code, 'OWNER_NOT_CONFIGURED');
  const login = ownerLogin(dir, { reviewer_id: 'owner', passphrase: PASS });
  assert.equal(login.exitCode, 0);
  const db = openStore(dir);
  const session = humanSession(db, login.report.token);
  assert.equal(session.reviewer_id, 'owner');
  assert.equal(session.auth, 'passphrase');
  assert.equal(humanSession(db, createSession(dir, { reviewer_id: 'owner', kind: 'human' })).auth, 'host-hook');
  const budget = call(dir, 'budget', { project_id: 'owner-demo', currency: 'CNY', project_limit_minor: 1000 }, { SVS_SESSION_TOKEN: login.report.token });
  assert.equal(budget.code, 0, budget.stdout + budget.stderr);
});

test('an expired owner session is no longer a human session', () => {
  const dir = project();
  setupOwner(dir, { reviewer_id: 'owner', passphrase: PASS });
  const past = new Date(Date.now() - 2 * 3600 * 1000);
  const login = ownerLogin(dir, { reviewer_id: 'owner', passphrase: PASS, ttl_minutes: 60 }, past);
  assert.equal(login.exitCode, 0);
  assert.equal(humanSession(openStore(dir), login.report.token), undefined);
  const budget = call(dir, 'budget', { project_id: 'owner-demo', currency: 'CNY', project_limit_minor: 1000 }, { SVS_SESSION_TOKEN: login.report.token });
  assert.equal(budget.code, 1);
  assert.equal(budget.json.issues[0].code, 'HUMAN_REQUIRED');
});

test('the owner entry point refuses to run without an interactive terminal, and the CLI has no login operation', () => {
  const dir = project();
  const piped = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(ROOT, 'runtime', 'owner.ts'),
    'login', '--project', dir, '--reviewer', 'owner'], { input: PASS + '\n', encoding: 'utf8' });
  assert.equal(piped.status, 2);
  assert.match(piped.stdout + piped.stderr, /OWNER_TTY_REQUIRED/);
  for (const op of ['login', 'owner', 'setup']) assert.notEqual(call(dir, op, { project_id: 'owner-demo' }).code, 0);
});
