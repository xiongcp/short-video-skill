import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drawHost, forwardKinematics } from '../skills/topic-to-video/scripts/lib/rig.mjs';
import {
  evaluateHostAt,
  inferSentenceBeat,
  resolveStandX,
  simulateScarfSpring,
  solveTwoBoneIK,
  tweenDuration,
  tweenPoseAngles,
  walkFrame,
} from '../skills/topic-to-video/scripts/lib/motion.mjs';

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/assets/host/manifest.json'), 'utf8'));
const H = manifest.height_px;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('two-bone analytical IK hits reachable targets within 0.5 px and aims straight when unreachable', () => {
  const origin = [100, 100];
  const target = [180, 140];
  const res = solveTwoBoneIK(origin, target, 64, 60, { bendSign: -1 });
  assert.ok(dist(res.end, target) <= 0.5, `reachable err ${dist(res.end, target)}`);
  assert.ok(Math.abs(dist(origin, res.mid) - 64) < 1e-6);
  assert.ok(Math.abs(dist(res.mid, res.end) - 60) < 1e-6);

  const farTarget = [400, 100];
  const far = solveTwoBoneIK(origin, farTarget, 64, 60, { bendSign: -1 });
  assert.ok(Math.abs(dist(origin, far.end) - 124) < 1e-6, 'arm extends fully');
  assert.ok(Math.abs(far.end[1] - 100) < 1e-6, 'aims directly toward far target');
});

test('tweenDuration scales with angle amplitude and tweenPoseAngles staggers torso before arm and forearm', () => {
  const from = { waist: 0, l_shoulder: 10, l_elbow: 10 };
  const smallTo = { waist: 5, l_shoulder: 20, l_elbow: 15 };
  const bigTo = { waist: 15, l_shoulder: 120, l_elbow: 90 };
  const dSmall = tweenDuration(from, smallTo);
  const dBig = tweenDuration(from, bigTo);
  assert.ok(dSmall >= 0.25 && dSmall <= 0.5);
  assert.ok(dBig > dSmall && dBig <= 0.5);

  // At t = 0.03s: torso has started moving, upper arm (delay 0.04s) and forearm (delay 0.08s) have not
  const at03 = tweenPoseAngles(manifest, from, bigTo, 0.03, { duration: 0.4 });
  assert.ok(at03.waist > 0, 'torso leads');
  assert.equal(at03.l_shoulder, 10, 'upper arm waits 0.04s');
  assert.equal(at03.l_elbow, 10, 'forearm waits 0.08s');

  // With anticipation + overshoot (pointing), angle dips before rising and overshoots past target
  const dip = tweenPoseAngles(manifest, from, bigTo, 0.08, { duration: 0.4, anticipate: true, overshoot: true });
  const peak = tweenPoseAngles(manifest, from, bigTo, 0.34, { duration: 0.4, anticipate: true, overshoot: true });
  assert.ok(dip.l_shoulder < 10, `expected anticipation dip < 10, got ${dip.l_shoulder}`);
  assert.ok(peak.l_shoulder > 120, `expected overshoot > 120, got ${peak.l_shoulder}`);
});

test('procedural walk keeps the stance foot planted within 0.5 px and bobs pelvis smoothly', () => {
  const ground = 930;
  const f1 = walkFrame(manifest, 0.1, { x: 400, ground, facing: 1 });
  const f2 = walkFrame(manifest, 0.2, { x: 400 + 0.05 * 0.9 * H, ground, facing: 1 });
  assert.ok(f1.stanceFoot && f2.stanceFoot);
  assert.ok(Math.abs(f1.stanceFootY - ground) <= 0.5, `stance foot y ${f1.stanceFootY} on ground ${ground}`);
  assert.ok(Math.abs(f2.stanceFootY - ground) <= 0.5);
});

test('scarf spring uses fixed 1/240s step so output is identical regardless of frame rate', () => {
  const vel = (t) => (t < 0.5 ? 250 : 0);
  const a = simulateScarfSpring(manifest, vel, 0.5);
  const b = simulateScarfSpring(manifest, vel, 0.5);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, manifest.scarf.tails.map((t) => t.angle));
});

test('resolveStandX places host 60 px outside target element or at preset spots clamped to [120, 1800]', () => {
  const elements = [{ index: 0, label: 'A', bbox: { x: 700, y: 100, w: 300, h: 160 } }];
  assert.equal(resolveStandX('left', 960, elements), 320);
  assert.equal(resolveStandX('center', 320, elements), 960);
  assert.equal(resolveStandX('right', 320, elements), 1600);
  assert.equal(resolveStandX(0, 320, elements), 640); // approaching from left -> left edge - 60
  assert.equal(resolveStandX(0, 1500, elements), 1060); // approaching from right -> right edge + 60
});

test('resolveStandX steps past a wider object underneath when both spots beside a stacked object are blocked', () => {
  // A cup stacked on a table: both spots beside the cup fall on the table, so the host stands just outside the table.
  const elements = [
    { index: 0, prop: 'table', bbox: { x: 800, y: 700, w: 320, h: 230 }, standSpots: { left: 730, right: 1190 } },
    { index: 1, prop: 'cup', bbox: { x: 920, y: 620, w: 80, h: 80 }, standSpots: { left: 850, right: 1070 } },
  ];
  assert.equal(resolveStandX(1, 1600, elements), 1190, 'from the right: just outside the table');
  assert.equal(resolveStandX(1, 320, elements), 730, 'from the left: just outside the table');
});

test('evaluateHostAt drives move, jump arc, continuous lip-sync and deterministic SVG', () => {
  const plan = {
    seed: 'sh01',
    durationSec: 4,
    startState: { x: 320, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' },
    cues: [
      { timeMs: 300, do: 'move', target: 0 },
      { timeMs: 1800, do: 'gesture', target: 'jump' },
    ],
    elements: [{ index: 0, label: '节点', bbox: { x: 800, y: 120, w: 240, h: 160 } }],
    sentences: [{ startMs: 0, endMs: 4000, text: '这到底为什么这么快？' }],
  };
  const midJump = evaluateHostAt(manifest, plan, 2.15, { open: 0.8, width: 0.7, nod: 0 });
  assert.ok(midJump.lift > 0.04, `airborne lift ${midJump.lift}`);
  assert.ok(midJump.x > 600, `walked to element: x=${midJump.x}`);
  const svg1 = drawHost(manifest, midJump);
  const svg2 = drawHost(manifest, midJump);
  assert.equal(svg1, svg2);
  assert.ok(svg1.includes('data-mouth-open="1"'), 'speaking mouth rendered');
});

test('every sentence gets a distinct host action beat and speech-driven conversational arm motion', () => {
  assert.equal(inferSentenceBeat('还要从头下载吗？', { index: 0, prevGesture: 'idle' }).gesture, 'lean_in');
  assert.equal(inferSentenceBeat('记住这三种动作！', { index: 1, prevGesture: 'lean_in' }).gesture, 'emphasize');
  assert.notEqual(
    inferSentenceBeat('第一句讲解。', { index: 0, prevGesture: 'idle' }).gesture,
    inferSentenceBeat('第二句继续讲。', { index: 1, prevGesture: 'present' }).gesture,
  );

  const plan = {
    seed: 'sh05',
    durationSec: 6,
    startState: { x: 320, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' },
    cues: [], // no explicit gesture cues at all
    elements: [{ index: 0, label: '缓存', bbox: { x: 700, y: 120, w: 300, h: 140 } }],
    sentences: [
      { index: 0, startMs: 0, endMs: 2800, text: '副本过期之后还能用吗？' },
      { index: 1, startMs: 3100, endMs: 5800, text: '记住关键一步，先询问服务器！' },
    ],
  };
  const s0 = evaluateHostAt(manifest, plan, 1.2, { open: 0.7, width: 0.5, nod: 0 });
  const s1 = evaluateHostAt(manifest, plan, 4.2, { open: 0.7, width: 0.5, nod: 0 });
  assert.notEqual(s0.gesture, 'idle', 'sentence 0 automatically performs an active gesture');
  assert.notEqual(s1.gesture, s0.gesture, 'sentence 1 transitions to a distinct action beat');

  // Speech-driven conversational arm motion moves forearm compared to silent pause
  const silent = evaluateHostAt(manifest, plan, 4.2, { open: 0, width: 0.5, nod: 0 });
  const speaking = evaluateHostAt(manifest, plan, 4.35, { open: 0.85, width: 0.5, nod: 0 });
  assert.notEqual(silent.angles.l_elbow, speaking.angles.l_elbow, 'arm moves expressively while speaking');
});
