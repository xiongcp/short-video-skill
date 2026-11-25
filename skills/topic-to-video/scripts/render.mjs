// Unified cross-agent render CLI (agy / Claude Code / Codex):
//   node <skill>/scripts/render.mjs <projectDir> [--preview] [--sample sh08-sh09]
//     [--resolution 1080p|1440p|2160p] [--fps 60|30] [--master] [--motion-blur] [--skip-tts] [--no-qa]
// Falls back cleanly to L0 guidance when FFmpeg or @resvg/resvg-js is unavailable.
import { fileURLToPath } from 'node:url';
import { runDoctor } from './doctor.mjs';
import { renderProject } from './lib/encode.mjs';

function parseArgs(argv) {
  const opts = { projectDir: '.' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--preview') opts.preview = true;
    else if (a === '--master') opts.master = true;
    else if (a === '--motion-blur') opts.motionBlur = true;
    else if (a === '--skip-tts') opts.skipTts = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--no-qa') opts.noQa = true;
    else if (a === '--sample') opts.sample = argv[++i];
    else if (a === '--resolution') opts.resolution = argv[++i];
    else if (a === '--fps') opts.fps = Number(argv[++i]);
    else if (a === '--preset') opts.preset = argv[++i];
    else if (a === '--workers') opts.workers = Number(argv[++i]);
    else if (!a.startsWith('--')) opts.projectDir = a;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const doc = await runDoctor();
  if (!doc.l1_ready) {
    console.log(JSON.stringify({ ok: false, fallback: 'L0', missing: doc.missing, message: doc.fallback }, null, 2));
    process.exitCode = 2;
    return;
  }
  const result = await renderProject(opts.projectDir, opts);
  let qa = null;
  if (!opts.noQa) {
    try {
      const { runQa } = await import('./lib/qa.mjs');
      qa = await runQa(opts.projectDir, {
        videoPath: result.videoPath,
        expectedFps: result.fps,
        timeline: result.timeline,
        shotPlans: result.shotPlans,
        qaByShot: result.qaByShot,
      });
    } catch (err) {
      qa = { skipped: true, reason: err.message };
    }
  }
  console.log(JSON.stringify({
    ok: true,
    video: result.videoPath,
    master: result.masterPath,
    resolution: `${result.width}x${result.height}`,
    fps: result.fps,
    shots_rendered: result.shotsRendered,
    shots_cached: result.shotsCached,
    qa: qa ? { ok: qa.ok, issues: qa.issues?.length ?? 0 } : null,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
