import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { agentInvocation, findProjects, inspectProject, inspectRender, installSkill, keepInResults, parseAgyStream, parseClaudeStream, skillVersion } from './scenarios/run.mjs';

const scratch = (name) => mkdtempSync(join(tmpdir(), `svs-${name}-`));
const put = (dir, path, content) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};

test('findProjects finds nested project.json files and skips .git, .agents and node_modules', () => {
  const dir = scratch('find');
  for (const p of ['a/project.json', 'b/c/project.json', '.agents/skills/x/project.json', '.claude/skills/x/project.json', '.git/project.json', 'node_modules/y/project.json', 'project.json.bak']) put(dir, p, '{}');
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
  assert.deepEqual([r.schema_errors, r.check_errors, r.lint_warnings, r.storyboard_warnings, r.derived_docs], [[], [], [], [], []]);
  assert.deepEqual(r.files, ['project.json', '分镜.md', '提示词包.md', '讲稿.md']);
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

test('claude turns run headless, stream JSON and continue the same conversation', () => {
  const first = agentInvocation({ agent: 'claude', index: 0, turn: '你好' });
  assert.equal(first.cmd, 'claude');
  assert.deepEqual(first.args.slice(0, 2), ['-p', '你好']);
  assert.ok(first.args.includes('stream-json') && !first.args.includes('--continue'));
  assert.ok(agentInvocation({ agent: 'claude', index: 1, turn: '可以' }).args.includes('--continue'));
  assert.deepEqual(agentInvocation({ agent: 'claude', index: 0, turn: 'x', model: 'opus' }).args.slice(-2), ['--model', 'opus']);
});

test('claude turns never skip permissions: edits stay auto-accepted in the workspace and Bash is limited to the skill tools', () => {
  // Scenario sources carry prompt-injection text on purpose; Codex and agy run sandboxed, so Claude must not run unrestricted.
  const { args } = agentInvocation({ agent: 'claude', index: 0, turn: 'x' });
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  assert.deepEqual(args.slice(args.indexOf('--permission-mode'), args.indexOf('--permission-mode') + 2), ['--permission-mode', 'acceptEdits']);
  const allowed = args[args.indexOf('--allowedTools') + 1].split(',');
  for (const tool of ['Read', 'Write', 'Edit', 'Bash(node:*)', 'Bash(ffmpeg:*)', 'Bash(ffprobe:*)']) assert.ok(allowed.includes(tool), tool);
  assert.ok(!allowed.includes('Bash') && !allowed.some((t) => /Bash\((curl|rm|sh|bash)/.test(t)));
});

test('parseClaudeStream returns the final reply, status and tools used', () => {
  const stream = `${[
    { type: 'system', subtype: 'init', session_id: 's1' },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }, { type: 'text', text: '先看看' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write' }] } },
    { type: 'result', subtype: 'success', result: '好的' },
  ].map((e) => JSON.stringify(e)).join('\n')}\n{partial`;
  assert.deepEqual(parseClaudeStream(stream), { status: 'success', response: '好的', tools: ['Bash', 'Write'] });
});

test('installSkill puts the skill where each agent looks and adds resvg only for L1', () => {
  const claude = installSkill(scratch('inst-claude'), 'claude', 'L1');
  assert.match(claude, /\.claude[\\/]skills[\\/]topic-to-video$/);
  assert.ok(existsSync(join(claude, 'SKILL.md')));
  assert.ok(existsSync(join(claude, 'scripts/node_modules/@resvg/resvg-js/package.json')));
  const agy = installSkill(scratch('inst-agy'), 'agy', 'L0');
  assert.match(agy, /\.agents[\\/]skills[\\/]topic-to-video$/);
  assert.ok(existsSync(join(agy, 'SKILL.md')));
  assert.ok(!existsSync(join(agy, 'scripts/node_modules')));
});

test('results keep qa.json and qa.md but leave out rendered media, caches, audio and installed skills', () => {
  const work = join(tmpdir(), 'w');
  for (const p of ['p/project.json', 'p/out', 'p/out/qa.json', 'p/out/qa.md']) assert.ok(keepInResults(work, join(work, p)), p);
  for (const p of ['p/out/final.mp4', 'p/out/9x16', 'p/cache/shots/a.mp4', 'p/audio/s01-0.wav', '.claude/skills', '.agents/x', 'node_modules/y']) {
    assert.ok(!keepInResults(work, join(work, p)), p);
  }
});

test('inspectRender reports null when there is no render', () => {
  assert.deepEqual(inspectRender(scratch('empty')), { final: null, qa: null });
});

test('inspectRender reads the size, frame rate and length of final.mp4 and the qa.json verdict', (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg unavailable');
    return;
  }
  const dir = scratch('render');
  mkdirSync(join(dir, 'out'));
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=1', '-pix_fmt', 'yuv420p', join(dir, 'out/final.mp4')]);
  writeFileSync(join(dir, 'out/qa.json'), JSON.stringify({ ok: true, issues: [{ code: 'X' }], draft: true }));
  const r = inspectRender(dir);
  assert.deepEqual({ ...r.final, duration: Math.round(r.final.duration) }, { exists: true, width: 320, height: 240, fps: 30, duration: 1 });
  assert.deepEqual(r.qa, { ok: true, issues: 1, draft: true });
});
