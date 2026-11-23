// CharacterActionPlan and sequential character baking (T08, design §6).
// `plan` checks each shot's performance against the compiled timeline, the CharacterProfile and the rig. `bake` resolves
// the initial state (a named pose, or the end state of the shot it explicitly inherits from), integrates every frame in
// order and stores the trajectory under its cache key. Reads render the requested frames from their recorded states.
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assetByMeta, getAsset, nextVersion, readAsset, registerAsset, sha256, usageOf } from './assets.ts';
import { latest } from './content.ts';
import { type Db, type Issue, type Outcome, getProject, openStore, requestHash, summary, transaction } from './project-store.ts';
import { FPS } from './timebase.ts';
import { BAKER, ORDER, type State, actionTarget, initialState, png, render, step } from '../tools/bake_character/adapter.ts';

interface PlanAction { local_range: { start: number; end: number }; action: { character_ref: string; angle: string; expression: string; gesture: string; gaze: string }; cue_id?: string | null }
interface PlanShot { shot_id: string; character_ref: string; initial_pose: string; exit_pose: string; actions: PlanAction[] }
export interface PlanRequest { project_id: string; timeline_version?: number; shots: PlanShot[] }

const SUPPORTED_RIG = 'simulated-2d';
const rigOf = (project: string, db: Db, characterRef: string) => {
  const profile = getAsset(db, characterRef)?.meta.profile;
  const asset = profile && getAsset(db, profile.rig_ref);
  const bytes = asset && readAsset(project, asset);
  return { profile, rigRef: profile?.rig_ref, rig: bytes ? JSON.parse(bytes.toString('utf8')) : undefined };
};

// The explicitly inherited shot (timeline dependencies) that is also in the plan; the latest one if several.
function predecessor(timeline: any, shotId: string, planned: Map<string, PlanShot>) {
  const deps: string[] = timeline.dependencies.find((d: any) => d.shot_id === shotId)?.depends_on ?? [];
  const start = (id: string) => timeline.timeline.shots.find((s: any) => s.shot_id === id).absolute_range.start;
  return deps.filter((id) => planned.has(id)).sort((a, b) => start(a) - start(b)).map((id) => planned.get(id)!).at(-1);
}

export function planOp(project: string, request: PlanRequest): Outcome {
  const db = openStore(project);
  return transaction(db, () => {
    const id = request.project_id;
    if (!getProject(db, id)) return summary(db, id, 'REJECTED', [{ code: 'PROJECT_NOT_FOUND', ref: id }]);
    const timeline = latest(db, id, 'timeline', request.timeline_version);
    if (!timeline) return summary(db, id, 'REJECTED', [{ code: 'TIMELINE_MISSING', timeline_version: request.timeline_version ?? null }]);
    const board = latest(db, id, 'storyboard', timeline.document.timeline.storyboard_version)!.document.storyboard;
    const pinned = getAsset(db, timeline.document.timeline.alignment_ref)!;
    const cues = new Set(JSON.parse(readAsset(project, pinned)!.toString('utf8')).cue_map.map((c: any) => c.cue_id));
    const planned = new Map(request.shots.map((s) => [s.shot_id, s]));
    const issues: Issue[] = [];
    for (const shot of request.shots) {
      const fail = (field: string, issue: Issue) => issues.push({ ...issue, shot_id: shot.shot_id, field });
      const compiled = timeline.document.timeline.shots.find((s: any) => s.shot_id === shot.shot_id);
      const stored = board.shots.find((s: any) => s.shot_id === shot.shot_id);
      if (!compiled || !stored?.character_actions.some((a: any) => a.character_ref === shot.character_ref)) {
        fail('shot_id', { code: 'PLAN_SHOT_UNKNOWN', character_ref: shot.character_ref, timeline_version: timeline.version }); continue;
      }
      const { profile, rigRef, rig } = rigOf(project, db, shot.character_ref);
      if (rig?.rig !== SUPPORTED_RIG) { fail('character_ref', { code: 'RIG_UNSUPPORTED', asset_ref: rigRef ?? null, rig: rig?.rig ?? null, supported: SUPPORTED_RIG }); continue; }
      for (const field of ['initial_pose', 'exit_pose'] as const) if (!rig.poses[shot[field]]) fail(field, { code: 'POSE_UNKNOWN', pose: shot[field] });
      const previous = predecessor(timeline.document, shot.shot_id, planned);
      if (previous && rig.poses[shot.initial_pose] && shot.initial_pose !== previous.exit_pose) {
        fail('initial_pose', { code: 'INHERITED_POSE_MISMATCH', pose: shot.initial_pose, expected: previous.exit_pose, inherits_from: previous.shot_id });
      }
      const placed: { start: number; end: number }[] = [];
      shot.actions.forEach((item, k) => {
        for (const [field, allowed, table] of [['angle', profile.supported_angles, rig.angles], ['expression', profile.expressions, rig.expressions], ['gesture', profile.gestures, rig.gestures]] as const) {
          const value = (item.action as any)[field];
          if (!allowed.includes(value) || !table[value]) {
            fail(`actions[${k}].action.${field}`, field === 'angle' ? { code: 'ANGLE_UNREGISTERED', asset_ref: shot.character_ref, angle: value } : { code: 'ACTION_UNREGISTERED', asset_ref: shot.character_ref, value });
          }
        }
        const { start, end } = item.local_range;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > compiled.local_frames) {
          fail(`actions[${k}].local_range`, { code: 'ACTION_RANGE_INVALID', start, end, local_frames: compiled.local_frames });
        } else if (placed.some((r) => r.start < end && start < r.end)) fail(`actions[${k}].local_range`, { code: 'ACTION_OVERLAP', start, end });
        else placed.push({ start, end });
        if (item.cue_id != null && !cues.has(item.cue_id)) fail(`actions[${k}].cue_id`, { code: 'CUE_UNKNOWN', cue_id: item.cue_id });
      });
    }
    if (issues.length) return summary(db, id, 'REJECTED', issues);

    const shots = request.shots.map((s) => ({ shot_id: s.shot_id, character_ref: s.character_ref, initial_pose: s.initial_pose,
      actions: s.actions.map((a) => ({ local_range: a.local_range, action: a.action, cue_id: a.cue_id ?? null })), exit_pose: s.exit_pose }));
    const storyboard_version = timeline.document.timeline.storyboard_version;
    const previous = assetByMeta(db, id, 'plan_hash', requestHash({ storyboard_version, timeline_version: timeline.version, shots }));
    if (previous) {
      return summary(db, id, 'REPLAYED', [], { plan: JSON.parse(readAsset(project, previous)!.toString('utf8')), asset: { asset_ref: previous.asset_ref, sha256: previous.sha256, path: previous.path } });
    }
    const plan = { project_id: id, version: nextVersion(db, id, 'character_plan'), storyboard_version, shots };
    const asset = registerAsset(db, project, id, 'character_plan', 'character-plan', 'json', JSON.stringify(plan, null, 2),
      { timeline_version: timeline.version, plan_hash: requestHash({ storyboard_version, timeline_version: timeline.version, shots }) });
    return summary(db, id, 'CREATED', [], { plan, asset: { asset_ref: asset.asset_ref, sha256: asset.sha256, path: asset.path } });
  });
}

// Target of local frame f: the action covering it; before the first action the initial pose; after the last the exit
// pose; in a gap the most recent action keeps holding.
function targetAt(rig: any, shot: PlanShot, f: number) {
  const active = shot.actions.find((a) => a.local_range.start <= f && f < a.local_range.end);
  if (active) return actionTarget(rig, shot.initial_pose, active.action, f - active.local_range.start);
  const before = shot.actions.filter((a) => a.local_range.end <= f).sort((a, b) => a.local_range.end - b.local_range.end).at(-1);
  if (!before) return { pose: rig.poses[shot.initial_pose], phase: 0 };
  if (!shot.actions.some((a) => a.local_range.start > f)) return { pose: rig.poses[shot.exit_pose], phase: 0 };
  return actionTarget(rig, shot.initial_pose, before.action, f - before.local_range.start);
}

// Frame lookup: render the recorded state, confirm the recorded RGBA hash and keep a lossless PNG. Independent of how the
// trajectory was produced, so first, last, reverse and repeated reads all see the same pixels.
function readFrames(project: string, rig: any, trajectory: any, requested: number[], issues: Issue[]) {
  const folder = join('frames', trajectory.cache_key.slice('sha256:'.length, 'sha256:'.length + 16));
  mkdirSync(join(project, folder), { recursive: true });
  return requested.map((f) => {
    const recorded = trajectory.frames[f];
    const rgba = render(rig, recorded);
    const rgba_sha256 = sha256(rgba);
    if (rgba_sha256 !== recorded.rgba_sha256) issues.push({ code: 'BAKE_NONDETERMINISTIC', shot_id: trajectory.shot_id, frame: f, expected: recorded.rgba_sha256, actual: rgba_sha256 });
    const file = join(folder, `f${String(f).padStart(5, '0')}.png`);
    if (!existsSync(join(project, file))) { writeFileSync(join(project, file + '.tmp'), png(rig, rgba)); renameSync(join(project, file + '.tmp'), join(project, file)); }
    return { frame: f, rgba_sha256, png: file };
  });
}

export interface BakeRequest { project_id: string; plan_ref: string; shot_id: string; seed: number; frames: number[] }

export function bakeOp(project: string, request: BakeRequest): Outcome {
  const db = openStore(project);
  return transaction(db, () => {
    const id = request.project_id;
    const reject = (issues: Issue[]) => summary(db, id, 'REJECTED', issues);
    if (!getProject(db, id)) return reject([{ code: 'PROJECT_NOT_FOUND', ref: id }]);
    const planAsset = getAsset(db, request.plan_ref);
    const planBytes = planAsset?.kind === 'character-plan' ? readAsset(project, planAsset) : undefined;
    if (!planBytes) return reject([{ code: 'PLAN_NOT_FOUND', plan_ref: request.plan_ref }]);
    if (!Number.isInteger(request.seed) || request.seed < 0) return reject([{ code: 'SEED_INVALID', seed: request.seed }]);
    const plan = JSON.parse(planBytes.toString('utf8'));
    const planned = new Map<string, PlanShot>(plan.shots.map((s: PlanShot) => [s.shot_id, s]));
    const timeline = latest(db, id, 'timeline', planAsset!.meta.timeline_version)!;
    const compiledShot = (shotId: string) => timeline.document.timeline.shots.find((s: any) => s.shot_id === shotId);
    const pinned = getAsset(db, timeline.document.timeline.alignment_ref)!;
    const visemes = latest(db, id, 'alignment', pinned.meta.alignment_version)!.document.visemes.ranges;

    const requested = planned.get(request.shot_id);
    if (!requested) return reject([{ code: 'BAKE_SHOT_NOT_IN_PLAN', shot_id: request.shot_id, plan_ref: request.plan_ref }]);
    const frameCount = compiledShot(request.shot_id).local_frames;
    const outside = request.frames.filter((f) => !Number.isInteger(f) || f < 0 || f >= frameCount);
    if (outside.length) return reject(outside.map((frame) => ({ code: 'FRAME_OUT_OF_RANGE', shot_id: request.shot_id, frame, frame_count: frameCount })));

    const issues: Issue[] = [];
    const results = new Map<string, any>();
    const baked: object[] = [];
    // Character and rig must still be registered, unchanged and cleared — checked on every read, cached or not.
    const pins = (shot: PlanShot) => [shot.character_ref, getAsset(db, shot.character_ref)?.meta.profile?.rig_ref].map((ref) => {
      const asset = ref && getAsset(db, ref);
      if (!asset) { issues.push({ code: 'ASSET_NOT_FOUND', shot_id: shot.shot_id, asset_ref: ref ?? null }); return undefined; }
      const bytes = readAsset(project, asset);
      if (!bytes) { issues.push({ code: 'ASSET_FILE_CHANGED', shot_id: shot.shot_id, asset_ref: ref }); return undefined; }
      const usage = usageOf(db, ref);
      if (usage !== 'cleared') issues.push({ code: 'ASSET_NOT_CLEARED', shot_id: shot.shot_id, asset_ref: ref, usage });
      return { asset, bytes };
    });
    // Initial state: the end state of the explicitly inherited shot (baked first), or the named pose with the seed.
    const resolveInitial = (shot: PlanShot, rig: any): { initial: State; inherited_from: object | null } | undefined => {
      const parent = predecessor(timeline.document, shot.shot_id, planned);
      if (!parent) return { initial: initialState(rig, shot.initial_pose, request.seed), inherited_from: null };
      const inherited = bakeShot(parent);
      return inherited && { initial: inherited.trajectory.end_state,
        inherited_from: { shot_id: parent.shot_id, cache_key: inherited.cache_key, end_state_hash: inherited.trajectory.end_state_hash } };
    };
    const bakeShot = (shot: PlanShot): any => {
      if (results.has(shot.shot_id)) return results.get(shot.shot_id);
      const [character, rigPin] = pins(shot);
      if (!character || !rigPin || issues.length) return undefined;
      const profile = character.asset.meta.profile, rig = JSON.parse(rigPin.bytes.toString('utf8'));
      const start = resolveInitial(shot, rig);
      if (!start) return undefined;
      const { initial, inherited_from } = start;
      const compiled = compiledShot(shot.shot_id);
      const shapes = Array.from({ length: compiled.local_frames }, (_, f) => {
        const at = compiled.absolute_range.start + f;
        return visemes.find((r: any) => r.range.start <= at && at < r.range.end)?.shape ?? 'rest';
      });
      const initial_state_hash = requestHash(initial);
      const cache_key = requestHash({ baker: BAKER, rig: { asset_ref: rigPin.asset.asset_ref, sha256: rigPin.asset.sha256 },
        character: { asset_ref: character.asset.asset_ref, sha256: character.asset.sha256 }, shot, frame_count: compiled.local_frames, fps: FPS,
        visemes: shapes, seed: request.seed, initial_state_hash });
      const existing = assetByMeta(db, id, 'cache_key', cache_key);
      let trajectory: any, asset = existing, cached = true;
      if (existing) {
        const bytes = readAsset(project, existing);
        if (!bytes) { issues.push({ code: 'ASSET_FILE_CHANGED', shot_id: shot.shot_id, asset_ref: existing.asset_ref }); return undefined; }
        trajectory = JSON.parse(bytes.toString('utf8'));
      } else {
        const limits = new Map<string, { min: number; max: number }>(profile.parameters.map((p: any) => [p.parameter_id, p]));
        let state = initial;
        const frames = shapes.map((shape, f) => {
          state = step(rig, state, targetAt(rig, shot, f), shape, limits);
          return { frame: f, ...state, rgba_sha256: sha256(render(rig, state)) };
        });
        trajectory = { shot_id: shot.shot_id, cache_key, baker: BAKER, rig_ref: rigPin.asset.asset_ref, rig_sha256: rigPin.asset.sha256,
          character_ref: character.asset.asset_ref, fps: FPS, step_seconds: 1 / FPS, order: ORDER, physics: rig.physics, blink: rig.blink, seed: request.seed,
          initial_state: initial, initial_state_hash, inherited_from, visemes: shapes, frames, end_state: state, end_state_hash: requestHash(state) };
        asset = registerAsset(db, project, id, 'character_bake', 'character-bake', 'json', JSON.stringify(trajectory), { cache_key, shot_id: shot.shot_id });
        cached = false;
      }
      const result = { shot_id: shot.shot_id, cache_key, cached, asset: asset!, trajectory, rig, initial_state_hash, inherited_from };
      results.set(shot.shot_id, result);
      baked.push({ shot_id: shot.shot_id, cache_key, cached, asset_ref: asset!.asset_ref, end_state_hash: trajectory.end_state_hash });
      return result;
    };
    const result = bakeShot(requested);
    if (issues.length || !result) return reject(issues);

    const frames = readFrames(project, result.rig, result.trajectory, request.frames, issues);
    if (issues.length) return reject(issues);
    const job = `bake-${result.cache_key.slice('sha256:'.length, 'sha256:'.length + 12)}`;
    return summary(db, id, result.cached ? 'CACHED' : 'BAKED', [], {
      bake: { shot_id: result.shot_id, cache_key: result.cache_key, asset_ref: result.asset.asset_ref, path: result.asset.path, frame_count: frameCount,
        initial_state_hash: result.initial_state_hash, end_state_hash: result.trajectory.end_state_hash, inherited_from: result.inherited_from },
      baked, frames,
      tool_result: { status: 'succeeded', job_id: job, artifact_refs: [result.asset.asset_ref], warnings: [], cost: { currency: 'XXX', estimated_minor: 0, actual_minor: 0 },
        retryable: false, next_action: 'continue' },
    });
  });
}
