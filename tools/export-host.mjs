// Draws the host's images from rig.mjs (火柴人主持人设计 §8.2, §9.3). A development tool, not part of the skill.
// npm run export-host writes:
//   skills/topic-to-video/assets/host/host-ref.png  reference image for external models (no text); size and sha256 go into manifest.json
//   site/assets/host-cheatsheet.png                 every gesture, expression (with its 呆毛 shape), prop and outfit with its name
//   site/index.html                                 the inline SVG between <!-- host:hero --> and <!-- /host:hero -->
//   out/host/pose-sheet-1080.png, -540.png          contact sheets for the owner's review, not committed
// Each PNG carries the sha256 of the SVG it was drawn from in a tEXt chunk (svg-sha256), so tests can tell when
// rig.mjs or manifest.json changed without a new export. Text uses system fonts; on macOS that is Hiragino Sans GB.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import { drawHost, forwardKinematics, poseAngles, resolvePose } from '../skills/topic-to-video/scripts/lib/rig.mjs';

const ROOT = join(import.meta.dirname, '..');
const HOST = join(ROOT, 'skills/topic-to-video/assets/host');
const PAPER = '#fbfaf6';
const INK = '#1f1f1f';
const FONT = 'Hiragino Sans GB, PingFang SC, Noto Sans SC, sans-serif';

/** Chinese captions for the cheatsheet; the names themselves come from manifest.json. */
export const LABELS = {
  idle: '站着', point: '指向', point_right: '旧名，同 point', emphasize: '强调', think: '思考', shrug: '摊手', present: '介绍', sit: '坐下',
  wave: '挥手', jump: '跳起', cheer: '欢呼', tap: '拍一下', snap: '打响指', lean_in: '凑近看', startle: '吓一跳', double_take: '再看一眼', scratch_head: '挠头',
  explaining: '讲解', focused: '专注', happy: '开心', curious: '好奇', surprised: '惊讶', worried: '担心', frustrated: '着急', proud: '得意', amazed: '恍然大悟',
  pointer: '教鞭', magnifier: '放大镜', phone: '手机', doc: '文件', bulb: '灯泡', question: '问号牌',
};

/** The 呆毛 shapes; kept apart from LABELS because question is also a prop. */
export const AHOGE_LABELS = { curl: '小卷', question: '问号', straight: '竖直', droop: '耷拉', spring: '弹簧' };

export const svgHash = (svg) => createHash('sha256').update(svg).digest('hex');
const svgDoc = (width, height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${PAPER}"/>${body}</svg>`;
const scaled = (scale, body) => `<g transform="scale(${scale})">${body}</g>`;
const label = (x, y, name, size = 22) =>
  `<text x="${x}" y="${y}" font-family="Menlo, monospace" font-size="${size}" fill="${INK}" text-anchor="middle">${name}</text>`
  + `<text x="${x}" y="${y + size + 6}" font-family="${FONT}" font-size="${size - 2}" fill="#6b6b6b" text-anchor="middle">${LABELS[name]}</text>`;

// A head close-up: the whole host drawn at (200, 930), shown through a window around the head.
function headCrop(manifest, expr, x, y, size, seed) {
  const pose = resolvePose(manifest, 'idle');
  const { points } = forwardKinematics(manifest, poseAngles(manifest, 'idle', undefined, pose.view), { view: pose.view, x: 200, ground: 930 });
  const [cx, cy] = points.head_center;
  const half = 0.24 * manifest.height_px;
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${cx - half} ${cy - half - 0.06 * manifest.height_px} ${2 * half} ${2 * half}">${drawHost(manifest, { gesture: 'idle', expr, x: 200, ground: 930, seed })}</svg>`;
}

/** host-ref.png: front view standing, four faces, and point, think, walk and cheer. No text. */
export function hostRefSvg(manifest) {
  const front = scaled(1.5, drawHost(manifest, { gesture: 'idle', expr: 'explaining', view: 'front', x: 180, ground: 580, seed: 'ref-front' }));
  const faces = ['happy', 'curious', 'surprised', 'worried'].map((expr, i) => headCrop(manifest, expr, 520 + i * 260, 30, 240, `ref-${expr}`)).join('');
  const acts = [['point', 'explaining'], ['think', 'curious'], ['walk', 'happy'], ['cheer', 'proud']]
    .map(([gesture, expr], i) => drawHost(manifest, { gesture, expr, x: 560 + i * 280, ground: 870, seed: `ref-${gesture}` })).join('');
  return svgDoc(1600, 900, front + faces + acts);
}

/** host-cheatsheet.png: the gestures, the expressions and the props, each with its name and a Chinese caption. */
export function cheatsheetSvg(manifest) {
  const title = `<text x="40" y="64" font-family="${FONT}" font-size="40" fill="${INK}">小青 xiaoqing · 速查图</text>`
    + `<text x="1760" y="64" font-family="${FONT}" font-size="24" fill="#6b6b6b" text-anchor="end">动作 ${Object.keys(manifest.poses).length} · 表情 ${Object.keys(manifest.expressions).length} · 道具 ${Object.keys(manifest.props).length}</text>`;
  const gestures = Object.keys(manifest.poses).map((gesture, i) => {
    const [x, top] = [150 + (i % 6) * 300, 100 + Math.floor(i / 6) * 400];
    const figure = manifest.poses[gesture].alias
      ? `<text x="${x}" y="${top + 200}" font-family="Menlo, monospace" font-size="26" fill="${INK}" text-anchor="middle">= ${manifest.poses[gesture].alias}</text>`
      : scaled(0.7, drawHost(manifest, { gesture, expr: 'explaining', x: x / 0.7, ground: (top + 320) / 0.7, seed: `sheet-${gesture}` }));
    return figure + label(x, top + 352, gesture);
  }).join('');
  const faces = Object.keys(manifest.expressions).map((expr, i) => {
    const shape = manifest.ahoge.by_expr[expr];
    return headCrop(manifest, expr, 18 + i * 196, 1310, 180, `sheet-${expr}`) + label(108 + i * 196, 1520, expr)
      + `<text x="${108 + i * 196}" y="1578" font-family="${FONT}" font-size="18" fill="#6b6b6b" text-anchor="middle">呆毛 ${shape} ${AHOGE_LABELS[shape]}</text>`;
  }).join('');
  const props = Object.entries(manifest.props).map(([prop, p], i) => {
    const x = 150 + i * 300;
    const gesture = p.hand === 'acting' ? 'point' : 'idle';
    return scaled(0.7, drawHost(manifest, { gesture, expr: 'explaining', prop, x: x / 0.7, ground: 1940 / 0.7, seed: `sheet-${prop}` })) + label(x, 1980, prop);
  }).join('');
  return svgDoc(1800, 2040, title + gestures + faces + props);
}

/** The waving host in the site's hero frame; the page's CSS swings the left forearm and blinks the eyes. */
export function heroSvg(manifest) {
  return `<svg viewBox="0 0 320 480" aria-hidden="true">${drawHost(manifest, { gesture: 'wave', expr: 'happy', x: 160, ground: 460, seed: 'site-hero' })}</svg>`;
}

/** Contact sheet for the owner: every pose in its own view, idle in every view and facing left, faces and props. */
export function poseSheetSvg(manifest, scale) {
  const cells = [
    ...[...Object.keys(manifest.poses).filter((g) => !manifest.poses[g].alias), 'walk'].map((gesture) => ({ gesture })),
    ...['front', 'three_quarter', 'side'].map((view) => ({ gesture: 'idle', view })), { gesture: 'idle', view: 'side', facing: -1 },
    ...Object.keys(manifest.expressions).map((expr) => ({ gesture: 'idle', expr })),
    ...Object.entries(manifest.props).map(([prop, p]) => ({ gesture: p.hand === 'acting' ? 'point' : 'idle', prop })),
  ];
  const body = cells.map((c, i) => drawHost(manifest, { expr: 'explaining', ...c, x: 150 + (i % 6) * 300, ground: 480 + Math.floor(i / 6) * 520, seed: `pose-${i}` })).join('');
  const rows = Math.ceil(cells.length / 6);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${1800 * scale}" height="${520 * rows * scale}" viewBox="0 0 1800 ${520 * rows}"><rect width="1800" height="${520 * rows}" fill="${PAPER}"/>${body}</svg>`;
}

/** Adds a tEXt chunk before IEND. */
export function withText(png, key, value) {
  const data = Buffer.from(`${key}\0${value}`, 'latin1');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write('tEXt', 4, 'latin1');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return Buffer.concat([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)]);
}

/** Replaces what sits between <!-- host:NAME --> and <!-- /host:NAME --> in a page. */
export function replaceBlock(html, name, content) {
  const pattern = new RegExp(`(<!-- host:${name} -->)[\\s\\S]*?(<!-- /host:${name} -->)`);
  if (!pattern.test(html)) throw new Error(`site/index.html has no <!-- host:${name} --> block`);
  return html.replace(pattern, (_, open, close) => `${open}${content}${close}`);
}

async function main() {
  const { Resvg } = await import('@resvg/resvg-js');
  const raster = (svg) => withText(new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Hiragino Sans GB' } }).render().asPng(), 'svg-sha256', svgHash(svg));
  const manifestFile = join(HOST, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const ref = raster(hostRefSvg(manifest));
  writeFileSync(join(HOST, manifest.ref.file), ref);
  const sha = createHash('sha256').update(ref).digest('hex');
  writeFileSync(manifestFile, readFileSync(manifestFile, 'utf8').replace(/("ref": \{[^}]*"sha256": ")[0-9a-f]*"/, `$1${sha}"`));
  writeFileSync(join(ROOT, 'site/assets/host-cheatsheet.png'), raster(cheatsheetSvg(manifest)));
  const page = join(ROOT, 'site/index.html');
  writeFileSync(page, replaceBlock(readFileSync(page, 'utf8'), 'hero', heroSvg(manifest)));
  mkdirSync(join(ROOT, 'out/host'), { recursive: true });
  writeFileSync(join(ROOT, 'out/host/pose-sheet-1080.png'), raster(poseSheetSvg(manifest, 1)));
  writeFileSync(join(ROOT, 'out/host/pose-sheet-540.png'), raster(poseSheetSvg(manifest, 0.5)));
  console.log(`host-ref.png ${ref.length} bytes, sha256 ${sha}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
