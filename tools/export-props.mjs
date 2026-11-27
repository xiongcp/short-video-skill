// Exports a visual cheatsheet of all 72 built-in props, state overlays, and a sample custom prop.
// Development tool only (not inside skills/topic-to-video/).
// Usage: npm run export-props -- [--style paper|chalkboard|blueprint|kraft|night] [--out path]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS, PROP_META, drawCustomProp, drawIcon } from '../skills/topic-to-video/scripts/lib/icons.mjs';
import { num } from '../skills/topic-to-video/scripts/lib/ink.mjs';
import { resolveStyle, styleBackgroundSvg } from '../skills/topic-to-video/scripts/lib/world.mjs';

const ROOT = join(import.meta.dirname, '..');
const FONT = 'Hiragino Sans GB, PingFang SC, Noto Sans SC, sans-serif';

const SAMPLE_FISHTANK = {
  id: 'c_fishtank',
  label: '鱼缸',
  height: 0.5,
  layer: 'ground',
  parts: [
    { shape: 'rect', x: -0.9, y: -0.5, w: 1.8, h: 1.5, fill: 'soft_accent' },
    { shape: 'circle', cx: -0.3, cy: 0.2, r: 0.15, fill: 'yellow' },
    { shape: 'poly', points: [[0.1, 0.2], [0.4, 0.05], [0.4, 0.35]], fill: 'yellow' },
    { shape: 'line', points: [[-0.9, -0.3], [0.9, -0.3]] },
  ],
};

function escXml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function propsCheatsheetSvg({ style = 'paper' } = {}) {
  const { name: styleName, palette: pal } = resolveStyle(style);
  const width = 1920;
  const cols = 6;
  const cellW = 300;
  const cellH = 230;
  const marginX = 60;
  const gridTop = 110;
  const rows = Math.ceil(ICONS.length / cols);
  const stateTop = gridTop + rows * cellH + 56;
  const stateCellH = 190;
  const height = stateTop + 2 * stateCellH + 60;

  const bg = styleBackgroundSvg(styleName, width, height);
  const header = `<text x="60" y="64" font-family="${FONT}" font-size="38" font-weight="bold" fill="${pal.ink}">内置物件速查表 · ${ICONS.length} Props (${styleName})</text>`
    + `<text x="${width - 60}" y="64" font-family="${FONT}" font-size="22" fill="${pal.muted}" text-anchor="end">比例 H = 400 px · 描边 ≥ 4.4 px · 支持 5 套风格包</text>`;

  const propCells = ICONS.map((name, i) => {
    const meta = PROP_META[name];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = marginX + col * cellW;
    const y0 = gridTop + row * cellH;
    const cx = x0 + cellW / 2;
    const cy = y0 + 82;
    const stageH = 400 * meta.height;
    const stageW = stageH * meta.aspect;
    const sc = Math.min(0.85, 118 / stageH, 210 / stageW);
    const iconSvg = drawIcon(name, { x: 0, y: 0, width: stageW, height: stageH, style: styleName, seed: `sheet:${name}` });
    const statesStr = meta.states.length ? meta.states.join('/') : 'common';
    const caption = `h=${meta.height} · ${meta.layer}${meta.carry ? ' · carry' : ''}`;
    return `<rect x="${x0 + 8}" y="${y0 + 6}" width="${cellW - 16}" height="${cellH - 12}" rx="12" fill="${pal.card}" fill-opacity="0.55" stroke="${pal.grid}" stroke-width="2"/>`
      + `<g transform="translate(${num(cx)} ${num(cy)}) scale(${num(sc)})">${iconSvg}</g>`
      + `<text x="${cx}" y="${y0 + 168}" font-family="Menlo, monospace" font-size="20" font-weight="bold" fill="${pal.ink}" text-anchor="middle">${name}</text>`
      + `<text x="${cx}" y="${y0 + 192}" font-family="${FONT}" font-size="14" fill="${pal.muted}" text-anchor="middle">${escXml(caption)}</text>`
      + `<text x="${cx}" y="${y0 + 212}" font-family="Menlo, monospace" font-size="13" fill="${pal.accent}" text-anchor="middle">${escXml(statesStr)}</text>`;
  }).join('');

  const stateSamples = [
    { kind: 'icon', prop: 'fridge', state: 'open', label: 'fridge:open' },
    { kind: 'icon', prop: 'fridge', state: 'full', label: 'fridge:full' },
    { kind: 'icon', prop: 'fridge', state: 'expired', label: 'fridge:expired' },
    { kind: 'icon', prop: 'lock', state: 'unlocked', label: 'lock:unlocked' },
    { kind: 'icon', prop: 'bulb', state: 'lit', label: 'bulb:lit' },
    { kind: 'icon', prop: 'box', state: 'active', label: 'box:active' },
    { kind: 'icon', prop: 'box', state: 'dim', label: 'box:dim' },
    { kind: 'icon', prop: 'box', state: 'crossed', label: 'box:crossed' },
    { kind: 'icon', prop: 'box', state: 'stamped', label: 'box:stamped' },
    { kind: 'icon', prop: 'box', state: 'broken', label: 'box:broken' },
    { kind: 'icon', prop: 'box', state: 'count:3', label: 'box:count:3' },
    { kind: 'custom', def: SAMPLE_FISHTANK, state: 'normal', label: 'custom:c_fishtank' },
  ];

  const stateTitle = `<text x="60" y="${stateTop - 18}" font-family="${FONT}" font-size="26" font-weight="bold" fill="${pal.ink}">专属状态、通用状态与自定义道具示例</text>`;
  const stateCells = stateSamples.map((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = marginX + col * cellW;
    const y0 = stateTop + row * stateCellH;
    const cx = x0 + cellW / 2;
    const cy = y0 + 74;
    let svgBody = '';
    if (item.kind === 'custom') {
      const stageH = 400 * item.def.height;
      const sc = Math.min(0.75, 108 / stageH);
      svgBody = `<g transform="translate(${num(cx)} ${num(cy)}) scale(${num(sc)})">${drawCustomProp(item.def, { x: 0, y: 0, w: stageH, h: stageH, style: styleName, seed: 'sheet-custom' })}</g>`;
    } else {
      const meta = PROP_META[item.prop];
      const stageH = 400 * meta.height;
      const stageW = stageH * meta.aspect;
      const sc = Math.min(0.75, 108 / stageH, 190 / stageW);
      const iconSvg = drawIcon(item.prop, { x: 0, y: 0, width: stageW, height: stageH, style: styleName, seed: `sheet:${item.label}`, state: item.state });
      const rad = Math.max(16, Math.min(28, Math.min(stageW, stageH) * 0.24));
      const bx = cx + (stageW / 2 - rad * 0.25) * sc;
      const by = cy + (-stageH / 2 + rad * 0.25) * sc;
      const badgeDigit = item.state.startsWith('count:')
        ? `<text x="${num(bx)}" y="${num(by)}" font-family="${FONT}" font-size="${num(Math.max(14, rad * sc * 1.15))}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${escXml(item.state.slice(6))}</text>`
        : '';
      svgBody = `<g transform="translate(${num(cx)} ${num(cy)}) scale(${num(sc)})">${iconSvg}</g>${badgeDigit}`;
    }
    return `<rect x="${x0 + 8}" y="${y0 + 6}" width="${cellW - 16}" height="${stateCellH - 12}" rx="12" fill="${pal.card}" fill-opacity="0.55" stroke="${pal.grid}" stroke-width="2"/>`
      + svgBody
      + `<text x="${cx}" y="${y0 + 162}" font-family="Menlo, monospace" font-size="17" font-weight="bold" fill="${pal.ink}" text-anchor="middle">${escXml(item.label)}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bg}${header}${propCells}${stateTitle}${stateCells}</svg>`;
}

function parseArgs(argv) {
  let style = 'paper';
  let out = join(ROOT, 'out/review/props-cheatsheet.png');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--style' && argv[i + 1]) {
      style = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--out' && argv[i + 1]) {
      out = argv[i + 1];
      i += 1;
    }
  }
  return { style, out };
}

async function main() {
  const { Resvg } = await import('@resvg/resvg-js');
  const { style, out } = parseArgs(process.argv.slice(2));
  const svg = propsCheatsheetSvg({ style });
  const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Hiragino Sans GB' } }).render().asPng();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`wrote ${out} (${png.length} bytes, style=${style})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
