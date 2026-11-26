// Per-sentence TTS synthesis and audio/timing.json generation (轻量化Skill计划书 §4.7, 出片质量设计 §4.4, §6.1).
// Supports local command templates (edge-tts with word/phrase subtitles, macOS say, Kokoro), import, and openai-compatible APIs.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { splitSentences } from './captions.mjs';
import { makeWavBuffer, readWavPcm, trimSilenceWithFade } from './mouth.mjs';
import { VOICE_PRESETS } from './project.mjs';
import { detectSpeechBounds, estimateWords, parseSubtitles, splitRecordingBySilence } from './timing.mjs';

/** Converts numeric speed (e.g. 0.96 -> "-4%", 1.08 -> "+8%") to edge-tts --rate format. */
export function speedToEdgeRate(speed = 1) {
  const pct = Math.round((Number(speed) - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

/** Converts a pitch offset in Hz (e.g. 0 -> "+0Hz", -3 -> "-3Hz") to edge-tts --pitch format. */
export function pitchToEdge(pitch = 0) {
  const hz = Math.round(Number(pitch));
  return `${hz >= 0 ? '+' : ''}${hz}Hz`;
}

/** The preset voice.preset names, or null without one. An unknown name throws rather than falling back to 晓晓. */
function presetOf(voice) {
  if (voice.preset === undefined) return null;
  if (!Object.hasOwn(VOICE_PRESETS, voice.preset)) {
    throw new Error(`未知的配音人设 voice.preset: ${voice.preset}，可选 ${Object.keys(VOICE_PRESETS).join('、')}`);
  }
  return VOICE_PRESETS[voice.preset];
}

/**
 * What {voice}, {speed}, {rate} and {pitch} stand for (声音人设设计 §4). A preset supplies the voice and speed unless
 * voice.voice or voice.speed is set; without a preset {voice} is 晓晓, {speed} is 1 and {rate} is -4%, as before.
 */
export function resolveVoice(voice) {
  const preset = presetOf(voice);
  return {
    voice: voice.voice ?? preset?.voice ?? 'zh-CN-XiaoxiaoNeural',
    speed: voice.speed ?? preset?.speed ?? 1,
    rate: speedToEdgeRate(voice.speed ?? preset?.speed ?? 0.96),
    pitch: pitchToEdge(voice.pitch ?? 0),
  };
}

/** Applies section.pronunciation term -> reading substitutions to spoken text only (keeps display text untouched). */
export function applyPronunciation(text, pronunciation = []) {
  let out = text;
  for (const { term, reading } of pronunciation) {
    if (term && reading) out = out.replaceAll(term, reading);
  }
  return out;
}

/** Splits a command template string into argv tokens respecting single and double quotes (no shell evaluation). */
export function splitCommandTemplate(template) {
  const tokens = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < template.length; i += 1) {
    const ch = template[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur.length) { tokens.push(cur); cur = ''; }
    } else {
      cur += ch;
    }
  }
  if (quote) throw new Error(`unclosed quote in voice.command: ${template}`);
  if (cur.length) tokens.push(cur);
  return tokens;
}

function normalizeToWav(srcPath, dstWav, { ffmpeg = 'ffmpeg' } = {}) {
  const res = spawnSync(ffmpeg, [
    '-y', '-loglevel', 'error', '-i', srcPath,
    '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', dstWav,
  ], { encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    throw new Error(`ffmpeg audio normalize failed for ${srcPath}: ${res.stderr || res.error?.message}`);
  }
}

async function runOpenAiTts(voice, text, outPath) {
  const apiKey = process.env[voice.api_key_env];
  if (!apiKey) throw new Error(`missing environment variable ${voice.api_key_env} for openai-compatible TTS`);
  const url = `${voice.base_url.replace(/\/$/, '')}/audio/speech`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: voice.model,
      voice: voice.voice,
      input: text,
      speed: voice.speed ?? 1,
      response_format: 'wav',
    }),
  });
  if (!resp.ok) throw new Error(`openai-compatible TTS HTTP ${resp.status}: ${await resp.text()}`);
  writeFileSync(outPath, Buffer.from(await resp.arrayBuffer()));
}

function runCommandTts(voice, text, wavOut, subOut, { ffmpeg = 'ffmpeg' } = {}) {
  const tokens = splitCommandTemplate(voice.command);
  if (!tokens.length) throw new Error('voice.command is empty');
  const isEdge = /edge[-_]?tts/i.test(tokens[0]) || tokens.some((t) => /edge_tts/i.test(t));
  const isSay = tokens[0] === 'say' || tokens[0].endsWith('/say');
  const rawOut = isEdge ? wavOut.replace(/\.wav$/, '.mp3') : isSay ? wavOut.replace(/\.wav$/, '.aiff') : wavOut;
  const resolved = resolveVoice(voice);
  const vars = {
    '{text}': text,
    '{out}': rawOut,
    '{sub}': subOut,
    '{voice}': resolved.voice,
    '{speed}': String(resolved.speed),
    '{rate}': resolved.rate,
    '{pitch}': resolved.pitch,
  };
  const args = tokens.slice(1).map((tok) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(k, v), tok));
  const res = spawnSync(tokens[0], args, { encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    throw new Error(`voice.command failed (${tokens[0]}): ${res.stderr || res.error?.message}`);
  }
  if (!existsSync(rawOut)) throw new Error(`voice.command did not create ${rawOut}`);
  if (rawOut !== wavOut) {
    normalizeToWav(rawOut, wavOut, { ffmpeg });
    try { unlinkSync(rawOut); } catch { /* keep clean */ }
  } else {
    // Ensure standard 48kHz 16-bit mono WAV
    try {
      const decoded = readWavPcm(readFileSync(wavOut));
      if (decoded.sampleRate !== 48000 || decoded.channels !== 1) {
        const tmp = `${wavOut}.tmp.wav`;
        normalizeToWav(wavOut, tmp, { ffmpeg });
        writeFileSync(wavOut, readFileSync(tmp));
        unlinkSync(tmp);
      }
    } catch {
      const tmp = `${wavOut}.tmp.wav`;
      normalizeToWav(wavOut, tmp, { ffmpeg });
      writeFileSync(wavOut, readFileSync(tmp));
      unlinkSync(tmp);
    }
  }
}

/** Cache key of one sentence's audio. Without a preset or a pitch it is the key older projects stored, so they reuse it. */
export function sentenceHash(spokenText, voice) {
  const preset = presetOf(voice);
  const key = {
    spokenText,
    provider: voice.provider,
    voice: voice.voice ?? preset?.voice ?? '',
    model: voice.model ?? '',
    speed: voice.speed ?? preset?.speed ?? 1,
    command: voice.command ?? '',
  };
  if ((voice.pitch ?? 0) !== 0) key.pitch = voice.pitch;
  return createHash('sha256').update(JSON.stringify(key)).digest('hex');
}

/**
 * Synthesizes or imports per-sentence 48kHz WAV files and writes `audio/timing.json`.
 * Skips already-synthesized sentences whose cache hash matches.
 */
export async function synthesizeProject(project, projectDir, { ffmpeg = 'ffmpeg' } = {}) {
  const audioDir = join(projectDir, 'audio');
  mkdirSync(audioDir, { recursive: true });
  const timingFile = join(audioDir, 'timing.json');
  const existing = existsSync(timingFile) ? JSON.parse(readFileSync(timingFile, 'utf8')) : {};
  const voice = project.voice ?? { provider: 'undecided' };
  const allSentences = project.sections.flatMap((sec) =>
    splitSentences(sec.text).map((text, idx) => ({
      key: `${sec.id}-${idx}`,
      section: sec.id,
      index: idx,
      text,
      spoken: applyPronunciation(text, sec.pronunciation),
    })),
  );

  // Import single recording mode if `audio/full.*` exists and per-sentence files do not
  if (voice.provider === 'import') {
    const fullFile = ['full.wav', 'full.mp3', 'full.m4a', 'full.flac'].map((f) => join(audioDir, f)).find((p) => existsSync(p));
    const missingPerSentence = allSentences.some((s) => !existsSync(join(audioDir, `${s.key}.wav`)));
    if (fullFile && missingPerSentence) {
      const segments = splitRecordingBySilence(fullFile, allSentences.length, { ffmpeg });
      segments.forEach(([startMs, endMs], i) => {
        const dst = join(audioDir, `${allSentences[i].key}.wav`);
        const res = spawnSync(ffmpeg, [
          '-y', '-loglevel', 'error', '-i', fullFile,
          '-ss', (startMs / 1000).toFixed(3), '-to', (endMs / 1000).toFixed(3),
          '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', dst,
        ], { encoding: 'utf8' });
        if (res.error || res.status !== 0) throw new Error(`ffmpeg split failed: ${res.stderr || res.error?.message}`);
      });
    }
  }

  const timing = {};
  for (const s of allSentences) {
    const relWav = `audio/${s.key}.wav`;
    const wavPath = join(projectDir, relWav);
    const subPath = join(audioDir, `${s.key}.vtt`);
    const hash = sentenceHash(s.spoken, voice);
    const prev = existing[s.key];

    if (voice.provider === 'import') {
      if (!existsSync(wavPath)) {
        const alt = ['.mp3', '.m4a', '.aiff', '.flac'].map((e) => join(audioDir, `${s.key}${e}`)).find((p) => existsSync(p));
        if (!alt) throw new Error(`missing imported audio file for ${s.key} (${relWav})`);
        normalizeToWav(alt, wavPath, { ffmpeg });
      }
    } else if (voice.provider === 'undecided') {
      if (!existsSync(wavPath)) {
        throw new Error(`voice.provider is "undecided" and ${relWav} does not exist; configure voice.provider (e.g. "command" with edge-tts or macOS say, or "import")`);
      }
    } else if (!prev || prev.cache_key !== hash || !existsSync(wavPath)) {
      if (existsSync(subPath)) unlinkSync(subPath);
      if (voice.provider === 'command') {
        runCommandTts(voice, s.spoken, wavPath, subPath, { ffmpeg });
      } else if (voice.provider === 'openai-compatible') {
        const raw = join(audioDir, `${s.key}.raw.wav`);
        await runOpenAiTts(voice, s.spoken, raw);
        normalizeToWav(raw, wavPath, { ffmpeg });
        try { unlinkSync(raw); } catch { /* ignore */ }
      } else {
        throw new Error(`unsupported voice.provider: ${voice.provider}`);
      }
    } else if (prev && prev.cache_key === hash && existsSync(wavPath)) {
      timing[s.key] = prev;
      continue;
    }

    const rawBuf = readFileSync(wavPath);
    const rawDecoded = readWavPcm(rawBuf);
    let wavBuf = rawBuf;
    let decoded = rawDecoded;
    // Trim dead leading/trailing silence on synthesized clips so punctuation-driven pauses stay crisp and natural
    let trimOffsetMs = 0;
    if (voice.provider !== 'import') {
      const [rawStart] = detectSpeechBounds(rawDecoded.samples, rawDecoded.sampleRate, -42);
      const trimmed = trimSilenceWithFade(rawDecoded.samples, rawDecoded.sampleRate, { thresholdDb: -42, padMs: 35, fadeMs: 20 });
      if (trimmed.length < rawDecoded.samples.length - 480) {
        trimOffsetMs = Math.max(0, rawStart - 35);
        const i16 = new Int16Array(trimmed.length);
        for (let k = 0; k < trimmed.length; k += 1) i16[k] = Math.max(-32768, Math.min(32767, Math.round(trimmed[k] * 32767)));
        wavBuf = makeWavBuffer(i16, rawDecoded.sampleRate);
        writeFileSync(wavPath, wavBuf);
        decoded = readWavPcm(wavBuf);
      }
    }
    const speech = detectSpeechBounds(decoded.samples, decoded.sampleRate);
    let words = [];
    let source = 'estimate';
    const subCandidate = [subPath, join(audioDir, `${s.key}.srt`)].find((p) => existsSync(p));
    if (subCandidate) {
      const parsed = parseSubtitles(readFileSync(subCandidate, 'utf8')).map((w) => ({
        ...w,
        start_ms: Math.max(0, w.start_ms - trimOffsetMs),
        end_ms: Math.min(decoded.durationMs, Math.max(1, w.end_ms - trimOffsetMs)),
      }));
      if (parsed.length > 1) {
        words = parsed;
        source = 'provider';
      } else if (parsed.length === 1) {
        // edge-tts v7 emits one sentence-level cue: subdivide its exact speech span into weighted words
        words = estimateWords(s.text, parsed[0].start_ms, Math.max(parsed[0].start_ms + 50, parsed[0].end_ms));
        source = 'provider';
      }
    }
    if (!words.length) {
      words = estimateWords(s.text, speech[0], speech[1]);
    }
    const sha256 = createHash('sha256').update(wavBuf).digest('hex');
    timing[s.key] = {
      file: relWav,
      duration_ms: decoded.durationMs,
      speech,
      source,
      words,
      sha256,
      cache_key: hash,
    };
  }

  writeFileSync(timingFile, `${JSON.stringify(timing, null, 2)}\n`);
  return timing;
}

/** Convenience preset command templates for local TTS tools. */
export const LOCAL_TTS_PRESETS = {
  'edge-tts': 'edge-tts --voice {voice} --rate={rate} --text {text} --write-media {out} --write-subtitles {sub}',
  'uvx-edge-tts': 'uvx --from edge-tts edge-tts --voice {voice} --rate={rate} --text {text} --write-media {out} --write-subtitles {sub}',
  'macos-say': 'say -v Tingting -o {out} {text}',
};
