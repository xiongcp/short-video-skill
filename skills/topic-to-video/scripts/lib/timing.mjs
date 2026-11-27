// Word-level timing: VTT/SRT subtitle parsing (edge-tts), silence trimming, weighted estimation,
// cue.at anchor resolution and FFmpeg silencedetect splitting (出片质量设计 §6.1).
import { spawnSync } from 'node:child_process';

const PAUSE_PUNCT = /^[，、；：,:;]$/;
const SKIP_PUNCT = /^[\s。！？!?「」『』“”‘’（）()《》【】\[\]"'—…·,.~]$/;
const DIGIT_COUNT = (run) => run.replace(/[^0-9]/g, '').length;
const EN_SYLLABLES = (word) => Math.max(1, (word.toLowerCase().match(/[aeiouy]+/g) ?? []).length);

const parseTimestamp = (raw) => {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number(m[4].padEnd(3, '0'));
  return ((h * 60 + min) * 60 + s) * 1000 + ms;
};

/** Splits a sentence into natural breath clauses on Chinese/ASCII commas, semicolons, colons, dashes and ellipses. */
export function splitClauses(sentence) {
  const text = String(sentence ?? '').trim();
  if (!text) return [];
  const raw = text.split(/(?<=[，、；：,:;]|——|……)/).map((s) => s.trim()).filter(Boolean);
  if (raw.length <= 1) return raw;
  // Merge tiny orphan fragments (<= 2 chars) into their neighbor so subtitles stay balanced
  const merged = [];
  for (const part of raw) {
    if (merged.length && [...part].length <= 2) merged[merged.length - 1] += part;
    else merged.push(part);
  }
  return merged;
}

const IS_PUNCT = (tk) => /^\p{P}$/u.test(tk);
const OPEN_PUNCT = /^[\p{Ps}\p{Pi}]$/u;

/**
 * Portrait subtitle pages (竖屏设计 §6.5): clauses split into lines of at most `maxChars`, packed `maxLines` lines per
 * page. Latin words and digit runs are never split; a trailing comma-like mark is dropped from each line.
 */
export function subtitlePages(text, { maxChars = 12, maxLines = 2 } = {}) {
  const lines = [];
  for (const clause of splitClauses(text)) {
    const c = clause.replace(/[，、；：,:;]$/, '');
    const tokens = c.match(/[A-Za-z0-9.%]+|./gsu) ?? [];
    const total = tokens.reduce((s, tk) => s + [...tk].length, 0);
    if (!total) continue;
    const per = Math.ceil(total / Math.ceil(total / maxChars));
    let cur = [];
    let curLen = 0;
    for (const tk of tokens) {
      const tkLen = [...tk].length;
      const punct = IS_PUNCT(tk);
      if (cur.length && punct && curLen + tkLen > maxChars) {
        if (!OPEN_PUNCT.test(tk)) {
          let cut = cur.length - 1;
          while (cut > 0 && IS_PUNCT(cur[cut])) cut -= 1;
          const moved = cur.slice(cut);
          const movedLen = moved.reduce((s, t) => s + [...t].length, 0);
          if (cut > 0 && !IS_PUNCT(cur[cut]) && movedLen + tkLen <= maxChars) {
            lines.push(cur.slice(0, cut).join(''));
            cur = [...moved, tk];
            curLen = movedLen + tkLen;
            continue;
          }
        }
        lines.push(cur.join(''));
        cur = [tk];
        curLen = tkLen;
        continue;
      }
      if (cur.length && !punct && curLen + tkLen > per) {
        lines.push(cur.join(''));
        cur = [];
        curLen = 0;
      }
      cur.push(tk);
      curLen += tkLen;
    }
    if (cur.length) lines.push(cur.join(''));
  }
  const pages = [];
  let page = [];
  for (const line of lines) {
    if (page.length === maxLines) {
      pages.push(page);
      page = [];
    }
    page.push(line);
  }
  if (page.length) pages.push(page);
  return pages;
}

/** Parses WebVTT or SRT subtitle text (such as edge-tts --write-subtitles output) into word/phrase timings. */
export function parseSubtitles(content) {
  const blocks = String(content).replace(/\r\n/g, '\n').split(/\n{2,}/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const arrowIdx = lines.findIndex((l) => l.includes('-->'));
    if (arrowIdx < 0) continue;
    const [rawStart, rawEnd] = lines[arrowIdx].split('-->').map((s) => s.trim().split(/\s+/)[0]);
    const start_ms = parseTimestamp(rawStart);
    const end_ms = parseTimestamp(rawEnd);
    const text = lines.slice(arrowIdx + 1).join('').replace(/<[^>]+>/g, '').trim();
    if (start_ms !== null && end_ms !== null && text) {
      out.push({ text, start_ms, end_ms: Math.max(start_ms + 1, end_ms) });
    }
  }
  return out;
}

/** Trims leading and trailing silence from Float32 mono PCM using an RMS threshold (default -40 dBFS). */
export function detectSpeechBounds(samples, sampleRate, thresholdDb = -40) {
  const totalMs = Math.round((samples.length * 1000) / sampleRate);
  if (!samples.length) return [0, 0];
  const threshold = 10 ** (thresholdDb / 20);
  const win = Math.max(1, Math.round(sampleRate * 0.01)); // 10 ms windows
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.length; i += win) {
    const end = Math.min(samples.length, i + win);
    let sum = 0;
    for (let j = i; j < end; j += 1) sum += samples[j] * samples[j];
    const rms = Math.sqrt(sum / (end - i));
    if (rms >= threshold) {
      if (first < 0) first = i;
      last = end;
    }
  }
  if (first < 0) return [0, totalMs];
  return [Math.round((first * 1000) / sampleRate), Math.min(totalMs, Math.round((last * 1000) / sampleRate))];
}

/**
 * Estimates word-level timestamps within [speechStartMs, speechEndMs] using 出片质量设计 §6.1 weights:
 * Han char = 1, digit run = digit count, English word = 0.8 * syllables, mid-sentence pause punct = 0.6.
 */
export function estimateWords(sentence, speechStartMs, speechEndMs) {
  const tokens = [];
  const rx = /[A-Za-z]+|[0-9]+(?:\.[0-9]+)?|./gu;
  for (const [tok] of sentence.matchAll(rx)) {
    if (PAUSE_PUNCT.test(tok)) tokens.push({ text: tok, weight: 0.6, emit: false });
    else if (SKIP_PUNCT.test(tok)) continue;
    else if (/^[0-9]/.test(tok)) tokens.push({ text: tok, weight: Math.max(1, DIGIT_COUNT(tok) + (tok.includes('.') ? 1 : 0)), emit: true });
    else if (/^[A-Za-z]/.test(tok)) tokens.push({ text: tok, weight: EN_SYLLABLES(tok) * 0.8, emit: true });
    else tokens.push({ text: tok, weight: 1, emit: true });
  }
  const totalWeight = tokens.reduce((s, t) => s + t.weight, 0);
  if (!totalWeight) return [];
  const span = Math.max(1, speechEndMs - speechStartMs);
  let acc = 0;
  const out = [];
  for (const tok of tokens) {
    const start_ms = Math.round(speechStartMs + (acc / totalWeight) * span);
    acc += tok.weight;
    const end_ms = Math.round(speechStartMs + (acc / totalWeight) * span);
    if (tok.emit) out.push({ text: tok.text, start_ms, end_ms: Math.max(start_ms + 1, end_ms) });
  }
  return out;
}

/** Resolves a substring `anchorText` inside a sentence entry to an offset in ms from sentence start. */
export function resolveAnchorMs(sentenceEntry, anchorText) {
  const words = sentenceEntry.words?.length
    ? sentenceEntry.words
    : estimateWords(sentenceEntry.text ?? '', sentenceEntry.speech?.[0] ?? 0, sentenceEntry.speech?.[1] ?? sentenceEntry.durationMs ?? 1000);
  const source = sentenceEntry.words?.length ? (sentenceEntry.source ?? 'provider') : 'estimate';
  if (!anchorText) return { offsetMs: sentenceEntry.speech?.[0] ?? 0, source };

  // Direct word hit first
  for (const w of words) {
    if (w.text.includes(anchorText)) {
      const idx = w.text.indexOf(anchorText);
      const frac = w.text.length ? idx / w.text.length : 0;
      return { offsetMs: Math.round(w.start_ms + frac * (w.end_ms - w.start_ms)), source };
    }
  }
  // Concatenate words to find multi-token match
  const norm = (s) => s.replace(/[\s，、；：。！？!?「」『』“”‘’（）()《》【】\[\]"'—…·,:;.]/g, '');
  const target = norm(anchorText);
  let joined = '';
  const spans = [];
  for (const w of words) {
    const piece = norm(w.text);
    const start = joined.length;
    joined += piece;
    spans.push({ start, end: joined.length, w });
  }
  const pos = target ? joined.indexOf(target) : -1;
  if (pos >= 0) {
    const hit = spans.find((s) => pos >= s.start && pos < s.end);
    if (hit) {
      const spanLen = Math.max(1, hit.end - hit.start);
      const frac = (pos - hit.start) / spanLen;
      return { offsetMs: Math.round(hit.w.start_ms + frac * (hit.w.end_ms - hit.w.start_ms)), source };
    }
  }
  // Fallback proportional position in sentence speech span
  const [sp0, sp1] = sentenceEntry.speech ?? [0, sentenceEntry.durationMs ?? 1000];
  const full = sentenceEntry.text ?? '';
  const idx = full.indexOf(anchorText);
  const frac = idx >= 0 && full.length ? idx / full.length : 0;
  return { offsetMs: Math.round(sp0 + frac * (sp1 - sp0)), source: 'estimate' };
}

const CUE_LEAD_MS = { reveal: 150, highlight: 0, expr: 100, gesture: 100, move: 100, prop: 100 };

/** Resolves all cues in one shot to shot-relative millisecond timestamps with §6.1 lead times. */
export function resolveCueTiming(shotTimeline, cues = []) {
  const byIndex = new Map(shotTimeline.sentenceRanges.map((r) => [r.index, r]));
  const shotDurationMs = Math.max(1, shotTimeline.endMs - shotTimeline.startMs);
  return cues.map((cue) => {
    const sent = byIndex.get(cue.sentence);
    const baseMs = sent ? sent.startMs - shotTimeline.startMs : 0;
    const anchor = sent && cue.at ? resolveAnchorMs(sent, cue.at) : { offsetMs: 0, source: sent?.source ?? 'estimate' };
    const anchorMs = baseMs + anchor.offsetMs;
    const leadMs = cue.at ? (CUE_LEAD_MS[cue.do] ?? 0) : 0;
    const timeMs = Math.max(0, Math.min(shotDurationMs, anchorMs - leadMs));
    return { ...cue, anchorMs, timeMs, leadMs, source: anchor.source };
  }).sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Splits a single imported narration file by silence gaps using FFmpeg silencedetect.
 * Fails loudly when the detected segment count disagrees with `expectedCount` (never guesses).
 */
export function splitRecordingBySilence(audioPath, expectedCount, { ffmpeg = 'ffmpeg', noiseDb = -35, minSilence = 0.25 } = {}) {
  const res = spawnSync(ffmpeg, [
    '-hide_banner', '-i', audioPath,
    '-af', `silencedetect=noise=${noiseDb}dB:d=${minSilence}`,
    '-f', 'null', '-',
  ], { encoding: 'utf8' });
  if (res.error) throw new Error(`ffmpeg unavailable: ${res.error.message}`);
  const log = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
  const durMatch = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const totalSec = durMatch ? Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]) : 0;
  const silences = [];
  for (const m of log.matchAll(/silence_start:\s*([\d.]+)/g)) silences.push({ start: Number(m[1]), end: totalSec });
  let idx = 0;
  for (const m of log.matchAll(/silence_end:\s*([\d.]+)/g)) {
    if (silences[idx]) silences[idx].end = Number(m[1]);
    idx += 1;
  }
  const segments = [];
  let cursor = 0;
  for (const s of silences) {
    if (s.start - cursor > 0.08) segments.push([cursor, s.start]);
    cursor = Math.max(cursor, s.end);
  }
  if (totalSec - cursor > 0.08) segments.push([cursor, totalSec]);
  if (segments.length !== expectedCount) {
    throw new Error(`silencedetect found ${segments.length} segments, expected ${expectedCount}; please confirm or provide per-sentence files`);
  }
  return segments.map(([a, b]) => [Math.round(a * 1000), Math.round(b * 1000)]);
}
