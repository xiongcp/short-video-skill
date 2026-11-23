// Studio runtime CLI: node --experimental-strip-types runtime/cli.ts <operation> --project <dir> --request <json> [--lang zh-CN|en]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { doctor } from './doctor.ts';
import { preview } from './preview.ts';
import { init, status, submitEvent } from './orchestrator.ts';
import { decide } from './approvals.ts';
import { reconcileJob, submitJob } from './jobs.ts';
import { ledger, setBudget } from './ledger.ts';
import { resume, saveBrief, saveEvidence, saveScript } from './content.ts';
import { searchSources } from '../tools/search_sources/adapter.ts';
import { calibrate, saveAlignment, saveAudio } from './audio.ts';
import { generateTts } from '../tools/generate_tts/adapter.ts';
import { clearOp, preflightOp, registerOp, sceneOp } from './assets.ts';
import { compileOp, saveStoryboard } from './compiler.ts';
import { bakeOp, planOp } from './baker.ts';
import { recoverOp, renderOp } from './render.ts';
import { reviseOp } from './revision.ts';
import { compareOp, qaOp, targetOp } from './qa.ts';
import { manifestOp, traceOp } from './export.ts';
import { inspectOp } from '../tools/inspect_media/adapter.ts';
import { packageOp, restoreOp } from '../tools/package_project/adapter.ts';
import { CATALOGS, DEFAULT_LOCALE, isSupported, localize, translate } from './i18n.ts';

type Outcome = { report: { issues: { code: string }[] } & Record<string, unknown>; exitCode: number };
const operations: Record<string, (project: string, request: any) => Outcome | Promise<Outcome>> = {
  doctor,
  preview,
  init,
  status,
  event: submitEvent,
  decide,
  budget: setBudget,
  submit: submitJob,
  reconcile: reconcileJob,
  ledger,
  brief: saveBrief,
  evidence: saveEvidence,
  script: saveScript,
  resume,
  search: searchSources,
  audio: saveAudio,
  align: saveAlignment,
  calibrate,
  tts: generateTts,
  register: registerOp,
  clear: clearOp,
  scene: sceneOp,
  preflight: preflightOp,
  storyboard: saveStoryboard,
  compile: compileOp,
  plan: planOp,
  bake: bakeOp,
  render: renderOp,
  recover: recoverOp,
  revise: reviseOp,
  inspect: inspectOp,
  qa: qaOp,
  target: targetOp,
  compare: compareOp,
  trace: traceOp,
  manifest: manifestOp,
  package: packageOp,
  restore: restoreOp,
};

async function main(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { project: { type: 'string' }, request: { type: 'string' }, lang: { type: 'string', default: DEFAULT_LOCALE } },
  });
  const locale = values.lang!;
  if (!isSupported(locale)) {
    const supported = Object.keys(CATALOGS).join(', ');
    process.stderr.write(`LOCALE_UNSUPPORTED: ${translate(DEFAULT_LOCALE, 'LOCALE_UNSUPPORTED', { locale, supported })}\n`);
    return 2;
  }
  const operation = operations[positionals[0] ?? ''];
  if (!operation || !values.project || !values.request) {
    process.stderr.write(`usage: cli.ts <${Object.keys(operations).join('|')}> --project <dir> --request <json> [--lang zh-CN|en]\n`);
    return 2;
  }
  const request = JSON.parse(readFileSync(values.request, 'utf8'));
  const { report, exitCode } = await operation(resolve(values.project), request);
  const output = { ...report, locale, issues: localize(locale, report.issues) };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  return exitCode;
}

process.exitCode = await main(process.argv.slice(2));
