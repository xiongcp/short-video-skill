// Hand-drawn ink for the host, its props and (from P2b) diagrams and icons (火柴人主持人设计 §3.2).
// Pure functions without dependencies. Every random choice comes from a seed string, so the same input draws the same line.

/** 32-bit FNV-1a hash of a string. */
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193);
  return h >>> 0;
}

/** Seeded generator of floats in [0, 1) (mulberry32). */
export function random(seed) {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number with at most two decimals, the way every coordinate is written into SVG. */
export const num = (n) => String(Math.round(n * 100) / 100 || 0);

/** SVG path data through `points`; closed with Z when `closed`. */
export function pathData(points, closed = false) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${num(x)} ${num(y)}`).join('') + (closed ? 'Z' : '');
}

function lengths(points) {
  const out = [0];
  for (let i = 1; i < points.length; i += 1) out.push(out[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  return out;
}

/** `count` points spaced evenly by arc length along a polyline. */
export function resample(points, count) {
  const at = lengths(points);
  const total = at.at(-1);
  const out = [];
  let j = 1;
  for (let k = 0; k < count; k += 1) {
    const s = (total * k) / (count - 1);
    while (j < points.length - 1 && at[j] < s) j += 1;
    const t = Math.min(1, Math.max(0, (s - at[j - 1]) / (at[j] - at[j - 1] || 1)));
    out.push([points[j - 1][0] + (points[j][0] - points[j - 1][0]) * t, points[j - 1][1] + (points[j][1] - points[j - 1][1]) * t]);
  }
  return out;
}

// Unit normal at sample i: the direction to its neighbours turned a quarter.
function normal(points, i) {
  const a = points[Math.max(0, i - 1)];
  const b = points[Math.min(points.length - 1, i + 1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
}

/** Corner-cutting (Chaikin) smoothing for a polyline; endpoints stay fixed. */
export function chaikin(points, iterations = 1) {
  let cur = points;
  for (let iter = 0; iter < iterations; iter += 1) {
    if (cur.length < 3) break;
    const next = [cur[0]];
    for (let i = 0; i < cur.length - 1; i += 1) {
      const [ax, ay] = cur[i];
      const [bx, by] = cur[i + 1];
      next.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by]);
      next.push([0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    next.push(cur.at(-1));
    cur = next;
  }
  return cur;
}

/**
 * A tapered ink line along `points`, drawn as a filled outline with round ends.
 * width: [thin, thick] in px; wobble: max sideways drift in px (capped at 2% of stroke length);
 * taper: 'both' | 'start' | 'end' | 'none'; smooth: Chaikin corner-cutting iterations before resampling.
 * @returns {{ d: string, base: number[][], center: number[][], widths: number[] }}
 */
export function inkStroke(points, { seed, width, wobble = 0, taper = 'both', smooth = 0 }) {
  const pts = smooth > 0 ? chaikin(points, smooth) : points;
  const total = lengths(pts).at(-1);
  const count = Math.max(8, Math.min(64, Math.ceil(total / 6)));
  const base = resample(pts, count);
  const amp = Math.min(wobble, 0.02 * total);
  const rnd = random(seed);
  const phase = [rnd() * 2 * Math.PI, rnd() * 2 * Math.PI];
  const cycles = [0.5 + rnd(), 1.5 + rnd()];
  const normals = base.map((_, i) => normal(base, i));
  const center = base.map(([x, y], i) => {
    const t = i / (count - 1);
    const drift = amp * (0.6 * Math.sin(2 * Math.PI * cycles[0] * t + phase[0]) + 0.4 * Math.sin(2 * Math.PI * cycles[1] * t + phase[1]));
    return [x + normals[i][0] * drift, y + normals[i][1] * drift];
  });
  const widths = center.map((_, i) => {
    const t = i / (count - 1);
    switch (taper) {
      case 'both': return width[0] + (width[1] - width[0]) * Math.sin(Math.PI * t);
      case 'start': return width[0] + (width[1] - width[0]) * Math.sin((Math.PI / 2) * t);
      case 'end': return width[0] + (width[1] - width[0]) * Math.sin((Math.PI / 2) * (1 - t));
      case 'none': return width[1];
      default: throw new Error(`unknown taper ${taper}`);
    }
  });
  const side = (sign) => center.map(([x, y], i) => [x + (sign * normals[i][0] * widths[i]) / 2, y + (sign * normals[i][1] * widths[i]) / 2]);
  const left = side(1);
  const right = side(-1).reverse();
  const cap = (r, [x, y]) => `A${num(r)} ${num(r)} 0 0 0 ${num(x)} ${num(y)}`;
  const d = `${pathData(left)}${cap(widths.at(-1) / 2, right[0])}${pathData(right.slice(1)).replace(/^M/, 'L')}${cap(widths[0] / 2, left[0])}Z`;
  return { d, base, center, widths };
}

/** Points around a circle from a seeded start angle; `overdraw` radians past a full turn leave the hand-drawn overlap. */
export function circlePoints(cx, cy, r, { seed, overdraw = 0.35, count = 48 }) {
  const start = random(seed)() * 2 * Math.PI;
  return Array.from({ length: count + 1 }, (_, i) => {
    const a = start + ((2 * Math.PI + overdraw) * i) / count;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

/** Path data for a marker fill: the closed outline shifted and loosened a little, as if colored in by hand. */
export function markerFill(points, { seed, shift }) {
  const rnd = random(seed);
  const jitter = () => (rnd() * 2 - 1) * shift;
  const [dx, dy] = [jitter(), jitter()];
  return pathData(points.map(([x, y]) => [x + dx + jitter() * 0.3, y + dy + jitter() * 0.3]), true);
}
