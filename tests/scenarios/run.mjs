// Runs one agent scenario in a throwaway git repository and keeps everything a reviewer needs.
//   npm run scenario -- --scenario 01 --mode baseline|skill [--model <id>] [--shared-home]
// Each run spends Codex quota: ask the owner before running.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { checkProject, lintScript } from '../../skills/topic-to-video/scripts/lib/project.mjs';
import { checkDerivedDocs } from '../helpers/derived-docs.mjs';
import { validateProject } from '../helpers/schema.mjs';

const HERE = import.meta.dirname;
const ROOT = join(HERE, '../..');
const SKIP = new Set(['.git', '.agents', 'node_modules']);

/** Every project.json an agent wrote under `dir`, skipping .git, .agents and node_modules. */
export function findProjects(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findProjects(path);
    return entry.name === 'project.json' ? [path] : [];
  });
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
    derived_docs: schema.ok && script !== null && board !== null
      ? checkDerivedDocs(project, script, board)
      : 'skipped: schema errors or missing 讲稿.md/分镜.md',
    revision: project.revision,
    target_seconds: project.settings?.target_seconds,
    checkpoints: project.checkpoints,
  };
}

function reviewTemplate(spec, report) {
  return [
    `# 场景 ${spec.id}：${spec.title}（${report.mode}）`,
    '',
    `运行：${report.at} · ${report.codex_version} · 模型 ${report.model} · 隔离用户级 skills：${report.isolated_home ? '是' : '否'}`,
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

function main() {
  const { values } = parseArgs({
    options: {
      scenario: { type: 'string' },
      mode: { type: 'string' },
      model: { type: 'string' },
      'shared-home': { type: 'boolean', default: false },
    },
  });
  if (!values.scenario || !['baseline', 'skill'].includes(values.mode)) {
    console.error('usage: npm run scenario -- --scenario 01 --mode baseline|skill [--model <id>] [--shared-home]');
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
  if (values.mode === 'skill') {
    cpSync(join(ROOT, 'skills/topic-to-video'), join(work, '.agents/skills/topic-to-video'), {
      recursive: true,
      filter: (p) => !p.split(/[\\/]/).includes('node_modules'),
    });
  }
  // Hide user-level skills in ~/.agents/skills from the run; Codex keeps its login through CODEX_HOME.
  const env = { ...process.env };
  if (!values['shared-home']) {
    env.CODEX_HOME = process.env.CODEX_HOME ?? join(homedir(), '.codex');
    env.HOME = mkdtempSync(join(tmpdir(), 'svs-home-'));
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const out = join(HERE, 'results', `${stamp}-${spec.id}-${values.mode}`);
  mkdirSync(out, { recursive: true });
  const model = values.model ? ['-m', values.model] : [];
  const sandbox = ['-c', 'sandbox_mode="workspace-write"'];
  spec.turns.forEach((turn, i) => {
    const last = join(out, `turn-${i + 1}.md`);
    const args = i === 0
      ? ['exec', '--skip-git-repo-check', ...sandbox, ...model, '-o', last, turn]
      : ['exec', 'resume', '--last', '--skip-git-repo-check', ...sandbox, ...model, '-o', last, turn];
    const result = spawnSync('codex', args, { cwd: work, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(join(out, `turn-${i + 1}.log`), `${result.stdout}\n--- stderr ---\n${result.stderr}`);
    if (result.status !== 0) throw new Error(`codex 在第 ${i + 1} 轮退出码 ${result.status}，日志在 ${out}`);
    cpSync(work, join(out, `workspace-turn-${i + 1}`), {
      recursive: true,
      filter: (p) => !relative(work, p).split(/[\\/]/).some((part) => SKIP.has(part)),
    });
  });

  const report = {
    scenario: spec.id,
    title: spec.title,
    mode: values.mode,
    codex_version: execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim(),
    model: values.model ?? 'default',
    isolated_home: !values['shared-home'],
    at: new Date().toISOString(),
    projects: findProjects(work).map((file) => ({ file: relative(work, file), ...inspectProject(file) })),
  };
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(out, 'review.md'), reviewTemplate(spec, report));
  console.log(out);
}

if (process.argv[1] === import.meta.filename) main();
