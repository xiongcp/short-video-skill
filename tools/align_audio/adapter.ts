// align_audio, import mode: takes an external aligner's per-section word output (timestamps reset to zero at each
// chunk) and maps it onto the master timeline. No aligner runs here; the engine name and version are recorded.
import { normalize } from '../../runtime/content.ts';
import type { Issue } from '../../runtime/project-store.ts';

export const LOW_CONFIDENCE = 0.6;
export interface EngineWord { text: string; start_sample: number; end_sample: number; confidence: number }
export interface Correction { word_id: string; start_sample: number; end_sample: number; note?: string }
export interface Token { word_id: string; section_id: string; text: string; start_sample: number; end_sample: number; confidence: number; manually_corrected: boolean }

const wordId = (sectionId: string, index: number) => `${sectionId}-w${String(index + 1).padStart(3, '0')}`;

// segments: AudioManifest segments in master order; sections: ScriptDocument sections of the same script version.
export function alignSections(segments: any[], sections: any[], engine: { section_id: string; words: EngineWord[] }[], corrections: Correction[] = []) {
  const issues: Issue[] = [];
  const tokens: Token[] = [];
  for (const segment of segments) {
    const output = engine.find((item) => item.section_id === segment.section_id);
    const section = sections.find((item) => item.section_id === segment.section_id);
    if (!output) { issues.push({ code: 'ALIGNMENT_SECTION_MISSING', section_id: segment.section_id }); continue; }
    if (normalize(output.words.map((word) => word.text).join('')) !== normalize(section.narration)) {
      issues.push({ code: 'ALIGNMENT_TEXT_MISMATCH', section_id: segment.section_id }); continue;
    }
    output.words.forEach((word, i) => tokens.push({ word_id: wordId(segment.section_id, i), section_id: segment.section_id, text: word.text,
      start_sample: segment.start_sample + word.start_sample, end_sample: segment.start_sample + word.end_sample, confidence: word.confidence, manually_corrected: false }));
  }
  const applied = corrections.flatMap((correction) => {
    const token = tokens.find((item) => item.word_id === correction.word_id);
    if (!token) { issues.push({ code: 'WORD_UNKNOWN', word_id: correction.word_id }); return []; }
    const from = { start_sample: token.start_sample, end_sample: token.end_sample };
    Object.assign(token, { start_sample: correction.start_sample, end_sample: correction.end_sample, manually_corrected: true });
    return [{ word_id: token.word_id, from, to: { start_sample: correction.start_sample, end_sample: correction.end_sample }, origin: 'manual', note: correction.note ?? '' }];
  });
  // Words stay inside their section's audio, in order and without overlap.
  tokens.forEach((token, i) => {
    const segment = segments.find((item) => item.section_id === token.section_id);
    const previous = tokens[i - 1]?.section_id === token.section_id ? tokens[i - 1] : undefined;
    if (token.start_sample < (previous?.end_sample ?? segment.start_sample) || token.end_sample <= token.start_sample || token.end_sample > segment.end_sample) {
      issues.push({ code: 'ALIGNMENT_RANGE_INVALID', word_id: token.word_id, start_sample: token.start_sample, end_sample: token.end_sample });
    }
  });
  for (const token of tokens) {
    if (token.confidence < LOW_CONFIDENCE && !token.manually_corrected) {
      issues.push({ code: 'ALIGNMENT_LOW_CONFIDENCE', word_id: token.word_id, confidence: token.confidence, start_sample: token.start_sample, end_sample: token.end_sample });
    }
  }
  // Each cue takes the next whole-word run matching its text, so repeated terms resolve to distinct word IDs.
  const cue_map: { cue_id: string; word_ids: string[] }[] = [];
  for (const section of sections) {
    const own = tokens.filter((token) => token.section_id === section.section_id);
    let cursor = 0;
    for (const cue of section.cues) {
      const target = normalize(cue.text);
      let match: string[] | undefined;
      for (let i = cursor; i < own.length && !match; i += 1) {
        let text = '';
        for (let j = i; j < own.length && text.length < target.length; j += 1) {
          text += normalize(own[j].text);
          if (text === target) { match = own.slice(i, j + 1).map((token) => token.word_id); cursor = i + 1; }
        }
      }
      if (match) cue_map.push({ cue_id: cue.cue_id, word_ids: match });
      else if (own.length) issues.push({ code: 'ALIGNMENT_CUE_UNRESOLVED', cue_id: cue.cue_id, section_id: section.section_id });
    }
  }
  return { tokens, cue_map, corrections: applied, issues };
}
