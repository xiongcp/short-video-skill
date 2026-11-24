// One-off export of the lite host "晴" from the vector-2d rig: four body poses and a 4×4 face atlas
// (expression × closed/half/open/blink) that the lite renderer layers over any body. The rig is tagged
// studio-v1; this script is removed with the Studio files right after the export.
//   node assets/default-host/export-sprites.ts
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialState, png, render } from '../../tools/bake_character/adapter.ts';

const HERE = import.meta.dirname;
const OUT = join(HERE, '../../skills/topic-to-video/assets/host');
const rig = JSON.parse(readFileSync(join(HERE, 'rig.json'), 'utf8'));
const { width: W, height: H } = rig.canvas;

const GESTURES = ['idle', 'point_right', 'wave', 'emphasize'];
const EXPRESSIONS = ['explaining', 'focused', 'happy', 'curious'];
const COLUMNS = ['closed', 'half', 'open', 'blink'];
const MOUTHS: Record<string, Record<string, number>> = {
  closed: { ParamMouthOpenY: 0, ParamMouthForm: 0 },
  half: { ParamMouthOpenY: 0.5, ParamMouthForm: 0.15 },
  open: { ParamMouthOpenY: 1, ParamMouthForm: 0.3 },
};
// The head must not move between frames, or face cells would not line up with the bodies.
const STILL = { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0, ParamBodyX: 0, ParamBodyZ: 0 };

function frame(gesture: string, expression: string, column: string): Buffer {
  const base = initialState(rig, 'neutral', 1);
  const { oscillate: _, ...pose } = rig.gestures[gesture];
  const params = { ...base.params, ...pose, ...rig.expressions[expression], ...rig.gazes.camera, ...(MOUTHS[column] ?? MOUTHS.closed), ...STILL };
  return render(rig, { ...base, blink: column === 'blink' ? 2 : 0, params });
}

const pixel = (buf: Buffer, x: number, y: number) => buf.readUInt32BE((y * W + x) * 4);

const bodies: Record<string, Buffer> = Object.fromEntries(GESTURES.map((g) => [g, frame(g, 'explaining', 'closed')]));
const faces = new Map<string, Buffer>();
for (const e of EXPRESSIONS) for (const c of COLUMNS) faces.set(`${e}/${c}`, frame('idle', e, c));

// Smallest rectangle holding every pixel an expression, mouth or blink changes, padded by 4 px.
let x0 = W, y0 = H, x1 = -1, y1 = -1;
for (const buf of faces.values()) {
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (pixel(buf, x, y) !== pixel(bodies.idle, x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
}
if (x1 < 0) throw new Error('expressions do not change any pixel');
const PAD = 4;
const rx = Math.max(0, x0 - PAD), ry = Math.max(0, y0 - PAD);
const rw = Math.min(W - 1, x1 + PAD) - rx + 1, rh = Math.min(H - 1, y1 + PAD) - ry + 1;
const inside = (fn: (x: number, y: number) => void) => { for (let y = ry; y < ry + rh; y += 1) for (let x = rx; x < rx + rw; x += 1) fn(x, y); };

// Gestures must leave the face rectangle untouched, and every face cell must be opaque there.
for (const g of GESTURES) inside((x, y) => { if (pixel(bodies[g], x, y) !== pixel(bodies.idle, x, y)) throw new Error(`gesture ${g} changes face pixel ${x},${y}`); });
for (const [key, buf] of faces) inside((x, y) => { if (buf[(y * W + x) * 4 + 3] !== 255) throw new Error(`face ${key} is transparent at ${x},${y}`); });

const atlas = Buffer.alloc(4 * rw * 4 * rh * 4);
EXPRESSIONS.forEach((e, row) => COLUMNS.forEach((c, col) => {
  const buf = faces.get(`${e}/${c}`)!;
  for (let y = 0; y < rh; y += 1) {
    const src = ((ry + y) * W + rx) * 4;
    const dst = ((row * rh + y) * 4 * rw + col * rw) * 4;
    buf.copy(atlas, dst, src, src + rw * 4);
  }
}));

mkdirSync(OUT, { recursive: true });
const write = (file: string, data: Buffer) => {
  writeFileSync(join(OUT, file), data);
  return { file, sha256: createHash('sha256').update(data).digest('hex') };
};
const manifest = {
  host: 'hare',
  name: '晴',
  source: {
    rig: 'assets/default-host/rig.json',
    rig_commit: execFileSync('git', ['rev-parse', 'studio-v1^{commit}'], { cwd: HERE, encoding: 'utf8' }).trim(),
    tag: 'studio-v1',
    script: 'assets/default-host/export-sprites.ts',
  },
  canvas: { width: W, height: H },
  bodies: Object.fromEntries(GESTURES.map((g) => [g, write(`body-${g}.png`, png(rig, bodies[g]))])),
  faces: { ...write('faces.png', png({ canvas: { width: 4 * rw, height: 4 * rh } }, atlas)), rect: [rx, ry, rw, rh], rows: EXPRESSIONS, columns: COLUMNS },
  mouth_params: MOUTHS,
  notes: ['curious 的头部倾斜在导出时去掉了，需要时由渲染层整体旋转。', '眨眼格为闭口。'],
};
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote 4 bodies and a ${4 * rw}×${4 * rh} face atlas (rect ${rx},${ry},${rw},${rh}) to ${OUT}`);
