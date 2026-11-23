// Deterministic local shot compositor and FFmpeg assembler (T09, tools/render_shot/contract.yaml).
// Shots render to exact 1920x1080 30fps H.264/yuv420p bit-exact clips; chapters concatenate losslessly with -c:v copy;
// master mixes and encodes the 48 kHz AAC audio track once across the full timeline.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { readWav } from '../../runtime/preview.ts';
import { FPS, RATE, SAMPLES_PER_FRAME } from '../../runtime/timebase.ts';
import { render as renderCharacter } from '../bake_character/adapter.ts';

export const RENDERER = { name: 'software-rgb24-shot', version: '1.0.0' };
export const W = 1920, H = 1080;
export const DEFAULT_OUTPUT_SPEC = {
  media: { width: W, height: H, fps: FPS, sample_rate_hz: RATE },
  video_codec: 'h264', pixel_format: 'yuv420p', audio_codec: 'aac',
};
const VIDEO_ENCODE = [
  '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
  '-threads', '1', '-bf', '0', '-g', String(FPS), '-video_track_timescale', '15360',
  '-fflags', '+bitexact', '-flags:v', '+bitexact', '-an',
];

export type Rgb = [number, number, number];

export function parseColor(value: unknown): Rgb | null {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
  }
  if (Array.isArray(value) && value.length === 3 && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return [value[0], value[1], value[2]];
  }
  return null;
}

// Decode 8-bit RGB/RGBA PNG (filters 0–4) using Node's built-in zlib.
function decodePng(bytes: Buffer): { width: number; height: number; bpp: number; pixels: Buffer } {
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), colorType = bytes[25];
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 4;
  const idat: Buffer[] = [];
  for (let at = 8; at < bytes.length;) {
    const len = bytes.readUInt32BE(at), type = bytes.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') idat.push(bytes.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * bpp, pixels = Buffer.alloc(height * stride);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const v = raw[src + x];
      const a = x >= bpp ? pixels[dst + x - bpp] : 0;
      const b = y > 0 ? pixels[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[dst - stride + x - bpp] : 0;
      pixels[dst + x] = (filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b
        : filter === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 255;
    }
  }
  return { width, height, bpp, pixels };
}

export function encodeRgbPng(width: number, height: number, rgb: Buffer): Buffer {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}

function fillRect(frame: Buffer, x0: number, y0: number, x1: number, y1: number, [r, g, b]: Rgb, alpha = 1) {
  const xs = Math.max(0, Math.floor(x0)), xe = Math.min(W, Math.ceil(x1));
  const ys = Math.max(0, Math.floor(y0)), ye = Math.min(H, Math.ceil(y1));
  for (let y = ys; y < ye; y += 1) {
    for (let x = xs; x < xe; x += 1) {
      const i = (y * W + x) * 3;
      if (alpha >= 1) { frame[i] = r; frame[i + 1] = g; frame[i + 2] = b; }
      else { frame[i] += (r - frame[i]) * alpha; frame[i + 1] += (g - frame[i + 1]) * alpha; frame[i + 2] += (b - frame[i + 2]) * alpha; }
    }
  }
}

function renderBackground(bytes: Buffer, zoom: number): Buffer {
  const { width, height, bpp, pixels } = decodePng(bytes);
  const frame = Buffer.alloc(W * H * 3);
  // Fast path: check if top-left, center and bottom-right match and first row is uniform (typical solid backdrops).
  const r0 = pixels[0], g0 = pixels[1], b0 = pixels[2];
  let uniform = true;
  for (let i = 0; i < pixels.length; i += bpp * 97) {
    if (pixels[i] !== r0 || pixels[i + 1] !== g0 || pixels[i + 2] !== b0) { uniform = false; break; }
  }
  if (uniform) {
    const row = Buffer.alloc(W * 3);
    for (let x = 0; x < W; x += 1) { row[x * 3] = r0; row[x * 3 + 1] = g0; row[x * 3 + 2] = b0; }
    for (let y = 0; y < H; y += 1) row.copy(frame, y * W * 3);
    return frame;
  }
  const cw = width / zoom, ch = height / zoom, ox = (width - cw) / 2, oy = (height - ch) / 2;
  for (let y = 0; y < H; y += 1) {
    const sy = Math.min(height - 1, Math.floor(oy + (y / H) * ch));
    for (let x = 0; x < W; x += 1) {
      const sx = Math.min(width - 1, Math.floor(ox + (x / W) * cw));
      const si = (sy * width + sx) * bpp, di = (y * W + x) * 3;
      frame[di] = pixels[si]; frame[di + 1] = pixels[si + 1]; frame[di + 2] = pixels[si + 2];
    }
  }
  return frame;
}

export interface NormBox { left: number; top: number; right: number; bottom: number }
export interface DiagramElement {
  element_id: string;
  box: NormBox;
  motion?: { keyframes: { local_frame: number; box: NormBox }[] };
}
export const CAPTION_BOX_PX = { x0: 200, y0: 932, x1: 1720, y1: 1008 };
export const CAPTION_BOX_NORM: NormBox = {
  left: CAPTION_BOX_PX.x0 / W, top: CAPTION_BOX_PX.y0 / H,
  right: CAPTION_BOX_PX.x1 / W, bottom: CAPTION_BOX_PX.y1 / H,
};

export function interpolateBox(el: DiagramElement, localFrame: number): NormBox {
  const kfs = el.motion?.keyframes;
  if (!kfs || !kfs.length) return el.box;
  const sorted = [...kfs].sort((a, b) => a.local_frame - b.local_frame);
  if (localFrame <= sorted[0].local_frame) return sorted[0].box;
  if (localFrame >= sorted[sorted.length - 1].local_frame) return sorted[sorted.length - 1].box;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i], b = sorted[i + 1];
    if (localFrame >= a.local_frame && localFrame <= b.local_frame) {
      const span = b.local_frame - a.local_frame || 1;
      const t = (localFrame - a.local_frame) / span;
      return {
        left: a.box.left + (b.box.left - a.box.left) * t,
        top: a.box.top + (b.box.top - a.box.top) * t,
        right: a.box.right + (b.box.right - a.box.right) * t,
        bottom: a.box.bottom + (b.box.bottom - a.box.bottom) * t,
      };
    }
  }
  return el.box;
}

const OP_COLOR: Record<string, Rgb> = {
  show: [70, 140, 225], highlight: [245, 195, 70], dim: [75, 85, 105], pan_to: [85, 220, 200],
};

function drawDiagram(frame: Buffer, diagram: { elements: DiagramElement[] },
  zoom: number, activeOps: Map<string, string>, localFrame = 0) {
  const scale = (v: number) => 0.5 + (v - 0.5) * zoom;
  for (const el of diagram.elements) {
    const op = activeOps.get(el.element_id);
    const color = (op && OP_COLOR[op]) || [60, 115, 190];
    const box = interpolateBox(el, localFrame);
    const x0 = scale(box.left) * W, y0 = scale(box.top) * H, x1 = scale(box.right) * W, y1 = scale(box.bottom) * H;
    fillRect(frame, x0, y0, x1, y1, color, op === 'dim' ? 0.55 : 0.9);
    if (op === 'highlight' || op === 'pan_to') {
      fillRect(frame, x0, y0, x1, y0 + 8, [255, 250, 220], 1);
      fillRect(frame, x0, y1 - 8, x1, y1, [255, 250, 220], 1);
    }
  }
}

function drawSubtitle(frame: Buffer, text: string, color: Rgb) {
  fillRect(frame, CAPTION_BOX_PX.x0, CAPTION_BOX_PX.y0, CAPTION_BOX_PX.x1, CAPTION_BOX_PX.y1, [12, 18, 30], 0.82);
  // Deterministic caption glyph blocks colored by subtitle_style so style and text changes produce distinct pixels.
  const digest = createHash('sha256').update(text).digest();
  const count = Math.min(28, Math.max(6, text.length));
  const totalW = count * 42, startX = Math.floor((W - totalW) / 2);
  for (let i = 0; i < count; i += 1) {
    const h = 16 + (digest[i % digest.length] % 22);
    fillRect(frame, startX + i * 42 + 4, 970 - h / 2, startX + i * 42 + 34, 970 + h / 2, color, 1);
  }
}

const quotePath = (p: string) => `'${p.replace(/'/g, "'\\''")}'`;

function runFfmpeg(args: string[], input?: Buffer) {
  const res = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], {
    input, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(`ffmpeg failed (${res.status}): ${res.stderr}`);
}

export interface RenderShotMediaSpec {
  outPath: string;
  localFrames: number;
  zoom: number;
  backgroundBytes: Buffer;
  illustrationBytes?: Buffer;
  diagramSpec?: { elements: DiagramElement[] };
  visualCues: { element_id: string; operation: string; at_local_frame: number }[];
  character?: { rig: any; trajectory: any };
  subtitles: { start: number; end: number; text: string }[];
  subtitleColor: Rgb;
}

function encodeStaticSegment(basePng: string, len: number, segOut: string, work: string, tag: number) {
  if (len <= FPS * 2) {
    runFfmpeg(['-loop', '1', '-framerate', String(FPS), '-i', basePng, '-frames:v', String(len), ...VIDEO_ENCODE, '-f', 'mp4', segOut]);
    return;
  }
  // Repeat one 30-frame IDR GOP losslessly with -c:v copy (identical 30fps cadence and bit-exact H.264 stream).
  const gop = join(work, `gop-${tag}.mp4`);
  runFfmpeg(['-loop', '1', '-framerate', String(FPS), '-i', basePng, '-frames:v', String(FPS), ...VIDEO_ENCODE, '-f', 'mp4', gop]);
  const parts = Array.from({ length: Math.floor(len / FPS) }, () => gop);
  const rem = len % FPS;
  if (rem > 0) {
    const tail = join(work, `tail-${tag}.mp4`);
    runFfmpeg(['-loop', '1', '-framerate', String(FPS), '-i', basePng, '-frames:v', String(rem), ...VIDEO_ENCODE, '-f', 'mp4', tail]);
    parts.push(tail);
  }
  assembleVideo(parts, segOut);
}

// Render one shot to an exact `localFrames`-frame 1080p30 H.264/yuv420p MP4 at `outPath`.
export function renderShotMedia(spec: RenderShotMediaSpec) {
  const work = mkdtempSync(join(tmpdir(), 'svs-shot-'));
  try {
    const cuts = new Set<number>([0, spec.localFrames]);
    for (const c of spec.visualCues) if (c.at_local_frame > 0 && c.at_local_frame < spec.localFrames) cuts.add(c.at_local_frame);
    for (const s of spec.subtitles) {
      if (s.start > 0 && s.start < spec.localFrames) cuts.add(s.start);
      if (s.end > 0 && s.end < spec.localFrames) cuts.add(s.end);
    }
    const points = [...cuts].sort((a, b) => a - b);
    const bg = renderBackground(spec.backgroundBytes, spec.zoom);
    const illus = spec.illustrationBytes ? renderBackground(spec.illustrationBytes, spec.zoom) : null;
    const segments: string[] = [];

    const hasMotion = Boolean(spec.diagramSpec?.elements.some((el) => el.motion?.keyframes?.length));
    for (let k = 0; k < points.length - 1; k += 1) {
      const start = points[k], end = points[k + 1], len = end - start;
      const segOut = points.length === 2 ? spec.outPath : join(work, `seg-${k}.mp4`);
      const activeSub = spec.subtitles.find((s) => s.start <= start && start < s.end);
      const ops = new Map<string, string>();
      for (const cue of spec.visualCues) if (cue.at_local_frame <= start) ops.set(cue.element_id, cue.operation);

      if (hasMotion && !spec.character) {
        const frameBufs: Buffer[] = [];
        for (let i = 0; i < len; i += 1) {
          const frame = Buffer.from(illus ?? bg);
          if (spec.diagramSpec) drawDiagram(frame, spec.diagramSpec, spec.zoom, ops, start + i);
          if (activeSub) drawSubtitle(frame, activeSub.text, spec.subtitleColor);
          frameBufs.push(frame);
        }
        runFfmpeg([
          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
          '-frames:v', String(len), ...VIDEO_ENCODE, '-f', 'mp4', segOut,
        ], Buffer.concat(frameBufs));
        segments.push(segOut);
        continue;
      }

      const frame = Buffer.from(illus ?? bg);
      if (spec.diagramSpec) drawDiagram(frame, spec.diagramSpec, spec.zoom, ops, start);
      if (activeSub) drawSubtitle(frame, activeSub.text, spec.subtitleColor);
      const basePng = join(work, `base-${k}.png`);
      writeFileSync(basePng, encodeRgbPng(W, H, frame));

      if (!spec.character) {
        encodeStaticSegment(basePng, len, segOut, work, k);
      } else {
        const { rig, trajectory } = spec.character;
        const cw = rig.canvas.width, ch = rig.canvas.height;
        const rgbaFrames = Buffer.concat(Array.from({ length: len }, (_, i) => renderCharacter(rig, trajectory.frames[start + i])));
        runFfmpeg([
          '-loop', '1', '-framerate', String(FPS), '-i', basePng,
          '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${cw}x${ch}`, '-r', String(FPS), '-i', 'pipe:0',
          '-filter_complex', '[0:v][1:v]overlay=x=240:y=540:format=auto,format=yuv420p',
          '-frames:v', String(len), ...VIDEO_ENCODE, '-f', 'mp4', segOut,
        ], rgbaFrames);
      }
      segments.push(segOut);
    }
    if (segments.length > 1) assembleVideo(segments, spec.outPath);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Losslessly concatenate verified shot MP4 clips with identical H.264/30fps parameters.
export function assembleVideo(segmentPaths: string[], outPath: string) {
  const work = mkdtempSync(join(tmpdir(), 'svs-cat-'));
  try {
    const list = join(work, 'list.txt');
    writeFileSync(list, segmentPaths.map((p) => `file ${quotePath(p)}`).join('\n') + '\n');
    runFfmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'copy', '-fflags', '+bitexact', '-an', '-f', 'mp4', outPath]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function buildWav(channels: number, data: Buffer) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Assemble full master or representative sample: stream-copy video and encode 48 kHz AAC audio once.
export function assembleMaster(segmentPaths: string[], masterWavBytes: Buffer, frameRanges: { start: number; end: number }[], outPath: string) {
  const work = mkdtempSync(join(tmpdir(), 'svs-mux-'));
  try {
    const wav = readWav(masterWavBytes);
    if (!wav || wav.rate !== RATE || wav.bits !== 16) throw new Error('master audio must be 48 kHz 16-bit PCM WAV');
    const step = wav.channels * 2;
    const chunks = frameRanges.map(({ start, end }) => {
      const targetBytes = (end - start) * SAMPLES_PER_FRAME * step;
      const from = start * SAMPLES_PER_FRAME * step, to = from + targetBytes;
      const slice = wav.data.subarray(Math.min(from, wav.data.length), Math.min(to, wav.data.length));
      return slice.length < targetBytes ? Buffer.concat([slice, Buffer.alloc(targetBytes - slice.length)]) : slice;
    });
    const audioPath = join(work, 'mix.wav');
    writeFileSync(audioPath, buildWav(wav.channels, Buffer.concat(chunks)));
    const list = join(work, 'list.txt');
    writeFileSync(list, segmentPaths.map((p) => `file ${quotePath(p)}`).join('\n') + '\n');
    runFfmpeg([
      '-f', 'concat', '-safe', '0', '-i', list, '-i', audioPath,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k', '-ar', String(RATE), '-ac', '2',
      '-movflags', '+faststart', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-f', 'mp4', outPath,
    ]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function probeVideo(filePath: string, fullDecode = false) {
  const countFlag = fullDecode ? '-count_frames' : '-count_packets';
  const countField = fullDecode ? 'nb_read_frames' : 'nb_read_packets';
  const res = spawnSync('ffprobe', [
    '-v', 'error', countFlag,
    '-show_entries', `format=format_name,duration:stream=codec_type,codec_name,width,height,pix_fmt,sample_rate,${countField}`,
    '-of', 'json', filePath,
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (res.status !== 0) return { ok: false as const, error: res.stderr.trim() };
  const data = JSON.parse(res.stdout);
  const v = data.streams?.find((s: any) => s.codec_type === 'video');
  const a = data.streams?.find((s: any) => s.codec_type === 'audio');
  return {
    ok: true as const,
    format_name: String(data.format?.format_name ?? ''),
    video: v ? { codec_name: v.codec_name, pix_fmt: v.pix_fmt, width: Number(v.width), height: Number(v.height), frames: Number(v[countField]) } : null,
    audio: a ? { codec_name: a.codec_name, sample_rate: Number(a.sample_rate) } : null,
  };
}
