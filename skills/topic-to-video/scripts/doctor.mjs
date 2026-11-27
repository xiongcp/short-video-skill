// Environment doctor for topic-to-video: checks Node, FFmpeg/FFprobe, @resvg/resvg-js, local TTS and CJK fonts.
// Works across agy, Claude Code and Codex; when L1 tools are missing, reports graceful fallback to L0 text pack.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
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

const SCRIPTS_DIR = fileURLToPath(new URL('.', import.meta.url));
const HINTS = {
  ffmpeg: { darwin: 'brew install ffmpeg', linux: 'sudo apt-get install -y ffmpeg', win32: 'winget install --id Gyan.FFmpeg' },
  'cjk-font': { darwin: '系统自带；或设置 SVS_FONT 指向中文字体文件', linux: 'sudo apt-get install -y fonts-noto-cjk', win32: '系统自带微软雅黑；或设置 SVS_FONT' },
  tts: { darwin: 'brew install uv（之后自动用 uvx --from edge-tts），或 pipx install edge-tts；edge-tts 需要联网', linux: 'pipx install edge-tts（或安装 uv）；edge-tts 需要联网', win32: 'winget install --id astral-sh.uv，或 pipx install edge-tts；edge-tts 需要联网' },
};

/** One install command or tip per missing item, for the platform the doctor runs on. */
export function installHints(items, platform) {
  const out = {};
  for (const item of items) {
    if (item === 'ffprobe') out.ffprobe = '随 FFmpeg 一起安装';
    else if (item === '@resvg/resvg-js') out[item] = `npm install --prefix ${SCRIPTS_DIR}`;
    else if (item === 'node>=20') out[item] = '安装 Node 22 LTS 或更新版本：https://nodejs.org';
    else if (HINTS[item]) out[item] = HINTS[item][platform] ?? HINTS[item].linux;
  }
  return out;
}

function checkCmd(bin, args = ['--version']) {
  const res = spawnSync(bin, args, { encoding: 'utf8' });
  if (res.error || res.status !== 0) return { ok: false, path: null };
  const firstLine = `${res.stdout || res.stderr || ''}`.split('\n')[0]?.trim() ?? '';
  return { ok: true, detail: firstLine };
}

export async function runDoctor({
  ffmpeg = process.env.FFMPEG || 'ffmpeg',
  ffprobe = process.env.FFPROBE || 'ffprobe',
  probe = checkCmd,
  fontCandidates = FONT_CANDIDATES,
  platform = process.platform,
  importResvg = () => import('@resvg/resvg-js'),
} = {}) {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const nodeOk = nodeMajor >= 20;
  const ffmpegCheck = probe(ffmpeg, ['-version']);
  const ffprobeCheck = probe(ffprobe, ['-version']);
  let resvgOk = false;
  try {
    await importResvg();
    resvgOk = true;
  } catch {
    resvgOk = false;
  }
  const edgeTts = probe('edge-tts', ['--version']);
  const uvxCheck = probe('uvx', ['--version']);
  const macSay = platform === 'darwin' ? probe('say', ['-v', '?']) : { ok: false };
  const font = findCjkFont(fontCandidates);

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
  if (!font) missing.push('cjk-font');

  const l1_ready = missing.length === 0;
  const tts_ready = edgeTts.ok || uvxCheck.ok || macSay.ok;
  const recommended_voice = recommendVoice({ edgeTts: edgeTts.ok, uvx: uvxCheck.ok, say: macSay.ok });

  return {
    ok: true,
    l0_ready: true,
    l1_ready,
    tts_ready,
    checks,
    missing,
    hints: installHints([...missing, ...(tts_ready ? [] : ['tts'])], platform),
    recommended_voice,
    fallback: l1_ready ? null : `缺少 ${missing.join('、')}，自动退回 L0 文本包（讲稿、分镜、提示词包）`,
  };
}

/** True when `argv1` points to `metaUrl`, resolving symlinks so symlinked skill installs still run. */
export function isCliEntry(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

if (isCliEntry(import.meta.url)) {
  const report = await runDoctor();
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--strict') && !report.l1_ready) process.exitCode = 1;
}
