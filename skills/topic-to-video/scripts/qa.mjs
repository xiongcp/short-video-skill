// Standalone QA CLI: node <skill>/scripts/qa.mjs <projectDir> [videoPath]
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQa } from './lib/qa.mjs';

async function main() {
  const dir = process.argv[2] ?? '.';
  const videoPath = process.argv[3] ?? join(dir, 'out/final.mp4');
  const report = await runQa(dir, { videoPath });
  console.log(JSON.stringify({ ok: report.ok, media: report.media, issues: report.issues, warnings: report.warnings.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
