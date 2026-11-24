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
// Rigs with a `motion` block (vector-2d) also carry spring velocities, a frame clock, the current gaze offset, frames since
// the mouth last moved and a brow-raise countdown; simulated-2d states keep the original shape.
export interface State {
  params: Params; hair: { x: number; v: number }; blink: number; rng: number;
  vel?: Record<string, number>; t?: number; gaze?: [number, number]; quiet?: number; brow?: number;
}
type Oscillate = { param?: string; amplitude: number; period_frames: number };
export interface Target { pose: Record<string, number>; oscillate?: Oscillate | Oscillate[]; phase: number }

// mulberry32: the generator state is part of the character state, so an inherited end state carries it forward.
function random(state: number) {
  const t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { state: t, value: ((r ^ (r >>> 14)) >>> 0) / 4294967296 };
}

// The hair spring follows the head: a boned rig tracks its `hair_anchor` through the head bone.
const headX = (rig: any, params: Params) => (rig.hair_anchor && rig.bones
  ? bonePoint(rig, params, rig.hair_anchor.bone, rig.hair_anchor.point)[0] : rig.canvas.width / 2) + params.ParamAngleX * 25;

export function initialState(rig: any, pose: string, seed: number): State {
  const params = { ParamAngleX: 0, ParamArmR: 0, ParamEyeOpen: 1, ParamMouthOpenY: 0, ...rig.parameters, ...rig.poses[pose] } as Params;
  const state: State = { params, hair: { x: headX(rig, params), v: 0 }, blink: 0, rng: seed >>> 0 };
  if (rig.motion) Object.assign(state, { vel: Object.fromEntries(Object.keys(params).map((id) => [id, 0])), t: 0, gaze: [0, 0], quiet: 0, brow: 0 });
  return state;
}

// Pose, angle, expression, gesture and (where the rig defines it) gaze targets of one action, on top of a named base pose.
export function actionTarget(rig: any, base: string, action: { angle: string; expression: string; gesture: string; gaze?: string }, phase: number): Target {
  const { oscillate, ...gesture } = rig.gestures[action.gesture];
  const gaze = (action.gaze && rig.gazes?.[action.gaze]) || {};
  return { pose: { ...rig.poses[base], ...rig.angles[action.angle], ...rig.expressions[action.expression], ...gesture, ...gaze }, oscillate, phase };
}

export function step(rig: any, previous: State, target: Target, viseme: string, limits: Map<string, { min: number; max: number }>): State {
  if (rig.motion) return stepMotion(rig, previous, target, viseme, limits);
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

// Motion rigs, same pose → lips → secondary order. Pose: every parameter is a damped spring (4 sub-steps per frame)
// toward the rest value overridden by the action target, plus bounded oscillations, slow idle sines (breathing, sway,
// head drift), speech cues (a nod impulse and brow lift at a phrase onset, a head bob with the mouth) and seeded gaze
// saccades. Parameters marked `snap` (hand shapes) switch at once. Lips: the viseme sets mouth opening and form.
function stepMotion(rig: any, previous: State, target: Target, viseme: string, limits: Map<string, { min: number; max: number }>): State {
  const m = rig.motion, prev = previous.params, params = { ...prev } as Record<string, number>, vel = { ...previous.vel };
  const clamp = (id: string, v: number) => { const l = limits.get(id); return l ? Math.min(l.max, Math.max(l.min, v)) : v; };
  let { blink, rng } = previous;
  const draw = () => { const d = random(rng); rng = d.state; return d.value; };
  const t = previous.t! + 1;
  const goal: Record<string, number> = { ...rig.parameters, ...target.pose };
  const add = (id: string, v: number) => { if (id in params) goal[id] = (goal[id] ?? params[id]) + v; };
  // 1. pose
  for (const o of [target.oscillate ?? []].flat()) add(o.param ?? 'ParamArmR', o.amplitude * Math.sin((2 * Math.PI * target.phase) / o.period_frames));
  for (const s of m.idle ?? []) add(s.param, s.amplitude * Math.sin((2 * Math.PI * (t + (s.offset ?? 0))) / s.period_frames));
  const speaking = viseme !== 'closed' && viseme !== 'rest';
  let brow = Math.max(0, previous.brow! - 1);
  if (speaking && previous.quiet! >= m.talk.onset_quiet_frames) { vel[m.talk.nod.param] = (vel[m.talk.nod.param] ?? 0) + m.talk.nod.impulse; brow = m.talk.brow.frames; }
  const quiet = speaking ? 0 : previous.quiet! + 1;
  if (brow > 0) add(m.talk.brow.param, m.talk.brow.raise);
  add(m.talk.bob.param, m.talk.bob.amount * prev.ParamMouthOpenY);
  let gaze = previous.gaze!;
  if (draw() < m.saccade.chance) gaze = [(draw() * 2 - 1) * m.saccade.range[0], (draw() * 2 - 1) * m.saccade.range[1]];
  add('ParamEyeBallX', gaze[0]); add('ParamEyeBallY', gaze[1]);
  const SUB = 4, dt = 1 / 30 / SUB;
  for (const id of Object.keys(params)) {
    if (id === 'ParamMouthOpenY' || id === 'ParamMouthForm' || goal[id] === undefined) continue;
    const d = m.dynamics[id] ?? m.dynamics.default;
    if (d.snap) { params[id] = clamp(id, goal[id]); vel[id] = 0; continue; }
    const w = 2 * Math.PI * d.frequency;
    let x = params[id], v = vel[id] ?? 0;
    for (let k = 0; k < SUB; k += 1) { v += (w * w * (goal[id] - x) - 2 * d.damping * w * v) * dt; x += v * dt; }
    const c = clamp(id, x);
    params[id] = c; vel[id] = c === x ? v : 0;
  }
  // 2. lips
  const shape = rig.visemes[viseme] ?? rig.visemes.rest;
  const { open, form = 0 } = typeof shape === 'number' ? { open: shape } : shape;
  params.ParamMouthOpenY = clamp('ParamMouthOpenY', viseme === 'closed' ? 0 : prev.ParamMouthOpenY + (open - prev.ParamMouthOpenY) * LIP_RATE);
  if ('ParamMouthForm' in params) params.ParamMouthForm = clamp('ParamMouthForm', params.ParamMouthForm + (form - params.ParamMouthForm) * LIP_RATE);
  // 3. secondary
  if (blink > 0) blink -= 1;
  else if (draw() < rig.blink.chance) blink = rig.blink.frames;
  const { stiffness, damping } = rig.physics.hair, hdt = 1 / 30;
  const hv = previous.hair.v + (stiffness * (headX(rig, params as Params) - previous.hair.x) - damping * previous.hair.v) * hdt;
  return { params: params as Params, hair: { x: previous.hair.x + hv * hdt, v: hv }, blink, rng, vel, t, gaze, quiet, brow };
}

// ---- bones: `rig.bones` lists parents first; each pivots at `pivot` (rest coordinates) and rotates by the sum of
// `rotate[].deg × param`, translates by `translate[].x|y × param` and scales by `1 + scale[].x|y × param`.
type Mat = [number, number, number, number, number, number]; // x' = a·x + c·y + e, y' = b·x + d·y + f
const mul = (p: Mat, q: Mat): Mat => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
const apply = (m: Mat, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function boneMatrices(rig: any, p: Record<string, number>): Map<string, Mat> {
  const out = new Map<string, Mat>();
  const sum = (list: any[] | undefined, key: string) => (list ?? []).reduce((s, b) => s + (b[key] ?? 0) * (p[b.param] ?? 0), 0);
  for (const bone of rig.bones ?? []) {
    const a = (sum(bone.rotate, 'deg') * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const sx = 1 + sum(bone.scale, 'x'), sy = 1 + sum(bone.scale, 'y'), [px, py] = bone.pivot;
    const rs: Mat = [cos * sx, sin * sx, -sin * sy, cos * sy, 0, 0];
    const local = mul([1, 0, 0, 1, px + sum(bone.translate, 'x'), py + sum(bone.translate, 'y')], mul(rs, [1, 0, 0, 1, -px, -py]));
    out.set(bone.id, bone.parent ? mul(out.get(bone.parent)!, local) : local);
  }
  return out;
}

// Where a rest-pose point attached to `bone` lands for the given parameters.
export function bonePoint(rig: any, params: Record<string, number>, bone: string, point: Pt): Pt {
  return apply(boneMatrices(rig, params).get(bone)!, point);
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
// `when` (drawn only while a parameter lies within `min`–`max`). Boned rigs add `bone` (the part follows that bone),
// `parallax_y` (px per unit ParamAngleY), `look` ([x, y] px per unit ParamEyeBallX/Y), `brow` (lift `y` px per unit
// ParamBrowY, tilt `deg` per unit ParamBrowAngle about `c`), `mouth.cx` (width scaled by ParamMouthForm) and eye
// `show: smile` (drawn instead of open eyes while ParamEyeSmile ≥ 0.5).
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
  const q = p as Record<string, number>, bones = boneMatrices(rig, q);
  const eyeOpen = state.blink > 0 ? 0.1 : p.ParamEyeOpen, lag = state.hair.x - headX(rig, p);
  const eyeShow = eyeOpen <= 0.25 ? 'closed' : (q.ParamEyeSmile ?? 0) >= 0.5 ? 'smile' : 'open';
  for (const part of rig.parts) {
    if (part.eye?.show && part.eye.show !== eyeShow) continue;
    if (part.mouth?.show && (part.mouth.show === 'open') !== (p.ParamMouthOpenY >= 0.15)) continue;
    if (part.when && !(p[part.when.param as keyof Params] >= (part.when.min ?? -Infinity) && p[part.when.param as keyof Params] <= (part.when.max ?? Infinity))) continue;
    const tx = p.ParamAngleX * (part.parallax ?? 0), hx = lag * (part.hair ?? 0);
    const theta = part.arm ? ((part.arm.from + p.ParamArmR * (part.arm.to - part.arm.from)) * Math.PI) / 180 : 0;
    const sy = part.eye && part.eye.show === 'open' ? Math.max(0.08, eyeOpen) : part.mouth?.show === 'open' ? 0.25 + 0.75 * p.ParamMouthOpenY : 1;
    const cy = part.eye?.cy ?? part.mouth?.cy ?? 0;
    const sx = part.mouth?.cx !== undefined ? 1 + 0.22 * (q.ParamMouthForm ?? 0) : 1;
    const ty = (q.ParamAngleY ?? 0) * (part.parallax_y ?? 0) - (part.brow ? part.brow.y * (q.ParamBrowY ?? 0) : 0);
    const lx = part.look ? part.look[0] * (q.ParamEyeBallX ?? 0) : 0, ly = part.look ? part.look[1] * (q.ParamEyeBallY ?? 0) : 0;
    const tilt = part.brow ? (part.brow.deg * (q.ParamBrowAngle ?? 0) * Math.PI) / 180 : 0;
    const bone = part.bone ? bones.get(part.bone)! : null;
    const polys = partPolys(part).map((poly) => poly.map(([x, y]): Pt => {
      let X = sx === 1 ? x : part.mouth.cx + (x - part.mouth.cx) * sx, Y = cy + (y - cy) * sy;
      if (tilt) {
        const [bx, by] = part.brow.c, dx = X - bx, dy = Y - by;
        X = bx + dx * Math.cos(tilt) - dy * Math.sin(tilt); Y = by + dx * Math.sin(tilt) + dy * Math.cos(tilt);
      }
      X += lx; Y += ly + ty;
      if (part.arm) {
        const [px, py] = part.arm.pivot, dx = X - px, dy = Y - py;
        X = px + dx * Math.cos(theta) - dy * Math.sin(theta); Y = py + dx * Math.sin(theta) + dy * Math.cos(theta);
      }
      if (bone) [X, Y] = apply(bone, [X + tx, Y]);
      else X += tx;
      return [X + hx, Y];
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
