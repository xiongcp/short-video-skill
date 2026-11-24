// Builds the default original host "晴" (rig `vector-2d`): layered path art drawn in code in this repository, with no
// third-party art or reference images. Writes rig.json, profile.json, rights.json, host.png (neutral frame) and
// preview.png (dark / light / checkerboard backgrounds; front, three-quarter, mouth open, blink, pointing, arm raised).
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
  gold: [214, 182, 96],
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
const eye = (ex: number) => [
  { id: `eye_white_${ex}`, fill: C.sclera, d: ellipse(ex, 312, 30, 31), parallax: FEATURES, eye: { cy: 312, show: 'open' } },
  { id: `iris_${ex}`, fill: C.iris, d: ellipse(ex, 316, 22, 27), parallax: FEATURES, eye: { cy: 312, show: 'open' } },
  { id: `iris_top_${ex}`, fill: C.irisTop, d: ellipse(ex, 304, 22, 14), parallax: FEATURES, eye: { cy: 312, show: 'open' } },
  { id: `pupil_${ex}`, fill: C.pupil, d: ellipse(ex, 318, 9, 12), parallax: FEATURES, eye: { cy: 312, show: 'open' } },
  { id: `glint_${ex}`, fill: C.white, d: ellipse(ex - 8, 302, 6.5, 6.5), parallax: FEATURES, eye: { cy: 312, show: 'open' } },
  { id: `glint_small_${ex}`, fill: C.white, d: ellipse(ex + 9, 327, 3, 3), parallax: FEATURES, eye: { cy: 312, show: 'open' } },
  { id: `lash_${ex}`, fill: C.lash, parallax: FEATURES, eye: { cy: 312, show: 'open' },
    d: `M ${ex - 35} 302 C ${ex - 22} 274 ${ex + 22} 272 ${ex + 37} 296 L ${ex + 36} 305 C ${ex + 20} 284 ${ex - 20} 285 ${ex - 33} 309 Z` },
  { id: `lash_closed_${ex}`, fill: C.lash, parallax: FEATURES, eye: { cy: 312, show: 'closed' },
    d: `M ${ex - 32} 312 C ${ex - 15} 326 ${ex + 15} 326 ${ex + 32} 312 L ${ex + 32} 318 C ${ex + 15} 332 ${ex - 15} 332 ${ex - 32} 318 Z` },
];

const parts = [
  // back hair: lags the head most
  { id: 'hair_back', fill: C.hairDark, parallax: 10, hair: 1.0,
    d: `M 178 300 C 166 170 250 118 ${CX} 118 C 410 118 494 170 482 300 C 480 385 494 455 470 505 L 420 476 C 424 430 236 430 240 476 L 190 505 C 166 455 180 385 178 300 Z` },
  { id: 'neck', fill: C.skinShade, parallax: 4, d: poly([300, 405], [360, 405], [363, 502], [297, 502]) },
  // body
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
  { id: 'arm_left', fill: C.jacketShade, d: `M 138 600 C 140 566 192 562 196 596 L 188 900 L 140 900 Z` },
  // head
  { id: 'face', fill: C.skin, parallax: HEAD, d: `M 205 290 C 205 198 455 198 455 290 C 455 366 410 424 ${CX} 446 C 250 424 205 366 205 290 Z` },
  { id: 'face_shadow', fill: [242, 206, 192, 150], parallax: HEAD, d: `M 214 262 C 260 236 400 236 446 262 L 446 286 C 400 262 260 262 214 286 Z` },
  { id: 'blush_left', fill: C.blush, parallax: 30, d: ellipse(262, 372, 25, 11) },
  { id: 'blush_right', fill: C.blush, parallax: 30, d: ellipse(398, 372, 25, 11) },
  ...eye(280), ...eye(380),
  { id: 'nose', fill: [226, 176, 164], parallax: 38, d: poly([334, 350], [339, 362], [330, 364]) },
  { id: 'mouth_closed', fill: C.lip, parallax: FEATURES, mouth: { cy: 396, show: 'closed' },
    d: `M 313 391 C 323 401 337 401 347 391 L 348 395 C 338 406 322 406 312 395 Z` },
  { id: 'mouth_open', fill: C.mouth, parallax: FEATURES, mouth: { cy: 394, show: 'open' }, d: `M 312 386 C 318 382 342 382 348 386 C 350 404 340 412 ${CX} 412 C 320 412 310 404 312 386 Z` },
  { id: 'tongue', fill: C.tongue, parallax: FEATURES, mouth: { cy: 394, show: 'open' }, d: ellipse(CX, 405, 11, 6) },
  // front hair over the face, brows drawn over the bangs (anime convention)
  { id: 'side_lock_left', fill: C.hair, parallax: 22, hair: 0.8, d: `M 206 248 C 188 320 194 420 214 474 L 234 456 C 222 400 222 330 230 270 Z` },
  { id: 'side_lock_right', fill: C.hair, parallax: 22, hair: 0.8, d: mirror(`M 206 248 C 188 320 194 420 214 474 L 234 456 C 222 400 222 330 230 270 Z`) },
  { id: 'bangs', fill: C.hair, parallax: 26, hair: 0.5,
    d: `M 200 306 C 186 194 258 136 ${CX} 136 C 402 136 474 194 460 306 L 448 298 L 438 258 L 418 280 L 402 234 L 374 272 L 352 230 L 332 284 L 312 230 L 290 270 L 262 236 L 244 280 L 222 258 L 212 300 Z` },
  { id: 'teal_strand', fill: C.teal, parallax: 26, hair: 0.5, d: `M 262 236 L 272 196 C 278 220 286 246 290 270 Z` },
  { id: 'hair_shine', fill: C.hairShine, parallax: 24, hair: 0.5, d: `M 252 176 C 292 156 368 156 408 176 L 403 187 C 368 169 292 169 257 187 Z` },
  { id: 'ahoge', fill: C.hair, parallax: 24, hair: 1.5, d: `M ${CX} 140 C 322 108 346 92 364 98 C 348 104 340 120 338 140 Z` },
  { id: 'brow_left', fill: C.hairDark, parallax: FEATURES, d: `M 248 264 C 265 251 295 251 312 259 L 311 265 C 295 258 266 258 249 270 Z` },
  { id: 'brow_right', fill: C.hairDark, parallax: FEATURES, d: mirror(`M 248 264 C 265 251 295 251 312 259 L 311 265 C 295 258 266 258 249 270 Z`) },
  // right arm (viewer's right): hangs at ParamArmR 0, swings out and up to point at the content
  ...[
    { id: 'sleeve', fill: C.jacket, d: `M 444 548 C 444 520 496 520 496 548 L 492 800 L 448 800 Z` },
    { id: 'sleeve_shade', fill: C.jacketShade, d: poly([480, 560], [496, 560], [492, 800], [478, 800]) },
    { id: 'cuff', fill: C.shirt, d: poly([447, 790], [493, 790], [492, 808], [448, 808]) },
    { id: 'hand', fill: C.skin, d: ellipse(470, 832, 23, 27) },
    { id: 'finger', fill: C.skin, when: { param: 'ParamArmR', min: 0.3 }, d: `M 463 846 L 477 846 L 476 884 C 476 892 464 892 464 884 Z` },
  ].map((part) => ({ ...part, arm: { pivot: [470, 548], from: 0, to: -125 } })),
];

const rig = {
  rig: 'vector-2d', version: '1.0', name: '晴', canvas: { width: 820, height: 900 }, placement: { x: 80, y: 180 },
  poses: { neutral: { ParamAngleX: 0, ParamArmR: 0, ParamEyeOpen: 1, ParamMouthOpenY: 0 } },
  angles: { front: { ParamAngleX: 0 }, three_quarter: { ParamAngleX: 0.6 } },
  expressions: { explaining: { ParamEyeOpen: 1 }, focused: { ParamEyeOpen: 0.55 } },
  gestures: { idle: { ParamArmR: 0 }, point_right: { ParamArmR: 0.6 }, wave: { ParamArmR: 0.85, oscillate: { amplitude: 0.12, period_frames: 14 } } },
  visemes: { closed: 0, rest: 0.08, rounded: 0.5, open: 1 },
  physics: { hair: { stiffness: 60, damping: 8 } },
  blink: { chance: 0.03, frames: 3 },
  // Canvas regions used by tests to check that a parameter only moves its own layers.
  regions: { face: [190, 120, 470, 450], eyes: [230, 270, 430, 345], mouth: [295, 376, 365, 416] },
  parts,
};

const profile = {
  character_id: 'host_hare', name: '晴', style_lock: ['墨蓝短外套', '藏青短发配一缕青色挑染', '青色眼睛', '青色领结', '头顶一根呆毛'],
  rig_ref: 'asset://<project>/host_rig/v1', voice_ref: 'asset://<project>/host_voice/v1',
  supported_angles: ['front', 'three_quarter'], expressions: ['explaining', 'focused'], gestures: ['idle', 'point_right', 'wave'],
  parameters: [{ parameter_id: 'ParamAngleX', min: -1, max: 1 }, { parameter_id: 'ParamArmR', min: 0, max: 1 },
    { parameter_id: 'ParamEyeOpen', min: 0, max: 1 }, { parameter_id: 'ParamMouthOpenY', min: 0, max: 1 }],
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

// ---- reference frame and preview sheet
const { width: W, height: H } = rig.canvas;
const frame = (params: Record<string, number>, extra: Record<string, number> = {}) => {
  const base = initialState(rig, 'neutral', 1);
  return render(rig, { ...base, ...extra, params: { ...base.params, ...params } });
};
writeFileSync(join(OUT, 'host.png'), png(rig, frame({})));

const CELL_W = W / 2, CELL_H = H / 2;
const cells = [
  { bg: 'dark', params: {} }, { bg: 'light', params: {} }, { bg: 'checker', params: {} }, { bg: 'checker', params: { ParamAngleX: 0.6 } },
  { bg: 'light', params: { ParamMouthOpenY: 1 } }, { bg: 'light', params: {}, extra: { blink: 2 } }, { bg: 'dark', params: { ParamArmR: 0.6 } },
  { bg: 'checker', params: { ParamArmR: 1, ParamAngleX: 0.6, ParamMouthOpenY: 0.5 } },
];
const SW = CELL_W * 4, SH = CELL_H * 2, sheet = Buffer.alloc(SW * SH * 4);
const bgAt = (kind: string, x: number, y: number) => kind === 'dark' ? [24, 30, 44] : kind === 'light' ? [238, 240, 244]
  : ((Math.floor(x / 20) + Math.floor(y / 20)) % 2 ? [200, 200, 200] : [255, 255, 255]);
cells.forEach((cell, n) => {
  const rgba = frame(cell.params, cell.extra);
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
console.log(`wrote rig.json (${parts.length} parts), profile.json, rights.json, host.png, preview.png`);
