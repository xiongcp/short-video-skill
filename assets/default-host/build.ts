// Builds the default original host "晴" (rig `vector-2d`): layered path art drawn in code in this repository, with no
// third-party art or reference images. Writes rig.json, profile.json, rights.json, host.png (neutral frame) and
// preview.png (dark / light / checkerboard backgrounds; rest, explain, point, wave, emphasize, three-quarter, mouth open, blink).
//   node assets/default-host/build.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialState, png, render } from '../../tools/bake_character/adapter.ts';

const OUT = import.meta.dirname;
const CX = 330;

// ---- palette
const C = {
  hair: [43, 49, 82], hairDark: [28, 32, 58], hairShine: [92, 106, 160, 210], teal: [58, 186, 188], tealDark: [26, 110, 122],
  skin: [255, 230, 214], skinShade: [242, 202, 186], blush: [255, 140, 150, 95], white: [255, 255, 255], sclera: [252, 252, 255],
  iris: [44, 156, 166], irisTop: [22, 84, 104, 190], pupil: [16, 28, 40], lash: [34, 28, 46], mouth: [150, 52, 66], tongue: [238, 128, 138],
  lip: [176, 84, 92], jacket: [36, 52, 98], jacketShade: [26, 38, 74], lapel: [52, 74, 132], shirt: [248, 249, 252], shirtShade: [222, 226, 236],
  gold: [214, 182, 96], outline: [16, 22, 46], skinLine: [196, 140, 128],
};

// ---- path helpers (absolute coordinates on the 820×900 canvas)
const f = (n: number) => Number(n.toFixed(2));
const ellipse = (cx: number, cy: number, rx: number, ry: number) => {
  const k = 0.5523;
  return `M ${f(cx - rx)} ${f(cy)} C ${f(cx - rx)} ${f(cy - ry * k)} ${f(cx - rx * k)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)} `
    + `C ${f(cx + rx * k)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - ry * k)} ${f(cx + rx)} ${f(cy)} `
    + `C ${f(cx + rx)} ${f(cy + ry * k)} ${f(cx + rx * k)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)} `
    + `C ${f(cx - rx * k)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + ry * k)} ${f(cx - rx)} ${f(cy)} Z`;
};
const poly = (...pts: number[][]) => `M ${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ')} Z`;
const mirror = (d: string) => d.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_, x, y) => `${f(2 * CX - Number(x))} ${y}`);

const HEAD = 22, FEATURES = 34;
const look = [7, 5];
const eye = (ex: number) => [
  { id: `eye_white_${ex}`, fill: C.sclera, d: ellipse(ex, 312, 30, 31), parallax: FEATURES, parallax_y: 5, eye: { cy: 312, show: 'open' } },
  { id: `iris_${ex}`, fill: C.iris, d: ellipse(ex, 316, 22, 27), parallax: FEATURES, parallax_y: 5, look, eye: { cy: 312, show: 'open' } },
  { id: `iris_top_${ex}`, fill: C.irisTop, d: ellipse(ex, 304, 22, 14), parallax: FEATURES, parallax_y: 5, look, eye: { cy: 312, show: 'open' } },
  { id: `pupil_${ex}`, fill: C.pupil, d: ellipse(ex, 318, 9, 12), parallax: FEATURES, parallax_y: 5, look, eye: { cy: 312, show: 'open' } },
  { id: `glint_${ex}`, fill: C.white, d: ellipse(ex - 8, 302, 6.5, 6.5), parallax: FEATURES, parallax_y: 5, look, eye: { cy: 312, show: 'open' } },
  { id: `glint_small_${ex}`, fill: C.white, d: ellipse(ex + 9, 327, 3, 3), parallax: FEATURES, parallax_y: 5, look, eye: { cy: 312, show: 'open' } },
  { id: `lash_${ex}`, fill: C.lash, parallax: FEATURES, parallax_y: 5, eye: { cy: 312, show: 'open' },
    d: `M ${ex - 35} 302 C ${ex - 22} 274 ${ex + 22} 272 ${ex + 37} 296 L ${ex + 36} 305 C ${ex + 20} 284 ${ex - 20} 285 ${ex - 33} 309 Z` },
  { id: `lash_closed_${ex}`, fill: C.lash, parallax: FEATURES, parallax_y: 5, eye: { cy: 312, show: 'closed' },
    d: `M ${ex - 32} 312 C ${ex - 15} 326 ${ex + 15} 326 ${ex + 32} 312 L ${ex + 32} 318 C ${ex + 15} 332 ${ex - 15} 332 ${ex - 32} 318 Z` },
  // happy "^" eyes
  { id: `lash_smile_${ex}`, fill: C.lash, parallax: FEATURES, parallax_y: 5, eye: { cy: 312, show: 'smile' },
    d: `M ${ex - 31} 322 C ${ex - 16} 292 ${ex + 16} 292 ${ex + 31} 322 L ${ex + 29} 328 C ${ex + 15} 304 ${ex - 15} 304 ${ex - 29} 328 Z` },
];

// Arms: shoulder → elbow → wrist capsules with a dark outline under each segment, so a forearm crossing the jacket stays
// readable and the elbow shows a joint line. Hands swap shape by ParamHand (0 relaxed, 1 pointing, 2 open palm).
const capsule = (x1: number, y1: number, r1: number, x2: number, y2: number, r2: number) => {
  const a = Math.atan2(y2 - y1, x2 - x1), pts: number[][] = [];
  for (let k = 0; k <= 12; k += 1) { const t = a + Math.PI / 2 + (Math.PI * k) / 12; pts.push([x1 + r1 * Math.cos(t), y1 + r1 * Math.sin(t)]); }
  for (let k = 0; k <= 12; k += 1) { const t = a - Math.PI / 2 + (Math.PI * k) / 12; pts.push([x2 + r2 * Math.cos(t), y2 + r2 * Math.sin(t)]); }
  return poly(...pts);
};
const S = [478, 560], E = [482, 694], WR = [484, 812];
const handShapes = (wx: number, wy: number) => ({
  relaxed: [[C.skinLine, ellipse(wx, wy + 26, 21.5, 27.5)], [C.skin, ellipse(wx, wy + 26, 19, 25)], [C.skinShade, ellipse(wx - 13, wy + 20, 6, 11)]],
  point: [[C.skinLine, ellipse(wx, wy + 20, 21.5, 21.5)], [C.skinLine, capsule(wx - 5, wy + 28, 9, wx - 5, wy + 68, 9)],
    [C.skin, ellipse(wx, wy + 20, 19, 19)], [C.skin, capsule(wx - 5, wy + 28, 6.5, wx - 5, wy + 68, 6.5)], [C.skinShade, ellipse(wx - 14, wy + 16, 6, 10)]],
  open: [[C.skinLine, ellipse(wx, wy + 24, 25.5, 25.5)],
    ...[-17, -6, 5, 16].map((dx, k) => [C.skinLine, capsule(wx + dx * 0.6, wy + 32, 9, wx + dx * 1.35, wy + 72 - Math.abs(k - 1.5) * 5, 9)]),
    [C.skinLine, capsule(wx - 17, wy + 18, 9.5, wx - 34, wy + 40, 9.5)],
    [C.skin, ellipse(wx, wy + 24, 23, 23)],
    ...[-17, -6, 5, 16].map((dx, k) => [C.skin, capsule(wx + dx * 0.6, wy + 32, 6.5, wx + dx * 1.35, wy + 72 - Math.abs(k - 1.5) * 5, 6.5)]),
    [C.skin, capsule(wx - 17, wy + 18, 7, wx - 34, wy + 40, 7)]],
});
const HAND_WHEN = { relaxed: { max: 0.49 }, point: { min: 0.5, max: 1.49 }, open: { min: 1.5 } };
const arm = (side: 'r' | 'l') => {
  const m = side === 'r' ? (d: string) => d : mirror, hand = `ParamHand${side.toUpperCase()}`;
  return [
    { id: `upper_arm_line_${side}`, fill: C.outline, bone: `upper_arm_${side}`, d: m(capsule(S[0], S[1], 30, E[0], E[1], 26)) },
    { id: `upper_arm_${side}`, fill: C.jacket, bone: `upper_arm_${side}`, d: m(capsule(S[0], S[1], 27, E[0], E[1], 23)) },
    { id: `upper_arm_shade_${side}`, fill: C.jacketShade, bone: `upper_arm_${side}`, d: m(capsule(S[0] + 15, S[1] + 18, 7, E[0] + 13, E[1] - 6, 6)) },
    { id: `forearm_line_${side}`, fill: C.outline, bone: `forearm_${side}`, d: m(capsule(E[0], E[1], 26, WR[0], WR[1] - 8, 22)) },
    { id: `forearm_${side}`, fill: C.jacket, bone: `forearm_${side}`, d: m(capsule(E[0], E[1], 23, WR[0], WR[1] - 8, 19)) },
    { id: `forearm_shade_${side}`, fill: C.jacketShade, bone: `forearm_${side}`, d: m(capsule(E[0] + 12, E[1] + 10, 6, WR[0] + 11, WR[1] - 20, 5)) },
    { id: `cuff_${side}`, fill: C.shirt, bone: `forearm_${side}`, d: m(capsule(WR[0], WR[1] - 12, 20, WR[0], WR[1] - 2, 20)) },
    ...Object.entries(handShapes(WR[0], WR[1])).flatMap(([shape, layers]) => (layers as [number[], string][]).map(([fill, d], k) => (
      { id: `hand_${shape}_${k}_${side}`, fill, bone: `hand_${side}`, when: { param: hand, ...HAND_WHEN[shape as keyof typeof HAND_WHEN] }, d: m(d) }))),
  ];
};

const head = (part: any) => ({ ...part, bone: 'head' }), torso = (part: any) => ({ ...part, bone: 'torso' });
const parts = [
  // back hair: lags the head most
  head({ id: 'hair_back', fill: C.hairDark, parallax: 10, hair: 1.0,
    d: `M 178 300 C 166 170 250 118 ${CX} 118 C 410 118 494 170 482 300 C 480 385 494 455 470 505 L 420 476 C 424 430 236 430 240 476 L 190 505 C 166 455 180 385 178 300 Z` }),
  torso({ id: 'neck', fill: C.skinShade, parallax: 4, d: poly([300, 405], [360, 405], [363, 502], [297, 502]) }),
  // body
  ...[
    { id: 'jacket', fill: C.jacket, d: `M 148 900 L 158 600 C 164 540 222 506 298 496 L 362 496 C 438 506 496 540 502 600 L 512 900 Z` },
    { id: 'jacket_shade_left', fill: C.jacketShade, d: `M 148 900 L 158 600 C 162 560 190 532 228 516 L 222 900 Z` },
    { id: 'shirt', fill: C.shirt, d: poly([296, 492], [364, 492], [CX, 616]) },
    { id: 'shirt_shade', fill: C.shirtShade, d: poly([316, 560], [344, 560], [CX, 616]) },
    { id: 'lapel_left', fill: C.lapel, d: poly([280, 500], [302, 542], [CX, 646], [264, 522]) },
    { id: 'lapel_right', fill: C.lapel, d: mirror(poly([280, 500], [302, 542], [CX, 646], [264, 522])) },
    { id: 'collar_left', fill: C.shirt, d: poly([296, 490], [CX, 520], [302, 544], [280, 500]) },
    { id: 'collar_right', fill: C.shirt, d: mirror(poly([296, 490], [CX, 520], [302, 544], [280, 500])) },
    { id: 'bow_left', fill: C.teal, d: `M ${CX} 528 L 298 510 C 292 524 292 536 300 548 Z` },
    { id: 'bow_right', fill: C.teal, d: mirror(`M ${CX} 528 L 298 510 C 292 524 292 536 300 548 Z`) },
    { id: 'bow_knot', fill: C.tealDark, d: ellipse(CX, 528, 9, 10) },
    { id: 'button_1', fill: C.gold, d: ellipse(CX, 708, 7, 7) },
    { id: 'button_2', fill: C.gold, d: ellipse(CX, 790, 7, 7) },
  ].map(torso),
  // arms in front of the body, under the head; jacket-coloured shoulder caps hide the arm roots so the sleeves grow
  // out of the shoulders at any angle
  ...arm('l'), ...arm('r'),
  torso({ id: 'shoulder_l', fill: C.jacket, d: ellipse(2 * CX - S[0], S[1], 31, 31) }),
  torso({ id: 'shoulder_r', fill: C.jacket, d: ellipse(S[0], S[1], 31, 31) }),
  // head
  ...[
    { id: 'face', fill: C.skin, parallax: HEAD, d: `M 205 290 C 205 198 455 198 455 290 C 455 366 410 424 ${CX} 446 C 250 424 205 366 205 290 Z` },
    { id: 'face_shadow', fill: [242, 206, 192, 150], parallax: HEAD, d: `M 214 262 C 260 236 400 236 446 262 L 446 286 C 400 262 260 262 214 286 Z` },
    { id: 'blush_left', fill: C.blush, parallax: 30, parallax_y: 4, d: ellipse(262, 372, 25, 11) },
    { id: 'blush_right', fill: C.blush, parallax: 30, parallax_y: 4, d: ellipse(398, 372, 25, 11) },
    ...eye(280), ...eye(380),
    { id: 'nose', fill: [226, 176, 164], parallax: 38, parallax_y: 6, d: poly([334, 350], [339, 362], [330, 364]) },
    { id: 'mouth_closed', fill: C.lip, parallax: FEATURES, parallax_y: 6, mouth: { cy: 396, cx: CX, show: 'closed' }, when: { param: 'ParamEyeSmile', max: 0.49 },
      d: `M 313 391 C 323 401 337 401 347 391 L 348 395 C 338 406 322 406 312 395 Z` },
    { id: 'mouth_smile', fill: C.lip, parallax: FEATURES, parallax_y: 6, mouth: { cy: 396, cx: CX, show: 'closed' }, when: { param: 'ParamEyeSmile', min: 0.5 },
      d: `M 306 386 C 320 404 340 404 354 386 L 354 392 C 340 412 320 412 306 392 Z` },
    { id: 'mouth_open', fill: C.mouth, parallax: FEATURES, parallax_y: 6, mouth: { cy: 394, cx: CX, show: 'open' },
      d: `M 312 386 C 318 382 342 382 348 386 C 350 404 340 412 ${CX} 412 C 320 412 310 404 312 386 Z` },
    { id: 'tongue', fill: C.tongue, parallax: FEATURES, parallax_y: 6, mouth: { cy: 394, cx: CX, show: 'open' }, d: ellipse(CX, 405, 11, 6) },
    // front hair over the face, brows drawn over the bangs (anime convention)
    { id: 'side_lock_left', fill: C.hair, parallax: 22, hair: 0.8, d: `M 206 248 C 188 320 194 420 214 474 L 234 456 C 222 400 222 330 230 270 Z` },
    { id: 'side_lock_right', fill: C.hair, parallax: 22, hair: 0.8, d: mirror(`M 206 248 C 188 320 194 420 214 474 L 234 456 C 222 400 222 330 230 270 Z`) },
    { id: 'bangs', fill: C.hair, parallax: 26, parallax_y: 2, hair: 0.5,
      d: `M 200 306 C 186 194 258 136 ${CX} 136 C 402 136 474 194 460 306 L 448 298 L 438 258 L 418 280 L 402 234 L 374 272 L 352 230 L 332 284 L 312 230 L 290 270 L 262 236 L 244 280 L 222 258 L 212 300 Z` },
    { id: 'teal_strand', fill: C.teal, parallax: 26, parallax_y: 2, hair: 0.5, d: `M 262 236 L 272 196 C 278 220 286 246 290 270 Z` },
    { id: 'hair_shine', fill: C.hairShine, parallax: 24, hair: 0.5, d: `M 252 176 C 292 156 368 156 408 176 L 403 187 C 368 169 292 169 257 187 Z` },
    { id: 'ahoge', fill: C.hair, parallax: 24, hair: 1.5, d: `M ${CX} 140 C 322 108 346 92 364 98 C 348 104 340 120 338 140 Z` },
    { id: 'brow_left', fill: C.hairDark, parallax: FEATURES, parallax_y: 4, brow: { y: 8, deg: -12, c: [280, 260] },
      d: `M 248 264 C 265 251 295 251 312 259 L 311 265 C 295 258 266 258 249 270 Z` },
    { id: 'brow_right', fill: C.hairDark, parallax: FEATURES, parallax_y: 4, brow: { y: 8, deg: 12, c: [380, 260] },
      d: mirror(`M 248 264 C 265 251 295 251 312 259 L 311 265 C 295 258 266 258 249 270 Z`) },
  ].map(head),
];

// Bones, parents first. Positive elbow bends the forearm toward the chest on both sides.
const bones = [
  { id: 'torso', pivot: [CX, 900], rotate: [{ param: 'ParamBodyZ', deg: 2.5 }], translate: [{ param: 'ParamBodyX', x: 7 }], scale: [{ param: 'ParamBreath', y: 0.012 }] },
  { id: 'head', parent: 'torso', pivot: [CX, 452], rotate: [{ param: 'ParamAngleZ', deg: 8 }], translate: [{ param: 'ParamAngleY', y: 6 }] },
  { id: 'upper_arm_r', parent: 'torso', pivot: S, rotate: [{ param: 'ParamArmR', deg: -125 }] },
  { id: 'forearm_r', parent: 'upper_arm_r', pivot: E, rotate: [{ param: 'ParamElbowR', deg: 130 }] },
  { id: 'hand_r', parent: 'forearm_r', pivot: WR, rotate: [{ param: 'ParamWristR', deg: 35 }] },
  { id: 'upper_arm_l', parent: 'torso', pivot: [2 * CX - S[0], S[1]], rotate: [{ param: 'ParamArmL', deg: 125 }] },
  { id: 'forearm_l', parent: 'upper_arm_l', pivot: [2 * CX - E[0], E[1]], rotate: [{ param: 'ParamElbowL', deg: -130 }] },
  { id: 'hand_l', parent: 'forearm_l', pivot: [2 * CX - WR[0], WR[1]], rotate: [{ param: 'ParamWristL', deg: -35 }] },
];

// Rest values; gestures, expressions, angles and gazes override some of them, and the rest ease back here.
const parameters = {
  ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0, ParamBodyX: 0, ParamBodyZ: 0, ParamBreath: 0.5,
  ParamArmR: 0.05, ParamElbowR: 0.12, ParamWristR: 0, ParamHandR: 0, ParamArmL: 0.05, ParamElbowL: 0.12, ParamWristL: 0, ParamHandL: 0,
  ParamEyeOpen: 1, ParamEyeSmile: 0, ParamEyeBallX: 0, ParamEyeBallY: 0, ParamBrowY: 0, ParamBrowAngle: 0, ParamMouthOpenY: 0, ParamMouthForm: 0,
};
const LIMITS: Record<string, [number, number]> = {
  ParamAngleX: [-1, 1], ParamAngleY: [-1, 1], ParamAngleZ: [-1, 1], ParamBodyX: [-1, 1], ParamBodyZ: [-1, 1], ParamBreath: [0, 1],
  ParamArmR: [-0.1, 1], ParamElbowR: [-1, 1], ParamWristR: [-1, 1], ParamHandR: [0, 2], ParamArmL: [-0.1, 0.5], ParamElbowL: [-1, 1], ParamWristL: [-1, 1], ParamHandL: [0, 2],
  ParamEyeOpen: [0, 1], ParamEyeSmile: [0, 1], ParamEyeBallX: [-1, 1], ParamEyeBallY: [-1, 1], ParamBrowY: [-1, 1], ParamBrowAngle: [-1, 1],
  ParamMouthOpenY: [0, 1], ParamMouthForm: [-1, 1],
};
const spring = (frequency: number, damping: number) => ({ frequency, damping });

const rig = {
  rig: 'vector-2d', version: '2.0', name: '晴', canvas: { width: 820, height: 900 }, placement: { x: 80, y: 180 },
  parameters, bones, hair_anchor: { bone: 'head', point: [CX, 130] },
  poses: { neutral: { ParamAngleX: 0 } },
  angles: { front: { ParamAngleX: 0 }, three_quarter: { ParamAngleX: 0.6 } },
  expressions: {
    explaining: { ParamEyeOpen: 1, ParamBrowY: 0.15 },
    focused: { ParamEyeOpen: 0.62, ParamBrowY: -0.3, ParamBrowAngle: -0.6 },
    happy: { ParamEyeSmile: 1, ParamBrowY: 0.35 },
    curious: { ParamBrowY: 0.45, ParamBrowAngle: 0.55, ParamAngleZ: 0.45 },
  },
  gestures: {
    idle: {},
    point_right: { ParamArmR: 0.72, ParamElbowR: -0.08, ParamWristR: -0.15, ParamHandR: 1 },
    wave: { ParamArmR: 0.36, ParamElbowR: -0.78, ParamHandR: 2,
      oscillate: [{ param: 'ParamWristR', amplitude: 0.55, period_frames: 16 }, { param: 'ParamElbowR', amplitude: 0.1, period_frames: 16 }] },
    explain: { ParamArmR: 0.1, ParamElbowR: 0.9, ParamWristR: 0.2, ParamHandR: 2, ParamArmL: 0.06, ParamElbowL: 0.35,
      oscillate: [{ param: 'ParamElbowR', amplitude: 0.05, period_frames: 40 }] },
    emphasize: { ParamArmR: 0.15, ParamElbowR: -0.95, ParamHandR: 1, oscillate: [{ param: 'ParamElbowR', amplitude: 0.08, period_frames: 20 }] },
  },
  gazes: { camera: { ParamEyeBallX: 0, ParamEyeBallY: 0 }, content: { ParamEyeBallX: 0.8, ParamEyeBallY: -0.1 } },
  visemes: { closed: { open: 0, form: 0 }, rest: { open: 0.08, form: 0 }, rounded: { open: 0.5, form: -1 }, open: { open: 1, form: 0.3 } },
  motion: {
    dynamics: {
      default: spring(2, 0.8), ParamAngleX: spring(1.6, 0.85), ParamAngleY: spring(2.5, 0.55), ParamAngleZ: spring(1.3, 0.8),
      ParamBodyX: spring(0.9, 0.9), ParamBodyZ: spring(0.9, 0.9), ParamBreath: spring(1.5, 1),
      ParamArmR: spring(1.6, 0.75), ParamArmL: spring(1.6, 0.75), ParamElbowR: spring(1.2, 0.7), ParamElbowL: spring(1.2, 0.7),
      ParamWristR: spring(2.2, 0.55), ParamWristL: spring(2.2, 0.55), ParamHandR: { snap: true }, ParamHandL: { snap: true },
      ParamEyeBallX: spring(7, 0.9), ParamEyeBallY: spring(7, 0.9), ParamEyeOpen: spring(5, 1), ParamEyeSmile: spring(4, 1),
      ParamBrowY: spring(4, 0.8), ParamBrowAngle: spring(3, 0.9),
    },
    idle: [
      { param: 'ParamBreath', amplitude: 0.5, period_frames: 132 },
      { param: 'ParamBodyX', amplitude: 0.35, period_frames: 260 },
      { param: 'ParamBodyZ', amplitude: 0.3, period_frames: 310, offset: 50 },
      { param: 'ParamAngleZ', amplitude: 0.22, period_frames: 190, offset: 20 },
      { param: 'ParamAngleY', amplitude: 0.1, period_frames: 150, offset: 70 },
      { param: 'ParamAngleX', amplitude: 0.05, period_frames: 230 },
      { param: 'ParamArmR', amplitude: 0.015, period_frames: 132, offset: 10 },
      { param: 'ParamArmL', amplitude: 0.015, period_frames: 132, offset: 10 },
      { param: 'ParamElbowR', amplitude: 0.02, period_frames: 170 },
      { param: 'ParamElbowL', amplitude: 0.02, period_frames: 190 },
    ],
    talk: { onset_quiet_frames: 8, nod: { param: 'ParamAngleY', impulse: 10 }, brow: { param: 'ParamBrowY', raise: 0.4, frames: 12 },
      bob: { param: 'ParamAngleY', amount: 0.25 } },
    saccade: { chance: 0.03, range: [0.35, 0.2] },
  },
  physics: { hair: { stiffness: 60, damping: 8 } },
  blink: { chance: 0.03, frames: 3 },
  // Canvas regions used by tests to check that a parameter only moves its own layers.
  regions: { face: [190, 120, 470, 450], eyes: [230, 270, 430, 345], mouth: [295, 376, 365, 416], upper_arm_r: [452, 575, 506, 640],
    forearm_r: [458, 720, 510, 800], forearm_l: [150, 720, 202, 800], hand_r: [440, 800, 530, 900], hem: [160, 860, 500, 900] },
  parts,
};

const profile = {
  character_id: 'host_hare', name: '晴', style_lock: ['墨蓝短外套', '藏青短发配一缕青色挑染', '青色眼睛', '青色领结', '头顶一根呆毛'],
  rig_ref: 'asset://<project>/host_rig/v1', voice_ref: 'asset://<project>/host_voice/v1',
  supported_angles: Object.keys(rig.angles), expressions: Object.keys(rig.expressions), gestures: Object.keys(rig.gestures),
  parameters: Object.entries(LIMITS).map(([parameter_id, [min, max]]) => ({ parameter_id, min, max })),
};

const rights = {
  holder: 'project owner', license: 'owner-original', original: true,
  source: 'Drawn in code in this repository (assets/default-host/build.ts); no third-party art, fonts or reference images were used.',
  author: 'Generated by Claude (AI) at the project owner\'s request on 2026-11-23',
  note: 'Usage stays pending until the owner clears it with `clear`. Copyright protection for AI-generated work differs by jurisdiction.',
};

writeFileSync(join(OUT, 'rig.json'), JSON.stringify(rig, null, 1) + '\n');
writeFileSync(join(OUT, 'profile.json'), JSON.stringify(profile, null, 2) + '\n');
writeFileSync(join(OUT, 'rights.json'), JSON.stringify(rights, null, 2) + '\n');

// ---- reference frame and preview sheet (settled poses: rest values with the gesture, expression, angle and gaze applied)
const { width: W, height: H } = rig.canvas;
const pose = (o: { gesture?: string; expression?: string; angle?: string; gaze?: string; params?: Record<string, number>; blink?: number } = {}) => {
  const base = initialState(rig, 'neutral', 1);
  const { oscillate: _, ...gesture } = (rig.gestures as any)[o.gesture ?? 'idle'];
  const params = { ...base.params, ...gesture, ...(rig.expressions as any)[o.expression ?? 'explaining'], ...(rig.angles as any)[o.angle ?? 'front'],
    ...(rig.gazes as any)[o.gaze ?? 'camera'], ...o.params };
  return render(rig, { ...base, blink: o.blink ?? 0, params });
};
writeFileSync(join(OUT, 'host.png'), png(rig, pose()));

const CELL_W = W / 2, CELL_H = H / 2;
const cells = [
  { bg: 'dark' }, { bg: 'light', gesture: 'explain' }, { bg: 'checker', gesture: 'point_right', gaze: 'content' },
  { bg: 'light', gesture: 'wave', expression: 'happy' }, { bg: 'dark', gesture: 'emphasize', expression: 'focused', params: { ParamMouthOpenY: 0.6 } },
  { bg: 'checker', angle: 'three_quarter', expression: 'curious' }, { bg: 'light', params: { ParamMouthOpenY: 1, ParamMouthForm: 0.3 } }, { bg: 'dark', blink: 2 },
];
const SW = CELL_W * 4, SH = CELL_H * 2, sheet = Buffer.alloc(SW * SH * 4);
const bgAt = (kind: string, x: number, y: number) => kind === 'dark' ? [24, 30, 44] : kind === 'light' ? [238, 240, 244]
  : ((Math.floor(x / 20) + Math.floor(y / 20)) % 2 ? [200, 200, 200] : [255, 255, 255]);
cells.forEach((cell, n) => {
  const rgba = pose(cell);
  const ox = (n % 4) * CELL_W, oy = Math.floor(n / 4) * CELL_H;
  for (let y = 0; y < CELL_H; y += 1) {
    for (let x = 0; x < CELL_W; x += 1) {
      const bg = bgAt(cell.bg, x, y), acc = [0, 0, 0];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = ((2 * y + dy) * W + 2 * x + dx) * 4, a = rgba[i + 3] / 255;
        for (let k = 0; k < 3; k += 1) acc[k] += (rgba[i + k] * a + bg[k] * (1 - a)) / 4;
      }
      const o = ((oy + y) * SW + ox + x) * 4;
      sheet[o] = Math.round(acc[0]); sheet[o + 1] = Math.round(acc[1]); sheet[o + 2] = Math.round(acc[2]); sheet[o + 3] = 255;
    }
  }
});
writeFileSync(join(OUT, 'preview.png'), png({ canvas: { width: SW, height: SH } }, sheet));
console.log(`wrote rig.json (${parts.length} parts, ${bones.length} bones), profile.json, rights.json, host.png, preview.png`);
