// Parallel shot renderer (worker_threads), fast cached-text RGBA compositor, subtle paper dither,
// selective 4x subframe motion blur, FFmpeg H.264 BT.709 / yuv444p master encoding, 2-pass loudnorm,
// and deliverables (.srt, .ass, cover.png, chapters.txt) (出片质量设计 §8, 超越路线图 §5.2-5.3).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { findCjkFont, findTitleFont } from '../doctor.mjs';
import { analyzeAudioFrames, makeWavBuffer, readWavPcm } from './mouth.mjs';
import { buildSoundtrack, makeStereoWavBuffer } from './music.mjs';
import { resolveSound } from './project.mjs';
import { buildShotPlans, evaluateFrame, shotCacheKey } from './scene.mjs';
import { buildTimeline } from './timebase.mjs';
import { synthesizeProject } from './tts.mjs';

export const RESOLUTIONS = {
  preview: { width: 960, height: 540, fps: 30, crf: 22, preset: 'veryfast' },
  '1080p': { width: 1920, height: 1080, fps: 60, crf: 16, preset: 'slow' },
  '1440p': { width: 2560, height: 1440, fps: 60, crf: 16, preset: 'slow' },
  '2160p': { width: 3840, height: 2160, fps: 60, crf: 16, preset: 'slow' },
};

const escapeXml = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// Ordered 2x2 Bayer matrix scaled to [-1, +1] for 1-LSB anti-banding paper dither (超越路线图 §5.2)
const BAYER2 = [-1, 1, 1, -1];

function applySubtleDither(rgba, width, height) {
  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width * 4;
    const by = (y & 1) << 1;
    for (let x = 0; x < width; x += 1) {
      const d = BAYER2[by | (x & 1)];
      const idx = rowOff + (x << 2);
      const r = rgba[idx] + d;
      const g = rgba[idx + 1] + d;
      const b = rgba[idx + 2] + d;
      rgba[idx] = r < 0 ? 0 : r > 255 ? 255 : r;
      rgba[idx + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      rgba[idx + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }
}

function alphaBlit(dst, dstW, dstH, src, srcW, srcH, dx, dy, opacity = 1) {
  const ox = Math.round(dx);
  const oy = Math.round(dy);
  const x0 = Math.max(0, -ox);
  const y0 = Math.max(0, -oy);
  const x1 = Math.min(srcW, dstW - ox);
  const y1 = Math.min(srcH, dstH - oy);
  if (x0 >= x1 || y0 >= y1) return;
  for (let y = y0; y < y1; y += 1) {
    const sRow = y * srcW * 4;
    const dRow = (y + oy) * dstW * 4;
    for (let x = x0; x < x1; x += 1) {
      const si = sRow + (x << 2);
      const sa = (src[si + 3] / 255) * opacity;
      if (sa <= 0.002) continue;
      const di = dRow + ((x + ox) << 2);
      const inv = 1 - sa;
      dst[di] = Math.round(src[si] * sa + dst[di] * inv);
      dst[di + 1] = Math.round(src[si + 1] * sa + dst[di + 1] * inv);
      dst[di + 2] = Math.round(src[si + 2] * sa + dst[di + 2] * inv);
      dst[di + 3] = 255;
    }
  }
}

function makeTextRasterizer(Resvg, scale) {
  const bodyFont = findCjkFont();
  const titleFont = findTitleFont() ?? bodyFont;
  const cache = new Map();
  return (item) => {
    const fs = Math.max(12, Math.round(item.fontSize * scale));
    const key = `${item.text}|${item.highlightWord ?? ''}|${fs}|${item.color}|${item.highlightColor ?? ''}|${item.stroke ?? ''}|${item.weight ?? ''}|${item.align ?? ''}|${item.isTitle ? 1 : 0}`;
    if (cache.has(key)) return cache.get(key);

    const charCount = Math.max(1, [...item.text].length);
    const padX = Math.round(fs * 0.8);
    const padY = Math.round(fs * 0.6);
    const boxW = Math.min(Math.round(1920 * scale), Math.round(charCount * fs * 1.12) + padX * 2);
    const boxH = Math.round(fs * 1.5) + padY * 2;
    const align = item.align ?? 'middle';
    const tx = align === 'start' ? padX : align === 'end' ? boxW - padX : boxW / 2;
    const ty = Math.round(boxH / 2 + fs * 0.35);
    const weightAttr = item.weight === 'bold' ? ' font-weight="700"' : '';
    const strokeAttr = item.stroke
      ? ` stroke="${item.stroke}" stroke-width="${Math.max(2, Math.round(fs * 0.12))}" paint-order="stroke"`
      : '';

    let inner = escapeXml(item.text);
    if (item.highlightWord && item.text.includes(item.highlightWord)) {
      const idx = item.text.indexOf(item.highlightWord);
      const pre = escapeXml(item.text.slice(0, idx));
      const mid = escapeXml(item.highlightWord);
      const post = escapeXml(item.text.slice(idx + item.highlightWord.length));
      inner = `${pre}<tspan fill="${item.highlightColor ?? '#20a5a3'}">${mid}</tspan>${post}`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}" viewBox="0 0 ${boxW} ${boxH}">`
      + `<text x="${tx}" y="${ty}" font-size="${fs}" fill="${item.color}" text-anchor="${align}"${weightAttr}${strokeAttr}>${inner}</text></svg>`;

    const fontFile = item.isTitle ? titleFont : bodyFont;
    const fontOpts = fontFile
      ? { fontFiles: [fontFile], loadSystemFonts: false }
      : { loadSystemFonts: true };
    const rendered = new Resvg(svg, { font: fontOpts }).render();
    const entry = { pixels: rendered.pixels, width: rendered.width, height: rendered.height, anchorX: tx, anchorY: boxH / 2 };
    cache.set(key, entry);
    return entry;
  };
}

function renderSingleRgba(Resvg, rasterText, manifest, shotPlan, t, audioFrame, width, height) {
  const scale = width / 1920;
  const frame = evaluateFrame(manifest, shotPlan, t, audioFrame);
  const base = new Resvg(frame.vectorSvg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false },
  }).render();
  const out = Buffer.from(base.pixels);
  for (const item of frame.textItems) {
    if ((item.opacity ?? 1) <= 0.01) continue;
    const bmp = rasterText(item);
    alphaBlit(out, width, height, bmp.pixels, bmp.width, bmp.height, item.x * scale - bmp.anchorX, item.y * scale - bmp.anchorY, item.opacity ?? 1);
  }
  return { rgba: out, isFastMotion: frame.isFastMotion, hostMeta: frame.hostMeta, objectBoxes: frame.objectBoxes };
}

const MOVING_CUE_DO = new Set(['move', 'open', 'carry', 'push', 'pull', 'hold_up', 'draw', 'sit_on']);

/** Exempts walking onto or stepping off a seat object when executing a `sit_on` cue targeting `idx`. */
function isSitApproachOrExit(shotPlan, hostMeta, idx, t, box, hb) {
  if (hostMeta.view !== 'side') return false;
  const winSec = Math.max(0.8, ((box.w * 0.5 + hb.w * 0.5) / 360) * 3.0 + 0.2);
  const sw = hostMeta.sitWalk;
  if (sw) {
    if (sw.exitIdx === idx && t >= sw.exitT0 && t <= sw.exitT0 + winSec) return true;
    if (sw.enterIdx === idx && t >= sw.enterT1 - winSec && t <= sw.enterT1) return true;
    return false;
  }
  const cues = shotPlan.cues ?? [];
  const cueStart = (c, ci) => hostMeta.interactionStarts?.get(ci) ?? (c.timeMs ?? 0) / 1000;
  for (let ci = 0; ci < cues.length; ci += 1) {
    const c = cues[ci];
    if (c.do !== 'sit_on' || c.target !== idx) continue;
    const sitStart = cueStart(c, ci);
    if (hostMeta.focusIdx === idx && t >= sitStart - winSec && t <= sitStart) return true;
    const nextMoves = cues
      .map((nc, nci) => ({
        nc,
        t0: nc.do === 'move' ? cueStart(nc, nci) : Math.max(sitStart + 0.25, (nc.timeMs ?? 0) / 1000),
      }))
      .filter(({ nc, t0 }) => t0 > sitStart && MOVING_CUE_DO.has(nc.do) && !(nc.do === 'carry' && nc.target === 'none'))
      .sort((a, b) => a.t0 - b.t0);
    if (nextMoves.length > 0 && t >= nextMoves[0].t0 && t <= nextMoves[0].t0 + winSec) return true;
  }
  return false;
}

function loadShotAudioFrames(projectDir, shotPlan, fps) {
  const sr = 48000;
  const totalSamples = Math.max(1, Math.round(shotPlan.durationSec * sr));
  const combined = new Float32Array(totalSamples);
  for (const sent of shotPlan.sentences) {
    if (!sent.file) continue;
    const wavPath = join(projectDir, sent.file);
    if (!existsSync(wavPath)) continue;
    const { samples } = readWavPcm(readFileSync(wavPath));
    const offset = Math.max(0, Math.round((sent.startMs / 1000) * sr));
    const len = Math.min(samples.length, totalSamples - offset);
    if (len > 0) combined.set(samples.subarray(0, len), offset);
  }
  return analyzeAudioFrames(combined, sr, fps);
}

async function renderShotToMp4({ projectDir, manifest, shotPlan, outPath, width, height, fps, crf, preset, motionBlur, pixFmt = 'yuv420p', ffmpeg = 'ffmpeg' }) {
  const { Resvg } = await import('@resvg/resvg-js');
  const rasterText = makeTextRasterizer(Resvg, width / 1920);
  const audioFrames = loadShotAudioFrames(projectDir, shotPlan, fps);

  const gop = fps * 2;
  const args = [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps), '-i', 'pipe:0',
    '-vf', 'scale=out_color_matrix=bt709',
    '-c:v', 'libx264', '-profile:v', pixFmt === 'yuv444p' ? 'high444' : 'high',
    '-preset', preset, '-crf', String(crf), '-pix_fmt', pixFmt,
    '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709',
    '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0', '-force_key_frames', 'expr:eq(n,0)',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-an', outPath,
  ];

  const proc = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const done = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg shot ${shotPlan.id} failed (${code}): ${stderr}`))));
  });

  const frameCount = shotPlan.frameCount;
  const accum = motionBlur ? new Uint16Array(width * height * 4) : null;
  const qaEvents = { rushedMove: false, occludedFrames: 0, objectOverlapFrames: 0 };
  const firstRevealSec = shotPlan.elements.map((_, idx) => {
    const times = shotPlan.cues.filter((c) => c.do === 'reveal' && c.target === idx).map((c) => c.timeMs / 1000);
    return times.length ? Math.min(...times) : -Infinity;
  });

  for (let f = 0; f < frameCount; f += 1) {
    const t = f / fps;
    const af = audioFrames[Math.min(audioFrames.length - 1, f)] ?? { open: 0, width: 0.5, nod: 0 };
    const main = renderSingleRgba(Resvg, rasterText, manifest, shotPlan, t, af, width, height);
    let finalRgba = main.rgba;

    if (main.hostMeta?.rushedMove) qaEvents.rushedMove = true;
    // Check host occlusion against diagram elements or stage objects (火柴人主持人设计 §7.6, 画面与同台互动设计 §5.4)
    if (main.hostMeta?.bodyBbox && main.hostMeta.lift <= 0.01) {
      const hb = main.hostMeta.bodyBbox;
      if (shotPlan.shot.layout === 'stage') {
        if (!main.hostMeta.interacting) {
          const boxes = main.objectBoxes ?? shotPlan.elements.map((el, idx) => (t >= firstRevealSec[idx] ? el.bbox : null));
          const overlapsObj = boxes.some((box, idx) => (
            box
            && !isSitApproachOrExit(shotPlan, main.hostMeta, idx, t, box, hb)
            && hb.x < box.x + box.w && hb.x + hb.w > box.x
            && hb.y < box.y + box.h && hb.y + hb.h > box.y
          ));
          if (overlapsObj) qaEvents.objectOverlapFrames += 1;
        }
      } else {
        const overlapsOther = shotPlan.elements.some((el, idx) => idx !== main.hostMeta.focusIdx
          && hb.x < el.bbox.x + el.bbox.w && hb.x + hb.w > el.bbox.x
          && hb.y < el.bbox.y + el.bbox.h && hb.y + hb.h > el.bbox.y);
        if (overlapsOther) qaEvents.occludedFrames += 1;
      }
    }

    // Selective 4x subframe motion blur on fast motion (超越路线图 §5.3)
    if (motionBlur && main.isFastMotion && accum) {
      accum.fill(0);
      const offsets = [-0.375, -0.125, 0.125, 0.375];
      for (const off of offsets) {
        const subT = Math.max(0, Math.min(shotPlan.durationSec, t + off / fps));
        const sub = renderSingleRgba(Resvg, rasterText, manifest, shotPlan, subT, af, width, height).rgba;
        for (let k = 0; k < sub.length; k += 1) accum[k] += sub[k];
      }
      finalRgba = Buffer.allocUnsafe(main.rgba.length);
      for (let k = 0; k < finalRgba.length; k += 1) finalRgba[k] = accum[k] >> 2;
    }

    applySubtleDither(finalRgba, width, height);
    if (!proc.stdin.write(finalRgba)) {
      await new Promise((r) => proc.stdin.once('drain', r));
    }
  }
  proc.stdin.end();
  await done;
  return qaEvents;
}

// Worker thread entrypoint
if (!isMainThread && workerData?.mode === 'render-shot') {
  try {
    const meta = await renderShotToMp4(workerData);
    parentPort.postMessage({ ok: true, id: workerData.shotPlan.id, meta });
  } catch (err) {
    parentPort.postMessage({ ok: false, id: workerData.shotPlan.id, error: err.message });
  }
}

function formatSrtTime(ms) {
  const t = Math.max(0, Math.round(ms));
  const h = String(Math.floor(t / 3600000)).padStart(2, '0');
  const m = String(Math.floor((t % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((t % 60000) / 1000)).padStart(2, '0');
  const rem = String(t % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${rem}`;
}

function formatAssTime(ms) {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000);
  const m = String(Math.floor((t % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((t % 60000) / 1000)).padStart(2, '0');
  const cs = String(Math.floor((t % 1000) / 10)).padStart(2, '0');
  return `${h}:${m}:${s}.${cs}`;
}

export function buildSubtitlesSrt(project, timeline) {
  const lines = [];
  let idx = 1;
  for (const shot of timeline.shots) {
    for (const s of shot.sentenceRanges) {
      lines.push(`${idx}\n${formatSrtTime(s.startMs)} --> ${formatSrtTime(s.endMs)}\n${s.text}\n`);
      idx += 1;
    }
  }
  return `${lines.join('\n')}`;
}

export function buildSubtitlesAss(project, timeline) {
  const anchors = new Map();
  for (const shot of project.shots) {
    for (const c of shot.cues ?? []) {
      if (c.at) anchors.set(`${shot.section}-${c.sentence}`, c.at);
    }
  }
  const header = [
    '[Script Info]',
    `Title: ${project.title}`,
    'ScriptType: v4.00+',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Hiragino Sans GB,44,&H001F1F1F,&H00A3A520,&H00F6FAFB,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,40,40,48,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  for (const shot of timeline.shots) {
    for (const s of shot.sentenceRanges) {
      const kw = anchors.get(s.key);
      const text = kw && s.text.includes(kw) ? s.text.replace(kw, `{\\c&HA3A520&}${kw}{\\r}`) : s.text;
      header.push(`Dialogue: 0,${formatAssTime(s.startMs)},${formatAssTime(s.endMs)},Default,,0,0,0,,${text}`);
    }
  }
  return `${header.join('\n')}\n`;
}

export function buildChapters(project, timeline) {
  const secStart = new Map();
  for (const shot of timeline.shots) {
    if (!secStart.has(shot.section)) secStart.set(shot.section, shot.startMs);
  }
  return `${project.sections.map((sec) => {
    const ms = secStart.get(sec.id) ?? 0;
    const totalSec = Math.floor(ms / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${mm}:${ss} ${sec.title}`;
  }).join('\n')}\n`;
}

export function assembleAudioWav(projectDir, selectedPlans, fps, outWav) {
  const sr = 48000;
  const totalFrames = selectedPlans.reduce((s, p) => s + p.frameCount, 0);
  const totalSamples = Math.max(1, Math.round((totalFrames * sr) / fps));
  const pcm = new Int16Array(totalSamples);
  let shotOffsetSamples = 0;
  for (const plan of selectedPlans) {
    for (const sent of plan.sentences) {
      if (!sent.file) continue;
      const wavPath = join(projectDir, sent.file);
      if (!existsSync(wavPath)) continue;
      const { samples } = readWavPcm(readFileSync(wavPath));
      const start = shotOffsetSamples + Math.round((sent.startMs / 1000) * sr);
      const len = Math.min(samples.length, totalSamples - start);
      for (let i = 0; i < len; i += 1) {
        pcm[start + i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
      }
    }
    shotOffsetSamples += Math.round((plan.frameCount * sr) / fps);
  }
  writeFileSync(outWav, makeWavBuffer(pcm, sr));
}

const VOICE_POLISH = 'highpass=f=80,acompressor=threshold=-18dB:ratio=2.5:attack=10:release=120';

/** Applies the voice polish chain on its own so the mix can measure and duck against the polished voice. */
export function polishVoiceWav(inWav, outWav, { ffmpeg = 'ffmpeg' } = {}) {
  const run = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', inWav, '-af', VOICE_POLISH, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', outWav], { encoding: 'utf8' });
  if (run.error || run.status !== 0) throw new Error(`ffmpeg voice polish failed: ${run.stderr || run.error?.message}`);
}

/** Two-pass linear loudnorm to -16 LUFS; `polish: false` skips the voice polish prefix for an already mixed track. */
export function twoPassLoudnorm(inWav, outM4a, { ffmpeg = 'ffmpeg', polish = true } = {}) {
  const pre = polish ? `${VOICE_POLISH},` : '';
  const p1 = spawnSync(ffmpeg, [
    '-hide_banner', '-i', inWav,
    '-af', `${pre}loudnorm=I=-16:TP=-1:LRA=11:print_format=json`,
    '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const log = `${p1.stdout ?? ''}\n${p1.stderr ?? ''}`;
  const jsonMatch = log.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  let af = `${pre}loudnorm=I=-16:TP=-1:LRA=11`;
  if (jsonMatch) {
    try {
      const m = JSON.parse(jsonMatch[0]);
      if (Number.isFinite(Number(m.input_i)) && Number(m.input_i) > -60) {
        af = `${pre}loudnorm=I=-16:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
      }
    } catch { /* fallback to single-pass loudnorm */ }
  }
  const p2 = spawnSync(ffmpeg, [
    '-y', '-loglevel', 'error', '-i', inWav,
    '-af', af, '-ac', '2', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', outM4a,
  ], { encoding: 'utf8' });
  if (p2.error || p2.status !== 0) throw new Error(`ffmpeg loudnorm failed: ${p2.stderr || p2.error?.message}`);
}

async function runPool(jobs, concurrency) {
  const results = [];
  let next = 0;
  const runOne = async () => {
    while (next < jobs.length) {
      const idx = next;
      next += 1;
      const job = jobs[idx];
      if (concurrency <= 1) {
        results[idx] = await renderShotToMp4(job);
      } else {
        results[idx] = await new Promise((resolve, reject) => {
          const w = new Worker(new URL('./encode.mjs', import.meta.url), { workerData: { mode: 'render-shot', ...job } });
          w.on('message', (msg) => (msg.ok ? resolve(msg.meta) : reject(new Error(msg.error))));
          w.on('error', reject);
          w.on('exit', (code) => { if (code !== 0) reject(new Error(`worker exited ${code}`)); });
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, jobs.length)) }, runOne));
  return results;
}

/**
 * End-to-end L1 project renderer: TTS -> timing -> parallel cached shot rendering -> concat + 2-pass loudnorm -> deliverables.
 */
export async function renderProject(rawProjectDir, opts = {}) {
  const projectDir = resolve(rawProjectDir);
  const project = JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../../assets/host/manifest.json', import.meta.url), 'utf8'));
  const ffmpeg = opts.ffmpeg ?? process.env.FFMPEG ?? 'ffmpeg';

  const resKey = opts.preview ? 'preview' : (opts.resolution ?? project.settings?.resolution ?? '1080p');
  const spec = RESOLUTIONS[resKey] ?? RESOLUTIONS['1080p'];
  const fps = opts.preview ? 30 : (opts.fps ?? project.settings?.fps ?? spec.fps);
  const { width, height, crf } = spec;
  const preset = opts.preset ?? spec.preset;
  const motionBlur = Boolean(opts.motionBlur);

  const timing = opts.skipTts && existsSync(join(projectDir, 'audio/timing.json'))
    ? JSON.parse(readFileSync(join(projectDir, 'audio/timing.json'), 'utf8'))
    : await synthesizeProject(project, projectDir, { ffmpeg });

  const timeline = buildTimeline(project, timing, fps);
  const allPlans = buildShotPlans(project, timeline, manifest);

  // Optional --sample sh03-sh05 range filter
  let selectedPlans = allPlans;
  if (opts.sample) {
    const [fromId, toId] = String(opts.sample).split('-');
    const a = allPlans.findIndex((p) => p.id === fromId);
    const b = toId ? allPlans.findIndex((p) => p.id === toId) : a;
    if (a < 0 || b < a) throw new Error(`invalid --sample range ${opts.sample}`);
    selectedPlans = allPlans.slice(a, b + 1);
  }

  const cacheDir = join(projectDir, 'cache/shots');
  const outDir = join(projectDir, 'out');
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const shotMp4s = [];
  const jobs = [];
  const qaByShot = {};
  const cacheHits = [];

  for (const plan of selectedPlans) {
    const key = shotCacheKey(plan, { fps, width, height, motionBlur, rigVersion: manifest.rig_version });
    const mp4 = join(cacheDir, `${plan.id}-${key}.mp4`);
    shotMp4s.push(mp4);
    if (existsSync(mp4) && !opts.force) {
      cacheHits.push(plan.id);
    } else {
      jobs.push({ projectDir, manifest, shotPlan: plan, outPath: mp4, width, height, fps, crf, preset, motionBlur, ffmpeg });
    }
  }

  const workerCount = opts.workers ?? Math.max(1, Math.min(cpus().length - 1, 8));
  if (jobs.length) {
    const metaList = await runPool(jobs, workerCount);
    jobs.forEach((j, i) => { qaByShot[j.shotPlan.id] = metaList[i]; });
  }

  // Concat video streams losslessly
  const concatList = join(cacheDir, 'concat.txt');
  writeFileSync(concatList, `${shotMp4s.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')}\n`);
  const rawAudio = join(cacheDir, 'narration.wav');
  const normAudio = join(cacheDir, 'narration.m4a');
  assembleAudioWav(projectDir, selectedPlans, fps, rawAudio);
  const sound = resolveSound(project);
  let audio = null;
  if (!sound.sfx && !sound.music) {
    twoPassLoudnorm(rawAudio, normAudio, { ffmpeg });
  } else {
    const polished = join(cacheDir, 'voice-polished.wav');
    polishVoiceWav(rawAudio, polished, { ffmpeg });
    const voice = readWavPcm(readFileSync(polished)).samples;
    const track = buildSoundtrack({ project, projectDir, allPlans, selectedPlans, fps, voice, manifest, ffmpeg });
    const mixWav = join(cacheDir, 'mix.wav');
    writeFileSync(mixWav, makeStereoWavBuffer(track.left, track.right));
    twoPassLoudnorm(mixWav, normAudio, { ffmpeg, polish: false });
    audio = { ...track.report, voiceRefDb: track.voiceRefDb, voiceMissing: track.voiceMissing, levels: null };
  }

  const outName = opts.preview ? 'preview.mp4' : opts.sample ? 'sample.mp4' : 'final.mp4';
  const videoPath = join(outDir, outName);
  const mux = spawnSync(ffmpeg, [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', concatList,
    '-i', normAudio,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'copy',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart',
    videoPath,
  ], { encoding: 'utf8' });
  if (mux.error || mux.status !== 0) throw new Error(`ffmpeg mux failed: ${mux.stderr || mux.error?.message}`);

  // Optional yuv444p master (超越路线图 §5.2)
  let masterPath = null;
  if (opts.master) {
    masterPath = join(outDir, 'master.mp4');
    const masterJobs = selectedPlans.map((plan) => ({
      projectDir, manifest, shotPlan: plan,
      outPath: join(cacheDir, `${plan.id}-master.mp4`),
      width, height, fps, crf: 14, preset: 'slow', motionBlur, pixFmt: 'yuv444p', ffmpeg,
    }));
    await runPool(masterJobs, workerCount);
    const mList = join(cacheDir, 'concat-master.txt');
    writeFileSync(mList, `${masterJobs.map((j) => `file '${j.outPath.replace(/'/g, "'\\''")}'`).join('\n')}\n`);
    const mmux = spawnSync(ffmpeg, [
      '-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', mList, '-i', normAudio,
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart', masterPath,
    ], { encoding: 'utf8' });
    if (mmux.error || mmux.status !== 0) throw new Error(`ffmpeg master mux failed: ${mmux.stderr || mmux.error?.message}`);
  }

  // Write deliverables: SRT, ASS, chapters.txt, cover.png
  writeFileSync(join(outDir, 'captions.srt'), buildSubtitlesSrt(project, timeline));
  writeFileSync(join(outDir, 'captions.ass'), buildSubtitlesAss(project, timeline));
  writeFileSync(join(outDir, 'chapters.txt'), buildChapters(project, timeline));

  // Cover PNG from shot 0 at t = 0.6s (1920x1080)
  const { Resvg } = await import('@resvg/resvg-js');
  const coverPlan = allPlans[0];
  const coverFrame = evaluateFrame(manifest, coverPlan, Math.min(0.6, coverPlan.durationSec * 0.5));
  const rasterCoverText = makeTextRasterizer(Resvg, 1);
  const coverBase = new Resvg(coverFrame.vectorSvg, { fitTo: { mode: 'width', value: 1920 }, font: { loadSystemFonts: false } }).render();
  const coverRgba = Buffer.from(coverBase.pixels);
  for (const item of coverFrame.textItems) {
    if (item.key?.startsWith('sub-')) continue;
    const bmp = rasterCoverText(item);
    alphaBlit(coverRgba, 1920, 1080, bmp.pixels, bmp.width, bmp.height, item.x - bmp.anchorX, item.y - bmp.anchorY, item.opacity ?? 1);
  }
  const coverRaw = join(cacheDir, 'cover.rgba');
  writeFileSync(coverRaw, coverRgba);
  spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '1920x1080', '-i', coverRaw, '-frames:v', '1', join(outDir, 'cover.png')]);

  return {
    videoPath,
    masterPath,
    fps,
    width,
    height,
    shotsRendered: jobs.length,
    shotsCached: cacheHits.length,
    timeline,
    shotPlans: selectedPlans,
    qaByShot,
    audio,
  };
}
