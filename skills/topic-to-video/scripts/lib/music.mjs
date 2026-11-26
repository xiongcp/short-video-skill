// Synthesized music beds in four moods with section breaths and a soft Schroeder reverb (音效与配乐设计 §5).
// Only this module imports sound.mjs; sound.mjs never imports it back.
import { makeRng, onePoleHighpass, onePoleLowpass, SAMPLE_RATE } from './sound.mjs';

const SR = SAMPLE_RATE;
const TAU = 2 * Math.PI;

// MIDI pitches, one chord per 4-beat bar, a 4-bar loop.
export const MOOD_SPECS = {
  calm: { bpm: 72, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], voices: ['pad', 'pluck_slow'] },
  playful: { bpm: 100, chords: [[53, 57, 60], [58, 62, 65], [55, 58, 62], [60, 64, 67]], voices: ['pad', 'pluck_staccato', 'shaker'] },
  curious: { bpm: 84, chords: [[50, 53, 57], [55, 59, 62], [50, 53, 57], [48, 52, 55]], voices: ['pad', 'bass_pluck', 'bell'] },
  upbeat: { bpm: 112, chords: [[55, 59, 62], [50, 54, 57], [52, 55, 59], [48, 52, 55]], voices: ['pad', 'pluck_staccato', 'kick', 'shaker'] },
};

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** RMS of the mid channel (L+R)/2 over [start, start + length). */
export function stereoRms(left, right, start = 0, length = left.length) {
  const s = Math.max(0, start);
  const e = Math.min(left.length, start + length);
  if (e <= s) return 0;
  let sum = 0;
  for (let i = s; i < e; i += 1) {
    const m = (left[i] + right[i]) / 2;
    sum += m * m;
  }
  return Math.sqrt(sum / (e - s));
}

function addStereo(L, R, buf, start, gain, pan = 0) {
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const len = Math.min(buf.length, L.length - start);
  for (let k = 0; k < len; k += 1) {
    L[start + k] += buf[k] * gl;
    R[start + k] += buf[k] * gr;
  }
}

/** Three slightly detuned triangles per note, low-passed, slow attack and release. */
function padNote(hz, lengthSec) {
  const releaseSec = 0.6;
  const n = Math.round((lengthSec + releaseSec) * SR);
  const out = new Float32Array(n);
  const detunes = [-7, 0, 7].map((c) => hz * 2 ** (c / 1200));
  const phases = [0, 0.33, 0.66];
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    let v = 0;
    for (let k = 0; k < 3; k += 1) {
      const p = (phases[k] + detunes[k] * t) % 1;
      v += 4 * Math.abs(p - 0.5) - 1;
    }
    const env = t < 0.4 ? t / 0.4 : t < lengthSec ? 1 : Math.max(0, 1 - (t - lengthSec) / releaseSec);
    out[i] = (v / 3) * env;
  }
  return onePoleLowpass(out, 1200);
}

/** Karplus-Strong plucked string. */
function pluck(hz, lengthSec, decay, rng) {
  const n = Math.round(lengthSec * SR);
  const period = Math.max(2, Math.round(SR / hz));
  const ring = Float32Array.from({ length: period }, () => rng() * 2 - 1);
  for (let i = period - 1; i > 0; i -= 1) ring[i] = 0.5 * (ring[i] + ring[i - 1]); // softer attack
  const out = new Float32Array(n);
  let idx = 0;
  for (let i = 0; i < n; i += 1) {
    const next = (idx + 1) % period;
    const v = ring[idx];
    out[i] = v;
    ring[idx] = decay * 0.5 * (v + ring[next]);
    idx = next;
  }
  const fade = Math.min(n, Math.round(0.01 * SR));
  for (let k = 0; k < fade; k += 1) out[n - 1 - k] *= k / fade;
  return out;
}

function bell(hz, decaySec) {
  const n = Math.round(decaySec * 4 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const env = (t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) / decaySec)) * (1 - i / n);
    out[i] = (Math.sin(TAU * hz * t) + 0.4 * Math.sin(TAU * hz * 2.76 * t) + 0.15 * Math.sin(TAU * hz * 5.4 * t)) * env;
  }
  return out;
}

function shakerHit(rng) {
  const n = Math.round(0.08 * SR);
  const src = onePoleHighpass(Float32Array.from({ length: n }, () => rng() * 2 - 1), 6000);
  for (let i = 0; i < n; i += 1) src[i] *= Math.exp(-i / (0.025 * SR)) * (1 - i / n);
  return src;
}

function kickHit() {
  const n = Math.round(0.4 * SR);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    ph += (TAU * (45 + 65 * Math.exp(-t / 0.04))) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t / 0.12) * (1 - i / n);
  }
  return out;
}

const COMB_MS = [29.7, 37.1, 41.1, 43.7];
const ALLPASS_MS = [5.0, 1.7];

function reverbChannel(x, extraMs) {
  const n = x.length;
  const wetSum = new Float32Array(n);
  for (const ms of COMB_MS) {
    const d = Math.round(((ms + extraMs) * SR) / 1000);
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i += 1) buf[i] = x[i] + (i >= d ? 0.77 * buf[i - d] : 0);
    for (let i = 0; i < n; i += 1) wetSum[i] += buf[i] / COMB_MS.length;
  }
  let y = wetSum;
  for (const ms of ALLPASS_MS) {
    const d = Math.round(((ms + extraMs) * SR) / 1000);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const xd = i >= d ? y[i - d] : 0;
      const yd = i >= d ? out[i - d] : 0;
      out[i] = -0.7 * y[i] + xd + 0.7 * yd;
    }
    y = out;
  }
  return y;
}

/** In-place Schroeder reverb: 4 combs (feedback 0.77) and 2 all-passes (gain 0.7); the right side is 0.6 ms longer. */
export function schroederReverb(left, right, { wet = 0.2 } = {}) {
  const wl = reverbChannel(left, 0);
  const wr = reverbChannel(right, 0.6);
  for (let i = 0; i < left.length; i += 1) {
    left[i] = (1 - wet) * left[i] + wet * wl[i];
    right[i] = (1 - wet) * right[i] + wet * wr[i];
  }
}

/**
 * Synthesizes a music bed of `durationSec`. The first bar is pad only, every bar containing a time in `breathAtSec`
 * keeps only the pad, the last bar returns to the tonic, and the bed fades in over 1.5 s and out over the last 3 s
 * (both shortened in proportion for videos under 4.5 s). Not normalized: the mixer scales it to its target level.
 */
export function synthMusicBed(mood, { durationSec, breathAtSec = [], seed = 'music' } = {}) {
  const spec = MOOD_SPECS[mood];
  if (!spec) throw new Error(`unknown music mood ${mood}`);
  const n = Math.max(1, Math.round(durationSec * SR));
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const rng = makeRng(`${mood}:${seed}`);
  const beat = 60 / spec.bpm;
  const bar = 4 * beat;
  const nBars = Math.ceil(durationSec / bar);
  const breathBars = new Set(breathAtSec.map((t) => Math.floor(t / bar)));
  const at = (sec) => Math.round(sec * SR);

  for (let b = 0; b < nBars; b += 1) {
    const chord = b === nBars - 1 ? spec.chords[0] : spec.chords[b % spec.chords.length];
    const t0 = b * bar;
    chord.forEach((note, k) => addStereo(L, R, padNote(midiHz(note), bar), at(t0), 0.18 / chord.length, (k - 1) * 0.25));
    if (b === 0 || breathBars.has(b)) continue;
    const voices = new Set(spec.voices);
    if (voices.has('pluck_slow')) {
      for (let i = 0; i < 4; i += 1) addStereo(L, R, pluck(midiHz(chord[i % 3] + 12), 1.5, 0.996, rng), at(t0 + i * beat), 0.35, i % 2 ? 0.2 : -0.2);
    }
    if (voices.has('pluck_staccato')) {
      const rests = new Set([Math.floor(rng() * 8)]);
      if (rng() < 0.5) rests.add(Math.floor(rng() * 8));
      for (let j = 0; j < 8; j += 1) {
        if (rests.has(j)) continue;
        addStereo(L, R, pluck(midiHz(chord[j % 3] + 12), 0.6, 0.99, rng), at(t0 + (j * beat) / 2), 0.3, j % 2 ? 0.2 : -0.2);
      }
    }
    if (voices.has('bass_pluck')) {
      for (const i of [0, 2]) addStereo(L, R, pluck(midiHz(chord[0] - 12), 1.2, 0.995, rng), at(t0 + i * beat), 0.4, 0);
    }
    if (voices.has('bell')) {
      addStereo(L, R, bell(midiHz(chord[Math.floor(rng() * 3)] + 24), 0.5), at(t0 + 3 * beat), 0.15, 0.15);
    }
    if (voices.has('shaker')) {
      for (let j = 0; j < 8; j += 1) addStereo(L, R, shakerHit(rng), at(t0 + (j * beat) / 2), j % 2 ? 0.12 : 0.06, 0.3);
    }
    if (voices.has('kick')) {
      for (const i of [0, 2]) addStereo(L, R, kickHit(), at(t0 + i * beat), 0.5, 0);
    }
  }

  schroederReverb(L, R, { wet: 0.2 });
  const k = Math.min(1, durationSec / 4.5);
  const fadeIn = Math.max(1, Math.round(1.5 * k * SR));
  const fadeOut = Math.max(1, Math.round(3 * k * SR));
  for (let i = 0; i < n; i += 1) {
    let g = 1;
    if (i < fadeIn) g *= i / fadeIn;
    const fromEnd = n - 1 - i;
    if (fromEnd < fadeOut) g *= fromEnd / fadeOut;
    L[i] *= g;
    R[i] *= g;
  }
  L[n - 1] = 0;
  R[n - 1] = 0;
  return { left: L, right: R };
}
