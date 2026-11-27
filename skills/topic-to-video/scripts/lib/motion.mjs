// S2 motion engine for 小青: 2-bone analytical IK, staggered pose tweening with anticipation/overshoot,
// procedural walk/trot/jump/wave/cheer/tap, automatic micro-acting, fixed-step 1/240s scarf spring
// and standing spot solver (火柴人主持人设计 §5–§7).
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, lerp } from './ease.mjs';
import { FRAMES } from './frame.mjs';
import { random } from './ink.mjs';
import { ACTING, ahogePoints, clampAngles, forwardKinematics, JOINTS, poseAngles, resolvePose } from './rig.mjs';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const STAGGER_SEC = {
  pelvis: 0, waist: 0, chest: 0, l_hip: 0, r_hip: 0, l_knee: 0.02, r_knee: 0.02, l_ankle: 0.04, r_ankle: 0.04,
  l_shoulder: 0.04, r_shoulder: 0.04,
  l_elbow: 0.08, r_elbow: 0.08, l_wrist: 0.08, r_wrist: 0.08, neck: 0.08, head: 0.08,
};

/**
 * Analytical two-bone IK using the law of cosines (no iteration).
 * Reachable targets hit within floating-point precision (<= 0.5 px); unreachable targets extend straight toward target.
 */
export function solveTwoBoneIK(origin, target, L1, L2, { bendSign = -1 } = {}) {
  const dx = target[0] - origin[0];
  const dy = target[1] - origin[1];
  const d = Math.hypot(dx, dy);
  const baseAngle = Math.atan2(dy, dx);
  const maxReach = L1 + L2;
  const minReach = Math.abs(L1 - L2);
  if (d >= maxReach - 1e-6 || d < 1e-6) {
    const dir = d < 1e-6 ? 0 : baseAngle;
    const mid = [origin[0] + Math.cos(dir) * L1, origin[1] + Math.sin(dir) * L1];
    const end = [mid[0] + Math.cos(dir) * L2, mid[1] + Math.sin(dir) * L2];
    return { mid, end, angle1: dir * DEG, angle2: dir * DEG, reachable: d <= maxReach };
  }
  const clampedD = Math.max(minReach + 1e-6, d);
  const cosA = Math.max(-1, Math.min(1, (L1 * L1 + clampedD * clampedD - L2 * L2) / (2 * L1 * clampedD)));
  const alpha = Math.acos(cosA);
  const a1 = baseAngle + bendSign * alpha;
  const mid = [origin[0] + Math.cos(a1) * L1, origin[1] + Math.sin(a1) * L1];
  const a2 = Math.atan2(target[1] - mid[1], target[0] - mid[0]);
  const end = [mid[0] + Math.cos(a2) * L2, mid[1] + Math.sin(a2) * L2];
  return { mid, end, angle1: a1 * DEG, angle2: a2 * DEG, reachable: true };
}

/** Computes amplitude-scaled tween duration in [0.25, 0.5] seconds (火柴人主持人设计 §5.3-5.4). */
export function tweenDuration(fromAngles, toAngles) {
  let maxDelta = 0;
  for (const j of JOINTS) {
    maxDelta = Math.max(maxDelta, Math.abs((toAngles[j] ?? 0) - (fromAngles[j] ?? 0)));
  }
  return 0.25 + 0.25 * clamp01(maxDelta / 120);
}

/**
 * Tweens joint angles with torso→upper-arm→forearm/head stagger and optional anticipation + overshoot.
 * Always clamped to manifest.joints ranges.
 */
export function tweenPoseAngles(manifest, fromAngles, toAngles, elapsed, {
  duration = tweenDuration(fromAngles, toAngles),
  anticipate = false,
  overshoot = false,
} = {}) {
  const out = {};
  for (const j of JOINTS) {
    const a = fromAngles[j] ?? 0;
    const b = toAngles[j] ?? 0;
    const delay = Object.hasOwn(STAGGER_SEC, j) ? STAGGER_SEC[j] : 0;
    const localT = elapsed - delay;
    if (localT <= 0) {
      out[j] = a;
      continue;
    }
    const span = Math.max(0.08, duration - delay);
    const u = clamp01(localT / span);
    if (u >= 1) {
      out[j] = b;
      continue;
    }
    if (anticipate && u < 0.2) {
      const dip = Math.sin((u / 0.2) * Math.PI) * 0.14;
      out[j] = a - (b - a) * dip;
    } else {
      const v = anticipate ? (u - 0.2) / 0.8 : u;
      const k = overshoot ? easeOutBack(v) : easeInOutCubic(v);
      out[j] = lerp(a, b, k);
    }
  }
  return clampAngles(manifest, out);
}

const normDeg = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** Aims the acting arm (and optional pointer tip) at `target` via 2-bone analytical IK. */
export function aimArmAt(manifest, angles, { view = 'three_quarter', facing = 1, x = 320, ground = 930, lift = 0, seatY = null, target, prop = null }) {
  const a = clampAngles(manifest, angles);
  const fk = forwardKinematics(manifest, a, { view, facing, x, ground, lift, seatY });
  const H = manifest.height_px;
  const L1 = manifest.joints.l_shoulder.length * H;
  const tipExtra = prop === 'pointer' ? (manifest.props.pointer.tip?.[0] ?? 0.3) * H : 0;
  const L2 = (manifest.joints.l_elbow.length + manifest.joints.l_wrist.length) * H + tipExtra;
  const shoulder = fk.points.neck_base;
  // Solve in facing-right coordinates, then extract relative shoulder & elbow angles
  const relTarget = [shoulder[0] + facing * (target[0] - shoulder[0]), target[1]];
  const ik = solveTwoBoneIK(shoulder, relTarget, L1, L2, { bendSign: 1 });
  const spineUp = -90 + a.pelvis + a.waist + a.chest;
  const l_shoulder = normDeg(spineUp + 180 - ik.angle1);
  const l_elbow = Math.max(0, normDeg(ik.angle1 - ik.angle2));
  return clampAngles(manifest, { ...a, l_shoulder, l_elbow, l_wrist: 0 });
}

/** Aims both arms (`l` and `r`) at their targets via 2-bone analytical IK. */
function aimBothArmsAt(manifest, angles, { view = 'front', facing = 1, x = 320, ground = 930, lift = 0, seatY = null, targetL, targetR = targetL }) {
  const a = clampAngles(manifest, angles);
  const fk = forwardKinematics(manifest, a, { view, facing, x, ground, lift, seatY });
  const H = manifest.height_px;
  const L1 = manifest.joints.l_shoulder.length * H;
  const L2 = (manifest.joints.l_elbow.length + manifest.joints.l_wrist.length) * H;
  const shoulder = fk.points.neck_base;
  const spineUp = -90 + a.pelvis + a.waist + a.chest;
  const relL = [shoulder[0] + facing * (targetL[0] - shoulder[0]), targetL[1]];
  const ikL = solveTwoBoneIK(shoulder, relL, L1, L2, { bendSign: 1 });
  const oR = view === 'front' ? -1 : 1;
  const relR = [shoulder[0] + facing * (targetR[0] - shoulder[0]), targetR[1]];
  const ikR = solveTwoBoneIK(shoulder, relR, L1, L2, { bendSign: oR });
  return clampAngles(manifest, {
    ...a,
    l_shoulder: normDeg(spineUp + 180 - ikL.angle1),
    l_elbow: Math.max(0, normDeg(ikL.angle1 - ikL.angle2)),
    l_wrist: 0,
    r_shoulder: normDeg(oR * (spineUp + 180 - ikR.angle1)),
    r_elbow: Math.max(0, normDeg(oR * (ikR.angle1 - ikR.angle2))),
    r_wrist: 0,
  });
}

const CROUCH_POSE = {
  pelvis: 15, waist: 42, chest: 22, neck: -8, head: -12,
  l_hip: 78, l_knee: 126, l_ankle: -20, r_hip: 72, r_knee: 120, r_ankle: -18,
};
const LEG_CROUCH_POSE = {
  pelvis: 10, l_hip: 75, l_knee: 150, l_ankle: -25, r_hip: 70, r_knee: 145, r_ankle: -22,
};

/** Solves arm IK toward `target`, crouching/leaning only as much as needed when `target` is below standing reach. */
function solveReachWithCrouch(manifest, baseAngles, { view, facing, x, ground, lift = 0, seatY = null, target, bothArms = false, preserveTorso = false }) {
  const H = manifest.height_px;
  const maxReach = (manifest.joints.l_shoulder.length + manifest.joints.l_elbow.length + manifest.joints.l_wrist.length) * H;
  const safeReach = maxReach * 0.92;
  const fk0 = forwardKinematics(manifest, baseAngles, { view, facing, x, ground, lift, seatY });
  let posed = baseAngles;
  if (seatY == null && Math.hypot(target[0] - fk0.points.neck_base[0], target[1] - fk0.points.neck_base[1]) > safeReach) {
    const crouchTarget = preserveTorso ? LEG_CROUCH_POSE : CROUCH_POSE;
    const blendCrouch = (k) => {
      const out = { ...baseAngles };
      for (const [j, v] of Object.entries(crouchTarget)) out[j] = lerp(baseAngles[j] ?? 0, v, k);
      return out;
    };
    let lo = 0;
    let hi = 1;
    for (let iter = 0; iter < 10; iter += 1) {
      const mid = (lo + hi) / 2;
      const cand = blendCrouch(mid);
      const fk = forwardKinematics(manifest, cand, { view, facing, x, ground, lift, seatY });
      if (Math.hypot(target[0] - fk.points.neck_base[0], target[1] - fk.points.neck_base[1]) <= safeReach) hi = mid;
      else lo = mid;
    }
    posed = blendCrouch(hi);
  }
  return bothArms
    ? aimBothArmsAt(manifest, posed, { view, facing, x, ground, lift, seatY, targetL: target, targetR: target })
    : aimArmAt(manifest, posed, { view, facing, x, ground, lift, seatY, target });
}

/**
 * Procedural walk or trot frame at `phase` (in step cycles, 1 cycle = 2 steps).
 * Stance foot stays pinned to `ground` (<= 0.5 px slip) via ground clamping.
 */
export function walkFrame(manifest, phase, { x = 400, ground = 930, facing = 1, trot = false } = {}) {
  const H = manifest.height_px;
  const rad = phase * 2 * Math.PI;
  const stride = trot ? 34 : 26;
  const armSwing = trot ? 42 : 28;
  const lean = trot ? 10 : 4;
  const lHip = Math.sin(rad) * stride;
  const rHip = Math.sin(rad + Math.PI) * stride;
  const lKnee = Math.max(4, Math.cos(rad) * (trot ? 42 : 24) + (trot ? 24 : 14));
  const rKnee = Math.max(4, Math.cos(rad + Math.PI) * (trot ? 42 : 24) + (trot ? 24 : 14));
  const angles = clampAngles(manifest, {
    pelvis: 0,
    waist: lean,
    chest: 2,
    head: -2,
    l_shoulder: -Math.sin(rad) * armSwing,
    l_elbow: trot ? 58 : 22,
    r_shoulder: Math.sin(rad) * armSwing,
    r_elbow: trot ? 58 : 24,
    l_hip: lHip,
    l_knee: lKnee,
    l_ankle: -lHip * 0.25,
    r_hip: rHip,
    r_knee: rKnee,
    r_ankle: -rHip * 0.25,
  });
  const lift = trot ? Math.abs(Math.sin(rad)) * 0.025 : 0;
  const fk = forwardKinematics(manifest, angles, { view: 'side', facing, x, ground, lift });
  const sole = (manifest.figure.foot[1] * H) / 2;
  const lFootY = Math.max(fk.points.l_ankle[1], fk.points.l_toe[1]) + sole;
  const rFootY = Math.max(fk.points.r_ankle[1], fk.points.r_toe[1]) + sole;
  const stanceFoot = lFootY >= rFootY ? 'l' : 'r';
  return {
    angles,
    lift,
    view: 'side',
    stanceFoot,
    stanceFootY: Math.max(lFootY, rFootY),
  };
}

/** Deterministic fixed-step (1/240s) scarf tail spring simulation from rest at t = 0 (火柴人主持人设计 §5.8). */
export function simulateScarfSpring(manifest, velocityFn, t) {
  const dt = 1 / 240;
  const steps = Math.max(0, Math.round(Math.max(0, t) / dt));
  const k = manifest.scarf.stiffness ?? 120;
  const c = manifest.scarf.damping ?? 14;
  return manifest.scarf.tails.map((tail, idx) => {
    let angle = tail.angle;
    let omega = 0;
    const gain = 0.08 + idx * 0.03;
    for (let i = 0; i < steps; i += 1) {
      const vx = velocityFn(i * dt);
      const target = tail.angle + Math.max(-28, Math.min(35, vx * gain));
      const acc = -k * (angle - target) - c * omega;
      omega += acc * dt;
      angle += omega * dt;
    }
    return angle;
  });
}

/**
 * The 呆毛's bend in degrees at `t`: a fixed-step (1/240 s) spring pulled toward `targetFn(ts)`, started at rest
 * 2 s before `t` (it settles well within that), so the result does not depend on the frame rate (小青人设设计 §3.1).
 */
export function simulateAhogeSpring(manifest, targetFn, t) {
  const dt = 1 / 240;
  const { stiffness: k, damping: c } = manifest.ahoge.spring;
  const start = Math.max(0, t - 2);
  const steps = Math.max(0, Math.round((t - start) / dt));
  let bend = 0;
  let omega = 0;
  for (let i = 0; i < steps; i += 1) {
    const acc = -k * (bend - targetFn(start + i * dt)) - c * omega;
    omega += acc * dt;
    bend += omega * dt;
  }
  return bend;
}

/**
 * Idle fidgets (小青人设设计 §4.3): in every stretch without a gesture or move cue (`quiet`, start and end in
 * seconds), one 0.8 s fidget 3 s in and then every 3–4 s, chosen and timed by the shot seed.
 * @returns {{ t0: number, kind: 'look' | 'tiptoe' | 'flick' }[]}
 */
export function fidgetSchedule(quiet, seed) {
  const out = [];
  for (const [from, to] of quiet) {
    const rnd = random(`${seed}:fidget:${from.toFixed(3)}`);
    for (let t0 = from + 3; t0 + 0.8 <= to; t0 += 3 + rnd()) out.push({ t0, kind: FIDGETS[Math.floor(rnd() * FIDGETS.length)] });
  }
  return out;
}
const FIDGETS = ['look', 'tiptoe', 'flick'];

const BEAT_CYCLE = ['present', 'point', 'emphasize', 'shrug'];

/**
 * Picks a purposeful conversational gesture (and optional expression hint) for a sentence that has no explicit gesture cue,
 * ensuring every sentence carries an active, non-repeating host beat.
 */
export function inferSentenceBeat(text = '', { index = 0, hasVisualCue = false, prevGesture = 'idle', autoSnaps = 0 } = {}) {
  const s = String(text);
  let candidates;
  if (/[？?][」』”’）)》】\]"']*$/.test(s) || /(?:吗|呢|为什么|怎么|还能)/.test(s)) {
    candidates = ['lean_in', 'think', 'shrug'];
  } else if (/(?:原来|答案是|所以说|这就是)/.test(s)) {
    candidates = ['snap', 'present', 'emphasize'];
  } else if (/(?:居然|竟然|没想到)/.test(s)) {
    candidates = ['startle', 'double_take', 'emphasize'];
  } else if (/[！!][」』”’）)》】\]"']*$/.test(s) || /(?:记住|关键|直接|瞬间|省掉|省下|一定)/.test(s)) {
    candidates = ['emphasize', 'present', 'point'];
  } else if (hasVisualCue || /(?:看|先看|找到|并排|这边|这张图|三零四|304|服务器|浏览器|副本)/.test(s)) {
    candidates = ['point', 'present', 'emphasize'];
  } else {
    const start = Math.abs(index) % BEAT_CYCLE.length;
    candidates = [...BEAT_CYCLE.slice(start), ...BEAT_CYCLE.slice(0, start)];
  }
  // Two automatic snaps per video keep it a signature move (小青人设设计 §4.2).
  if (autoSnaps >= 2) candidates = candidates.filter((g) => g !== 'snap');
  const gesture = candidates.find((g) => g !== prevGesture) ?? candidates[0];
  return { gesture };
}

const INTERACTION_DO = new Set(['open', 'carry', 'push', 'pull', 'hold_up', 'draw', 'sit_on', 'react']);
const BAD_OBJECT_STATES = new Set(['expired', 'broken', 'crossed', 'empty']);
const CARRY_POSE = { l_shoulder: 38, l_elbow: 72, l_wrist: -12 };
const SIT_ON_ANGLES = {
  pelvis: -8, waist: 10, chest: 6, neck: 0, head: 2,
  l_shoulder: 26, l_elbow: 58, l_wrist: 0,
  r_shoulder: 18, r_elbow: 48, r_wrist: 0,
  l_hip: 82, l_knee: 90, l_ankle: 0,
  r_hip: 78, r_knee: 84, r_ankle: 4,
};
const LANDSCAPE = FRAMES['16:9'];
const clampX = (v, geo = LANDSCAPE) => Math.max(geo.walk.minX, Math.min(geo.walk.maxX, v));

const standBlocker = (sx, elements, ground) => elements.find((other) => {
  const b = other?.bbox;
  if (!b || b.y >= ground - 1e-6 || b.y + b.h <= ground - 440 + 1e-6) return false;
  return sx - 50 < b.x + b.w && sx + 50 > b.x;
})?.bbox;

function isSpotClearOfOthers(sx, elements, geo = LANDSCAPE) {
  return !standBlocker(sx, elements, geo.ground);
}

/** Steps a blocked stand spot outward (dir -1 left, 1 right) past each object in the way, such as the table under a cup; null when it leaves [minX, maxX]. */
function walkOutClear(sx, dir, elements, ground, minX, maxX) {
  for (let n = 0; n <= elements.length; n++) {
    const b = standBlocker(sx, elements, ground);
    if (!b) return sx;
    sx = dir < 0 ? b.x - 70 : b.x + b.w + 70;
    if (sx < minX || sx > maxX) return null;
  }
  return null;
}

function applyObjectShift(elements, objDx, droppedSpots, geo = LANDSCAPE) {
  return elements.map((el, i) => {
    if (!el?.bbox) return el;
    const spot = droppedSpots[i];
    if (spot) {
      const dx = spot.x - (el.bbox.x + el.bbox.w / 2);
      const dy = spot.y - (el.bbox.y + el.bbox.h);
      const bbox = { ...el.bbox, x: el.bbox.x + dx, y: el.bbox.y + dy };
      const anchors = {};
      for (const [k, pt] of Object.entries(el.anchors ?? {})) anchors[k] = [pt[0] + dx, pt[1] + dy];
      return {
        ...el,
        bbox,
        anchors,
        standSpots: {
          left: clampX(bbox.x - 70, geo),
          right: clampX(bbox.x + bbox.w + 70, geo),
        },
      };
    }
    const dx = objDx[i] ?? 0;
    if (!dx) return el;
    const bbox = { ...el.bbox, x: el.bbox.x + dx };
    const anchors = {};
    for (const [k, pt] of Object.entries(el.anchors ?? {})) anchors[k] = [pt[0] + dx, pt[1]];
    return {
      ...el,
      bbox,
      anchors,
      standSpots: el.standSpots
        ? { left: clampX(el.standSpots.left + dx, geo), right: clampX(el.standSpots.right + dx, geo) }
        : undefined,
    };
  });
}

function resolveInteractionStandX(targetIdx, currentX, elements, anchorX, maxReach, geo = LANDSCAPE) {
  const el = elements[targetIdx];
  if (!el?.standSpots) return resolveStandX(targetIdx, currentX, elements, geo);
  const { left, right } = el.standSpots;
  const leftClear = Number.isFinite(left) && isSpotClearOfOthers(left, elements, geo);
  const rightClear = Number.isFinite(right) && isSpotClearOfOthers(right, elements, geo);
  if (el.bbox) {
    if (currentX <= el.bbox.x && leftClear) return clampX(Math.round(left), geo);
    if (currentX >= el.bbox.x + el.bbox.w && rightClear) return clampX(Math.round(right), geo);
  }
  const leftReach = leftClear && Math.abs(left - anchorX) <= maxReach * 0.92;
  const rightReach = rightClear && Math.abs(right - anchorX) <= maxReach * 0.92;
  if (leftReach && !rightReach) return clampX(Math.round(left), geo);
  if (rightReach && !leftReach) return clampX(Math.round(right), geo);
  return resolveStandX(targetIdx, currentX, elements, geo);
}

function objectStateAt(elements, cues, interactionStarts, targetIdx, t) {
  let state = elements[targetIdx]?.state ?? 'normal';
  const ordered = cues
    .map((c, idx) => ({ c, t0: interactionStarts.get(idx) ?? (c.timeMs ?? 0) / 1000, idx }))
    .filter((e) => e.c.target === targetIdx && (e.c.do === 'state' || e.c.do === 'open') && e.t0 <= t)
    .sort((a, b) => a.t0 - b.t0 || a.idx - b.idx);
  for (const e of ordered) {
    state = e.c.do === 'open' ? 'open' : (e.c.value ?? state);
  }
  return state;
}

/** Both spots beside the target are blocked: the nearer of the first clear spots outward on each side, or null. */
export function nearestOutward(left, right, currentX, elements, ground, minX, maxX) {
  const l = Number.isFinite(left) ? walkOutClear(left, -1, elements, ground, minX, maxX) : null;
  const r = Number.isFinite(right) ? walkOutClear(right, 1, elements, ground, minX, maxX) : null;
  if (l === null) return r;
  if (r === null) return l;
  return Math.abs(currentX - l) <= Math.abs(currentX - r) ? l : r;
}

/** Resolves a `move` cue target (preset spot or element index) to a ground X inside walk bounds. */
export function resolveStandX(target, currentX = 320, elements = [], geo = LANDSCAPE) {
  if (typeof target === 'string' && Object.hasOwn(geo.spots, target)) return geo.spots[target];
  if (Number.isInteger(target)) {
    const el = elements[target];
    if (!el) return currentX;
    if (el.standSpots) {
      const { left, right } = el.standSpots;
      const leftOk = Number.isFinite(left) && isSpotClearOfOthers(left, elements, geo);
      const rightOk = Number.isFinite(right) && isSpotClearOfOthers(right, elements, geo);
      let chosen;
      if (leftOk && !rightOk) chosen = left;
      else if (rightOk && !leftOk) chosen = right;
      else chosen = Math.abs(currentX - left) <= Math.abs(currentX - right) ? left : right;
      if (!leftOk && !rightOk) chosen = nearestOutward(left, right, currentX, elements, geo.ground, geo.walk.minX, geo.walk.maxX) ?? chosen;
      return clampX(Math.round(chosen), geo);
    }
    const { x, w } = el.bbox;
    const leftSpot = x - 60;
    const rightSpot = x + w + 60;
    const chosen = currentX < x ? leftSpot : currentX > x + w ? rightSpot
      : (Math.abs(currentX - leftSpot) <= Math.abs(currentX - rightSpot) ? leftSpot : rightSpot);
    return clampX(Math.round(chosen), geo);
  }
  return currentX;
}

/** Automatic micro-acting: breathing, idle weight shift, seeded blink, stress nod, question tilt, focus gaze. */
function computeMicroActing(t, seed, { audioFrame = null, isQuestionEnd = false, focusChangedAt = -10, isIdle = false, focusDirX = 1 }) {
  const rnd = random(`${seed}:blink`);
  let blink = 0;
  let cursor = 1.5 + rnd() * 2.5;
  while (cursor < t + 1) {
    if (t >= cursor && t <= cursor + 0.15) {
      blink = Math.sin(((t - cursor) / 0.15) * Math.PI);
      break;
    }
    if (rnd() < 0.2 && t >= cursor + 0.22 && t <= cursor + 0.35) {
      blink = Math.sin(((t - cursor - 0.22) / 0.13) * Math.PI);
      break;
    }
    cursor += 3 + rnd() * 3;
  }
  const breath = Math.sin((t * 2 * Math.PI) / 4);
  const weightShift = isIdle ? Math.sin((t * 2 * Math.PI) / 5) * 2 : 0;
  const nod = audioFrame?.nod ? 3 : 0;
  const tilt = isQuestionEnd ? 6 : 0;
  const gazeActive = t - focusChangedAt >= 0 && t - focusChangedAt <= 0.6;
  const gaze = gazeActive ? [0.06 * focusDirX, -0.05] : [0, 0];
  return { blink, breath, weightShift, nod, tilt, gaze };
}

function computeDropSpot(curX, curFacing, ground, el, headR, obstacles = [], geo = LANDSCAPE) {
  const w = el?.bbox?.w ?? 0;
  const h = el?.bbox?.h ?? 0;
  const minX = geo.walk.minX + w / 2;
  const maxX = geo.walk.maxX - w / 2;
  if (minX > maxX) return { x: geo.center[0], y: ground };
  const dropTop = ground - h;
  const blockers = (obstacles ?? [])
    .map((o) => o?.bbox)
    .filter((b) => b && b.y < ground - 1e-6 && b.y + b.h > dropTop + 1e-6);

  const isClear = (candX, pad = 4) => {
    if (candX < minX || candX > maxX) return false;
    const x0 = candX - w / 2 - pad;
    const x1 = candX + w / 2 + pad;
    return !blockers.some((b) => x0 < b.x + b.w && x1 > b.x);
  };

  const dropDist = Math.max(65, Math.ceil(headR + w / 2 + 16));
  const minHostDist = Math.ceil(headR + w / 2 + 12);
  const preferred = curX + curFacing * dropDist;
  const opposite = curX - curFacing * dropDist;
  if (isClear(preferred)) return { x: preferred, y: ground };
  if (isClear(opposite)) return { x: opposite, y: ground };

  const maxSpan = Math.max(curX - minX, maxX - curX);
  for (const pad of [4, 0]) {
    for (let d = minHostDist; d <= maxSpan + 8; d += 8) {
      const candA = curX + curFacing * d;
      if (isClear(candA, pad)) return { x: candA, y: ground };
      const candB = curX - curFacing * d;
      if (isClear(candB, pad)) return { x: candB, y: ground };
    }
  }
  for (let d = 0; d <= maxSpan + 8; d += 8) {
    const candA = curX + curFacing * d;
    if (isClear(candA, 0)) return { x: candA, y: ground };
    const candB = curX - curFacing * d;
    if (isClear(candB, 0)) return { x: candB, y: ground };
  }
  return { x: Math.max(minX, Math.min(maxX, preferred)), y: ground };
}

/** Plans walk segments (including auto-approach), interaction events, and resolved cue start times. */
function planHostTimeline(H, elements, orderedCues, { startX, startFacing, ground, totalDur, headR = 47, geo = LANDSCAPE }) {
  const maxReach = 0.35 * H;
  const walkSegments = [];
  const interactionEvents = [];
  const interactionStarts = new Map();
  let curX = startX;
  let curFacing = startFacing;
  let rushedMove = false;
  let walkBusyUntil = 0;
  let interBusyUntil = 0;
  let carryPickupEnd = 0;
  let simCarriedIdx = null;
  let simSeatedIdx = null;
  const simObjDx = {};
  const simDroppedSpots = {};

  const pushWalk = (t0, dstX, target, source, nextLimit) => {
    const distX = Math.abs(dstX - curX);
    const avail = Math.max(0.2, nextLimit - t0);
    const baseSpeed = 0.9 * H;
    let speed = baseSpeed;
    let trot = false;
    if (distX / baseSpeed > avail) {
      if (distX / (baseSpeed * 1.6) <= avail) {
        speed = distX / avail;
      } else {
        speed = Math.max(baseSpeed * 1.6, distX / avail);
        trot = true;
        if (source !== 'auto_return' && source !== 'auto_approach') rushedMove = true;
      }
    }
    const dur = distX < 1 ? 0 : Math.min(avail, distX / speed);
    const seg = { t0, t1: t0 + dur, fromX: curX, toX: dstX, dir: dstX >= curX ? 1 : -1, trot, target, source };
    walkSegments.push(seg);
    curX = dstX;
    walkBusyUntil = Math.max(walkBusyUntil, seg.t1);
    return seg;
  };

  for (let i = 0; i < orderedCues.length; i += 1) {
    const c = orderedCues[i];
    const rawT0 = (c.timeMs ?? 0) / 1000;
    const nextMoving = orderedCues.slice(i + 1).find((nc) => nc.do === 'move' || (INTERACTION_DO.has(nc.do) && nc.do !== 'react' && !(nc.do === 'carry' && nc.target === 'none')));
    const nextLimit = nextMoving ? (nextMoving.timeMs ?? 0) / 1000 : totalDur;

    if (c.do === 'move') {
      const shifted = applyObjectShift(elements, simObjDx, simDroppedSpots, geo);
      const dstX = resolveStandX(c.target, curX, shifted, geo);
      const t0 = Math.max(rawT0, interBusyUntil);
      const seg = pushWalk(t0, dstX, c.target, c.source ?? 'move', Math.max(t0 + 0.2, nextLimit));
      if (seg.t1 > seg.t0 && simSeatedIdx !== null) {
        seg.exitSitIdx = simSeatedIdx;
        simSeatedIdx = null;
      }
      interactionStarts.set(c._idx, seg.t0);
      if (Number.isInteger(c.target) && shifted[c.target]) {
        const el = shifted[c.target];
        curFacing = (el.bbox.x + el.bbox.w / 2) >= curX ? 1 : -1;
      } else if (c.target === 'left') curFacing = 1;
      else if (c.target === 'right') curFacing = -1;
      else if (seg.t1 > seg.t0) curFacing = seg.dir;
      interactionEvents.push({ kind: 'stand_up', t0: seg.t0, dur: 0, cueIdx: c._idx });
      continue;
    }

    if (!INTERACTION_DO.has(c.do)) continue;

    if (c.do === 'carry' && c.target === 'none') {
      const actT0 = Math.max(rawT0, walkBusyUntil, carryPickupEnd);
      interactionStarts.set(c._idx, actT0);
      if (simCarriedIdx !== null) {
        const shifted = applyObjectShift(elements, simObjDx, simDroppedSpots, geo);
        const others = shifted.filter((_, idx) => idx !== simCarriedIdx);
        const spot = computeDropSpot(curX, curFacing, ground, elements[simCarriedIdx], headR, others, geo);
        simDroppedSpots[simCarriedIdx] = spot;
        interactionEvents.push({ kind: 'drop', t0: actT0, dur: 0, targetIdx: simCarriedIdx, dropSpot: spot, cueIdx: c._idx });
        simCarriedIdx = null;
      }
      continue;
    }

    if (c.do === 'react') {
      const actT0 = Math.max(rawT0, walkBusyUntil, interBusyUntil);
      interactionStarts.set(c._idx, actT0);
      const shifted = applyObjectShift(elements, simObjDx, simDroppedSpots, geo);
      const el = shifted[c.target];
      const targetX = el ? el.bbox.x + el.bbox.w / 2 : curX;
      curFacing = targetX >= curX ? 1 : -1;
      interactionEvents.push({ kind: 'react', targetIdx: c.target, t0: actT0, dur: 0.8, targetX, cueIdx: c._idx });
      interBusyUntil = Math.max(interBusyUntil, actT0 + 0.8);
      continue;
    }

    const shifted = applyObjectShift(elements, simObjDx, simDroppedSpots, geo);
    const targetIdx = c.target;
    const el = shifted[targetIdx];
    const elCx = el ? el.bbox.x + el.bbox.w / 2 : curX;
    const elCy = el ? el.bbox.y + el.bbox.h * 0.5 : ground - 0.5 * H;

    let anchorPt = [elCx, elCy];
    let dstX = curX;
    if (el) {
      if (c.do === 'open' || c.do === 'carry') {
        anchorPt = el.anchors?.handle ?? [el.bbox.x + el.bbox.w * 0.2, elCy];
        dstX = resolveInteractionStandX(targetIdx, curX, shifted, anchorPt[0], maxReach, geo);
      } else if (c.do === 'push') {
        dstX = resolveStandX(targetIdx, curX, shifted, geo);
        const pushSide = dstX <= elCx ? -1 : 1;
        const hy = (el.anchors?.handle ?? el.anchors?.front)?.[1] ?? elCy;
        anchorPt = [pushSide === -1 ? el.bbox.x : el.bbox.x + el.bbox.w, hy];
      } else if (c.do === 'pull') {
        dstX = resolveStandX(targetIdx, curX, shifted, geo);
        const pushSide = dstX <= elCx ? -1 : 1;
        const handle = el.anchors?.handle ?? [elCx, elCy];
        anchorPt = Math.abs(dstX - handle[0]) <= maxReach * 0.92
          ? handle
          : [pushSide === -1 ? el.bbox.x : el.bbox.x + el.bbox.w, handle[1]];
      } else if (c.do === 'hold_up') {
        dstX = resolveStandX(targetIdx, curX, shifted, geo);
        anchorPt = el.anchors?.handle ?? el.anchors?.front ?? [elCx, elCy];
      } else if (c.do === 'draw') {
        dstX = resolveStandX(targetIdx, curX, shifted, geo);
        anchorPt = el.anchors?.front ?? [elCx, elCy];
      } else if (c.do === 'sit_on') {
        anchorPt = el.anchors?.seat ?? [elCx, el.bbox.y + el.bbox.h * 0.5];
        dstX = clampX(Math.round(anchorPt[0]), geo);
      }
    }

    const shoulderY = ground - 0.675 * H;
    const needsApproach = Boolean(
      el && (
        Math.abs(curX - anchorPt[0]) > maxReach
        || Math.hypot(curX - anchorPt[0], shoulderY - anchorPt[1]) > maxReach
        || (c.do === 'sit_on' && Math.abs(curX - dstX) > maxReach)
      ),
    );
    const walkStart = Math.max(rawT0, walkBusyUntil, interBusyUntil);
    let actT0 = walkStart;
    if (needsApproach && Math.abs(dstX - curX) >= 1) {
      const seg = pushWalk(walkStart, dstX, targetIdx, 'auto_approach', Math.max(walkStart + 0.2, nextLimit));
      if (seg.t1 > seg.t0 && simSeatedIdx !== null) {
        seg.exitSitIdx = simSeatedIdx;
        simSeatedIdx = null;
      }
      if (c.do === 'sit_on' && seg.t1 > seg.t0) seg.enterSitIdx = targetIdx;
      actT0 = seg.t1;
    }
    interactionStarts.set(c._idx, actT0);

    if (c.do === 'open') {
      const face = anchorPt[0] >= curX ? 1 : -1;
      curFacing = face;
      interactionEvents.push({ kind: 'open', targetIdx, t0: actT0, dur: 0.6, standX: curX, anchorPt, facing: face, cueIdx: c._idx });
      interBusyUntil = actT0 + 0.6;
    } else if (c.do === 'carry') {
      const face = anchorPt[0] >= curX ? 1 : -1;
      let autoDrop = null;
      if (simCarriedIdx !== null && simCarriedIdx !== targetIdx) {
        const others = shifted.filter((_, idx) => idx !== simCarriedIdx && idx !== targetIdx);
        const spot = computeDropSpot(curX, curFacing, ground, elements[simCarriedIdx], headR, others, geo);
        simDroppedSpots[simCarriedIdx] = spot;
        autoDrop = { idx: simCarriedIdx, spot };
      }
      delete simDroppedSpots[targetIdx];
      simCarriedIdx = targetIdx;
      curFacing = face;
      interactionEvents.push({ kind: 'carry', targetIdx, t0: actT0, dur: 0.6, standX: curX, anchorPt, facing: face, autoDrop, cueIdx: c._idx });
      carryPickupEnd = actT0 + 0.35;
      interBusyUntil = actT0 + 0.6;
    } else if (c.do === 'push' || c.do === 'pull') {
      const origEl = elements[targetIdx];
      const curObjDx = simObjDx[targetIdx] ?? 0;
      const minDx = origEl ? geo.walk.minX - origEl.bbox.x : -160;
      const maxDx = origEl ? geo.walk.maxX - (origEl.bbox.x + origEl.bbox.w) : 160;
      const preObjCx = origEl ? origEl.bbox.x + origEl.bbox.w / 2 + curObjDx : anchorPt[0];
      const awayDir = preObjCx >= curX ? 1 : -1;
      const moveDir = c.do === 'push' ? awayDir : -awayDir;
      const nextObjDx = Math.max(minDx, Math.min(maxDx, curObjDx + moveDir * 160));
      const deltaDx = nextObjDx - curObjDx;
      let endX = curX;
      if (c.do === 'push' && origEl) {
        endX = awayDir === 1
          ? Math.max(curX, Math.min(preObjCx - 4, origEl.bbox.x + nextObjDx - 60))
          : Math.min(curX, Math.max(preObjCx + 4, origEl.bbox.x + origEl.bbox.w + nextObjDx + 60));
      } else if (c.do === 'pull') {
        endX = clampX(curX + deltaDx, geo);
      }
      simObjDx[targetIdx] = nextObjDx;
      curFacing = awayDir;
      interactionEvents.push({
        kind: c.do, targetIdx, t0: actT0, dur: 0.7, standX: curX, endX, curObjDx, deltaDx,
        awayDir, baseAnchor: [anchorPt[0] - curObjDx, anchorPt[1]], facing: awayDir, cueIdx: c._idx,
      });
      curX = endX;
      interBusyUntil = actT0 + 0.7;
    } else if (c.do === 'hold_up') {
      interactionEvents.push({ kind: 'hold_up', targetIdx, t0: actT0, dur: 1.5, standX: curX, anchorPt, cueIdx: c._idx });
      curFacing = 1;
      interBusyUntil = actT0 + 1.5;
    } else if (c.do === 'draw') {
      const face = anchorPt[0] >= curX ? 1 : -1;
      curFacing = face;
      interactionEvents.push({ kind: 'draw', targetIdx, t0: actT0, dur: 1.0, standX: curX, anchorPt, facing: face, cueIdx: c._idx });
      interBusyUntil = actT0 + 1.0;
    } else if (c.do === 'sit_on') {
      interactionEvents.push({ kind: 'sit_on', targetIdx, t0: actT0, dur: 0.25, fromX: curX, seat: anchorPt, facing: 1, cueIdx: c._idx });
      curX = dstX;
      curFacing = 1;
      simSeatedIdx = targetIdx;
      interBusyUntil = actT0 + 0.25;
    }
  }

  return { walkSegments, interactionEvents, interactionStarts, curX, rushedMove };
}

/** Replays walk segments and interaction events up to time `t`. */
function evaluateTimelineAt(walkSegments, interactionEvents, elements, { t, startX, startFacing, geo = LANDSCAPE }) {
  let x = startX;
  let facing = startFacing;
  let walking = false;
  let trotting = false;
  let walkPhase = 0;
  let focusIdx = null;
  let focusChangedAt = -10;
  let activeInter = null;
  let seated = null;
  let sitWalk = null;
  let carriedIdx = null;
  const droppedSpots = {};
  const objDxAtT = {};

  const timelineItems = [
    ...walkSegments.map((s) => ({ kind: 'walk', t0: s.t0, seg: s })),
    ...interactionEvents.map((ev) => ({ kind: 'inter', t0: ev.t0, ev })),
  ].sort((a, b) => a.t0 - b.t0);

  for (const item of timelineItems) {
    if (item.t0 > t) break;
    if (item.kind === 'walk') {
      const seg = item.seg;
      seated = null;
      if (t < seg.t1 && seg.t1 > seg.t0) {
        const u = (t - seg.t0) / (seg.t1 - seg.t0);
        x = lerp(seg.fromX, seg.toX, easeInOutCubic(u));
        facing = seg.dir;
        walking = true;
        trotting = seg.trot;
        walkPhase = (t - seg.t0) * (seg.trot ? 2 : 1);
        if (seg.enterSitIdx != null || seg.exitSitIdx != null) {
          sitWalk = {
            enterIdx: seg.enterSitIdx ?? null,
            enterT1: seg.t1,
            exitIdx: seg.exitSitIdx ?? null,
            exitT0: seg.t0,
          };
        }
        if (Number.isInteger(seg.target)) { focusIdx = seg.target; focusChangedAt = seg.t0; }
        break;
      }
      x = seg.toX;
      if (Number.isInteger(seg.target)) {
        focusIdx = seg.target;
        focusChangedAt = seg.t0;
        const shiftedAtEnd = applyObjectShift(elements, objDxAtT, droppedSpots, geo);
        const el = shiftedAtEnd[seg.target];
        if (el) facing = (el.bbox.x + el.bbox.w / 2) >= x ? 1 : -1;
      } else if (seg.target === 'left') facing = 1;
      else if (seg.target === 'right') facing = -1;
      continue;
    }

    const ev = item.ev;
    if (ev.kind === 'stand_up') { seated = null; continue; }
    if (ev.kind === 'drop') {
      if (carriedIdx !== null) {
        droppedSpots[carriedIdx] = ev.dropSpot;
        carriedIdx = null;
      }
      continue;
    }
    seated = null;
    if (Number.isInteger(ev.targetIdx)) {
      focusIdx = ev.targetIdx;
      focusChangedAt = Math.max(focusChangedAt, ev.t0);
    }

    const dt = t - ev.t0;
    if (ev.kind === 'carry') {
      if (ev.autoDrop) droppedSpots[ev.autoDrop.idx] = ev.autoDrop.spot;
      delete droppedSpots[ev.targetIdx];
      carriedIdx = dt >= 0.35 ? ev.targetIdx : null;
    }
    if (ev.kind === 'sit_on') seated = { targetIdx: ev.targetIdx, seat: ev.seat, facing: ev.facing };
    if (ev.kind === 'push' || ev.kind === 'pull') {
      if (dt >= ev.dur) {
        objDxAtT[ev.targetIdx] = ev.curObjDx + ev.deltaDx;
        x = ev.endX;
      } else {
        objDxAtT[ev.targetIdx] = ev.curObjDx + ev.deltaDx * easeOutBack(clamp01(dt / ev.dur));
      }
    }

    if (dt >= 0 && dt < ev.dur) {
      activeInter = ev;
      const u = dt / ev.dur;
      if (ev.kind === 'open' || ev.kind === 'carry') {
        facing = ev.facing;
        const peakU = ev.kind === 'open' ? 0.5 : 0.58;
        if (Math.abs(ev.anchorPt[0] - ev.standX) > 115) {
          const stepInX = clampX(ev.anchorPt[0] - ev.facing * 85, geo);
          const stepEnv = u < peakU ? easeInOutCubic(u / peakU) : 1 - easeInOutCubic((u - peakU) / (1 - peakU));
          x = lerp(ev.standX, stepInX, stepEnv);
        } else x = ev.standX;
      } else if (ev.kind === 'push') {
        facing = ev.facing;
        x = lerp(ev.standX, ev.endX, easeOutCubic(clamp01(u / 0.45)));
      } else if (ev.kind === 'pull') {
        facing = ev.facing;
        const brace = ev.awayDir * 44 * Math.sin(u * Math.PI);
        x = clampX(ev.standX + (ev.endX - ev.standX) * easeOutBack(u) + brace, geo);
      } else if (ev.kind === 'hold_up') {
        facing = 1;
        x = ev.standX;
      } else if (ev.kind === 'draw') {
        facing = ev.facing;
        if (Math.abs(ev.anchorPt[0] - ev.standX) > 110) {
          const workX = clampX(ev.anchorPt[0] - ev.facing * 75, geo);
          const stepEnv = u < 0.15 ? easeOutCubic(u / 0.15) : u > 0.85 ? 1 - easeOutCubic((u - 0.85) / 0.15) : 1;
          x = lerp(ev.standX, workX, stepEnv);
        } else x = ev.standX;
      } else if (ev.kind === 'sit_on') {
        facing = ev.facing;
        x = lerp(ev.fromX, ev.seat[0], easeInOutCubic(clamp01(u)));
      } else if (ev.kind === 'react') {
        facing = ev.targetX >= x ? 1 : -1;
      }
    } else if (dt >= ev.dur) {
      if (ev.kind === 'sit_on') { x = ev.seat[0]; facing = ev.facing; }
      else if (ev.kind === 'react') facing = ev.targetX >= x ? 1 : -1;
      else if (ev.facing !== undefined) facing = ev.facing;
    }
  }

  return { x, facing, walking, trotting, walkPhase, focusIdx, focusChangedAt, activeInter, seated, sitWalk, carriedIdx, droppedSpots, objDxAtT };
}

/** Builds base body pose and pending IK descriptor for an active interaction event. */
function buildInteractionPose(manifest, ev, { t, H, facing, baseHoldPose, carriedIdx, cues, elements, interactionStarts }) {
  const dt = t - ev.t0;
  const u = dt / ev.dur;
  let view = 'three_quarter';
  let angles = baseHoldPose;
  let lift = 0;
  let seatY = null;
  let shiftX = 0;
  let activeInterPhase = ev.kind;
  let ikOp = null;
  let isFastMotion = false;

  if (ev.kind === 'open') {
    const env = Math.sin(u * Math.PI);
    const leanAngles = { ...baseHoldPose, waist: 8 * env, chest: 4 * env };
    activeInterPhase = u <= 0.5 ? 'reach' : 'pull';
    angles = leanAngles;
    if (dt <= 0.22) ikOp = { kind: 'tween_in', from: baseHoldPose, target: ev.anchorPt, progress: dt / 0.22 };
    else if (dt <= 0.36) ikOp = { kind: 'reach', target: ev.anchorPt };
    else {
      const pullU = (dt - 0.36) / (ev.dur - 0.36);
      const pullTarget = [ev.anchorPt[0] - ev.facing * 26 * Math.sin(pullU * Math.PI), ev.anchorPt[1]];
      ikOp = pullU < 0.65
        ? { kind: 'reach', target: pullTarget }
        : { kind: 'tween_out', to: baseHoldPose, target: pullTarget, progress: (pullU - 0.65) / 0.35 };
    }
    isFastMotion = u >= 0.15 && u <= 0.85;
  } else if (ev.kind === 'carry') {
    if (dt < 0.35) {
      activeInterPhase = 'reach';
      angles = { ...baseHoldPose, waist: 6, chest: 4 };
      ikOp = dt <= 0.24
        ? { kind: 'tween_in', from: baseHoldPose, target: ev.anchorPt, progress: dt / 0.24 }
        : { kind: 'reach', target: ev.anchorPt };
    } else {
      activeInterPhase = 'lift';
      ikOp = { kind: 'carry_lift', target: ev.anchorPt, progress: clamp01((dt - 0.35) / 0.25) };
    }
    isFastMotion = true;
  } else if (ev.kind === 'push' || ev.kind === 'pull') {
    const isPush = ev.kind === 'push';
    const env = Math.sin(u * Math.PI);
    const targetPt = [ev.baseAnchor[0] + ev.curObjDx + ev.deltaDx * easeOutBack(u), ev.baseAnchor[1]];
    angles = clampAngles(manifest, {
      ...baseHoldPose,
      waist: isPush ? 24 * Math.max(0.5, env) : -14 * Math.max(0.5, env),
      chest: isPush ? 12 * Math.max(0.5, env) : -8 * Math.max(0.5, env),
      l_hip: isPush ? 18 * env : -10 * env,
      l_knee: isPush ? 18 * env : 14 * env,
      r_hip: isPush ? -12 * env : 16 * env,
      r_knee: 10 * env,
    });
    ikOp = dt < 0.14
      ? { kind: 'tween_in', from: baseHoldPose, target: targetPt, bothArms: isPush, preserveTorso: !isPush, progress: dt / 0.14 }
      : dt <= 0.58
        ? { kind: 'reach', target: targetPt, bothArms: isPush, preserveTorso: !isPush }
        : { kind: 'tween_out', to: baseHoldPose, target: targetPt, bothArms: isPush, preserveTorso: !isPush, progress: (dt - 0.58) / 0.12 };
    isFastMotion = true;
  } else if (ev.kind === 'hold_up') {
    view = 'front';
    activeInterPhase = u < 0.25 ? 'lift' : u <= 0.75 ? 'hold' : 'lower';
    angles = clampAngles(manifest, {
      pelvis: 0, waist: 0, chest: 0, neck: 0, head: 0,
      l_hip: 8, l_knee: 4, l_ankle: 0, r_hip: 10, r_knee: 6, r_ankle: 0,
    });
    ikOp = { kind: 'hold_up', u, anchorPt: ev.anchorPt };
    isFastMotion = u < 0.25 || u > 0.75;
  } else if (ev.kind === 'draw') {
    const sweepPt = [
      ev.anchorPt[0] + Math.sin(u * 4 * Math.PI) * 28,
      ev.anchorPt[1] + Math.sin(u * 2 * Math.PI) * 14,
    ];
    angles = clampAngles(manifest, { ...baseHoldPose, waist: 6, chest: 4 });
    ikOp = dt < 0.12
      ? { kind: 'tween_in', from: baseHoldPose, target: sweepPt, progress: dt / 0.12 }
      : dt <= 0.88
        ? { kind: 'reach', target: sweepPt }
        : { kind: 'tween_out', to: baseHoldPose, target: sweepPt, progress: (dt - 0.88) / 0.12 };
    isFastMotion = true;
  } else if (ev.kind === 'sit_on') {
    activeInterPhase = 'sit';
    seatY = ev.seat[1];
    const sitEase = easeInOutCubic(u);
    angles = clampAngles(manifest, Object.fromEntries(
      JOINTS.map((j) => [j, lerp(baseHoldPose[j] ?? 0, SIT_ON_ANGLES[j] ?? 0, sitEase)]),
    ));
    if (carriedIdx !== null) angles = clampAngles(manifest, { ...angles, ...CARRY_POSE });
    isFastMotion = true;
  } else if (ev.kind === 'react') {
    const objState = objectStateAt(elements, cues, interactionStarts, ev.targetIdx, ev.t0);
    const env = Math.sin(u * Math.PI);
    if (BAD_OBJECT_STATES.has(objState)) {
      angles = clampAngles(manifest, {
        ...baseHoldPose,
        pelvis: -6 * env,
        waist: -14 * env,
        chest: -10 * env,
        head: -8 * env,
        l_shoulder: lerp(baseHoldPose.l_shoulder, 70, env),
        l_elbow: lerp(baseHoldPose.l_elbow, 96, env),
        r_shoulder: lerp(baseHoldPose.r_shoulder, 56, env),
        r_elbow: lerp(baseHoldPose.r_elbow, 88, env),
        l_hip: 18 * env,
        l_knee: 24 * env,
        r_hip: 10 * env,
        r_knee: 16 * env,
      });
      shiftX = -facing * 0.05 * H * Math.sin(clamp01(u / 0.75) * Math.PI);
    } else {
      view = 'front';
      const cheerSpec = resolvePose(manifest, 'cheer');
      lift = u > 0.15 && u < 0.75 ? Math.sin(((u - 0.15) / 0.6) * Math.PI) * 0.05 : 0;
      angles = tweenPoseAngles(manifest, baseHoldPose, cheerSpec.angles, Math.min(dt, 0.35), {
        duration: 0.35, anticipate: true, overshoot: true,
      });
    }
    isFastMotion = u >= 0.1 && u <= 0.8;
  }

  return { view, angles, lift, seatY, shiftX, activeInterPhase, ikOp, isFastMotion };
}

/** Applies the final IK pass after torso/micro perturbations so hands land within <= 2 px of target anchors. */
function applyInteractionIK(manifest, ikOp, angles, { view, facing, x, ground, lift, seatY, baseHoldPose, H }) {
  if (!ikOp) return angles;
  if (ikOp.kind === 'point') {
    return aimArmAt(manifest, angles, { view, facing, x, ground, lift, seatY, target: ikOp.target, prop: ikOp.prop });
  }
  if (ikOp.kind === 'reach') {
    return solveReachWithCrouch(manifest, angles, { view, facing, x, ground, lift, seatY, target: ikOp.target, bothArms: ikOp.bothArms, preserveTorso: ikOp.preserveTorso });
  }
  if (ikOp.kind === 'tween_in') {
    const ikPeak = solveReachWithCrouch(manifest, angles, { view, facing, x, ground, lift, seatY, target: ikOp.target, bothArms: ikOp.bothArms, preserveTorso: ikOp.preserveTorso });
    const k = easeInOutCubic(clamp01(ikOp.progress));
    return clampAngles(manifest, Object.fromEntries(JOINTS.map((j) => [j, lerp(ikOp.from[j] ?? angles[j] ?? 0, ikPeak[j] ?? 0, k)])));
  }
  if (ikOp.kind === 'tween_out') {
    const ikStart = solveReachWithCrouch(manifest, angles, { view, facing, x, ground, lift, seatY, target: ikOp.target, bothArms: ikOp.bothArms, preserveTorso: ikOp.preserveTorso });
    const k = easeInOutCubic(clamp01(ikOp.progress));
    return clampAngles(manifest, Object.fromEntries(JOINTS.map((j) => [j, lerp(ikStart[j] ?? 0, ikOp.to[j] ?? 0, k)])));
  }
  if (ikOp.kind === 'carry_lift') {
    const ikPickup = solveReachWithCrouch(manifest, angles, { view, facing, x, ground, lift, seatY, target: ikOp.target });
    const carryAngles = clampAngles(manifest, { ...baseHoldPose, ...CARRY_POSE });
    const k = easeInOutCubic(clamp01(ikOp.progress));
    return clampAngles(manifest, Object.fromEntries(JOINTS.map((j) => [j, lerp(ikPickup[j] ?? 0, carryAngles[j] ?? 0, k)])));
  }
  if (ikOp.kind === 'hold_up') {
    const fkHead = forwardKinematics(manifest, angles, { view: 'front', facing: 1, x, ground, lift });
    const overhead = [x, fkHead.points.head_center[1] - fkHead.R - 24];
    const chestPt = [x, Math.max(overhead[1] + 40, ground - 0.56 * H)];
    let holdTarget = overhead;
    if (ikOp.u < 0.25) {
      const k = easeOutCubic(ikOp.u / 0.25);
      holdTarget = [lerp(chestPt[0], overhead[0], k), lerp(chestPt[1], overhead[1], k)];
    } else if (ikOp.u > 0.75) {
      const k = easeInOutCubic((ikOp.u - 0.75) / 0.25);
      holdTarget = [lerp(overhead[0], chestPt[0], k), lerp(overhead[1], chestPt[1], k)];
    }
    return aimBothArmsAt(manifest, angles, { view: 'front', facing: 1, x, ground, lift, targetL: holdTarget, targetR: holdTarget });
  }
  return angles;
}

const hostPlanCache = new WeakMap();

function getCachedHostPlan(manifest, plan) {
  const H = manifest.height_px;
  const geo = plan.frame ?? LANDSCAPE;
  const ground = plan.ground ?? geo.ground;
  const start = plan.startState ?? { x: geo.hostHome, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' };
  const cues = plan.cues ?? [];
  const elements = plan.elements ?? [];
  const sentences = plan.sentences ?? [];
  const seed = plan.seed ?? 'sh01';
  const prev = hostPlanCache.get(plan);
  if (
    prev
    && prev.manifest === manifest
    && prev.cues === cues
    && prev.elements === elements
    && prev.start === start
    && prev.sentences === sentences
    && prev.durationSec === plan.durationSec
    && prev.ground === ground
    && prev.geo === geo
    && prev.seed === seed
  ) {
    return prev;
  }

  const orderedCues = cues
    .map((c, idx) => ({ ...c, _idx: idx }))
    .sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0) || a._idx - b._idx);
  const totalDur = Number.isFinite(plan.durationSec)
    ? plan.durationSec
    : Math.max(10, ...orderedCues.map((c) => (c.timeMs ?? 0) / 1000 + 4));

  const headR = (manifest.joints.head.length * H) / 2;
  const { walkSegments, interactionEvents, interactionStarts, curX, rushedMove } = planHostTimeline(
    H,
    elements,
    orderedCues,
    { startX: start.x, startFacing: start.facing ?? 1, ground, totalDur, headR, geo },
  );

  const explicitActionSentences = new Set(
    cues.filter((c) => c.do === 'gesture' || INTERACTION_DO.has(c.do)).map((c) => c.sentence),
  );
  const visualCueSentences = new Set(cues.filter((c) => c.do === 'reveal' || c.do === 'highlight' || c.do === 'move').map((c) => c.sentence));
  const autoBeats = [];
  let autoSnaps = start.autoSnaps ?? 0;
  let runningGesture = resolvePose(manifest, start.gesture).type === 'once' ? 'idle' : start.gesture;
  sentences.forEach((s, si) => {
    const sentIdx = s.index ?? si;
    if (explicitActionSentences.has(sentIdx)) {
      const last = cues.filter((c) => c.do === 'gesture' && c.sentence === sentIdx).at(-1);
      if (last && resolvePose(manifest, last.target).type !== 'once') runningGesture = last.target;
      return;
    }
    if (si === 0 && start.gesture !== 'idle') {
      if (resolvePose(manifest, start.gesture).type !== 'once') runningGesture = start.gesture;
      return;
    }
    const beat = inferSentenceBeat(s.text, {
      index: sentIdx,
      hasVisualCue: visualCueSentences.has(sentIdx),
      prevGesture: runningGesture,
      autoSnaps,
    });
    if (beat.gesture === 'snap') autoSnaps += 1;
    if (resolvePose(manifest, beat.gesture).type !== 'once') runningGesture = beat.gesture;
    autoBeats.push({ sentence: sentIdx, timeMs: Math.max(0, (s.startMs ?? 0) - 80), do: 'gesture', target: beat.gesture });
  });
  const effectiveCues = [...cues, ...autoBeats].sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));

  const afterWalk = (ct) => {
    const seg = walkSegments.find((s) => s.t1 > s.t0 && ct >= s.t0 - 1e-6 && ct < s.t1);
    return seg ? seg.t1 : ct;
  };
  const propTimeline = [
    ...effectiveCues.filter((c) => c.do === 'prop').map((c) => ({ t: (c.timeMs ?? 0) / 1000, prop: c.target })),
    ...interactionEvents.filter((ev) => ev.kind === 'carry').map((ev) => ({ t: ev.t0, prop: 'none' })),
  ].sort((a, b) => a.t - b.t);

  const cueTimes = [
    0,
    ...effectiveCues.filter((c) => c.do === 'gesture' || c.do === 'move' || INTERACTION_DO.has(c.do)).map((c) => (c.timeMs ?? 0) / 1000),
    plan.durationSec ?? Infinity,
  ].sort((a, b) => a - b);
  const quiet = cueTimes.slice(1).map((end, i) => [cueTimes[i], end]).filter(([a, b]) => b > a);
  const fidgets = fidgetSchedule(quiet, seed)
    .filter((f) => !walkSegments.some((seg) => f.t0 < seg.t1 && f.t0 + 0.8 > seg.t0))
    .filter((f) => !interactionEvents.some((ev) => f.t0 < ev.t0 + ev.dur && f.t0 + 0.8 > ev.t0));

  const kickOf = (g, t0) => ({ t0: g === 'double_take' ? t0 + 0.35 * (resolvePose(manifest, g).seconds ?? 1) : t0, amp: g === 'startle' ? -1 : 1 });
  const kicks = [
    ...(['jump', 'startle', 'double_take'].includes(start.gesture) ? [kickOf(start.gesture, 0)] : []),
    ...effectiveCues.filter((c) => c.do === 'gesture' && ['jump', 'startle', 'double_take'].includes(c.target)).map((c) => kickOf(c.target, afterWalk(c.timeMs / 1000))),
    ...effectiveCues.filter((c) => c.do === 'expr' && ['surprised', 'amazed'].includes(c.target)).map((c) => ({ t0: c.timeMs / 1000, amp: -0.7 })),
    ...fidgets.filter((f) => f.kind === 'flick').map((f) => ({ t0: f.t0, amp: 0.6 })),
  ];

  const entry = {
    manifest, cues, elements, start, sentences, durationSec: plan.durationSec, ground, geo, seed,
    orderedCues, walkSegments, interactionEvents, interactionStarts, curX, rushedMove,
    autoSnaps, effectiveCues, afterWalk, propTimeline, fidgets, kicks,
  };
  if (typeof plan === 'object' && plan !== null) hostPlanCache.set(plan, entry);
  return entry;
}

/**
 * Evaluates full host state at time `t` inside a `host-left` or `stage` shot.
 * Returns state directly consumable by `drawHost(manifest, state)` plus QA metadata and live stage interaction state.
 */
/**
 * Times for the sound layer (音效与配乐设计 §4.2): walks, interactions and one-shot gestures of one host plan,
 * with the host's x at each moment. Reads the cached plan only; animation is unchanged.
 */
export function hostEventTimeline(manifest, plan) {
  const { walkSegments, interactionEvents, interactionStarts, effectiveCues, afterWalk, start, cues, elements } = getCachedHostPlan(manifest, plan);
  const walks = [...walkSegments].filter((s) => s.t1 > s.t0).sort((a, b) => a.t0 - b.t0);
  const xAt = (t) => {
    let x = start.x;
    for (const s of walks) {
      if (t < s.t0) break;
      if (t >= s.t1) { x = s.toX; continue; }
      return lerp(s.fromX, s.toX, (t - s.t0) / (s.t1 - s.t0));
    }
    return x;
  };
  const interactions = interactionEvents
    .filter((ev) => ev.kind !== 'stand_up')
    .map((ev) => ({
      kind: ev.kind,
      t0: ev.t0,
      dur: ev.dur,
      x: ev.standX ?? xAt(ev.t0),
      targetIdx: ev.targetIdx ?? null,
      ...(ev.kind === 'react' ? { targetState: objectStateAt(elements, cues, interactionStarts, ev.targetIdx, ev.t0) } : {}),
    }));
  const gestures = [];
  if (resolvePose(manifest, start.gesture).type === 'once') gestures.push({ gesture: start.gesture, t0: 0, x: start.x });
  for (const c of effectiveCues) {
    if (c.do !== 'gesture' || resolvePose(manifest, c.target).type !== 'once') continue;
    const t0 = afterWalk((c.timeMs ?? 0) / 1000);
    gestures.push({ gesture: c.target, t0, x: xAt(t0) });
  }
  return {
    walks: walks.map((s) => ({ t0: s.t0, t1: s.t1, fromX: s.fromX, toX: s.toX, trot: Boolean(s.trot) })),
    interactions,
    gestures: gestures.sort((a, b) => a.t0 - b.t0),
  };
}

export function evaluateHostAt(manifest, plan, t, audioFrame = { open: 0, width: 0.5, nod: 0 }) {
  const H = manifest.height_px;
  const geo = plan.frame ?? LANDSCAPE;
  const ground = plan.ground ?? geo.ground;
  const start = plan.startState ?? { x: geo.hostHome, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' };
  const cues = plan.cues ?? [];
  const elements = plan.elements ?? [];
  const theme = plan.theme ?? 'light';
  const style = plan.style;
  const {
    orderedCues, walkSegments, interactionEvents, interactionStarts, curX, rushedMove,
    autoSnaps, effectiveCues, afterWalk, propTimeline, fidgets, kicks,
  } = getCachedHostPlan(manifest, plan);

  let {
    x, facing, walking, trotting, walkPhase, focusIdx, focusChangedAt,
    activeInter, seated, sitWalk, carriedIdx, droppedSpots, objDxAtT,
  } = evaluateTimelineAt(walkSegments, interactionEvents, elements, {
    t,
    startX: start.x,
    startFacing: start.facing ?? 1,
    geo,
  });

  // Track reveal, highlight, and state cues for focus & micro-cooperation (§6.4)
  let revealAt = -10;
  let revealTargetIdx = null;
  let nodCueAt = -10;
  for (const c of orderedCues) {
    const ct = interactionStarts.get(c._idx) ?? (c.timeMs ?? 0) / 1000;
    if (ct > t) continue;
    if (c.do === 'reveal') {
      if (Number.isInteger(c.target)) {
        focusIdx = c.target;
        focusChangedAt = Math.max(focusChangedAt, ct);
        revealTargetIdx = c.target;
      }
      revealAt = Math.max(revealAt, ct);
    } else if (c.do === 'highlight' || c.do === 'state') {
      if (c.do === 'highlight' && Number.isInteger(c.target)) {
        focusIdx = c.target;
        focusChangedAt = Math.max(focusChangedAt, ct);
      }
      nodCueAt = Math.max(nodCueAt, ct);
    }
  }

  // Active expression, prop (auto-dropped by carry), hold gesture, and one-shot gesture
  let expr = start.expr;
  let prevExpr = start.expr;
  let exprChangedAt = -10;
  let prop = start.prop ?? 'none';
  let holdGesture = resolvePose(manifest, start.gesture).type === 'once' ? 'idle' : start.gesture;
  let prevHoldGesture = holdGesture;
  let holdChangedAt = -10;
  let activeOnce = resolvePose(manifest, start.gesture).type === 'once' ? { gesture: start.gesture, t0: 0 } : null;

  for (const pe of propTimeline) {
    if (pe.t > t) break;
    prop = pe.prop;
  }

  for (const c of effectiveCues) {
    const ct = (c.timeMs ?? 0) / 1000;
    if (ct > t) break;
    if (c.do === 'expr') { prevExpr = expr; expr = c.target; exprChangedAt = ct; }
    else if (c.do === 'gesture') {
      const p = resolvePose(manifest, c.target);
      if (p.type === 'once') {
        const onceT0 = afterWalk(ct);
        if (onceT0 <= t && (!activeOnce || onceT0 >= activeOnce.t0)) activeOnce = { gesture: c.target, t0: onceT0 };
      } else { prevHoldGesture = holdGesture; holdGesture = c.target; holdChangedAt = ct; }
    }
  }

  // Focus target point accounting for any push/pull/drop offsets
  const currentElements = applyObjectShift(elements, objDxAtT, droppedSpots, geo);
  const focusEl = focusIdx !== null ? currentElements[focusIdx] : null;
  const focusPt = focusEl
    ? (focusEl.anchors?.front ?? [focusEl.bbox.x + focusEl.bbox.w / 2, focusEl.bbox.y + focusEl.bbox.h + 20])
    : geo.focusDefault;

  const fidget = fidgets.find((f) => t >= f.t0 && t < f.t0 + 0.8) ?? null;
  const fidgetEnv = fidget ? Math.sin(((t - fidget.t0) / 0.8) * Math.PI) : 0;

  // Build base angles + lift + seatY + view
  let gesture = holdGesture;
  let spark = 0;
  let gazeOverride = null;
  let shiftX = 0;
  let inOnce = false;
  let view = resolvePose(manifest, holdGesture).view;
  let angles;
  let lift = resolvePose(manifest, holdGesture).lift ?? 0;
  let seatY = null;
  let tapImpact = 0;
  let isFastMotion = false;
  let activeInterPhase = null;
  let ikOp = null;

  const heldProp = prop === 'none' ? undefined : prop;
  const baseHoldPose = clampAngles(manifest, poseAngles(manifest, holdGesture, heldProp, view));

  if (walking) {
    const wf = walkFrame(manifest, walkPhase, { x, ground, facing, trot: trotting });
    angles = wf.angles;
    lift = wf.lift;
    view = 'side';
    isFastMotion = trotting;
    if (carriedIdx !== null) angles = clampAngles(manifest, { ...angles, ...CARRY_POSE });
  } else if (activeInter) {
    const built = buildInteractionPose(manifest, activeInter, {
      t, H, facing, baseHoldPose, carriedIdx, cues, elements, interactionStarts,
    });
    ({ view, angles, lift, seatY, shiftX, activeInterPhase, ikOp, isFastMotion } = built);
  } else if (seated) {
    view = 'three_quarter';
    seatY = seated.seat[1];
    lift = 0;
    angles = clampAngles(manifest, {
      ...SIT_ON_ANGLES,
      ...(carriedIdx !== null ? CARRY_POSE : {}),
    });
  } else {
    const fromA = poseAngles(manifest, prevHoldGesture, heldProp, view);
    const toA = poseAngles(manifest, holdGesture, heldProp, view);
    const isPoint = ['point', 'point_right', 'present'].includes(holdGesture) && carriedIdx === null;
    const dur = isPoint ? 0.4 : tweenDuration(fromA, toA);
    if (t - holdChangedAt >= 0 && t - holdChangedAt < dur) {
      angles = tweenPoseAngles(manifest, fromA, toA, t - holdChangedAt, { duration: dur, anticipate: isPoint, overshoot: isPoint });
    } else {
      angles = clampAngles(manifest, toA);
    }

    if (isPoint && focusEl) {
      facing = focusPt[0] >= x ? 1 : -1;
      ikOp = { kind: 'point', target: focusPt, prop: heldProp };
    } else if (holdGesture === 'lean_in') {
      if (focusEl) facing = focusPt[0] >= x ? 1 : -1;
      gazeOverride = [0.06, -0.04];
    }

    // Check one-shot gesture override
    if (activeOnce) {
      const spec = resolvePose(manifest, activeOnce.gesture);
      const sec = spec.seconds ?? 0.8;
      const dt = t - activeOnce.t0;
      if (dt >= 0 && dt < sec + 0.3) {
        inOnce = true;
        gesture = activeOnce.gesture;
        view = spec.view;
        if (dt < sec) {
          const u = dt / sec;
          if (activeOnce.gesture === 'jump') {
            isFastMotion = u >= 0.15 && u <= 0.85;
            if (u < 0.1875) {
              const c = easeOutCubic(u / 0.1875);
              angles = clampAngles(manifest, { ...angles, l_hip: lerp(angles.l_hip, 35, c), r_hip: lerp(angles.r_hip, 32, c), l_knee: lerp(angles.l_knee, 55, c), r_knee: lerp(angles.r_knee, 52, c), waist: lerp(angles.waist, 10, c) });
              lift = 0;
            } else if (u < 0.625) {
              const air = (u - 0.1875) / (0.625 - 0.1875);
              lift = 4 * air * (1 - air) * 0.12;
              angles = clampAngles(manifest, spec.angles);
            } else {
              const land = (u - 0.625) / (1 - 0.625);
              const bounce = Math.sin(land * Math.PI);
              lift = 0;
              angles = clampAngles(manifest, { ...toA, l_knee: (toA.l_knee ?? 4) + bounce * 26, r_knee: (toA.r_knee ?? 4) + bounce * 24 });
            }
          } else if (activeOnce.gesture === 'wave') {
            isFastMotion = true;
            const waveRad = u * 3 * 2 * Math.PI;
            angles = clampAngles(manifest, {
              ...spec.angles,
              l_elbow: (spec.angles.l_elbow ?? 65) + Math.sin(waveRad) * 25,
              l_wrist: Math.sin(waveRad - Math.PI / 4) * 18,
            });
          } else if (activeOnce.gesture === 'cheer') {
            isFastMotion = u >= 0.1 && u <= 0.7;
            const hop = u > 0.15 && u < 0.65 ? Math.sin(((u - 0.15) / 0.5) * Math.PI) * 0.06 : 0;
            lift = hop;
            angles = tweenPoseAngles(manifest, toA, spec.angles, Math.min(dt, 0.35), { duration: 0.35, anticipate: true, overshoot: true });
          } else if (activeOnce.gesture === 'tap') {
            if (focusEl) facing = focusPt[0] >= x ? 1 : -1;
            const reach = Math.sin(u * Math.PI);
            const tapBase = poseAngles(manifest, 'tap', heldProp, view);
            const tapTarget = focusEl?.anchors?.front
              ? [focusPt[0] - facing * 12 * (1 - reach), focusPt[1]]
              : [focusPt[0], focusPt[1] - 12 * reach];
            angles = clampAngles(manifest, tapBase);
            ikOp = { kind: 'point', target: tapTarget, prop: heldProp };
            if (u >= 0.4 && u <= 0.65) tapImpact = Math.sin(((u - 0.4) / 0.25) * Math.PI);
          } else {
            angles = tweenPoseAngles(manifest, toA, spec.angles, Math.min(dt, 0.3), { duration: 0.3, anticipate: true, overshoot: true });
            if (activeOnce.gesture === 'snap') {
              const flick = u > 0.45 && u < 0.65 ? Math.sin(((u - 0.45) / 0.2) * Math.PI) : 0;
              angles = clampAngles(manifest, { ...angles, l_wrist: angles.l_wrist - 30 * flick });
              if (u >= 0.5) spark = 1 - (u - 0.5) / 0.5;
            } else if (activeOnce.gesture === 'startle') {
              isFastMotion = u < 0.4;
              lift = u < 0.4 ? Math.sin((u / 0.4) * Math.PI) * 0.03 : 0;
              shiftX = -facing * 0.03 * H * Math.sin(Math.min(1, u / 0.3) * (Math.PI / 2)) * (1 - u);
            } else if (activeOnce.gesture === 'double_take') {
              if (focusEl) facing = focusPt[0] >= x ? 1 : -1;
              const away = u < 0.35 ? Math.sin((u / 0.35) * (Math.PI / 2)) : u < 0.5 ? 1 - easeOutCubic((u - 0.35) / 0.15) : 0;
              const back = u >= 0.35 && u < 0.75 ? Math.sin(((u - 0.35) / 0.4) * Math.PI) : 0;
              isFastMotion = u >= 0.35 && u < 0.5;
              angles = clampAngles(manifest, { ...angles, neck: angles.neck + 10 * away - 4 * back, head: angles.head + 14 * away - 10 * back });
              lift = back * 0.015;
              gazeOverride = away > 0.5 ? [-0.08, 0.04] : back > 0.2 ? [0.08, -0.03] : null;
            } else if (activeOnce.gesture === 'scratch_head') {
              const rub = u > 0.2 && u < 0.85 ? Math.sin(u * 6 * Math.PI) : 0;
              angles = clampAngles(manifest, { ...angles, l_wrist: angles.l_wrist + 15 * rub, l_elbow: angles.l_elbow + 6 * rub });
            }
          }
        } else {
          angles = tweenPoseAngles(manifest, spec.angles, toA, dt - sec, { duration: 0.3 });
          lift = 0;
        }
      }
    }
    if (carriedIdx !== null && !ikOp && !inOnce) {
      angles = clampAngles(manifest, { ...angles, ...CARRY_POSE });
    }
  }

  // Walk velocity at any time, for the scarf and the 呆毛 springs
  const velAt = (ts) => {
    for (const seg of walkSegments) {
      if (ts >= seg.t0 && ts < seg.t1 && seg.t1 > seg.t0) {
        const u = (ts - seg.t0) / (seg.t1 - seg.t0);
        return ((seg.toX - seg.fromX) / (seg.t1 - seg.t0)) * 6 * u * (1 - u);
      }
    }
    return 0;
  };

  // Question-end detection and micro-acting (§4.3, §6.4)
  const activeSent = (plan.sentences ?? []).find((s) => t * 1000 >= s.startMs && t * 1000 <= s.endMs);
  const isQuestionEnd = Boolean(activeSent && /[？?][」』”’）)》】\]"']*$/.test(activeSent.text) && (activeSent.endMs - t * 1000) <= 500);
  const micro = computeMicroActing(t, plan.seed ?? 'sh01', {
    audioFrame,
    isQuestionEnd,
    focusChangedAt,
    isIdle: !walking && !activeInter && !seated && holdGesture === 'idle',
    focusDirX: focusPt[0] >= x ? 1 : -1,
  });

  // Auto micro-cooperation (§6.4): turn head on reveal (0.6s), nod on highlight/state (0.35s) when not walking/once/activeInter
  let coopNeck = 0;
  let coopHead = 0;
  if (!walking && !inOnce && !activeInter) {
    if (t - revealAt >= 0 && t - revealAt <= 0.6 && revealTargetIdx !== null) {
      const revEnv = Math.sin(((t - revealAt) / 0.6) * Math.PI);
      const revEl = currentElements[revealTargetIdx];
      const rx = revEl ? revEl.bbox.x + revEl.bbox.w / 2 : focusPt[0];
      const relDir = (rx >= x ? 1 : -1) * facing;
      coopNeck += 4 * relDir * revEnv;
      coopHead += 8 * relDir * revEnv;
      if (!gazeOverride) gazeOverride = [0.08 * relDir * revEnv, -0.04 * revEnv];
    }
    if (t - nodCueAt >= 0 && t - nodCueAt <= 0.35) {
      const nodEnv = Math.sin(((t - nodCueAt) / 0.35) * Math.PI);
      coopHead += 5 * nodEnv;
    }
  }

  // Apply subtle breathing / weight shift / nod / question tilt + speech-driven conversational arm beats
  const lockArms = Boolean(ikOp || activeInter || carriedIdx !== null);
  const speechEnv = !walking && lift < 0.01 ? clamp01((audioFrame?.open ?? 0) * 1.15) : 0;
  const talkElbow = !lockArms && speechEnv > 0.08 ? Math.sin(t * 4.8) * 7 * speechEnv : 0;
  const talkShoulder = !lockArms && speechEnv > 0.08 ? Math.sin(t * 2.4) * 4 * speechEnv : 0;
  const talkWrist = !lockArms && speechEnv > 0.08 ? Math.sin(t * 4.8 - 0.6) * 8 * speechEnv : 0;
  const talkOtherElbow = !lockArms && speechEnv > 0.08 ? Math.cos(t * 3.6) * 4 * speechEnv : 0;
  const keepTorsoExact = activeInter?.kind === 'hold_up';
  angles = clampAngles(manifest, {
    ...angles,
    waist: (angles.waist ?? 0) + (keepTorsoExact ? 0 : speechEnv * 1.5),
    chest: (angles.chest ?? 0) + (keepTorsoExact ? 0 : micro.breath * 0.8 + speechEnv * 1.0),
    neck: (angles.neck ?? 0) + coopNeck,
    head: (angles.head ?? 0) + micro.nod + micro.tilt + coopHead,
    l_shoulder: (angles.l_shoulder ?? 0) + talkShoulder,
    l_elbow: (angles.l_elbow ?? 0) + talkElbow,
    l_wrist: (angles.l_wrist ?? 0) + talkWrist,
    r_elbow: (angles.r_elbow ?? 0) + talkOtherElbow,
  });

  // Surprise recoil (§4.4) and fidgets
  const surpriseAt = ['surprised', 'amazed'].includes(expr) && exprChangedAt >= 0 ? exprChangedAt : null;
  const recoil = !keepTorsoExact && surpriseAt !== null && t - surpriseAt < 0.3 ? Math.sin(((t - surpriseAt) / 0.3) * Math.PI) : 0;
  const fidgetOn = fidget && !walking && !inOnce && !activeInter ? fidgetEnv : 0;
  angles = clampAngles(manifest, {
    ...angles,
    waist: angles.waist - 5 * recoil,
    chest: angles.chest - 4 * recoil,
    head: angles.head - (fidget?.kind === 'look' ? 6 * fidgetOn : 0),
  });
  if (fidget?.kind === 'tiptoe' && holdGesture !== 'sit' && !seated && !activeInter) lift += 0.02 * fidgetOn;
  if (fidget?.kind === 'look' && fidgetOn > 0) gazeOverride = [-0.08 * fidgetOn, 0];
  shiftX += -facing * 0.015 * H * recoil;
  const finalX = x + (activeInter || seated ? 0 : micro.weightShift) + shiftX;

  angles = applyInteractionIK(manifest, ikOp, angles, {
    view, facing, x: finalX, ground, lift, seatY, baseHoldPose, H,
  });

  // 呆毛: morph to the new expression's shape, spring on walks, kicks and flicks (§3.1, §4.3, §4.4)
  const kick = manifest.ahoge.spring.kick;
  const bend = simulateAhogeSpring(manifest, (ts) => {
    const k = kicks.find((kk) => ts >= kk.t0 && ts < kk.t0 + 0.08);
    return k ? k.amp * kick : Math.max(-kick, Math.min(kick, -Math.abs(velAt(ts)) * 0.06));
  }, t);
  const ahoge = { fromExpr: prevExpr, mix: easeInOutCubic(clamp01((t - exprChangedAt) / manifest.ahoge.morph_seconds)), bend };
  const squash = (manifest.expressions && Object.hasOwn(manifest.expressions, expr) ? manifest.expressions[expr].squash : 0) ?? 0;
  const headStretch = t - exprChangedAt >= 0 && t - exprChangedAt < 0.3 ? squash * (1 - easeOutCubic((t - exprChangedAt) / 0.3)) : 0;

  // Deterministic scarf spring (velocity sampled from walk segments)
  const scarfAngles = simulateScarfSpring(manifest, velAt, Math.min(t, 3));
  const symbolOpacity = exprChangedAt >= 0 ? clamp01((t - exprChangedAt) / 0.2) : 1;

  // Final FK for bodyBbox & exact handPos / carriedPos
  const fk = forwardKinematics(manifest, angles, { view, facing, x: finalX, ground, lift, seatY });
  const topV = manifest.ahoge
    ? Math.min(-1, ...ahogePoints(manifest, { expr, ...ahoge, outfit: plan.outfit ?? 'none' }).map(([, v]) => v)) - Math.max(0, headStretch)
    : -1;
  const headTop = fk.points.head_center[1] + topV * fk.R;
  const bodyBbox = {
    x: finalX - fk.R,
    y: headTop,
    w: fk.R * 2,
    h: ground - headTop,
  };

  const handPos = [fk.points.l_hand[0], fk.points.l_hand[1]];
  const carriedPos = carriedIdx !== null ? handPos : null;
  const interacting = Boolean(activeInter || carriedIdx !== null || seated !== null);
  const hasDropped = Object.keys(droppedSpots).length > 0;
  const interaction = interacting || hasDropped
    ? {
        kind: activeInter ? activeInter.kind : (seated ? 'sit_on' : (carriedIdx !== null ? 'carry' : 'idle')),
        targetIdx: activeInter ? activeInter.targetIdx : (seated ? seated.targetIdx : (carriedIdx !== null ? carriedIdx : null)),
        phase: activeInter ? activeInterPhase : (seated || carriedIdx !== null ? 'hold' : null),
        handPos,
        ...(activeInter && (activeInter.kind === 'push' || activeInter.kind === 'pull') ? { standX: activeInter.standX } : {}),
        carriedIdx,
        carriedPos,
        droppedSpots: { ...droppedSpots },
      }
    : null;

  return {
    gesture,
    expr,
    view,
    facing,
    x: finalX,
    ground,
    seatY,
    prop,
    blink: micro.blink,
    theme,
    ...(style !== undefined ? { style } : {}),
    seed: plan.seed ?? 'sh01',
    angles,
    lift,
    mouthOpen: audioFrame?.open ?? 0,
    mouthWidth: audioFrame?.width ?? 0.5,
    gaze: gazeOverride ?? micro.gaze,
    scarfAngles,
    outfit: plan.outfit ?? 'none',
    ahoge,
    headStretch,
    spark,
    fidget: fidgetOn > 0 ? fidget.kind : null,
    symbolOpacity,
    // Metadata for scene & QA:
    tapImpact,
    focusIdx,
    rushedMove,
    isFastMotion,
    bodyBbox,
    interacting,
    interaction,
    interactionStarts,
    sitWalk,
    endState: { x: curX, view, facing, gesture: holdGesture, expr, prop, autoSnaps },
  };
}
