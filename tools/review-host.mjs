// Review helper for the host (超越路线图 §4 M0, §7). A development tool, not part of the skill.
// npm run review-host writes out/review/:
//   frame-1080.png, frame-540.png             host-left frames at 1080p and 540p
//   silhouette-540.png                        six moods at 540p with the scarf and markers inked black (小青人设设计 §7)
//   frame-1080-h264.png, frame-540-h264.png   same frames after a 60fps H.264 yuv420p BT.709 round trip (skipped if ffmpeg is absent)
//   before-after-540.png                      side-by-side pose sheet when out/review/before/pose-sheet-540.png exists
//   vs-<name>.png                             side-by-side comparison for every PNG placed in out/ref/
// npm run review-host -- --snapshot-before copies out/host/pose-sheet-*.png into out/review/before/.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawHost } from '../skills/topic-to-video/scripts/lib/rig.mjs';

const ROOT = join(import.meta.dirname, '..');
const HOST = join(ROOT, 'skills/topic-to-video/assets/host');
const OUT_HOST = join(ROOT, 'out/host');
const OUT_REVIEW = join(ROOT, 'out/review');
const OUT_REF = join(ROOT, 'out/ref');
const PAPER = '#fbfaf6';
const INK = '#1f1f1f';
const FONT = 'Hiragino Sans GB, PingFang SC, Noto Sans SC, sans-serif';

const escapeXml = (text) => String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function readPngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error('not a PNG');
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** A 1920×1080 host-left review frame scaled to 1920*scale × 1080*scale. */
export function frameSvg(manifest, { scale = 1 } = {}) {
  const width = Math.round(1920 * scale);
  const height = Math.round(1080 * scale);
  const diagram = '<rect x="640" y="80" width="1200" height="420" rx="16" fill="#ffffff" stroke="#1f1f1f" stroke-width="4" stroke-dasharray="14 10"/>'
    + `<text x="1240" y="310" font-family="${FONT}" font-size="64" fill="${INK}" text-anchor="middle">标题示例：缓存</text>`;
  const host = drawHost(manifest, { gesture: 'idle', expr: 'explaining', x: 320, ground: 930, seed: 'review' });
  const caption = `<text x="960" y="1010" font-family="${FONT}" font-size="40" fill="${INK}" text-anchor="middle">字幕示例：第二次打开为什么更快</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="${PAPER}"/>${diagram}${host}${caption}</svg>`;
}

/** Six moods drawn at 1080p and shown at 540p, the scarf and every marker inked black: is it still 小青? */
export function silhouetteSvg(manifest) {
  const dark = { ...manifest, ink: { ...manifest.ink, accent: INK, markers: { yellow: INK, red: INK, teal: INK } } };
  const moods = [['idle', 'explaining'], ['lean_in', 'curious'], ['startle', 'surprised'], ['shrug', 'worried'], ['snap', 'amazed'], ['cheer', 'happy']];
  const body = moods.map(([gesture, expr], i) => drawHost(dark, { gesture, expr, x: 210 + i * 300, ground: 500, seed: `silhouette-${gesture}` })).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="270" viewBox="0 0 1920 540"><rect width="1920" height="540" fill="${PAPER}"/>${body}</svg>`;
}

/** Places two PNG buffers side by side, both scaled proportionally to `height`, with labels underneath. */
export function pairSvg(left, right, { height = 900, gap = 40 } = {}) {
  const lSize = readPngSize(left.png);
  const rSize = readPngSize(right.png);
  const lw = Math.round((lSize.width * height) / lSize.height);
  const rw = Math.round((rSize.width * height) / rSize.height);
  const width = gap + lw + gap + rw + gap;
  const totalHeight = gap + height + 64;
  const rx = gap + lw + gap;
  const labelY = gap + height + 40;
  const img = (buf, x, w) => `<image x="${x}" y="${gap}" width="${w}" height="${height}" href="data:image/png;base64,${buf.toString('base64')}"/>`;
  const caption = (text, x, w) => `<text x="${x + w / 2}" y="${labelY}" font-family="${FONT}" font-size="28" fill="${INK}" text-anchor="middle">${escapeXml(text)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">`
    + `<rect width="${width}" height="${totalHeight}" fill="${PAPER}"/>`
    + img(left.png, gap, lw) + img(right.png, rx, rw)
    + caption(left.label, gap, lw) + caption(right.label, rx, rw)
    + '</svg>';
}

/** Encodes `inPng` as 1s 60fps H.264 (CRF 18, yuv420p, BT.709) and extracts frame 1 to `outPng`. Returns false if ffmpeg is unavailable. */
export function h264RoundTrip(inPng, outPng, { ffmpeg = 'ffmpeg' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'review-host-'));
  const tmpMp4 = join(dir, 'tmp.mp4');
  try {
    const enc = spawnSync(ffmpeg, [
      '-y', '-loglevel', 'error', '-loop', '1', '-i', inPng, '-t', '1', '-r', '60',
      '-vf', 'scale=out_color_matrix=bt709',
      '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      tmpMp4,
    ], { stdio: 'pipe' });
    if (enc.error || enc.status !== 0) return false;
    const dec = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', tmpMp4, '-frames:v', '1', outPng], { stdio: 'pipe' });
    return !dec.error && dec.status === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--snapshot-before')) {
    const beforeDir = join(OUT_REVIEW, 'before');
    mkdirSync(beforeDir, { recursive: true });
    const sheets = existsSync(OUT_HOST) ? readdirSync(OUT_HOST).filter((f) => /^pose-sheet-.*\.png$/.test(f)) : [];
    for (const file of sheets) copyFileSync(join(OUT_HOST, file), join(beforeDir, file));
    console.log(`snapshotted ${sheets.length} pose sheet(s) to out/review/before/`);
    return;
  }

  const { Resvg } = await import('@resvg/resvg-js');
  const raster = (svg) => new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Hiragino Sans GB' } }).render().asPng();
  const manifest = JSON.parse(readFileSync(join(HOST, 'manifest.json'), 'utf8'));
  mkdirSync(OUT_REVIEW, { recursive: true });

  const f1080 = join(OUT_REVIEW, 'frame-1080.png');
  const f540 = join(OUT_REVIEW, 'frame-540.png');
  writeFileSync(f1080, raster(frameSvg(manifest, { scale: 1 })));
  writeFileSync(f540, raster(frameSvg(manifest, { scale: 0.5 })));
  writeFileSync(join(OUT_REVIEW, 'silhouette-540.png'), raster(silhouetteSvg(manifest)));

  const ok1080 = h264RoundTrip(f1080, join(OUT_REVIEW, 'frame-1080-h264.png'));
  const ok540 = ok1080 && h264RoundTrip(f540, join(OUT_REVIEW, 'frame-540-h264.png'));
  if (!ok1080 || !ok540) {
    console.log('skipped H.264 round trip: ffmpeg unavailable or failed');
  }

  const before540 = join(OUT_REVIEW, 'before/pose-sheet-540.png');
  const after540 = join(OUT_HOST, 'pose-sheet-540.png');
  if (existsSync(before540) && existsSync(after540)) {
    writeFileSync(
      join(OUT_REVIEW, 'before-after-540.png'),
      raster(pairSvg(
        { png: readFileSync(before540), label: 'Before (540p)' },
        { png: readFileSync(after540), label: 'After (540p)' },
      )),
    );
  }

  const after1080 = join(OUT_HOST, 'pose-sheet-1080.png');
  if (existsSync(OUT_REF) && existsSync(after1080)) {
    const ours = readFileSync(after1080);
    for (const file of readdirSync(OUT_REF).filter((f) => f.endsWith('.png')).sort()) {
      writeFileSync(
        join(OUT_REVIEW, `vs-${file}`),
        raster(pairSvg(
          { png: readFileSync(join(OUT_REF, file)), label: `Reference: ${file}` },
          { png: ours, label: 'Xiaoqing (1080p)' },
        )),
      );
    }
  }
  console.log('wrote review outputs to out/review/');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
