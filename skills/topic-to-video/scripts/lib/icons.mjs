// 60 built-in hand-drawn props with metadata, exclusive/common states, and whitelisted custom props.
// Pure SVG <g> without <text>, deterministic by seed, styled via world.mjs palettes.
import { clamp01, easeOutBack, lerp } from './ease.mjs';
import { circlePoints, inkStroke, markerFill, num, random } from './ink.mjs';
import { resolveStyle } from './world.mjs';

export const ICONS = [
  // Original 24 (order preserved for backward compatibility)
  'browser', 'server', 'database', 'cache', 'clock', 'doc', 'user', 'phone',
  'cloud', 'lock', 'key', 'chart', 'check', 'cross', 'warn', 'bulb',
  'gear', 'network', 'folder', 'image', 'search', 'money', 'plane', 'globe',
  // 家居厨房 (8)
  'fridge', 'cup', 'pot', 'table', 'chair', 'door', 'window', 'trash',
  // 商店街道 (6)
  'shop', 'cart', 'box', 'wallet', 'piggybank', 'house',
  // 交通物理 (6)
  'car', 'truck', 'rocket', 'battery', 'magnet', 'scale',
  // 科学教育 (6)
  'beaker', 'microscope', 'book', 'whiteboard', 'brain', 'heart',
  // 办公信息 (6)
  'laptop', 'mail', 'megaphone', 'calendar', 'stamp', 'clipboard',
  // 小件与符号 (4)
  'package', 'ticket', 'shield', 'hourglass',
];

const ORIGINAL_24 = new Set(ICONS.slice(0, 24));

export const COMMON_STATES = ['normal', 'active', 'dim', 'crossed', 'stamped', 'broken'];

export function isCountState(state) {
  return typeof state === 'string' && /^count:.{1,4}$/.test(state);
}

const ALLOWED_FILLS = new Set([
  'none', 'paper', 'grid', 'ink', 'muted', 'card',
  'accent', 'yellow', 'red', 'soft_accent', 'soft_yellow', 'soft_red',
]);

const CUSTOM_DEF_KEYS = new Set(['id', 'label', 'height', 'layer', 'parts']);
const PART_KEYS = {
  rect: new Set(['shape', 'x', 'y', 'w', 'h', 'fill']),
  circle: new Set(['shape', 'cx', 'cy', 'r', 'fill']),
  line: new Set(['shape', 'points', 'fill']),
  poly: new Set(['shape', 'points', 'fill']),
};

export const PROP_META = {
  // Original 24
  browser:    { height: 0.55, aspect: 1.20, layer: 'mid',    anchors: { handle: [0.10, 0.50], top: [0.50, 0.08], front: [0.50, 0.55] }, states: ['lit', 'off'], carry: false },
  server:     { height: 0.78, aspect: 0.78, layer: 'ground', anchors: { handle: [0.15, 0.50], top: [0.50, 0.06], front: [0.50, 0.50] }, states: ['lit', 'off', 'full', 'empty'], carry: false },
  database:   { height: 0.62, aspect: 0.85, layer: 'ground', anchors: { handle: [0.15, 0.50], top: [0.50, 0.08], front: [0.50, 0.50] }, states: ['full', 'empty'], carry: false },
  cache:      { height: 0.35, aspect: 0.85, layer: 'mid',    anchors: { handle: [0.20, 0.50], top: [0.50, 0.08], front: [0.50, 0.50] }, states: ['lit', 'off'], carry: true },
  clock:      { height: 0.36, aspect: 1.00, layer: 'mid',    anchors: { handle: [0.15, 0.50], top: [0.50, 0.08], front: [0.50, 0.50] }, states: [], carry: true },
  doc:        { height: 0.32, aspect: 0.82, layer: 'mid',    anchors: { handle: [0.16, 0.50], top: [0.50, 0.08], front: [0.50, 0.50] }, states: ['fresh', 'expired'], carry: true },
  user:       { height: 0.88, aspect: 0.72, layer: 'ground', anchors: { handle: [0.20, 0.50], top: [0.50, 0.10], front: [0.50, 0.50] }, states: [], carry: false },
  phone:      { height: 0.28, aspect: 0.62, layer: 'mid',    anchors: { handle: [0.18, 0.55], top: [0.50, 0.08], front: [0.50, 0.50] }, states: ['lit', 'off'], carry: true },
  cloud:      { height: 0.45, aspect: 1.45, layer: 'air',    anchors: { handle: [0.15, 0.60], top: [0.50, 0.18], front: [0.50, 0.55] }, states: [], carry: false },
  lock:       { height: 0.30, aspect: 0.85, layer: 'mid',    anchors: { handle: [0.50, 0.25], top: [0.50, 0.08], front: [0.50, 0.62] }, states: ['locked', 'unlocked'], carry: true },
  key:        { height: 0.20, aspect: 1.50, layer: 'mid',    anchors: { handle: [0.22, 0.50], top: [0.50, 0.22], front: [0.50, 0.50] }, states: [], carry: true },
  chart:      { height: 0.50, aspect: 1.15, layer: 'mid',    anchors: { handle: [0.15, 0.50], top: [0.50, 0.10], front: [0.50, 0.50] }, states: [], carry: false },
  check:      { height: 0.32, aspect: 1.00, layer: 'mid',    anchors: { handle: [0.15, 0.50], top: [0.50, 0.10], front: [0.50, 0.50] }, states: [], carry: true },
  cross:      { height: 0.32, aspect: 1.00, layer: 'mid',    anchors: { handle: [0.15, 0.50], top: [0.50, 0.10], front: [0.50, 0.50] }, states: [], carry: true },
  warn:       { height: 0.36, aspect: 1.05, layer: 'mid',    anchors: { handle: [0.20, 0.60], top: [0.50, 0.10], front: [0.50, 0.55] }, states: [], carry: true },
  bulb:       { height: 0.30, aspect: 0.78, layer: 'mid',    anchors: { handle: [0.50, 0.82], top: [0.50, 0.08], front: [0.50, 0.45] }, states: ['lit', 'off'], carry: true },
  gear:       { height: 0.38, aspect: 1.00, layer: 'mid',    anchors: { handle: [0.20, 0.50], top: [0.50, 0.08], front: [0.50, 0.50] }, states: [], carry: true },
  network:    { height: 0.45, aspect: 1.15, layer: 'air',    anchors: { handle: [0.20, 0.60], top: [0.50, 0.12], front: [0.50, 0.50] }, states: [], carry: false },
  folder:     { height: 0.32, aspect: 1.20, layer: 'mid',    anchors: { handle: [0.16, 0.50], top: [0.50, 0.14], front: [0.50, 0.55] }, states: ['open', 'closed', 'locked', 'unlocked'], carry: true },
  image:      { height: 0.42, aspect: 1.25, layer: 'mid',    anchors: { handle: [0.14, 0.50], top: [0.50, 0.10], front: [0.50, 0.50] }, states: [], carry: true },
  search:     { height: 0.34, aspect: 1.00, layer: 'mid',    anchors: { handle: [0.75, 0.75], top: [0.42, 0.10], front: [0.42, 0.42] }, states: [], carry: true },
  money:      { height: 0.26, aspect: 1.00, layer: 'mid',    anchors: { handle: [0.20, 0.50], top: [0.50, 0.10], front: [0.50, 0.50] }, states: [], carry: true },
  plane:      { height: 0.34, aspect: 1.35, layer: 'air',    anchors: { handle: [0.35, 0.55], top: [0.50, 0.16], front: [0.50, 0.50] }, states: [], carry: true },
  globe:      { height: 0.42, aspect: 1.00, layer: 'mid',    anchors: { handle: [0.15, 0.50], top: [0.50, 0.08], front: [0.50, 0.50] }, states: [], carry: true },
  // 家居厨房 (8)
  fridge:     { height: 1.08, aspect: 0.55, layer: 'ground', anchors: { handle: [0.78, 0.50], top: [0.50, 0.03], front: [0.50, 0.50] }, states: ['open', 'closed', 'full', 'empty', 'fresh', 'expired'], carry: false },
  cup:        { height: 0.15, aspect: 0.90, layer: 'mid',    anchors: { handle: [0.88, 0.56], top: [0.45, 0.16], front: [0.44, 0.58] }, states: ['full', 'empty'], carry: true },
  pot:        { height: 0.25, aspect: 1.35, layer: 'mid',    anchors: { handle: [0.10, 0.52], top: [0.50, 0.12], front: [0.50, 0.60] }, states: ['open', 'closed', 'full', 'empty'], carry: true },
  table:      { height: 0.55, aspect: 1.60, layer: 'ground', anchors: { handle: [0.12, 0.14], top: [0.50, 0.04], front: [0.50, 0.32], seat: [0.50, 0.04] }, states: [], carry: false },
  chair:      { height: 0.50, aspect: 0.72, layer: 'ground', anchors: { handle: [0.22, 0.25], top: [0.30, 0.05], front: [0.50, 0.55], seat: [0.54, 0.52] }, states: [], carry: false },
  door:       { height: 1.15, aspect: 0.55, layer: 'ground', anchors: { handle: [0.76, 0.54], top: [0.50, 0.03], front: [0.50, 0.50] }, states: ['open', 'closed', 'locked', 'unlocked'], carry: false },
  window:     { height: 0.52, aspect: 1.10, layer: 'air',    anchors: { handle: [0.50, 0.64], top: [0.50, 0.05], front: [0.50, 0.50] }, states: ['open', 'closed'], carry: false },
  trash:      { height: 0.44, aspect: 0.75, layer: 'ground', anchors: { handle: [0.50, 0.14], top: [0.50, 0.08], front: [0.50, 0.58] }, states: ['open', 'closed', 'full', 'empty'], carry: false },
  // 商店街道 (6)
  shop:       { height: 1.25, aspect: 1.15, layer: 'ground', anchors: { handle: [0.72, 0.68], top: [0.50, 0.06], front: [0.50, 0.60] }, states: ['open', 'closed'], carry: false },
  cart:       { height: 0.55, aspect: 1.20, layer: 'ground', anchors: { handle: [0.12, 0.24], top: [0.55, 0.24], front: [0.55, 0.50] }, states: ['full', 'empty'], carry: false },
  box:        { height: 0.42, aspect: 1.00, layer: 'ground', anchors: { handle: [0.15, 0.52], top: [0.50, 0.06], front: [0.50, 0.55], seat: [0.50, 0.08] }, states: ['open', 'closed', 'full', 'empty'], carry: true },
  wallet:     { height: 0.22, aspect: 1.35, layer: 'mid',    anchors: { handle: [0.86, 0.50], top: [0.50, 0.12], front: [0.50, 0.55] }, states: ['open', 'closed', 'full', 'empty'], carry: true },
  piggybank:  { height: 0.34, aspect: 1.25, layer: 'mid',    anchors: { handle: [0.50, 0.16], top: [0.50, 0.16], front: [0.50, 0.56] }, states: ['full', 'empty'], carry: true },
  house:      { height: 1.25, aspect: 1.10, layer: 'ground', anchors: { handle: [0.58, 0.72], top: [0.50, 0.05], front: [0.50, 0.64] }, states: [], carry: false },
  // 交通物理 (6)
  car:        { height: 0.58, aspect: 2.20, layer: 'ground', anchors: { handle: [0.55, 0.58], top: [0.48, 0.12], front: [0.50, 0.58] }, states: [], carry: false },
  truck:      { height: 0.78, aspect: 1.90, layer: 'ground', anchors: { handle: [0.22, 0.58], top: [0.45, 0.08], front: [0.50, 0.52] }, states: ['full', 'empty'], carry: false },
  rocket:     { height: 1.05, aspect: 0.60, layer: 'ground', anchors: { handle: [0.28, 0.56], top: [0.50, 0.03], front: [0.50, 0.46] }, states: ['lit', 'off'], carry: false },
  battery:    { height: 0.36, aspect: 0.68, layer: 'mid',    anchors: { handle: [0.20, 0.50], top: [0.50, 0.05], front: [0.50, 0.55] }, states: ['full', 'empty'], carry: true },
  magnet:     { height: 0.32, aspect: 0.95, layer: 'mid',    anchors: { handle: [0.50, 0.78], top: [0.50, 0.14], front: [0.50, 0.54] }, states: [], carry: true },
  scale:      { height: 0.46, aspect: 1.25, layer: 'ground', anchors: { handle: [0.50, 0.22], top: [0.50, 0.10], front: [0.50, 0.54] }, states: [], carry: false },
  // 科学教育 (6)
  beaker:     { height: 0.30, aspect: 0.85, layer: 'mid',    anchors: { handle: [0.80, 0.50], top: [0.50, 0.08], front: [0.50, 0.58] }, states: ['full', 'empty'], carry: true },
  microscope: { height: 0.44, aspect: 0.78, layer: 'mid',    anchors: { handle: [0.28, 0.48], top: [0.52, 0.06], front: [0.50, 0.54] }, states: [], carry: true },
  book:       { height: 0.24, aspect: 1.20, layer: 'mid',    anchors: { handle: [0.15, 0.50], top: [0.50, 0.10], front: [0.50, 0.50] }, states: ['open', 'closed'], carry: true },
  whiteboard: { height: 0.98, aspect: 1.35, layer: 'ground', anchors: { handle: [0.12, 0.45], top: [0.50, 0.04], front: [0.50, 0.38] }, states: [], carry: false },
  brain:      { height: 0.32, aspect: 1.20, layer: 'mid',    anchors: { handle: [0.20, 0.50], top: [0.50, 0.10], front: [0.50, 0.50] }, states: [], carry: true },
  heart:      { height: 0.28, aspect: 1.10, layer: 'mid',    anchors: { handle: [0.20, 0.45], top: [0.50, 0.14], front: [0.50, 0.50] }, states: [], carry: true },
  // 办公信息 (6)
  laptop:     { height: 0.32, aspect: 1.35, layer: 'mid',    anchors: { handle: [0.50, 0.78], top: [0.50, 0.12], front: [0.50, 0.48] }, states: ['open', 'closed', 'lit', 'off'], carry: true },
  mail:       { height: 0.24, aspect: 1.40, layer: 'mid',    anchors: { handle: [0.50, 0.45], top: [0.50, 0.12], front: [0.50, 0.55] }, states: ['open', 'closed'], carry: true },
  megaphone:  { height: 0.30, aspect: 1.25, layer: 'mid',    anchors: { handle: [0.35, 0.78], top: [0.50, 0.16], front: [0.50, 0.46] }, states: [], carry: true },
  calendar:   { height: 0.36, aspect: 1.00, layer: 'mid',    anchors: { handle: [0.15, 0.50], top: [0.50, 0.08], front: [0.50, 0.55] }, states: [], carry: true },
  stamp:      { height: 0.26, aspect: 0.90, layer: 'mid',    anchors: { handle: [0.50, 0.18], top: [0.50, 0.06], front: [0.50, 0.64] }, states: [], carry: true },
  clipboard:  { height: 0.36, aspect: 0.78, layer: 'mid',    anchors: { handle: [0.18, 0.50], top: [0.50, 0.06], front: [0.50, 0.55] }, states: [], carry: true },
  // 小件与符号 (4)
  package:    { height: 0.28, aspect: 1.10, layer: 'mid',    anchors: { handle: [0.15, 0.50], top: [0.50, 0.08], front: [0.50, 0.55] }, states: ['fresh', 'expired'], carry: true },
  ticket:     { height: 0.22, aspect: 1.65, layer: 'mid',    anchors: { handle: [0.15, 0.50], top: [0.50, 0.12], front: [0.50, 0.50] }, states: ['fresh', 'expired'], carry: true },
  shield:     { height: 0.38, aspect: 0.85, layer: 'mid',    anchors: { handle: [0.20, 0.45], top: [0.50, 0.06], front: [0.50, 0.45] }, states: ['locked', 'unlocked'], carry: true },
  hourglass:  { height: 0.34, aspect: 0.72, layer: 'mid',    anchors: { handle: [0.20, 0.50], top: [0.50, 0.06], front: [0.50, 0.50] }, states: ['full', 'empty', 'fresh', 'expired'], carry: true },
};

const LEGACY_COLORS = {
  light: { ink: '#1f1f1f', teal: '#7fd1cf', yellow: '#f6c945', red: '#e05a47', accent: '#20a5a3', soft_accent: '#d7f0ef', soft_yellow: '#fdf1c8', soft_red: '#fadcd7', card: '#ffffff', muted: '#575757', paper: '#fbfaf6' },
  dark:  { ink: '#f2f2f2', teal: '#2e6f6e', yellow: '#d4a933', red: '#e05a47', accent: '#2ec4c1', soft_accent: '#1e3c3c', soft_yellow: '#3b341c', soft_red: '#3d2421', card: '#222630', muted: '#adb5c2', paper: '#181b22' },
};

const EXCLUSIVE_STATES = new Set(['open', 'closed', 'full', 'empty', 'locked', 'unlocked', 'fresh', 'expired', 'lit', 'off']);

const escAttr = (s) => String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
const clampCoord = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
};

export function propSupportsState(propId, state, customProps = []) {
  if (typeof propId !== 'string' || typeof state !== 'string') return false;
  const builtin = Object.hasOwn(PROP_META, propId) ? PROP_META[propId] : null;
  if (builtin) {
    return COMMON_STATES.includes(state) || isCountState(state) || builtin.states.includes(state);
  }
  const custom = Array.isArray(customProps) ? customProps.find((p) => p?.id === propId) : null;
  if (custom) {
    return COMMON_STATES.includes(state) || isCountState(state);
  }
  return false;
}

function resolvePalette(style, theme) {
  if (style !== undefined && style !== null) {
    const { palette } = resolveStyle(style);
    return { ...palette, teal: palette.soft_accent };
  }
  return typeof theme === 'string' && Object.hasOwn(LEGACY_COLORS, theme) ? LEGACY_COLORS[theme] : LEGACY_COLORS.light;
}

function computeStrokeParams(boxW, boxH, isCompact) {
  if (isCompact) {
    const s = Math.min(boxW, boxH);
    const w = [Math.max(3, s * 0.065), Math.max(4, s * 0.088)];
    return { w, wDetail: w, wob: s * 0.015 };
  }
  const minDim = Math.min(boxW, boxH);
  const thin = Math.max(4.4, Math.min(6.8, 3.8 + minDim * 0.012));
  const thick = Math.max(5.5, Math.min(9.0, thin * 1.32));
  const dThin = Math.max(4.4, thin * 0.86);
  const dThick = Math.max(5.2, thick * 0.86);
  return {
    w: [thin, thick],
    wDetail: [dThin, dThick],
    wob: Math.max(0.8, Math.min(2.6, minDim * 0.014)),
  };
}

function makeCtx({ x, y, rx, ry, pal, prefix, w, wDetail, wob }) {
  const pt = (u, v) => [x + u * rx, y + v * ry];
  const minR = Math.min(rx, ry);
  const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const stroke = (k, pts, color = pal.ink, width = w, extra = {}) =>
    `<path d="${inkStroke(pts.map(([u, v]) => pt(u, v)), { seed: `${prefix}:${k}`, width, wobble: wob, ...extra }).d}" fill="${color}"/>`;
  const dStroke = (k, pts, color = pal.ink, extra = {}) => stroke(k, pts, color, wDetail, extra);
  const smooth = (k, pts, color = pal.ink, width = w) => stroke(k, pts, color, width, { smooth: 1 });
  const ring = (k, cx, cy, rad, color = pal.ink, width = w, overdraw = 0.25) =>
    `<path d="${inkStroke(circlePoints(x + cx * rx, y + cy * ry, rad * minR, { seed: `${prefix}:${k}`, overdraw, count: 24 }), { seed: `${prefix}:${k}`, width, wobble: wob }).d}" fill="${color}"/>`;
  const ellipsePts = (cx, cy, rux, ruy, seedKey, overdraw = 0.25, count = 24) => {
    const start = overdraw === 0 ? 0 : random(`${prefix}:${seedKey}`)() * 2 * Math.PI;
    return Array.from({ length: count + 1 }, (_, i) => {
      const a = start + ((2 * Math.PI + overdraw) * i) / count;
      return [cx + rux * Math.cos(a), cy + ruy * Math.sin(a)];
    });
  };
  const ellipse = (k, cx, cy, rux, ruy, color = pal.ink, width = w, overdraw = 0.25) =>
    stroke(k, ellipsePts(cx, cy, rux, ruy, k, overdraw, 24), color, width);
  const fill = (k, pts, color) =>
    `<path d="${markerFill(pts.map(([u, v]) => pt(u, v)), { seed: `${prefix}:${k}`, shift: minR * 0.04 })}" fill="${color}"/>`;
  const fillRing = (k, cx, cy, rad, color) => {
    const pts = circlePoints(x + cx * rx, y + cy * ry, rad * minR, { seed: `${prefix}:${k}`, overdraw: 0, count: 20 });
    return `<path d="${markerFill(pts, { seed: `${prefix}:${k}:f`, shift: minR * 0.03 })}" fill="${color}"/>`;
  };
  const fillEllipse = (k, cx, cy, rux, ruy, color) =>
    fill(k, ellipsePts(cx, cy, rux, ruy, k, 0, 20).slice(0, 20), color);
  const dot = (u, v, rad = 0.08, color = pal.ink) =>
    `<circle cx="${num(x + u * rx)}" cy="${num(y + v * ry)}" r="${num(rad * minR)}" fill="${color}"/>`;
  const sparkle = (k, cx, cy, s = 0.16, color = pal.yellow) =>
    dStroke(`${k}h`, [[cx - s, cy], [cx + s, cy]], color)
    + dStroke(`${k}v`, [[cx, cy - s], [cx, cy + s]], color);
  const expiredBadge = (k, cx = 0.62, cy = 0.62) => {
    const br = 0.26;
    return fillRing(`${k}bg`, cx, cy, br, pal.soft_red)
      + ring(`${k}rim`, cx, cy, br, pal.red, wDetail)
      + dStroke(`${k}hand`, [[cx, cy - br * 0.55], [cx, cy], [cx + br * 0.45, cy + br * 0.15]], pal.red);
  };
  const miniPadlock = (k, cx, cy, unlocked = false) => {
    const sh = unlocked ? [[-0.08, -0.04], [-0.08, -0.18], [0.02, -0.24], [0.1, -0.16]] : [[-0.07, -0.02], [-0.07, -0.15], [0, -0.2], [0.07, -0.15], [0.07, -0.02]];
    return fill(`${k}b`, box(cx - 0.12, cy - 0.02, cx + 0.12, cy + 0.18), unlocked ? pal.soft_accent : pal.yellow)
      + dStroke(`${k}b`, box(cx - 0.12, cy - 0.02, cx + 0.12, cy + 0.18))
      + dStroke(`${k}s`, sh.map(([du, dv]) => [cx + du, cy + dv]));
  };
  return { pt, rx, ry, minR, wDetail, box, stroke, dStroke, smooth, ring, ellipse, fill, fillRing, fillEllipse, dot, sparkle, expiredBadge, miniPadlock };
}

function drawOriginal24(name, c, pal, state) {
  const { box, stroke, dStroke, ring, fill, fillRing, dot, sparkle, expiredBadge, miniPadlock } = c;
  switch (name) {
    case 'browser': {
      const barFill = state === 'lit' ? pal.yellow : state === 'off' ? pal.muted : pal.teal;
      let out = fill('bar', box(-0.8, -0.7, 0.8, -0.35), barFill);
      if (state === 'lit') out += fill('scr', box(-0.8, -0.35, 0.8, 0.7), pal.soft_yellow);
      out += stroke('frame', box(-0.8, -0.7, 0.8, 0.7))
        + stroke('sep', [[-0.8, -0.35], [0.8, -0.35]])
        + dot(-0.55, -0.52, 0.07) + dot(-0.32, -0.52, 0.07);
      if (state === 'lit') out += dStroke('hi', [[-0.45, 0.1], [0.45, 0.1]], pal.accent) + sparkle('sp', 0.65, -0.55, 0.14);
      if (state === 'off') out += dStroke('off', [[-0.3, 0.05], [0.3, 0.35]], pal.muted);
      return out;
    }
    case 'server': {
      const topFill = state === 'off' ? pal.muted : state === 'full' ? pal.yellow : pal.teal;
      const ledColor = state === 'off' ? pal.muted : state === 'lit' ? pal.yellow : pal.accent;
      let out = fill('top', box(-0.7, -0.75, 0.7, -0.15), topFill);
      if (state === 'full' || state === 'lit') out += fill('bot', box(-0.7, 0.05, 0.7, 0.65), state === 'lit' ? pal.soft_accent : pal.teal);
      out += stroke('r1', box(-0.7, -0.75, 0.7, -0.15))
        + stroke('r2', box(-0.7, 0.05, 0.7, 0.65))
        + dot(0.4, -0.45, 0.08, ledColor) + dot(0.4, 0.35, 0.08, ledColor);
      if (state === 'full') {
        out += dStroke('b1', [[-0.45, -0.45], [0.1, -0.45]]) + dStroke('b2', [[-0.45, 0.35], [0.1, 0.35]]);
      } else if (state === 'empty') {
        out += dStroke('e1', [[-0.4, -0.45], [-0.1, -0.45]], pal.muted);
      } else if (state === 'lit') {
        out += sparkle('sp', 0.6, -0.58, 0.14);
      }
      return out;
    }
    case 'database': {
      let out = state === 'empty' ? '' : fill('body', box(-0.65, -0.45, 0.65, 0.55), state === 'full' ? pal.yellow : pal.teal);
      out += stroke('top', [[-0.65, -0.45], [-0.35, -0.7], [0.35, -0.7], [0.65, -0.45], [0.35, -0.2], [-0.35, -0.2], [-0.65, -0.45]])
        + stroke('l', [[-0.65, -0.45], [-0.65, 0.5], [-0.35, 0.75], [0.35, 0.75], [0.65, 0.5], [0.65, -0.45]])
        + stroke('mid', [[-0.65, 0.05], [0, 0.25], [0.65, 0.05]]);
      if (state === 'full') out += dStroke('lvl', [[-0.45, 0.38], [0, 0.52], [0.45, 0.38]], pal.accent);
      return out;
    }
    case 'cache': {
      const boltFill = state === 'off' ? pal.muted : pal.yellow;
      let out = state === 'off' ? '' : fill('bolt', [[0.1, -0.8], [-0.45, 0.05], [0.05, 0.05], [-0.15, 0.8], [0.5, -0.1], [0.0, -0.1]], boltFill);
      out += stroke('bolt', [[0.1, -0.8], [-0.45, 0.05], [0.05, 0.05], [-0.15, 0.8], [0.5, -0.1], [0.0, -0.1], [0.1, -0.8]], state === 'off' ? pal.muted : pal.ink);
      if (state === 'lit') out += sparkle('sp1', -0.58, -0.45, 0.14) + sparkle('sp2', 0.62, 0.45, 0.14);
      return out;
    }
    case 'clock':
      return fill('face', [[-0.6, -0.5], [0.6, -0.5], [0.6, 0.5], [-0.6, 0.5]], pal.yellow)
        + ring('rim', 0, 0, 0.76)
        + stroke('hands', [[0, -0.45], [0, 0], [0.38, 0.15]]);
    case 'doc': {
      const docFill = state === 'expired' ? pal.soft_red : pal.teal;
      let out = fill('pg', box(-0.6, -0.75, 0.6, 0.75), docFill)
        + stroke('pg', [[-0.6, -0.75], [0.3, -0.75], [0.6, -0.45], [0.6, 0.75], [-0.6, 0.75], [-0.6, -0.75]])
        + stroke('l1', [[-0.32, -0.15], [0.32, -0.15]])
        + stroke('l2', [[-0.32, 0.18], [0.32, 0.18]])
        + stroke('l3', [[-0.32, 0.48], [0.1, 0.48]]);
      if (state === 'fresh') out += sparkle('sp', 0.48, -0.62, 0.15);
      if (state === 'expired') out += expiredBadge('exp', 0.48, 0.52);
      return out;
    }
    case 'user':
      return ring('head', 0, -0.35, 0.32)
        + stroke('body', [[-0.65, 0.75], [-0.5, 0.28], [0, 0.15], [0.5, 0.28], [0.65, 0.75]]);
    case 'phone': {
      let out = state === 'off'
        ? fill('scr', box(-0.38, -0.55, 0.38, 0.45), pal.muted)
        : fill('scr', box(-0.38, -0.55, 0.38, 0.45), state === 'lit' ? pal.yellow : pal.teal);
      out += stroke('body', box(-0.46, -0.78, 0.46, 0.78)) + dot(0, 0.62, 0.07);
      if (state === 'lit') out += dStroke('w1', [[0.58, -0.45], [0.74, -0.2], [0.58, 0.05]], pal.accent);
      if (state === 'off') out += dStroke('off', [[-0.2, -0.1], [0.2, -0.1]]);
      return out;
    }
    case 'cloud':
      return fill('c', [[-0.65, 0.4], [-0.7, 0.0], [-0.3, -0.35], [0.25, -0.4], [0.7, 0.0], [0.65, 0.4]], pal.teal)
        + stroke('c', [[-0.65, 0.45], [-0.78, 0.2], [-0.68, -0.15], [-0.35, -0.25], [-0.15, -0.55], [0.25, -0.5], [0.42, -0.15], [0.75, 0.05], [0.7, 0.45], [-0.65, 0.45]]);
    case 'lock': {
      const shackle = state === 'unlocked'
        ? [[-0.35, -0.1], [-0.35, -0.68], [0, -0.88], [0.35, -0.68], [0.35, -0.46]]
        : [[-0.35, -0.1], [-0.35, -0.55], [0, -0.75], [0.35, -0.55], [0.35, -0.1]];
      return fill('box', box(-0.6, -0.1, 0.6, 0.75), state === 'unlocked' ? pal.soft_accent : pal.yellow)
        + stroke('box', box(-0.6, -0.1, 0.6, 0.75))
        + stroke('shackle', shackle)
        + dot(0, 0.32, 0.1);
    }
    case 'key':
      return ring('bow', -0.42, 0, 0.32)
        + stroke('blade', [[-0.1, 0], [0.78, 0]])
        + stroke('t1', [[0.45, 0], [0.45, 0.28]])
        + stroke('t2', [[0.72, 0], [0.72, 0.25]]);
    case 'chart':
      return fill('b1', box(-0.55, 0.15, -0.25, 0.65), pal.teal)
        + fill('b2', box(-0.1, -0.2, 0.2, 0.65), pal.yellow)
        + fill('b3', box(0.35, -0.55, 0.65, 0.65), pal.red)
        + stroke('axes', [[-0.75, -0.7], [-0.75, 0.68], [0.78, 0.68]])
        + stroke('line', [[-0.4, 0.1], [0.05, -0.25], [0.5, -0.6]]);
    case 'check':
      return ring('c', 0, 0, 0.76, pal.accent)
        + stroke('tick', [[-0.4, 0.05], [-0.1, 0.38], [0.48, -0.35]], pal.accent);
    case 'cross':
      return stroke('a', [[-0.55, -0.55], [0.55, 0.55]], pal.red)
        + stroke('b', [[0.55, -0.55], [-0.55, 0.55]], pal.red);
    case 'warn':
      return fill('tri', [[0, -0.75], [0.78, 0.65], [-0.78, 0.65]], pal.yellow)
        + stroke('tri', [[0, -0.75], [0.78, 0.65], [-0.78, 0.65], [0, -0.75]])
        + stroke('bar', [[0, -0.28], [0, 0.18]])
        + dot(0, 0.44, 0.08);
    case 'bulb': {
      let out = '';
      if (state !== 'off') out += fill('g', [[-0.45, -0.45], [0.45, -0.45], [0.35, 0.25], [-0.35, 0.25]], pal.yellow);
      out += ring('g', 0, -0.2, 0.5)
        + stroke('base', [[-0.25, 0.35], [0.25, 0.35], [0.2, 0.7], [-0.2, 0.7], [-0.25, 0.35]]);
      if (state === 'lit') {
        out += dStroke('r1', [[0, -0.82], [0, -0.98]], pal.yellow)
          + dStroke('r2', [[-0.64, -0.52], [-0.82, -0.64]], pal.yellow)
          + dStroke('r3', [[0.64, -0.52], [0.82, -0.64]], pal.yellow);
      } else if (state === 'off') {
        out += dStroke('fil', [[-0.18, -0.2], [0.18, -0.2]], pal.muted);
      }
      return out;
    }
    case 'gear':
      return ring('out', 0, 0, 0.62) + ring('in', 0, 0, 0.24)
        + [0, 60, 120, 180, 240, 300].map((d, i) => {
          const rad = (d * Math.PI) / 180;
          return stroke(`t${i}`, [[0.58 * Math.cos(rad), 0.58 * Math.sin(rad)], [0.84 * Math.cos(rad), 0.84 * Math.sin(rad)]]);
        }).join('');
    case 'network':
      return stroke('l1', [[0, -0.55], [-0.6, 0.45]])
        + stroke('l2', [[0, -0.55], [0.6, 0.45]])
        + stroke('l3', [[-0.6, 0.45], [0.6, 0.45]])
        + dot(0, -0.55, 0.18, pal.accent) + dot(-0.6, 0.45, 0.18, pal.ink) + dot(0.6, 0.45, 0.18, pal.ink);
    case 'folder': {
      let out = fill('f', box(-0.75, -0.3, 0.75, 0.65), pal.yellow);
      if (state === 'open') {
        out += fill('pg', box(-0.55, -0.45, 0.55, -0.15), pal.card)
          + stroke('back', [[-0.75, -0.6], [-0.15, -0.6], [0.05, -0.35], [0.75, -0.35], [0.75, 0.65], [-0.75, 0.65], [-0.75, -0.6]])
          + dStroke('flap', [[-0.75, 0.65], [-0.55, -0.05], [0.85, -0.05], [0.75, 0.65]]);
        return out;
      }
      out += stroke('f', [[-0.75, -0.6], [-0.15, -0.6], [0.05, -0.35], [0.75, -0.35], [0.75, 0.65], [-0.75, 0.65], [-0.75, -0.6]]);
      if (state === 'locked') out += miniPadlock('lk', 0.42, 0.28, false);
      if (state === 'unlocked') out += miniPadlock('ulk', 0.42, 0.28, true);
      return out;
    }
    case 'image':
      return fill('sky', box(-0.75, -0.6, 0.75, 0.6), pal.teal)
        + stroke('frame', box(-0.75, -0.6, 0.75, 0.6))
        + stroke('mtn', [[-0.7, 0.55], [-0.18, -0.08], [0.15, 0.3], [0.42, 0.05], [0.7, 0.55]])
        + dot(0.35, -0.28, 0.12, pal.yellow);
    case 'search':
      return fill('lens', [[-0.5, -0.5], [0.25, -0.5], [0.25, 0.25], [-0.5, 0.25]], pal.teal)
        + ring('lens', -0.15, -0.15, 0.48)
        + stroke('handle', [[0.2, 0.2], [0.75, 0.75]]);
    case 'money':
      return fill('coin', [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]], pal.yellow)
        + ring('coin', 0, 0, 0.74)
        + stroke('y1', [[-0.28, -0.35], [0, -0.02], [0.28, -0.35]])
        + stroke('y2', [[0, -0.02], [0, 0.45]])
        + stroke('b1', [[-0.28, 0.1], [0.28, 0.1]])
        + stroke('b2', [[-0.28, 0.28], [0.28, 0.28]]);
    case 'plane':
      return fill('p', [[-0.75, 0.05], [0.78, -0.55], [0.15, 0.68], [-0.15, 0.18]], pal.teal)
        + stroke('p', [[-0.75, 0.05], [0.78, -0.55], [0.15, 0.68], [-0.15, 0.18], [-0.75, 0.05]])
        + stroke('fold', [[-0.15, 0.18], [0.78, -0.55]]);
    case 'globe':
      return fill('g', [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]], pal.teal)
        + ring('g', 0, 0, 0.75)
        + stroke('eq', [[-0.74, 0], [0.74, 0]])
        + stroke('m1', [[0, -0.74], [-0.32, 0], [0, 0.74]])
        + stroke('m2', [[0, -0.74], [0.32, 0], [0, 0.74]]);
  }
}

function drawNew36(name, c, pal, state) {
  const { wDetail, box, stroke, dStroke, smooth, ring, ellipse, fill, fillRing, fillEllipse, dot, sparkle, expiredBadge, miniPadlock } = c;
  switch (name) {
    // 家居厨房 (8)
    case 'fridge': {
      const isOpen = state === 'open' || state === 'full' || state === 'empty';
      const bodyFill = state === 'expired' ? pal.soft_red : pal.soft_accent;
      let out = fill('body', box(-0.62, -0.94, 0.68, 0.96), bodyFill);
      if (isOpen) {
        out += fill('in', box(-0.56, -0.88, 0.62, 0.90), pal.card)
          + stroke('cab', box(-0.62, -0.94, 0.68, 0.96))
          + dStroke('sh1', [[-0.58, -0.34], [0.64, -0.34]])
          + dStroke('sh2', [[-0.58, 0.28], [0.64, 0.28]])
          // Swung open door on left
          + fill('door', [[-0.62, -0.94], [-0.94, -0.82], [-0.94, 0.84], [-0.62, 0.96]], bodyFill)
          + stroke('door', [[-0.62, -0.94], [-0.94, -0.82], [-0.94, 0.84], [-0.62, 0.96]]);
        if (state === 'full') {
          out += fill('f1', box(-0.35, -0.72, 0.05, -0.38), pal.yellow)
            + stroke('f1', box(-0.35, -0.72, 0.05, -0.38))
            + fillRing('f2', 0.34, -0.52, 0.14, pal.red)
            + ring('f2', 0.34, -0.52, 0.14)
            + fill('f3', box(-0.4, -0.08, 0.1, 0.24), pal.accent)
            + dStroke('f3', box(-0.4, -0.08, 0.1, 0.24))
            + fill('f4', box(0.22, 0.44, 0.52, 0.84), pal.yellow)
            + dStroke('f4', box(0.22, 0.44, 0.52, 0.84));
        } else if (state === 'empty') {
          out += dStroke('em1', [[-0.25, -0.05], [0.25, -0.05]], pal.muted)
            + dStroke('em2', [[-0.2, 0.58], [0.2, 0.58]], pal.muted);
        }
      } else {
        out += stroke('cab', box(-0.62, -0.94, 0.68, 0.96))
          + stroke('split', [[-0.62, -0.28], [0.68, -0.28]])
          + stroke('h1', [[0.42, -0.68], [0.42, -0.44]])
          + stroke('h2', [[0.42, -0.08], [0.42, 0.36]]);
        if (state === 'fresh') out += sparkle('sp1', 0.78, -0.78, 0.16) + sparkle('sp2', -0.78, -0.45, 0.12, pal.accent);
        if (state === 'expired') out += expiredBadge('exp', 0.58, 0.68);
      }
      return out;
    }
    case 'cup': {
      const isEmpty = state === 'empty';
      let out = fill('mug', [[-0.58, -0.28], [0.42, -0.28], [0.34, 0.88], [-0.50, 0.88]], isEmpty ? pal.card : pal.soft_yellow);
      if (!isEmpty) {
        out += fill('liq', [[-0.52, -0.14], [0.36, -0.14], [0.30, 0.82], [-0.46, 0.82]], pal.yellow)
          + smooth('st1', [[-0.26, -0.46], [-0.34, -0.68], [-0.20, -0.88]], pal.accent, wDetail)
          + smooth('st2', [[0.08, -0.46], [0.00, -0.68], [0.14, -0.88]], pal.accent, wDetail);
      }
      out += stroke('body', [[-0.58, -0.28], [-0.50, 0.88], [0.34, 0.88], [0.42, -0.28], [-0.58, -0.28]])
        + smooth('ear', [[0.42, -0.06], [0.84, 0.04], [0.82, 0.56], [0.38, 0.60]]);
      return out;
    }
    case 'pot': {
      const isOpen = state === 'open' || state === 'full' || state === 'empty';
      const isFull = state === 'full';
      let out = fill('body', box(-0.62, -0.10, 0.62, 0.88), isFull ? pal.soft_red : pal.soft_accent);
      if (isFull) {
        out += fill('soup', box(-0.56, -0.06, 0.56, 0.24), pal.yellow)
          + smooth('s1', [[-0.24, -0.30], [-0.32, -0.58], [-0.18, -0.82]], pal.accent, wDetail)
          + smooth('s2', [[0.18, -0.32], [0.10, -0.58], [0.24, -0.82]], pal.accent, wDetail);
      }
      out += stroke('body', [[-0.62, -0.10], [-0.62, 0.72], [-0.42, 0.90], [0.42, 0.90], [0.62, 0.72], [0.62, -0.10], [-0.62, -0.10]])
        + stroke('hl', [[-0.64, 0.08], [-0.88, 0.08], [-0.88, 0.30], [-0.64, 0.30]])
        + stroke('hr', [[0.64, 0.08], [0.88, 0.08], [0.88, 0.30], [0.64, 0.30]]);
      if (isOpen) {
        out += stroke('lid', [[-0.55, -0.44], [0.55, -0.76]])
          + stroke('knob', [[-0.08, -0.60], [-0.14, -0.76], [0.06, -0.82]]);
      } else {
        out += fill('lid', [[-0.66, -0.12], [0.66, -0.12], [0.48, -0.34], [-0.48, -0.34]], pal.card)
          + stroke('lid', [[-0.66, -0.12], [0.66, -0.12], [0.48, -0.34], [-0.48, -0.34], [-0.66, -0.12]])
          + stroke('knob', [[-0.14, -0.34], [-0.14, -0.52], [0.14, -0.52], [0.14, -0.34]]);
      }
      return out;
    }
    case 'table':
      return fill('top', box(-0.92, -0.96, 0.92, -0.62), pal.soft_yellow)
        + stroke('top', box(-0.92, -0.96, 0.92, -0.62))
        + dStroke('apron', [[-0.78, -0.44], [0.78, -0.44]])
        + stroke('leg1', [[-0.78, -0.62], [-0.78, 0.96]])
        + stroke('leg2', [[0.78, -0.62], [0.78, 0.96]])
        + dStroke('leg3', [[-0.56, -0.44], [-0.56, 0.78]], pal.muted)
        + dStroke('leg4', [[0.56, -0.44], [0.56, 0.78]], pal.muted);
    case 'chair':
      return fill('seat', box(-0.56, -0.02, 0.64, 0.18), pal.soft_yellow)
        + fill('back', box(-0.56, -0.92, -0.36, -0.02), pal.soft_yellow)
        + stroke('back', [[-0.56, 0.96], [-0.56, -0.92], [-0.34, -0.92], [-0.34, -0.02]])
        + stroke('seat', [[-0.56, -0.02], [0.64, -0.02], [0.64, 0.18], [-0.56, 0.18]])
        + stroke('fl', [[0.56, 0.18], [0.56, 0.96]])
        + dStroke('rung', [[-0.56, 0.56], [0.56, 0.56]])
        + dStroke('bl2', [[-0.24, 0.18], [-0.24, 0.84]], pal.muted);
    case 'door': {
      const isOpen = state === 'open';
      let out = fill('frame', box(-0.74, -0.96, 0.74, 0.96), isOpen ? pal.soft_yellow : pal.soft_accent)
        + stroke('frame', box(-0.74, -0.96, 0.74, 0.96));
      if (isOpen) {
        out += fill('leaf', [[-0.74, -0.96], [0.06, -0.76], [0.06, 0.76], [-0.74, 0.96]], pal.soft_accent)
          + stroke('leaf', [[-0.74, -0.96], [0.06, -0.76], [0.06, 0.76], [-0.74, 0.96]])
          + dot(-0.14, 0.08, 0.09, pal.yellow);
      } else {
        out += dStroke('pan1', box(-0.46, -0.70, 0.46, -0.10))
          + dStroke('pan2', box(-0.46, 0.12, 0.46, 0.72))
          + dot(0.46, 0.06, 0.10, pal.yellow);
      }
      if (state === 'locked') out += miniPadlock('lk', 0.32, 0.44, false);
      if (state === 'unlocked') out += miniPadlock('ulk', 0.32, 0.44, true);
      return out;
    }
    case 'window': {
      const isOpen = state === 'open';
      let out = fill('sky', box(-0.76, -0.78, 0.76, 0.74), pal.soft_accent)
        + stroke('frame', box(-0.76, -0.78, 0.76, 0.74))
        + stroke('sill', [[-0.88, 0.74], [0.88, 0.74], [0.88, 0.90], [-0.88, 0.90], [-0.88, 0.74]]);
      if (isOpen) {
        out += fill('l', [[-0.76, -0.78], [-0.34, -0.62], [-0.34, 0.58], [-0.76, 0.74]], pal.card)
          + stroke('l', [[-0.76, -0.78], [-0.34, -0.62], [-0.34, 0.58], [-0.76, 0.74]])
          + fill('r', [[0.76, -0.78], [0.34, -0.62], [0.34, 0.58], [0.76, 0.74]], pal.card)
          + stroke('r', [[0.76, -0.78], [0.34, -0.62], [0.34, 0.58], [0.76, 0.74]])
          + smooth('breeze1', [[-0.18, -0.16], [0.02, -0.26], [0.22, -0.12]], pal.accent, wDetail)
          + smooth('breeze2', [[-0.22, 0.16], [0.02, 0.06], [0.24, 0.20]], pal.accent, wDetail);
      } else {
        out += stroke('v', [[0, -0.78], [0, 0.74]])
          + stroke('h', [[-0.76, -0.02], [0.76, -0.02]])
          + dStroke('gl', [[-0.52, -0.52], [-0.24, -0.24]], pal.card);
      }
      return out;
    }
    case 'trash': {
      const isOpen = state === 'open' || state === 'full' || state === 'empty';
      const isFull = state === 'full';
      let out = fill('bin', [[-0.64, -0.44], [0.64, -0.44], [0.50, 0.96], [-0.50, 0.96]], isFull ? pal.soft_red : pal.soft_accent);
      if (isFull) {
        out += fillRing('p1', -0.22, -0.58, 0.22, pal.soft_yellow)
          + ring('p1', -0.22, -0.58, 0.22)
          + fillRing('p2', 0.20, -0.52, 0.24, pal.card)
          + ring('p2', 0.20, -0.52, 0.24);
      }
      out += stroke('bin', [[-0.64, -0.44], [-0.50, 0.96], [0.50, 0.96], [0.64, -0.44], [-0.64, -0.44]])
        + dStroke('r1', [[-0.24, -0.20], [-0.18, 0.76]])
        + dStroke('r2', [[0.24, -0.20], [0.18, 0.76]]);
      if (isOpen) {
        out += stroke('lid', [[-0.72, -0.54], [0.56, -0.88]])
          + dStroke('lknob', [[-0.20, -0.76], [-0.26, -0.92], [0.02, -0.96], [0.08, -0.80]]);
      } else {
        out += stroke('lid', [[-0.74, -0.46], [0.74, -0.46]])
          + stroke('lknob', [[-0.22, -0.46], [-0.22, -0.68], [0.22, -0.68], [0.22, -0.46]]);
      }
      return out;
    }

    // 商店街道 (6)
    case 'shop': {
      const isClosed = state === 'closed';
      let out = fill('wall', box(-0.84, -0.22, 0.84, 0.96), pal.card)
        + fill('awn', [[-0.92, -0.58], [0.92, -0.58], [0.84, -0.22], [-0.84, -0.22]], pal.soft_red);
      for (const sx of [-0.46, 0.0, 0.46]) {
        out += fill(`st${sx}`, [[sx - 0.16, -0.58], [sx + 0.16, -0.58], [sx + 0.14, -0.22], [sx - 0.14, -0.22]], pal.red);
      }
      out += stroke('wall', box(-0.84, -0.22, 0.84, 0.96))
        + stroke('awn', [[-0.92, -0.58], [0.92, -0.58], [0.84, -0.22], [-0.84, -0.22], [-0.92, -0.58]])
        + stroke('sign', box(-0.56, -0.92, 0.56, -0.62));
      if (isClosed) {
        out += fill('shut', box(-0.68, 0.0, 0.68, 0.96), pal.soft_accent)
          + stroke('shut', box(-0.68, 0.0, 0.68, 0.96))
          + dStroke('sl1', [[-0.68, 0.24], [0.68, 0.24]])
          + dStroke('sl2', [[-0.68, 0.50], [0.68, 0.50]])
          + dStroke('sl3', [[-0.68, 0.74], [0.68, 0.74]])
          + dStroke('tag', [[-0.22, 0.36], [0.22, 0.62]], pal.red);
      } else {
        out += fill('win', box(-0.64, 0.04, 0.08, 0.62), pal.soft_yellow)
          + stroke('win', box(-0.64, 0.04, 0.08, 0.62))
          + fill('door', box(0.24, 0.04, 0.68, 0.96), pal.soft_accent)
          + stroke('door', box(0.24, 0.04, 0.68, 0.96))
          + dot(0.56, 0.52, 0.06);
      }
      return out;
    }
    case 'cart': {
      const isFull = state === 'full';
      let out = fill('bask', [[-0.56, -0.34], [0.84, -0.34], [0.68, 0.42], [-0.40, 0.42]], pal.soft_accent);
      if (isFull) {
        out += fill('i1', box(-0.28, -0.68, 0.16, -0.34), pal.yellow)
          + stroke('i1', box(-0.28, -0.68, 0.16, -0.34))
          + fill('i2', box(0.22, -0.58, 0.66, -0.34), pal.soft_red)
          + stroke('i2', box(0.22, -0.58, 0.66, -0.34));
      }
      out += stroke('handle', [[-0.86, -0.64], [-0.62, -0.64], [-0.40, 0.42], [-0.52, 0.70], [0.70, 0.70]])
        + stroke('bask', [[-0.56, -0.34], [0.84, -0.34], [0.68, 0.42], [-0.40, 0.42], [-0.56, -0.34]])
        + dStroke('g1', [[-0.10, -0.34], [-0.04, 0.42]])
        + dStroke('g2', [[0.36, -0.34], [0.30, 0.42]])
        + ring('w1', -0.36, 0.84, 0.15) + ring('w2', 0.54, 0.84, 0.15);
      return out;
    }
    case 'box': {
      const isOpen = state === 'open' || state === 'full' || state === 'empty';
      const isFull = state === 'full';
      let out = fill('b', box(-0.76, isOpen ? -0.44 : -0.84, 0.76, 0.96), pal.soft_yellow);
      if (isOpen) {
        if (isFull) {
          out += fill('item1', box(-0.46, -0.88, 0.04, -0.44), pal.accent)
            + stroke('item1', box(-0.46, -0.88, 0.04, -0.44))
            + fillRing('item2', 0.30, -0.62, 0.22, pal.red)
            + ring('item2', 0.30, -0.62, 0.22);
        } else if (state === 'empty') {
          out += dStroke('em', [[-0.36, -0.58], [0.36, -0.58]], pal.muted);
        }
        out += stroke('body', box(-0.76, -0.44, 0.76, 0.96))
          + stroke('fl', [[-0.76, -0.44], [-0.94, -0.82], [-0.24, -0.82], [0, -0.44]])
          + stroke('fr', [[0.76, -0.44], [0.94, -0.82], [0.24, -0.82], [0, -0.44]]);
      } else {
        out += stroke('body', box(-0.76, -0.84, 0.76, 0.96))
          + dStroke('flap', [[-0.76, -0.42], [0.76, -0.42]])
          + fill('tape', box(-0.14, -0.84, 0.14, -0.22), pal.yellow)
          + dStroke('tape', box(-0.14, -0.84, 0.14, -0.22));
      }
      return out;
    }
    case 'wallet': {
      const isOpen = state === 'open' || state === 'full' || state === 'empty';
      let out = '';
      if (state === 'full') {
        out += fill('bill1', box(-0.56, -0.86, 0.08, -0.34), pal.accent)
          + stroke('bill1', box(-0.56, -0.86, 0.08, -0.34))
          + fill('bill2', box(-0.12, -0.74, 0.56, -0.34), pal.yellow)
          + stroke('bill2', box(-0.12, -0.74, 0.56, -0.34));
      }
      if (isOpen) {
        out += fill('w', box(-0.84, -0.36, 0.84, 0.84), pal.soft_yellow)
          + stroke('w', box(-0.84, -0.36, 0.84, 0.84))
          + dStroke('fold', [[0, -0.36], [0, 0.84]])
          + dStroke('slot1', [[-0.64, 0.06], [-0.18, 0.06]])
          + dStroke('slot2', [[0.18, 0.06], [0.64, 0.06]]);
        if (state === 'empty') out += dStroke('em', [[-0.42, 0.42], [-0.22, 0.42]], pal.muted);
      } else {
        out += fill('w', box(-0.82, -0.48, 0.78, 0.78), pal.soft_yellow)
          + stroke('w', box(-0.82, -0.48, 0.78, 0.78))
          + fill('clasp', box(0.36, -0.06, 0.88, 0.36), pal.yellow)
          + stroke('clasp', box(0.36, -0.06, 0.88, 0.36))
          + dot(0.62, 0.15, 0.07);
      }
      return out;
    }
    case 'piggybank': {
      const isEmpty = state === 'empty';
      let out = fillEllipse('body', -0.04, 0.08, 0.68, 0.58, isEmpty ? pal.card : pal.soft_red)
        + ellipse('body', -0.04, 0.08, 0.68, 0.58)
        + stroke('ear', [[-0.36, -0.42], [-0.46, -0.78], [-0.12, -0.50]])
        + fill('snout', box(0.56, -0.10, 0.86, 0.24), isEmpty ? pal.card : pal.soft_red)
        + stroke('snout', box(0.56, -0.10, 0.86, 0.24))
        + dot(0.34, -0.08, 0.06)
        + stroke('l1', [[-0.42, 0.56], [-0.42, 0.90]])
        + stroke('l2', [[0.28, 0.56], [0.28, 0.90]])
        + smooth('tail', [[-0.72, 0.02], [-0.90, -0.12], [-0.82, -0.32]])
        + dStroke('slot', [[-0.18, -0.38], [0.16, -0.38]]);
      if (!isEmpty) {
        out += fillRing('coin', 0, -0.74, 0.20, pal.yellow) + ring('coin', 0, -0.74, 0.20);
      } else {
        out += dStroke('em', [[-0.20, 0.18], [0.14, 0.18]], pal.muted);
      }
      return out;
    }
    case 'house':
      return fill('wall', box(-0.68, -0.12, 0.68, 0.96), pal.soft_yellow)
        + fill('roof', [[0, -0.94], [0.90, -0.12], [-0.90, -0.12]], pal.soft_red)
        + stroke('roof', [[0, -0.94], [0.90, -0.12], [-0.90, -0.12], [0, -0.94]])
        + stroke('chim', [[0.38, -0.58], [0.38, -0.88], [0.60, -0.88], [0.60, -0.38]])
        + stroke('wall', [[-0.68, -0.12], [-0.68, 0.96], [0.68, 0.96], [0.68, -0.12]])
        + fill('door', box(-0.12, 0.28, 0.28, 0.96), pal.soft_accent)
        + stroke('door', box(-0.12, 0.28, 0.28, 0.96))
        + fill('win', box(-0.50, 0.18, -0.24, 0.52), pal.card)
        + dStroke('win', box(-0.50, 0.18, -0.24, 0.52));

    // 交通物理 (6)
    case 'car':
      return fill('body', [[-0.86, 0.04], [-0.52, -0.68], [0.36, -0.68], [0.68, 0.02], [0.90, 0.18], [0.90, 0.64], [-0.88, 0.64]], pal.soft_accent)
        + fill('w1', [[-0.46, -0.54], [-0.04, -0.54], [-0.04, -0.02], [-0.66, -0.02]], pal.card)
        + fill('w2', [[0.06, -0.54], [0.32, -0.54], [0.54, -0.02], [0.06, -0.02]], pal.card)
        + stroke('body', [[-0.86, 0.04], [-0.52, -0.68], [0.36, -0.68], [0.68, 0.02], [0.90, 0.18], [0.90, 0.64], [-0.88, 0.64], [-0.86, 0.04]])
        + dStroke('win', [[-0.66, -0.02], [0.54, -0.02]])
        + dStroke('post', [[0, -0.68], [0, -0.02]])
        + fillRing('wh1', -0.50, 0.64, 0.30, pal.card) + ring('wh1', -0.50, 0.64, 0.30)
        + fillRing('wh2', 0.52, 0.64, 0.30, pal.card) + ring('wh2', 0.52, 0.64, 0.30)
        + dot(0.82, 0.32, 0.10, pal.yellow);
    case 'truck': {
      const isFull = state === 'full';
      let out = fill('cargo', box(-0.90, -0.68, 0.26, 0.56), isFull ? pal.soft_yellow : pal.card)
        + fill('cab', [[0.28, -0.36], [0.68, -0.36], [0.90, 0.06], [0.90, 0.56], [0.28, 0.56]], pal.soft_accent)
        + stroke('cargo', box(-0.90, -0.68, 0.26, 0.56))
        + stroke('cab', [[0.28, -0.36], [0.68, -0.36], [0.90, 0.06], [0.90, 0.56], [0.28, 0.56], [0.28, -0.36]])
        + dStroke('cwin', [[0.38, -0.22], [0.62, -0.22], [0.76, 0.06], [0.38, 0.06], [0.38, -0.22]])
        + fillRing('wh1', -0.54, 0.66, 0.28, pal.card) + ring('wh1', -0.54, 0.66, 0.28)
        + fillRing('wh2', 0.60, 0.66, 0.28, pal.card) + ring('wh2', 0.60, 0.66, 0.28);
      if (isFull) {
        out += fill('p1', box(-0.74, -0.44, -0.32, 0.44), pal.yellow)
          + dStroke('p1', box(-0.74, -0.44, -0.32, 0.44))
          + fill('p2', box(-0.24, -0.20, 0.14, 0.44), pal.accent)
          + dStroke('p2', box(-0.24, -0.20, 0.14, 0.44));
      } else if (state === 'empty') {
        out += dStroke('em', [[-0.64, 0.10], [-0.04, 0.10]], pal.muted);
      }
      return out;
    }
    case 'rocket': {
      const isLit = state === 'lit';
      let out = '';
      if (isLit) {
        out += fill('flame', [[-0.24, 0.56], [0, 0.98], [0.24, 0.56]], pal.yellow)
          + stroke('flame', [[-0.24, 0.56], [0, 0.98], [0.24, 0.56]], pal.red);
      }
      out += fill('body', [[0, -0.94], [0.40, -0.32], [0.40, 0.54], [-0.40, 0.54], [-0.40, -0.32]], pal.card)
        + fill('nose', [[0, -0.94], [0.36, -0.38], [-0.36, -0.38]], pal.red)
        + fill('fl', [[-0.40, 0.14], [-0.82, 0.66], [-0.40, 0.54]], pal.soft_red)
        + fill('fr', [[0.40, 0.14], [0.82, 0.66], [0.40, 0.54]], pal.soft_red)
        + stroke('body', [[0, -0.94], [0.40, -0.32], [0.40, 0.54], [-0.40, 0.54], [-0.40, -0.32], [0, -0.94]])
        + stroke('fl', [[-0.40, 0.14], [-0.82, 0.66], [-0.40, 0.54]])
        + stroke('fr', [[0.40, 0.14], [0.82, 0.66], [0.40, 0.54]])
        + fillRing('win', 0, -0.08, 0.22, pal.soft_accent) + ring('win', 0, -0.08, 0.22);
      if (!isLit) out += stroke('stand', [[-0.48, 0.96], [0.48, 0.96]], pal.muted, wDetail);
      return out;
    }
    case 'battery': {
      const isEmpty = state === 'empty';
      let out = fill('case', box(-0.56, -0.66, 0.56, 0.88), pal.card)
        + stroke('nub', box(-0.24, -0.90, 0.24, -0.66))
        + stroke('case', box(-0.56, -0.66, 0.56, 0.88));
      if (isEmpty) {
        out += fill('low', box(-0.42, 0.54, 0.42, 0.74), pal.red)
          + dStroke('low', box(-0.42, 0.54, 0.42, 0.74), pal.red);
      } else {
        out += fill('c1', box(-0.42, -0.46, 0.42, -0.14), pal.accent)
          + fill('c2', box(-0.42, -0.02, 0.42, 0.30), pal.accent)
          + fill('c3', box(-0.42, 0.42, 0.42, 0.74), pal.yellow)
          + dStroke('c1', box(-0.42, -0.46, 0.42, -0.14))
          + dStroke('c2', box(-0.42, -0.02, 0.42, 0.30))
          + dStroke('c3', box(-0.42, 0.42, 0.42, 0.74));
      }
      return out;
    }
    case 'magnet':
      return fill('u', [[-0.68, -0.78], [-0.30, -0.78], [-0.30, 0.20], [0.30, 0.20], [0.30, -0.78], [0.68, -0.78], [0.68, 0.68], [-0.68, 0.68]], pal.red)
        + fill('t1', box(-0.68, -0.78, -0.30, -0.42), pal.card)
        + fill('t2', box(0.30, -0.78, 0.68, -0.42), pal.card)
        + stroke('out', [[-0.68, -0.78], [-0.68, 0.38], [-0.32, 0.78], [0.32, 0.78], [0.68, 0.38], [0.68, -0.78]])
        + stroke('in', [[-0.30, -0.78], [-0.30, 0.22], [0, 0.42], [0.30, 0.22], [0.30, -0.78]])
        + dStroke('tip1', [[-0.68, -0.42], [-0.30, -0.42]])
        + dStroke('tip2', [[0.30, -0.42], [0.68, -0.42]])
        + dStroke('top1', [[-0.68, -0.78], [-0.30, -0.78]])
        + dStroke('top2', [[0.30, -0.78], [0.68, -0.78]]);
    case 'scale':
      return stroke('base', [[-0.46, 0.96], [0.46, 0.96]])
        + stroke('pole', [[0, 0.96], [0, -0.70]])
        + stroke('beam', [[-0.74, -0.52], [0.74, -0.52]])
        + dStroke('sl', [[-0.70, -0.52], [-0.90, 0.16]])
        + dStroke('sr', [[-0.70, -0.52], [-0.50, 0.16]])
        + fill('pl', [[-0.92, 0.16], [-0.48, 0.16], [-0.58, 0.34], [-0.82, 0.34]], pal.yellow)
        + stroke('pl', [[-0.92, 0.16], [-0.48, 0.16], [-0.58, 0.34], [-0.82, 0.34], [-0.92, 0.16]])
        + dStroke('rl', [[0.70, -0.52], [0.50, 0.16]])
        + dStroke('rr', [[0.70, -0.52], [0.90, 0.16]])
        + fill('pr', [[0.48, 0.16], [0.92, 0.16], [0.82, 0.34], [0.58, 0.34]], pal.yellow)
        + stroke('pr', [[0.48, 0.16], [0.92, 0.16], [0.82, 0.34], [0.58, 0.34], [0.48, 0.16]]);

    // 科学教育 (6)
    case 'beaker': {
      const isEmpty = state === 'empty';
      let out = '';
      if (!isEmpty) {
        out += fill('liq', [[-0.44, 0.12], [0.44, 0.12], [0.72, 0.86], [-0.72, 0.86]], pal.soft_accent)
          + dot(-0.14, 0.44, 0.08, pal.accent) + dot(0.18, 0.62, 0.06, pal.accent);
      }
      out += stroke('flask', [[-0.32, -0.82], [0.32, -0.82], [0.22, -0.34], [0.74, 0.86], [-0.74, 0.86], [-0.22, -0.34], [-0.32, -0.82]])
        + dStroke('t1', [[-0.14, 0.04], [0.16, 0.04]])
        + dStroke('t2', [[-0.20, 0.42], [0.14, 0.42]]);
      return out;
    }
    case 'microscope':
      return fill('base', box(-0.62, 0.68, 0.68, 0.92), pal.soft_accent)
        + stroke('base', box(-0.62, 0.68, 0.68, 0.92))
        + smooth('arm', [[-0.18, 0.68], [-0.66, 0.24], [-0.58, -0.34], [-0.04, -0.62]])
        + stroke('tube', [[-0.10, -0.84], [0.24, -0.90], [0.44, -0.02], [0.10, 0.04], [-0.10, -0.84]])
        + stroke('stage', [[-0.16, 0.32], [0.58, 0.32]])
        + dot(0.24, 0.20, 0.08, pal.yellow);
    case 'book': {
      if (state === 'open') {
        return fill('p1', [[-0.86, -0.62], [0, -0.46], [0, 0.72], [-0.86, 0.56]], pal.card)
          + fill('p2', [[0, -0.46], [0.86, -0.62], [0.86, 0.56], [0, 0.72]], pal.soft_yellow)
          + stroke('pages', [[-0.86, -0.62], [0, -0.46], [0.86, -0.62], [0.86, 0.56], [0, 0.72], [-0.86, 0.56], [-0.86, -0.62]])
          + stroke('spine', [[0, -0.46], [0, 0.72]])
          + dStroke('l1', [[-0.64, -0.22], [-0.20, -0.14]])
          + dStroke('l2', [[0.20, -0.14], [0.64, -0.22]]);
      }
      return fill('cov', box(-0.68, -0.78, 0.68, 0.78), pal.soft_red)
        + stroke('cov', box(-0.68, -0.78, 0.68, 0.78))
        + stroke('sp', [[-0.42, -0.78], [-0.42, 0.78]])
        + dStroke('lbl', box(-0.14, -0.38, 0.42, 0.06));
    }
    case 'whiteboard':
      return fill('bd', box(-0.86, -0.88, 0.86, 0.32), pal.card)
        + stroke('bd', box(-0.86, -0.88, 0.86, 0.32))
        + stroke('tray', [[-0.64, 0.32], [0.64, 0.32]])
        + stroke('l1', [[-0.58, 0.32], [-0.74, 0.96]])
        + stroke('l2', [[0.58, 0.32], [0.74, 0.96]])
        + dStroke('fig', [[-0.54, -0.12], [-0.14, -0.48], [0.22, -0.24], [0.58, -0.62]], pal.accent)
        + dStroke('line', [[-0.54, 0.08], [0.46, 0.08]], pal.yellow);
    case 'brain':
      return fillEllipse('b', 0, 0, 0.78, 0.64, pal.soft_red)
        + smooth('lobeL', [[0, -0.58], [-0.36, -0.74], [-0.74, -0.44], [-0.88, -0.02], [-0.74, 0.44], [-0.34, 0.64], [0, 0.54]])
        + smooth('lobeR', [[0, -0.58], [0.36, -0.74], [0.74, -0.44], [0.88, -0.02], [0.74, 0.44], [0.34, 0.64], [0, 0.54]])
        + dStroke('mid', [[0, -0.56], [0, 0.52]])
        + smooth('f1', [[-0.56, -0.20], [-0.32, -0.34], [-0.22, -0.06], [-0.42, 0.14]], pal.ink, wDetail)
        + smooth('f2', [[0.56, -0.20], [0.32, -0.34], [0.22, -0.06], [0.42, 0.14]], pal.ink, wDetail)
        + smooth('f3', [[-0.48, 0.34], [-0.24, 0.24], [-0.14, 0.42]], pal.ink, wDetail)
        + smooth('f4', [[0.48, 0.34], [0.24, 0.24], [0.14, 0.42]], pal.ink, wDetail);
    case 'heart':
      return fill('h', [[0, -0.42], [0.46, -0.82], [0.88, -0.40], [0.68, 0.16], [0, 0.84], [-0.68, 0.16], [-0.88, -0.40], [-0.46, -0.82]], pal.soft_red)
        + smooth('outline', [[0, -0.42], [-0.42, -0.84], [-0.88, -0.42], [-0.66, 0.18], [0, 0.84], [0.66, 0.18], [0.88, -0.42], [0.42, -0.84], [0, -0.42]], pal.red)
        + dStroke('shine', [[-0.50, -0.38], [-0.32, -0.54]], pal.card);

    // 办公信息 (6)
    case 'laptop': {
      if (state === 'closed') {
        return fill('lid', box(-0.82, 0.34, 0.82, 0.66), pal.soft_accent)
          + stroke('lid', box(-0.82, 0.34, 0.82, 0.66))
          + dStroke('seam', [[-0.82, 0.50], [0.82, 0.50]]);
      }
      const scrFill = state === 'lit' ? pal.yellow : state === 'off' ? pal.muted : pal.soft_accent;
      let out = fill('scr', box(-0.68, -0.68, 0.68, 0.24), scrFill)
        + stroke('scr', box(-0.68, -0.68, 0.68, 0.24))
        + fill('kb', [[-0.68, 0.24], [0.68, 0.24], [0.88, 0.68], [-0.88, 0.68]], pal.card)
        + stroke('kb', [[-0.68, 0.24], [0.68, 0.24], [0.88, 0.68], [-0.88, 0.68], [-0.68, 0.24]]);
      if (state === 'lit') {
        out += dStroke('ln1', [[-0.42, -0.36], [0.42, -0.36]], pal.accent)
          + sparkle('sp', 0.78, -0.72, 0.16);
      } else if (state === 'off') {
        out += dStroke('off', [[-0.18, -0.22], [0.18, -0.22]]);
      } else {
        out += dStroke('ln1', [[-0.42, -0.34], [0.32, -0.34]]) + dStroke('ln2', [[-0.42, -0.06], [0.16, -0.06]]);
      }
      return out;
    }
    case 'mail': {
      if (state === 'open') {
        return fill('letter', box(-0.56, -0.64, 0.56, 0.08), pal.card)
          + fill('env', box(-0.80, -0.14, 0.80, 0.74), pal.soft_yellow)
          + stroke('flap', [[-0.80, -0.14], [0, -0.84], [0.80, -0.14]])
          + stroke('letter', [[-0.56, -0.14], [-0.56, -0.58], [0.56, -0.58], [0.56, -0.14]])
          + stroke('env', box(-0.80, -0.14, 0.80, 0.74))
          + dStroke('v', [[-0.80, -0.14], [0, 0.36], [0.80, -0.14]]);
      }
      return fill('env', box(-0.80, -0.48, 0.80, 0.56), pal.soft_yellow)
        + stroke('env', box(-0.80, -0.48, 0.80, 0.56))
        + stroke('flap', [[-0.80, -0.48], [0, 0.14], [0.80, -0.48]])
        + dot(0, 0.14, 0.09, pal.red);
    }
    case 'megaphone':
      return fill('cone', [[-0.58, -0.24], [0.46, -0.72], [0.46, 0.38], [-0.58, 0.10]], pal.soft_yellow)
        + stroke('cone', [[-0.58, -0.24], [0.46, -0.72], [0.46, 0.38], [-0.58, 0.10], [-0.58, -0.24]])
        + stroke('grip', [[-0.36, 0.14], [-0.46, 0.74], [-0.22, 0.74], [-0.14, 0.22]])
        + dStroke('w1', [[0.64, -0.44], [0.80, -0.18], [0.64, 0.12]], pal.red)
        + dStroke('w2', [[0.82, -0.58], [0.94, -0.18], [0.82, 0.24]], pal.accent);
    case 'calendar':
      return fill('pg', box(-0.74, -0.56, 0.74, 0.82), pal.card)
        + fill('hd', box(-0.74, -0.56, 0.74, -0.16), pal.soft_red)
        + stroke('pg', box(-0.74, -0.56, 0.74, 0.82))
        + stroke('hd', [[-0.74, -0.16], [0.74, -0.16]])
        + stroke('r1', [[-0.36, -0.82], [-0.36, -0.44]])
        + stroke('r2', [[0.36, -0.82], [0.36, -0.44]])
        + dot(-0.36, 0.14, 0.09, pal.ink) + dot(0, 0.14, 0.09, pal.ink) + dot(0.36, 0.14, 0.09, pal.red)
        + dot(-0.36, 0.50, 0.09, pal.ink) + dot(0, 0.50, 0.09, pal.accent) + dot(0.36, 0.50, 0.09, pal.ink);
    case 'stamp':
      return fill('knob', [[-0.24, -0.80], [0.24, -0.80], [0.16, -0.20], [-0.16, -0.20]], pal.soft_yellow)
        + fill('base', box(-0.66, 0.22, 0.66, 0.62), pal.soft_red)
        + stroke('knob', [[-0.26, -0.62], [-0.14, -0.84], [0.14, -0.84], [0.26, -0.62], [0.14, -0.32], [0.22, 0.22], [-0.22, 0.22], [-0.14, -0.32], [-0.26, -0.62]])
        + stroke('base', box(-0.66, 0.22, 0.66, 0.62))
        + stroke('pad', [[-0.60, 0.74], [0.60, 0.74]], pal.red);
    case 'clipboard':
      return fill('bd', box(-0.72, -0.66, 0.72, 0.88), pal.soft_yellow)
        + fill('pg', box(-0.54, -0.44, 0.54, 0.70), pal.card)
        + stroke('bd', box(-0.72, -0.66, 0.72, 0.88))
        + stroke('clip', box(-0.28, -0.84, 0.28, -0.52))
        + dStroke('l1', [[-0.32, -0.10], [0.34, -0.10]])
        + dStroke('l2', [[-0.32, 0.20], [0.34, 0.20]])
        + dStroke('tick', [[-0.32, 0.44], [-0.16, 0.56], [0.08, 0.34]], pal.accent);

    // 小件与符号 (4)
    case 'package': {
      const boxFill = state === 'expired' ? pal.soft_red : pal.soft_yellow;
      let out = fill('p', box(-0.76, -0.68, 0.76, 0.74), boxFill)
        + stroke('p', box(-0.76, -0.68, 0.76, 0.74))
        + stroke('ribV', [[0, -0.68], [0, 0.74]], pal.red)
        + stroke('ribH', [[-0.76, 0.04], [0.76, 0.04]], pal.red)
        + dStroke('lbl', box(-0.56, -0.48, -0.16, -0.16));
      if (state === 'fresh') out += sparkle('sp', 0.68, -0.68, 0.16);
      if (state === 'expired') out += expiredBadge('exp', 0.62, 0.62);
      return out;
    }
    case 'ticket': {
      const tkFill = state === 'expired' ? pal.soft_red : pal.soft_yellow;
      let out = fill('t', [[-0.86, -0.56], [0.86, -0.56], [0.86, 0.56], [-0.86, 0.56]], tkFill)
        + stroke('t', [[-0.86, -0.56], [0.86, -0.56], [0.86, -0.18], [0.68, 0], [0.86, 0.18], [0.86, 0.56], [-0.86, 0.56], [-0.86, 0.18], [-0.68, 0], [-0.86, -0.18], [-0.86, -0.56]])
        + dStroke('p1', [[0.28, -0.44], [0.28, -0.16]])
        + dStroke('p2', [[0.28, 0.04], [0.28, 0.36]])
        + dStroke('bar', [[-0.48, 0], [0.08, 0]], pal.accent);
      if (state === 'fresh') out += sparkle('sp', -0.62, -0.46, 0.16);
      if (state === 'expired') out += expiredBadge('exp', 0.64, 0.44);
      return out;
    }
    case 'shield': {
      const isUnlocked = state === 'unlocked';
      const shPts = [[-0.72, -0.68], [0, -0.88], [0.72, -0.68], [0.66, 0.16], [0, 0.88], [-0.66, 0.16]];
      let out = fill('sh', shPts, isUnlocked ? pal.soft_yellow : pal.soft_accent)
        + stroke('sh', [...shPts, shPts[0]]);
      out += isUnlocked ? miniPadlock('ulk', 0, 0, true) : miniPadlock('lk', 0, 0, false);
      return out;
    }
    case 'hourglass': {
      let out = stroke('top', [[-0.64, -0.84], [0.64, -0.84]])
        + stroke('bot', [[-0.64, 0.84], [0.64, 0.84]]);
      if (state === 'empty' || state === 'expired') {
        out += fill('sbot', [[-0.46, 0.42], [0.46, 0.42], [0.54, 0.84], [-0.54, 0.84]], state === 'expired' ? pal.soft_red : pal.yellow);
      } else {
        out += fill('stop', [[-0.46, -0.68], [0.46, -0.68], [0.06, -0.06], [-0.06, -0.06]], pal.yellow)
          + fill('sbot', [[-0.24, 0.60], [0.24, 0.60], [0.46, 0.84], [-0.46, 0.84]], pal.yellow)
          + dStroke('drip', [[0, -0.02], [0, 0.60]], pal.yellow);
      }
      out += stroke('l', [[-0.52, -0.84], [-0.52, -0.36], [-0.08, 0], [-0.52, 0.36], [-0.52, 0.84]])
        + stroke('r', [[0.52, -0.84], [0.52, -0.36], [0.08, 0], [0.52, 0.36], [0.52, 0.84]]);
      if (state === 'fresh') out += sparkle('sp', 0.66, -0.58, 0.16);
      if (state === 'expired') out += expiredBadge('exp', 0.56, 0.56);
      return out;
    }
  }
}

/**
 * Draws state overlay (active/dim/crossed/stamped/broken/count:*) around `bbox = { x, y, w, h }`.
 * Returns `{ opacity, overlaySvg }`. Never emits <text>.
 */
export function drawStateOverlay(state, bbox, pal, seed = 'state', progress = 1, strokeW = [4.4, 5.8]) {
  const p = clamp01(progress);
  if (!state || state === 'normal' || EXCLUSIVE_STATES.has(state)) {
    return { opacity: 1, overlaySvg: '' };
  }
  const { x, y, w, h } = bbox;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const wob = Math.max(0.8, Math.min(2.4, Math.min(w, h) * 0.015));

  if (state === 'dim') {
    return { opacity: lerp(1, 0.45, p), overlaySvg: '' };
  }

  if (state === 'active') {
    const pad = Math.max(8, Math.min(w, h) * 0.12);
    const rx = w / 2 + pad;
    const ry = h / 2 + pad;
    const total = 44;
    const pts = Array.from({ length: total + 1 }, (_, i) => {
      const a = -Math.PI * 0.85 + ((2 * Math.PI + 0.35) * i) / total;
      return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
    });
    const sub = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
    const d = inkStroke(sub, { seed: `${seed}:active`, width: strokeW, wobble: wob }).d;
    return { opacity: 1, overlaySvg: `<g data-overlay="active"><path d="${d}" fill="${pal.accent}"/></g>` };
  }

  if (state === 'crossed') {
    const pad = Math.min(w, h) * 0.04;
    const x0 = x - pad;
    const y0 = y - pad;
    const x1 = x + w + pad;
    const y1 = y + h + pad;
    const p1 = clamp01(p * 2);
    const p2 = clamp01((p - 0.5) * 2);
    const crossW = [Math.max(strokeW[0], 4.4), Math.max(strokeW[1] * 1.1, 6.2)];
    let svg = '';
    if (p1 > 0.02) {
      svg += `<path d="${inkStroke([[x0, y0], [lerp(x0, x1, p1), lerp(y0, y1, p1)]], { seed: `${seed}:x1`, width: crossW, wobble: wob }).d}" fill="${pal.red}"/>`;
    }
    if (p2 > 0.02) {
      svg += `<path d="${inkStroke([[x1, y0], [lerp(x1, x0, p2), lerp(y0, y1, p2)]], { seed: `${seed}:x2`, width: crossW, wobble: wob }).d}" fill="${pal.red}"/>`;
    }
    return { opacity: 1, overlaySvg: `<g data-overlay="crossed">${svg}</g>` };
  }

  if (state === 'stamped') {
    const sc = p < 1 ? easeOutBack(p) : 1;
    const bw = Math.max(44, Math.min(130, w * 0.72));
    const bh = Math.max(26, bw * 0.44);
    const sx0 = cx - bw / 2;
    const sy0 = cy - bh / 2;
    const sx1 = cx + bw / 2;
    const sy1 = cy + bh / 2;
    const rectPts = [[sx0, sy0], [sx1, sy0], [sx1, sy1], [sx0, sy1], [sx0, sy0]];
    const innerPts = [[sx0 + 6, sy0 + 6], [sx1 - 6, sy0 + 6], [sx1 - 6, sy1 - 6], [sx0 + 6, sy1 - 6], [sx0 + 6, sy0 + 6]];
    const fillD = markerFill(rectPts.slice(0, 4), { seed: `${seed}:stf`, shift: 2 });
    const outD = inkStroke(rectPts, { seed: `${seed}:sto`, width: strokeW, wobble: wob * 0.8 }).d;
    const inD = inkStroke(innerPts, { seed: `${seed}:sti`, width: [Math.max(4.4, strokeW[0] * 0.85), Math.max(5.0, strokeW[1] * 0.85)], wobble: wob * 0.5 }).d;
    const barsD = inkStroke([[sx0 + 14, cy], [sx1 - 14, cy]], { seed: `${seed}:stb`, width: strokeW, wobble: wob * 0.5 }).d;
    const inner = `<path d="${fillD}" fill="${pal.soft_red}" opacity="0.72"/><path d="${outD}" fill="${pal.red}"/><path d="${inD}" fill="${pal.red}"/><path d="${barsD}" fill="${pal.red}"/>`;
    return {
      opacity: 1,
      overlaySvg: `<g data-overlay="stamped" transform="translate(${num(cx)} ${num(cy)}) rotate(-14) scale(${num(sc)}) translate(${num(-cx)} ${num(-cy)})">${inner}</g>`,
    };
  }

  if (state === 'broken') {
    const pts = [
      [x + w * 0.25, y + h * 0.12],
      [x + w * 0.58, y + h * 0.36],
      [x + w * 0.34, y + h * 0.56],
      [x + w * 0.66, y + h * 0.86],
    ];
    const maxSeg = Math.max(2, Math.round(pts.length * p));
    const sub = pts.slice(0, maxSeg);
    const crack = `<path d="${inkStroke(sub, { seed: `${seed}:brk`, width: strokeW, wobble: wob }).d}" fill="${pal.red}"/>`;
    const shard = p > 0.6
      ? `<path d="${inkStroke([[x + w * 0.68, y + h * 0.24], [x + w * 0.82, y + h * 0.16]], { seed: `${seed}:sh1`, width: strokeW, wobble: wob * 0.5 }).d}" fill="${pal.ink}"/>`
      : '';
    return { opacity: 1, overlaySvg: `<g data-overlay="broken">${crack}${shard}</g>` };
  }

  if (isCountState(state)) {
    const rad = Math.max(16, Math.min(28, Math.min(w, h) * 0.24));
    const bx = x + w - rad * 0.25;
    const by = y + rad * 0.25;
    const fillPts = circlePoints(bx, by, rad, { seed: `${seed}:cntf`, overdraw: 0, count: 20 });
    const ringPts = circlePoints(bx, by, rad, { seed: `${seed}:cntr`, overdraw: 0.25, count: 24 });
    const fPath = `<path d="${markerFill(fillPts, { seed: `${seed}:cntfm`, shift: 1.5 })}" fill="${pal.red}"/>`;
    const rPath = `<path d="${inkStroke(ringPts, { seed: `${seed}:cnts`, width: strokeW, wobble: wob * 0.6 }).d}" fill="${pal.ink}"/>`;
    return { opacity: 1, overlaySvg: `<g data-badge="count">${fPath}${rPath}</g>` };
  }

  return { opacity: 1, overlaySvg: '' };
}

/**
 * Draws one of the 60 built-in props centered at (x, y).
 * Keeps legacy 24-icon output compatible when called with `size` only (no `style`, `state`, `width`, `height`).
 * Always emits `data-icon` and `data-state` and zero <text>.
 */
export function drawIcon(name, {
  x = 0,
  y = 0,
  size,
  width,
  height,
  w: wArg,
  h: hArg,
  theme,
  style,
  seed = 'icon',
  state = 'normal',
  stateProgress = 1,
} = {}) {
  if (!ICONS.includes(name)) throw new Error(`unknown icon ${name}`);
  const meta = PROP_META[name];
  const hasExplicitBox = width != null || wArg != null || height != null || hArg != null;
  const s = size ?? 48;
  const isCompact = !hasExplicitBox && s <= 64;

  let boxW;
  let boxH;
  if (hasExplicitBox) {
    const rawW = width ?? wArg;
    const rawH = height ?? hArg;
    boxH = rawH ?? (rawW != null ? rawW / meta.aspect : 400 * meta.height);
    boxW = rawW ?? boxH * meta.aspect;
  } else if (ORIGINAL_24.has(name) && isCompact) {
    boxW = s;
    boxH = s;
  } else {
    boxW = meta.aspect >= 1 ? s : s * meta.aspect;
    boxH = meta.aspect >= 1 ? s / meta.aspect : s;
  }

  const safeState = typeof state === 'string' && state.length > 0 ? state : 'normal';
  const pal = resolvePalette(style, theme);
  const { w, wDetail, wob } = computeStrokeParams(boxW, boxH, isCompact);
  const c = makeCtx({ x, y, rx: boxW / 2, ry: boxH / 2, pal, prefix: `${seed}:${name}`, w, wDetail, wob });

  const body = ORIGINAL_24.has(name)
    ? drawOriginal24(name, c, pal, safeState)
    : drawNew36(name, c, pal, safeState);

  const bbox = { x: x - boxW / 2, y: y - boxH / 2, w: boxW, h: boxH };
  const overlayW = isCompact ? w : [Math.max(4.4, w[0]), Math.max(5.5, w[1])];
  const { opacity, overlaySvg } = drawStateOverlay(safeState, bbox, pal, `${seed}:${name}`, stateProgress, overlayW);
  const opAttr = opacity < 0.999 ? ` opacity="${num(opacity)}"` : '';
  return `<g data-icon="${name}" data-state="${escAttr(safeState)}"${opAttr}>${body}${overlaySvg}</g>`;
}

/** Validates `world.custom_props` strictly against the §4.3 whitelist. */
export function validateCustomProps(customProps) {
  if (customProps === undefined) return [];
  const errors = [];
  const fail = (path, message) => errors.push({ path, code: 'CUSTOM_PROP_INVALID', message });

  if (!Array.isArray(customProps)) {
    fail('world.custom_props', 'custom_props must be an array');
    return errors;
  }
  if (customProps.length > 4) {
    fail('world.custom_props', `at most 4 custom_props allowed (got ${customProps.length})`);
  }

  const seenIds = new Set();
  customProps.forEach((def, idx) => {
    const p = `world.custom_props[${idx}]`;
    if (!def || typeof def !== 'object' || Array.isArray(def)) {
      fail(p, 'custom prop must be an object');
      return;
    }
    for (const k of Object.keys(def)) {
      if (!CUSTOM_DEF_KEYS.has(k)) fail(`${p}.${k}`, `unknown field "${k}"`);
    }
    if (typeof def.id !== 'string' || !/^c_[a-z0-9_]+$/.test(def.id)) {
      fail(`${p}.id`, 'id must match /^c_[a-z0-9_]+$/');
    } else {
      if (ICONS.includes(def.id) || ICONS.includes(def.id.slice(2))) {
        fail(`${p}.id`, `id "${def.id}" conflicts with built-in prop`);
      }
      if (seenIds.has(def.id)) {
        fail(`${p}.id`, `duplicate custom prop id "${def.id}"`);
      }
      seenIds.add(def.id);
    }
    if (def.label !== undefined && (typeof def.label !== 'string' || def.label.trim().length === 0 || [...def.label].length > 16)) {
      fail(`${p}.label`, 'label must be 1–16 characters');
    }
    if (typeof def.height !== 'number' || !Number.isFinite(def.height) || def.height < 0.1 || def.height > 1.5) {
      fail(`${p}.height`, 'height must be a finite number in [0.1, 1.5]');
    }
    if (def.layer !== undefined && !['ground', 'mid', 'air'].includes(def.layer)) {
      fail(`${p}.layer`, 'layer must be ground, mid, or air');
    }
    if (!Array.isArray(def.parts) || def.parts.length < 1 || def.parts.length > 12) {
      fail(`${p}.parts`, 'parts must contain 1–12 primitives');
      return;
    }

    const inUnit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 1;
    def.parts.forEach((part, j) => {
      const pp = `${p}.parts[${j}]`;
      if (!part || typeof part !== 'object' || Array.isArray(part)) {
        fail(pp, 'part must be an object');
        return;
      }
      if (typeof part.shape !== 'string' || !Object.hasOwn(PART_KEYS, part.shape)) {
        fail(`${pp}.shape`, `unknown shape "${String(part.shape)}"`);
        return;
      }
      const allowed = PART_KEYS[part.shape];
      for (const k of Object.keys(part)) {
        if (!allowed.has(k)) fail(`${pp}.${k}`, `unknown field "${k}" for ${part.shape}`);
      }
      if (part.fill !== undefined && (typeof part.fill !== 'string' || !ALLOWED_FILLS.has(part.fill))) {
        fail(`${pp}.fill`, `unknown fill color key "${String(part.fill)}"`);
      }
      if (part.shape === 'rect') {
        if (!inUnit(part.x) || !inUnit(part.y)) fail(pp, 'rect x, y must be in [-1, 1]');
        if (typeof part.w !== 'number' || !Number.isFinite(part.w) || part.w <= 0 || part.w > 2) fail(`${pp}.w`, 'rect w must be in (0, 2]');
        if (typeof part.h !== 'number' || !Number.isFinite(part.h) || part.h <= 0 || part.h > 2) fail(`${pp}.h`, 'rect h must be in (0, 2]');
        if (inUnit(part.x) && Number.isFinite(part.w) && part.x + part.w > 1 + 1e-9) fail(pp, 'rect x + w must be <= 1');
        if (inUnit(part.y) && Number.isFinite(part.h) && part.y + part.h > 1 + 1e-9) fail(pp, 'rect y + h must be <= 1');
      } else if (part.shape === 'circle') {
        if (!inUnit(part.cx) || !inUnit(part.cy)) fail(pp, 'circle cx, cy must be in [-1, 1]');
        if (typeof part.r !== 'number' || !Number.isFinite(part.r) || part.r <= 0 || part.r > 1) fail(`${pp}.r`, 'circle r must be in (0, 1]');
        if (inUnit(part.cx) && Number.isFinite(part.r) && (part.cx - part.r < -1 - 1e-9 || part.cx + part.r > 1 + 1e-9)) fail(pp, 'circle exceeds [-1, 1] x');
        if (inUnit(part.cy) && Number.isFinite(part.r) && (part.cy - part.r < -1 - 1e-9 || part.cy + part.r > 1 + 1e-9)) fail(pp, 'circle exceeds [-1, 1] y');
      } else if (part.shape === 'line' || part.shape === 'poly') {
        const minPts = part.shape === 'line' ? 2 : 3;
        const maxPts = part.shape === 'line' ? 6 : 8;
        if (!Array.isArray(part.points) || part.points.length < minPts || part.points.length > maxPts) {
          fail(`${pp}.points`, `${part.shape} points must have ${minPts}–${maxPts} entries`);
        } else {
          part.points.forEach((pt, k) => {
            if (!Array.isArray(pt) || pt.length !== 2 || !inUnit(pt[0]) || !inUnit(pt[1])) {
              fail(`${pp}.points[${k}]`, 'point coordinates must be in [-1, 1]');
            }
          });
        }
      }
    });
  });

  return errors;
}

/** Computes stage metadata and normalized [0..1] anchors from a custom prop definition. */
export function customPropMeta(def) {
  const height = Number.isFinite(Number(def?.height)) ? Math.max(0.1, Math.min(1.5, Number(def.height))) : 0.5;
  const layer = ['ground', 'mid', 'air'].includes(def?.layer) ? def.layer : 'ground';

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const push = (x, y) => {
    const cx = clampCoord(x);
    const cy = clampCoord(y);
    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;
  };

  for (const part of (Array.isArray(def?.parts) ? def.parts : []).slice(0, 12)) {
    if (!part || typeof part !== 'object') continue;
    if (part.shape === 'rect') {
      const x0 = clampCoord(part.x);
      const y0 = clampCoord(part.y);
      const rw = Math.max(0, Math.min(2, Number(part.w) || 0));
      const rh = Math.max(0, Math.min(2, Number(part.h) || 0));
      push(x0, y0);
      push(x0 + rw, y0 + rh);
    } else if (part.shape === 'circle') {
      const cx = clampCoord(part.cx);
      const cy = clampCoord(part.cy);
      const r = Math.max(0, Math.min(1, Number(part.r) || 0));
      push(cx - r, cy - r);
      push(cx + r, cy + r);
    } else if ((part.shape === 'line' || part.shape === 'poly') && Array.isArray(part.points)) {
      const cap = part.shape === 'line' ? 6 : 8;
      for (const pt of part.points.slice(0, cap)) {
        if (Array.isArray(pt) && pt.length >= 2) push(pt[0], pt[1]);
      }
    }
  }

  if (!Number.isFinite(minX)) {
    minX = -1;
    minY = -1;
    maxX = 1;
    maxY = 1;
  }

  const u0 = clamp01((minX + 1) / 2);
  const u1 = clamp01((maxX + 1) / 2);
  const v0 = clamp01((minY + 1) / 2);
  const v1 = clamp01((maxY + 1) / 2);
  const midU = (u0 + u1) / 2;
  const midV = (v0 + v1) / 2;

  const anchors = {
    handle: [u0, midV],
    top: [midU, v0],
    front: [midU, midV],
  };
  if (height <= 0.6) anchors.seat = [midU, v0];

  return {
    height,
    aspect: 1,
    layer,
    anchors,
    states: [],
    carry: height <= 0.45,
  };
}

/** Draws a whitelisted custom prop centered at (x, y) with clamped coordinates and zero <text>. */
export function drawCustomProp(def, {
  x = 0,
  y = 0,
  w,
  h,
  width,
  height,
  style = 'paper',
  theme,
  seed = 'custom',
  state = 'normal',
  stateProgress = 1,
} = {}) {
  const safeId = typeof def?.id === 'string' && /^c_[a-z0-9_]+$/.test(def.id) ? def.id : 'c_custom';
  const safeState = typeof state === 'string' && state.length > 0 ? state : 'normal';
  const meta = customPropMeta(def);
  const boxH = Math.max(16, Number(height ?? h) || 400 * meta.height);
  const boxW = Math.max(16, Number(width ?? w) || boxH * meta.aspect);
  const { palette: pal } = resolveStyle(style ?? theme ?? 'paper');
  const { w: strokeW, wob } = computeStrokeParams(boxW, boxH, false);
  const rx = boxW / 2;
  const ry = boxH / 2;
  const toScreen = ([u, v]) => [x + clampCoord(u) * rx, y + clampCoord(v) * ry];

  const parts = (Array.isArray(def?.parts) ? def.parts : []).slice(0, 12);
  const out = [];
  parts.forEach((part, idx) => {
    if (!part || typeof part !== 'object') return;
    const fillKey = typeof part.fill === 'string' && ALLOWED_FILLS.has(part.fill) && part.fill !== 'none' ? part.fill : null;
    const fillColor = fillKey ? pal[fillKey] : null;
    const k = `${seed}:${safeId}:p${idx}`;

    if (part.shape === 'rect') {
      const x0 = clampCoord(part.x);
      const y0 = clampCoord(part.y);
      const rw = Math.max(0, Math.min(2, Number.isFinite(Number(part.w)) ? Number(part.w) : 0));
      const rh = Math.max(0, Math.min(2, Number.isFinite(Number(part.h)) ? Number(part.h) : 0));
      const x1 = clampCoord(x0 + rw);
      const y1 = clampCoord(y0 + rh);
      const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(toScreen);
      if (fillColor) out.push(`<path d="${markerFill(pts, { seed: `${k}:f`, shift: Math.min(rx, ry) * 0.03 })}" fill="${fillColor}"/>`);
      out.push(`<path d="${inkStroke([...pts, pts[0]], { seed: `${k}:s`, width: strokeW, wobble: wob }).d}" fill="${pal.ink}"/>`);
    } else if (part.shape === 'circle') {
      const cx = clampCoord(part.cx);
      const cy = clampCoord(part.cy);
      const cr = Math.max(0.01, Math.min(1, Number.isFinite(Number(part.r)) ? Number(part.r) : 0.1));
      const [scx, scy] = toScreen([cx, cy]);
      const radPx = cr * Math.min(rx, ry);
      if (fillColor) {
        const fPts = circlePoints(scx, scy, radPx, { seed: `${k}:fc`, overdraw: 0, count: 20 });
        out.push(`<path d="${markerFill(fPts, { seed: `${k}:f`, shift: Math.min(rx, ry) * 0.03 })}" fill="${fillColor}"/>`);
      }
      const rPts = circlePoints(scx, scy, radPx, { seed: `${k}:sc`, overdraw: 0.25, count: 28 });
      out.push(`<path d="${inkStroke(rPts, { seed: `${k}:s`, width: strokeW, wobble: wob }).d}" fill="${pal.ink}"/>`);
    } else if (part.shape === 'line' && Array.isArray(part.points)) {
      const pts = part.points.slice(0, 6).filter((p) => Array.isArray(p) && p.length >= 2).map(toScreen);
      if (pts.length >= 2) {
        out.push(`<path d="${inkStroke(pts, { seed: `${k}:s`, width: strokeW, wobble: wob }).d}" fill="${pal.ink}"/>`);
      }
    } else if (part.shape === 'poly' && Array.isArray(part.points)) {
      const pts = part.points.slice(0, 8).filter((p) => Array.isArray(p) && p.length >= 2).map(toScreen);
      if (pts.length >= 3) {
        if (fillColor) out.push(`<path d="${markerFill(pts, { seed: `${k}:f`, shift: Math.min(rx, ry) * 0.03 })}" fill="${fillColor}"/>`);
        out.push(`<path d="${inkStroke([...pts, pts[0]], { seed: `${k}:s`, width: strokeW, wobble: wob }).d}" fill="${pal.ink}"/>`);
      }
    }
  });

  const bbox = { x: x - rx, y: y - ry, w: boxW, h: boxH };
  const overlayW = [Math.max(4.4, strokeW[0]), Math.max(5.5, strokeW[1])];
  const { opacity, overlaySvg } = drawStateOverlay(safeState, bbox, pal, `${seed}:${safeId}`, stateProgress, overlayW);
  const opAttr = opacity < 0.999 ? ` opacity="${num(opacity)}"` : '';
  return `<g data-icon="${safeId}" data-state="${escAttr(safeState)}"${opAttr}>${out.join('')}${overlaySvg}</g>`;
}
