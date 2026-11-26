// Synthesized music beds in four moods with section breaths and a soft Schroeder reverb (音效与配乐设计 §5).
// Only this module imports sound.mjs; sound.mjs never imports it back.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSound } from './project.mjs';
import {
  collectSoundEvents,
  makeRng,
  onePoleHighpass,
  onePoleLowpass,
  renderSfxStem,
  SAMPLE_RATE,
  speechIntervals,
  thinSoundEvents,
} from './sound.mjs';

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

/**
 * Linear gain that ducks the music under speech: 1 in pauses, 10^(duckDb/20) while speaking. Each interval starts
 * ducking `leadMs` before it begins (reaching the floor after `attackMs`) and releases `holdMs` after it ends over
 * `releaseMs`. Where one interval's release meets the next one's attack the lower gain wins. Ramps are linear in dB.
 */
export function duckingGains(intervals, totalSamples, { duckDb = -6, leadMs = 120, attackMs = 150, holdMs = 300, releaseMs = 500, sampleRate = SAMPLE_RATE } = {}) {
  const g = new Float32Array(totalSamples).fill(1);
  const ms = (v) => Math.round((v * sampleRate) / 1000);
  const lead = ms(leadMs);
  const attack = Math.max(1, ms(attackMs));
  const hold = ms(holdMs);
  const release = Math.max(1, ms(releaseMs));
  const gainAt = (fraction) => 10 ** ((duckDb * fraction) / 20);
  for (const { start, end } of intervals) {
    const a0 = start - lead;
    const r0 = end + hold;
    const from = Math.max(0, a0);
    const to = Math.min(totalSamples, r0 + release);
    for (let i = from; i < to; i += 1) {
      const depth = i < a0 + attack ? (i - a0) / attack : i < r0 ? 1 : 1 - (i - r0) / release;
      const v = gainAt(Math.min(1, Math.max(0, depth)));
      if (v < g[i]) g[i] = v;
    }
  }
  return g;
}

/**
 * Loops a short file with crossfaded seams (half the file when it is shorter than two crossfades) or trims a long one,
 * then fades the last `fadeOutSec` linearly to exactly 0.
 */
export function fitMusicToLength(left, right, totalSamples, { crossfadeSec = 1, fadeOutSec = 3, sampleRate = SAMPLE_RATE } = {}) {
  const L = new Float32Array(totalSamples);
  const R = new Float32Array(totalSamples);
  const len = Math.min(left.length, right.length);
  if (len > 0) {
    let cf = Math.round(crossfadeSec * sampleRate);
    if (len < 2 * cf) cf = Math.floor(len / 2);
    const stride = len - cf;
    for (let pos = 0; pos < totalSamples; pos += stride) {
      const more = pos + len < totalSamples;
      for (let k = 0; k < len && pos + k < totalSamples; k += 1) {
        let w = 1;
        if (pos > 0 && k < cf) w *= k / cf;
        if (more && k >= stride) w *= (len - k) / cf;
        L[pos + k] += left[k] * w;
        R[pos + k] += right[k] * w;
      }
    }
  }
  const fade = Math.min(totalSamples, Math.max(1, Math.round(fadeOutSec * sampleRate)));
  for (let k = 0; k < fade; k += 1) {
    const i = totalSamples - 1 - k;
    L[i] = k === 0 ? 0 : L[i] * (k / fade);
    R[i] = k === 0 ? 0 : R[i] * (k / fade);
  }
  return { left: L, right: R };
}

/** Decodes a user music file to stereo 48 kHz with FFmpeg and fits it to `totalSamples`. */
export function loadUserMusic(absPath, totalSamples, { ffmpeg = 'ffmpeg' } = {}) {
  if (!existsSync(absPath)) throw new Error(`音乐文件不存在：${absPath}`);
  const run = spawnSync(ffmpeg, ['-v', 'error', '-i', absPath, '-f', 'f32le', '-ac', '2', '-ar', String(SR), 'pipe:1'], { maxBuffer: 1 << 30 });
  if (run.error || run.status !== 0) throw new Error(`无法读取音乐文件：${absPath}：${run.error?.message ?? String(run.stderr).trim()}`);
  const buf = run.stdout;
  const frames = Math.floor(buf.length / 8);
  const pcm = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + frames * 8));
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    left[i] = pcm[2 * i];
    right[i] = pcm[2 * i + 1];
  }
  const fitted = fitMusicToLength(left, right, totalSamples);
  return { ...fitted, silent: stereoRms(fitted.left, fitted.right) < 1e-5 };
}

/** Mean RMS of the voice over the speech spans in dBFS, or null when there is no speech to measure. */
export function voiceReferenceDb(voice, intervals) {
  let sum = 0;
  let count = 0;
  for (const { start, end } of intervals) {
    const e = Math.min(end, voice.length);
    for (let i = Math.max(0, start); i < e; i += 1) sum += voice[i] * voice[i];
    count += Math.max(0, e - Math.max(0, start));
  }
  if (!count) return null;
  const rms = Math.sqrt(sum / count);
  return rms < 1e-5 ? null : 20 * Math.log10(rms);
}

/** Voice on both channels plus the effects and music stems; scaled as a whole when the peak would pass 0.99. */
export function mixStems(voice, sfx, music) {
  const n = sfx.left.length;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i += 1) {
    const v = voice[i] ?? 0;
    left[i] = v + sfx.left[i] + music.left[i];
    right[i] = v + sfx.right[i] + music.right[i];
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const scale = peak > 0.99 ? 0.99 / peak : 1;
  if (scale < 1) {
    for (let i = 0; i < n; i += 1) {
      left[i] *= scale;
      right[i] *= scale;
    }
  }
  return { left, right, scale };
}

/** Interleaved 16-bit PCM stereo WAV; samples are clamped to [-1, 1] before scaling by 32767. */
export function makeStereoWavBuffer(left, right, sampleRate = SAMPLE_RATE) {
  const frames = left.length;
  const buf = Buffer.alloc(44 + frames * 4);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + frames * 4, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(frames * 4, 40);
  const q = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  for (let i = 0; i < frames; i += 1) {
    buf.writeInt16LE(q(left[i]), 44 + i * 4);
    buf.writeInt16LE(q(right[i]), 46 + i * 4);
  }
  return buf;
}

const samplesFor = (plans, fps) => Math.round((plans.reduce((s, p) => s + p.frameCount, 0) * SR) / fps);
const midOf = ({ left, right }) => left.map((v, i) => (v + right[i]) / 2);

/**
 * Builds the stereo soundtrack for the selected shots: the polished voice, the effects stem and the ducked music bed.
 * The music is made for the whole timeline, scaled there and then cut at the selected shots, so a --sample render
 * plays the same stretch of music as the final one.
 */
export function buildSoundtrack({ project, projectDir, allPlans, selectedPlans, fps, voice, manifest, ffmpeg = 'ffmpeg' }) {
  const { sfx, music } = resolveSound(project);
  const totalSamples = Math.max(1, samplesFor(selectedPlans, fps));
  const intervals = speechIntervals(selectedPlans, fps);
  const ref = voiceReferenceDb(voice, intervals);
  const voiceMissing = ref === null;
  const voiceRefDb = ref ?? -20;
  const report = { sfxCounts: {}, musicSource: null, musicLicense: null };

  let sfxStem = { left: new Float32Array(totalSamples), right: new Float32Array(totalSamples) };
  if (sfx) {
    const events = thinSoundEvents(collectSoundEvents(selectedPlans, manifest, { fps, lastSectionId: project.sections.at(-1)?.id ?? null }));
    const stem = renderSfxStem(events, totalSamples, { voiceRefDb, intervals, seed: project.title });
    sfxStem = { left: stem.left, right: stem.right };
    report.sfxCounts = stem.counts;
  }

  let musicStem = { left: new Float32Array(totalSamples), right: new Float32Array(totalSamples) };
  if (music) {
    const fullSamples = Math.max(1, samplesFor(allPlans, fps));
    const firstIdx = Math.max(0, allPlans.findIndex((p) => p.id === selectedPlans[0]?.id));
    const offset = samplesFor(allPlans.slice(0, firstIdx), fps);
    let bed = null;
    if (music.kind === 'synth') {
      const breathAtSec = [];
      let frames = 0;
      allPlans.forEach((plan, i) => {
        if (i > 0 && plan.shot.section !== allPlans[i - 1].shot.section) breathAtSec.push(frames / fps);
        frames += plan.frameCount;
      });
      bed = synthMusicBed(music.mood, { durationSec: fullSamples / SR, breathAtSec, seed: project.title });
      report.musicSource = `synth:${music.mood}`;
    } else {
      const loaded = loadUserMusic(join(projectDir, music.file), fullSamples, { ffmpeg });
      if (loaded.silent) report.musicWarning = 'MUSIC_SILENT';
      else bed = loaded;
      report.musicSource = music.file;
      report.musicLicense = music.license;
    }
    if (bed) {
      const rms = stereoRms(bed.left, bed.right);
      const k = rms > 0 ? 10 ** ((voiceRefDb - 14) / 20) / rms : 0;
      const g = duckingGains(intervals, totalSamples);
      for (let i = 0; i < totalSamples; i += 1) {
        const j = offset + i;
        if (j >= bed.left.length) break;
        musicStem.left[i] = bed.left[j] * k * g[i];
        musicStem.right[i] = bed.right[j] * k * g[i];
      }
    }
  }

  const voiceFit = voice.length === totalSamples ? voice : Float32Array.from({ length: totalSamples }, (_, i) => voice[i] ?? 0);
  const mix = mixStems(voiceFit, sfxStem, musicStem);
  return {
    left: mix.left,
    right: mix.right,
    stems: { voice: voiceFit, sfxMid: midOf(sfxStem), musicMid: midOf(musicStem) },
    intervals,
    voiceRefDb,
    voiceMissing,
    scale: mix.scale,
    report,
  };
}
