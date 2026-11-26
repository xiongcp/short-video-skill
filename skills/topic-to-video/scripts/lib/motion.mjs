// S2 motion engine for 小青: 2-bone analytical IK, staggered pose tweening with anticipation/overshoot,
// procedural walk/trot/jump/wave/cheer/tap, automatic micro-acting, fixed-step 1/240s scarf spring
// and standing spot solver (火柴人主持人设计 §5–§7).
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, lerp } from './ease.mjs';
import { random } from './ink.mjs';
import { ACTING, clampAngles, forwardKinematics, JOINTS, poseAngles, resolvePose } from './rig.mjs';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const SPOTS = { left: 320, center: 960, right: 1600 };

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
    const delay = STAGGER_SEC[j] ?? 0;
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

/** Aims the acting arm (and optional pointer tip) at `target` via 2-bone analytical IK. */
export function aimArmAt(manifest, angles, { view = 'three_quarter', facing = 1, x = 320, ground = 930, target, prop = null }) {
  const fk = forwardKinematics(manifest, angles, { view, facing, x, ground });
  const H = manifest.height_px;
  const L1 = manifest.joints.l_shoulder.length * H;
  const tipExtra = prop === 'pointer' ? (manifest.props.pointer.tip?.[0] ?? 0.3) * H : 0;
  const L2 = (manifest.joints.l_elbow.length + manifest.joints.l_wrist.length) * H + tipExtra;
  const shoulder = fk.points.neck_base;
  // Solve in facing-right coordinates, then extract relative shoulder & elbow angles
  const relTarget = [shoulder[0] + facing * (target[0] - shoulder[0]), target[1]];
  const ik = solveTwoBoneIK(shoulder, relTarget, L1, L2, { bendSign: 1 });
  const spineUp = -90 + (angles.pelvis ?? 0) + (angles.waist ?? 0) + (angles.chest ?? 0);
  const norm = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
  const l_shoulder = norm(spineUp + 180 - ik.angle1);
  const l_elbow = Math.max(0, norm(ik.angle1 - ik.angle2));
  return clampAngles(manifest, { ...angles, l_shoulder, l_elbow, l_wrist: 0 });
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

const BEAT_CYCLE = ['present', 'point', 'emphasize', 'shrug'];

/**
 * Picks a purposeful conversational gesture (and optional expression hint) for a sentence that has no explicit gesture cue,
 * ensuring every sentence carries an active, non-repeating host beat.
 */
export function inferSentenceBeat(text = '', { index = 0, hasVisualCue = false, prevGesture = 'idle' } = {}) {
  const s = String(text);
  let candidates;
  if (/[？?][」』”’）)》】\]"']*$/.test(s) || /(?:吗|呢|为什么|怎么|还能)/.test(s)) {
    candidates = ['think', 'shrug', 'present'];
  } else if (/[！!][」』”’）)》】\]"']*$/.test(s) || /(?:记住|关键|直接|瞬间|省掉|省下|一定)/.test(s)) {
    candidates = ['emphasize', 'present', 'point'];
  } else if (hasVisualCue || /(?:看|先看|找到|并排|这边|这张图|三零四|服务器|浏览器|副本)/.test(s)) {
    candidates = ['point', 'present', 'emphasize'];
  } else {
    const start = Math.abs(index) % BEAT_CYCLE.length;
    candidates = [...BEAT_CYCLE.slice(start), ...BEAT_CYCLE.slice(0, start)];
  }
  const gesture = candidates.find((g) => g !== prevGesture) ?? candidates[0];
  return { gesture };
}

/** Resolves a `move` cue target (preset spot or element index) to a ground X in [120, 1800]. */
export function resolveStandX(target, currentX = 320, elements = []) {
  if (typeof target === 'string' && target in SPOTS) return SPOTS[target];
  if (Number.isInteger(target)) {
    const el = elements[target];
    if (!el) return currentX;
    const { x, w } = el.bbox;
    const leftSpot = x - 60;
    const rightSpot = x + w + 60;
    const chosen = currentX < x ? leftSpot : currentX > x + w ? rightSpot
      : (Math.abs(currentX - leftSpot) <= Math.abs(currentX - rightSpot) ? leftSpot : rightSpot);
    return Math.max(120, Math.min(1800, Math.round(chosen)));
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

/**
 * Evaluates full host state at time `t` inside a `host-left` shot.
 * Returns state directly consumable by `drawHost(manifest, state)` plus QA metadata (`rushedMove`, `tapImpact`, `bodyBbox`, `isFastMotion`).
 */
export function evaluateHostAt(manifest, plan, t, audioFrame = { open: 0, width: 0.5, nod: 0 }) {
  const H = manifest.height_px;
  const ground = plan.ground ?? 930;
  const start = plan.startState ?? { x: 320, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' };
  const cues = plan.cues ?? [];
  const elements = plan.elements ?? [];
  const theme = plan.theme ?? 'light';

  // Walk schedule across move cues
  let x = start.x;
  let facing = start.facing ?? 1;
  let walking = false;
  let trotting = false;
  let walkPhase = 0;
  let velocityX = 0;
  let rushedMove = false;
  let focusIdx = null;
  let focusChangedAt = -10;

  const moveCues = cues.filter((c) => c.do === 'move');
  let curX = start.x;
  const walkSegments = [];
  for (let i = 0; i < moveCues.length; i += 1) {
    const mc = moveCues[i];
    const t0 = mc.timeMs / 1000;
    const dstX = resolveStandX(mc.target, curX, elements);
    const distX = Math.abs(dstX - curX);
    const nextLimit = i + 1 < moveCues.length ? moveCues[i + 1].timeMs / 1000 : plan.durationSec;
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
        if (mc.source !== 'auto_return') rushedMove = true;
      }
    }
    const dur = distX < 1 ? 0 : Math.min(avail, distX / speed);
    walkSegments.push({ t0, t1: t0 + dur, fromX: curX, toX: dstX, dir: dstX >= curX ? 1 : -1, trot, target: mc.target });
    curX = dstX;
  }

  for (const seg of walkSegments) {
    if (t >= seg.t0 && t < seg.t1 && seg.t1 > seg.t0) {
      const u = (t - seg.t0) / (seg.t1 - seg.t0);
      const eased = easeInOutCubic(u);
      x = lerp(seg.fromX, seg.toX, eased);
      facing = seg.dir;
      walking = true;
      trotting = seg.trot;
      const cadence = seg.trot ? 2 : 1; // cycles per sec (2 steps/cycle -> 2 steps/s walk, 4 trot)
      walkPhase = (t - seg.t0) * cadence;
      velocityX = ((seg.toX - seg.fromX) / (seg.t1 - seg.t0)) * 6 * u * (1 - u);
      if (Number.isInteger(seg.target)) { focusIdx = seg.target; focusChangedAt = seg.t0; }
      break;
    } else if (t >= seg.t1) {
      x = seg.toX;
      if (Number.isInteger(seg.target)) {
        focusIdx = seg.target;
        focusChangedAt = seg.t0;
        const el = elements[seg.target];
        if (el) facing = (el.bbox.x + el.bbox.w / 2) >= x ? 1 : -1;
      } else if (seg.target === 'left') {
        facing = 1;
      } else if (seg.target === 'right') {
        facing = -1;
      }
    }
  }

  // Track latest reveal/highlight for focus element
  for (const c of cues) {
    const ct = c.timeMs / 1000;
    if (ct <= t && (c.do === 'reveal' || c.do === 'highlight') && Number.isInteger(c.target)) {
      focusIdx = c.target;
      focusChangedAt = Math.max(focusChangedAt, ct);
    }
  }

  // Synthesize automatic per-sentence gesture beats for sentences that lack an explicit gesture cue
  // so every spoken sentence has active, lively stickman choreography.
  const sentences = plan.sentences ?? [];
  const explicitGestureSentences = new Set(cues.filter((c) => c.do === 'gesture').map((c) => c.sentence));
  const visualCueSentences = new Set(cues.filter((c) => c.do === 'reveal' || c.do === 'highlight' || c.do === 'move').map((c) => c.sentence));
  const autoBeats = [];
  let runningGesture = start.gesture;
  sentences.forEach((s, si) => {
    const sentIdx = s.index ?? si;
    if (explicitGestureSentences.has(sentIdx)) {
      const last = cues.filter((c) => c.do === 'gesture' && c.sentence === sentIdx).at(-1);
      if (last) runningGesture = last.target;
      return;
    }
    if (si === 0 && start.gesture !== 'idle') {
      runningGesture = start.gesture;
      return;
    }
    const beat = inferSentenceBeat(s.text, {
      index: sentIdx,
      hasVisualCue: visualCueSentences.has(sentIdx),
      prevGesture: runningGesture,
    });
    runningGesture = beat.gesture;
    autoBeats.push({ sentence: sentIdx, timeMs: Math.max(0, (s.startMs ?? 0) - 80), do: 'gesture', target: beat.gesture });
  });
  const effectiveCues = [...cues, ...autoBeats].sort((a, b) => a.timeMs - b.timeMs);

  // Active expression, prop, hold gesture, and one-shot gesture
  let expr = start.expr;
  let exprChangedAt = -10;
  let prop = start.prop ?? 'none';
  let holdGesture = resolvePose(manifest, start.gesture).type === 'once' ? 'idle' : start.gesture;
  let prevHoldGesture = holdGesture;
  let holdChangedAt = -10;
  let activeOnce = resolvePose(manifest, start.gesture).type === 'once' ? { gesture: start.gesture, t0: 0 } : null;

  for (const c of effectiveCues) {
    const ct = c.timeMs / 1000;
    if (ct > t) break;
    if (c.do === 'expr') { expr = c.target; exprChangedAt = ct; }
    else if (c.do === 'prop') { prop = c.target; }
    else if (c.do === 'gesture') {
      const p = resolvePose(manifest, c.target);
      if (p.type === 'once') activeOnce = { gesture: c.target, t0: ct };
      else { prevHoldGesture = holdGesture; holdGesture = c.target; holdChangedAt = ct; }
    }
  }

  // Focus target point (20 px below bottom center of focus element, or diagram center)
  const focusEl = focusIdx !== null ? elements[focusIdx] : null;
  const focusPt = focusEl
    ? [focusEl.bbox.x + focusEl.bbox.w / 2, focusEl.bbox.y + focusEl.bbox.h + 20]
    : [1240, 320];

  // Build angles + lift + view
  let gesture = holdGesture;
  let view = resolvePose(manifest, holdGesture).view;
  let angles;
  let lift = resolvePose(manifest, holdGesture).lift ?? 0;
  let tapImpact = 0;
  let isFastMotion = false;

  if (walking) {
    const wf = walkFrame(manifest, walkPhase, { x, ground, facing, trot: trotting });
    angles = wf.angles;
    lift = wf.lift;
    view = 'side';
    isFastMotion = trotting;
  } else {
    const heldProp = prop === 'none' ? undefined : prop;
    const fromA = poseAngles(manifest, prevHoldGesture, heldProp, view);
    const toA = poseAngles(manifest, holdGesture, heldProp, view);
    const isPoint = ['point', 'point_right', 'present'].includes(holdGesture);
    const dur = isPoint ? 0.4 : tweenDuration(fromA, toA);
    if (t - holdChangedAt >= 0 && t - holdChangedAt < dur) {
      angles = tweenPoseAngles(manifest, fromA, toA, t - holdChangedAt, { duration: dur, anticipate: isPoint, overshoot: isPoint });
    } else {
      angles = clampAngles(manifest, toA);
    }

    // Apply IK aiming for point/present
    if (isPoint && focusEl) {
      facing = focusPt[0] >= x ? 1 : -1;
      angles = aimArmAt(manifest, angles, { view, facing, x, ground, target: focusPt, prop: heldProp });
    }

    // Check one-shot gesture override
    if (activeOnce) {
      const spec = resolvePose(manifest, activeOnce.gesture);
      const sec = spec.seconds ?? 0.8;
      const dt = t - activeOnce.t0;
      if (dt >= 0 && dt < sec + 0.3) {
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
            const reach = Math.sin(u * Math.PI);
            const tapTarget = [focusPt[0], focusPt[1] - 12 * reach];
            angles = aimArmAt(manifest, toA, { view, facing, x, ground, target: tapTarget, prop: heldProp });
            if (u >= 0.4 && u <= 0.65) tapImpact = Math.sin(((u - 0.4) / 0.25) * Math.PI);
          }
        } else {
          // Return smoothly to hold gesture over 0.3s
          angles = tweenPoseAngles(manifest, spec.angles, toA, dt - sec, { duration: 0.3 });
          lift = 0;
        }
      }
    }
  }

  // Question-end detection for micro head tilt
  const activeSent = (plan.sentences ?? []).find((s) => t * 1000 >= s.startMs && t * 1000 <= s.endMs);
  const isQuestionEnd = Boolean(activeSent && /[？?][」』”’）)》】\]"']*$/.test(activeSent.text) && (activeSent.endMs - t * 1000) <= 500);
  const micro = computeMicroActing(t, plan.seed ?? 'sh01', {
    audioFrame,
    isQuestionEnd,
    focusChangedAt,
    isIdle: !walking && holdGesture === 'idle',
    focusDirX: focusPt[0] >= x ? 1 : -1,
  });

  // Apply subtle breathing / weight shift / nod / question tilt + speech-driven conversational arm beats
  const speechEnv = !walking && lift < 0.01 ? clamp01((audioFrame?.open ?? 0) * 1.15) : 0;
  const talkElbow = speechEnv > 0.08 ? Math.sin(t * 4.8) * 7 * speechEnv : 0;
  const talkShoulder = speechEnv > 0.08 ? Math.sin(t * 2.4) * 4 * speechEnv : 0;
  const talkWrist = speechEnv > 0.08 ? Math.sin(t * 4.8 - 0.6) * 8 * speechEnv : 0;
  const talkOtherElbow = speechEnv > 0.08 ? Math.cos(t * 3.6) * 4 * speechEnv : 0;
  angles = clampAngles(manifest, {
    ...angles,
    waist: (angles.waist ?? 0) + speechEnv * 1.5,
    chest: (angles.chest ?? 0) + micro.breath * 0.8 + speechEnv * 1.0,
    head: (angles.head ?? 0) + micro.nod + micro.tilt,
    l_shoulder: (angles.l_shoulder ?? 0) + talkShoulder,
    l_elbow: (angles.l_elbow ?? 0) + talkElbow,
    l_wrist: (angles.l_wrist ?? 0) + talkWrist,
    r_elbow: (angles.r_elbow ?? 0) + talkOtherElbow,
  });
  const finalX = x + micro.weightShift;

  // Deterministic scarf spring (velocity sampled from walk segments)
  const velAt = (ts) => {
    for (const seg of walkSegments) {
      if (ts >= seg.t0 && ts < seg.t1 && seg.t1 > seg.t0) {
        const u = (ts - seg.t0) / (seg.t1 - seg.t0);
        return ((seg.toX - seg.fromX) / (seg.t1 - seg.t0)) * 6 * u * (1 - u);
      }
    }
    return 0;
  };
  const scarfAngles = simulateScarfSpring(manifest, velAt, Math.min(t, 3));
  const symbolOpacity = exprChangedAt >= 0 ? clamp01((t - exprChangedAt) / 0.2) : 1;

  // Compute body bbox (head + torso, excluding arms/props) for QA occlusion check (§7.6)
  const fk = forwardKinematics(manifest, angles, { view, facing, x: finalX, ground, lift });
  const headTop = fk.points.head_center[1] - fk.R;
  const bodyBbox = {
    x: finalX - fk.R,
    y: headTop,
    w: fk.R * 2,
    h: ground - headTop,
  };

  return {
    gesture,
    expr,
    view,
    facing,
    x: finalX,
    ground,
    prop,
    blink: micro.blink,
    theme,
    seed: plan.seed ?? 'sh01',
    angles,
    lift,
    mouthOpen: audioFrame?.open ?? 0,
    mouthWidth: audioFrame?.width ?? 0.5,
    gaze: micro.gaze,
    scarfAngles,
    symbolOpacity,
    // Metadata for scene & QA:
    tapImpact,
    focusIdx,
    rushedMove,
    isFastMotion,
    bodyBbox,
    endState: { x: curX, view, facing, gesture: holdGesture, expr, prop },
  };
}
