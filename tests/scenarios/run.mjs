// Runs one agent scenario in a throwaway git repository and keeps everything a reviewer needs.
//   npm run scenario -- --scenario 01 --mode baseline|skill [--agent codex|agy|claude] [--model <id>] [--shared-home]
// Each run spends the agent's quota: ask the owner before running.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { lintStoryboard } from '../../skills/topic-to-video/scripts/lib/match.mjs';
import { checkProject, lintScript } from '../../skills/topic-to-video/scripts/lib/project.mjs';
import { runDoctor } from '../../skills/topic-to-video/scripts/doctor.mjs';
import { checkDerivedDocs } from '../helpers/derived-docs.mjs';
import { validateProject } from '../helpers/schema.mjs';

const HERE = import.meta.dirname;
const ROOT = join(HERE, '../..');
const SKIP = new Set(['.git', '.agents', '.claude', 'node_modules']);
// Rendered media, shot caches and narration stay out of results/; only out/qa.json and out/qa.md are kept.
const HEAVY = new Set(['out', 'cache', 'audio']);
const SKILL_DIRS = { claude: '.claude/skills', agy: '.agents/skills', codex: '.agents/skills' };

/** Every project.json an agent wrote under `dir`, skipping .git, .agents, .claude and node_modules. */
export function findProjects(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findProjects(path);
    return entry.name === 'project.json' ? [path] : [];
  });
}

/** Copies the skill where `agent` looks for it; L1 scenarios also get @resvg/resvg-js from the repository, offline. */
export function installSkill(work, agent, level) {
  const dest = join(work, SKILL_DIRS[agent], 'topic-to-video');
  cpSync(join(ROOT, 'skills/topic-to-video'), dest, { recursive: true, filter: (p) => !p.split(/[\\/]/).includes('node_modules') });
  if (level === 'L1') cpSync(join(ROOT, 'node_modules/@resvg'), join(dest, 'scripts/node_modules/@resvg'), { recursive: true });
  return dest;
}

/** Whether `path` inside the workspace is copied into results/. */
export function keepInResults(work, path) {
  const parts = relative(work, path).split(/[\\/]/);
  if (parts.some((part) => SKIP.has(part))) return false;
  const i = parts.findIndex((part) => HEAVY.has(part));
  return i < 0 || (parts[i] === 'out' && (parts.length === i + 1 || (parts.length === i + 2 && ['qa.json', 'qa.md'].includes(parts[i + 1]))));
}

/** Size, frame rate and length of out/final.mp4 and the qa.json verdict; null for whichever is missing. */
export function inspectRender(dir) {
  const video = join(dir, 'out/final.mp4');
  const qaFile = join(dir, 'out/qa.json');
  let final = null;
  if (existsSync(video)) {
    const probe = JSON.parse(execFileSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', video], { encoding: 'utf8' }));
    const [num, den] = probe.streams[0].r_frame_rate.split('/').map(Number);
    final = { exists: true, width: probe.streams[0].width, height: probe.streams[0].height, fps: num / den, duration: Number(probe.format.duration) };
  }
  const qa = existsSync(qaFile)
    ? (({ ok, issues, draft }) => ({ ok, issues: issues?.length ?? 0, draft: Boolean(draft) }))(JSON.parse(readFileSync(qaFile, 'utf8')))
    : null;
  return { final, qa };
}

/** Schema, cross-reference, lint and derived-document results for one project folder. */
export function inspectProject(file) {
  const dir = dirname(file);
  const read = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null);
  let project;
  try {
    project = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { parse_error: error.message, files: readdirSync(dir).sort() };
  }
  const schema = validateProject(project);
  const script = read('讲稿.md');
  const board = read('分镜.md');
  return {
    files: readdirSync(dir).sort(),
    schema_errors: schema.errors,
    check_errors: schema.ok ? checkProject(project) : 'skipped: schema errors',
    lint_warnings: schema.ok ? lintScript(project) : 'skipped: schema errors',
    storyboard_warnings: schema.ok ? lintStoryboard(project) : 'skipped: schema errors',
    derived_docs: schema.ok && script !== null && board !== null
      ? checkDerivedDocs(project, script, board, read('提示词包.md'))
      : 'skipped: schema errors or missing 讲稿.md/分镜.md',
    revision: project.revision,
    target_seconds: project.settings?.target_seconds,
    checkpoints: project.checkpoints,
    render: inspectRender(dir),
  };
}

const CLAUDE_SKILL_SCRIPTS = ['doctor.mjs', 'check.mjs', 'render.mjs'];
const CLAUDE_DISALLOWED_TOOLS = 'Bash(node -e*),Bash(node --eval*),Bash(node -p*),Bash(node --print*)';

/** Command and arguments for one turn. Codex and Claude Code resume the latest session; agy resumes by conversation id. */
export function agentInvocation({ agent, index, turn, model, lastFile, conversationId, work }) {
  if (agent === 'claude') {
    // No --dangerously-skip-permissions: scenario sources carry prompt-injection text, and unlike Codex and agy, Claude runs unsandboxed here.
    // Edits are auto-accepted inside the workspace only; Bash allows only the three bundled skill scripts (no generic node:* or ffmpeg:*), plus ffprobe/ls/mkdir.
    const scriptRules = CLAUDE_SKILL_SCRIPTS.flatMap((script) => {
      const rel = `${SKILL_DIRS.claude}/topic-to-video/scripts/${script}`;
      const paths = [rel, `./${rel}`, ...(work ? [join(work, rel)] : [])];
      return paths.flatMap((p) => [`Bash(node ${p})`, `Bash(node ${p} *)`]);
    });
    const allowed = ['Read', 'Write', 'Edit', 'Glob', 'Grep', ...scriptRules, 'Bash(ffprobe:*)', 'Bash(ls:*)', 'Bash(mkdir:*)'].join(',');
    const args = ['-p', turn, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
      '--allowedTools', allowed, '--disallowedTools', CLAUDE_DISALLOWED_TOOLS];
    if (index > 0) args.push('--continue');
    if (model) args.push('--model', model);
    return { cmd: 'claude', args };
  }
  if (agent === 'agy') {
    if (index > 0 && !conversationId) throw new Error('agy 第 1 轮的输出里没有 conversation id，无法继续后面的轮次');
    const args = ['-p', turn, ...(model ? ['--model', model] : []), '--dangerously-skip-permissions', '--sandbox', '--output-format', 'stream-json'];
    return { cmd: 'agy', args: index === 0 ? args : [...args, '--conversation', conversationId] };
  }
  const common = ['--skip-git-repo-check', '-c', 'sandbox_mode="workspace-write"', ...(model ? ['-m', model] : []), '-o', lastFile, turn];
  return { cmd: 'codex', args: index === 0 ? ['exec', ...common] : ['exec', 'resume', '--last', ...common] };
}

/** Conversation id, final status and reply, and the tools an agy turn ran, from its stream-json output. */
export function parseAgyStream(text) {
  const events = text.split('\n').flatMap((line) => {
    try {
      return line.trim().startsWith('{') ? [JSON.parse(line)] : [];
    } catch {
      return [];
    }
  });
  const result = events.find((e) => e.event === 'result')?.result ?? {};
  return {
    conversationId: events.find((e) => e.event === 'init')?.conversation_id ?? result.conversation_id,
    status: result.status,
    response: result.response ?? '',
    tools: events
      .map((e) => e.step_update)
      .filter((s) => s?.step_type === 'tool' && s.state === 'DONE')
      .map((s) => s.tool_name),
  };
}

/** Final status and reply, and the tools a Claude Code turn ran, from its stream-json output. */
export function parseClaudeStream(text) {
  const events = text.split('\n').flatMap((line) => {
    try {
      return line.trim().startsWith('{') ? [JSON.parse(line)] : [];
    } catch {
      return [];
    }
  });
  const result = events.findLast((e) => e.type === 'result') ?? {};
  return {
    status: result.subtype,
    response: result.result ?? '',
    tools: events
      .filter((e) => e.type === 'assistant')
      .flatMap((e) => e.message?.content ?? [])
      .filter((c) => c.type === 'tool_use')
      .map((c) => c.name),
  };
}

/** The repository commit and whether skills/topic-to-video differs from it, so each run names the skill it used. */
export function skillVersion() {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  return { commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain', '--', 'skills/topic-to-video') !== '' };
}

function reviewTemplate(spec, report) {
  return [
    `# 场景 ${spec.id}：${spec.title}（${report.mode}）`,
    '',
    `运行：${report.at} · ${report.agent_version} · 模型 ${report.model} · 隔离用户级 skills：${report.isolated_home ? '是' : '否'}`,
    '',
    '## 检查清单',
    '',
    '逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。',
    '',
    ...spec.checks.flatMap((check) => [`- [ ] ${check}`, '  - 证据：']),
    '',
    '## 自动检查摘要',
    '',
    '```json',
    JSON.stringify(report.projects, null, 2),
    '```',
    '',
  ].join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: {
      scenario: { type: 'string' },
      mode: { type: 'string' },
      model: { type: 'string' },
      agent: { type: 'string', default: 'codex' },
      'shared-home': { type: 'boolean', default: false },
    },
  });
  if (!values.scenario || !['baseline', 'skill'].includes(values.mode) || !['codex', 'agy', 'claude'].includes(values.agent)) {
    console.error('usage: npm run scenario -- --scenario 01 --mode baseline|skill [--agent codex|agy|claude] [--model <id>] [--shared-home]');
    process.exit(2);
  }
  const specFile = readdirSync(HERE).find((f) => f.startsWith(`${values.scenario}-`) && f.endsWith('.json'));
  if (!specFile) throw new Error(`没有场景 ${values.scenario}`);
  const spec = JSON.parse(readFileSync(join(HERE, specFile), 'utf8'));

  const work = mkdtempSync(join(tmpdir(), `svs-scenario-${spec.id}-`));
  execFileSync('git', ['init', '-q'], { cwd: work });
  for (const name of spec.fixtures) {
    const src = join(HERE, 'fixtures', name);
    if (!existsSync(src)) throw new Error(`缺少夹具 ${name}`);
    cpSync(src, join(work, name));
  }
  if (values.mode === 'skill') installSkill(work, values.agent, spec.level);
  // Hide user-level skills in ~/.agents/skills from Codex runs; Codex keeps its login through CODEX_HOME.
  // agy keeps its login under ~/.gemini and Claude Code under ~/.claude (--bare would need ANTHROPIC_API_KEY),
  // so agy and Claude Code runs use the real HOME and report isolated_home: false.
  const env = { ...process.env };
  const isolated = values.agent === 'codex' && !values['shared-home'];
  if (isolated) {
    env.CODEX_HOME = process.env.CODEX_HOME ?? join(homedir(), '.codex');
    env.HOME = mkdtempSync(join(tmpdir(), 'svs-home-'));
  }

  const skill = skillVersion();
  const doctor = await runDoctor();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const out = join(HERE, 'results', `${stamp}-${spec.id}-${values.mode}`);
  mkdirSync(out, { recursive: true });
  let conversationId;
  spec.turns.forEach((turn, i) => {
    const last = join(out, `turn-${i + 1}.md`);
    const { cmd, args } = agentInvocation({ agent: values.agent, index: i, turn, model: values.model, lastFile: last, conversationId, work });
    const result = spawnSync(cmd, args, { cwd: work, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(join(out, `turn-${i + 1}.log`), `${result.stdout}\n--- stderr ---\n${result.stderr}`);
    if (result.status !== 0) throw new Error(`${cmd} 在第 ${i + 1} 轮退出码 ${result.status}，日志在 ${out}`);
    if (cmd === 'agy') {
      const parsed = parseAgyStream(result.stdout);
      conversationId ??= parsed.conversationId;
      writeFileSync(last, `${parsed.response}\n\n<!-- status: ${parsed.status}; tools: ${parsed.tools.join(', ') || 'none'} -->\n`);
    } else if (cmd === 'claude') {
      const parsed = parseClaudeStream(result.stdout);
      writeFileSync(last, `${parsed.response}\n\n<!-- status: ${parsed.status}; tools: ${parsed.tools.join(', ') || 'none'} -->\n`);
    }
    cpSync(work, join(out, `workspace-turn-${i + 1}`), { recursive: true, filter: (p) => keepInResults(work, p) });
  });

  const report = {
    scenario: spec.id,
    title: spec.title,
    mode: values.mode,
    agent: values.agent,
    agent_version: `${values.agent} ${execFileSync(values.agent, ['--version'], { encoding: 'utf8' }).trim()}`,
    model: values.model ?? 'default',
    skill: values.mode === 'skill' ? skill : null,
    isolated_home: isolated,
    doctor: { l1_ready: doctor.l1_ready, tts_ready: doctor.tts_ready },
    at: new Date().toISOString(),
    projects: findProjects(work).map((file) => ({ file: relative(work, file), ...inspectProject(file) })),
  };
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(out, 'review.md'), reviewTemplate(spec, report));
  console.log(out);
}

if (process.argv[1] === import.meta.filename) await main();
