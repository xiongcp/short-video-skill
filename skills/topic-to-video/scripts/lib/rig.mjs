// The stick-figure host 小青: skeleton, poses, views, faces, emotion symbols and props, drawn as SVG
// (火柴人主持人设计 §3–§6). Pure functions without dependencies; every shape comes from manifest.json and a seed,
// so the same input draws the same SVG. Motion, inverse kinematics and tweening come in S2.

export const JOINTS = ['pelvis', 'waist', 'chest', 'neck', 'head', 'l_shoulder', 'l_elbow', 'l_wrist', 'r_shoulder', 'r_elbow', 'r_wrist',
  'l_hip', 'l_knee', 'l_ankle', 'r_hip', 'r_knee', 'r_ankle'];
export const VIEWS = ['front', 'three_quarter', 'side'];
// Poses are written for a host facing right. The acting hand (point, present, tap, pointer, magnifier) is the left one,
// which is the near hand in the side views and the hand on the right of the screen in the front view.
export const ACTING = 'l';
export const OTHER = 'r';

const RAD = Math.PI / 180;
const step = ([x, y], deg, len) => [x + Math.cos(deg * RAD) * len, y + Math.sin(deg * RAD) * len];

/** Angles clamped to the ranges in manifest.joints; a joint left out is 0. */
export function clampAngles(manifest, angles = {}) {
  return Object.fromEntries(JOINTS.map((name) => {
    const [lo, hi] = manifest.joints[name].range;
    return [name, Math.min(hi, Math.max(lo, angles[name] ?? 0))];
  }));
}

/** A gesture's pose from manifest.poses, following an alias such as point_right → point; walk is the key pose of
 *  manifest.motions.walk (the walk itself is procedural, S2). */
export function resolvePose(manifest, gesture) {
  const pose = manifest.poses[gesture] ?? manifest.motions[gesture]?.key;
  if (!pose) throw new Error(`unknown gesture ${gesture}`);
  return pose.alias ? resolvePose(manifest, pose.alias) : pose;
}

/** The angles a gesture draws with in a view: the pose's angles, its overrides for that view (view_angles),
 *  and, when the other hand holds a prop, that arm's angles from manifest.props. */
export function poseAngles(manifest, gesture, prop, view) {
  const pose = resolvePose(manifest, gesture);
  const angles = { ...pose.angles, ...(pose.view_angles?.[view ?? pose.view] ?? {}) };
  const held = prop ? manifest.props[prop] : undefined;
  if (held?.hand === 'other') for (const [joint, deg] of Object.entries(held.arm)) angles[`${OTHER}_${joint}`] = deg;
  return angles;
}

/**
 * Joint positions in px. Angles are in degrees from the parent bone (manifest.joints); positive bends forward,
 * or outward for the arms and legs in the front view. facing −1 mirrors the figure to face left. x is the pelvis;
 * the lowest foot, or the pelvis when sitting, touches `ground`, raised by `lift` × H.
 * @returns {{ points: Record<string, number[]>, dirs: Record<string, number>, H: number, R: number, view: string, facing: number }}
 */
export function forwardKinematics(manifest, angles, { view = 'front', facing = 1, x = 0, ground = 0, lift = 0 } = {}) {
  const H = manifest.height_px;
  const a = clampAngles(manifest, angles);
  const len = (joint) => manifest.joints[joint].length * H;
  const p = { pelvis: [0, 0] };
  const d = {};
  d.spine_low = -90 + a.pelvis + a.waist;
  p.spine_mid = step(p.pelvis, d.spine_low, len('waist'));
  d.spine_up = d.spine_low + a.chest;
  p.neck_base = step(p.spine_mid, d.spine_up, len('chest'));
  d.neck = d.spine_up + a.neck;
  p.head_base = step(p.neck_base, d.neck, len('neck'));
  d.head = d.neck + a.head;
  p.head_center = step(p.head_base, d.head, len('head') / 2);
  for (const s of ['l', 'r']) {
    const o = view === 'front' && s === 'r' ? -1 : 1; // which way "forward" turns this limb
    d[`${s}_upper_arm`] = d.spine_up + 180 - o * a[`${s}_shoulder`];
    p[`${s}_elbow`] = step(p.neck_base, d[`${s}_upper_arm`], len(`${s}_shoulder`));
    d[`${s}_forearm`] = d[`${s}_upper_arm`] - o * a[`${s}_elbow`];
    p[`${s}_wrist`] = step(p[`${s}_elbow`], d[`${s}_forearm`], len(`${s}_elbow`));
    d[`${s}_hand`] = d[`${s}_forearm`] - o * a[`${s}_wrist`];
    p[`${s}_hand`] = step(p[`${s}_wrist`], d[`${s}_hand`], len(`${s}_wrist`));
    d[`${s}_thigh`] = 90 + a.pelvis - o * a[`${s}_hip`];
    p[`${s}_knee`] = step(p.pelvis, d[`${s}_thigh`], len(`${s}_hip`));
    d[`${s}_shin`] = d[`${s}_thigh`] + o * a[`${s}_knee`];
    p[`${s}_ankle`] = step(p[`${s}_knee`], d[`${s}_shin`], len(`${s}_knee`));
    d[`${s}_foot`] = d[`${s}_shin`] - o * (90 + a[`${s}_ankle`]);
    p[`${s}_toe`] = step(p[`${s}_ankle`], d[`${s}_foot`], len(`${s}_ankle`) * manifest.views[view].foot_scale);
  }
  const sole = (manifest.figure.foot[1] * H) / 2;
  const lowest = Math.max(p.pelvis[1], ...['l_ankle', 'l_toe', 'r_ankle', 'r_toe'].map((k) => p[k][1] + sole));
  const dy = ground - lowest - lift * H;
  const points = Object.fromEntries(Object.entries(p).map(([k, [px, py]]) => [k, [x + facing * px, py + dy]]));
  const dirs = Object.fromEntries(Object.entries(d).map(([k, deg]) => [k, facing === 1 ? deg : 180 - deg]));
  return { points, dirs, H, R: len('head') / 2, view, facing };
}
