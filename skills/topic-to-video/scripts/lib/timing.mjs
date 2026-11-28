// Word-level timing: VTT/SRT subtitle parsing (edge-tts), silence trimming, weighted estimation,
// cue.at anchor resolution and FFmpeg silencedetect splitting (出片质量设计 §6.1).
import { spawnSync } from 'node:child_process';
import { countChars } from './captions.mjs';
import { textBox } from './frame.mjs';
import { NUMBER_UNITS, toSpoken } from './reading.mjs';

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
  const raw = text.split(/(?<=[，、；：;]|——|……|(?<!\d)[,:]|[,:](?!\d))/).map((s) => s.trim()).filter(Boolean);
  if (raw.length <= 1) return raw;
  // Merge tiny orphan fragments (<= 2 chars) into their neighbor so subtitles stay balanced
  const merged = [];
  for (const part of raw) {
    if (merged.length && [...part].length <= 2) merged[merged.length - 1] += part;
    else merged.push(part);
  }
  return merged;
}

// Caption line breaking (字幕与转场设计 §4): a clause breaks only between atoms — number groups, keywords, English words
// and segmenter words — into the fewest lines, then the most even lines, avoiding breaks next to an unknown single
// character and lines that start with a particle.
const FUNCTION_WORDS = new Set('的了和与及或在是把被从向对给跟也都还就才又再很更最不没有让为以于而并但却则即每各该这那其此之将已曾正到');
const WEAK_START = new Set('的了着过吗呢吧啊');
const BREAK_PENALTY = 4;
// Added to a penalized break so that, on an equal cost, a clean break wins before the earlier one does.
const TIE_BREAK = 1e-6;
const HARD = new RegExp(`[A-Za-z][A-Za-z0-9.+-]*|\\d+[A-Za-z][A-Za-z0-9.+-]*|\\d[\\d.,:%％]*[${NUMBER_UNITS}]*(?:[到至~～–-]?\\d[\\d.,:%％]*[${NUMBER_UNITS}]*)*`, 'gu');
const OPENING = /^[\p{Ps}\p{Pi}]+$/u;
const PUNCT = /^[\p{P}\s]+$/u;
const width = (s) => textBox({ text: s, fontSize: 1, x: 0, y: 0 }).w;

let segmenter;
function segmentWords(text) {
  segmenter ??= new Intl.Segmenter('zh-CN', { granularity: 'word' });
  return [...segmenter.segment(text)].map((s) => s.segment);
}

// Atoms of one clause: hard spans (number groups, English words, keywords; overlapping ones merged) and segmenter
// words for the gaps. Punctuation sticks to the atom before it, opening brackets and quotes to the atom after.
function atomsOf(clause, keywords, segment) {
  const hard = [...clause.matchAll(HARD)].map((m) => [m.index, m.index + m[0].length]);
  for (const k of keywords) for (let i = clause.indexOf(k); i >= 0; i = clause.indexOf(k, i + 1)) hard.push([i, i + k.length]);
  hard.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const [s, e] of hard) {
    const last = merged.at(-1);
    if (last && s < last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const raw = [];
  const words = (from, to) => {
    let p = from;
    for (const w of segment(clause.slice(from, to))) {
      const single = [...w].length === 1 && /\p{Script=Han}/u.test(w) && !FUNCTION_WORDS.has(w);
      raw.push({ text: w, start: p, kind: PUNCT.test(w) ? 'punct' : single ? 'single' : 'word' });
      p += w.length;
    }
  };
  let pos = 0;
  for (const [s, e] of merged) {
    if (pos < s) words(pos, s);
    raw.push({ text: clause.slice(s, e), start: s, kind: 'hard' });
    pos = e;
  }
  if (pos < clause.length) words(pos, clause.length);
  const atoms = [];
  let open = null;
  for (const a of raw) {
    if (a.kind === 'punct' && OPENING.test(a.text)) open = open ? { ...open, text: open.text + a.text } : { ...a };
    else if (open) {
      atoms.push({ ...a, text: open.text + a.text, start: open.start });
      open = null;
    } else if (a.kind === 'punct' && atoms.length) atoms.at(-1).text += a.text;
    else atoms.push({ ...a });
  }
  if (open) atoms.push(open);
  return atoms;
}

// Lines of one clause: the fewest lines of at most maxWidth, then the lowest cost; on a tie a break without a penalty
// wins, then the earlier break.
function breakClause(atoms, maxWidth) {
  const units = atoms.flatMap((a) => {
    if (width(a.text) <= maxWidth) return [a];
    let p = a.start;
    return [...a.text].map((ch) => {
      const u = { text: ch, start: p, kind: 'char' };
      p += ch.length;
      return u;
    });
  });
  const w = units.map((u) => width(u.text));
  let lines = 1;
  let acc = 0;
  for (const x of w) {
    if (acc > 0 && acc + x > maxWidth + 1e-9) {
      lines += 1;
      acc = x;
    } else acc += x;
  }
  const prefix = [0];
  for (const x of w) prefix.push(prefix.at(-1) + x);
  const mean = prefix.at(-1) / lines;
  const penalty = (j) => {
    const p = (units[j - 1].kind === 'single' || units[j].kind === 'single' ? BREAK_PENALTY : 0)
      + (WEAK_START.has(units[j].text[0]) ? BREAK_PENALTY : 0);
    return p ? p + TIE_BREAK : 0;
  };
  const n = units.length;
  const best = Array.from({ length: lines + 1 }, () => new Array(n + 1).fill(Infinity));
  const back = Array.from({ length: lines + 1 }, () => new Array(n + 1).fill(-1));
  best[0][0] = 0;
  for (let k = 1; k <= lines; k += 1) {
    for (let i = k; i <= n; i += 1) {
      for (let j = k - 1; j < i; j += 1) {
        const lw = prefix[i] - prefix[j];
        if (best[k - 1][j] === Infinity || lw > maxWidth + 1e-9) continue;
        const cost = best[k - 1][j] + (lw - mean) ** 2 + (j > 0 ? penalty(j) : 0);
        if (cost < best[k][i] - 1e-9) {
          best[k][i] = cost;
          back[k][i] = j;
        }
      }
    }
  }
  const out = [];
  for (let k = lines, i = n; k > 0; k -= 1) {
    const j = back[k][i];
    out.unshift({ text: units.slice(j, i).map((u) => u.text).join('').trim(), start: units[j].start });
    i = j;
  }
  return out;
}

/**
 * Caption pages of one sentence (字幕与转场设计 §4): pages of lines `{ text, start }`, `start` being the line's offset
 * in `text`. Portrait (`maxChars` set): each clause on lines of at most `maxChars` wide, all of a clause's lines on one
 * page unless it has more than `maxLines`. Landscape (`maxChars` null): one clause per page; a sentence of at most 12
 * characters or with one clause is one page.
 */
export function layoutCaption(text, { maxChars = null, maxLines = 1, keywords = [], segment = segmentWords } = {}) {
  const clauses = [];
  let at = 0;
  for (const part of splitClauses(text)) {
    // splitClauses trims spaces, so a part may not be found verbatim; its offset then only feeds page timing.
    const found = text.indexOf(part, at);
    const start = found < 0 ? at : found;
    at = start + part.length;
    clauses.push({ text: part.replace(/[，、；：,:;]$/, ''), start });
  }
  if (maxChars === null) {
    if (clauses.length <= 1 || [...text].length <= 12) return text ? [[{ text, start: 0 }]] : [];
    return clauses.map((c) => [c]);
  }
  const pages = [];
  let page = [];
  for (const c of clauses) {
    if (!c.text) continue;
    const lines = breakClause(atomsOf(c.text, keywords, segment), maxChars).map((l) => ({ text: l.text, start: c.start + l.start }));
    if (page.length && page.length + lines.length > maxLines) {
      pages.push(page);
      page = [];
    }
    for (const line of lines) {
      if (page.length === maxLines) {
        pages.push(page);
        page = [];
      }
      page.push(line);
    }
  }
  if (page.length) pages.push(page);
  return pages;
}

/** Portrait subtitle pages as text (竖屏设计 §6.5, 字幕与转场设计 §4): at most two lines of width 12 per page. */
export function subtitlePages(text, opts = {}) {
  return layoutCaption(text, { maxChars: 12, maxLines: 2, ...opts }).map((pg) => pg.map((l) => l.text));
}

// Offset where each word ends in `text`, with its start time; null when a word is not found in order.
function placeWords(text, words) {
  const out = [];
  let cursor = 0;
  for (const w of words) {
    const pos = text.indexOf(w.text, cursor);
    if (pos < 0) return null;
    out.push({ end: pos + w.text.length, start_ms: w.start_ms });
    cursor = pos + w.text.length;
  }
  return out;
}

/**
 * Caption pages of one sentence and when each shows, in ms from the sentence start (字幕与转场设计 §4.4): the first page
 * from 0, every later page from the moment its first word is spoken, the last one until 120 ms after the sentence.
 * `entry` is a timeline sentence `{ text, durationMs, speech, words }`; `opts` go to layoutCaption.
 */
export function captionPages(entry, opts = {}) {
  const text = entry.text ?? '';
  const pages = layoutCaption(text, opts);
  if (!pages.length) return [];
  const durationMs = entry.durationMs ?? 0;
  const [sp0, sp1] = entry.speech ?? [0, durationMs];
  const placed = placeWords(text, entry.words?.length ? entry.words : estimateWords(text, sp0, sp1));
  const timeAt = (offset) => placed?.find((w) => w.end > offset)?.start_ms ?? Math.round(sp0 + (offset / Math.max(1, text.length)) * (sp1 - sp0));
  const starts = pages.map((pg, i) => (i ? timeAt(pg[0].start) : 0));
  for (let i = 1; i < starts.length; i += 1) starts[i] = Math.max(starts[i], starts[i - 1]);
  return pages.map((pg, i) => ({ lines: pg.map((l) => l.text), startMs: starts[i], endMs: i + 1 < pages.length ? starts[i + 1] : durationMs + 120 }));
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

// Display tokens of a sentence with their spoken text and weight (出片质量设计 §6.1, 字幕与转场设计 §3.3): Han char 1,
// English word 0.8 per syllable, mid-sentence pause 0.6, a replaced span (a number, a pronunciation term) its reading length.
function displayTokens(sentence, spans) {
  const tokens = [];
  const plain = (text) => {
    for (const [tok] of text.matchAll(/[A-Za-z]+|[0-9]+(?:\.[0-9]+)?|./gu)) {
      if (PAUSE_PUNCT.test(tok)) tokens.push({ text: tok, spoken: '', weight: 0.6, emit: false });
      else if (SKIP_PUNCT.test(tok)) continue;
      else if (/^[0-9]/.test(tok)) tokens.push({ text: tok, spoken: tok, weight: Math.max(1, DIGIT_COUNT(tok) + (tok.includes('.') ? 1 : 0)), emit: true });
      else if (/^[A-Za-z]/.test(tok)) tokens.push({ text: tok, spoken: tok, weight: EN_SYLLABLES(tok) * 0.8, emit: true });
      else tokens.push({ text: tok, spoken: tok, weight: 1, emit: true });
    }
  };
  let at = 0;
  for (const s of spans) {
    plain(sentence.slice(at, s.start));
    tokens.push({ text: s.text, spoken: s.reading, weight: Math.max(1, countChars(s.reading)), emit: true });
    at = s.end;
  }
  plain(sentence.slice(at));
  return tokens;
}

/**
 * Estimates word-level timestamps of the display text within [speechStartMs, speechEndMs]. `spans` (from toSpoken) are
 * weighed by their reading, so 15.07% takes as long as 百分之十五点零七.
 */
export function estimateWords(sentence, speechStartMs, speechEndMs, spans = toSpoken(sentence).spans) {
  const tokens = displayTokens(sentence, spans);
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

const spokenChars = (s) => s.match(/[\p{L}\p{N}]/gu) ?? [];

/**
 * Maps provider word times, which are on the spoken text, back to display words (字幕与转场设计 §3.3). Returns null when
 * the provider's characters differ from the spoken text, so the caller falls back to estimateWords.
 */
export function displayWords(words, sentence, spans) {
  const tokens = displayTokens(sentence, spans);
  if (words.map((w) => spokenChars(w.text).join('')).join('') !== tokens.map((t) => spokenChars(t.spoken).join('')).join('')) return null;
  const marks = [];
  for (const w of words) {
    const chars = spokenChars(w.text);
    chars.forEach((_, i) => marks.push([w.start_ms + ((w.end_ms - w.start_ms) * i) / chars.length, w.start_ms + ((w.end_ms - w.start_ms) * (i + 1)) / chars.length]));
  }
  const out = [];
  let k = 0;
  for (const t of tokens) {
    const n = spokenChars(t.spoken).length;
    if (t.emit && n) {
      const start_ms = Math.round(marks[k][0]);
      out.push({ text: t.text, start_ms, end_ms: Math.max(start_ms + 1, Math.round(marks[k + n - 1][1])) });
    }
    k += n;
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
