// Simulated 2D rig (`rig: simulated-2d`): a code-defined stand-in for the approved host rig, used for development evidence.
// One step advances the state by 1/30 s in a fixed order — pose, then lips, then secondary motion (seeded blinks and a
// hair spring) — so frame n depends on every earlier frame and must be baked sequentially. Rendering is a pure function of
// one recorded state, so any frame can be read back in any order.
import { deflateSync, crc32 } from 'node:zlib';

export const BAKER = { name: 'simulated-2d-baker', version: '1.0.0' };
export const ORDER = ['pose', 'lips', 'secondary'] as const;
export const PARAMS = ['ParamAngleX', 'ParamArmR', 'ParamEyeOpen', 'ParamMouthOpenY'] as const;
const POSE_RATE = 0.35, LIP_RATE = 0.6;

export type Params = Record<(typeof PARAMS)[number], number>;
export interface State { params: Params; hair: { x: number; v: number }; blink: number; rng: number }
export interface Target { pose: Record<string, number>; oscillate?: { amplitude: number; period_frames: number }; phase: number }

// mulberry32: the generator state is part of the character state, so an inherited end state carries it forward.
function random(state: number) {
  const t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { state: t, value: ((r ^ (r >>> 14)) >>> 0) / 4294967296 };
}

const headX = (rig: any, params: Params) => rig.canvas.width / 2 + params.ParamAngleX * 25;

export function initialState(rig: any, pose: string, seed: number): State {
  const params = { ParamAngleX: 0, ParamArmR: 0, ParamEyeOpen: 1, ParamMouthOpenY: 0, ...rig.poses[pose] } as Params;
  return { params, hair: { x: headX(rig, params), v: 0 }, blink: 0, rng: seed >>> 0 };
}

// Pose, angle, expression and gesture targets of one action, on top of a named base pose.
export function actionTarget(rig: any, base: string, action: { angle: string; expression: string; gesture: string }, phase: number): Target {
  const { oscillate, ...gesture } = rig.gestures[action.gesture];
  return { pose: { ...rig.poses[base], ...rig.angles[action.angle], ...rig.expressions[action.expression], ...gesture }, oscillate, phase };
}

export function step(rig: any, previous: State, target: Target, viseme: string, limits: Map<string, { min: number; max: number }>): State {
  const clamp = (id: string, v: number) => { const l = limits.get(id); return l ? Math.min(l.max, Math.max(l.min, v)) : v; };
  const params = { ...previous.params };
  // 1. pose: ease toward the target; a waving gesture adds its bounded oscillation to the arm target.
  for (const id of ['ParamAngleX', 'ParamArmR', 'ParamEyeOpen'] as const) {
    const wave = id === 'ParamArmR' && target.oscillate ? target.oscillate.amplitude * Math.sin((2 * Math.PI * target.phase) / target.oscillate.period_frames) : 0;
    const goal = (target.pose[id] ?? params[id]) + wave;
    params[id] = clamp(id, params[id] + (goal - params[id]) * POSE_RATE);
  }
  // 2. lips: a marked closure snaps shut; other shapes ease toward their opening.
  const open = rig.visemes[viseme] ?? rig.visemes.rest;
  params.ParamMouthOpenY = clamp('ParamMouthOpenY', viseme === 'closed' ? 0 : params.ParamMouthOpenY + (open - params.ParamMouthOpenY) * LIP_RATE);
  // 3. secondary: seeded blinks, then a damped hair spring that trails the head at dt = 1/30 s.
  let { blink, rng } = previous;
  if (blink > 0) blink -= 1;
  else { const draw = random(rng); rng = draw.state; if (draw.value < rig.blink.chance) blink = rig.blink.frames; }
  const dt = 1 / 30, { stiffness, damping } = rig.physics.hair;
  const v = previous.hair.v + (stiffness * (headX(rig, params) - previous.hair.x) - damping * previous.hair.v) * dt;
  return { params, hair: { x: previous.hair.x + v * dt, v }, blink, rng };
}

// Straight-alpha RGBA on a transparent canvas; shapes are drawn back to front in a fixed order.
export function render(rig: any, state: State): Buffer {
  return rig.rig === 'vector-2d' ? renderVector(rig, state) : renderSimulated(rig, state);
}

// Where the character canvas sits in the 1920×1080 frame: a vector rig declares it, simulated-2d keeps its fixed spot.
export function characterPlacement(rig: any): { x: number; y: number } {
  return rig.rig === 'vector-2d' ? { x: rig.placement.x, y: rig.placement.y } : { x: 240, y: 540 };
}

function renderSimulated(rig: any, state: State): Buffer {
  const { width: W, height: H } = rig.canvas, c = rig.colors, out = Buffer.alloc(W * H * 4);
  const fill = (x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean, color: number[]) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y += 1) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x += 1) if (inside(x + 0.5, y + 0.5)) out.set(color, (y * W + x) * 4);
    }
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, color: number[]) =>
    fill(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, color);
  const p = state.params, hx = headX(rig, p);
  ellipse(state.hair.x, 82, 62, 60, c.hair);
  fill(70, 160, 170, H, () => true, c.coat);
  // Right arm: hangs down at 0 and points up-right at 1.
  const theta = Math.PI / 2 - p.ParamArmR * Math.PI * 0.75;
  for (let t = 0; t <= 70; t += 2) ellipse(165 + Math.cos(theta) * t, 178 + Math.sin(theta) * t, 8, 8, c.coat);
  ellipse(hx, 96, 50, 56, c.skin);
  const eye = Math.max(1, 8 * (state.blink > 0 ? 0.1 : p.ParamEyeOpen));
  ellipse(hx - 18, 90, 6, eye, c.eye);
  ellipse(hx + 18, 90, 6, eye, c.eye);
  ellipse(hx, 126, 12, 1 + 10 * p.ParamMouthOpenY, c.mouth);
  return out;
}

// ---- vector-2d: layered path art (rig.parts, drawn in order) with parameter bindings per part.
// A part may bind to: `parallax` (px of horizontal shift per unit ParamAngleX), `hair` (share of the hair spring's lag),
// `arm` (rotation about a pivot from `from` to `to` degrees by ParamArmR), `eye` (vertical squash about `cy` by eye
// openness, `show: open|closed`), `mouth` (vertical scale about `cy` by ParamMouthOpenY, `show: open|closed`) and
// `when` (drawn only while a parameter lies within `min`–`max`).
type Pt = [number, number];

// Absolute M/L/C/Q/Z path data to closed polygons; curves are flattened into 12 segments.
function flatten(d: string): Pt[][] {
  const tokens = d.match(/[MLCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const polys: Pt[][] = [];
  let poly: Pt[] = [], cur: Pt = [0, 0], i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++].toUpperCase();
    if (cmd === 'M') { if (poly.length) polys.push(poly); cur = [num(), num()]; poly = [cur]; }
    else if (cmd === 'L') { cur = [num(), num()]; poly.push(cur); }
    else if (cmd === 'C' || cmd === 'Q') {
      const pts: Pt[] = cmd === 'C' ? [[num(), num()], [num(), num()], [num(), num()]] : [[num(), num()], [num(), num()]];
      const p0 = cur;
      for (let s = 1; s <= 12; s += 1) {
        const u = s / 12, v = 1 - u;
        const [x, y] = cmd === 'C'
          ? [0, 1].map((k) => v ** 3 * p0[k] + 3 * v * v * u * pts[0][k] + 3 * v * u * u * pts[1][k] + u ** 3 * pts[2][k])
          : [0, 1].map((k) => v * v * p0[k] + 2 * v * u * pts[0][k] + u * u * pts[1][k]);
        poly.push([x, y]);
      }
      cur = pts[pts.length - 1];
    } else if (cmd === 'Z') { if (poly.length) polys.push(poly); poly = []; }
  }
  if (poly.length) polys.push(poly);
  return polys;
}

const flatCache = new WeakMap<object, Pt[][]>();
const partPolys = (part: any) => { let polys = flatCache.get(part); if (!polys) { polys = flatten(part.d); flatCache.set(part, polys); } return polys; };

// Nonzero coverage with 4 sub-rows per pixel and exact horizontal span coverage, composited source-over into a
// premultiplied float canvas.
function fillPolys(acc: Float64Array, W: number, H: number, polys: Pt[][], [r, g, b, a]: number[]) {
  let minY = Infinity, maxY = -Infinity;
  for (const poly of polys) for (const [, y] of poly) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H, Math.ceil(maxY));
  const cover = new Float64Array(W + 1);
  const alpha = a / 255;
  for (let y = y0; y < y1; y += 1) {
    cover.fill(0);
    let touched = false;
    for (let s = 0; s < 4; s += 1) {
      const sy = y + (s + 0.5) / 4;
      const xs: { x: number; w: number }[] = [];
      for (const poly of polys) {
        for (let k = 0; k < poly.length; k += 1) {
          const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % poly.length];
          if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push({ x: ax + ((sy - ay) / (by - ay)) * (bx - ax), w: by > ay ? 1 : -1 });
        }
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p.x - q.x);
      let wind = 0;
      for (let k = 0; k < xs.length - 1; k += 1) {
        wind += xs[k].w;
        if (wind === 0) continue;
        const xa = Math.max(0, xs[k].x), xb = Math.min(W, xs[k + 1].x);
        if (xb <= xa) continue;
        touched = true;
        const ia = Math.floor(xa), ib = Math.floor(xb);
        if (ia === ib) { cover[ia] += (xb - xa) / 4; continue; }
        cover[ia] += (ia + 1 - xa) / 4;
        for (let x = ia + 1; x < ib; x += 1) cover[x] += 0.25;
        if (ib < W) cover[ib] += (xb - ib) / 4;
      }
    }
    if (!touched) continue;
    for (let x = 0; x < W; x += 1) {
      const c = Math.min(1, cover[x]) * alpha;
      if (c <= 0) continue;
      const o = (y * W + x) * 4, keep = 1 - c;
      acc[o] = r * c + acc[o] * keep; acc[o + 1] = g * c + acc[o + 1] * keep; acc[o + 2] = b * c + acc[o + 2] * keep; acc[o + 3] = c + acc[o + 3] * keep;
    }
  }
}

function renderVector(rig: any, state: State): Buffer {
  const { width: W, height: H } = rig.canvas, p = state.params;
  const acc = new Float64Array(W * H * 4);
  const eyeOpen = state.blink > 0 ? 0.1 : p.ParamEyeOpen, lag = state.hair.x - headX(rig, p);
  for (const part of rig.parts) {
    if (part.eye?.show && (part.eye.show === 'open') !== (eyeOpen > 0.25)) continue;
    if (part.mouth?.show && (part.mouth.show === 'open') !== (p.ParamMouthOpenY >= 0.15)) continue;
    if (part.when && !(p[part.when.param as keyof Params] >= (part.when.min ?? -Infinity) && p[part.when.param as keyof Params] <= (part.when.max ?? Infinity))) continue;
    const tx = p.ParamAngleX * (part.parallax ?? 0) + lag * (part.hair ?? 0);
    const theta = part.arm ? ((part.arm.from + p.ParamArmR * (part.arm.to - part.arm.from)) * Math.PI) / 180 : 0;
    const sy = part.eye && part.eye.show !== 'closed' ? Math.max(0.08, eyeOpen) : part.mouth?.show === 'open' ? 0.25 + 0.75 * p.ParamMouthOpenY : 1;
    const cy = part.eye?.cy ?? part.mouth?.cy ?? 0;
    const polys = partPolys(part).map((poly) => poly.map(([x, y]): Pt => {
      let X = x, Y = cy + (y - cy) * sy;
      if (part.arm) {
        const [px, py] = part.arm.pivot, dx = X - px, dy = Y - py;
        X = px + dx * Math.cos(theta) - dy * Math.sin(theta); Y = py + dx * Math.sin(theta) + dy * Math.cos(theta);
      }
      return [X + tx, Y];
    }));
    fillPolys(acc, W, H, polys, part.fill.length === 4 ? part.fill : [...part.fill, 255]);
  }
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    const a = acc[i * 4 + 3];
    if (a <= 0) continue;
    out[i * 4] = Math.round(acc[i * 4] / a); out[i * 4 + 1] = Math.round(acc[i * 4 + 1] / a); out[i * 4 + 2] = Math.round(acc[i * 4 + 2] / a);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

// Lossless RGBA PNG (filter 0 on every row) for the frames a consumer reads.
export function png(rig: any, rgba: Buffer): Buffer {
  const { width: W, height: H } = rig.canvas;
  const raw = Buffer.alloc(H * (W * 4 + 1));
  for (let y = 0; y < H; y += 1) rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
