// Visual style packs and 8 hand-drawn stage scenes (个性化路线图, S1/S2).
// Pure vector SVG helpers without <text> or <filter>, keeping the central stage clear.
import { circlePoints, inkStroke, markerFill, num } from './ink.mjs';

export const GROUND_Y = 930;
export const STYLE_NAMES = ['paper', 'chalkboard', 'blueprint', 'kraft', 'night'];
export const SCENE_NAMES = ['blank', 'podium', 'kitchen', 'street', 'lab', 'office', 'outdoor', 'workshop'];

function makePalette(spec) {
  return {
    ...spec,
    teal: spec.accent,
    softTeal: spec.soft_accent,
    softYellow: spec.soft_yellow,
    softRed: spec.soft_red,
  };
}

export const STYLE_PALETTES = {
  paper: makePalette({
    paper: '#fbfaf6',
    grid: '#eeeae0',
    ink: '#1f1f1f',
    muted: '#575757',
    card: '#ffffff',
    accent: '#20a5a3',
    yellow: '#f6c945',
    red: '#e05a47',
    soft_accent: '#d7f0ef',
    soft_yellow: '#fdf1c8',
    soft_red: '#fadcd7',
    textStroke: '#1f1f1f',
    isDark: false,
  }),
  chalkboard: makePalette({
    paper: '#1d3328',
    grid: '#284536',
    ink: '#f3f1e8',
    muted: '#c5cebf',
    card: '#243d30',
    accent: '#7bdcb5',
    yellow: '#f7dc6f',
    red: '#f1948a',
    soft_accent: '#27483a',
    soft_yellow: '#3d3c25',
    soft_red: '#472c2a',
    textStroke: '#13221a',
    isDark: true,
  }),
  blueprint: makePalette({
    paper: '#143252',
    grid: '#1f4875',
    ink: '#eaf3ff',
    muted: '#a9c6e8',
    card: '#193c61',
    accent: '#5ec8ff',
    yellow: '#ffd866',
    red: '#ff7b72',
    soft_accent: '#1d4a70',
    soft_yellow: '#3c4430',
    soft_red: '#472e3a',
    textStroke: '#0c1f35',
    isDark: true,
  }),
  kraft: makePalette({
    paper: '#e8d5b7',
    grid: '#d6be98',
    ink: '#3b2818',
    muted: '#735840',
    card: '#f2e5cf',
    accent: '#2d7a78',
    yellow: '#d99b26',
    red: '#c24d38',
    soft_accent: '#cde0dc',
    soft_yellow: '#f3dfb4',
    soft_red: '#edd0c4',
    textStroke: '#3b2818',
    isDark: false,
  }),
  night: makePalette({
    paper: '#181b22',
    grid: '#232833',
    ink: '#f2f2f2',
    muted: '#adb5c2',
    card: '#222630',
    accent: '#2ec4c1',
    yellow: '#f6c945',
    red: '#eb6f5c',
    soft_accent: '#1e3c3c',
    soft_yellow: '#3b341c',
    soft_red: '#3d2421',
    textStroke: '#111318',
    isDark: true,
  }),
};

/** Resolve a style name, legacy theme ('light'|'dark'), or project object into `{ name, palette }`. */
export function resolveStyle(input) {
  if (input == null) return { name: 'paper', palette: STYLE_PALETTES.paper };
  if (typeof input === 'object') {
    if (input.world?.style !== undefined) return resolveStyle(input.world.style);
    const name = input.theme === 'dark' ? 'night' : 'paper';
    return { name, palette: STYLE_PALETTES[name] };
  }
  if (typeof input === 'string') {
    const mapped = input === 'light' ? 'paper' : input === 'dark' ? 'night' : input;
    if (STYLE_PALETTES[mapped]) return { name: mapped, palette: STYLE_PALETTES[mapped] };
  }
  throw new Error(`unknown style: ${String(input)}`);
}

function gridLines(step, stroke, strokeWidth, parallax, width, height) {
  const [px, py] = parallax;
  const lines = [];
  for (let x = ((px % step) + step) % step; x < width; x += step) {
    lines.push(`<line x1="${num(x)}" y1="0" x2="${num(x)}" y2="${height}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
  }
  for (let y = ((py % step) + step) % step; y < height; y += step) {
    lines.push(`<line x1="0" y1="${num(y)}" x2="${width}" y2="${num(y)}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
  }
  return lines.join('');
}

function chalkboardWipes(pal, width, height, [px, py]) {
  const ox = ((px % 160) + 160) % 160 - 80;
  const oy = ((py % 120) + 120) % 120 - 60;
  const wipes = [
    [[140, 180], [520, 140], [880, 195]],
    [[1060, 220], [1480, 175], [1790, 215]],
    [[260, 620], [640, 575], [960, 635]],
    [[980, 740], [1360, 695], [1690, 745]],
    [[180, 390], [430, 440]],
    [[1490, 430], [1760, 385]],
  ];
  const paths = wipes.map((pts, i) => {
    const shifted = pts.map(([x, y]) => [(x * width) / 1920 + ox, (y * height) / 1080 + oy]);
    const w = i < 4 ? [36, 54] : [22, 34];
    const d = inkStroke(shifted, { seed: `chalk-wipe:${i}`, width: w, wobble: 6, smooth: 1 }).d;
    return `<path d="${d}" fill="${pal.ink}" opacity="${i < 4 ? '0.035' : '0.045'}"/>`;
  });
  return `<g>${paths.join('')}</g>`;
}

function kraftFibers(pal, width, height, [px, py]) {
  const ox = ((px % 120) + 120) % 120 - 60;
  const oy = ((py % 120) + 120) % 120 - 60;
  const fibers = [];
  for (let i = 0; i < 28; i += 1) {
    const col = i % 7;
    const row = Math.floor(i / 7);
    const x1 = ((col * 280 + row * 95 + 60) * width) / 1920 + ox;
    const y1 = ((row * 260 + (col % 3) * 70 + 75) * height) / 1080 + oy;
    const dx = ((i % 2 === 0 ? 1 : -1) * (95 + (i % 4) * 28) * width) / 1920;
    const dy = (((i % 3) - 1) * 42 + 24) * (height / 1080);
    const mx = x1 + dx * 0.5 + ((i % 2) ? 10 : -10);
    const my = y1 + dy * 0.5 + ((i % 3) ? -8 : 8);
    const color = i % 3 === 0 ? pal.muted : pal.grid;
    fibers.push(
      `<path d="M${num(x1)} ${num(y1)} Q${num(mx)} ${num(my)} ${num(x1 + dx)} ${num(y1 + dy)}" fill="none" stroke="${color}" stroke-width="${i % 2 === 0 ? '1.6' : '1.2'}" stroke-linecap="round" opacity="0.28"/>`,
    );
  }
  return `<g>${fibers.join('')}</g>`;
}

/** Pure vector style background (no <text>, no <filter>). */
export function styleBackgroundSvg(styleName, width = 1920, height = 1080, parallax = [0, 0]) {
  const pal = STYLE_PALETTES[styleName];
  if (!pal) throw new Error(`unknown style: ${styleName}`);
  const base = `<rect width="${width}" height="${height}" fill="${pal.paper}"/>`;
  switch (styleName) {
    case 'paper':
    case 'night':
      return `${base}<g opacity="0.7">${gridLines(96, pal.grid, 2, parallax, width, height)}</g>`;
    case 'blueprint':
      return `${base}<g opacity="0.35">${gridLines(48, pal.grid, 1, parallax, width, height)}</g><g opacity="0.75">${gridLines(192, pal.grid, 2, parallax, width, height)}</g>`;
    case 'chalkboard':
      return base + chalkboardWipes(pal, width, height, parallax);
    case 'kraft':
      return base + kraftFibers(pal, width, height, parallax);
    default:
      throw new Error(`unknown style: ${styleName}`);
  }
}

/**
 * Hand-drawn stage environment for one of 8 SCENE_NAMES.
 * Draws low-opacity edge/ceiling silhouettes plus a ground line at `ground` (default 930),
 * leaving the central performance zone (x 560..1360, y 360..920) and subtitle band (y > 935) clear.
 */
export function sceneBackgroundSvg(sceneName, { style = 'paper', width = 1920, height = 1080, seed = 'scene', ground = GROUND_Y } = {}) {
  if (!SCENE_NAMES.includes(sceneName)) throw new Error(`unknown scene: ${sceneName}`);
  const { palette: pal } = resolveStyle(style);
  const kx = width / 1920;
  const ky = ground / GROUND_Y;
  const sx = (x) => x * kx;
  const sy = (y) => y * ky;
  const pt = (x, y) => [sx(x), sy(y)];
  const poly = (pts) => pts.map(([x, y]) => pt(x, y));

  const inkPath = (pts, key, { widthRange = [2.8, 4.2], wobble = 1.8, taper = 'both', smooth = 0 } = {}) =>
    `<path d="${inkStroke(poly(pts), { seed: `${seed}:${sceneName}:${key}`, width: widthRange, wobble, taper, smooth }).d}" fill="${pal.ink}"/>`;

  const box = (x, y, w, h, key, over = 3) => [
    inkPath([[x - over, y], [x + w + over, y]], `${key}:t`),
    inkPath([[x + w, y - over], [x + w, y + h + over]], `${key}:r`),
    inkPath([[x + w + over, y + h], [x - over, y + h]], `${key}:b`),
    inkPath([[x, y + h + over], [x, y - over]], `${key}:l`),
  ].join('');

  const circle = (cx, cy, r, key, widthRange = [2.8, 4]) => {
    const pts = circlePoints(sx(cx), sy(cy), r * Math.min(kx, ky), { seed: `${seed}:${sceneName}:${key}`, overdraw: 0.3, count: 32 });
    return `<path d="${inkStroke(pts, { seed: `${seed}:${sceneName}:${key}:s`, width: widthRange, wobble: 1.5 }).d}" fill="${pal.ink}"/>`;
  };

  const soft = (pts, key, fill) =>
    `<path d="${markerFill(poly(pts), { seed: `${seed}:${sceneName}:${key}:m`, shift: 4 })}" fill="${fill}" opacity="0.45"/>`;

  const parts = [];
  switch (sceneName) {
    case 'blank':
      break;
    case 'podium':
      // Left curtain + lectern, right speaker stand + curtain, top twin spotlights
      parts.push(inkPath([[55, 45], [75, 290], [60, 620], [72, 920]], 'curtain-l1', { smooth: 1 }));
      parts.push(inkPath([[115, 45], [135, 310], [118, 640], [130, 920]], 'curtain-l2', { smooth: 1 }));
      parts.push(inkPath([[1865, 45], [1845, 290], [1860, 620], [1848, 920]], 'curtain-r1', { smooth: 1 }));
      parts.push(inkPath([[1805, 45], [1785, 310], [1802, 640], [1790, 920]], 'curtain-r2', { smooth: 1 }));
      parts.push(soft([[220, 610], [450, 610], [430, 920], [240, 920]], 'lectern-fill', pal.soft_accent));
      parts.push(box(205, 585, 260, 28, 'lectern-top'));
      parts.push(box(235, 613, 200, 307, 'lectern-body'));
      parts.push(inkPath([[335, 585], [335, 520], [365, 500]], 'mic'));
      parts.push(inkPath([[1540, 560], [1540, 920]], 'stand-pole'));
      parts.push(inkPath([[1470, 920], [1610, 920]], 'stand-base'));
      parts.push(box(1470, 480, 140, 80, 'speaker-head'));
      parts.push(circle(1540, 520, 22, 'speaker-cone'));
      parts.push(inkPath([[350, 40], [350, 120]], 'spot-l-cord'));
      parts.push(inkPath([[305, 175], [335, 120], [365, 120], [395, 175], [305, 175]], 'spot-l-hood'));
      parts.push(inkPath([[1570, 40], [1570, 120]], 'spot-r-cord'));
      parts.push(inkPath([[1525, 175], [1555, 120], [1585, 120], [1615, 175], [1525, 175]], 'spot-r-hood'));
      break;
    case 'kitchen':
      // Left upper cabinet, wall tiles, counter + kettle; right window, hanging rack, lower cabinet
      parts.push(box(65, 65, 410, 185, 'cab-l'));
      parts.push(inkPath([[270, 65], [270, 250]], 'cab-l-mid'));
      parts.push(inkPath([[65, 340], [475, 340]], 'tile-h1'));
      parts.push(inkPath([[65, 420], [475, 420]], 'tile-h2'));
      parts.push(inkPath([[195, 340], [195, 420]], 'tile-v1'));
      parts.push(inkPath([[345, 340], [345, 420]], 'tile-v2'));
      parts.push(soft([[70, 595], [475, 595], [475, 920], [70, 920]], 'counter-l-fill', pal.soft_yellow));
      parts.push(box(65, 575, 420, 24, 'counter-l-top'));
      parts.push(box(80, 599, 390, 321, 'counter-l-base'));
      parts.push(circle(260, 535, 38, 'kettle'));
      parts.push(inkPath([[298, 525], [330, 505]], 'kettle-spout'));
      parts.push(inkPath([[1435, 110], [1845, 110]], 'pan-rail'));
      parts.push(inkPath([[1520, 110], [1520, 185]], 'pan-stem1'));
      parts.push(circle(1520, 225, 38, 'pan-1'));
      parts.push(inkPath([[1660, 110], [1660, 175]], 'pan-stem2'));
      parts.push(circle(1660, 208, 30, 'pan-2'));
      parts.push(box(1465, 310, 330, 210, 'window'));
      parts.push(inkPath([[1630, 310], [1630, 520]], 'window-v'));
      parts.push(inkPath([[1465, 415], [1795, 415]], 'window-h'));
      parts.push(box(1445, 595, 410, 325, 'counter-r'));
      break;
    case 'street':
      // Left storefront + awning; right streetlamp + cafe facade; top power line
      parts.push(inkPath([[440, 115], [960, 155], [1480, 115]], 'wire', { smooth: 1 }));
      parts.push(box(65, 210, 415, 710, 'shop-l'));
      parts.push(soft([[55, 435], [495, 435], [480, 505], [70, 505]], 'awning-fill', pal.soft_red));
      parts.push(inkPath([[55, 435], [495, 435], [480, 505], [70, 505], [55, 435]], 'awning'));
      for (const sxLine of [145, 225, 305, 385]) {
        parts.push(inkPath([[sxLine, 435], [sxLine, 505]], `awning-stripe-${sxLine}`));
      }
      parts.push(box(105, 555, 195, 210, 'shop-win'));
      parts.push(box(335, 555, 110, 365, 'shop-door'));
      parts.push(inkPath([[1470, 220], [1470, 920]], 'lamp-post'));
      parts.push(inkPath([[1425, 920], [1515, 920]], 'lamp-base'));
      parts.push(inkPath([[1470, 225], [1495, 185], [1545, 185], [1560, 215]], 'lamp-arm', { smooth: 1 }));
      parts.push(circle(1560, 238, 22, 'lamp-bulb'));
      parts.push(box(1595, 310, 265, 610, 'cafe-r'));
      parts.push(box(1640, 385, 175, 125, 'cafe-win1'));
      parts.push(box(1640, 575, 175, 165, 'cafe-win2'));
      break;
    case 'lab':
      // Left shelf with flasks + bench; right cabinet + upper chalkboard/atom; top pendant lamps
      parts.push(inkPath([[420, 40], [420, 130]], 'lamp-l-cord'));
      parts.push(inkPath([[375, 170], [420, 130], [465, 170], [375, 170]], 'lamp-l'));
      parts.push(inkPath([[1500, 40], [1500, 130]], 'lamp-r-cord'));
      parts.push(inkPath([[1455, 170], [1500, 130], [1545, 170], [1455, 170]], 'lamp-r'));
      parts.push(inkPath([[75, 420], [470, 420]], 'shelf-l'));
      parts.push(inkPath([[155, 315], [155, 355], [125, 418], [195, 418], [165, 355], [165, 315]], 'flask-1'));
      parts.push(circle(290, 384, 34, 'flask-2'));
      parts.push(box(365, 330, 55, 88, 'beaker-3'));
      parts.push(box(75, 615, 405, 305, 'bench-l'));
      parts.push(inkPath([[220, 615], [220, 535], [265, 505]], 'microscope'));
      parts.push(box(1445, 65, 390, 195, 'board-r'));
      parts.push(circle(1640, 162, 48, 'atom-core'));
      parts.push(box(1510, 315, 340, 605, 'cabinet-r'));
      parts.push(inkPath([[1680, 315], [1680, 920]], 'cabinet-r-door'));
      break;
    case 'office':
      // Left bookcase + desk edge; right blinds window + plant + wall clock; top ceiling beam
      parts.push(inkPath([[220, 80], [1700, 80]], 'ceiling-beam'));
      parts.push(box(65, 250, 195, 670, 'bookcase'));
      for (const shelfY of [400, 560, 730]) {
        parts.push(inkPath([[65, shelfY], [260, shelfY]], `shelf-${shelfY}`));
      }
      parts.push(box(285, 635, 195, 285, 'desk-l'));
      parts.push(box(345, 580, 48, 53, 'mug-l'));
      parts.push(circle(1470, 155, 45, 'clock'));
      parts.push(inkPath([[1470, 155], [1470, 128]], 'clock-m'));
      parts.push(inkPath([[1470, 155], [1492, 155]], 'clock-h'));
      parts.push(box(1545, 190, 305, 365, 'office-win'));
      for (const blindY of [245, 300, 355]) {
        parts.push(inkPath([[1545, blindY], [1850, blindY]], `blind-${blindY}`));
      }
      parts.push(inkPath([[1465, 790], [1545, 790], [1530, 920], [1480, 920], [1465, 790]], 'pot'));
      parts.push(inkPath([[1505, 790], [1465, 685]], 'leaf-1', { smooth: 1 }));
      parts.push(inkPath([[1505, 790], [1505, 660]], 'leaf-2', { smooth: 1 }));
      parts.push(inkPath([[1505, 790], [1548, 690]], 'leaf-3', { smooth: 1 }));
      break;
    case 'outdoor':
      // Top mountain ridge (y <= 305), clouds, sun; left tree + fence; right tree/bush + fence
      parts.push(soft([[1610, 100], [1730, 100], [1730, 220], [1610, 220]], 'sun-fill', pal.soft_yellow));
      parts.push(circle(1670, 160, 52, 'sun'));
      parts.push(inkPath([[220, 175], [275, 130], [360, 135], [415, 175], [220, 175]], 'cloud-1', { smooth: 1 }));
      parts.push(inkPath([[1120, 155], [1180, 110], [1275, 115], [1335, 155], [1120, 155]], 'cloud-2', { smooth: 1 }));
      parts.push(inkPath([[60, 295], [340, 225], [640, 285], [960, 235], [1280, 290], [1580, 225], [1860, 295]], 'hills', { smooth: 1 }));
      parts.push(inkPath([[185, 580], [185, 920]], 'tree-trunk-l1', { widthRange: [6, 8] }));
      parts.push(inkPath([[225, 580], [225, 920]], 'tree-trunk-l2', { widthRange: [6, 8] }));
      parts.push(circle(205, 470, 115, 'tree-crown-l'));
      parts.push(inkPath([[340, 780], [485, 780]], 'fence-l-rail'));
      parts.push(inkPath([[370, 745], [370, 920]], 'fence-l-p1'));
      parts.push(inkPath([[450, 745], [450, 920]], 'fence-l-p2'));
      parts.push(circle(1715, 570, 125, 'tree-crown-r'));
      parts.push(inkPath([[1715, 695], [1715, 920]], 'tree-trunk-r', { widthRange: [6, 8] }));
      parts.push(inkPath([[1430, 795], [1565, 795]], 'fence-r-rail'));
      parts.push(inkPath([[1460, 755], [1460, 920]], 'fence-r-p1'));
      parts.push(inkPath([[1535, 755], [1535, 920]], 'fence-r-p2'));
      break;
    case 'workshop':
      // Top industrial lamps + beam; left pegboard + workbench; right tall cabinet + coiled hose/gear
      parts.push(inkPath([[80, 75], [1840, 75]], 'beam'));
      parts.push(inkPath([[360, 75], [360, 145]], 'lamp-l-stem'));
      parts.push(inkPath([[305, 195], [340, 145], [380, 145], [415, 195], [305, 195]], 'lamp-l-shade'));
      parts.push(inkPath([[1560, 75], [1560, 145]], 'lamp-r-stem'));
      parts.push(inkPath([[1505, 195], [1540, 145], [1580, 145], [1615, 195], [1505, 195]], 'lamp-r-shade'));
      parts.push(box(75, 250, 385, 285, 'pegboard-l'));
      parts.push(inkPath([[145, 305], [145, 455]], 'wrench-shaft'));
      parts.push(circle(145, 298, 22, 'wrench-head'));
      parts.push(inkPath([[265, 310], [265, 465]], 'hammer-shaft'));
      parts.push(box(235, 290, 65, 28, 'hammer-head'));
      parts.push(box(65, 610, 420, 26, 'bench-top'));
      parts.push(inkPath([[105, 636], [105, 920]], 'bench-leg-l'));
      parts.push(inkPath([[445, 636], [445, 920]], 'bench-leg-r'));
      parts.push(inkPath([[105, 790], [445, 790]], 'bench-cross'));
      parts.push(circle(1465, 465, 44, 'gear-r'));
      parts.push(box(1535, 285, 320, 635, 'tool-cab-r'));
      for (const drawerY of [420, 560, 710]) {
        parts.push(inkPath([[1535, drawerY], [1855, drawerY]], `drawer-${drawerY}`));
      }
      break;
  }

  const bg = parts.length ? `<g opacity="0.26">${parts.join('')}</g>` : '';
  const groundLine = `<path data-ground="${num(ground)}" opacity="0.36" d="${inkStroke([[sx(40), ground], [sx(1880), ground]], { seed: `${seed}:${sceneName}:ground`, width: [2.5, 4], wobble: 1.2, taper: 'both' }).d}" fill="${pal.ink}"/>`;
  return `<g data-scene="${sceneName}">${bg}${groundLine}</g>`;
}
