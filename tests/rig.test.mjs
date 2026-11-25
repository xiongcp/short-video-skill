import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clampAngles, drawHost, forwardKinematics, JOINTS, poseAngles, propTransform, resolvePose, scarfShape, VIEWS } from '../skills/topic-to-video/scripts/lib/rig.mjs';

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/assets/host/manifest.json'), 'utf8'));
const H = manifest.height_px;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const segment = (p, a, b) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
// Every gesture with its own pose (point_right is an alias), plus the walk key pose.
const POSES = [...Object.keys(manifest.poses).filter((g) => !manifest.poses[g].alias), 'walk'];
const stand = (gesture, prop) => {
  const pose = resolvePose(manifest, gesture);
  return forwardKinematics(manifest, poseAngles(manifest, gesture, prop, pose.view), { view: pose.view, x: 400, ground: 930, lift: pose.lift ?? 0 });
};

const draw = (state) => drawHost(manifest, { gesture: 'idle', expr: 'explaining', x: 400, ground: 930, seed: 'sh01', ...state });

test('forward kinematics keeps every bone at its length in every view and facing', () => {
  const bones = [['pelvis', 'spine_mid', 'waist'], ['spine_mid', 'neck_base', 'chest'], ['neck_base', 'head_base', 'neck'],
    ...['l', 'r'].flatMap((s) => [['neck_base', `${s}_elbow`, `${s}_shoulder`], [`${s}_elbow`, `${s}_wrist`, `${s}_elbow`],
      [`${s}_wrist`, `${s}_hand`, `${s}_wrist`], ['pelvis', `${s}_knee`, `${s}_hip`], [`${s}_knee`, `${s}_ankle`, `${s}_knee`]])];
  for (const view of VIEWS) {
    for (const facing of [1, -1]) {
      const { points } = forwardKinematics(manifest, manifest.poses.think.angles, { view, facing });
      for (const [a, b, joint] of bones) assert.ok(Math.abs(dist(points[a], points[b]) - manifest.joints[joint].length * H) < 1e-9, `${view} ${facing} ${joint}`);
      assert.ok(Math.abs(dist(points.head_base, points.head_center) - (manifest.joints.head.length * H) / 2) < 1e-9);
    }
  }
});

test('standing straight, the host is H tall with shoulders at 0.725 H and soles on the ground', () => {
  const { points, R } = forwardKinematics(manifest, {}, { view: 'side', ground: 930 });
  const sole = (manifest.figure.foot[1] * H) / 2;
  assert.ok(Math.abs(points.l_ankle[1] + sole - 930) < 1e-9);
  assert.ok(Math.abs(points.l_ankle[1] - (points.head_center[1] - R) - H) < 1e-9);
  assert.ok(Math.abs(points.l_ankle[1] - points.neck_base[1] - 0.725 * H) < 1e-9);
});

test('facing left mirrors the figure around the pelvis', () => {
  const opts = { view: 'three_quarter', x: 500, ground: 930 };
  const right = forwardKinematics(manifest, manifest.poses.point.angles, opts);
  const left = forwardKinematics(manifest, manifest.poses.point.angles, { ...opts, facing: -1 });
  for (const [k, [x, y]] of Object.entries(right.points)) {
    assert.ok(Math.abs(left.points[k][0] - (1000 - x)) < 1e-9, k);
    assert.equal(left.points[k][1], y, k);
  }
});

test('angles are clamped to the joint ranges and a missing joint is 0', () => {
  const a = clampAngles(manifest, { l_elbow: -20, l_knee: 200, head: 10 });
  assert.deepEqual(Object.keys(a), JOINTS);
  assert.deepEqual([a.l_elbow, a.l_knee, a.head, a.waist], [0, 150, 10, 0]);
});

test('every pose and every prop arm stays inside the joint ranges without clamping', () => {
  const inRange = (joint, deg, what) => {
    const [lo, hi] = manifest.joints[joint].range;
    assert.ok(deg >= lo && deg <= hi, `${what} ${joint} ${deg}`);
  };
  for (const gesture of POSES) {
    const pose = resolvePose(manifest, gesture);
    for (const angles of [pose.angles, ...Object.values(pose.view_angles ?? {})]) {
      for (const [joint, deg] of Object.entries(angles)) inRange(joint, deg, gesture);
    }
  }
  for (const [prop, p] of Object.entries(manifest.props)) for (const [joint, deg] of Object.entries(p.arm ?? {})) inRange(`r_${joint}`, deg, prop);
});

test('line of action: no pose mirrors its left and right limbs', () => {
  for (const gesture of POSES) {
    const { angles } = resolvePose(manifest, gesture);
    const differs = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'].some((j) => (angles[`l_${j}`] ?? 0) !== (angles[`r_${j}`] ?? 0));
    assert.ok(differs, gesture);
  }
});

test('clear silhouette: hands stay at least 0.08 H from the torso, except think and shrug', () => {
  for (const gesture of POSES.filter((g) => !['think', 'shrug'].includes(g))) {
    const { points: p } = stand(gesture);
    for (const s of ['l', 'r']) assert.ok(segment(mid(p[`${s}_wrist`], p[`${s}_hand`]), p.pelvis, p.neck_base) >= 0.08 * H, `${gesture} ${s}`);
  }
});

test('clear silhouette: raised arms pass beside the head, not through it, except the hand on the chin in think', () => {
  for (const gesture of POSES.filter((g) => g !== 'think')) {
    const { points: p, R } = stand(gesture);
    for (const s of ['l', 'r']) assert.ok(dist(p[`${s}_elbow`], p.head_center) >= 1.2 * R, `${gesture} ${s}`);
  }
});

test('balance: the pelvis is over the support foot, between both feet, or on the ground when sitting', () => {
  const sole = (manifest.figure.foot[1] * H) / 2;
  for (const gesture of POSES) {
    const pose = resolvePose(manifest, gesture);
    const { points: p } = stand(gesture);
    const span = (feet) => feet.flatMap((s) => [p[`${s}_ankle`][0], p[`${s}_toe`][0]]);
    if (pose.support === 'seat') {
      assert.ok(Math.abs(p.pelvis[1] - 930) <= 0.02 * H, gesture);
      continue;
    }
    const xs = span(pose.support === 'both' ? ['l', 'r'] : [pose.support]);
    assert.ok(p.pelvis[0] >= Math.min(...xs) - 0.02 * H && p.pelvis[0] <= Math.max(...xs) + 0.02 * H, gesture);
    const lowest = Math.max(...['l', 'r'].flatMap((s) => [p[`${s}_ankle`][1], p[`${s}_toe`][1]])) + sole;
    assert.ok(Math.abs(lowest - (930 - (pose.lift ?? 0) * H)) < 1e-9, `${gesture} touches the ground`);
  }
});

test('point_right resolves to the point pose, walk to its key pose, and an unknown gesture is a clear error', () => {
  assert.deepEqual(resolvePose(manifest, 'point_right'), resolvePose(manifest, 'point'));
  assert.equal(resolvePose(manifest, 'walk'), manifest.motions.walk.key);
  assert.throws(() => resolvePose(manifest, 'dance'), /unknown gesture dance/);
});

test('a prop for the other hand raises that arm; a prop for the acting hand keeps the pose', () => {
  assert.equal(poseAngles(manifest, 'idle', 'bulb').r_shoulder, manifest.props.bulb.arm.shoulder);
  assert.deepEqual(poseAngles(manifest, 'point', 'pointer'), poseAngles(manifest, 'point'));
});

test('point_right draws the same pose as point', () => {
  assert.equal(draw({ gesture: 'point_right' }).replace('point_right', 'point'), draw({ gesture: 'point' }));
});

test('a held prop has its grip on the center of the hand that holds it', () => {
  for (const [prop, p] of Object.entries(manifest.props)) {
    const gesture = p.hand === 'acting' ? 'point' : 'idle';
    const svg = draw({ gesture, prop });
    const m = svg.match(new RegExp(`data-prop="${prop}" transform="translate\\(([-\\d.]+) ([-\\d.]+)\\) rotate\\(([-\\d.]+)\\) translate\\(([-\\d.]+) ([-\\d.]+)\\)"`));
    assert.ok(m, prop);
    const fk = stand(gesture, prop);
    const t = propTransform(manifest, fk, prop);
    const hand = mid(fk.points[`${t.side}_wrist`], fk.points[`${t.side}_hand`]);
    // translate(x y) rotate(a) translate(-grip) takes the grip point to (x, y).
    assert.ok(dist([Number(m[1]), Number(m[2])], hand) <= 0.5, `${prop} grip`);
    assert.ok(Math.abs(Number(m[4]) + t.grip[0]) <= 0.01 && Math.abs(Number(m[5]) + t.grip[1]) <= 0.01, `${prop} grip offset`);
    assert.equal(t.side, p.hand === 'acting' ? 'l' : 'r');
  }
});

test('the same input draws exactly the same SVG, and another shot ID moves the ink', () => {
  assert.equal(draw({ gesture: 'think', expr: 'curious' }), draw({ gesture: 'think', expr: 'curious' }));
  assert.notEqual(draw({ gesture: 'think', seed: 'sh01' }), draw({ gesture: 'think', seed: 'sh02' }));
});

test('every expression draws its face and only its own emotion symbol', () => {
  for (const [expr, e] of Object.entries(manifest.expressions)) {
    const svg = draw({ expr });
    assert.ok(svg.includes(`data-face="${expr}"`), expr);
    const symbols = [...svg.matchAll(/data-symbol="(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(symbols, e.symbol ? [e.symbol] : [], expr);
  }
});

test('facing left mirrors the face but never the emotion symbol', () => {
  const svg = draw({ expr: 'curious', facing: -1 });
  assert.match(svg, /data-face="curious" transform="[^"]*scale\(-1 1\)"/);
  assert.match(svg, /<g data-symbol="question"><path/);
});

test('far limbs are drawn behind the torso and near limbs in front; in the front view all limbs are in front', () => {
  const at = (svg, keys) => keys.map((k) => svg.indexOf(k));
  const sorted = (xs) => xs.every((x, i) => x >= 0 && (i === 0 || xs[i - 1] < x));
  assert.ok(sorted(at(draw({ view: 'three_quarter' }), ['data-limb="r_arm"', 'data-part="spine"', 'data-limb="l_leg"', 'data-limb="l_arm"'])));
  assert.ok(sorted(at(draw({ view: 'front' }), ['data-part="spine"', 'data-limb="r_arm"', 'data-limb="l_arm"'])));
});

test('point adds a finger to the acting hand only', () => {
  assert.ok(draw({ gesture: 'point' }).includes('data-part="l_finger"'));
  assert.ok(!draw({ gesture: 'point' }).includes('data-part="r_finger"'));
  assert.ok(!draw({ gesture: 'idle' }).includes('_finger"'));
});

test('the prop none means an empty hand', () => {
  assert.equal(draw({ prop: 'none' }), draw({}));
  assert.ok(!draw({ prop: 'none' }).includes('data-prop'));
});

test('dark theme draws the body in light ink and keeps the teal scarf', () => {
  const svg = draw({ theme: 'dark' });
  assert.ok(svg.includes(manifest.ink.body.dark) && !svg.includes(manifest.ink.body.light));
  assert.ok(svg.includes(manifest.ink.accent));
});

test('elbows, the head and the eyes carry their pivot so the site can animate them with CSS', () => {
  const svg = draw({ gesture: 'wave', expr: 'happy' });
  for (const part of ['data-joint="l_elbow"', 'data-joint="r_elbow"', 'data-joint="head"', 'data-face-part="eyes"']) {
    assert.match(svg, new RegExp(`${part} style="transform-origin:-?[\\d.]+px -?[\\d.]+px"`), part);
  }
});

test('elbows join at full width so arms never pinch at the bend', () => {
  const svg = draw({ gesture: 'jump' });
  const caps = (part) => {
    const m = svg.match(new RegExp(`data-part="${part}" d="([^"]+)"`));
    assert.ok(m, part);
    return [...m[1].matchAll(/A([\d.]+) ([\d.]+)/g)].map((a) => Number(a[1]));
  };
  const fullRadius = (manifest.ink.width[1] * H) / 2;
  assert.equal(caps('l_upper_arm')[0], fullRadius);
  assert.equal(caps('l_forearm')[1], fullRadius);
});

test('knees and spine have rounded corners of at most 45 degrees in every pose', () => {
  const bentManifest = {
    ...manifest,
    poses: { ...manifest.poses, _bent: { type: 'hold', view: 'side', support: 'seat', angles: { waist: 35, chest: 25, l_hip: 100, l_knee: 120, r_hip: 90, r_knee: 110 } } },
  };
  const check = (m, gesture) => {
    const svg = drawHost(m, { gesture, expr: 'explaining', x: 400, ground: 930, seed: 'sh01' });
    for (const part of ['l_leg', 'r_leg', 'spine']) {
      const match = svg.match(new RegExp(`data-part="${part}" d="([^"]+)"`));
      assert.ok(match, `${gesture} ${part}`);
      const leftEdge = match[1].slice(0, match[1].indexOf('A'));
      const pts = [...leftEdge.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((p) => [Number(p[1]), Number(p[2])]);
      assert.ok(pts.length >= 4, `${gesture} ${part}`);
      for (let i = 1; i < pts.length - 1; i += 1) {
        const u = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
        const v = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]];
        const denom = Math.hypot(...u) * Math.hypot(...v);
        if (denom < 1e-6) continue;
        const cos = Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / denom));
        assert.ok((Math.acos(cos) * 180) / Math.PI <= 45, `${gesture} ${part} corner ${i}`);
      }
    }
  };
  for (const gesture of POSES) check(manifest, gesture);
  check(bentManifest, '_bent');
});

test('at 540p scale (H = 200), no rendered ink stroke or outline is thinner than 1.5 px', () => {
  const small = { ...manifest, height_px: 200 };
  const samples = [
    ...Object.keys(manifest.expressions).map((expr) => ({ gesture: 'idle', expr })),
    ...Object.entries(manifest.props).map(([prop, p]) => ({ gesture: p.hand === 'acting' ? 'point' : 'idle', expr: 'explaining', prop })),
  ];
  for (const state of samples) {
    const svg = drawHost(small, { x: 200, ground: 465, seed: 'small', ...state });
    for (const m of svg.matchAll(/A([\d.]+) ([\d.]+)/g)) {
      assert.ok(Number(m[1]) * 2 >= 1.5 - 1e-6, `cap width ${Number(m[1]) * 2} in ${JSON.stringify(state)}`);
    }
    for (const m of svg.matchAll(/stroke-width="([\d.]+)"/g)) {
      assert.ok(Number(m[1]) >= 1.5 - 1e-6, `stroke-width ${m[1]} in ${JSON.stringify(state)}`);
    }
  }
});

test('face features scale by manifest.figure.face_scale (1.2x) without shifting anchors', () => {
  const R = (manifest.joints.head.length * H) / 2;
  const explaining = draw({ expr: 'explaining' });
  const faceGroup = explaining.slice(explaining.indexOf('data-face="explaining"'));
  const eyeRy = faceGroup.match(/<ellipse[^>]*ry="([\d.]+)"/);
  assert.ok(eyeRy);
  assert.equal(Number(eyeRy[1]), Math.round(0.12 * 1.2 * R * 100) / 100);

  const happy = draw({ expr: 'happy' });
  const happyFace = happy.slice(happy.indexOf('data-face="happy"'));
  const grin = happyFace.match(/<path d="M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+)/);
  assert.ok(grin, 'happy grin path');
  const span = Math.abs(Number(grin[3]) - Number(grin[1]));
  assert.ok(Math.abs(span - 0.4 * 1.2 * R) <= 0.05, `grin span ${span} vs ${0.4 * 1.2 * R}`);
});

test('scarfShape gives long notched tails, mirrors cleanly when facing left, and spans at least 0.12 H at 540p', () => {
  const opts = { view: 'three_quarter', x: 500, ground: 930 };
  const rightFk = forwardKinematics(manifest, manifest.poses.idle.angles, opts);
  const leftFk = forwardKinematics(manifest, manifest.poses.idle.angles, { ...opts, facing: -1 });
  const right = scarfShape(manifest, rightFk);
  const left = scarfShape(manifest, leftFk);

  const knot = right.ring[manifest.scarf.knot];
  assert.equal(right.tails.length, manifest.scarf.tails.length);
  for (const tail of right.tails) {
    assert.ok(dist(tail.tip, knot) >= 0.1 * H, `tail tip dist ${dist(tail.tip, knot)} < ${0.1 * H}`);
    assert.ok(tail.outline.length >= 6);
  }

  right.ring.forEach(([x, y], i) => {
    assert.ok(Math.abs(left.ring[i][0] - (1000 - x)) < 1e-9 && Math.abs(left.ring[i][1] - y) < 1e-9, `ring ${i}`);
  });
  right.tails.forEach((tail, ti) => {
    assert.ok(Math.abs(left.tails[ti].tip[0] - (1000 - tail.tip[0])) < 1e-9 && Math.abs(left.tails[ti].tip[1] - tail.tip[1]) < 1e-9, `tip ${ti}`);
    tail.outline.forEach(([x, y], pi) => {
      assert.ok(Math.abs(left.tails[ti].outline[pi][0] - (1000 - x)) < 1e-9 && Math.abs(left.tails[ti].outline[pi][1] - y) < 1e-9, `tail ${ti} pt ${pi}`);
    });
  });

  const small = { ...manifest, height_px: 200 };
  for (const view of VIEWS) {
    const fk = forwardKinematics(small, small.poses.idle.angles, { view, x: 200, ground: 465 });
    const shape = scarfShape(small, fk);
    const xs = [...shape.ring, ...shape.tails.flatMap((t) => t.outline)].map(([x]) => x);
    const span = Math.max(...xs) - Math.min(...xs);
    assert.ok(span >= 0.12 * small.height_px, `${view} scarf span ${span} < ${0.12 * small.height_px}`);
  }
});

test('poses choose fist, open or point hands, respect dark theme, and mirror thumbs when facing left', () => {
  const count = (svg, type) => (svg.match(new RegExp(`data-hand="${type}"`, 'g')) ?? []).length;
  assert.equal(count(draw({ gesture: 'shrug' }), 'open'), 2);
  const pointSvg = draw({ gesture: 'point' });
  assert.equal(count(pointSvg, 'point'), 1);
  assert.ok(pointSvg.includes('data-part="l_finger"'));
  assert.equal(count(draw({}), 'fist'), 2);

  for (const gesture of POSES) {
    const { hands } = resolvePose(manifest, gesture);
    if (!hands) continue;
    for (const [side, type] of Object.entries(hands)) {
      assert.ok(['fist', 'open', 'point'].includes(type), `${gesture}.${side}: ${type}`);
    }
  }

  const darkShrug = draw({ gesture: 'shrug', theme: 'dark' });
  assert.ok(!darkShrug.includes(manifest.ink.body.light));

  const thumbTip = (svg, side) => {
    const m = svg.match(new RegExp(`data-part="${side}_thumb" d="([^"]+)"`));
    assert.ok(m, `${side}_thumb`);
    const cap = m[1].match(/(-?[\d.]+) (-?[\d.]+)A[\d.]+ [\d.]+ 0 0 0 (-?[\d.]+) (-?[\d.]+)/);
    assert.ok(cap, `${side}_thumb cap`);
    return [(Number(cap[1]) + Number(cap[3])) / 2, (Number(cap[2]) + Number(cap[4])) / 2];
  };
  const rightShrug = draw({ gesture: 'shrug', x: 400 });
  const leftShrug = draw({ gesture: 'shrug', x: 400, facing: -1 });
  for (const side of ['l', 'r']) {
    const rt = thumbTip(rightShrug, side);
    const lt = thumbTip(leftShrug, side);
    assert.ok(dist(lt, [800 - rt[0], rt[1]]) <= 0.5, `${side} thumb mirror: ${lt} vs ${[800 - rt[0], rt[1]]}`);
  }
});

test('polished poses: smooth spine arc, tucked jump, knee-hugging sit, and lighter emphasize', () => {
  for (const gesture of POSES) {
    const { angles } = resolvePose(manifest, gesture);
    const w = angles.waist ?? 0;
    const c = angles.chest ?? 0;
    assert.ok(w * c >= 0 || Math.min(Math.abs(w), Math.abs(c)) <= 3, `${gesture} S-curve spine: waist=${w} chest=${c}`);
  }

  const jump = resolvePose(manifest, 'jump').angles;
  assert.ok((jump.l_knee ?? 0) >= 35 && (jump.r_knee ?? 0) >= 35, `jump knees ${jump.l_knee}, ${jump.r_knee}`);
  assert.ok((jump.l_hip ?? 0) >= 30 && (jump.r_hip ?? 0) >= 30, `jump hips ${jump.l_hip}, ${jump.r_hip}`);

  const sit = resolvePose(manifest, 'sit').angles;
  assert.ok((sit.l_knee ?? 0) >= 100 && (sit.r_knee ?? 0) >= 100, `sit knees ${sit.l_knee}, ${sit.r_knee}`);
  const { points: sp } = stand('sit');
  const handOnKnee = ['l', 'r'].some((h) => {
    const hand = mid(sp[`${h}_wrist`], sp[`${h}_hand`]);
    return ['l', 'r'].some((k) => dist(hand, sp[`${k}_knee`]) <= 0.12 * H);
  });
  assert.ok(handOnKnee, 'at least one hand rests near a knee when sitting');

  const emphasize = resolvePose(manifest, 'emphasize').angles;
  assert.ok((emphasize.waist ?? 0) <= 4, `emphasize waist ${emphasize.waist}`);
});

test('an unknown gesture, expression, prop, view or theme is a clear error', () => {
  assert.throws(() => draw({ gesture: 'dance' }), /unknown gesture dance/);
  assert.throws(() => draw({ expr: 'angry' }), /unknown expression angry/);
  assert.throws(() => draw({ prop: 'umbrella' }), /unknown prop umbrella/);
  assert.throws(() => draw({ view: 'back' }), /unknown view back/);
  assert.throws(() => draw({ theme: 'sepia' }), /unknown theme sepia/);
});
