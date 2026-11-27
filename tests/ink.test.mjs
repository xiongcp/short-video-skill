import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaikin, circlePoints, hashSeed, inkStroke, markerFill, num, random, resample } from '../skills/topic-to-video/scripts/lib/ink.mjs';

const line = [[0, 0], [100, 0], [200, 40]];
const opts = { seed: 'sh01:l_leg', width: [8.8, 12], wobble: 1.6 };

test('random is seeded: the same seed gives the same numbers, all in [0, 1)', () => {
  const a = random('sh01');
  const b = random('sh01');
  const xs = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, () => b()));
  assert.ok(xs.every((v) => v >= 0 && v < 1));
  assert.notEqual(random('sh02')(), xs[0]);
  assert.equal(hashSeed('a'), 0xe40c292c); // FNV-1a
});

test('the same seed draws the same stroke and another seed a different one', () => {
  assert.equal(inkStroke(line, opts).d, inkStroke(line, opts).d);
  assert.notEqual(inkStroke(line, opts).d, inkStroke(line, { ...opts, seed: 'sh02:l_leg' }).d);
});

test('a stroke is thin at both ends and thick in the middle, within the width range', () => {
  const { widths } = inkStroke(line, opts);
  assert.ok(widths.every((w) => w >= 8.8 - 1e-9 && w <= 12 + 1e-9));
  assert.ok(Math.abs(widths[0] - 8.8) < 1e-9 && Math.abs(widths.at(-1) - 8.8) < 1e-9);
  assert.ok(Math.max(...widths) > 11.9);
});

test('the wobble never moves the line further than the setting', () => {
  const { base, center } = inkStroke(line, opts);
  const drift = center.map((p, i) => Math.hypot(p[0] - base[i][0], p[1] - base[i][1]));
  assert.ok(Math.max(...drift) <= 1.6 + 1e-9);
  assert.ok(Math.max(...drift) > 0.2, 'the line does wobble');
  const still = inkStroke(line, { ...opts, wobble: 0 });
  assert.deepEqual(still.center, still.base);
});

test('the outline is one closed path with round ends', () => {
  const { d } = inkStroke(line, opts);
  assert.match(d, /^M[^MZ]*A[^MZ]*A[^MZ]*Z$/);
  assert.doesNotMatch(d, /A[\d.]+ [\d.]+ 0 0 0 (-?[\d.]+ -?[\d.]+)L\1/, 'no zero-length line right after a round cap');
});

test('resample spaces points evenly along the line', () => {
  assert.deepEqual(resample([[0, 0], [10, 0], [10, 10]], 5), [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10]]);
});

test('a head circle goes past a full turn by the overdraw', () => {
  const pts = circlePoints(0, 0, 10, { seed: 'head', overdraw: 0.35, count: 48 });
  assert.equal(pts.length, 49);
  assert.ok(pts.every(([x, y]) => Math.abs(Math.hypot(x, y) - 10) < 1e-9));
  const turn = (a, b) => (((Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0])) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  assert.ok(Math.abs(turn(pts[0], pts.at(-1)) - 0.35) < 1e-9);
});

test('a marker fill is a closed path that stays within 1.3 times its shift', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const d = markerFill(square, { seed: 'card', shift: 2 });
  assert.match(d, /^M.*Z$/);
  const pts = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  pts.forEach(([x, y], i) => assert.ok(Math.abs(x - square[i][0]) <= 2.61 && Math.abs(y - square[i][1]) <= 2.61, `${i}`));
});

test('numbers are written with at most two decimals and no negative zero', () => {
  assert.equal(num(1.23456), '1.23');
  assert.equal(num(-0.001), '0');
  assert.equal(num(400), '400');
});

test('taper controls which end of the stroke is thin', () => {
  const end = inkStroke(line, { ...opts, taper: 'end' }).widths;
  assert.ok(Math.abs(end[0] - 12) < 1e-9 && Math.abs(end.at(-1) - 8.8) < 1e-9);
  const start = inkStroke(line, { ...opts, taper: 'start' }).widths;
  assert.ok(Math.abs(start[0] - 8.8) < 1e-9 && Math.abs(start.at(-1) - 12) < 1e-9);
  const none = inkStroke(line, { ...opts, taper: 'none' }).widths;
  assert.ok(none.every((w) => w === 12));
  const both = inkStroke(line, { ...opts, taper: 'both' }).widths;
  assert.ok(Math.abs(both[0] - 8.8) < 1e-9 && Math.abs(both.at(-1) - 8.8) < 1e-9);
});

test('chaikin keeps endpoints and rounds sharp corners to at most 45 degrees', () => {
  const pts = chaikin([[0, 0], [100, 0], [100, 100]], 2);
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts.at(-1), [100, 100]);
  assert.ok(pts.length > 3);
  for (let i = 1; i < pts.length - 1; i += 1) {
    const u = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
    const v = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]];
    const cos = Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))));
    assert.ok((Math.acos(cos) * 180) / Math.PI <= 45 + 1e-9, `corner ${i}`);
  }
});

test('wobble is capped at 2% of the polyline length on short lines', () => {
  const { base, center } = inkStroke([[0, 0], [30, 0]], { seed: 'short', width: [4, 6], wobble: 5 });
  const drift = center.map((p, i) => Math.hypot(p[0] - base[i][0], p[1] - base[i][1]));
  assert.ok(Math.max(...drift) <= 0.6 + 1e-9, `max drift ${Math.max(...drift)}`);
  assert.ok(Math.max(...drift) > 0.05);
});

test('inkStroke with smooth and taper is deterministic', () => {
  const o = { ...opts, smooth: 2, taper: 'end' };
  assert.equal(inkStroke(line, o).d, inkStroke(line, o).d);
});

test('inkStroke picks the same sample count across 1-ULP drift near a multiple of 6', () => {
  // Rotated 60 px limbs can differ by 1e-13 across arm64 and x86_64 libm; Math.ceil(total / 6) must not flip 10 vs 11.
  const below = inkStroke([[0, 0], [60 - 1e-12, 0]], opts);
  const above = inkStroke([[0, 0], [60 + 1e-12, 0]], opts);
  assert.equal(below.base.length, above.base.length);
  assert.equal(below.d, above.d);
});
