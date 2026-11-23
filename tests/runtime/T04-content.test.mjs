// T04 / A04: topic brief, versioned evidence with conflicts and unsupported claims, reviewable scripts with stable section IDs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, makeProject, runCli, writeJson } from './helpers.mjs';
import { createSession } from '../../runtime/approvals.ts';

const example = (name) => JSON.parse(readFileSync(join(ROOT, 'examples', 'topic-cache-speed', `${name}.json`), 'utf8'));
let n = 0;
const call = (project, op, request, env) =>
  runCli([op, '--project', project, '--request', writeJson(join(project, 'requests', `${String(n++).padStart(3, '0')}-${op}.json`), request)], env);
const version = (project, id = 'cache-speed') => call(project, 'status', { project_id: id }).json.version;
function ok(result) {
  assert.equal(result.code, 0, result.stdout + result.stderr);
  return result.json;
}
const envelope = (project, key, id = 'cache-speed') => ({ project_id: id, expected_version: version(project, id), idempotency_key: key });

function newProject(mode = 'quality', overrides = { duration_target_seconds: 120 }) {
  const project = makeProject();
  ok(call(project, 'init', { project_id: 'cache-speed', title: '缓存原理', mode }));
  const brief = example('brief');
  ok(call(project, 'brief', { ...envelope(project, 'brief-1'), topic: brief.topic, audience: brief.audience, scope: brief.scope,
    keywords: brief.keywords, language: brief.language, style_profile: brief.style_profile, overrides }));
  return project;
}

// The cache example's evidence plus two versions of a team guide that disagree, and a claim nobody supports.
function evidenceRequest(project, resolutions = {}) {
  const base = example('evidence-set');
  return {
    ...envelope(project, `evidence-${version(project)}`),
    sources: [...base.sources,
      { source_id: 'team-guide-v1', url: 'https://example.invalid/guide/v1', title: '团队缓存指南 v1', published_on: '2023-03-01', retrieved_on: '2026-11-20', summary: '旧版称没有过期时间的响应一律不得复用。' },
      { source_id: 'team-guide-v2', url: 'https://example.invalid/guide/v2', title: '团队缓存指南 v2', published_on: '2025-06-01', retrieved_on: '2026-11-20', summary: '新版改为允许启发式新鲜度。' }],
    claims: [...base.claims.map(({ claim_id, statement, qualifier }) => ({ claim_id, statement, qualifier })),
      { claim_id: 'no-expiry', statement: '没有显式过期时间的响应一律不能复用。', qualifier: '' },
      { claim_id: 'always-half', statement: '缓存总能让任何网页的加载时间减半。', qualifier: '' }],
    links: [...base.claim_source_links,
      { claim_id: 'no-expiry', source_id: 'team-guide-v1', locator: '第 2 章第 3 段', relation: 'supports' },
      { claim_id: 'no-expiry', source_id: 'team-guide-v2', locator: '第 2 章第 4 段', relation: 'contradicts' }],
    resolutions,
  };
}

function toResearch(project) {
  const v = version(project);
  ok(call(project, 'event', { project_id: 'cache-speed', expected_version: v, idempotency_key: `research-${v}`, event: 'research_started', payload: {} }));
}

test('conflicting source versions keep both locators and unsupported claims are marked unsupported', () => {
  const project = newProject();
  toResearch(project);
  const saved = ok(call(project, 'evidence', evidenceRequest(project)));
  const doc = saved.document;
  const status = Object.fromEntries(doc.claims.map((claim) => [claim.claim_id, claim.status]));
  assert.deepEqual(status, { reuse: 'supported', fresh: 'supported', validate: 'supported', 'no-expiry': 'disputed', 'always-half': 'unsupported' });
  assert.deepEqual(doc.conflicts.map((conflict) => [conflict.claim_ids, conflict.resolution]), [[['no-expiry'], '']]);
  assert.match(doc.conflicts[0].description, /team-guide-v1.*第 2 章第 3 段.*team-guide-v2.*第 2 章第 4 段/);
  assert.deepEqual(doc.claim_source_links.filter((link) => link.claim_id === 'no-expiry').map((link) => [link.source_id, link.locator, link.relation]),
    [['team-guide-v1', '第 2 章第 3 段', 'supports'], ['team-guide-v2', '第 2 章第 4 段', 'contradicts']]);
  assert.equal(doc.review_status, 'pending');
  assert.equal(saved.state, 'RESEARCH_REVIEW');
  assert.match(saved.content_hash, /^sha256:[0-9a-f]{64}$/);
});

test('a script cannot cite an unsupported claim or an unresolved dispute', () => {
  const project = newProject('draft');
  toResearch(project);
  ok(call(project, 'evidence', evidenceRequest(project)));
  const v = version(project);
  ok(call(project, 'event', { project_id: 'cache-speed', expected_version: v, idempotency_key: `draft-script-${v}`, event: 'draft_script_requested', payload: {} }));
  const script = example('script');
  const sections = script.sections.map((section) => ({ ...section }));
  sections[2].claim_ids = ['reuse', 'always-half'];
  sections[3].claim_ids = ['validate', 'no-expiry'];
  const rejected = call(project, 'script', { ...envelope(project, 'script-1'), script_id: 'episode', sections });
  assert.equal(rejected.code, 1, rejected.stdout);
  assert.deepEqual(rejected.json.issues.map((item) => [item.code, item.section_id, item.claim_id]),
    [['CLAIM_UNSUPPORTED', 'sec_003', 'always-half'], ['CLAIM_DISPUTED', 'sec_004', 'no-expiry']]);
  assert.equal(rejected.json.state, 'SCRIPT_RUNNING');

  sections[2].claim_ids = ['reuse', 'fresh'];
  sections[3].claim_ids = ['validate'];
  const request = { ...envelope(project, 'script-2'), script_id: 'episode', sections };
  const saved = ok(call(project, 'script', request));
  assert.deepEqual([saved.document.evidence_version, saved.state], [1, 'SCRIPT_REVIEW']);
  const replayed = ok(call(project, 'script', request));
  assert.deepEqual([replayed.status, replayed.content_hash, replayed.version], ['REPLAYED', saved.content_hash, saved.version]);
});

test('the G1 decision binds the saved evidence version', () => {
  const project = newProject();
  toResearch(project);
  const saved = ok(call(project, 'evidence', evidenceRequest(project, { 'no-expiry': '采用 v2，口播限定为“可能被启发式复用”。' })));
  assert.equal(saved.document.conflicts[0].resolution, '采用 v2，口播限定为“可能被启发式复用”。');
  const owner = createSession(project, { reviewer_id: 'owner', kind: 'human' });
  ok(call(project, 'decide', { ...envelope(project, 'g1'), gate: 'G1', target_hash: saved.content_hash, decision: 'approve', notes: '来源核对完毕' },
    { SVS_SESSION_TOKEN: owner }));
  const v = version(project);
  assert.equal(ok(call(project, 'event', { project_id: 'cache-speed', expected_version: v, idempotency_key: `accept-${v}`, event: 'research_accepted', payload: {} })).state, 'SCRIPT_RUNNING');
});

test('section IDs of an imported manuscript survive nonmaterial edits', () => {
  const project = newProject('draft');
  toResearch(project);
  ok(call(project, 'evidence', evidenceRequest(project)));
  const v = version(project);
  ok(call(project, 'event', { project_id: 'cache-speed', expected_version: v, idempotency_key: `draft-script-${v}`, event: 'draft_script_requested', payload: {} }));
  const original = ['你昨天见过的这张图标，今天再打开，还要从头下载吗？', '第一趟，浏览器手边还没有副本，它向服务器要图标。', '第二趟，浏览器直接拿本地保存的图标来用。'].join('\n\n');
  const first = ok(call(project, 'script', { ...envelope(project, 'import-1'), script_id: 'episode', manuscript: original }));
  assert.deepEqual(first.document.sections.map((section) => section.section_id), ['sec_001', 'sec_002', 'sec_003']);
  assert.ok(first.document.sections.every((section) => section.duration_estimate_frames > 0));

  const reject = call(project, 'decide', { ...envelope(project, 'noop'), gate: 'G2', target_hash: first.content_hash, decision: 'reject', notes: '' },
    { SVS_SESSION_TOKEN: createSession(project, { reviewer_id: 'owner', kind: 'human' }) });
  assert.equal(ok(reject).state, 'SCRIPT_RUNNING');
  const revised = ['你昨天见过的这张图标，今天再次打开，还要从头下载吗?', '先说明一件事：图标也是一份普通的文件。', '第一趟，浏览器手边还没有副本。它向服务器要图标。', '第二趟，浏览器直接拿本地保存的图标来用！'].join('\n\n');
  const second = ok(call(project, 'script', { ...envelope(project, 'import-2'), script_id: 'episode', manuscript: revised }));
  assert.deepEqual(second.document.sections.map((section) => section.section_id), ['sec_001', 'sec_004', 'sec_002', 'sec_003']);
  assert.equal(second.document.version, 2);
});

test('start and resume share duration defaults: explicit 120, short 180, standard8 480', () => {
  const brief = example('brief');
  const fields = { topic: brief.topic, audience: brief.audience, scope: brief.scope, keywords: brief.keywords, language: brief.language, style_profile: brief.style_profile };
  const start = (id, overrides) => {
    const project = makeProject();
    ok(call(project, 'init', { project_id: id, title: id, mode: 'quality' }));
    return { project, result: call(project, 'brief', { ...envelope(project, 'brief-1', id), ...fields, ...(overrides && { overrides }) }) };
  };
  const target = (result) => [result.json.document?.duration_profile, result.json.document?.duration_target_seconds];

  const explicit = start('explicit', { duration_target_seconds: 120 });
  assert.deepEqual(target(explicit.result), ['short', 120]);
  assert.deepEqual(target(start('fresh').result), ['short', 180]);
  assert.deepEqual(target(start('long', { duration_profile: 'standard8' }).result), ['standard8', 480]);

  const resumed = ok(call(explicit.project, 'resume', { project_id: 'explicit' }));
  assert.deepEqual(resumed.resolved, { duration_profile: 'short', duration_target_seconds: 120, target_frames: 3600 });
  assert.deepEqual(resumed.content_versions, { brief: 1, evidence: 0, script: 0 });
  assert.deepEqual(ok(call(explicit.project, 'resume', { project_id: 'explicit', overrides: { duration_profile: 'standard8' } })).resolved,
    { duration_profile: 'standard8', duration_target_seconds: 480, target_frames: 14400 });

  const tooLong = start('too-long', { duration_target_seconds: 300 }).result;
  assert.equal(tooLong.code, 1, tooLong.stdout);
  assert.deepEqual(tooLong.json.issues.map((item) => [item.code, item.duration_profile, item.min_seconds, item.max_seconds]), [['DURATION_OUT_OF_PROFILE', 'short', 60, 180]]);
  const unknown = start('unknown', { duration_profile: 'epic' }).result;
  assert.deepEqual(unknown.json.issues.map((item) => item.code), ['DURATION_PROFILE_UNKNOWN']);
});

// Owner-authorized local material: only files listed with a matching hash in materials/authorized.json are searched.
test('offline search returns paragraph locators from authorized material only', () => {
  const project = makeProject();
  ok(call(project, 'init', { project_id: 'cache-speed', title: '缓存原理', mode: 'quality' }));
  const files = {
    'guide-v1.md': '# 团队缓存指南 v1\n\n第一段介绍缓存。\n\n没有过期时间的响应一律不得复用。',
    'guide-v2.md': '# 团队缓存指南 v2\n\n没有过期时间时，允许按启发式新鲜度短暂复用。',
    'private-notes.md': '内部笔记：过期时间相关的未授权草稿。',
    'tampered.md': '被改过的文件也提到了过期时间。',
  };
  mkdirSync(join(project, 'materials'), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(project, 'materials', name), text);
  const sha = (text) => 'sha256:' + createHash('sha256').update(text).digest('hex');
  writeJson(join(project, 'materials', 'authorized.json'), { source_policy_id: 'owner-materials', materials: [
    { source_id: 'team-guide-v1', path: 'guide-v1.md', sha256: sha(files['guide-v1.md']), title: '团队缓存指南 v1', url: 'https://example.invalid/guide/v1', published_on: '2023-03-01' },
    { source_id: 'team-guide-v2', path: 'guide-v2.md', sha256: sha(files['guide-v2.md']), title: '团队缓存指南 v2', url: 'https://example.invalid/guide/v2', published_on: '2025-06-01' },
    { source_id: 'tampered', path: 'tampered.md', sha256: sha('original text'), title: '已变更', url: 'https://example.invalid/tampered', published_on: null },
  ] });
  const input = { query: '过期时间', source_policy_id: 'owner-materials', question_id: 'q-expiry' };
  const found = call(project, 'search', { project_id: 'cache-speed', input });
  assert.equal(found.code, 1, found.stdout);
  assert.deepEqual(found.json.candidates.map((c) => [c.source_id, c.locator]), [['team-guide-v1', '第 3 段'], ['team-guide-v2', '第 2 段']]);
  assert.ok(found.json.candidates.every((c) => c.excerpt.includes('过期时间') && /^sha256:/.test(c.sha256) && c.retrieved_on));
  assert.deepEqual(found.json.issues.map((item) => [item.code, item.source_id]), [['MATERIAL_HASH_MISMATCH', 'tampered']]);
  assert.deepEqual([found.json.tool_result.status, found.json.tool_result.next_action, found.json.tool_result.cost.actual_minor], ['partial', 'review', 0]);

  const otherPolicy = call(project, 'search', { project_id: 'cache-speed', input: { ...input, source_policy_id: 'web' } });
  assert.deepEqual([otherPolicy.json.tool_result.status, otherPolicy.json.issues[0].code, otherPolicy.json.candidates.length], ['failed', 'SOURCE_POLICY_UNAVAILABLE', 0]);
});
