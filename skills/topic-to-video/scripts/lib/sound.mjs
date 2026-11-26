// Procedural paper-craft sound effects (音效与配乐设计 §4): small DSP helpers and 17 synthesized effects
// plus the conclusion chime. Everything is generated from code and a seed; no audio files ship with the skill.
import { hostEventTimeline } from './motion.mjs';
import { hostPlanForShot } from './scene.mjs';

export const SAMPLE_RATE = 48000;
const SR = SAMPLE_RATE;
const TAU = 2 * Math.PI;

/** Seeded PRNG (xmur3 string hash + mulberry32), returns numbers in [0, 1). */
export function makeRng(seed = 'seed') {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) {
    h = Math.imul(h ^ ch.codePointAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linear attack then exponential decay; 0 before t = 0. */
export const expEnv = (t, attackSec, decaySec) => (t < 0 ? 0 : t < attackSec ? t / attackSec : Math.exp(-(t - attackSec) / decaySec));

export function onePoleLowpass(x, hz) {
  const k = 1 - Math.exp((-TAU * hz) / SR);
  const y = new Float32Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i += 1) {
    s += k * (x[i] - s);
    y[i] = s;
  }
  return y;
}

export function onePoleHighpass(x, hz) {
  const lp = onePoleLowpass(x, hz);
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 1) y[i] = x[i] - lp[i];
  return y;
}

/** RBJ constant-peak band-pass; `f0OrFn` may be a function of time in seconds for sweeps. */
export function biquadBandpass(x, f0OrFn, q) {
  const y = new Float32Array(x.length);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  const coeffs = (f0) => {
    const w0 = (TAU * Math.min(f0, SR * 0.45)) / SR;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    return [alpha / a0, -alpha / a0, (-2 * Math.cos(w0)) / a0, (1 - alpha) / a0];
  };
  let [b0, b2, a1, a2] = coeffs(typeof f0OrFn === 'function' ? f0OrFn(0) : f0OrFn);
  for (let i = 0; i < x.length; i += 1) {
    if (typeof f0OrFn === 'function' && (i & 15) === 0) [b0, b2, a1, a2] = coeffs(f0OrFn(i / SR));
    const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

export function windowRms(samples, start, length) {
  const s = Math.max(0, start);
  const e = Math.min(samples.length, start + length);
  if (e <= s) return 0;
  let sum = 0;
  for (let i = s; i < e; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (e - s));
}

/** RMS of the loudest `windowSamples` window (100 ms by default), stepping 2.5 ms; a shorter sound counts the silence after it. */
export function loudestWindowRms(samples, windowSamples = 4800) {
  if (samples.length <= windowSamples) return windowRms(samples, 0, samples.length) * Math.sqrt(samples.length / windowSamples);
  let best = 0;
  for (let s = 0; s + windowSamples <= samples.length; s += 120) best = Math.max(best, windowRms(samples, s, windowSamples));
  return best;
}

export const SFX_DURATION_MS = {
  pop: 70, swish: 150, step: 35, page: 260, whoosh: 220, thump: 180, scratch: 240, tick: 45, drop: 260,
  click: 40, ding: 700, slide: 500, scribble: 1000, sparkle: 600, snap: 60, startle: 260, rise: 120, chime: 1600,
};
export const SFX_KINDS = Object.keys(SFX_DURATION_MS);

const noise = (n, rng) => Float32Array.from({ length: n }, () => rng() * 2 - 1);

/** Adds a sine (optionally gliding exponentially from f0 to f1 over glideSec) shaped by env(tLocal). */
function addTone(out, startSec, f0, f1, glideSec, env, amp = 1, partials = [[1, 1]]) {
  const start = Math.round(startSec * SR);
  const phases = partials.map(() => 0);
  for (let i = start; i < out.length; i += 1) {
    const t = (i - start) / SR;
    const f = f1 === f0 ? f0 : f0 * (f1 / f0) ** Math.min(1, t / glideSec);
    const e = env(t);
    let v = 0;
    partials.forEach(([mul, g], k) => {
      phases[k] += (TAU * f * mul) / SR;
      v += Math.sin(phases[k]) * g;
    });
    out[i] += v * e * amp;
  }
}

function shaped(src, env, amp = 1, startSec = 0, out = new Float32Array(src.length)) {
  const start = Math.round(startSec * SR);
  for (let i = start; i < out.length && i - start < src.length; i += 1) out[i] += src[i - start] * env((i - start) / SR) * amp;
  return out;
}

const DING_PARTIALS = [[1, 1], [2.76, 0.4], [5.4, 0.15]];

const RECIPES = {
  pop: (n, _rng, pm) => { const o = new Float32Array(n); addTone(o, 0, 900 * pm, 480 * pm, 0.07, (t) => expEnv(t, 0.002, 0.018)); return o; },
  swish: (n, rng, pm) => shaped(biquadBandpass(noise(n, rng), 3200 * pm, 0.9), (t) => expEnv(t, 0.025, 0.06)),
  step: (n, rng, pm) => shaped(onePoleLowpass(noise(n, rng), 900 * pm), (t) => expEnv(t, 0.001, 0.008)),
  page: (n, rng, pm) => shaped(
    biquadBandpass(noise(n, rng), (t) => 1500 * pm * 3 ** Math.min(1, t / 0.26), 0.7),
    (t) => expEnv(t, 0.06, 0.09) * (1 - 0.2 * (0.5 + 0.5 * Math.sin(TAU * 30 * t))),
  ),
  whoosh: (n, rng, pm) => {
    const env = (t) => expEnv(t, 0.08, 0.06);
    const o = shaped(biquadBandpass(noise(n, rng), (t) => 600 * pm * 4 ** Math.min(1, t / 0.22), 1.2), env);
    addTone(o, 0, 300 * pm, 700 * pm, 0.22, env, 0.15);
    return o;
  },
  thump: (n, rng, pm) => {
    const o = new Float32Array(n);
    addTone(o, 0, 120 * pm, 55 * pm, 0.18, (t) => expEnv(t, 0.001, 0.055));
    return shaped(onePoleLowpass(noise(n, rng), 400), (t) => expEnv(t, 0.001, 0.012), 0.25, 0, o);
  },
  scratch: (n, rng, pm) => {
    const o = new Float32Array(n);
    for (const start of [0, 0.12]) {
      const stroke = biquadBandpass(noise(Math.round(0.09 * SR), rng), 2200 * pm, 1.5);
      shaped(stroke, (t) => expEnv(t, 0.01, 0.035), 1, start, o);
    }
    return o;
  },
  tick: (n, rng, pm) => {
    const o = new Float32Array(n);
    addTone(o, 0, 1100 * pm, 1100 * pm, 1, (t) => expEnv(t, 0.0005, 0.006), 1, [[1, 1], [2700 / 1100, 0.5]]);
    return shaped(onePoleHighpass(noise(n, rng), 2000), (t) => expEnv(t, 0.0005, 0.004), 0.3, 0, o);
  },
  drop: (n, _rng, pm) => { const o = new Float32Array(n); addTone(o, 0, 520 * pm, 180 * pm, 0.26, (t) => expEnv(t, 0.005, 0.09)); return o; },
  click: (n, rng, pm) => {
    const o = new Float32Array(n);
    for (const [start, amp] of [[0, 1], [0.018, 0.6]]) {
      shaped(onePoleHighpass(noise(n, rng), 3000), (t) => expEnv(t, 0.0003, 0.003), amp, start, o);
      addTone(o, start, 2400 * pm, 2400 * pm, 1, (t) => expEnv(t, 0.0005, 0.008), amp * 0.6);
    }
    return o;
  },
  ding: (n, _rng, pm) => { const o = new Float32Array(n); addTone(o, 0, 1568 * pm, 1568 * pm, 1, (t) => expEnv(t, 0.002, 0.22), 1, DING_PARTIALS); return o; },
  slide: (n, rng, pm) => {
    const src = noise(n, rng);
    const lp = onePoleLowpass(src, 700 * pm);
    const bp = biquadBandpass(src, 1200 * pm, 0.8);
    const mix = Float32Array.from(lp, (v, i) => 0.5 * v + 0.5 * bp[i]);
    return shaped(mix, (t) => expEnv(t, 0.06, 0.26) * (0.75 + 0.25 * Math.sin(TAU * 8 * t)));
  },
  scribble: (n, rng, pm) => {
    const src = biquadBandpass(noise(n, rng), 2600 * pm, 1.2);
    const strokes = [];
    for (let t = 0; t < n / SR;) {
      const len = 0.06 + rng() * 0.05;
      strokes.push([t, len]);
      t += 1 / (6 + rng() * 2);
    }
    const gate = (t) => {
      const s = strokes.find(([t0, len]) => t >= t0 && t < t0 + len);
      return s ? Math.sin((Math.PI * (t - s[0])) / s[1]) : 0;
    };
    return shaped(src, gate);
  },
  sparkle: (n, _rng, pm) => {
    const o = new Float32Array(n);
    [[2093, 0], [2637, 0.08], [3136, 0.16]].forEach(([f, at]) => addTone(o, at, f * pm, f * pm, 1, (t) => expEnv(t, 0.002, 0.15), 0.6, DING_PARTIALS));
    return o;
  },
  snap: (n, rng, pm) => {
    const o = shaped(noise(n, rng), (t) => expEnv(t, 0.0002, 0.002));
    addTone(o, 0, 1800 * pm, 1800 * pm, 1, (t) => expEnv(t, 0.0005, 0.025), 0.5);
    return o;
  },
  startle: (n, _rng, pm) => {
    const o = new Float32Array(n);
    const env = (t) => (t < 0.1 ? expEnv(t, 0.002, 0.045) : 0);
    addTone(o, 0, 880 * pm, 660 * pm, 0.1, env);
    addTone(o, 0.11, 660 * pm, 440 * pm, 0.1, env);
    return o;
  },
  rise: (n, _rng, pm) => { const o = new Float32Array(n); addTone(o, 0, 300 * pm, 700 * pm, 0.12, (t) => expEnv(t, 0.01, 0.04)); return o; },
  chime: (n, _rng, pm) => {
    const o = new Float32Array(n);
    [[1047, 0], [1319, 0.04], [1568, 0.08]].forEach(([f, at]) => addTone(o, at, f * pm, f * pm, 1, (t) => expEnv(t, 0.002, 0.6), 0.5, DING_PARTIALS));
    return o;
  },
};

const FADE_SAMPLES = Math.round(0.01 * SR);
const PEAK = 0.85; // + 1 dB of seeded variation stays below 0.99

/**
 * Synthesizes one effect as mono Float32 at 48 kHz, peak-normalized to 0.85. With `variation` the seed shifts pitch
 * by ±3% and gain by ±1 dB; noise always follows the seed, so the same seed gives the same samples.
 */
export function synthSfx(kind, { seed = 'sfx', variation = true } = {}) {
  const recipe = RECIPES[kind];
  if (!recipe) throw new Error(`unknown sound effect ${kind}`);
  const rng = makeRng(`${kind}:${seed}`);
  const pitchDraw = rng();
  const gainDraw = rng();
  const pm = variation ? 1 + (pitchDraw * 2 - 1) * 0.03 : 1;
  const gainDb = variation ? (gainDraw * 2 - 1) : 0;
  const n = Math.round((SFX_DURATION_MS[kind] * SR) / 1000);
  const out = recipe(n, rng, pm);
  let mean = 0;
  for (const v of out) mean += v;
  mean /= n;
  for (let i = 0; i < n; i += 1) out[i] -= mean;
  const fade = Math.min(FADE_SAMPLES, n);
  for (let k = 0; k < fade; k += 1) {
    const remaining = k / fade; // k samples before the end; the last sample gets 0
    out[n - 1 - k] *= Math.sin((Math.PI / 2) * remaining) ** 2;
  }
  // The fade can leave a little DC behind; remove it with a Hann-shaped offset so both ends stay at zero.
  let rest = 0;
  for (const v of out) rest += v;
  rest /= n;
  for (let i = 0; i < n; i += 1) out[i] -= 2 * rest * Math.sin((Math.PI * i) / (n - 1)) ** 2;
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? (PEAK / peak) * 10 ** (gainDb / 20) : 0;
  for (let i = 0; i < n; i += 1) out[i] *= g;
  out[n - 1] = 0; // never -0
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Events (音效与配乐设计 §4.1–4.2): each effect lands on the frame where something touches, settles or lands.

const BAD_STATES = new Set(['expired', 'broken', 'empty', 'off', 'dim']);
const LATCH_STATES = new Set(['open', 'closed', 'locked', 'unlocked']);
const REACT_STARTLE = new Set(['expired', 'broken', 'crossed', 'empty']);
const TIER_RANK = { step: 0, normal: 1, accent: 2 };

function stateSound(value = '') {
  if (value === 'stamped') return ['thump', 'accent', 0.12];
  if (value === 'crossed') return ['scratch', 'normal', 0.05];
  if (value.startsWith('count:')) return ['tick', 'normal', 0.05];
  if (BAD_STATES.has(value)) return ['drop', 'normal', 0.05];
  if (LATCH_STATES.has(value)) return ['click', 'normal', 0.05];
  return ['ding', 'normal', 0.05];
}

const INTERACTION_SOUNDS = {
  open: [['click', 'normal', 0.15]],
  carry: [['whoosh', 'normal', 0.3]],
  drop: [['tick', 'normal', 0]],
  push: [['slide', 'normal', 0.15]],
  pull: [['slide', 'normal', 0.15]],
  sit_on: [['thump', 'normal', 0.25]],
  draw: [['scribble', 'normal', 0]],
  hold_up: [['sparkle', 'accent', 0.5]],
};

const GESTURE_SOUNDS = {
  jump: [['rise', 'accent', 0.15], ['thump', 'normal', 0.5]],
  snap: [['snap', 'accent', 0.35]],
  startle: [['startle', 'accent', 0.05]],
  double_take: [['startle', 'accent', 0.35]],
  cheer: [['sparkle', 'accent', 0.15]],
  tap: [['tick', 'normal', 0.3]],
};

const isHostShot = (plan) => plan.shot.layout === 'host-left' || plan.shot.layout === 'stage';
const centerX = (el) => (el?.bbox ? el.bbox.x + el.bbox.w / 2 : null);

/**
 * Collects sound events for consecutive shot plans. `tMs` counts from the first plan, with shot starts taken from
 * frame counts (the same clock the video uses). Events past the end of their shot are dropped.
 * @returns {{ tMs: number, kind: string, tier: 'step'|'normal'|'accent', x: number|null, source: string }[]}
 */
export function collectSoundEvents(shotPlans, manifest, { fps = 60, lastSectionId = null } = {}) {
  const events = [];
  let offsetFrames = 0;
  shotPlans.forEach((plan, i) => {
    const base = (offsetFrames * 1000) / fps;
    const dur = plan.durationSec;
    const seen = new Map();
    const push = (tSec, kind, tier, x, source) => {
      const key = `${plan.id}:${source}`;
      const seq = seen.get(key) ?? 0;
      seen.set(key, seq + 1);
      if (tSec < 0 || tSec > dur) return;
      events.push({ tMs: base + tSec * 1000, kind, tier, x: x ?? null, source: key, seq });
    };
    const starts = plan.endHostMeta?.interactionStarts;
    const cueT0 = (c, idx) => (starts instanceof Map && starts.has(idx) ? starts.get(idx) : (c.timeMs ?? 0) / 1000);

    if (i > 0 && plan.transition?.kind && plan.transition.kind !== 'cut') {
      const sw = plan.transition.layoutSwitch ?? '';
      push(0, sw.includes('full') ? 'whoosh' : 'page', 'normal', null, 'transition');
    }
    if (lastSectionId && plan.shot.section === lastSectionId && plan.prevShot?.shot.section !== lastSectionId) {
      push(0.2, 'chime', 'accent', null, 'conclusion');
    }

    plan.cues.forEach((c, idx) => {
      const t0 = cueT0(c, idx);
      const el = Number.isInteger(c.target) ? plan.elements[c.target] : null;
      if (c.do === 'reveal') push(t0 + 0.05, 'pop', 'normal', centerX(el), 'reveal');
      else if (c.do === 'highlight') push(t0, 'swish', 'normal', centerX(el), 'highlight');
      else if (c.do === 'state') {
        const [kind, tier, dt] = stateSound(String(c.value ?? ''));
        push(t0 + dt, kind, tier, centerX(el), `state:${c.value}`);
      } else if (c.do === 'send') {
        const link = plan.stageLayout?.links?.[c.target];
        const fromEl = link ? plan.elements[link.from] : plan.elements[c.target - 1];
        const toEl = link ? plan.elements[link.to] : plan.elements[c.target];
        push(t0, 'whoosh', 'normal', centerX(fromEl), 'send');
        push(t0 + 0.8, 'pop', 'normal', centerX(toEl), 'send:arrive');
      }
    });

    if (isHostShot(plan)) {
      const host = hostEventTimeline(manifest, hostPlanForShot(plan));
      for (const w of host.walks) {
        const step = w.trot ? 0.25 : 0.5;
        const at = (t) => w.fromX + ((w.toX - w.fromX) * (t - w.t0)) / Math.max(1e-6, w.t1 - w.t0);
        for (let t = w.t0 + step; t <= w.t1 - 0.05; t += step) push(t, 'step', 'step', at(t), 'walk');
        push(w.t1, 'step', 'step', w.toX, 'walk');
      }
      for (const ev of host.interactions) {
        let list = INTERACTION_SOUNDS[ev.kind];
        if (ev.kind === 'react') list = [[REACT_STARTLE.has(ev.targetState) ? 'startle' : 'sparkle', 'accent', 0.1]];
        for (const [kind, tier, dt] of list ?? []) push(ev.t0 + dt, kind, tier, ev.x, ev.kind);
      }
      for (const g of host.gestures) {
        for (const [kind, tier, dt] of GESTURE_SOUNDS[g.gesture] ?? []) push(g.t0 + dt, kind, tier, g.x, g.gesture);
      }
    }
    offsetFrames += plan.frameCount;
  });
  return events.sort((a, b) => a.tMs - b.tMs);
}

/** At most one non-step effect per 500 ms (higher tier wins, then the earlier one); steps near effects go quiet. */
export function thinSoundEvents(events, { minGapMs = 500, stepGuardMs = 120 } = {}) {
  const sorted = [...events].sort((a, b) => a.tMs - b.tMs);
  const kept = [];
  for (const ev of sorted) {
    if (ev.tier === 'step') continue;
    const last = kept.at(-1);
    if (!last || ev.tMs - last.tMs >= minGapMs) kept.push(ev);
    else if (TIER_RANK[ev.tier] > TIER_RANK[last.tier]) kept[kept.length - 1] = ev;
  }
  const steps = sorted.filter((ev) => ev.tier === 'step' && !kept.some((k) => Math.abs(k.tMs - ev.tMs) < stepGuardMs));
  return [...kept, ...steps].sort((a, b) => a.tMs - b.tMs);
}

// ---------------------------------------------------------------------------------------------------------------
// Effects stem (音效与配乐设计 §6.2): levels relative to the voice reference V, gentle equal-power panning.

export const TIER_LEVELS_DB = { step: { speech: -26, gap: -26 }, normal: { speech: -14, gap: -10 }, accent: { speech: -12, gap: -8 } };

/** Equal-power pan scaled so the centre is unity on both channels; x is a 1920-wide screen coordinate. */
export function panGains(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return [1, 1];
  const pan = Math.max(-0.3, Math.min(0.3, (x / 1920 - 0.5) * 0.6));
  const theta = ((pan + 1) * Math.PI) / 4;
  return [Math.SQRT2 * Math.cos(theta), Math.SQRT2 * Math.sin(theta)];
}

/** Speech spans of every sentence, in samples on the video clock (shot starts from frame counts). */
export function speechIntervals(shotPlans, fps, sampleRate = SAMPLE_RATE) {
  const out = [];
  let offsetFrames = 0;
  for (const plan of shotPlans) {
    const base = (offsetFrames * sampleRate) / fps;
    for (const s of plan.sentences) {
      const [a, b] = s.speech ?? [0, s.durationMs ?? 0];
      const start = Math.round(base + ((s.startMs + a) * sampleRate) / 1000);
      const end = Math.round(base + ((s.startMs + b) * sampleRate) / 1000);
      if (end > start) out.push({ start, end });
    }
    offsetFrames += plan.frameCount;
  }
  return out.sort((x, y) => x.start - y.start);
}

/** Binary search: is `sample` inside one of the sorted, non-overlapping intervals? */
export function isInIntervals(intervals, sample) {
  let lo = 0;
  let hi = intervals.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sample < intervals[mid].start) hi = mid - 1;
    else if (sample >= intervals[mid].end) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Does [a, b) overlap one of the sorted, non-overlapping intervals? */
function overlapsIntervals(intervals, a, b) {
  let lo = 0;
  let hi = intervals.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (intervals[mid].end <= a) lo = mid + 1;
    else hi = mid;
  }
  return lo < intervals.length && intervals[lo].start < b;
}

/** Mixes thinned events into a stereo effects stem of `totalSamples`, each scaled so its loudest 100 ms sits at V + tier offset. */
export function renderSfxStem(events, totalSamples, { voiceRefDb, intervals = [], seed = 'sfx' } = {}) {
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const counts = {};
  events.forEach((ev, i) => {
    const start = Math.round((ev.tMs * SR) / 1000);
    if (start >= totalSamples || start < 0) return;
    const buf = synthSfx(ev.kind, { seed: `${seed}:${ev.source}:${ev.seq ?? i}` });
    const levels = TIER_LEVELS_DB[ev.tier] ?? TIER_LEVELS_DB.normal;
    const offsetDb = overlapsIntervals(intervals, start, start + buf.length) ? levels.speech : levels.gap;
    const ref = loudestWindowRms(buf);
    if (ref <= 0) return;
    const g = 10 ** ((voiceRefDb + offsetDb) / 20) / ref;
    const [gl, gr] = panGains(ev.x);
    const len = Math.min(buf.length, totalSamples - start);
    const fadeFrom = len < buf.length ? Math.max(0, len - FADE_SAMPLES) : len;
    for (let k = 0; k < len; k += 1) {
      let v = buf[k] * g;
      if (k >= fadeFrom) v *= Math.sin((Math.PI / 2) * ((len - 1 - k) / Math.max(1, len - 1 - fadeFrom))) ** 2;
      left[start + k] += v * gl;
      right[start + k] += v * gr;
    }
    counts[ev.kind] = (counts[ev.kind] ?? 0) + 1;
  });
  return { left, right, counts };
}
