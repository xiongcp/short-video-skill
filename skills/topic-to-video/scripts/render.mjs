// Unified cross-agent render CLI (agy / Claude Code / Codex):
//   node <skill>/scripts/render.mjs <projectDir> [--preview] [--sample sh08-sh09]
//     [--resolution 1080p|1440p|2160p] [--fps 60|30] [--master] [--motion-blur] [--skip-tts] [--no-qa]
//   node <skill>/scripts/render.mjs <projectDir> --audition [male,female-warm,...]   voice presets into out/audition/
// Falls back cleanly to L0 guidance when FFmpeg or @resvg/resvg-js is unavailable; --audition needs only FFmpeg and edge-tts or uvx.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDoctor } from './doctor.mjs';
import { renderProject } from './lib/encode.mjs';
import { auditionCommand, auditionVoices, selectPresets } from './lib/tts.mjs';

// The word after --audition is a preset list only when every item looks like a preset ID or prefix, so
// `--audition <projectDir>` still names the project and a typo such as male-deep is reported instead of taken as a folder.
const AUDITION_ITEM = /^(female|male|child)(-[a-z]+)*$/;

export function parseArgs(argv) {
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
    else if (a === '--audition') {
      opts.audition = true;
      if (argv[i + 1]?.split(',').every((s) => AUDITION_ITEM.test(s))) opts.auditionList = argv[++i];
    } else if (!a.startsWith('--')) opts.projectDir = a;
  }
  return opts;
}

/** --audition: reads voice presets aloud into out/audition/. Needs FFmpeg and an edge-tts command, never resvg or macOS say. */
export function runAudition(opts, doc) {
  if (!doc.checks.ffmpeg.ok) return { ok: false, message: '试听需要 FFmpeg' };
  try {
    const project = JSON.parse(readFileSync(join(opts.projectDir, 'project.json'), 'utf8'));
    const command = auditionCommand(project.voice, doc.recommended_voice.command);
    if (!command) return { ok: false, message: '试听需要 edge-tts 或 uvx' };
    return auditionVoices(project, opts.projectDir, { presets: selectPresets(opts.auditionList), command, ffmpeg: process.env.FFMPEG || 'ffmpeg' });
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const doc = await runDoctor();
  if (opts.audition) {
    const result = runAudition(opts, doc);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
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
        audio: result.audio,
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
    sound: result.audio ? { music: result.audio.musicSource, sfx: Object.values(result.audio.sfxCounts).reduce((a, b) => a + b, 0) } : null,
    qa: qa ? { ok: qa.ok, issues: qa.issues?.length ?? 0 } : null,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
