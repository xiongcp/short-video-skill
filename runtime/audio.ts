// Section audio (imported or synthesized takes) → AudioManifest; aligner output → Alignment, with SubtitleTrack, SRT and
// viseme ranges derived from that same alignment revision. Shared boundaries use (sample + 800) // 1600 (design §4).
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { type AssetRow, assetByMeta, getAsset, readAsset, registerAsset, sha256 } from './assets.ts';
import { latest, normalize, save } from './content.ts';
import { getJob } from './jobs.ts';
import { readWav } from './preview.ts';
import { type Issue, type Outcome, getProject, openStore, summary } from './project-store.ts';
import type { Envelope } from './orchestrator.ts';
import { type Correction, type EngineWord, alignSections } from '../tools/align_audio/adapter.ts';
import { FPS, RATE, toFrame, totalFrames } from './timebase.ts';


function wavFile(channels: number, data: Buffer) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

interface Take { section_id: string; import?: { path: string; recordist: string; voice_ref: string }; job?: string }
export interface AudioRequest extends Envelope { sections: Take[] }

export function saveAudio(project: string, request: AudioRequest): Outcome {
  return save(project, request, 'audio', 'audio_verified', (db, version) => {
    const id = request.project_id;
    const script = latest(db, id, 'script')!;
    const expected = script.document.sections.map((s: any) => s.section_id);
    if (JSON.stringify(request.sections.map((s) => s.section_id)) !== JSON.stringify(expected)) {
      return { issues: [{ code: 'AUDIO_SECTIONS_MISMATCH', expected: expected.join(','), got: request.sections.map((s) => s.section_id).join(',') }] };
    }
    // Resolve and verify every take before anything is indexed.
    const issues: Issue[] = [];
    const takes = request.sections.map((take) => {
      const section = script.document.sections.find((s: any) => s.section_id === take.section_id);
      let bytes: Buffer | undefined, asset: AssetRow | undefined, ref = take.import?.path ?? take.job ?? '';
      if (take.import) {
        const file = resolve(project, take.import.path);
        if (!file.startsWith(resolve(project) + sep)) { issues.push({ code: 'AUDIO_PATH_INVALID', section_id: take.section_id, ref }); return undefined; }
        try { bytes = readFileSync(file); } catch { issues.push({ code: 'AUDIO_FORMAT', section_id: take.section_id, ref }); return undefined; }
      } else {
        const job = take.job ? getJob(db, id, take.job) : undefined;
        asset = job?.state === 'SUCCEEDED' ? assetByMeta(db, id, 'job_id', job.job_id) : undefined;
        if (!asset) { issues.push({ code: 'AUDIO_TAKE_MISSING', section_id: take.section_id, ref }); return undefined; }
        bytes = readAsset(project, asset);
        if (!bytes) { issues.push({ code: 'ASSET_HASH_MISMATCH', section_id: take.section_id, ref: asset.asset_ref }); return undefined; }
        if (asset.meta.text_hash !== sha256(section.narration)) { issues.push({ code: 'AUDIO_TEXT_STALE', section_id: take.section_id, ref }); return undefined; }
      }
      const wav = readWav(bytes);
      if (!wav || wav.format !== 1 || wav.bits !== 16) { issues.push({ code: 'AUDIO_FORMAT', section_id: take.section_id, ref }); return undefined; }
      if (wav.rate !== RATE) { issues.push({ code: 'AUDIO_SAMPLE_RATE', section_id: take.section_id, ref, rate: wav.rate }); return undefined; }
      return { take, section, bytes, asset, wav };
    });
    if (issues.length) return { issues };
    const channels = takes[0]!.wav.channels;
    const odd = takes.find((t) => t!.wav.channels !== channels);
    if (odd) return { issues: [{ code: 'AUDIO_CHANNELS_MISMATCH', section_id: odd.take.section_id, channels: odd.wav.channels, expected: channels }] };

    const assets: AssetRow[] = [];
    let cursor = 0;
    const segments = takes.map((t) => {
      const { take, section, bytes, wav } = t!;
      const samples = wav.data.length / (wav.channels * 2);
      const voice = take.import
        ? registerAsset(db, project, id, `take-${take.section_id}`, 'voice-take', 'wav', bytes,
          { section_id: take.section_id, origin: 'import', recordist: take.import.recordist, voice_ref: take.import.voice_ref, text_hash: sha256(section.narration), script_version: script.version })
        : t!.asset!;
      const meta = voice.meta;
      const settings = registerAsset(db, project, id, `settings-${take.section_id}`, 'voice-settings', 'json', JSON.stringify(take.import
        ? { origin: 'import', recordist: meta.recordist, source_path: take.import.path, source_sha256: voice.sha256, channels, samples, text_hash: meta.text_hash, script_version: script.version }
        : { origin: 'tts', provider: meta.provider, job_id: meta.job_id, voice_ref: meta.voice_ref, pronunciation_hash: meta.pronunciation_hash, text_hash: meta.text_hash, script_version: meta.script_version, channels, samples }, null, 2), {});
      assets.push(voice, settings);
      const segment = { section_id: take.section_id, audio_ref: voice.asset_ref, start_sample: cursor, end_sample: cursor + samples, voice_ref: meta.voice_ref,
        origin: meta.origin, provider_or_recordist: meta.origin === 'import' ? meta.recordist : meta.provider, settings_ref: settings.asset_ref };
      cursor += samples;
      return segment;
    });
    const master = registerAsset(db, project, id, 'voice-master', 'voice-master', 'wav', wavFile(channels, Buffer.concat(takes.map((t) => t!.wav.data))), { audio_version: version });
    assets.push(master);
    const planned = script.document.sections.reduce((sum: number, s: any) => sum + s.duration_estimate_frames, 0);
    return {
      document: { project_id: id, version, script_version: script.version, master_ref: master.asset_ref, sample_rate_hz: RATE, duration_samples: cursor, segments },
      extra: { assets, measured_frames: totalFrames(cursor), planned_frames: planned, difference_frames: totalFrames(cursor) - planned },
    };
  });
}
const VISEMES = new Set(['closed', 'rounded', 'open', 'rest']);
const SENTENCE_END = /[。！？；!?;]/;

function srtTime(frame: number) {
  const ms = Math.round((frame * 1000) / FPS);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

// One subtitle line per sentence: its words are those whose text starts inside the sentence.
function subtitleCues(sections: any[], tokens: any[], cueMap: { cue_id: string; word_ids: string[] }[]) {
  return sections.flatMap((section) => {
    const own = tokens.filter((token) => token.section_id === section.section_id);
    let offset = 0;
    const starts = own.map((token) => { const at = offset; offset += normalize(token.text).length; return at; });
    const sentences: string[] = [];
    let current = '';
    for (const char of section.narration) { current += char; if (SENTENCE_END.test(char)) { sentences.push(current.trim()); current = ''; } }
    if (current.trim()) sentences.push(current.trim());
    let consumed = 0;
    return sentences.flatMap((text) => {
      const from = consumed, to = (consumed += normalize(text).length);
      const words = own.filter((_, i) => starts[i] >= from && starts[i] < to);
      if (!words.length) return [];
      const ids = new Set(words.map((word) => word.word_id));
      return [{ section_id: section.section_id, cue_ids: cueMap.filter((cue) => cue.word_ids.every((w) => ids.has(w))).map((cue) => cue.cue_id),
        range: { start: toFrame(words[0].start_sample), end: Math.max(toFrame(words.at(-1).end_sample), toFrame(words[0].start_sample) + 1) }, text }];
    });
  });
}

// Contiguous ranges over [0, total): each word's shape, 'rest' in gaps. Words that round to zero frames keep their
// anchors in the alignment and yield the frame to the neighbour.
function visemeRanges(tokens: any[], marks: Map<string, string>, total: number) {
  const ranges: ({ word_id: string; shape: string; range: { start: number; end: number } } | { shape: 'rest'; range: { start: number; end: number } })[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const start = Math.max(toFrame(token.start_sample), cursor), end = toFrame(token.end_sample);
    if (start > cursor) ranges.push({ shape: 'rest', range: { start: cursor, end: start } });
    if (end > start) { ranges.push({ word_id: token.word_id, shape: marks.get(token.word_id) ?? 'open', range: { start, end } }); cursor = end; }
    else cursor = Math.max(cursor, start);
  }
  if (cursor < total) ranges.push({ shape: 'rest', range: { start: cursor, end: total } });
  return ranges;
}

export interface AlignRequest extends Envelope {
  audio_version: number; engine: { name: string; version: string }; sections: { section_id: string; words: EngineWord[] }[];
  corrections?: Correction[]; marks?: { word_id: string; viseme: string }[]; subtitle_style_ref: string;
}

export function saveAlignment(project: string, request: AlignRequest): Outcome {
  return save(project, request, 'alignment', 'alignment_verified', (db, version) => {
    const id = request.project_id;
    const audio = latest(db, id, 'audio');
    if (!audio || audio.version !== request.audio_version) return { issues: [{ code: 'AUDIO_VERSION_STALE', requested: request.audio_version, current: audio?.version ?? 0 }] };
    const script = latest(db, id, 'script', audio.document.script_version)!;
    const aligned = alignSections(audio.document.segments, script.document.sections, request.sections, request.corrections);
    const marks = new Map((request.marks ?? []).map((mark) => [mark.word_id, mark.viseme]));
    for (const [wordId, shape] of marks) {
      if (!aligned.tokens.some((token) => token.word_id === wordId)) aligned.issues.push({ code: 'WORD_UNKNOWN', word_id: wordId });
      else if (!VISEMES.has(shape)) aligned.issues.push({ code: 'VISEME_SHAPE_INVALID', word_id: wordId, shape });
    }
    if (aligned.issues.length) return { issues: aligned.issues };
    const common = { project_id: id, version, script_version: script.version };
    const alignment = { ...common, audio_version: audio.version, sample_rate_hz: RATE, tokens: aligned.tokens, cue_map: aligned.cue_map };
    const subtitles = { ...common, alignment_version: version, style_ref: request.subtitle_style_ref, cues: subtitleCues(script.document.sections, aligned.tokens, aligned.cue_map) };
    const total = totalFrames(audio.document.duration_samples);
    const srt = subtitles.cues.map((cue, i) => `${i + 1}\n${srtTime(cue.range.start)} --> ${srtTime(cue.range.end)}\n${cue.text}\n`).join('\n');
    const srtAsset = registerAsset(db, project, id, 'subtitles-srt', 'subtitles', 'srt', srt, { alignment_version: version });
    return {
      document: { alignment, subtitles, visemes: { project_id: id, alignment_version: version, fps: FPS, total_frames: total, ranges: visemeRanges(aligned.tokens, marks, total) },
        corrections: aligned.corrections, engine: request.engine, srt_ref: srtAsset.asset_ref },
      extra: { srt, assets: [srtAsset] },
    };
  });
}

// Nearest-rank percentile on sorted values: rank ceil(p * n).
const rank = (sorted: number[], p: number) => sorted[Math.ceil(p * sorted.length) - 1];
const median = (sorted: number[]) => sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
const stats = (errors: number[]) => { const sorted = [...errors].sort((a, b) => a - b); return { n: sorted.length, median_ms: median(sorted), p95_ms: rank(sorted, 0.95) }; };
export const INITIAL_GOAL = { median_ms: 80, p95_ms: 150 };
const MIN_ANCHORS = 100;

// Absolute offsets between hand-labeled boundaries and the alignment; the owner records the calibration decision.
export function calibrate(project: string, request: { project_id: string; alignment_version: number;
  anchors: { word_id: string; boundary: 'start' | 'end'; labeled_sample: number; subset?: string }[] }): Outcome {
  const db = openStore(project);
  const reject = (issues: Issue[]) => summary(db, request.project_id, 'REJECTED', issues);
  if (!getProject(db, request.project_id)) return reject([{ code: 'PROJECT_NOT_FOUND', ref: request.project_id }]);
  const saved = latest(db, request.project_id, 'alignment', request.alignment_version);
  if (!saved) return reject([{ code: 'AUDIO_VERSION_STALE', requested: request.alignment_version, current: latest(db, request.project_id, 'alignment')?.version ?? 0 }]);
  if (request.anchors.length < MIN_ANCHORS) return reject([{ code: 'CALIBRATION_ANCHORS_INSUFFICIENT', n: request.anchors.length, required: MIN_ANCHORS }]);
  const tokens = new Map(saved.document.alignment.tokens.map((token: any) => [token.word_id, token]));
  const unknown = request.anchors.filter((anchor) => !tokens.has(anchor.word_id));
  if (unknown.length) return reject(unknown.map((anchor) => ({ code: 'WORD_UNKNOWN', word_id: anchor.word_id })));
  const errors = request.anchors.map((anchor) => {
    const token: any = tokens.get(anchor.word_id);
    return Math.abs((anchor.boundary === 'end' ? token.end_sample : token.start_sample) - anchor.labeled_sample) / (RATE / 1000);
  });
  const subsets: Record<string, ReturnType<typeof stats>> = {};
  for (const label of new Set(request.anchors.map((anchor) => anchor.subset).filter(Boolean) as string[])) {
    subsets[label] = stats(errors.filter((_, i) => request.anchors[i].subset === label));
  }
  const overall = stats(errors);
  return summary(db, request.project_id, 'MEASURED', [], { alignment_version: saved.version, alignment_hash: saved.hash, ...overall, subsets,
    initial_goal: INITIAL_GOAL, within_initial_goal: overall.median_ms <= INITIAL_GOAL.median_ms && overall.p95_ms <= INITIAL_GOAL.p95_ms, decision: null });
}
