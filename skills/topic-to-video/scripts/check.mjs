// Self-check for one project folder: node <skill>/scripts/check.mjs <project folder>
// Prints {errors, warnings, docs} as JSON; exits 1 when errors or docs are not empty. Warnings are advice.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkDerivedDocs } from './lib/docs.mjs';
import { checkProject, lintScript } from './lib/project.mjs';

const dir = process.argv[2] ?? '.';
const read = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null);
const result = { errors: [], warnings: [], docs: [] };
let project;
try {
  project = JSON.parse(read('project.json') ?? 'missing');
} catch (error) {
  result.errors.push({ path: '', code: 'PARSE_ERROR', message: `project.json 缺失或不是合法 JSON：${error.message}` });
}
if (project !== undefined) {
  result.errors = checkProject(project);
  result.warnings = lintScript(project);
  if (!result.errors.some((e) => e.code === 'MISSING_FIELD')) {
    const script = read('讲稿.md');
    const board = read('分镜.md');
    result.docs = [...(script === null ? ['缺少 讲稿.md'] : []), ...(board === null ? ['缺少 分镜.md'] : [])];
    if (script !== null && board !== null) result.docs = checkDerivedDocs(project, script, board);
  }
}
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.errors.length || result.docs.length ? 1 : 0;
