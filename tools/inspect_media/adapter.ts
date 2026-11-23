// Read-only media inspector, per-frame anomaly scanner, EBU R128 loudness/waveform analyzer, and 3x4 contact sheet
// generator (T10, tools/inspect_media/contract.yaml). Reuses the exact technical acceptance rules from evals/media_acceptance.py.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAsset, readAsset } from '../../runtime/assets.ts';
import { currentBudget } from '../../runtime/ledger.ts';
import { type Issue, type Outcome, getProject, newId, openStore, summary } from '../../runtime/project-store.ts';
import { readWav } from '../../runtime/preview.ts';
import { FPS, RATE, SAMPLES_PER_FRAME } from '../../runtime/timebase.ts';
import { buildWav, encodeRgbPng, type Rgb } from '../render_shot/adapter.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const INSPECTOR = { name: 'ffmpeg-inspect-media', version: '1.0.0' };
export const DEFAULT_MEDIA_SPEC = { width: 1920, height: 1080, fps: FPS, sample_rate_hz: RATE };

const sha256 = (bytes: Buffer) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

// Exact BigInt rational arithmetic matching Python's fractions.Fraction in evals/media_acceptance.py.
interface Frac { n: bigint; d: bigint }
function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a, y = b < 0n ? -b : b;
  while (y !== 0n) { const t = x % y; x = y; y = t; }
  return x || 1n;
}
function frac(n: bigint, d: bigint = 1n): Frac {
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
function parseFrac(raw: string): Frac {
  const parts = raw.split('/');
  return parts.length === 2 ? frac(BigInt(parts[0]), BigInt(parts[1])) : frac(BigInt(parts[0]), 1n);
}
const fMul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
const fAdd = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const fSub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const fAbs = (a: Frac) => ({ n: a.n < 0n ? -a.n : a.n, d: a.d });
const fGt = (a: Frac, b: Frac) => a.n * b.d > b.n * a.d;
const fMin = (a: Frac, b: Frac) => (fGt(a, b) ? b : a);
const fMax = (a: Frac, b: Frac) => (fGt(a, b) ? a : b);
const fNum = (a: Frac) => Number(a.n) / Number(a.d);

function loadDurationProfiles(): Record<string, { min_seconds: number; max_seconds: number }> {
  const text = readFileSync(join(ROOT, 'profiles', 'duration.yaml'), 'utf8');
  const out: Record<string, { min_seconds: number; max_seconds: number }> = {};
  let current: string | null = null;
  for (const line of text.split('\n')) {
    const prof = /^  ([a-z0-9_]+):\s*$/.exec(line);
    if (prof && ['short', 'standard8'].includes(prof[1])) { current = prof[1]; out[current] = { min_seconds: 0, max_seconds: 0 }; continue; }
    if (!current) continue;
    const minM = /^\s+min_seconds:\s*(\d+)/.exec(line);
    const maxM = /^\s+max_seconds:\s*(\d+)/.exec(line);
    if (minM) out[current].min_seconds = Number(minM[1]);
    if (maxM) out[current].max_seconds = Number(maxM[1]);
    if (/^\S/.test(line)) current = null;
  }
  return out;
}

const PROFILES = loadDurationProfiles();

export interface DeclaredHold {
  shot_id: string;
  frame_range: { start: number; end: number };
  kind?: 'static' | 'black' | 'silence';
  reason: string;
}

export interface ShotWindow {
  shot_id: string;
  chapter_id?: string;
  frame_range: { start: number; end: number };
}

export interface TechnicalReport {
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  media_hash: string | null;
  observed: Record<string, unknown>;
  issues: string[];
  diagnostic?: string;
}

export function formatTimecode(frame: number, fps = FPS): string {
  const totalSec = Math.floor(frame / fps);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const rem = frame % fps;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(rem).padStart(2, '0')}`;
}

// Technical C01 inspection: exact parity with evals/media_acceptance.py.
export function inspectTechnical(
  filePath: string,
  expectedSpec = DEFAULT_MEDIA_SPEC,
  profile?: string,
  targetSeconds?: number,
): TechnicalReport {
  const observed: Record<string, unknown> = {};
  const issues: string[] = [];
  let mediaHash: string | null = null;
  let beforeStat: ReturnType<typeof statSync>;
  try {
    beforeStat = statSync(filePath);
    mediaHash = sha256(readFileSync(filePath));
  } catch (err: any) {
    return { status: 'FAIL', media_hash: null, observed, issues: ['INPUT_FILE'], diagnostic: String(err?.message ?? err) };
  }

  const fields = 'format=format_name:format_tags=major_brand:'
    + 'stream=index,codec_type,codec_name,width,height,pix_fmt,sample_rate,time_base,start_pts,duration_ts:'
    + 'stream_disposition=default,attached_pic:frame=stream_index,best_effort_timestamp,nb_samples';
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-protocol_whitelist', 'file', '-threads', '1',
    '-show_frames', '-show_entries', fields, '-of', 'json', '-i', resolvePath(filePath),
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (probe.error && (probe.error as any).code === 'ENOENT') {
    return { status: 'BLOCKED', media_hash: mediaHash, observed, issues: ['FFPROBE_UNAVAILABLE'] };
  }
  if (probe.status !== 0 || probe.stderr.trim()) {
    return { status: 'FAIL', media_hash: mediaHash, observed, issues: ['DECODE'], diagnostic: probe.stderr.trim() };
  }
  let afterStat: ReturnType<typeof statSync> | null = null;
  try { afterStat = statSync(filePath); } catch { afterStat = null; }
  if (!afterStat || beforeStat.dev !== afterStat.dev || beforeStat.ino !== afterStat.ino
    || beforeStat.size !== afterStat.size || beforeStat.mtimeMs !== afterStat.mtimeMs) {
    return { status: 'FAIL', media_hash: mediaHash, observed, issues: ['INPUT_CHANGED'] };
  }

  const data = JSON.parse(probe.stdout);
  const container = data.format ?? {};
  const brand = String(container.tags?.major_brand ?? '').trim().toLowerCase();
  observed.major_brand = brand;
  const formats = String(container.format_name ?? '').split(',');
  const brandOk = brand.startsWith('iso') || brand.startsWith('mp4') || ['avc1', 'm4v', 'msnv', 'dash'].includes(brand);
  if (!formats.includes('mp4') || !brandOk) issues.push('CONTAINER');

  const streams: any[] = data.streams ?? [];
  const videos = streams.filter((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audios = streams.filter((s) => s.codec_type === 'audio');
  const frames: any[] = data.frames ?? [];
  const fps = expectedSpec.fps;

  let expectedEnd: Frac | null = null;
  if (videos.length === 1) {
    const video = videos[0];
    const vFrames = frames.filter((f) => f.stream_index === video.index);
    const count = vFrames.length;
    observed.frames = count;
    observed.width = video.width;
    observed.height = video.height;
    observed.pixel_format = video.pix_fmt;
    observed.video_codec = video.codec_name;
    observed.frame_grid_fps = fps;
    if (video.width !== expectedSpec.width || video.height !== expectedSpec.height) issues.push('FRAME_SIZE');
    if (video.codec_name !== 'h264') issues.push('VIDEO_CODEC');
    if (video.pix_fmt !== 'yuv420p') issues.push('PIXEL_FORMAT');
    if (profile && PROFILES[profile]) {
      const b = PROFILES[profile];
      if (count < b.min_seconds * fps || count > b.max_seconds * fps) issues.push('DURATION_PROFILE');
    }
    if (targetSeconds !== undefined && targetSeconds !== null && count !== targetSeconds * fps) issues.push('TARGET_FRAMES');

    const tick = parseFrac(String(video.time_base));
    expectedEnd = frac(BigInt(count), BigInt(fps));
    const tol = fMin(fMul(tick, frac(1n, 2n)), frac(1n, BigInt(4 * fps)));
    for (let i = 0; i < count; i += 1) {
      const pts = vFrames[i].best_effort_timestamp;
      if (pts === undefined || pts === null || fGt(fAbs(fSub(fMul(frac(BigInt(pts)), tick), frac(BigInt(i), BigInt(fps)))), tol)) {
        observed.first_off_grid_frame = i;
        issues.push('FRAME_CADENCE');
        break;
      }
    }
    if (video.duration_ts === undefined || video.duration_ts === null
      || fGt(fAbs(fSub(fMul(frac(BigInt(video.duration_ts)), tick), expectedEnd)), tol)) {
      issues.push('VIDEO_SPAN');
    }
  } else {
    issues.push('VIDEO_TRACK');
  }

  if (audios.length > 0) {
    const audio = audios.reduce((best, s) => (Number(s.disposition?.default ?? 0) > Number(best.disposition?.default ?? 0) ? s : best), audios[0]);
    const aFrames = frames.filter((f) => f.stream_index === audio.index);
    const rate = Number(audio.sample_rate ?? 0);
    observed.sample_rate_hz = rate;
    observed.audio_codec = audio.codec_name;
    if (audio.codec_name !== 'aac') issues.push('AUDIO_CODEC');
    if (rate !== expectedSpec.sample_rate_hz) issues.push('SAMPLE_RATE');
    const tick = parseFrac(String(audio.time_base));
    if (!aFrames.length || !rate || audio.duration_ts === undefined || audio.start_pts === undefined) {
      issues.push('AUDIO_SPAN');
    } else if (expectedEnd) {
      const start = fMul(frac(BigInt(audio.start_pts)), tick);
      const end = fAdd(start, fMul(frac(BigInt(audio.duration_ts)), tick));
      const first = aFrames[0].best_effort_timestamp;
      const last = aFrames[aFrames.length - 1].best_effort_timestamp;
      const size = aFrames[aFrames.length - 1].nb_samples;
      const tol = frac(1n, BigInt(fps));
      observed.audio_start_seconds = fNum(start);
      observed.audio_end_seconds = fNum(end);
      if (first === undefined || first === null || last === undefined || last === null || !size) {
        issues.push('AUDIO_SPAN');
      } else {
        const d1 = fAbs(start);
        const d2 = fAbs(fMul(frac(BigInt(first)), tick));
        const d3 = fAbs(fSub(end, expectedEnd));
        const d4 = fAbs(fSub(fAdd(fMul(frac(BigInt(last)), tick), frac(BigInt(size), BigInt(rate))), expectedEnd));
        if (fGt(fMax(fMax(d1, d2), fMax(d3, d4)), tol)) issues.push('AUDIO_SPAN');
      }
      const gapTol = fMax(tick, frac(1n, BigInt(rate)));
      for (let i = 1; i < aFrames.length; i += 1) {
        const lPts = aFrames[i - 1].best_effort_timestamp, rPts = aFrames[i].best_effort_timestamp, samples = aFrames[i - 1].nb_samples;
        if (lPts === undefined || rPts === undefined || !samples
          || fGt(fAbs(fSub(fMul(frac(BigInt(rPts) - BigInt(lPts)), tick), frac(BigInt(samples), BigInt(rate)))), gapTol)) {
          observed.first_discontinuous_audio_frame = i;
          issues.push('AUDIO_GAP');
          break;
        }
      }
    }
  } else {
    issues.push('AUDIO_TRACK');
  }

  return { status: issues.length ? 'FAIL' : 'PASS', media_hash: mediaHash, observed, issues };
}

// Subtract hold ranges from a half-open range [start, end), returning uncovered fragments.
function subtractRanges(range: { start: number; end: number }, holds: { start: number; end: number }[]): { start: number; end: number }[] {
  let pieces = [range];
  for (const h of holds) {
    const next: { start: number; end: number }[] = [];
    for (const p of pieces) {
      if (h.end <= p.start || h.start >= p.end) { next.push(p); continue; }
      if (h.start > p.start) next.push({ start: p.start, end: h.start });
      if (h.end < p.end) next.push({ start: h.end, end: p.end });
    }
    pieces = next;
  }
  return pieces;
}

export function locateShot(shots: ShotWindow[], frame: number): { shot_id: string; chapter_id: string | null; local_frame: number } {
  const found = shots.find((s) => frame >= s.frame_range.start && frame < s.frame_range.end);
  if (!found) return { shot_id: 'master', chapter_id: null, local_frame: frame };
  return { shot_id: found.shot_id, chapter_id: found.chapter_id ?? null, local_frame: frame - found.frame_range.start };
}

// Per-frame visual anomaly scan at 160x90 RGB24: detects single-frame flashes, unintended black, long freezes,
// preserves declared static reading holds, and produces a motion heatmap.
export function scanVideoFrames(
  filePath: string,
  shots: ShotWindow[],
  declaredHolds: DeclaredHold[] = [],
  freezeThresholdFrames = 60,
) {
  const SW = 160, SH = 90, stride = SW * SH * 3;
  const dec = spawnSync('ffmpeg', [
    '-v', 'error', '-i', filePath,
    '-vf', `scale=${SW}:${SH}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ], { maxBuffer: 256 * 1024 * 1024 });
  if (dec.status !== 0) {
    return {
      ok: false as const, error: dec.stderr.toString('utf8').trim(),
      frame_count: 0, flashes: [], blacks: [], freezes: [], declared_holds: [], motion_heatmap: { per_second: [], mean_mad: 0 },
    };
  }
  const buf = dec.stdout;
  const count = Math.floor(buf.length / stride);
  const meanLuma = new Float64Array(count);
  const maxLuma = new Float64Array(count);
  const madPrev = new Float64Array(count);
  const maxDiffPrev = new Uint8Array(count);
  const isBlack = new Uint8Array(count);

  const frameDiff = (aIdx: number, bIdx: number) => {
    const aOff = aIdx * stride, bOff = bIdx * stride;
    let sum = 0, mx = 0;
    for (let k = 0; k < stride; k += 1) {
      const d = Math.abs(buf[aOff + k] - buf[bOff + k]);
      sum += d;
      if (d > mx) mx = d;
    }
    return { mad: sum / stride, max: mx };
  };

  for (let i = 0; i < count; i += 1) {
    const off = i * stride;
    let lSum = 0, lMax = 0;
    for (let p = 0; p < SW * SH; p += 1) {
      const k = off + p * 3;
      const y = 0.299 * buf[k] + 0.587 * buf[k + 1] + 0.114 * buf[k + 2];
      lSum += y;
      if (y > lMax) lMax = y;
    }
    meanLuma[i] = lSum / (SW * SH);
    maxLuma[i] = lMax;
    isBlack[i] = (meanLuma[i] < 12 && maxLuma[i] < 28) ? 1 : 0;
    if (i > 0) {
      const diff = frameDiff(i, i - 1);
      madPrev[i] = diff.mad;
      maxDiffPrev[i] = diff.max;
    }
  }

  // 1. Unintended black frames (excluding declared black holds).
  const blackHolds = declaredHolds.filter((h) => h.kind === 'black').map((h) => h.frame_range);
  const blacks: { shot_id: string; frame_range: { start: number; end: number }; mean_luma: number }[] = [];
  for (let i = 0; i < count;) {
    if (!isBlack[i]) { i += 1; continue; }
    let j = i;
    while (j < count && isBlack[j]) j += 1;
    for (const seg of subtractRanges({ start: i, end: j }, blackHolds)) {
      let l = 0;
      for (let k = seg.start; k < seg.end; k += 1) l += meanLuma[k];
      blacks.push({ shot_id: locateShot(shots, seg.start).shot_id, frame_range: seg, mean_luma: Number((l / (seg.end - seg.start)).toFixed(2)) });
    }
    i = j;
  }

  // 2. Single-frame white flash or isolated luminance spike.
  const flashMask = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const prevL = i > 0 ? meanLuma[i - 1] : meanLuma[Math.min(count - 1, i + 1)];
    const nextL = i + 1 < count ? meanLuma[i + 1] : meanLuma[Math.max(0, i - 1)];
    const whiteFlash = meanLuma[i] >= 235 && (Math.abs(meanLuma[i] - prevL) >= 60 || Math.abs(meanLuma[i] - nextL) >= 60);
    const spike = i > 0 && i + 1 < count && madPrev[i] > 55 && madPrev[i + 1] > 55 && frameDiff(i - 1, i + 1).mad < 18 && !isBlack[i];
    if (whiteFlash || spike) flashMask[i] = 1;
  }
  const flashes: { shot_id: string; frame_range: { start: number; end: number }; peak_luma: number; kind: string }[] = [];
  for (let i = 0; i < count;) {
    if (!flashMask[i]) { i += 1; continue; }
    let j = i;
    while (j < count && flashMask[j]) j += 1;
    if (j - i <= 2) {
      let peak = 0;
      for (let k = i; k < j; k += 1) if (meanLuma[k] > peak) peak = meanLuma[k];
      flashes.push({
        shot_id: locateShot(shots, i).shot_id,
        frame_range: { start: i, end: j },
        peak_luma: Number(peak.toFixed(2)),
        kind: peak >= 235 ? 'white_flash' : 'luminance_spike',
      });
    }
    i = j;
  }

  // 3. Long freeze detection vs declared static reading holds.
  const staticHolds = declaredHolds.filter((h) => !h.kind || h.kind === 'static');
  const staticHoldRanges = staticHolds.map((h) => h.frame_range);
  const freezes: { shot_id: string; frame_range: { start: number; end: number }; frames: number }[] = [];
  let runStart = 0;
  const emitRun = (s: number, e: number) => {
    if (e - s < freezeThresholdFrames) return;
    for (const seg of subtractRanges({ start: s, end: e }, staticHoldRanges)) {
      if (seg.end - seg.start >= freezeThresholdFrames) {
        freezes.push({ shot_id: locateShot(shots, seg.start).shot_id, frame_range: seg, frames: seg.end - seg.start });
      }
    }
  };
  const isStill = (idx: number) => madPrev[idx] < 0.05 && maxDiffPrev[idx] < 8;
  for (let i = 1; i < count; i += 1) {
    const still = !isBlack[i] && !isBlack[i - 1] && !flashMask[i] && !flashMask[i - 1] && isStill(i);
    if (!still) {
      emitRun(runStart, i);
      runStart = i;
    }
  }
  emitRun(runStart, count);

  const preservedHolds = staticHolds.map((h) => {
    let staticFrames = 0;
    const s = Math.max(0, h.frame_range.start), e = Math.min(count, h.frame_range.end);
    for (let k = s; k < e; k += 1) if (k === s || isStill(k)) staticFrames += 1;
    return { shot_id: h.shot_id, frame_range: h.frame_range, kind: h.kind ?? 'static', reason: h.reason, observed_static_frames: staticFrames };
  });

  // 4. Motion heatmap per second.
  const secs = Math.ceil(count / FPS);
  const per_second = Array.from({ length: secs }, (_, sec) => {
    const s = sec * FPS, e = Math.min(count, (sec + 1) * FPS);
    let sum = 0, mx = 0, mxPx = 0, n = 0;
    for (let k = s; k < e; k += 1) {
      if (k === 0) continue;
      sum += madPrev[k];
      if (madPrev[k] > mx) mx = madPrev[k];
      if (maxDiffPrev[k] > mxPx) mxPx = maxDiffPrev[k];
      n += 1;
    }
    const mean = n ? sum / n : 0;
    const level = (mean < 0.05 && mxPx < 8) ? 'static' : mean < 2 ? 'low' : mean < 12 ? 'medium' : 'high';
    return { second: sec, frame_range: { start: s, end: e }, mean_mad: Number(mean.toFixed(3)), max_mad: Number(mx.toFixed(3)), max_pixel_diff: mxPx, level };
  });
  const overallMad = count > 1 ? madPrev.reduce((a, b) => a + b, 0) / (count - 1) : 0;

  return {
    ok: true as const,
    frame_count: count,
    flashes,
    blacks,
    freezes,
    declared_holds: preservedHolds,
    motion_heatmap: { per_second, mean_mad: Number(overallMad.toFixed(3)) },
  };
}

// Parse FFmpeg ebur128=peak=true summary output.
function runEbur128(filePath: string) {
  const res = spawnSync('ffmpeg', ['-v', 'info', '-i', filePath, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  const text = res.stderr ?? '';
  const summaryIdx = text.lastIndexOf('Summary:');
  if (summaryIdx < 0) return null;
  const tail = text.slice(summaryIdx);
  const iMatch = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+)\s*LUFS/.exec(tail);
  const lraMatch = /Loudness range:\s*\n\s*LRA:\s*(-?[\d.]+)\s*LU/.exec(tail);
  const peakMatch = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+)\s*dBFS/.exec(tail);
  if (!iMatch || !peakMatch) return null;
  return {
    integrated_lufs: Number(iMatch[1]),
    loudness_range_lu: lraMatch ? Number(lraMatch[1]) : 0,
    max_true_peak_dbtp: Number(peakMatch[1]),
  };
}

export function measureIsolatedVoice(masterWavBytes: Buffer, frameRanges: { start: number; end: number }[]) {
  const wav = readWav(masterWavBytes);
  if (!wav || wav.rate !== RATE || wav.bits !== 16) return null;
  const step = wav.channels * 2;
  const chunks = frameRanges.map(({ start, end }) => {
    const targetBytes = (end - start) * SAMPLES_PER_FRAME * step;
    const from = start * SAMPLES_PER_FRAME * step, to = from + targetBytes;
    const slice = wav.data.subarray(Math.min(from, wav.data.length), Math.min(to, wav.data.length));
    return slice.length < targetBytes ? Buffer.concat([slice, Buffer.alloc(targetBytes - slice.length)]) : slice;
  });
  const work = mkdtempSync(join(tmpdir(), 'svs-voice-qa-'));
  try {
    const wavPath = join(work, 'voice.wav');
    writeFileSync(wavPath, buildWav(wav.channels, Buffer.concat(chunks)));
    return runEbur128(wavPath);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Measure final mix loudness, decode per-frame waveform envelope, and locate unintended silence.
export function analyzeAudio(
  filePath: string,
  frameCount: number,
  shots: ShotWindow[],
  declaredHolds: DeclaredHold[] = [],
  silenceThresholdFrames = 30,
) {
  const loudness = runEbur128(filePath);
  const pcm = spawnSync('ffmpeg', ['-v', 'error', '-i', filePath, '-vn', '-f', 's16le', '-ac', '2', '-ar', String(RATE), 'pipe:1'], {
    maxBuffer: 256 * 1024 * 1024,
  });
  if (!loudness || pcm.status !== 0 || pcm.stdout.length === 0) {
    return {
      ok: false as const,
      loudness: null,
      frames: [] as { frame: number; rms: number; peak: number; rms_dbfs: number }[],
      silence_ranges: [] as { shot_id: string; frame_range: { start: number; end: number }; duration_seconds: number }[],
    };
  }
  const buf = pcm.stdout;
  const bytesPerFrame = SAMPLES_PER_FRAME * 2 * 2;
  const totalFrames = Math.max(frameCount, Math.floor(buf.length / bytesPerFrame));
  const frames: { frame: number; rms: number; peak: number; rms_dbfs: number }[] = [];
  const silentFlags = new Uint8Array(totalFrames);

  for (let f = 0; f < totalFrames; f += 1) {
    const startByte = f * bytesPerFrame;
    const endByte = Math.min(buf.length, startByte + bytesPerFrame);
    let sq = 0, peak = 0, n = 0;
    for (let off = startByte; off + 1 < endByte; off += 2) {
      const s = buf.readInt16LE(off) / 32768;
      sq += s * s;
      const a = Math.abs(s);
      if (a > peak) peak = a;
      n += 1;
    }
    const rms = n ? Math.sqrt(sq / n) : 0;
    const rms_dbfs = rms > 1e-6 ? Number((20 * Math.log10(rms)).toFixed(2)) : -120;
    frames.push({ frame: f, rms: Number(rms.toFixed(4)), peak: Number(peak.toFixed(4)), rms_dbfs });
    if (rms_dbfs < -50) silentFlags[f] = 1;
  }

  const silenceHolds = declaredHolds.filter((h) => h.kind === 'silence').map((h) => h.frame_range);
  const silence_ranges: { shot_id: string; frame_range: { start: number; end: number }; duration_seconds: number }[] = [];
  for (let i = 0; i < totalFrames;) {
    if (!silentFlags[i]) { i += 1; continue; }
    let j = i;
    while (j < totalFrames && silentFlags[j]) j += 1;
    for (const seg of subtractRanges({ start: i, end: j }, silenceHolds)) {
      if (seg.end - seg.start >= silenceThresholdFrames) {
        silence_ranges.push({
          shot_id: locateShot(shots, seg.start).shot_id,
          frame_range: seg,
          duration_seconds: Number(((seg.end - seg.start) / FPS).toFixed(3)),
        });
      }
    }
    i = j;
  }

  return { ok: true as const, loudness, frames, silence_ranges };
}

// ---- Minimal deterministic 5x7 pixel bitmap font for contact-sheet & waveform labels (zero external font dependency).
const FONT5X7: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00100', '00100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '#': ['01010', '11111', '01010', '01010', '11111', '01010', '00000'],
  '/': ['00001', '00010', '00100', '00100', '01000', '10000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function drawRect(buf: Buffer, width: number, height: number, x0: number, y0: number, x1: number, y1: number, [r, g, b]: Rgb, alpha = 1) {
  const xs = Math.max(0, Math.floor(x0)), xe = Math.min(width, Math.ceil(x1));
  const ys = Math.max(0, Math.floor(y0)), ye = Math.min(height, Math.ceil(y1));
  for (let y = ys; y < ye; y += 1) {
    for (let x = xs; x < xe; x += 1) {
      const i = (y * width + x) * 3;
      if (alpha >= 1) { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; }
      else { buf[i] += (r - buf[i]) * alpha; buf[i + 1] += (g - buf[i + 1]) * alpha; buf[i + 2] += (b - buf[i + 2]) * alpha; }
    }
  }
}

function drawText(buf: Buffer, width: number, height: number, x: number, y: number, text: string, color: Rgb, scale = 2) {
  let cursor = x;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT5X7[ch] ?? FONT5X7[' '];
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (glyph[row][col] === '1') {
          drawRect(buf, width, height, cursor + col * scale, y + row * scale, cursor + (col + 1) * scale, y + (row + 1) * scale, color, 1);
        }
      }
    }
    cursor += 6 * scale;
  }
}

// Render a 1200x240 RGB PNG waveform with shot boundaries and red highlights on unintended silence ranges.
export function renderWaveformPng(
  frames: { frame: number; rms: number; peak: number }[],
  shots: ShotWindow[],
  silenceRanges: { frame_range: { start: number; end: number } }[],
  loudness: { integrated_lufs: number; max_true_peak_dbtp: number } | null,
): Buffer {
  const W = 1200, H = 240;
  const img = Buffer.alloc(W * H * 3);
  drawRect(img, W, H, 0, 0, W, H, [16, 22, 34], 1);
  drawRect(img, W, H, 0, 0, W, 28, [24, 34, 52], 1);
  const label = loudness
    ? `WAVEFORM I:${loudness.integrated_lufs.toFixed(1)}LUFS TP:${loudness.max_true_peak_dbtp.toFixed(1)}DBTP F:${frames.length}`
    : `WAVEFORM NO AUDIO F:${frames.length}`;
  drawText(img, W, H, 12, 7, label, [235, 242, 255], 2);

  const plotTop = 34, plotBottom = H - 24, midY = Math.floor((plotTop + plotBottom) / 2), halfH = Math.floor((plotBottom - plotTop) / 2) - 4;
  drawRect(img, W, H, 0, midY, W, midY + 1, [50, 66, 92], 1);

  const total = Math.max(1, frames.length);
  for (const s of silenceRanges) {
    const x0 = Math.floor((s.frame_range.start / total) * W);
    const x1 = Math.max(x0 + 2, Math.ceil((s.frame_range.end / total) * W));
    drawRect(img, W, H, x0, plotTop, x1, plotBottom, [190, 45, 55], 0.35);
  }
  for (const sh of shots) {
    const x = Math.floor((sh.frame_range.start / total) * W);
    if (x > 0 && x < W) drawRect(img, W, H, x, plotTop, x + 1, plotBottom, [90, 110, 145], 0.7);
  }
  for (let x = 0; x < W; x += 1) {
    const fStart = Math.floor((x / W) * total);
    const fEnd = Math.max(fStart + 1, Math.floor(((x + 1) / W) * total));
    let peak = 0, rms = 0;
    for (let f = fStart; f < Math.min(frames.length, fEnd); f += 1) {
      if (frames[f].peak > peak) peak = frames[f].peak;
      if (frames[f].rms > rms) rms = frames[f].rms;
    }
    const pH = Math.round(peak * halfH), rH = Math.round(rms * halfH);
    if (pH > 0) drawRect(img, W, H, x, midY - pH, x + 1, midY + pH, [65, 165, 225], 0.85);
    if (rH > 0) drawRect(img, W, H, x, midY - rH, x + 1, midY + rH, [120, 235, 195], 1);
  }
  drawText(img, W, H, 10, H - 18, `00:00.00`, [180, 195, 220], 2);
  drawText(img, W, H, W - 110, H - 18, formatTimecode(Math.max(0, frames.length - 1)), [180, 195, 220], 2);
  return encodeRgbPng(W, H, img);
}

// Build a 3x4 (12-cell, 1920x810) timecoded contact sheet PNG with per-cell timecode, frame index and shot ID.
export function buildContactSheet(
  filePath: string,
  totalFrames: number,
  shots: ShotWindow[],
  issueRanges: { start: number; end: number }[] = [],
  holdRanges: { start: number; end: number }[] = [],
) {
  const cols = 4, rows = 3, cellW = 480, cellH = 270;
  const W = cols * cellW, H = rows * cellH;
  const frameIndices = Array.from({ length: 12 }, (_, i) => (totalFrames <= 1 ? 0 : Math.round((i * (totalFrames - 1)) / 11)));
  const uniqueFrames = [...new Set(frameIndices)].sort((a, b) => a - b);
  const expr = uniqueFrames.map((n) => `eq(n\\,${n})`).join('+');
  const dec = spawnSync('ffmpeg', [
    '-v', 'error', '-i', filePath,
    '-vf', `select='${expr}',scale=${cellW}:${cellH}:flags=area`,
    '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ], { maxBuffer: 64 * 1024 * 1024 });
  if (dec.status !== 0) throw new Error(`contact sheet decode failed: ${dec.stderr.toString('utf8')}`);
  const cellBytes = cellW * cellH * 3;
  const byFrame = new Map<number, Buffer>();
  uniqueFrames.forEach((f, idx) => {
    const start = idx * cellBytes;
    if (start + cellBytes <= dec.stdout.length) byFrame.set(f, dec.stdout.subarray(start, start + cellBytes));
  });

  const canvas = Buffer.alloc(W * H * 3);
  const cells = frameIndices.map((frame, idx) => {
    const row = Math.floor(idx / cols), col = idx % cols;
    const ox = col * cellW, oy = row * cellH;
    const tile = byFrame.get(frame) ?? Buffer.alloc(cellBytes);
    for (let y = 0; y < cellH; y += 1) {
      tile.copy(canvas, ((oy + y) * W + ox) * 3, y * cellW * 3, (y + 1) * cellW * 3);
    }
    const loc = locateShot(shots, frame);
    const has_issue = issueRanges.some((r) => frame >= r.start && frame < r.end);
    const in_hold = holdRanges.some((r) => frame >= r.start && frame < r.end);
    const tc = formatTimecode(frame);
    const borderColor: Rgb = has_issue ? [230, 55, 65] : in_hold ? [235, 185, 60] : [55, 70, 95];
    drawRect(canvas, W, H, ox, oy, ox + cellW, oy + 24, [12, 16, 26], 0.85);
    drawRect(canvas, W, H, ox, oy, ox + cellW, oy + 2, borderColor, 1);
    drawRect(canvas, W, H, ox, oy + cellH - 2, ox + cellW, oy + cellH, borderColor, 1);
    drawRect(canvas, W, H, ox, oy, ox + 2, oy + cellH, borderColor, 1);
    drawRect(canvas, W, H, ox + cellW - 2, oy, ox + cellW, oy + cellH, borderColor, 1);
    const header = `#${String(idx + 1).padStart(2, '0')} ${tc} F${String(frame).padStart(5, '0')} ${loc.shot_id}`;
    drawText(canvas, W, H, ox + 8, oy + 5, header.slice(0, 38), [245, 248, 255], 2);
    return {
      cell: idx + 1, row, col, frame, timecode: tc, seconds: Number((frame / FPS).toFixed(3)),
      shot_id: loc.shot_id, chapter_id: loc.chapter_id, local_frame: loc.local_frame, has_issue, in_hold,
    };
  });
  return { png: encodeRgbPng(W, H, canvas), width: W, height: H, grid: '3x4' as const, cells };
}

export function extractFramePng(filePath: string, frameIndex: number): Buffer | null {
  const res = spawnSync('ffmpeg', [
    '-v', 'error', '-i', filePath,
    '-vf', `select=eq(n\\,${frameIndex})`, '-fps_mode', 'passthrough', '-frames:v', '1',
    '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1',
  ], { maxBuffer: 32 * 1024 * 1024 });
  return res.status === 0 && res.stdout.length > 0 ? res.stdout : null;
}

export interface InspectRequest {
  project_id: string;
  media_ref?: string;
  path?: string;
  expected_spec?: { width: number; height: number; fps: number; sample_rate_hz: number };
  profile?: string;
  target_seconds?: number;
  sample_ranges?: { start: number; end: number }[];
  declared_holds?: DeclaredHold[];
  freeze_threshold_frames?: number;
  silence_threshold_frames?: number;
}

// Standalone read-only CLI adapter conforming to tools/inspect_media/contract.yaml.
export function inspectOp(project: string, request: InspectRequest): Outcome {
  const db = openStore(project);
  const id = request.project_id;
  if (!getProject(db, id)) return summary(db, id, 'REJECTED', [{ code: 'PROJECT_NOT_FOUND', ref: id }]);

  let mediaPath: string | null = null;
  let mediaRef = request.media_ref ?? null;
  if (mediaRef) {
    const asset = getAsset(db, mediaRef);
    if (!asset || !readAsset(project, asset)) {
      return summary(db, id, 'REJECTED', [{ code: 'ASSET_NOT_FOUND', shot_id: 'master', asset_ref: mediaRef }]);
    }
    mediaPath = join(project, asset.path);
  } else if (request.path) {
    mediaPath = resolvePath(project, request.path);
    if (!mediaPath.startsWith(resolvePath(project) + sep)) {
      return summary(db, id, 'REJECTED', [{ code: 'ASSET_PATH_INVALID', ref: request.path }]);
    }
  } else {
    return summary(db, id, 'REJECTED', [{ code: 'QA_MEDIA_REQUIRED', project_id: id }]);
  }

  const expected_spec = request.expected_spec ?? DEFAULT_MEDIA_SPEC;
  const technical = inspectTechnical(mediaPath, expected_spec, request.profile, request.target_seconds);
  const frames = Number(technical.observed.frames ?? 0);
  const sample_ranges = request.sample_ranges ?? (frames > 0 ? [{ start: 0, end: frames }] : []);
  const inspect_media_input = {
    media_ref: mediaRef ?? `asset://${id}/media_input/v1`,
    expected_spec,
    sample_ranges,
  };

  const shots: ShotWindow[] = frames > 0 ? [{ shot_id: 'master', frame_range: { start: 0, end: frames } }] : [];
  const visual = technical.issues.includes('DECODE') || technical.issues.includes('INPUT_FILE')
    ? { ok: false as const, frame_count: 0, flashes: [], blacks: [], freezes: [], declared_holds: [], motion_heatmap: { per_second: [], mean_mad: 0 } }
    : scanVideoFrames(mediaPath, shots, request.declared_holds ?? [], request.freeze_threshold_frames ?? 60);
  const hasAudio = !technical.issues.includes('AUDIO_TRACK') && !technical.issues.includes('DECODE') && !technical.issues.includes('INPUT_FILE');
  const audio = hasAudio
    ? analyzeAudio(mediaPath, frames, shots, request.declared_holds ?? [], request.silence_threshold_frames ?? 30)
    : { ok: false as const, loudness: null, frames: [], silence_ranges: [] };

  const issues: Issue[] = technical.issues.map((code) => ({ code: `MEDIA_${code}`, media_issue: code }));
  const currency = currentBudget(db, id)?.currency ?? 'CNY';
  const toolStatus = technical.status === 'BLOCKED' || technical.issues.includes('DECODE') || technical.issues.includes('INPUT_FILE')
    ? 'failed'
    : (!hasAudio || !audio.ok ? 'partial' : 'succeeded');

  return {
    report: {
      status: technical.status,
      project_id: id,
      media_hash: technical.media_hash,
      inspector: INSPECTOR,
      inspect_media_input,
      technical,
      visual_anomalies: { flashes: visual.flashes, blacks: visual.blacks, freezes: visual.freezes, declared_holds: visual.declared_holds },
      motion_heatmap: visual.motion_heatmap,
      audio_metrics: audio.loudness,
      silence_ranges: audio.silence_ranges,
      tool_result: {
        status: toolStatus,
        job_id: newId('insp'),
        artifact_refs: mediaRef ? [mediaRef] : [],
        warnings: technical.issues,
        cost: { currency, estimated_minor: 0, actual_minor: 0 },
        retryable: false,
        next_action: technical.status === 'PASS' ? 'continue' : 'review',
      },
      issues,
    },
    exitCode: technical.status === 'PASS' ? 0 : 1,
  };
}
