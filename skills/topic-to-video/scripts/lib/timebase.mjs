// Half-open frame intervals [start, end) from cumulative milliseconds (出片质量设计 §4.1, §8.1).
// Pure functions so shot durations never accumulate rounding drift across cuts.
import { splitSentences } from './captions.mjs';
import { DEFAULT_SENTENCE_GAP_MS } from './project.mjs';

export function samplesPerFrame(fps, sampleRate = 48000) {
  return Math.round(sampleRate / fps);
}

/**
 * Computes cumulative ms and contiguous [startFrame, endFrame) ranges for every shot and sentence.
 * @param {object} project
 * @param {Record<string, { file: string, duration_ms: number, speech?: number[], source?: string, words?: any[], sha256?: string }>} timing
 * @param {number} fps
 */
export function buildTimeline(project, timing, fps = project.settings?.fps ?? 60) {
  const gapMs = project.settings?.sentence_gap_ms ?? DEFAULT_SENTENCE_GAP_MS;
  const bySection = new Map(project.sections.map((s) => [s.id, splitSentences(s.text)]));
  let cursorMs = 0;
  let prevEndFrame = 0;
  const shots = [];

  for (const shot of project.shots) {
    const startMs = cursorMs;
    const sentences = bySection.get(shot.section) ?? [];
    const sentenceRanges = [];
    for (const idx of shot.sentences) {
      const key = `${shot.section}-${idx}`;
      const entry = timing[key];
      const text = sentences[idx] ?? '';
      const dur = entry?.duration_ms ?? Math.max(500, Math.round((text.length / 4) * 1000));
      const sStart = cursorMs;
      const sEnd = sStart + dur;
      sentenceRanges.push({
        index: idx,
        key,
        text,
        file: entry?.file,
        sha256: entry?.sha256,
        startMs: sStart,
        endMs: sEnd,
        durationMs: dur,
        speech: entry?.speech ?? [0, dur],
        source: entry?.source ?? 'estimate',
        words: entry?.words ?? [],
      });
      cursorMs = sEnd + gapMs;
    }
    const endMs = cursorMs;
    const startFrame = prevEndFrame;
    const endFrame = Math.max(startFrame + 1, Math.round((endMs * fps) / 1000));
    prevEndFrame = endFrame;
    shots.push({
      id: shot.id,
      section: shot.section,
      sentences: shot.sentences,
      startMs,
      endMs,
      durationMs: endMs - startMs,
      durationSec: (endFrame - startFrame) / fps,
      startFrame,
      endFrame,
      frameCount: endFrame - startFrame,
      sentenceRanges,
    });
  }

  return { fps, totalFrames: prevEndFrame, totalMs: cursorMs, gapMs, shots };
}
