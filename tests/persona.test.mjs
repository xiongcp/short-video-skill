import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drawHost, resolvePose } from '../skills/topic-to-video/scripts/lib/rig.mjs';
import { evaluateHostAt } from '../skills/topic-to-video/scripts/lib/motion.mjs';

// 小青人设设计 (H): the 呆毛, bigger faces, amazed, five persona gestures, outfits, auto beats and fidgets.
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/assets/host/manifest.json'), 'utf8'));
const H = manifest.height_px;
const R = (manifest.joints.head.length * H) / 2;
const draw = (state) => drawHost(manifest, { gesture: 'idle', expr: 'explaining', x: 400, ground: 930, seed: 'sh01', ...state });
const START = { x: 320, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' };
const plan = (cues, extra = {}) => ({
  seed: 'sh07', durationSec: 6, startState: START, cues, elements: [],
  sentences: [{ index: 0, startMs: 0, endMs: 5800, text: '讲一句。' }], ...extra,
});
const NEW_GESTURES = ['snap', 'lean_in', 'startle', 'double_take', 'scratch_head'];

test('the five persona gestures are written inside the joint ranges', () => {
  for (const g of NEW_GESTURES) {
    const pose = resolvePose(manifest, g);
    for (const [joint, deg] of Object.entries(pose.angles)) {
      const [lo, hi] = manifest.joints[joint].range;
      assert.ok(deg >= lo && deg <= hi, `${g} ${joint} ${deg}`);
    }
  }
  assert.deepEqual(NEW_GESTURES.map((g) => resolvePose(manifest, g).type), ['once', 'hold', 'once', 'once', 'once']);
  assert.deepEqual(['snap', 'startle', 'double_take', 'scratch_head'].map((g) => resolvePose(manifest, g).seconds), [0.7, 0.8, 1, 1.2]);
});

test('a persona once gesture plays, then the host goes back to the hold gesture', () => {
  for (const g of ['snap', 'startle', 'double_take', 'scratch_head']) {
    const p = plan([{ sentence: 0, do: 'gesture', target: 'present', timeMs: 0 }, { sentence: 0, do: 'gesture', target: g, timeMs: 1000 }]);
    assert.equal(evaluateHostAt(manifest, p, 1.2).gesture, g);
    assert.equal(evaluateHostAt(manifest, p, 1 + resolvePose(manifest, g).seconds + 0.35).gesture, 'present');
  }
});

test('amazed draws two star eyes, a grin and the sparkle', () => {
  const svg = draw({ expr: 'amazed' });
  assert.equal((svg.match(/data-eye="star"/g) ?? []).length, 2);
  assert.match(svg, /data-symbol="sparkle"/);
  assert.equal(manifest.expressions.amazed.mouth, 'grin');
});

test('faces are 25% stronger than rig v2: brow angle, brow lift and eye scale', () => {
  const v2 = {
    explaining: [-4, 0], focused: [12, -0.006], happy: [-8, 0.012], curious: [0, 0.004],
    surprised: [-6, 0.025], worried: [-18, 0.01], frustrated: [20, -0.008], proud: [4, 0],
  };
  for (const [expr, [angle, lift]] of Object.entries(v2)) {
    const brow = manifest.expressions[expr].brow;
    assert.ok(Math.abs(brow.angle - 1.25 * angle) <= 0.01, `${expr} angle ${brow.angle}`);
    assert.ok(Math.abs(brow.lift - 1.25 * lift) <= 0.001, `${expr} lift ${brow.lift}`);
  }
  manifest.expressions.curious.eye_scale.forEach((s, i) => assert.ok(Math.abs(s - (1 + ([1.25, 0.8][i] - 1) * 1.25)) <= 0.01, `eye ${i}`));
});

test('surprised, happy and amazed stretch the head 6%; worried and frustrated squash it', () => {
  const squash = Object.fromEntries(Object.entries(manifest.expressions).map(([e, x]) => [e, x.squash ?? 0]));
  assert.deepEqual(squash, { explaining: 0, focused: 0, happy: 0.06, curious: 0, surprised: 0.06, worried: -0.06, frustrated: -0.06, proud: 0, amazed: 0.06 });
});

test('emotion symbols are drawn 1.3 times larger around their anchor', () => {
  assert.equal(manifest.figure.symbol_scale, 1.3);
  for (const expr of ['curious', 'surprised', 'worried', 'frustrated', 'proud', 'amazed']) {
    assert.match(draw({ expr }), /scale\(1\.3\) translate\([^)]*\)"><g data-symbol="/, expr);
  }
});
