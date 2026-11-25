// 24 hand-drawn linear icons using ink.mjs (出片质量设计 §6.2, 火柴人主持人设计 §3.5).
// Pure SVG <g> without <text>, deterministic by seed.
import { circlePoints, inkStroke, markerFill, num } from './ink.mjs';

export const ICONS = [
  'browser', 'server', 'database', 'cache', 'clock', 'doc', 'user', 'phone',
  'cloud', 'lock', 'key', 'chart', 'check', 'cross', 'warn', 'bulb',
  'gear', 'network', 'folder', 'image', 'search', 'money', 'plane', 'globe',
];

const COLORS = {
  light: { ink: '#1f1f1f', teal: '#7fd1cf', yellow: '#f6c945', red: '#e05a47', accent: '#20a5a3' },
  dark: { ink: '#f2f2f2', teal: '#2e6f6e', yellow: '#d4a933', red: '#e05a47', accent: '#2ec4c1' },
};

/** Draws one of the 24 built-in icons centered at (x, y) inside a `size × size` square. */
export function drawIcon(name, { x = 0, y = 0, size = 48, theme = 'light', seed = 'icon' } = {}) {
  if (!ICONS.includes(name)) throw new Error(`unknown icon ${name}`);
  const pal = COLORS[theme] ?? COLORS.light;
  const r = size / 2;
  const w = [Math.max(3, size * 0.065), Math.max(4, size * 0.088)];
  const wob = size * 0.015;
  const pt = (u, v) => [x + u * r, y + v * r];
  const stroke = (k, pts, color = pal.ink, width = w) =>
    `<path d="${inkStroke(pts.map(([u, v]) => pt(u, v)), { seed: `${seed}:${name}:${k}`, width, wobble: wob }).d}" fill="${color}"/>`;
  const ring = (k, cx, cy, rad, color = pal.ink, width = w) =>
    `<path d="${inkStroke(circlePoints(x + cx * r, y + cy * r, rad * r, { seed: `${seed}:${name}:${k}`, overdraw: 0.25, count: 24 }), { seed: `${seed}:${name}:${k}`, width, wobble: wob }).d}" fill="${color}"/>`;
  const fill = (k, pts, color) =>
    `<path d="${markerFill(pts.map(([u, v]) => pt(u, v)), { seed: `${seed}:${name}:${k}`, shift: size * 0.02 })}" fill="${color}"/>`;
  const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const dot = (u, v, rad = 0.08, color = pal.ink) => `<circle cx="${num(x + u * r)}" cy="${num(y + v * r)}" r="${num(rad * r)}" fill="${color}"/>`;

  let body = '';
  switch (name) {
    case 'browser':
      body = fill('bar', box(-0.8, -0.7, 0.8, -0.35), pal.teal)
        + stroke('frame', box(-0.8, -0.7, 0.8, 0.7))
        + stroke('sep', [[-0.8, -0.35], [0.8, -0.35]])
        + dot(-0.55, -0.52, 0.07) + dot(-0.32, -0.52, 0.07);
      break;
    case 'server':
      body = fill('top', box(-0.7, -0.75, 0.7, -0.15), pal.teal)
        + stroke('r1', box(-0.7, -0.75, 0.7, -0.15))
        + stroke('r2', box(-0.7, 0.05, 0.7, 0.65))
        + dot(0.4, -0.45, 0.08, pal.accent) + dot(0.4, 0.35, 0.08, pal.accent);
      break;
    case 'database':
      body = fill('body', box(-0.65, -0.45, 0.65, 0.55), pal.teal)
        + stroke('top', [[-0.65, -0.45], [-0.35, -0.7], [0.35, -0.7], [0.65, -0.45], [0.35, -0.2], [-0.35, -0.2], [-0.65, -0.45]])
        + stroke('l', [[-0.65, -0.45], [-0.65, 0.5], [-0.35, 0.75], [0.35, 0.75], [0.65, 0.5], [0.65, -0.45]])
        + stroke('mid', [[-0.65, 0.05], [0, 0.25], [0.65, 0.05]]);
      break;
    case 'cache':
      body = fill('bolt', [[0.1, -0.8], [-0.45, 0.05], [0.05, 0.05], [-0.15, 0.8], [0.5, -0.1], [0.0, -0.1]], pal.yellow)
        + stroke('bolt', [[0.1, -0.8], [-0.45, 0.05], [0.05, 0.05], [-0.15, 0.8], [0.5, -0.1], [0.0, -0.1], [0.1, -0.8]]);
      break;
    case 'clock':
      body = fill('face', [[-0.6, -0.5], [0.6, -0.5], [0.6, 0.5], [-0.6, 0.5]], pal.yellow)
        + ring('rim', 0, 0, 0.76)
        + stroke('hands', [[0, -0.45], [0, 0], [0.38, 0.15]]);
      break;
    case 'doc':
      body = fill('pg', box(-0.6, -0.75, 0.6, 0.75), pal.teal)
        + stroke('pg', [[-0.6, -0.75], [0.3, -0.75], [0.6, -0.45], [0.6, 0.75], [-0.6, 0.75], [-0.6, -0.75]])
        + stroke('l1', [[-0.32, -0.15], [0.32, -0.15]])
        + stroke('l2', [[-0.32, 0.18], [0.32, 0.18]])
        + stroke('l3', [[-0.32, 0.48], [0.1, 0.48]]);
      break;
    case 'user':
      body = ring('head', 0, -0.35, 0.32)
        + stroke('body', [[-0.65, 0.75], [-0.5, 0.28], [0, 0.15], [0.5, 0.28], [0.65, 0.75]]);
      break;
    case 'phone':
      body = fill('scr', box(-0.38, -0.55, 0.38, 0.45), pal.teal)
        + stroke('body', box(-0.46, -0.78, 0.46, 0.78))
        + dot(0, 0.62, 0.07);
      break;
    case 'cloud':
      body = fill('c', [[-0.65, 0.4], [-0.7, 0.0], [-0.3, -0.35], [0.25, -0.4], [0.7, 0.0], [0.65, 0.4]], pal.teal)
        + stroke('c', [[-0.65, 0.45], [-0.78, 0.2], [-0.68, -0.15], [-0.35, -0.25], [-0.15, -0.55], [0.25, -0.5], [0.42, -0.15], [0.75, 0.05], [0.7, 0.45], [-0.65, 0.45]]);
      break;
    case 'lock':
      body = fill('box', box(-0.6, -0.1, 0.6, 0.75), pal.yellow)
        + stroke('box', box(-0.6, -0.1, 0.6, 0.75))
        + stroke('shackle', [[-0.35, -0.1], [-0.35, -0.55], [0, -0.75], [0.35, -0.55], [0.35, -0.1]])
        + dot(0, 0.32, 0.1);
      break;
    case 'key':
      body = ring('bow', -0.42, 0, 0.32)
        + stroke('blade', [[-0.1, 0], [0.78, 0]])
        + stroke('t1', [[0.45, 0], [0.45, 0.28]])
        + stroke('t2', [[0.72, 0], [0.72, 0.25]]);
      break;
    case 'chart':
      body = fill('b1', box(-0.55, 0.15, -0.25, 0.65), pal.teal)
        + fill('b2', box(-0.1, -0.2, 0.2, 0.65), pal.yellow)
        + fill('b3', box(0.35, -0.55, 0.65, 0.65), pal.red)
        + stroke('axes', [[-0.75, -0.7], [-0.75, 0.68], [0.78, 0.68]])
        + stroke('line', [[-0.4, 0.1], [0.05, -0.25], [0.5, -0.6]]);
      break;
    case 'check':
      body = ring('c', 0, 0, 0.76, pal.accent)
        + stroke('tick', [[-0.4, 0.05], [-0.1, 0.38], [0.48, -0.35]], pal.accent);
      break;
    case 'cross':
      body = stroke('a', [[-0.55, -0.55], [0.55, 0.55]], pal.red)
        + stroke('b', [[0.55, -0.55], [-0.55, 0.55]], pal.red);
      break;
    case 'warn':
      body = fill('tri', [[0, -0.75], [0.78, 0.65], [-0.78, 0.65]], pal.yellow)
        + stroke('tri', [[0, -0.75], [0.78, 0.65], [-0.78, 0.65], [0, -0.75]])
        + stroke('bar', [[0, -0.28], [0, 0.18]])
        + dot(0, 0.44, 0.08);
      break;
    case 'bulb':
      body = fill('g', [[-0.45, -0.45], [0.45, -0.45], [0.35, 0.25], [-0.35, 0.25]], pal.yellow)
        + ring('g', 0, -0.2, 0.5)
        + stroke('base', [[-0.25, 0.35], [0.25, 0.35], [0.2, 0.7], [-0.2, 0.7], [-0.25, 0.35]]);
      break;
    case 'gear':
      body = ring('out', 0, 0, 0.62) + ring('in', 0, 0, 0.24)
        + [0, 60, 120, 180, 240, 300].map((d, i) => {
          const rad = (d * Math.PI) / 180;
          return stroke(`t${i}`, [[0.58 * Math.cos(rad), 0.58 * Math.sin(rad)], [0.84 * Math.cos(rad), 0.84 * Math.sin(rad)]]);
        }).join('');
      break;
    case 'network':
      body = stroke('l1', [[0, -0.55], [-0.6, 0.45]])
        + stroke('l2', [[0, -0.55], [0.6, 0.45]])
        + stroke('l3', [[-0.6, 0.45], [0.6, 0.45]])
        + dot(0, -0.55, 0.18, pal.accent) + dot(-0.6, 0.45, 0.18, pal.ink) + dot(0.6, 0.45, 0.18, pal.ink);
      break;
    case 'folder':
      body = fill('f', box(-0.75, -0.3, 0.75, 0.65), pal.yellow)
        + stroke('f', [[-0.75, -0.6], [-0.15, -0.6], [0.05, -0.35], [0.75, -0.35], [0.75, 0.65], [-0.75, 0.65], [-0.75, -0.6]]);
      break;
    case 'image':
      body = fill('sky', box(-0.75, -0.6, 0.75, 0.6), pal.teal)
        + stroke('frame', box(-0.75, -0.6, 0.75, 0.6))
        + stroke('mtn', [[-0.7, 0.55], [-0.18, -0.08], [0.15, 0.3], [0.42, 0.05], [0.7, 0.55]])
        + dot(0.35, -0.28, 0.12, pal.yellow);
      break;
    case 'search':
      body = fill('lens', [[-0.5, -0.5], [0.25, -0.5], [0.25, 0.25], [-0.5, 0.25]], pal.teal)
        + ring('lens', -0.15, -0.15, 0.48)
        + stroke('handle', [[0.2, 0.2], [0.75, 0.75]]);
      break;
    case 'money':
      body = fill('coin', [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]], pal.yellow)
        + ring('coin', 0, 0, 0.74)
        + stroke('y1', [[-0.28, -0.35], [0, -0.02], [0.28, -0.35]])
        + stroke('y2', [[0, -0.02], [0, 0.45]])
        + stroke('b1', [[-0.28, 0.1], [0.28, 0.1]])
        + stroke('b2', [[-0.28, 0.28], [0.28, 0.28]]);
      break;
    case 'plane':
      body = fill('p', [[-0.75, 0.05], [0.78, -0.55], [0.15, 0.68], [-0.15, 0.18]], pal.teal)
        + stroke('p', [[-0.75, 0.05], [0.78, -0.55], [0.15, 0.68], [-0.15, 0.18], [-0.75, 0.05]])
        + stroke('fold', [[-0.15, 0.18], [0.78, -0.55]]);
      break;
    case 'globe':
      body = fill('g', [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]], pal.teal)
        + ring('g', 0, 0, 0.75)
        + stroke('eq', [[-0.74, 0], [0.74, 0]])
        + stroke('m1', [[0, -0.74], [-0.32, 0], [0, 0.74]])
        + stroke('m2', [[0, -0.74], [0.32, 0], [0, 0.74]]);
      break;
  }
  return `<g data-icon="${name}">${body}</g>`;
}
