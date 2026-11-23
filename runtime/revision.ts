// Targeted revision planning (ChangePlan) and orchestrator application (T09, skills/revision-planner, design §6).
// Supports caption recoloring, single-shot expression/action edits, and section audio/narration timing changes
// while preserving prior versions, approvals, and content-addressed caches for unaffected shots.
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { alignSections } from '../tools/align_audio/adapter.ts';
import { parseColor } from '../tools/render_shot/adapter.ts';
import { type AssetRow, assetByMeta, getAsset, readAsset, registerAsset, sha256 } from './assets.ts';
import { srtTime, subtitleCues, visemeRanges, wavFile } from './audio.ts';
import { type PlanShot, validateAndSavePlan } from './baker.ts';
import { buildStoryboard, compileBoard, localSubtitleSlices } from './compiler.ts';
import { latest } from './content.ts';
import { getJob } from './jobs.ts';
import { currentBudget } from './ledger.ts';
import { readWav } from './preview.ts';
import { type Db, type Issue, type Outcome, appendEvent, getProject, newId, openStore, precheck, requestHash, summary, transaction } from './project-store.ts';
import { FPS, RATE, totalFrames } from './timebase.ts';

export interface RevisionPatch {
  target_id: string;
  field: string;
  new_value: any;
  reason: string;
  quote_minor?: number;
}
export interface ReviseRequest {
  project_id: string;
  expected_version?: number;
  idempotency_key?: string;
  request_text: string;
  base_snapshot_hash: string;
  apply?: boolean;
  patches: RevisionPatch[];
}

const uniq = (items: string[]) => [...new Set(items)];
const GATE_ORDER = ['G1', 'G2', 'G3', 'G4', 'G5'];

// Transitive explicit dependents of `seedIds` in the compiled dependency graph.
function transitiveDependents(dependencies: { shot_id: string; depends_on: string[] }[], seedIds: string[]): string[] {
  const found = new Set<string>(seedIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of dependencies) {
      if (!found.has(edge.shot_id) && edge.depends_on.some((d) => found.has(d))) {
        found.add(edge.shot_id);
        grew = true;
      }
    }
  }
  return [...found].filter((id) => !seedIds.includes(id));
}

function actionFieldOf(field: string): 'expression' | 'angle' | 'gesture' | null {
  const m = /^(?:character_actions\[0\]\.)?(expression|angle|gesture)$/.exec(field);
  return m ? (m[1] as 'expression' | 'angle' | 'gesture') : null;
}

function nextPlanVersion(db: Db, projectId: string) {
  return Number((db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS n FROM change_plans WHERE project_id = ?').get(projectId) as { n: number }).n);
}

function insertContent(db: Db, projectId: string, kind: string, version: number, doc: any, eventId: string) {
  const hash = requestHash(doc);
  db.prepare('INSERT INTO content (content_id, project_id, kind, version, hash, body, event_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(newId('cnt'), projectId, kind, version, hash, JSON.stringify(doc), eventId, new Date().toISOString());
  return { version, hash, document: doc };
}

class AbortRevision extends Error {
  issues: Issue[];
  constructor(issues: Issue[]) { super('revision aborted'); this.issues = issues; }
}

export function reviseOp(project: string, request: ReviseRequest): Outcome {
  const db = openStore(project);
  try {
    return transaction(db, () => {
    const id = request.project_id;
    const reject = (issues: Issue[]): never => { throw new AbortRevision(issues); };
    const current = getProject(db, id);
    if (!current) return reject([{ code: 'PROJECT_NOT_FOUND', ref: id }]);

    // If apply=true, run optimistic version & idempotency replay precheck first.
    const digest = requestHash(request);
    if (request.apply) {
      if (!request.idempotency_key || !Number.isInteger(request.expected_version)) {
        return reject([{ code: 'REVISION_PATCH_INVALID', detail: 'apply requires expected_version and idempotency_key' }]);
      }
      const pre = precheck(db, { project_id: id, expected_version: request.expected_version!, idempotency_key: request.idempotency_key }, digest);
      if (pre.done) {
        if (pre.done.report.status === 'REPLAYED') {
          const tl = latest(db, id, 'timeline')!;
          const sb = latest(db, id, 'storyboard')!;
          const cpRow = db.prepare('SELECT request_body, plan_body FROM change_plans WHERE project_id = ? ORDER BY version DESC LIMIT 1')
            .get(id) as { request_body: string; plan_body: string } | undefined;
          const planRow = db.prepare(`SELECT asset_ref FROM assets WHERE project_id = ? AND kind = 'character-plan' AND json_extract(meta, '$.timeline_version') = ? ORDER BY version DESC LIMIT 1`)
            .get(id, tl.version) as { asset_ref: string } | undefined;
          return { ...pre.done, report: { ...pre.done.report, timeline: tl.document.timeline, storyboard: sb.document.storyboard,
            plan_ref: planRow?.asset_ref ?? null, revision_request: cpRow && JSON.parse(cpRow.request_body), change_plan: cpRow && JSON.parse(cpRow.plan_body) } };
        }
        return pre.done;
      }
    }

    const timelineRow = latest(db, id, 'timeline');
    if (!timelineRow) return reject([{ code: 'TIMELINE_MISSING', timeline_version: null }]);
    const timelineDoc = timelineRow.document;
    const timeline = timelineDoc.timeline;
    if (request.base_snapshot_hash !== timeline.input_snapshot_hash) {
      return reject([{ code: 'SNAPSHOT_STALE', base_snapshot_hash: request.base_snapshot_hash, current_snapshot_hash: timeline.input_snapshot_hash }]);
    }
    if (!Array.isArray(request.patches) || !request.patches.length) {
      return reject([{ code: 'REVISION_PATCH_INVALID', detail: 'patches must be a non-empty array' }]);
    }

    const boardRow = latest(db, id, 'storyboard', timeline.storyboard_version)!;
    const storyboard = boardRow.document.storyboard;
    const alignRow = latest(db, id, 'alignment', boardRow.document.alignment_version)!;
    const audioRow = latest(db, id, 'audio', boardRow.document.audio_version)!;
    const scriptRow = latest(db, id, 'script', audioRow.document.script_version)!;
    const allShotIds: string[] = timeline.shots.map((s: any) => s.shot_id);
    const allChapterIds: string[] = storyboard.chapters.map((c: any) => c.chapter_id);
    const allSectionIds: string[] = scriptRow.document.sections.map((s: any) => s.section_id);

    // 1. Analyze every patch to compute minimal invalidation, reuse, gates and validation errors.
    const issues: Issue[] = [];
    const inv = new Set<string>();
    const gates = new Set<string>();
    let estMinor = 0;
    let subtitleChanged = false, exprChanged = false, audioChanged = false, evidenceChanged = false;

    for (const p of request.patches) {
      if (!p?.target_id || !p.field || !p.reason) {
        issues.push({ code: 'REVISION_PATCH_INVALID', detail: 'patch requires target_id, field and reason' });
        continue;
      }
      estMinor += Number.isInteger(p.quote_minor) && p.quote_minor! > 0 ? p.quote_minor! : 0;

      if (p.target_id === 'subtitle_style') {
        const color = typeof p.new_value === 'object' && p.new_value !== null && !Array.isArray(p.new_value) ? p.new_value.color : p.new_value;
        if (!parseColor(color)) { issues.push({ code: 'SUBTITLE_STYLE_INVALID', value: String(color) }); continue; }
        subtitleChanged = true;
        for (const s of timeline.shots) {
          if (localSubtitleSlices(alignRow.document.subtitles.cues, s.absolute_range.start, s.absolute_range.end).length > 0) {
            inv.add(s.shot_id);
            inv.add(s.chapter_id);
          }
        }
        inv.add('master');
        for (const g of ['G3', 'G4', 'G5']) gates.add(g);
      } else if (actionFieldOf(p.field)) {
        const field = actionFieldOf(p.field)!;
        const sbShot = storyboard.shots.find((s: any) => s.shot_id === p.target_id);
        if (!sbShot || !sbShot.character_actions.length) { issues.push({ code: 'REVISION_TARGET_UNKNOWN', target_id: p.target_id }); continue; }
        const charRef = sbShot.character_actions[0].character_ref;
        const profile = getAsset(db, charRef)?.meta.profile;
        const allowed = field === 'angle' ? profile?.supported_angles : field === 'expression' ? profile?.expressions : profile?.gestures;
        if (!allowed?.includes(p.new_value)) {
          issues.push(field === 'angle'
            ? { code: 'ANGLE_UNREGISTERED', shot_id: p.target_id, asset_ref: charRef, angle: p.new_value }
            : { code: 'ACTION_UNREGISTERED', shot_id: p.target_id, asset_ref: charRef, field, value: p.new_value });
          continue;
        }
        exprChanged = true;
        const deps = transitiveDependents(timelineDoc.dependencies, [p.target_id]);
        for (const sid of [p.target_id, ...deps]) {
          inv.add(sid);
          const s = timeline.shots.find((x: any) => x.shot_id === sid);
          if (s) inv.add(s.chapter_id);
        }
        inv.add('master');
        for (const g of ['G3', 'G4', 'G5']) gates.add(g);
      } else if (p.field === 'audio' || p.field === 'narration') {
        const sec = scriptRow.document.sections.find((s: any) => s.section_id === p.target_id);
        if (!sec) { issues.push({ code: 'SECTION_UNKNOWN', section_id: p.target_id }); continue; }
        audioChanged = true;
        inv.add(p.target_id);
        const ownerIdx = storyboard.chapters.findIndex((c: any) => c.section_ids.includes(p.target_id));
        const ownerCh = storyboard.chapters[ownerIdx];
        const ownerShots = timeline.shots.filter((s: any) => s.chapter_id === ownerCh.chapter_id).map((s: any) => s.shot_id);
        const deps = transitiveDependents(timelineDoc.dependencies, ownerShots);
        for (const sid of [...ownerShots, ...deps]) inv.add(sid);
        for (let i = ownerIdx; i < storyboard.chapters.length; i += 1) inv.add(storyboard.chapters[i].chapter_id);
        inv.add('master');
        for (const g of ['G2', 'G3', 'G4', 'G5']) gates.add(g);
      } else if (p.field === 'evidence') {
        evidenceChanged = true;
        inv.add(p.target_id);
        inv.add('master');
        for (const g of GATE_ORDER) gates.add(g);
      } else {
        issues.push({ code: 'REVISION_PATCH_INVALID', detail: `unsupported patch ${p.target_id}.${p.field}` });
      }
    }
    if (issues.length) return reject(issues);

    // Build reusable artifact list: upstream stages not touched + shots/chapters not invalidated.
    const reuseList: string[] = [];
    if (!evidenceChanged) reuseList.push('evidence');
    if (!evidenceChanged && !audioChanged) reuseList.push('script', 'audio', 'alignment');
    if (subtitleChanged && !exprChanged && !audioChanged) {
      for (const sid of allShotIds) reuseList.push(`bake_${sid}`);
    }
    for (const secId of allSectionIds) if (!inv.has(secId)) reuseList.push(secId);
    for (const chId of allChapterIds) if (!inv.has(chId)) reuseList.push(chId);
    for (const sid of allShotIds) if (!inv.has(sid)) reuseList.push(sid);

    const planVer = nextPlanVersion(db, id);
    const currency = currentBudget(db, id)?.currency ?? 'CNY';
    const revision_request = {
      project_id: id, version: planVer, request_text: request.request_text, base_snapshot_hash: request.base_snapshot_hash,
    };
    const change_plan = {
      project_id: id, version: planVer, base_snapshot_hash: request.base_snapshot_hash,
      patches: request.patches.map(({ target_id, field, new_value, reason }) => ({ target_id, field, new_value, reason })),
      invalidate: uniq([...inv]),
      reuse: uniq(reuseList.filter((x) => !inv.has(x))),
      reopen_gates: GATE_ORDER.filter((g) => gates.has(g)),
      estimated_cost: { currency, estimated_minor: estMinor, actual_minor: null },
    };
    const planId = newId('cplan');
    db.prepare(`INSERT INTO change_plans (plan_id, project_id, version, base_snapshot_hash, request_body, plan_body, applied_snapshot_hash, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`)
      .run(planId, id, planVer, request.base_snapshot_hash, JSON.stringify(revision_request), JSON.stringify(change_plan), new Date().toISOString());

    if (!request.apply) {
      return summary(db, id, 'PLANNED', [], { plan_id: planId, revision_request, change_plan });
    }

    // 2. Apply patches cleanly in the same transaction, producing new versions while preserving all old ones.
    let styleRef: string = timelineDoc.subtitle_style_ref ?? alignRow.document.subtitles.style_ref;
    let curScriptRow = scriptRow;
    let curAudioRow = audioRow;
    let curAlignRow = alignRow;
    let curBoardRow = boardRow;
    let dsl = JSON.parse(JSON.stringify(boardRow.document.dsl));
    let newScriptDoc: any = null, newAudioDoc: any = null, newAlignDoc: any = null;
    const exprEdits = new Map<string, { field: 'expression' | 'angle' | 'gesture'; value: string }[]>();

    for (const p of request.patches) {
      if (p.target_id === 'subtitle_style') {
        const prevAsset = getAsset(db, styleRef);
        const prevObj = prevAsset && readAsset(project, prevAsset) ? JSON.parse(readAsset(project, prevAsset)!.toString('utf8')) : {};
        const nextObj = typeof p.new_value === 'object' && p.new_value !== null && !Array.isArray(p.new_value)
          ? { ...prevObj, ...p.new_value } : { ...prevObj, color: p.new_value };
        const styleAsset = registerAsset(db, project, id, 'subtitle_style', 'subtitle-style', 'json', JSON.stringify(nextObj, null, 2),
          { derived_from: styleRef, style: nextObj });
        styleRef = styleAsset.asset_ref;
      } else if (actionFieldOf(p.field)) {
        const field = actionFieldOf(p.field)!;
        const shotDsl = dsl.shots.find((s: any) => s.shot_id === p.target_id);
        shotDsl.character_actions[0][field] = p.new_value;
        const list = exprEdits.get(p.target_id) ?? [];
        list.push({ field, value: p.new_value });
        exprEdits.set(p.target_id, list);
      } else if (p.field === 'audio' || p.field === 'narration') {
        const val = p.new_value ?? {};
        // Resolve the replacement section WAV (imported file or settled TTS job) and verify 16-bit 48 kHz PCM.
        let bytes: Buffer | undefined, ttsAsset: AssetRow | undefined;
        if (val.import) {
          const file = resolve(project, val.import.path);
          if (!file.startsWith(resolve(project) + sep)) return reject([{ code: 'AUDIO_PATH_INVALID', section_id: p.target_id, ref: val.import.path }]);
          try { bytes = readFileSync(file); } catch { return reject([{ code: 'AUDIO_FORMAT', section_id: p.target_id, ref: val.import.path }]); }
        } else if (val.job) {
          const job = getJob(db, id, val.job);
          ttsAsset = job?.state === 'SUCCEEDED' ? assetByMeta(db, id, 'job_id', job.job_id) : undefined;
          if (!ttsAsset) return reject([{ code: 'AUDIO_TAKE_MISSING', section_id: p.target_id, ref: val.job }]);
          bytes = readAsset(project, ttsAsset);
          if (!bytes) return reject([{ code: 'ASSET_HASH_MISMATCH', section_id: p.target_id, ref: ttsAsset.asset_ref }]);
        } else {
          return reject([{ code: 'REVISION_PATCH_INVALID', detail: 'section audio patch requires import or job' }]);
        }
        const wav = readWav(bytes);
        if (!wav || wav.format !== 1 || wav.bits !== 16) return reject([{ code: 'AUDIO_FORMAT', section_id: p.target_id, ref: val.import?.path ?? val.job }]);
        if (wav.rate !== RATE) return reject([{ code: 'AUDIO_SAMPLE_RATE', section_id: p.target_id, ref: val.import?.path ?? val.job, rate: wav.rate }]);
        const newSamples = wav.data.length / (wav.channels * 2);

        // Build new ScriptDocument (preserving section IDs) so G2 binds the new duration/text.
        const nextScriptVer = (latest(db, id, 'script')?.version ?? 0) + 1;
        const newSections = curScriptRow.document.sections.map((s: any) => s.section_id !== p.target_id ? s : {
          ...s, narration: val.narration ?? s.narration, duration_estimate_frames: totalFrames(newSamples),
        });
        newScriptDoc = { ...curScriptRow.document, version: nextScriptVer, sections: newSections };

        // Build new AudioManifest reusing existing registered take WAVs for every unchanged section!
        const nextAudioVer = (latest(db, id, 'audio')?.version ?? 0) + 1;
        const oldSegments: any[] = curAudioRow.document.segments;
        const oldSeg = oldSegments.find((s) => s.section_id === p.target_id)!;
        const oldSamples = oldSeg.end_sample - oldSeg.start_sample;
        const deltaSamples = newSamples - oldSamples;
        const pcmChunks: Buffer[] = [];
        let cursor = 0, expectedChannels: number | null = null;
        const newSegments = oldSegments.map((seg) => {
          if (seg.section_id !== p.target_id) {
            const existingAsset = getAsset(db, seg.audio_ref)!;
            const existingBytes = readAsset(project, existingAsset)!;
            const existingWav = readWav(existingBytes)!;
            expectedChannels ??= existingWav.channels;
            const count = existingWav.data.length / (existingWav.channels * 2);
            pcmChunks.push(existingWav.data);
            const nextSeg = { ...seg, start_sample: cursor, end_sample: cursor + count };
            cursor += count;
            return nextSeg;
          }
          if (expectedChannels !== null && wav.channels !== expectedChannels) {
            issues.push({ code: 'AUDIO_CHANNELS_MISMATCH', section_id: p.target_id, channels: wav.channels, expected: expectedChannels });
          }
          expectedChannels ??= wav.channels;
          const secObj = newSections.find((s: any) => s.section_id === p.target_id)!;
          const voice = val.import
            ? registerAsset(db, project, id, `take-${p.target_id}`, 'voice-take', 'wav', bytes!,
              { section_id: p.target_id, origin: 'import', recordist: val.import.recordist, voice_ref: val.import.voice_ref,
                text_hash: sha256(secObj.narration), script_version: nextScriptVer })
            : ttsAsset!;
          const settings = registerAsset(db, project, id, `settings-${p.target_id}`, 'voice-settings', 'json', JSON.stringify(val.import
            ? { origin: 'import', recordist: val.import.recordist, source_path: val.import.path, source_sha256: voice.sha256,
                channels: wav.channels, samples: newSamples, text_hash: sha256(secObj.narration), script_version: nextScriptVer }
            : { origin: 'tts', provider: voice.meta.provider, job_id: voice.meta.job_id, voice_ref: voice.meta.voice_ref,
                pronunciation_hash: voice.meta.pronunciation_hash, text_hash: voice.meta.text_hash, script_version: nextScriptVer,
                channels: wav.channels, samples: newSamples }, null, 2), {});
          pcmChunks.push(wav.data);
          const nextSeg = { section_id: p.target_id, audio_ref: voice.asset_ref, start_sample: cursor, end_sample: cursor + newSamples,
            voice_ref: voice.meta.voice_ref, origin: voice.meta.origin,
            provider_or_recordist: voice.meta.origin === 'import' ? voice.meta.recordist : voice.meta.provider, settings_ref: settings.asset_ref };
          cursor += newSamples;
          return nextSeg;
        });
        if (issues.length) return reject(issues);
        const newMaster = registerAsset(db, project, id, 'voice-master', 'voice-master', 'wav', wavFile(expectedChannels!, Buffer.concat(pcmChunks)), { audio_version: nextAudioVer });
        newAudioDoc = { project_id: id, version: nextAudioVer, script_version: nextScriptVer, master_ref: newMaster.asset_ref,
          sample_rate_hz: RATE, duration_samples: cursor, segments: newSegments };

        // Build new Alignment: keep earlier sections, realign edited section, shift later sections by deltaSamples!
        const nextAlignVer = (latest(db, id, 'alignment')?.version ?? 0) + 1;
        const editedSeg = newSegments.find((s) => s.section_id === p.target_id)!;
        const editedSec = newSections.find((s: any) => s.section_id === p.target_id)!;
        const editedAligned = alignSections([editedSeg], [editedSec], [{ section_id: p.target_id, words: val.words ?? [] }], val.corrections);
        if (editedAligned.issues.length) return reject(editedAligned.issues);

        const secIdx = newSections.findIndex((s: any) => s.section_id === p.target_id);
        const newTokens: any[] = [];
        const newCueMap: { cue_id: string; word_ids: string[] }[] = [];
        const oldCueById = new Map<string, string[]>(curAlignRow.document.alignment.cue_map.map((c: any) => [c.cue_id, c.word_ids]));
        newSections.forEach((sec: any, idx: number) => {
          if (idx === secIdx) {
            newTokens.push(...editedAligned.tokens);
            newCueMap.push(...editedAligned.cue_map);
          } else {
            const shift = idx > secIdx ? deltaSamples : 0;
            const own = curAlignRow.document.alignment.tokens.filter((t: any) => t.section_id === sec.section_id)
              .map((t: any) => ({ ...t, start_sample: t.start_sample + shift, end_sample: t.end_sample + shift }));
            newTokens.push(...own);
            for (const c of sec.cues ?? []) {
              const wids = oldCueById.get(c.cue_id);
              if (wids) newCueMap.push({ cue_id: c.cue_id, word_ids: wids });
            }
          }
        });
        // Preserve manual viseme marks for unchanged words + apply any new marks.
        const marks = new Map<string, string>();
        for (const r of curAlignRow.document.visemes.ranges) {
          if (r.word_id && r.shape !== 'open' && !r.word_id.startsWith(`${p.target_id}-`)) marks.set(r.word_id, r.shape);
        }
        for (const m of val.marks ?? []) marks.set(m.word_id, m.viseme);

        const common = { project_id: id, version: nextAlignVer, script_version: nextScriptVer };
        const alignment = { ...common, audio_version: nextAudioVer, sample_rate_hz: RATE, tokens: newTokens, cue_map: newCueMap };
        const subtitles = { ...common, alignment_version: nextAlignVer, style_ref: styleRef, cues: subtitleCues(newSections, newTokens, newCueMap) };
        const total = totalFrames(cursor);
        const srt = subtitles.cues.map((cue, i) => `${i + 1}\n${srtTime(cue.range.start)} --> ${srtTime(cue.range.end)}\n${cue.text}\n`).join('\n');
        const srtAsset = registerAsset(db, project, id, 'subtitles-srt', 'subtitles', 'srt', srt, { alignment_version: nextAlignVer });
        newAlignDoc = {
          alignment, subtitles,
          visemes: { project_id: id, alignment_version: nextAlignVer, fps: FPS, total_frames: total, ranges: visemeRanges(newTokens, marks, total) },
          corrections: [...curAlignRow.document.corrections, ...editedAligned.corrections],
          engine: curAlignRow.document.engine, srt_ref: srtAsset.asset_ref,
        };
        dsl.alignment_version = nextAlignVer;
        if (Array.isArray(val.dsl_shots)) {
          const overrideById = new Map(val.dsl_shots.map((s: any) => [s.shot_id, s]));
          dsl.shots = dsl.shots.map((s: any) => overrideById.get(s.shot_id) ?? s);
        }
      }
    }

    // Append revision event (transitioning to COMPILED) and persist all new content versions in one transaction.
    const revEventId = appendEvent(db, current, { idempotency_key: request.idempotency_key!, payload: { plan_id: planId, base_snapshot_hash: request.base_snapshot_hash, reopen_gates: change_plan.reopen_gates } },
      digest, 'revision_applied', 'COMPILED', 'agent');

    if (newScriptDoc) {
      curScriptRow = insertContent(db, id, 'script', newScriptDoc.version, newScriptDoc, revEventId);
      // Record script_saved with the new hash so G2 automatically becomes stale until re-signed!
      const updatedProject = getProject(db, id)!;
      appendEvent(db, updatedProject, { idempotency_key: `${request.idempotency_key!}:script`, payload: { artifact_hash: curScriptRow.hash } },
        digest, 'script_saved', 'COMPILED', 'agent');
    }
    if (newAudioDoc) curAudioRow = insertContent(db, id, 'audio', newAudioDoc.version, newAudioDoc, revEventId);
    if (newAlignDoc) curAlignRow = insertContent(db, id, 'alignment', newAlignDoc.alignment.version, newAlignDoc, revEventId);

    if (exprChanged || audioChanged) {
      const nextBoardVer = (latest(db, id, 'storyboard')?.version ?? 0) + 1;
      const built = buildStoryboard(db, project, id, nextBoardVer, dsl);
      if (built.issues?.length) return reject(built.issues);
      curBoardRow = insertContent(db, id, 'storyboard', nextBoardVer, built.document, revEventId);
    }

    const nextTimelineVer = (latest(db, id, 'timeline')?.version ?? 0) + 1;
    const compiled = compileBoard(db, project, id, curBoardRow, nextTimelineVer, styleRef);
    if ('issues' in compiled) return reject(compiled.issues);
    const curTimelineRow = insertContent(db, id, 'timeline', nextTimelineVer, compiled.document, revEventId);

    // Re-bind / update CharacterActionPlan for the new timeline version if one existed previously.
    let newPlanRef: string | null = null;
    const prevPlanRow = db.prepare(`SELECT asset_ref FROM assets WHERE project_id = ? AND kind = 'character-plan' AND json_extract(meta, '$.timeline_version') = ? ORDER BY version DESC LIMIT 1`)
      .get(id, timelineRow.version) as { asset_ref: string } | undefined;
    if (prevPlanRow) {
      const prevPlanAsset = getAsset(db, prevPlanRow.asset_ref)!;
      const prevPlan = JSON.parse(readAsset(project, prevPlanAsset)!.toString('utf8'));
      const newShotsById = new Map<string, any>(curTimelineRow.document.timeline.shots.map((s: any) => [s.shot_id, s]));
      const updatedPlanShots: PlanShot[] = prevPlan.shots.map((ps: PlanShot) => {
        const compiledShot = newShotsById.get(ps.shot_id);
        const edits = exprEdits.get(ps.shot_id) ?? [];
        const actions = ps.actions.map((a) => {
          const action = { ...a.action };
          for (const e of edits) (action as any)[e.field] = e.value;
          const end = compiledShot ? Math.min(a.local_range.end, compiledShot.local_frames) : a.local_range.end;
          const start = Math.min(a.local_range.start, Math.max(0, end - 1));
          return { ...a, local_range: { start, end }, action };
        }).filter((a) => a.local_range.end > a.local_range.start);
        return { ...ps, actions };
      });
      const savedPlan = validateAndSavePlan(db, project, id, curTimelineRow, updatedPlanShots);
      if ('issues' in savedPlan) return reject(savedPlan.issues);
      newPlanRef = savedPlan.asset.asset_ref;
    }

    const newTimeline = curTimelineRow.document.timeline;
    db.prepare('UPDATE change_plans SET applied_snapshot_hash = ? WHERE plan_id = ?').run(newTimeline.input_snapshot_hash, planId);

    const oldShotKeys = new Map<string, string>(timeline.shots.map((s: any) => [s.shot_id, s.cache_key]));
    const diff = {
      base_snapshot_hash: timeline.input_snapshot_hash,
      new_snapshot_hash: newTimeline.input_snapshot_hash,
      total_frames: { before: timeline.total_frames, after: newTimeline.total_frames },
      chapters: curBoardRow.document.storyboard.chapters.map((c: any) => {
        const old = storyboard.chapters.find((o: any) => o.chapter_id === c.chapter_id);
        return { chapter_id: c.chapter_id, before: old?.frame_range ?? null, after: c.frame_range };
      }),
      changed_shot_keys: newTimeline.shots.filter((s: any) => oldShotKeys.get(s.shot_id) !== s.cache_key).map((s: any) => s.shot_id),
      unchanged_shot_keys: newTimeline.shots.filter((s: any) => oldShotKeys.get(s.shot_id) === s.cache_key).map((s: any) => s.shot_id),
    };

    return summary(db, id, 'APPLIED', [], {
      event_id: revEventId, plan_id: planId, revision_request, change_plan,
      timeline: newTimeline, storyboard: curBoardRow.document.storyboard, plan_ref: newPlanRef, diff,
    });
    });
  } catch (error) {
    if (error instanceof AbortRevision) return summary(db, request.project_id, 'REJECTED', error.issues);
    throw error;
  }
}
