import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowArrowEnds, frameFor, FRAMES, isPortrait, outputSubdir, RATIOS, sizeFor, textBox, textOutsideSafe } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { STAGE_BOUNDS, STAGE_SLOTS } from '../skills/topic-to-video/scripts/lib/stage.mjs';
import { DIAGRAM_ZONES } from '../skills/topic-to-video/scripts/lib/templates.mjs';
import { GROUND_Y } from '../skills/topic-to-video/scripts/lib/world.mjs';

const L = FRAMES['16:9'];
const P = FRAMES['9:16'];
const inside = (b, s) => b.x >= s.x - 1e-6 && b.y >= s.y - 1e-6 && b.x + b.w <= s.x + s.w + 1e-6 && b.y + b.h <= s.y + s.h + 1e-6;

test('16:9 geometry is exactly the constants the modules used before (竖屏设计 §4.2)', () => {
  assert.deepEqual([L.width, L.height, L.ground, L.hostHome], [1920, 1080, 930, 320]);
  assert.deepEqual(L.center, [960, 540]);
  assert.deepEqual(L.spots, { left: 320, center: 960, right: 1600 });
  assert.deepEqual(L.walk, { minX: 120, maxX: 1800 });
  assert.deepEqual(L.focusDefault, [1240, 320]);
  assert.deepEqual(L.zones, { 'host-left': { x: 640, y: 48, w: 1200, h: 400 }, full: { x: 120, y: 120, w: 1680, h: 740 } });
  assert.deepEqual(L.stage.slots, { left: 240, 'mid-left': 600, center: 960, 'mid-right': 1320, right: 1680 });
  assert.deepEqual(L.stage.bounds, { minX: 120, maxX: 1800, titleTop: 48, titleBottom: 150, airTopMin: 160, airBottomMax: 470, midDefaultBottom: 762, subtitleSafeY: 950, gap: 40, hostClearWidth: 200, minScale: 0.6 });
  assert.deepEqual([L.stage.hostMinX, L.stage.hostMaxX], [200, 1720]);
  assert.deepEqual(L.stage.heading, { x: 960, y: 92, underlineY: 130, fontSize: 52 });
  assert.deepEqual([L.subtitle.x, L.subtitle.y, L.subtitle.fontSize, L.subtitle.maxLines], [960, 1012, 44, 1]);
});

test('module constants are aliases of the 16:9 geometry', () => {
  assert.equal(STAGE_SLOTS, L.stage.slots);
  assert.equal(STAGE_BOUNDS, L.stage.bounds);
  assert.equal(DIAGRAM_ZONES, L.zones);
  assert.equal(GROUND_Y, L.ground);
  assert.ok(Object.isFrozen(L.stage.bounds) && Object.isFrozen(P.zones.full));
});

test('9:16 text regions stay inside the text-safe box', () => {
  assert.deepEqual([P.width, P.height, P.ground], [1080, 1920, 1180]);
  assert.deepEqual(P.textSafe, { x: 64, y: 250, w: 846, h: 1190 });
  for (const z of Object.values(P.zones)) assert.ok(inside(z, P.textSafe), JSON.stringify(z));
  const h = P.stage.heading;
  assert.ok(inside(textBox({ text: '一二三四五六七八九十一二三四', x: h.x, y: h.y, fontSize: h.fontSize }), P.textSafe), 'heading of 14 chars');
  const s = P.subtitle;
  for (const y of [s.y - s.lineHeight / 2, s.y + s.lineHeight / 2]) {
    assert.ok(inside(textBox({ text: '一二三四五六七八九十一二', x: s.x, y, fontSize: s.fontSize }), P.textSafe), `subtitle line at ${y}`);
  }
  const b = P.stage.bounds;
  assert.ok(b.minX >= P.textSafe.x && b.maxX <= P.textSafe.x + P.textSafe.w && b.airTopMin >= P.textSafe.y);
  for (const x of Object.values(P.stage.slots)) assert.ok(x >= b.minX && x <= b.maxX);
  for (const x of Object.values(P.spots)) assert.ok(x >= P.walk.minX && x <= P.walk.maxX);
});

test('frameFor, isPortrait, outputSubdir and sizeFor', () => {
  assert.deepEqual(RATIOS, ['16:9', '9:16']);
  assert.equal(frameFor(), L);
  assert.equal(frameFor(null), L);
  assert.equal(frameFor('9:16'), P);
  assert.throws(() => frameFor('1:1'), /未知画幅 1:1/);
  assert.equal(isPortrait(P), true);
  assert.equal(isPortrait(L), false);
  assert.equal(outputSubdir('16:9', '16:9'), '');
  assert.equal(outputSubdir(undefined, '16:9'), '');
  assert.equal(outputSubdir('16:9', '9:16'), '9x16');
  assert.equal(outputSubdir('9:16', '16:9'), '16x9');
  assert.deepEqual(sizeFor({ width: 1920, height: 1080 }, P), { width: 1080, height: 1920 });
  assert.deepEqual(sizeFor({ width: 960, height: 540 }, P), { width: 540, height: 960 });
  assert.deepEqual(sizeFor({ width: 1920, height: 1080 }, L), { width: 1920, height: 1080 });
});

test('textBox measures CJK as one font size and Latin as 0.6; textOutsideSafe only flags portrait', () => {
  assert.deepEqual(textBox({ text: '缓存AB', x: 100, y: 200, fontSize: 40 }), { x: 36, y: 180, w: 128, h: 40 });
  assert.deepEqual(textBox({ text: 'AB', x: 100, y: 200, fontSize: 40, align: 'start' }), { x: 100, y: 180, w: 48, h: 40 });
  const items = [
    { key: 'ok', text: '标题', x: 540, y: 300, fontSize: 52 },
    { key: 'top', text: '标题', x: 540, y: 120, fontSize: 52 },
    { key: 'right', text: '很长很长的标签', x: 900, y: 800, fontSize: 36 },
    { key: 'hidden', text: '看不见', x: 540, y: 100, fontSize: 52, opacity: 0 },
  ];
  assert.deepEqual(textOutsideSafe(items, P), ['top', 'right']);
  assert.deepEqual(textOutsideSafe(items, L), []);
});

test('flowArrowEnds runs horizontal arrows side by side and vertical arrows when stacked', () => {
  assert.deepEqual(flowArrowEnds({ x: 0, y: 0, w: 100, h: 50 }, { x: 200, y: 0, w: 100, h: 50 }), { from: [108, 25], to: [192, 25], bend: [0, -14] });
  assert.deepEqual(flowArrowEnds({ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 100, w: 100, h: 50 }), { from: [50, 58], to: [50, 92], bend: [14, 0] });
});
