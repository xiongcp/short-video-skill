// The stick-figure host 小青: skeleton, poses, views, faces, emotion symbols and props, drawn as SVG
// (火柴人主持人设计 §3–§6). Pure functions without dependencies; every shape comes from manifest.json and a seed,
// so the same input draws the same SVG. Motion, inverse kinematics and tweening come in S2.

import { circlePoints, inkStroke, markerFill, num, pathData, resample } from './ink.mjs';

export const JOINTS = ['pelvis', 'waist', 'chest', 'neck', 'head', 'l_shoulder', 'l_elbow', 'l_wrist', 'r_shoulder', 'r_elbow', 'r_wrist',
  'l_hip', 'l_knee', 'l_ankle', 'r_hip', 'r_knee', 'r_ankle'];
export const VIEWS = ['front', 'three_quarter', 'side'];
// Poses are written for a host facing right. The acting hand (point, present, tap, pointer, magnifier) is the left one,
// which is the near hand in the side views and the hand on the right of the screen in the front view.
export const ACTING = 'l';
export const OTHER = 'r';

const RAD = Math.PI / 180;
const step = ([x, y], deg, len) => [x + Math.cos(deg * RAD) * len, y + Math.sin(deg * RAD) * len];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Angles clamped to the ranges in manifest.joints; a joint left out is 0. */
export function clampAngles(manifest, angles = {}) {
  return Object.fromEntries(JOINTS.map((name) => {
    const [lo, hi] = manifest.joints[name].range;
    return [name, Math.min(hi, Math.max(lo, angles[name] ?? 0))];
  }));
}

/** A gesture's pose from manifest.poses, following an alias such as point_right → point; walk is the key pose of
 *  manifest.motions.walk (the walk itself is procedural, S2). */
export function resolvePose(manifest, gesture) {
  const pose = manifest.poses[gesture] ?? manifest.motions[gesture]?.key;
  if (!pose) throw new Error(`unknown gesture ${gesture}`);
  return pose.alias ? resolvePose(manifest, pose.alias) : pose;
}

/** The angles a gesture draws with in a view: the pose's angles, its overrides for that view (view_angles),
 *  and, when the other hand holds a prop, that arm's angles from manifest.props. */
export function poseAngles(manifest, gesture, prop, view) {
  const pose = resolvePose(manifest, gesture);
  const angles = { ...pose.angles, ...(pose.view_angles?.[view ?? pose.view] ?? {}) };
  const held = prop ? manifest.props[prop] : undefined;
  if (held?.hand === 'other') for (const [joint, deg] of Object.entries(held.arm)) angles[`${OTHER}_${joint}`] = deg;
  return angles;
}

/**
 * Joint positions in px. Angles are in degrees from the parent bone (manifest.joints); positive bends forward,
 * or outward for the arms and legs in the front view. facing −1 mirrors the figure to face left. x is the pelvis;
 * the lowest foot, or the pelvis when sitting, touches `ground`, raised by `lift` × H.
 * @returns {{ points: Record<string, number[]>, dirs: Record<string, number>, H: number, R: number, view: string, facing: number }}
 */
export function forwardKinematics(manifest, angles, { view = 'front', facing = 1, x = 0, ground = 0, lift = 0 } = {}) {
  const H = manifest.height_px;
  const a = clampAngles(manifest, angles);
  const len = (joint) => manifest.joints[joint].length * H;
  const p = { pelvis: [0, 0] };
  const d = {};
  d.spine_low = -90 + a.pelvis + a.waist;
  p.spine_mid = step(p.pelvis, d.spine_low, len('waist'));
  d.spine_up = d.spine_low + a.chest;
  p.neck_base = step(p.spine_mid, d.spine_up, len('chest'));
  d.neck = d.spine_up + a.neck;
  p.head_base = step(p.neck_base, d.neck, len('neck'));
  d.head = d.neck + a.head;
  p.head_center = step(p.head_base, d.head, len('head') / 2);
  for (const s of ['l', 'r']) {
    const o = view === 'front' && s === 'r' ? -1 : 1; // which way "forward" turns this limb
    d[`${s}_upper_arm`] = d.spine_up + 180 - o * a[`${s}_shoulder`];
    p[`${s}_elbow`] = step(p.neck_base, d[`${s}_upper_arm`], len(`${s}_shoulder`));
    d[`${s}_forearm`] = d[`${s}_upper_arm`] - o * a[`${s}_elbow`];
    p[`${s}_wrist`] = step(p[`${s}_elbow`], d[`${s}_forearm`], len(`${s}_elbow`));
    d[`${s}_hand`] = d[`${s}_forearm`] - o * a[`${s}_wrist`];
    p[`${s}_hand`] = step(p[`${s}_wrist`], d[`${s}_hand`], len(`${s}_wrist`));
    d[`${s}_thigh`] = 90 + a.pelvis - o * a[`${s}_hip`];
    p[`${s}_knee`] = step(p.pelvis, d[`${s}_thigh`], len(`${s}_hip`));
    d[`${s}_shin`] = d[`${s}_thigh`] + o * a[`${s}_knee`];
    p[`${s}_ankle`] = step(p[`${s}_knee`], d[`${s}_shin`], len(`${s}_knee`));
    d[`${s}_foot`] = d[`${s}_shin`] - o * (90 + a[`${s}_ankle`]);
    p[`${s}_toe`] = step(p[`${s}_ankle`], d[`${s}_foot`], len(`${s}_ankle`) * manifest.views[view].foot_scale);
  }
  const sole = (manifest.figure.foot[1] * H) / 2;
  const lowest = Math.max(p.pelvis[1], ...['l_ankle', 'l_toe', 'r_ankle', 'r_toe'].map((k) => p[k][1] + sole));
  const dy = ground - lowest - lift * H;
  const points = Object.fromEntries(Object.entries(p).map(([k, [px, py]]) => [k, [x + facing * px, py + dy]]));
  const dirs = Object.fromEntries(Object.entries(d).map(([k, deg]) => [k, facing === 1 ? deg : 180 - deg]));
  return { points, dirs, H, R: len('head') / 2, view, facing };
}

/** Where a held prop goes: its grip point sits on the hand's center and the prop turns with the hand. */
export function propTransform(manifest, fk, prop) {
  const side = manifest.props[prop].hand === 'acting' ? ACTING : OTHER;
  const [x, y] = mid(fk.points[`${side}_wrist`], fk.points[`${side}_hand`]);
  const [gx, gy] = manifest.props[prop].grip.map((v) => v * fk.H);
  return { x, y, angle: fk.dirs[`${side}_hand`], grip: [gx, gy], side };
}

/** Collar polyline and notched ribbon outlines for the teal scarf, mirrored with `fk.facing`. */
export function scarfShape(manifest, fk, tailAngles = null) {
  const { points: p, H, view, facing } = fk;
  const wide = manifest.views[view].scarf_width;
  const ring = manifest.scarf.ring.map(([u, w]) => [p.neck_base[0] + facing * u * wide * H, p.neck_base[1] + w * H]);
  const knot = ring[manifest.scarf.knot];
  const notch = (manifest.scarf.notch ?? 0.02) * H;
  const tails = manifest.scarf.tails.map((t, i) => {
    const a = tailAngles?.[i] ?? t.angle;
    const deg1 = 90 + facing * a;
    const deg2 = 90 + facing * a * 1.4;
    const midDeg = (deg1 + deg2) / 2;
    const bend = step(knot, deg1, (t.length * H) / 2);
    const tip = step(bend, deg2, (t.length * H) / 2);
    const outline = [
      step(knot, deg1 - facing * 90, 0.015 * H),
      step(bend, midDeg - facing * 90, 0.013 * H),
      step(tip, deg2 - facing * 90, 0.011 * H),
      step(tip, deg2 + 180, notch),
      step(tip, deg2 + facing * 90, 0.011 * H),
      step(bend, midDeg + facing * 90, 0.013 * H),
      step(knot, deg1 + facing * 90, 0.015 * H),
    ];
    return { outline, tip };
  });
  return { ring, tails };
}

/**
 * The 呆毛 as points in head units (R = 1, facing right, −y up): the shape manifest.ahoge.by_expr gives `expr`,
 * morphed from the shape of `fromExpr` by `mix` (0–1), bent `bend` degrees about its root (positive leans
 * forward), and lifted onto the hat when the outfit has a `crown` (小青人设设计 §3.1).
 */
export function ahogePoints(manifest, { expr, fromExpr = expr, mix = 1, bend = 0, outfit = 'none' }) {
  const a = manifest.ahoge;
  const shape = (e) => resample(a.shapes[a.by_expr[e]], a.count);
  const [from, to] = [shape(fromExpr), shape(expr)];
  const k = Math.max(0, Math.min(1, mix));
  const pts = to.map(([u, v], i) => [from[i][0] + (u - from[i][0]) * k, from[i][1] + (v - from[i][1]) * k]);
  const [ru, rv] = pts[0];
  const lift = (manifest.outfits?.[outfit]?.crown ?? rv) - rv;
  return pts.map(([u, v], i) => {
    const deg = (bend * i) / (pts.length - 1);
    const [c, sn] = [Math.cos(deg * RAD), Math.sin(deg * RAD)];
    return [ru + (u - ru) * c - (v - rv) * sn, rv + (u - ru) * sn + (v - rv) * c + lift];
  });
}

// ---- drawing ----

const ellipse = (cx, cy, rx, ry, deg, fill, extra = '') =>
  `<ellipse${extra} cx="${num(cx)}" cy="${num(cy)}" rx="${num(rx)}" ry="${num(ry)}" transform="rotate(${num(deg)} ${num(cx)} ${num(cy)})" fill="${fill}"/>`;

function pen(ctx, name, points, width = ctx.width, color = ctx.ink, opts = {}) {
  return `<path data-part="${name}" d="${inkStroke(points, { seed: `${ctx.seed}:${name}`, width, wobble: ctx.wobble, ...opts }).d}" fill="${color}"/>`;
}

// Face features in head units (R = 1), drawn for a host facing right around (0, 0).
function face(base, expr, view, blink, { mouthOpen = 0, mouthWidth = 0.5, gaze = null } = {}) {
  const ctx = { ...base, wobble: base.wobble * 0.2 }; // small features need a steadier hand
  const e = ctx.manifest.expressions[expr];
  const v = ctx.manifest.views[view];
  const R = ctx.R;
  const fs = ctx.manifest.figure.face_scale ?? 1;
  const shift = (v.face_shift * ctx.H) / R;
  const line = ctx.lines.face;
  const at = (u, w) => [(shift + u) * R, w * R];
  const [gx, gy] = gaze ? [gaze[0] * R, gaze[1] * R] : [0, 0];
  const parts = [];
  const eyes = v.eyes.map((u, i) => {
    const scale = e.eye_scale?.[i] ?? 1;
    const [bx, by] = at(u, -0.02);
    const [cx, cy] = [bx + gx, by + gy];
    const k = scale * fs * R;
    if (blink >= 0.5) return pen(ctx, `eye${i}`, [[cx - 0.08 * k, cy], [cx + 0.08 * k, cy]], line);
    const inward = u < 0 ? 1 : -1;
    switch (e.eyes) {
      case 'oval': return ellipse(cx, cy, 0.075 * k, 0.12 * k, 0, ctx.ink);
      case 'narrow': return ellipse(cx, cy, 0.08 * k, 0.07 * k, 0, ctx.ink);
      case 'tall': return ellipse(cx, cy, 0.075 * k, 0.16 * k, 0, ctx.ink);
      case 'arc': return pen(ctx, `eye${i}`, [[cx - 0.1 * k, cy + 0.04 * k], [cx, cy - 0.06 * k], [cx + 0.1 * k, cy + 0.04 * k]], line);
      case 'caret': return pen(ctx, `eye${i}`, [[cx - inward * 0.08 * k, cy - 0.08 * k], [cx + inward * 0.07 * k, cy], [cx - inward * 0.08 * k, cy + 0.08 * k]], line);
      case 'star': return `<path data-eye="star" d="${pathData(Array.from({ length: 8 }, (_, j) => step([cx, cy], -90 + j * 45, (j % 2 ? 0.06 : 0.17) * k)), true)}" fill="${ctx.ink}"/>`;
      case 'half': return `<path d="M${num(cx - 0.09 * k)} ${num(cy)}A${num(0.09 * k)} ${num(0.07 * k)} 0 0 0 ${num(cx + 0.09 * k)} ${num(cy)}Z" fill="${ctx.ink}"/>`;
      default: throw new Error(`unknown eyes ${e.eyes}`);
    }
  });
  const eyeCenter = at(v.eyes.reduce((s, u) => s + u, 0) / v.eyes.length, -0.02);
  parts.push(`<g data-face-part="eyes" style="transform-origin:${num(eyeCenter[0])}px ${num(eyeCenter[1])}px">${eyes.join('')}</g>`);
  v.eyes.forEach((u, i) => {
    const inward = u < 0 ? 1 : -1;
    const raise = (e.brow.lift * ctx.H) / R + (i === 0 ? 1 : -0.5) * ((e.brow.asym ?? 0) * ctx.H) / R;
    const [cx, cy] = at(u, -0.36 - raise);
    const t = inward * e.brow.angle * RAD;
    const end = (sign) => [cx + sign * 0.13 * fs * R * Math.cos(t), cy + sign * 0.13 * fs * R * Math.sin(t)];
    parts.push(pen(ctx, `brow${i}`, [end(-1), [cx, cy - 0.025 * fs * R], end(1)], line));
  });
  const [mx, my] = at(v.eyes.length === 1 ? v.eyes[0] - 0.05 : 0, 0.42);
  const m = (u, w) => [mx + u * fs * R, my + w * fs * R];
  const mouth = {
    smile: () => pen(ctx, 'mouth', [m(-0.17, 0), m(0, 0.07), m(0.17, 0)], line),
    line: () => pen(ctx, 'mouth', [m(-0.14, 0.02), m(0.14, 0.02)], line),
    grin: () => `<path d="M${num(m(-0.2, 0)[0])} ${num(my)}L${num(m(0.2, 0)[0])} ${num(my)}Q${num(m(0.2, 0.26)[0])} ${num(m(0, 0.26)[1])} ${num(mx)} ${num(m(0, 0.26)[1])}Q${num(m(-0.2, 0)[0])} ${num(m(0, 0.26)[1])} ${num(m(-0.2, 0)[0])} ${num(my)}Z" fill="${ctx.ink}"/>`,
    o: () => ellipse(mx, my + 0.03 * fs * R, 0.055 * fs * R, 0.065 * fs * R, 0, ctx.ink),
    gasp: () => ellipse(mx, my + 0.05 * fs * R, 0.1 * fs * R, 0.15 * fs * R, 0, ctx.ink),
    wave: () => pen(ctx, 'mouth', [m(-0.17, 0.02), m(-0.085, -0.02), m(0, 0.02), m(0.085, -0.02), m(0.17, 0.02)], line),
    teeth: () => [pen(ctx, 'mouth', [m(-0.17, -0.05), m(0.17, -0.05), m(0.17, 0.08), m(-0.17, 0.08), m(-0.17, -0.05)], line),
      pen(ctx, 'teeth', [m(-0.17, 0.015), m(0.17, 0.015)], line)].join(''),
    smirk: () => pen(ctx, 'mouth', [m(-0.13, 0.03), m(0.05, 0.04), m(0.17, -0.05)], line),
  }[e.mouth];
  if (!mouth) throw new Error(`unknown mouth ${e.mouth}`);
  if (mouthOpen > 0.04) {
    const ls = ctx.manifest.lipsync ?? { open_max: 0.16, width: [0.12, 0.22] };
    const rx = (ls.width[0] + (ls.width[1] - ls.width[0]) * Math.max(0, Math.min(1, mouthWidth))) * fs * R;
    const ry = Math.max(0.03, mouthOpen * ls.open_max) * fs * R;
    parts.push(ellipse(mx, my + 0.04 * fs * R, rx, ry, 0, ctx.ink, ' data-mouth-open="1"'));
  } else {
    parts.push(mouth());
  }
  return parts.join('');
}

// Emotion symbols beside the head; they follow the head but are never mirrored, so a ? still reads as a ?.
function symbol(base, name, [cx, cy], facing) {
  const ctx = { ...base, wobble: base.wobble * 0.2 };
  const R = ctx.R;
  const back = -facing;
  const at = (u, w) => [cx + u * R, cy + w * R];
  const line = ctx.lines.symbol;
  const k = ctx.manifest.figure.symbol_scale ?? 1;
  const grow = ([ax, ay], svg) => (k === 1 ? svg : `<g transform="translate(${num(ax)} ${num(ay)}) scale(${k}) translate(${num(-ax)} ${num(-ay)})">${svg}</g>`);
  switch (name) {
    case 'question': {
      const [x, y] = at(back * 1.3, -0.95);
      const s = 0.45 * R;
      const hook = [[-0.5, -0.35], [-0.35, -0.75], [0, -0.9], [0.4, -0.75], [0.5, -0.4], [0.2, -0.1], [0, 0.1], [0, 0.35]].map(([u, w]) => [x + u * s, y + w * s]);
      return grow([x, y], `<g data-symbol="question">${pen(ctx, 'question', hook, line)}${ellipse(x, y + 0.75 * s, 0.13 * s, 0.13 * s, 0, ctx.ink)}</g>`);
    }
    case 'exclaim':
      return grow([cx, cy], `<g data-symbol="exclaim">${[-125, -90, -55].map((deg, i) => pen(ctx, `exclaim${i}`, [step([cx, cy], deg, 1.25 * R), step([cx, cy], deg, 1.6 * R)], line)).join('')}</g>`);
    case 'sweat': {
      const [x, y] = at(back * 1.05, -0.45);
      const s = 0.28 * R;
      const drop = `M${num(x)} ${num(y - s)}C${num(x + 0.9 * s)} ${num(y + 0.2 * s)} ${num(x + 0.6 * s)} ${num(y + s)} ${num(x)} ${num(y + s)}C${num(x - 0.6 * s)} ${num(y + s)} ${num(x - 0.9 * s)} ${num(y + 0.2 * s)} ${num(x)} ${num(y - s)}Z`;
      return grow([x, y], `<g data-symbol="sweat"><path d="${drop}" fill="${ctx.accent}" stroke="${ctx.ink}" stroke-width="${num(ctx.lines.fine[0])}"/></g>`);
    }
    case 'shake':
      return grow([cx, cy], `<g data-symbol="shake">${[-1, 1].flatMap((side) => [1.25, 1.45].map((r, i) => {
        const pts = [-25, -10, 5].map((deg) => step([cx, cy], side === 1 ? deg : 180 - deg, r * R));
        return pen(ctx, `shake${side}${i}`, pts, line);
      })).join('')}</g>`);
    case 'sparkle': {
      const [x, y] = at(back * 1.15, -0.95);
      const star = Array.from({ length: 8 }, (_, i) => step([x, y], -90 + i * 45, (i % 2 ? 0.1 : 0.34) * R));
      return grow([x, y], `<g data-symbol="sparkle"><path d="${pathData(star, true)}" fill="${ctx.accent}"/></g>`);
    }
    default: throw new Error(`unknown symbol ${name}`);
  }
}

// Props in their own frame: x runs along the hand, the grip (manifest.props[name].grip) is where the hand holds it.
function propShape(ctx, name) {
  const H = ctx.H;
  const u = (v) => v * H;
  const line = ctx.lines.prop;
  const rect = (x0, y0, x1, y1) => [[u(x0), u(y0)], [u(x1), u(y0)], [u(x1), u(y1)], [u(x0), u(y1)], [u(x0), u(y0)]];
  const fill = (pts, color, key) => `<path d="${markerFill(pts, { seed: `${ctx.seed}:${key}`, shift: H * 0.004 })}" fill="${color}"/>`;
  const ring = (cx, cy, r, key) => circlePoints(u(cx), u(cy), u(r), { seed: `${ctx.seed}:${key}`, overdraw: 0.3, count: 32 });
  switch (name) {
    case 'pointer':
      return pen(ctx, 'pointer', [[u(-0.02), 0], [u(0.3), 0]], ctx.lines.fine) + ellipse(u(0.3), 0, u(0.012), u(0.012), 0, ctx.markers.red);
    case 'magnifier':
      return fill(ring(0.105, 0, 0.042, 'lens-fill'), ctx.markers.teal, 'lens') + pen(ctx, 'handle', [[u(-0.01), 0], [u(0.062), 0]], line) + pen(ctx, 'lens', ring(0.105, 0, 0.045, 'lens'), line);
    case 'phone':
      return fill(rect(0.012, -0.022, 0.085, 0.022), ctx.markers.teal, 'screen') + pen(ctx, 'phone', rect(0, -0.03, 0.1, 0.03), line);
    case 'doc':
      return pen(ctx, 'doc', [[u(0), u(-0.045)], [u(0.13), u(-0.045)], [u(0.13), u(0.025)], [u(0.11), u(0.045)], [u(0), u(0.045)], [u(0), u(-0.045)]], line)
        + [-0.02, 0, 0.02].map((y, i) => pen(ctx, `doc-line${i}`, [[u(0.03), u(y)], [u(0.1), u(y)]], ctx.lines.fine)).join('');
    case 'bulb':
      return fill(ring(0.1, 0, 0.045, 'bulb-fill'), ctx.markers.yellow, 'glass') + pen(ctx, 'bulb', ring(0.1, 0, 0.047, 'bulb'), line)
        + pen(ctx, 'bulb-base', rect(0.02, -0.02, 0.055, 0.02), line);
    case 'question': {
      const board = rect(0.12, -0.055, 0.23, 0.055);
      const glyph = [[-0.5, -0.35], [-0.35, -0.75], [0, -0.9], [0.4, -0.75], [0.5, -0.4], [0.2, -0.1], [0, 0.1], [0, 0.35]]
        .map(([gx, gy]) => [u(0.175) - gy * u(0.045), gx * u(0.045)]);
      return pen(ctx, 'stick', [[u(-0.01), 0], [u(0.12), 0]], line) + fill(board, ctx.markers.yellow, 'board') + pen(ctx, 'board', board, line)
        + pen(ctx, 'glyph', glyph, line) + ellipse(u(0.175) - 0.75 * u(0.045), 0, u(0.006), u(0.006), 0, ctx.ink);
    }
    default: throw new Error(`unknown prop ${name}`);
  }
}

// Stretch (k > 1) or squash (k < 1) points along the head's axis, keeping its area.
function squash(points, [cx, cy], headDir, k) {
  if (k === 1) return points;
  const a = (headDir + 90) * RAD;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return points.map(([x, y]) => {
    const [u, w] = [((x - cx) * c + (y - cy) * s) / k, (-(x - cx) * s + (y - cy) * c) * k];
    return [cx + u * c - w * s, cy + u * s + w * c];
  });
}

function heldProp(ctx, fk, prop) {
  const t = propTransform(ctx.manifest, fk, prop);
  return `<g data-prop="${prop}" transform="translate(${num(t.x)} ${num(t.y)}) rotate(${num(t.angle)}) translate(${num(-t.grip[0])} ${num(-t.grip[1])})">${propShape(ctx, prop)}</g>`;
}

/**
 * SVG for the host at one moment, as a <g> to place in a 1920×1080 frame (or any frame in px).
 * state: { gesture, expr, view?, facing = 1, x, ground, prop?, blink = 0, theme = 'light', seed,
 *   ahoge?: { fromExpr, mix, bend }, headStretch = 0 }
 * view defaults to the pose's own view; seed keeps the ink lines fixed within a shot (use the shot ID).
 */
export function drawHost(manifest, state) {
  const {
    gesture, expr, facing = 1, x = 0, ground = 0, blink = 0, theme = 'light', seed = 'host',
    angles = null, lift = null, mouthOpen = 0, mouthWidth = 0.5, gaze = null, scarfAngles = null, hands = null, symbolOpacity = 1,
    ahoge = null, headStretch = 0,
  } = state;
  const prop = state.prop === 'none' ? undefined : state.prop; // the prop cue's none puts the prop down
  if (!manifest.expressions[expr]) throw new Error(`unknown expression ${expr}`);
  if (prop && !manifest.props[prop]) throw new Error(`unknown prop ${prop}`);
  if (!manifest.ink.body[theme]) throw new Error(`unknown theme ${theme}`);
  const pose = resolvePose(manifest, gesture);
  const view = state.view ?? pose.view;
  if (!manifest.views[view]) throw new Error(`unknown view ${view}`);
  const fk = forwardKinematics(manifest, angles ?? poseAngles(manifest, gesture, prop, view), { view, facing, x, ground, lift: lift ?? pose.lift ?? 0 });
  const { points: p, dirs, H, R } = fk;
  const defaultLines = { face: [0.008, 0.011], symbol: [0.009, 0.013], prop: [0.012, 0.016], fine: [0.0075, 0.01], scarf: manifest.ink.width };
  const rawLines = { ...defaultLines, ...(manifest.ink.lines ?? {}) };
  const ctx = {
    manifest, seed, H, R, ink: manifest.ink.body[theme], accent: manifest.ink.accent, markers: manifest.ink.markers,
    width: manifest.ink.width.map((w) => w * H),
    lines: Object.fromEntries(Object.entries(rawLines).map(([k, w]) => [k, w.map((v) => v * H)])),
    wobble: manifest.ink.wobble * H,
  };
  const [fw, fh] = manifest.figure.foot.map((v) => (v * H) / 2);
  const origin = (pt) => `style="transform-origin:${num(pt[0])}px ${num(pt[1])}px"`;
  const drawHand = (s) => {
    const type = hands?.[s] ?? pose.hands?.[s] ?? (pose.finger && s === ACTING ? 'point' : 'fist');
    const spec = manifest.figure.hands?.[type] ?? { size: manifest.figure.hand };
    const [hw, hh] = spec.size.map((v) => (v * H) / 2);
    const center = mid(p[`${s}_wrist`], p[`${s}_hand`]);
    const dir = dirs[`${s}_hand`];
    let extra = '';
    if (type === 'point') {
      extra = pen(ctx, `${s}_finger`, [p[`${s}_hand`], step(p[`${s}_hand`], dir, manifest.figure.finger * H)], ctx.lines.prop);
    } else if (type === 'open') {
      const baseDir = facing === 1 ? dir : 180 - dir;
      const [a, b] = [baseDir - 40, baseDir + 40];
      const sinDiff = Math.sin(a * RAD) - Math.sin(b * RAD);
      const unmirrored = Math.abs(sinDiff) > 1e-6 ? (sinDiff < 0 ? a : b) : (s === ACTING ? a : b);
      const thumbDeg = facing === 1 ? unmirrored : 180 - unmirrored;
      extra = pen(ctx, `${s}_thumb`, [center, step(center, thumbDeg, spec.thumb * H)], ctx.lines.fine);
    }
    return `<g data-hand="${type}">${ellipse(center[0], center[1], hw, hh, dir, ctx.ink)}${extra}</g>`;
  };
  const arm = (s) => {
    const holds = prop && propTransform(manifest, fk, prop).side === s ? heldProp(ctx, fk, prop) : '';
    return `<g data-limb="${s}_arm">${pen(ctx, `${s}_upper_arm`, [p.neck_base, p[`${s}_elbow`]], ctx.width, ctx.ink, { taper: 'start' })}<g data-joint="${s}_elbow" ${origin(p[`${s}_elbow`])}>`
      + `${pen(ctx, `${s}_forearm`, [p[`${s}_elbow`], p[`${s}_wrist`]], ctx.width, ctx.ink, { taper: 'end' })}${drawHand(s)}${holds}</g></g>`;
  };
  const leg = (s) => {
    const foot = mid(p[`${s}_ankle`], p[`${s}_toe`]);
    const scale = manifest.views[view].foot_scale;
    return `<g data-limb="${s}_leg">${pen(ctx, `${s}_leg`, [p.pelvis, p[`${s}_knee`], p[`${s}_ankle`]], ctx.width, ctx.ink, { smooth: 2 })}${ellipse(foot[0], foot[1], fw * scale, fh, dirs[`${s}_foot`], ctx.ink)}</g>`;
  };
  const torso = pen(ctx, 'spine', [p.pelvis, p.spine_mid, p.neck_base, p.head_base], ctx.width, ctx.ink, { smooth: 2 });
  const scarfGeom = scarfShape(manifest, fk, scarfAngles);
  const tails = scarfGeom.tails.map((t, i) => `<path data-part="scarf_tail${i}" d="${markerFill(t.outline, { seed: `${ctx.seed}:scarf_tail${i}_fill`, shift: H * 0.0015 })}" fill="${ctx.accent}"/>`
    + `<path data-part="scarf_tail${i}_edge" d="${pathData(t.outline, true)}" fill="none" stroke="${ctx.ink}" stroke-width="${num(ctx.lines.fine[0])}" stroke-linejoin="round"/>`).join('');
  const scarf = `<g data-part="scarf">${pen(ctx, 'scarf_ring', scarfGeom.ring, ctx.lines.scarf, ctx.accent)}</g>`;
  const k = 1 + headStretch;
  const headFrame = `translate(${num(p.head_center[0])} ${num(p.head_center[1])}) rotate(${num(dirs.head + 90)}) scale(${facing} 1)`;
  const hair = manifest.ahoge
    ? `<g data-ahoge="${manifest.ahoge.by_expr[expr]}" transform="${headFrame}">${pen(ctx, 'ahoge',
      ahogePoints(manifest, { expr, ...(ahoge ?? {}) }).map(([u, v]) => [u * R, (v - (k - 1)) * R]), ctx.width, ctx.ink, { smooth: 2, taper: 'end' })}</g>`
    : '';
  const head = `<g data-joint="head" ${origin(p.head_base)}>${pen(ctx, 'head', squash(circlePoints(p.head_center[0], p.head_center[1], R, { seed: `${seed}:head-circle` }), p.head_center, dirs.head, k))}`
    + `<g data-face="${expr}" transform="${headFrame}">${face(ctx, expr, view, blink, { mouthOpen, mouthWidth, gaze })}</g>${hair}</g>`;
  const rawSym = manifest.expressions[expr].symbol ? symbol(ctx, manifest.expressions[expr].symbol, p.head_center, facing) : '';
  const sym = rawSym && symbolOpacity < 0.999 ? `<g opacity="${num(Math.max(0, symbolOpacity))}">${rawSym}</g>` : rawSym;
  // Far limbs behind the torso, near limbs in front; in the front view every limb is in front.
  // Mirroring keeps the left limbs on the near side whichever way the host faces.
  const body = view === 'front'
    ? [tails, torso, leg('r'), leg('l'), scarf, head, arm('r'), arm('l')]
    : [arm('r'), leg('r'), tails, torso, leg('l'), scarf, head, arm('l')];
  return `<g data-host="${manifest.host}" data-gesture="${gesture}" data-expr="${expr}" data-view="${view}">${body.join('')}${sym}</g>`;
}
