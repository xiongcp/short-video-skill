// Thinnest audible slice: local 48 kHz WAV + placeholder host layer + procedural diagram layer -> H.264/AAC master.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { toolVersion } from './doctor.ts';

const W = 1920, H = 1080, FPS = 30, RATE = 48000, SAMPLES_PER_FRAME = RATE / FPS;
const PROBE_FRAMES = (frames: number) => [0, Math.floor(frames / 2), frames - 1];
export const CHARACTER_FIXTURE = {
  id: 'procedural-placeholder-host', version: '0.1.0', original: false,
  note: 'Code-drawn stand-in for the original anime host; no original rig exists yet (T06).',
};

type Rgb = [number, number, number];

export function readWav(bytes: Buffer) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') return null;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4), body = at + 8;
    if (id === 'fmt ') fmt = { format: bytes.readUInt16LE(body), channels: bytes.readUInt16LE(body + 2),
      rate: bytes.readUInt32LE(body + 4), bits: bytes.readUInt16LE(body + 14) };
    if (id === 'data' && fmt) return { ...fmt, data: bytes.subarray(body, body + size) };
    at = body + size + (size % 2);
  }
  return null;
}

// Loudness of each frame's 1,600-sample window drives the mouth.
function frameLoudness(wav: NonNullable<ReturnType<typeof readWav>>, frames: number) {
  const step = wav.channels * 2, loud = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let sum = 0, n = 0;
    for (let i = f * SAMPLES_PER_FRAME * step; i < Math.min((f + 1) * SAMPLES_PER_FRAME * step, wav.data.length); i += 2, n += 1) {
      const v = wav.data.readInt16LE(i) / 32768; sum += v * v;
    }
    loud[f] = n ? Math.sqrt(sum / n) : 0;
  }
  return loud;
}

// Source-over compositing of one shape onto the opaque RGB frame.
function paint(frame: Buffer, x0: number, y0: number, x1: number, y1: number,
  inside: (x: number, y: number) => boolean, [r, g, b]: Rgb, alpha = 1) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y += 1) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x += 1) {
      if (!inside(x, y)) continue;
      const i = (y * W + x) * 3;
      frame[i] += (r - frame[i]) * alpha; frame[i + 1] += (g - frame[i + 1]) * alpha; frame[i + 2] += (b - frame[i + 2]) * alpha;
    }
  }
}
const rect = (f: Buffer, x: number, y: number, w: number, h: number, c: Rgb, a = 1) => paint(f, x, y, x + w, y + h, () => true, c, a);
const ellipse = (f: Buffer, cx: number, cy: number, rx: number, ry: number, c: Rgb, a = 1) =>
  paint(f, cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, c, a);

const BOXES = [760, 1160, 1560];
function packetX(f: number) {
  const phase = (f / 180) % 2, p = phase < 1 ? phase : 2 - phase;
  return BOXES[0] + (BOXES[2] - BOXES[0]) * p;
}

function diagramLayer(frame: Buffer, f: number) {
  rect(frame, BOXES[0], 537, BOXES[2] - BOXES[0], 6, [120, 150, 200], 0.8);
  const px = packetX(f);
  BOXES.forEach((x, i) => {
    const near = Math.max(0, 1 - Math.abs(px - x) / 200);
    rect(frame, x - 110, 470, 220, 140, [[70, 140, 230], [240, 170, 60], [90, 200, 140]][i] as Rgb, 0.55 + 0.4 * near);
  });
  rect(frame, px - 22, 518, 44, 44, [250, 250, 255]);
}

function characterLayer(frame: Buffer, f: number, open: number) {
  const bob = 6 * Math.sin((2 * Math.PI * f) / 60), hx = 360, hy = 470 + bob;
  rect(frame, 240, 600 + bob, 240, 320, [60, 70, 120]);
  const dx = packetX(f) - 480, dy = 540 - 680, len = Math.hypot(dx, dy);
  for (let s = 0; s <= 1; s += 0.05) ellipse(frame, 480 + (dx / len) * 170 * s, 680 + bob + (dy / len) * 170 * s, 18, 18, [245, 215, 195]);
  ellipse(frame, hx, hy, 115, 125, [250, 225, 205]);
  ellipse(frame, hx, hy - 70, 125, 70, [70, 50, 90]);
  const lid = f % 90 < 4 ? 2 : 18;
  for (const ex of [hx - 42, hx + 42]) ellipse(frame, ex, hy, 14, lid, [40, 60, 140]);
  ellipse(frame, hx, hy + 62, 30, 4 + 26 * open, [150, 50, 70]);
}

function background() {
  const frame = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y += 1) {
    const t = y / H, row = Buffer.from([18 + 10 * t, 28 + 16 * t, 58 + 30 * t].map(Math.round));
    for (let x = 0; x < W; x += 1) row.copy(frame, (y * W + x) * 3);
  }
  return frame;
}

const sha256 = (path: string) => 'sha256:' + createHash('sha256').update(readFileSync(path)).digest('hex');

export async function preview(project: string, request: { audio: string }) {
  const source = join(project, request.audio);
  const wav = readWav(readFileSync(source));
  if (!wav || wav.format !== 1 || wav.bits !== 16) return { report: { status: 'FAIL', issues: [{ code: 'AUDIO_FORMAT', ref: request.audio }] }, exitCode: 1 };
  if (wav.rate !== RATE) return { report: { status: 'FAIL', issues: [{ code: 'AUDIO_SAMPLE_RATE', ref: request.audio, rate: wav.rate }] }, exitCode: 1 };

  const samples = wav.data.length / (wav.channels * 2);
  const frames = Math.floor((samples + SAMPLES_PER_FRAME - 1) / SAMPLES_PER_FRAME);
  const out = join(project, 'renders', 't01');
  mkdirSync(join(out, 'frames'), { recursive: true });
  const archived = join(out, 'source.wav'), master = join(out, 'master.mp4');
  copyFileSync(source, archived);

  const encode = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', String(RATE), '-ac', '2', '-movflags', '+faststart'];
  const config = {
    width: W, height: H, fps: FPS, sample_rate_hz: RATE, frames, samples, padded_samples: frames * SAMPLES_PER_FRAME - samples,
    layers: ['background', 'diagram', 'character'], graphics_backend: 'software-rgb24', engine: `node ${process.version}`,
    ffmpeg: toolVersion('ffmpeg'),
    encode, character_fixture: CHARACTER_FIXTURE,
  };
  writeFileSync(join(out, 'render-config.json'), JSON.stringify(config, null, 2) + '\n');

  const ffmpeg = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS),
    '-i', 'pipe:0', '-i', archived, '-map', '0:v', '-map', '1:a', ...encode, master], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  ffmpeg.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = once(ffmpeg, 'close');
  const base = background(), loud = frameLoudness(wav, frames);
  for (let f = 0; f < frames; f += 1) {
    const frame = Buffer.from(base);
    diagramLayer(frame, f);
    characterLayer(frame, f, Math.min(1, loud[f] * 4));
    if (!ffmpeg.stdin.write(frame)) await once(ffmpeg.stdin, 'drain');
  }
  ffmpeg.stdin.end();
  const [code] = await done;
  if (code !== 0) return { report: { status: 'FAIL', issues: [{ code: 'ENCODE_FAILED', detail: stderr.trim() }] }, exitCode: 1 };

  const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries',
    'format=format_name,duration:stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,sample_rate,channels,nb_read_frames',
    '-of', 'json', master], { encoding: 'utf8' }).stdout;
  writeFileSync(join(out, 'probe.json'), probe);
  const decoded = Number(JSON.parse(probe).streams.find((s: any) => s.codec_type === 'video')?.nb_read_frames);

  const stills = PROBE_FRAMES(frames).map((n) => {
    const path = join(out, 'frames', `frame-${String(n).padStart(4, '0')}.png`);
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', master, '-vf', `select=eq(n\\,${n})`, '-fps_mode', 'passthrough', '-frames:v', '1', path]);
    return { frame: n, path };
  });
  const entry = (path: string) => ({ path: relative(project, path), sha256: sha256(path) });
  const issues = decoded === frames ? [] : [{ code: 'FRAME_COUNT', expected: frames, decoded }];
  return {
    report: {
      schema: 'preview-report/v1', status: issues.length ? 'FAIL' : 'PASS',
      timeline: { frames, samples, seconds: samples / RATE, decoded_frames: decoded },
      character_fixture: CHARACTER_FIXTURE,
      archive: {
        master: entry(master), source_audio: entry(archived), render_config: entry(join(out, 'render-config.json')),
        probe: entry(join(out, 'probe.json')), frames: stills.map(({ frame, path }) => ({ frame, ...entry(path) })),
      },
      issues,
    },
    exitCode: issues.length ? 1 : 0,
  };
}
