import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { SCENE_NAMES, sceneBackgroundSvg } from '../skills/topic-to-video/scripts/lib/world.mjs';

const P = FRAMES['9:16'];
/** Every [x, y] point in the path data of decoration paths, skipping the ground line. */
function points(svg) {
  const out = [];
  for (const m of svg.matchAll(/<path([^>]*)\sd="([^"]+)"/g)) {
    if (m[1].includes('data-ground')) continue;
    const nums = m[2].match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  }
  return out;
}
const portraitSvg = (scene) => sceneBackgroundSvg(scene, { seed: 't', ground: P.ground, width: P.width, height: P.height, frame: P });

test('portrait floor decorations stay out of the central performance zone x 360–720', () => {
  for (const scene of SCENE_NAMES) {
    for (const [x, y] of points(portraitSvg(scene))) {
      if (y < 470) continue; // ceiling band
      assert.ok(x <= 360 || x >= 720, `${scene}: (${x}, ${y}) inside the central zone`);
    }
  }
});

test('portrait decorations stay inside the frame and ceiling groups sit below the top safe line', () => {
  for (const scene of SCENE_NAMES) {
    for (const [x, y] of points(portraitSvg(scene))) {
      assert.ok(x >= -10 && x <= 1090, `${scene}: x ${x}`);
      assert.ok(y >= 240 && y <= 1190, `${scene}: y ${y}`);
    }
  }
});

test('portrait left floor group keeps its proportions at 0.7 (no stretching)', () => {
  const box = (pts) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const land = box(points(sceneBackgroundSvg('kitchen', { seed: 't' })).filter(([x, y]) => x < 560 && y > 40));
  const port = box(points(portraitSvg('kitchen')).filter(([x, y]) => x < 360 && y >= 470));
  assert.ok(Math.abs(port.w / land.w - 0.7) < 0.03, `w ratio ${port.w / land.w}`);
  assert.ok(Math.abs(port.h / land.h - 0.7) < 0.03, `h ratio ${port.h / land.h}`);
});

test('without a portrait frame the output is unchanged', () => {
  for (const scene of SCENE_NAMES) {
    assert.equal(sceneBackgroundSvg(scene, { seed: 't', frame: FRAMES['16:9'] }), sceneBackgroundSvg(scene, { seed: 't' }));
  }
});
