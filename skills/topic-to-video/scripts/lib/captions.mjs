// Sentence rules shared by the references, the example checks and (from P2) the renderer.
// A sentence ends at a run of 。！？!? plus any closing quotes or brackets right after it.
const SENTENCE = /[^。！？!?]+[。！？!?]+[」』”’）)]*|[^。！？!?]+$/g;

/** Splits narration into sentences; a trailing fragment without a terminator is kept. */
export function splitSentences(text) {
  return (text.match(SENTENCE) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Spoken characters: letters and digits, without punctuation or spaces. */
export function countChars(text) {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}
