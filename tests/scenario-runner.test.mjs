import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { agentInvocation, findProjects, inspectProject, parseAgyStream, skillVersion } from './scenarios/run.mjs';

const scratch = (name) => mkdtempSync(join(tmpdir(), `svs-${name}-`));
const put = (dir, path, content) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};

test('findProjects finds nested project.json files and skips .git, .agents and node_modules', () => {
  const dir = scratch('find');
  for (const p of ['a/project.json', 'b/c/project.json', '.agents/skills/x/project.json', '.git/project.json', 'node_modules/y/project.json', 'project.json.bak']) put(dir, p, '{}');
  assert.deepEqual(findProjects(dir).map((f) => relative(dir, f)).sort(), ['a/project.json', 'b/c/project.json']);
});

test('inspectProject reports unreadable JSON', () => {
  const dir = scratch('bad-json');
  put(dir, 'project.json', '{ not json');
  assert.match(inspectProject(join(dir, 'project.json')).parse_error, /JSON/);
});

test('inspectProject skips later checks when the schema fails', () => {
  const dir = scratch('bad-schema');
  put(dir, 'project.json', '{}');
  const r = inspectProject(join(dir, 'project.json'));
  assert.ok(r.schema_errors.length > 0);
  assert.equal(r.check_errors, 'skipped: schema errors');
});

test('inspectProject runs every check on the example', () => {
  const dir = scratch('example');
  cpSync(join(import.meta.dirname, '../examples/cache-speed'), dir, { recursive: true });
  const r = inspectProject(join(dir, 'project.json'));
  const nonStatic = r.storyboard_warnings.filter((w) => w.code !== 'STATIC_STRETCH');
  assert.deepEqual([r.schema_errors, r.check_errors, r.lint_warnings, nonStatic, r.derived_docs], [[], [], [], [], []]);
  assert.deepEqual(r.files, ['project.json', '分镜.md', '讲稿.md']);
});

test('agentInvocation builds codex turns with resume after the first', () => {
  const first = agentInvocation({ agent: 'codex', index: 0, turn: 'hi', lastFile: 'o.md', model: 'm' });
  assert.deepEqual(first, { cmd: 'codex', args: ['exec', '--skip-git-repo-check', '-c', 'sandbox_mode="workspace-write"', '-m', 'm', '-o', 'o.md', 'hi'] });
  const next = agentInvocation({ agent: 'codex', index: 1, turn: 'ok', lastFile: 'o.md' });
  assert.deepEqual(next.args.slice(0, 3), ['exec', 'resume', '--last']);
});

test('agentInvocation builds agy turns that resume by conversation id', () => {
  const first = agentInvocation({ agent: 'agy', index: 0, turn: 'hi', model: 'gemini-3.8-flash-high' });
  assert.equal(first.cmd, 'agy');
  assert.deepEqual(first.args, ['-p', 'hi', '--model', 'gemini-3.8-flash-high', '--dangerously-skip-permissions', '--sandbox', '--output-format', 'stream-json']);
  const next = agentInvocation({ agent: 'agy', index: 1, turn: 'ok', conversationId: 'c1' });
  assert.deepEqual(next.args.slice(-2), ['--conversation', 'c1']);
});

test('parseAgyStream returns the conversation id, final reply and tools used', () => {
  const stream = [
    { event: 'init', conversation_id: 'c1' },
    { event: 'step_update', step_update: { state: 'ACTIVE', step_type: 'tool', tool_name: 'read_file' } },
    { event: 'step_update', step_update: { state: 'DONE', step_type: 'tool', tool_name: 'read_file' } },
    { event: 'step_update', step_update: { state: 'DONE', step_type: 'tool', tool_name: 'run_command' } },
    { event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS', response: '好的\n' } },
  ].map((e) => JSON.stringify(e)).join('\n');
  assert.deepEqual(parseAgyStream(stream), { conversationId: 'c1', status: 'SUCCESS', response: '好的\n', tools: ['read_file', 'run_command'] });
});

test('agentInvocation refuses a later agy turn without a conversation id', () => {
  assert.throws(() => agentInvocation({ agent: 'agy', index: 1, turn: 'ok' }), /conversation id/);
});

test('parseAgyStream skips lines that are not valid JSON', () => {
  const stream = ['{partial', JSON.stringify({ event: 'init', conversation_id: 'c1' }), '{"event": "result", "result": {"status": "SUCCESS", "response": "好"}}'].join('\n');
  assert.deepEqual(parseAgyStream(stream), { conversationId: 'c1', status: 'SUCCESS', response: '好', tools: [] });
});

test('skillVersion records the commit and whether the skill folder has uncommitted changes', () => {
  const version = skillVersion();
  assert.match(version.commit, /^[0-9a-f]{40}$/);
  assert.equal(typeof version.dirty, 'boolean');
});
