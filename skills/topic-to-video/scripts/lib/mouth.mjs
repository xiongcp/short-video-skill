// Pure-JS WAV PCM reader and frame-level lip-sync + stress-nod analyzer (出片质量设计 §5.4).
// Fast-open (30 ms) / slow-close (80 ms) RMS envelope + zero-crossing rate width.

/** Builds a 16-bit mono PCM WAV buffer from Int16Array samples (useful for silence padding and tests). */
export function makeWavBuffer(samples, sampleRate = 48000) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i += 1) buf.writeInt16LE(samples[i], 44 + i * 2);
  return buf;
}

/** Reads a 16-bit PCM WAV buffer into normalized mono Float32Array samples in [-1, 1]. */
export function readWavPcm(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('unsupported WAV header');
  }
  let channels = 1;
  let sampleRate = 48000;
  let bitsPerSample = 16;
  let dataStart = -1;
  let dataSize = 0;
  for (let at = 12; at + 8 <= buf.length;) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'fmt ') {
      const fmt = buf.readUInt16LE(at + 8);
      if (fmt !== 1) throw new Error(`unsupported WAV format ${fmt} (expected PCM 1)`);
      channels = buf.readUInt16LE(at + 10);
      sampleRate = buf.readUInt32LE(at + 12);
      bitsPerSample = buf.readUInt16LE(at + 22);
    } else if (id === 'data') {
      dataStart = at + 8;
      dataSize = Math.min(size, buf.length - dataStart);
      break;
    }
    at += 8 + size + (size % 2);
  }
  if (dataStart < 0 || bitsPerSample !== 16) throw new Error('WAV missing 16-bit PCM data chunk');
  const frameBytes = channels * 2;
  const count = Math.floor(dataSize / frameBytes);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) sum += buf.readInt16LE(dataStart + i * frameBytes + c * 2);
    samples[i] = sum / (channels * 32768);
  }
  return { samples, sampleRate, channels, durationMs: Math.round((count * 1000) / sampleRate) };
}

/**
 * Trims excessive leading/trailing dead silence from mono Float32 PCM, keeping `padMs` room breath
 * and applying a `fadeMs` linear fade-in/out to prevent clicks between sentences.
 */
export function trimSilenceWithFade(samples, sampleRate, { thresholdDb = -42, padMs = 35, fadeMs = 20 } = {}) {
  if (!samples.length) return samples;
  const threshold = 10 ** (thresholdDb / 20);
  const win = Math.max(1, Math.round(sampleRate * 0.01));
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.length; i += win) {
    const end = Math.min(samples.length, i + win);
    let sq = 0;
    for (let j = i; j < end; j += 1) sq += samples[j] * samples[j];
    if (Math.sqrt(sq / (end - i)) >= threshold) {
      if (first < 0) first = i;
      last = end;
    }
  }
  if (first < 0) return samples;
  const pad = Math.round((padMs / 1000) * sampleRate);
  const start = Math.max(0, first - pad);
  const end = Math.min(samples.length, last + pad);
  const out = Float32Array.from(samples.subarray(start, end));
  const fade = Math.min(Math.floor(out.length / 2), Math.round((fadeMs / 1000) * sampleRate));
  for (let i = 0; i < fade; i += 1) {
    const gain = i / Math.max(1, fade);
    out[i] *= gain;
    out[out.length - 1 - i] *= gain;
  }
  return out;
}

/**
 * Analyzes mono Float32 PCM at `fps`: returns per-frame `{ open, width, rms, nod }`.
 * open ∈ [0, 1] uses 95th-percentile normalization and fast-open 30 ms / slow-close 80 ms smoothing.
 * width ∈ [0, 1] maps zero-crossing rate (round vowels low → wide vowels high).
 */
export function analyzeAudioFrames(samples, sampleRate, fps = 60) {
  const frameCount = Math.max(1, Math.round((samples.length * fps) / sampleRate));
  const rawRms = new Float32Array(frameCount);
  const rawZcr = new Float32Array(frameCount);
  const active = [];

  for (let f = 0; f < frameCount; f += 1) {
    const start = Math.floor((f * sampleRate) / fps);
    const end = Math.min(samples.length, Math.floor(((f + 1) * sampleRate) / fps));
    const n = Math.max(1, end - start);
    let sq = 0;
    let zc = 0;
    for (let i = start; i < end; i += 1) {
      const s = samples[i];
      sq += s * s;
      if (i > start && (samples[i - 1] >= 0) !== (s >= 0)) zc += 1;
    }
    const rms = Math.sqrt(sq / n);
    rawRms[f] = rms;
    rawZcr[f] = (zc * sampleRate) / (n * 2); // approximate dominant frequency in Hz
    if (rms > 0.01) active.push(rms);
  }

  active.sort((a, b) => a - b);
  const p95 = active.length ? active[Math.min(active.length - 1, Math.floor(active.length * 0.95))] : 1;
  const normBase = Math.max(0.02, p95);
  const dt = 1 / fps;
  const alphaOpen = 1 - Math.exp(-dt / 0.03);  // 30 ms fast open
  const alphaClose = 1 - Math.exp(-dt / 0.08); // 80 ms slow close
  const alphaWidth = 1 - Math.exp(-dt / 0.06);

  let env = 0;
  let widthSmooth = 0.5;
  let lastNodFrame = -fps;
  const frames = [];

  for (let f = 0; f < frameCount; f += 1) {
    const level = Math.min(1, rawRms[f] / normBase);
    const target = level < 0.08 ? 0 : Math.min(1, (level - 0.08) / 0.92);
    env += (target > env ? alphaOpen : alphaClose) * (target - env);
    const open = env < 0.04 ? 0 : Math.min(1, env);
    const zcrNorm = Math.max(0, Math.min(1, (rawZcr[f] - 250) / 2200));
    widthSmooth += alphaWidth * (zcrNorm - widthSmooth);
    const isPeak = open > 0.72 && f - lastNodFrame >= Math.round(fps * 0.45)
      && (f === 0 || rawRms[f] >= rawRms[f - 1])
      && (f + 1 >= frameCount || rawRms[f] >= rawRms[f + 1]);
    if (isPeak) lastNodFrame = f;
    frames.push({ open, width: widthSmooth, rms: rawRms[f], nod: isPeak ? 1 : 0 });
  }
  return frames;
}
