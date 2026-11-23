// Director DSL → aligned Storyboard → frozen CompiledTimeline (T07, design §4 and §6 migration).
// Shots start at a section, word or cue edge; each cut is quantized once and shared by the shots on both sides.
// Visual cues fire at a fixed local frame or at a word/cue edge plus an offset, compiled to one local integer.
import { assetByMeta, getAsset, preflightShots, readAsset, registerAsset } from './assets.ts';
import { latest, replayed, save } from './content.ts';
import { type Envelope, advance } from './orchestrator.ts';
import { type Issue, type Outcome, newId, openStore, precheck, requestHash, summary, transaction } from './project-store.ts';
import { FPS, RATE, SAMPLES_PER_FRAME, toFrame, totalFrames } from './timebase.ts';

const MEDIA = { width: 1920, height: 1080, fps: FPS, sample_rate_hz: RATE };

type Anchor = { section_id?: string; word_id?: string; cue_id?: string; edge?: 'start' | 'end' };
type Trigger = Anchor & { local_frame?: number; offset_frames?: number };
interface Chapter { chapter_id: string; title: string; section_ids: string[]; continuity_in: string; continuity_out: string }
interface DirectorShot {
  shot_id: string; chapter_id: string; section_id: string; start?: Anchor; purpose: string; camera: string; zoom?: number;
  scene_ref: string; scene_layers: string[]; character_actions: any[]; audio_anchors: string[];
  visual_cues: { target_ref: string; element_id: string; operation: string; at: Trigger }[]; depends_on?: string[];
}
export interface StoryboardRequest extends Envelope { alignment_version: number; chapters: Chapter[]; shots: DirectorShot[] }

// Alignment and audio of one revision, indexed for anchor lookup.
function timing(alignment: any, audio: any) {
  return {
    tokens: new Map<string, any>(alignment.tokens.map((t: any) => [t.word_id, t])),
    cues: new Map<string, string[]>(alignment.cue_map.map((c: any) => [c.cue_id, c.word_ids])),
    sections: new Map<string, any>(audio.segments.map((s: any) => [s.section_id, s])),
  };
}

// Exactly one of section_id / word_id / cue_id (or local_frame for cues) → master sample and owning section.
function locate(t: ReturnType<typeof timing>, at: Trigger | undefined, allowLocal: boolean):
  { sample: number; section_id: string } | { local: number } | Issue {
  const keys = (['section_id', 'word_id', 'cue_id', ...(allowLocal ? ['local_frame'] : [])] as const).filter((key) => (at as any)?.[key] !== undefined);
  const edge = at?.edge ?? 'start';
  if (keys.length !== 1 || (edge !== 'start' && edge !== 'end')) return { code: allowLocal ? 'CUE_TRIGGER_INVALID' : 'ANCHOR_INVALID', keys: keys.join(',') };
  if (at!.local_frame !== undefined) return { local: at!.local_frame };
  if (at!.section_id !== undefined) {
    const segment = t.sections.get(at!.section_id);
    return segment ? { sample: edge === 'end' ? segment.end_sample : segment.start_sample, section_id: at!.section_id } : { code: 'SECTION_UNKNOWN', section_id: at!.section_id };
  }
  const ids = at!.word_id !== undefined ? [at!.word_id] : t.cues.get(at!.cue_id!);
  if (!ids) return { code: 'CUE_UNKNOWN', cue_id: at!.cue_id };
  const missing = ids.find((id) => !t.tokens.has(id));
  if (missing) return { code: 'CUE_WORD_UNKNOWN', word_id: missing };
  const word = edge === 'end' ? t.tokens.get(ids.at(-1)!) : t.tokens.get(ids[0]);
  return { sample: edge === 'end' ? word.end_sample : word.start_sample, section_id: word.section_id };
}

// Each dependency cycle once, reported on its first shot in board order.
function cycles(shots: DirectorShot[]): Issue[] {
  const deps = new Map(shots.map((s) => [s.shot_id, s.depends_on ?? []]));
  const state = new Map<string, 'open' | 'done'>(), found: Issue[] = [], seen = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'open') {
      const cycle = path.slice(path.indexOf(id));
      const key = [...cycle].sort().join(',');
      if (!seen.has(key)) { seen.add(key); found.push({ code: 'DEPENDENCY_CYCLE', shot_id: cycle[0], field: 'depends_on', cycle }); }
      return;
    }
    state.set(id, 'open');
    for (const next of deps.get(id) ?? []) if (deps.has(next)) visit(next, [...path, id]);
    state.set(id, 'done');
  };
  for (const shot of shots) visit(shot.shot_id, []);
  return found;
}

export function saveStoryboard(project: string, request: StoryboardRequest): Outcome {
  return save(project, request, 'storyboard', 'storyboard_saved', (db, version) => {
    const id = request.project_id;
    const aligned = latest(db, id, 'alignment', request.alignment_version);
    if (!aligned) return { issues: [{ code: 'ALIGNMENT_MISSING', alignment_version: request.alignment_version }] };
    const audio = latest(db, id, 'audio', aligned.document.alignment.audio_version)!;
    const t = timing(aligned.document.alignment, audio.document);
    const issues: Issue[] = [];

    // Cuts: one per shot start plus the program end, each quantized once.
    const starts = request.shots.map((shot) => {
      if (shot.start === undefined) { issues.push({ code: 'TIMING_NOT_ALIGNED', shot_id: shot.shot_id, field: 'start' }); return 0; }
      const at = locate(t, shot.start, false);
      if ('code' in at) { issues.push({ ...at, shot_id: shot.shot_id, field: 'start' }); return 0; }
      return (at as { sample: number }).sample;
    });
    if (issues.length) return { issues };
    const duration = audio.document.duration_samples, total = totalFrames(duration);
    const cuts = [...starts, duration].map((sample, i) => ({ sample, frame: i === starts.length ? total : toFrame(sample),
      before: request.shots[i - 1]?.shot_id ?? null, after: request.shots[i]?.shot_id ?? null }));
    if (cuts[0].frame !== 0) issues.push({ code: 'SHOT_COVERAGE_INVALID', shot_id: request.shots[0].shot_id, field: 'start', start: cuts[0].frame });
    request.shots.forEach((shot, i) => {
      const start = cuts[i].frame, end = cuts[i + 1].frame;
      if (end <= start) issues.push({ code: 'SHOT_LENGTH_INVALID', shot_id: shot.shot_id, field: 'frame_range', start, end });
    });
    if (issues.length) return { issues };

    const chapters = new Map(request.chapters.map((c) => [c.chapter_id, c]));
    const ids = new Set(request.shots.map((s) => s.shot_id));
    const shots = request.shots.map((shot, i) => {
      const start = cuts[i].frame, end = cuts[i + 1].frame, length = end - start;
      const fail = (field: string, issue: Issue) => issues.push({ ...issue, shot_id: shot.shot_id, field });
      if (!chapters.get(shot.chapter_id)?.section_ids.includes(shot.section_id)) fail('section_id', { code: 'SHOT_SECTION_MISMATCH', chapter_id: shot.chapter_id, section_id: shot.section_id });
      const asset = getAsset(db, shot.scene_ref);
      const bytes = asset && readAsset(project, asset);
      const layers = new Map<string, any>(bytes ? JSON.parse(bytes.toString('utf8')).layers.map((l: any) => [l.asset_ref, l]) : []);
      if (!bytes) fail('scene_ref', { code: 'ASSET_NOT_FOUND', asset_ref: shot.scene_ref });
      for (const layer of shot.scene_layers) if (bytes && !layers.has(layer)) fail('scene_layers', { code: 'LAYER_NOT_IN_SCENE', asset_ref: layer, scene_ref: shot.scene_ref });
      for (const cueId of shot.audio_anchors) {
        const at = locate(t, { cue_id: cueId }, false);
        if ('code' in at) fail('audio_anchors', at);
        else if ((at as any).section_id !== shot.section_id) fail('audio_anchors', { code: 'CUE_CROSS_SECTION', cue_id: cueId, section_id: (at as any).section_id });
      }
      const visual_cues = shot.visual_cues.map((cue, k) => {
        const field = `visual_cues[${k}].at`;
        if (bytes && (!shot.scene_layers.includes(cue.target_ref) || !(layers.get(cue.target_ref)?.element_ids ?? []).includes(cue.element_id))) {
          fail(`visual_cues[${k}].element_id`, { code: 'ELEMENT_UNKNOWN', asset_ref: cue.target_ref, element_id: cue.element_id });
        }
        const at = locate(t, cue.at, true);
        let local: number;
        if ('code' in at) { fail(field, at); return undefined; }
        if ('local' in at) local = at.local;
        else if (at.section_id !== shot.section_id) { fail(field, { code: 'CUE_CROSS_SECTION', section_id: at.section_id }); return undefined; }
        else local = toFrame(at.sample) - start + (cue.at.offset_frames ?? 0);
        if (!Number.isInteger(local) || local < 0 || local >= length) { fail(field, { code: 'CUE_OUT_OF_RANGE', local_frame: local, local_frames: length }); return undefined; }
        return { target_ref: cue.target_ref, element_id: cue.element_id, operation: cue.operation, at_local_frame: local };
      });
      for (const dep of shot.depends_on ?? []) if (!ids.has(dep)) fail('depends_on', { code: 'SHOT_UNKNOWN', depends_on: dep });
      return { shot_id: shot.shot_id, chapter_id: shot.chapter_id, section_id: shot.section_id, frame_range: { start, end }, purpose: shot.purpose,
        camera: shot.camera, scene_ref: shot.scene_ref, scene_layers: shot.scene_layers, character_actions: shot.character_actions,
        audio_anchors: shot.audio_anchors, approval: 'pending', visual_cues };
    });
    issues.push(...cycles(request.shots));
    // A chapter covers one consecutive run of shots.
    const frozenChapters = request.chapters.map((chapter) => {
      const own = shots.map((s, i) => [s, i] as const).filter(([s]) => s.chapter_id === chapter.chapter_id);
      if (!own.length || own.at(-1)![1] - own[0][1] !== own.length - 1) issues.push({ code: 'CHAPTER_COVERAGE_INVALID', chapter_id: chapter.chapter_id, field: 'shots' });
      return { ...chapter, frame_range: { start: own[0]?.[0].frame_range.start ?? 0, end: own.at(-1)?.[0].frame_range.end ?? 0 } };
    }).sort((a, b) => a.frame_range.start - b.frame_range.start);
    if (issues.length) return { issues };

    const { project_id: _p, expected_version: _v, idempotency_key: _k, ...dsl } = request;
    return { document: {
      storyboard: { project_id: id, version, script_version: aligned.document.alignment.script_version, timing_basis: 'aligned', media: MEDIA, total_frames: total,
        chapters: frozenChapters, shots },
      dsl, alignment_version: aligned.version, audio_version: audio.version, cuts, padding_samples: total * SAMPLES_PER_FRAME - duration,
      dependencies: request.shots.filter((s) => s.depends_on?.length).map((s) => ({ shot_id: s.shot_id, depends_on: s.depends_on })),
    } };
  });
}

// A stored planned board (fixed frames) read as a timeline: coverage and cue bounds only, never production.
function readPlanned(board: any): Outcome {
  const issues: Issue[] = [];
  let cursor = 0;
  const shots = board.shots.map((shot: any) => {
    const { start, end } = shot.frame_range;
    if (start !== cursor || end <= start) issues.push({ code: 'SHOT_COVERAGE_INVALID', shot_id: shot.shot_id, field: 'frame_range', start });
    cursor = end;
    shot.visual_cues.forEach((cue: any, k: number) => {
      if (cue.at_local_frame >= end - start) issues.push({ code: 'CUE_OUT_OF_RANGE', shot_id: shot.shot_id, field: `visual_cues[${k}].at_local_frame`, local_frame: cue.at_local_frame, local_frames: end - start });
    });
    return { shot_id: shot.shot_id, chapter_id: shot.chapter_id, absolute_range: { start, end }, local_frames: end - start, layer_refs: shot.scene_layers,
      camera: shot.camera, visual_cues: shot.visual_cues };
  });
  if (cursor !== board.total_frames) issues.push({ code: 'SHOT_COVERAGE_INVALID', shot_id: board.shots.at(-1)?.shot_id, field: 'frame_range', start: cursor });
  return { report: { status: issues.length ? 'REJECTED' : 'PLANNED', project_id: board.project_id, production: false, timing_basis: board.timing_basis,
    total_frames: board.total_frames, shots, issues }, exitCode: issues.length ? 1 : 0 };
}

// Production compilation: the stored aligned board, its alignment revision, and every pinned asset cleared.
export function compileOp(project: string, request: Envelope & { storyboard_version?: number; storyboard?: any }): Outcome {
  if (request.storyboard !== undefined) return readPlanned(request.storyboard);
  const db = openStore(project);
  return transaction(db, () => {
    const digest = requestHash(request);
    const pre = precheck(db, request, digest);
    if (pre.done) return replayed(db, pre.done);
    const id = request.project_id;
    const board = latest(db, id, 'storyboard', request.storyboard_version);
    if (!board) return summary(db, id, 'REJECTED', [{ code: 'STORYBOARD_MISSING', storyboard_version: request.storyboard_version ?? null }]);
    const current = latest(db, id, 'alignment')!;
    if (current.version !== board.document.alignment_version) {
      return summary(db, id, 'REJECTED', [{ code: 'ALIGNMENT_STALE', storyboard_version: board.version, alignment_version: board.document.alignment_version, latest_version: current.version }]);
    }
    const audio = latest(db, id, 'audio', board.document.audio_version)!;
    const shots = board.document.storyboard.shots;
    const dsl = new Map<string, DirectorShot>(board.document.dsl.shots.map((s: DirectorShot) => [s.shot_id, s]));
    const issues: Issue[] = shots.filter((s: any) => s.character_actions.length > 1)
      .map((s: any) => ({ code: 'CHARACTER_ACTIONS_LIMIT', shot_id: s.shot_id, field: 'character_actions', count: s.character_actions.length }));
    const checked = preflightShots(db, project, id, shots.map((s: any) => ({ shot_id: s.shot_id, scene_ref: s.scene_ref,
      camera: { zoom: dsl.get(s.shot_id)!.zoom ?? 1 }, ...(s.character_actions[0] && { character: s.character_actions[0] }) })));
    issues.push(...checked.issues);
    if (issues.length) return summary(db, id, 'REJECTED', issues);

    // Pin the exact alignment revision the cues were compiled from.
    const pinned = assetByMeta(db, id, 'alignment_hash', current.hash)
      ?? registerAsset(db, project, id, 'alignment', 'alignment', 'json', JSON.stringify(current.document.alignment, null, 2), { alignment_hash: current.hash, alignment_version: current.version });
    const master = getAsset(db, audio.document.master_ref)!;
    const pins = new Map(checked.resolved.map((r) => [r.shot_id, r.assets.map(({ asset_ref, sha256 }) => ({ asset_ref, sha256 }))]));
    const keys = new Map<string, string>();
    const cacheKey = (shot: any): string => {
      if (!keys.has(shot.shot_id)) {
        const inherited = (dsl.get(shot.shot_id)!.depends_on ?? []).map((dep) => cacheKey(shots.find((s: any) => s.shot_id === dep)));
        keys.set(shot.shot_id, requestHash({ shot, zoom: dsl.get(shot.shot_id)!.zoom ?? 1, assets: pins.get(shot.shot_id), audio: { asset_ref: master.asset_ref, sha256: master.sha256 },
          subtitles: current.document.srt_ref, inherited }));
      }
      return keys.get(shot.shot_id)!;
    };
    const version = (latest(db, id, 'timeline')?.version ?? 0) + 1;
    const timeline = {
      project_id: id, version, storyboard_version: board.version, media: MEDIA, total_frames: board.document.storyboard.total_frames,
      input_snapshot_hash: requestHash({ storyboard: board.hash, alignment: current.hash, audio: audio.hash, assets: [...pins] }),
      alignment_ref: pinned.asset_ref,
      shots: shots.map((s: any) => ({ shot_id: s.shot_id, chapter_id: s.chapter_id, absolute_range: s.frame_range, local_frames: s.frame_range.end - s.frame_range.start,
        layer_refs: s.scene_layers, character_plan_ref: null, audio_ref: master.asset_ref, cache_key: cacheKey(s), camera: s.camera, visual_cues: s.visual_cues,
        subtitle_ref: current.document.srt_ref })),
    };
    const document = { timeline, dependencies: board.document.dependencies, resolved: checked.resolved };
    const hash = requestHash(document);
    const resolvedStep = advance(db, request, 'assets_resolved', { artifact_hash: requestHash(checked.resolved) }, digest);
    if ('done' in resolvedStep) return resolvedStep.done;
    const compiledStep = advance(db, { ...request, expected_version: request.expected_version + 1, idempotency_key: `${request.idempotency_key}:compiled` },
      'snapshot_compiled', { artifact_hash: hash }, digest);
    // ASSET_READY always accepts snapshot_compiled; anything else must undo the first step too.
    if ('done' in compiledStep) throw new Error(`snapshot_compiled refused after assets_resolved: ${JSON.stringify(compiledStep.done.report.issues)}`);
    // Stored under the request's own event so a replay returns this document.
    db.prepare('INSERT INTO content (content_id, project_id, kind, version, hash, body, event_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId('cnt'), id, 'timeline', version, hash, JSON.stringify(document), resolvedStep.eventId, new Date().toISOString());
    return summary(db, id, 'APPLIED', [], { event_id: compiledStep.eventId, content_hash: hash, document, assets: [pinned] });
  });
}
