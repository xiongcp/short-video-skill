// T12 / A14, A15: production acceptance. A delivered project earns a production PASS only when its master has the
// exact frame count, every gate G1–G5 was signed on current material by the owner's passphrase session, the archive
// verified, and the owner attested genuine voice, original art, approved sources, a full watch-through and the actual
// cost against that archive. These tests run on the controlled T11 fixture, so they must never produce PASS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeProject } from '../runtime/helpers.mjs';
import { ID, call, deliveryStudio, envelope, ok } from '../runtime/delivery-fixture.mjs';
import { createSession } from '../../runtime/approvals.ts';
import { ownerLogin, setupOwner } from '../../runtime/owner.ts';
import { aggregateProgrammes } from '../../runtime/acceptance.ts';

const PASS = 'owner passphrase for t12 tests';
const ITEMS = { voice_genuine: true, art_original: true, sources_owner_approved: true, full_review_watched: true, cost_confirmed: true };
const passphraseOwner = (project) => {
  setupOwner(project, { reviewer_id: 'owner', passphrase: PASS });
  return ownerLogin(project, { reviewer_id: 'owner', passphrase: PASS }).report.token;
};

// Take a studio from APPROVED to DELIVERED exactly as the T11 packaging path does.
async function deliver(ctx) {
  const man = await ok(call(ctx.project, 'manifest', { ...(await envelope(ctx.project, 'exp')) }));
  const g5 = await ok(call(ctx.project, 'decide', {
    ...(await envelope(ctx.project, 'g5')), gate: 'G5', target_hash: man.manifest_hash, decision: 'approve', notes: '清单已核对' }, ctx.owner));
  await ok(call(ctx.project, 'event', { ...(await envelope(ctx.project, 'exp-auth')), event: 'export_authorized', payload: {} }));
  const pkg = await ok(call(ctx.project, 'package', {
    project_id: ID, manifest_ref: man.manifest_ref, manifest_hash: man.manifest_hash, g5_approval_id: g5.approval.approval_id }));
  await ok(call(ctx.project, 'event', { ...(await envelope(ctx.project, 'arch')), event: 'archive_verified', payload: {} }));
  return pkg;
}
const accept = (project, extra = {}) => call(project, 'accept', { project_id: ID, run_id: 'short-60-fixture', criterion: 'A14', target_seconds: 60, ...extra });
const codes = (report) => report.issues.map((i) => i.code);

test('RED on a controlled input: host-hook sign-offs, no attestation and a wrong-length master withhold production PASS', async () => {
  const ctx = await deliveryStudio();
  const pkg = await deliver(ctx);
  const res = await accept(ctx.project);
  assert.equal(res.code, 1);
  assert.equal(res.json.status, 'INCOMPLETE');
  assert.equal(res.json.evidence_level, 'BELOW_PRODUCTION');
  assert.deepEqual(res.json.missing, ['exact_frames', 'gates', 'attestation', 'cost']);
  assert.ok(res.json.frames > 0 && res.json.frames !== 1800, 'frames are measured from the delivered master');
  for (const gate of ['G1', 'G2', 'G3', 'G4', 'G5']) {
    assert.ok(res.json.issues.some((i) => i.code === 'ACCEPT_GATE_NOT_OWNER' && i.gate === gate), `${gate} must require the owner passphrase`);
  }
  assert.ok(codes(res.json).includes('ACCEPT_ATTESTATION_MISSING'));

  // Neither an agent nor a host-hook human session can attest.
  const body = { project_id: ID, archive_hash: pkg.archive_hash, items: ITEMS, actual_cost_minor: 0, currency: 'CNY', notes: '' };
  const agent = await call(ctx.project, 'attest', body, ctx.agent);
  assert.equal(agent.json.issues[0].code, 'HUMAN_REQUIRED');
  const hook = await call(ctx.project, 'attest', body, ctx.owner);
  assert.equal(hook.json.issues[0].code, 'OWNER_AUTH_REQUIRED');

  // A target outside the short profile's 60/120/180 is reported, not passed.
  const bad = await accept(ctx.project, { target_seconds: 90 });
  assert.ok(codes(bad.json).includes('ACCEPT_TARGET_INVALID'));

  // The programme roll-up over this one episode stays INCOMPLETE and names what is missing.
  const roll = await call(ctx.project, 'programme', { episodes: [{ project_dir: '.', project_id: ID, run_id: 'short-60-fixture', criterion: 'A14', target_seconds: 60 }] });
  assert.equal(roll.code, 1);
  assert.equal(roll.json.programmes.A14.status, 'INCOMPLETE');
  assert.deepEqual(roll.json.programmes.A14.episodes.map((e) => e.run_id), ['short-60-fixture']);
  assert.ok(roll.json.issues.some((i) => i.code === 'PROGRAMME_DURATION_MISSING' && i.target_seconds === 60));

  // Listing the same project twice under different run_ids is one episode, not two.
  const twice = await call(ctx.project, 'programme', { episodes: [
    { project_dir: '.', project_id: ID, run_id: 'long-a', criterion: 'A15' },
    { project_dir: join('..', ctx.project.split('/').pop()), project_id: ID, run_id: 'long-b', criterion: 'A15' }] });
  assert.ok(twice.json.programmes.A15.issues.some((i) => i.code === 'PROGRAMME_EPISODE_DUPLICATE' && i.run_id === 'long-b'));
  assert.deepEqual(twice.json.programmes.A15.episodes.map((e) => e.run_id), ['long-a']);
});

test('owner-signed gates and attestation leave only the genuine-media requirement open on fixture material', async () => {
  const ctx = await deliveryStudio({ ownerSession: passphraseOwner });
  const pkg = await deliver(ctx);
  const attest = (extra) => call(ctx.project, 'attest',
    { project_id: ID, archive_hash: pkg.archive_hash, items: ITEMS, actual_cost_minor: 0, currency: 'CNY', notes: '完整回看', ...extra }, ctx.owner);

  const stale = await attest({ archive_hash: 'sha256:' + '1'.repeat(64) });
  assert.equal(stale.json.issues[0].code, 'ATTESTATION_TARGET_MISMATCH');
  const partial = await attest({ items: { ...ITEMS, voice_genuine: 'yes' } });
  assert.equal(partial.json.issues[0].code, 'ATTESTATION_ITEMS_INVALID');

  await ok(attest({ items: { ...ITEMS, voice_genuine: false } }));
  const declined = await accept(ctx.project);
  assert.ok(declined.json.issues.some((i) => i.code === 'ACCEPT_ATTESTATION_ITEM' && i.item === 'voice_genuine'));

  await ok(attest({ actual_cost_minor: 500 }));
  const cost = await accept(ctx.project);
  assert.ok(cost.json.issues.some((i) => i.code === 'ACCEPT_COST_MISMATCH' && i.attested_minor === 500 && i.ledger_minor === 0));

  const signed = await ok(attest({}));
  assert.equal(signed.status, 'ATTESTED');
  const res = await accept(ctx.project);
  assert.equal(res.code, 1);
  assert.deepEqual(res.json.missing, ['exact_frames'], 'fixture media is the only thing left: its length is not a 60 s programme');
  assert.equal(res.json.checks.find((c) => c.check === 'gates').status, 'PASS');

  // The archived database snapshot never carries the owner credential.
  const restored = join(makeProject(), 'restored');
  await ok(call(ctx.project, 'restore', { archive_path: join(ctx.project, pkg.archive_path), target_dir: restored }));
  const db = new DatabaseSync(join(restored, 'project', 'studio.sqlite'), { readOnly: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM owner_credentials').get().n, 0);
  db.close();
});

test('programme aggregation by run_id: A14 needs 60/120/180 with one production PASS, A15 three distinct passes with one revision+recovery', () => {
  const episode = (run_id, criterion, target_seconds, pass, facts = {}, episode_key = `/projects/${run_id}:demo`) => ({
    run_id, episode_key, criterion, target_seconds, status: pass ? 'PRODUCTION_PASS' : 'INCOMPLETE',
    checks: [{ check: 'exact_frames', status: pass || facts.framesOk ? 'PASS' : 'MISSING' }], facts: { revised: false, recovered: false, ...facts },
  });
  const short = aggregateProgrammes([episode('s60', 'A14', 60, true), episode('s120', 'A14', 120, false, { framesOk: true })]);
  assert.equal(short.A14.status, 'INCOMPLETE');
  assert.ok(short.A14.issues.some((i) => i.code === 'PROGRAMME_DURATION_MISSING' && i.target_seconds === 180));
  const shortDone = aggregateProgrammes([episode('s60', 'A14', 60, true), episode('s120', 'A14', 120, false, { framesOk: true }),
    episode('s180', 'A14', 180, false, { framesOk: true })]);
  assert.equal(shortDone.A14.status, 'PASS');
  assert.deepEqual(shortDone.A14.episodes.map((e) => [e.run_id, e.status]), [['s60', 'PRODUCTION_PASS'], ['s120', 'INCOMPLETE'], ['s180', 'INCOMPLETE']]);

  const long = aggregateProgrammes([episode('l1', 'A15', 480, true), episode('l2', 'A15', 480, true), episode('l2', 'A15', 480, true, {}, '/projects/other:demo')]);
  assert.ok(long.A15.issues.some((i) => i.code === 'PROGRAMME_RUN_ID_DUPLICATE' && i.run_id === 'l2'));
  assert.ok(long.A15.issues.some((i) => i.code === 'PROGRAMME_REVISION_MISSING'));
  const longDone = aggregateProgrammes([episode('l1', 'A15', 480, true), episode('l2', 'A15', 470, true, { revised: true, recovered: true }),
    episode('l3', 'A15', 495, true)]);
  assert.equal(longDone.A15.status, 'PASS');
  assert.equal(aggregateProgrammes([]).A15.status, 'INCOMPLETE');

  // One real project relabelled with three run_ids counts once.
  const relabelled = aggregateProgrammes(['l1', 'l2', 'l3'].map((id) => episode(id, 'A15', 480, true, { revised: true, recovered: true }, '/projects/one:demo')));
  assert.equal(relabelled.A15.status, 'INCOMPLETE');
  assert.ok(relabelled.A15.issues.some((i) => i.code === 'PROGRAMME_PRODUCTION_MISSING' && i.passed === 1));
  assert.deepEqual(relabelled.A15.issues.filter((i) => i.code === 'PROGRAMME_EPISODE_DUPLICATE').map((i) => i.run_id), ['l2', 'l3']);
});
