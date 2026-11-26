// Environment doctor for topic-to-video: checks Node, FFmpeg/FFprobe, @resvg/resvg-js, local TTS and CJK fonts.
// Works across agy, Claude Code and Codex; when L1 tools are missing, reports graceful fallback to L0 text pack.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FONT_CANDIDATES = [
  process.env.SVS_FONT,
  '/System/Library/Fonts/Hiragino Sans GB.ttc',
  '/System/Library/Fonts/STHeiti Medium.ttc',
  '/System/Library/Fonts/STHeiti Light.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  'C:\\Windows\\Fonts\\msyh.ttc',
].filter(Boolean);

const TITLE_FONT_CANDIDATES = [
  process.env.SVS_TITLE_FONT,
  ...FONT_CANDIDATES,
].filter(Boolean);

export function findCjkFont(candidates = FONT_CANDIDATES) {
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

export function findTitleFont() {
  return findCjkFont(TITLE_FONT_CANDIDATES);
}

const EDGE_COMMAND = 'edge-tts --voice {voice} --rate={rate} --pitch={pitch} --text {text} --write-media {out} --write-subtitles {sub}';

/**
 * The voice settings to copy into project.json for the local TTS found. The edge-tts ones carry no voice or speed,
 * so copying them keeps the voice.preset the project chose (声音人设设计 §6).
 */
export function recommendVoice({ edgeTts = false, uvx = false, say = false } = {}) {
  if (edgeTts) return { provider: 'command', command: EDGE_COMMAND };
  if (uvx) return { provider: 'command', command: `uvx --from edge-tts ${EDGE_COMMAND}` };
  if (say) return { provider: 'command', voice: 'Tingting', command: 'say -v Tingting -o {out} {text}' };
  return { provider: 'import' };
}

function checkCmd(bin, args = ['--version']) {
  const res = spawnSync(bin, args, { encoding: 'utf8' });
  if (res.error || res.status !== 0) return { ok: false, path: null };
  const firstLine = `${res.stdout || res.stderr || ''}`.split('\n')[0]?.trim() ?? '';
  return { ok: true, detail: firstLine };
}

export async function runDoctor({ ffmpeg = process.env.FFMPEG || 'ffmpeg', ffprobe = process.env.FFPROBE || 'ffprobe' } = {}) {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const nodeOk = nodeMajor >= 20;
  const ffmpegCheck = checkCmd(ffmpeg, ['-version']);
  const ffprobeCheck = checkCmd(ffprobe, ['-version']);
  let resvgOk = false;
  try {
    await import('@resvg/resvg-js');
    resvgOk = true;
  } catch {
    resvgOk = false;
  }
  const edgeTts = checkCmd('edge-tts', ['--version']);
  const uvxCheck = checkCmd('uvx', ['--version']);
  const macSay = process.platform === 'darwin' ? checkCmd('say', ['-v', '?']) : { ok: false };
  const font = findCjkFont();

  const checks = {
    node: { ok: nodeOk, version: process.versions.node },
    ffmpeg: ffmpegCheck,
    ffprobe: ffprobeCheck,
    resvg: { ok: resvgOk },
    font: { ok: Boolean(font), path: font },
    tts_local: { edge_tts: edgeTts.ok, uvx: uvxCheck.ok, macos_say: macSay.ok },
  };

  const missing = [];
  if (!nodeOk) missing.push('node>=20');
  if (!ffmpegCheck.ok) missing.push('ffmpeg');
  if (!ffprobeCheck.ok) missing.push('ffprobe');
  if (!resvgOk) missing.push('@resvg/resvg-js');

  const l1_ready = missing.length === 0;
  const recommended_voice = recommendVoice({ edgeTts: edgeTts.ok, uvx: uvxCheck.ok, say: macSay.ok });

  return {
    ok: true,
    l0_ready: true,
    l1_ready,
    checks,
    missing,
    recommended_voice,
    fallback: l1_ready ? null : `缺少 ${missing.join('、')}，自动退回 L0 文本包（讲稿、分镜、提示词包）`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await runDoctor();
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--strict') && !report.l1_ready) process.exitCode = 1;
}
