// T07 / A07: director DSL with word/cue triggers, shared cut quantization ((sample + 800) // 1600), frozen
// CompiledTimeline with stable references, and negative cases that name shot and field and block production compilation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, makeProject } from './helpers.mjs';
import { alignedStudio, call, envelope, issues, ok, ref, status } from './studio-fixture.mjs';

// sec_001 words start at master samples 0, 2,399 and 2,400; sec_002 starts at 48,000 and repeats “副本”.
const WORDS = [
  { section_id: 'sec_001', words: [['先', 0, 2399], ['看', 2399, 2400], ['第一段', 2400, 40000]] },
  { section_id: 'sec_002', words: [['浏览器', 2400, 12000], ['有', 12000, 16000], ['副本', 16000, 26000], ['再', 30000, 34000], ['看', 34000, 38000],
    ['副本', 38000, 48000], ['是否', 48000, 56000], ['新鲜', 56000, 70000]] },
];
const aligned = () => alignedStudio({ words: WORDS });

const host = (gesture = 'point_right') => ({ character_ref: ref('host_main'), angle: 'front', expression: 'explaining', gesture, gaze: 'camera' });
const shot = (shot_id, chapter_id, section_id, start, extra = {}) => ({ shot_id, chapter_id, section_id, start, purpose: shot_id, camera: 'medium',
  scene_ref: ref('studio_host'), scene_layers: [ref('studio_backdrop')], character_actions: [], audio_anchors: [], visual_cues: [], depends_on: [], ...extra });
const diagram = { camera: 'wide', scene_ref: ref('diagram_ch_002'), scene_layers: [ref('studio_backdrop'), ref('diagram_cache')] };
const cue = (element_id, at, operation = 'highlight') => ({ target_ref: ref('diagram_cache'), element_id, operation, at });
const board = () => ({
  alignment_version: 1,
  chapters: [
    { chapter_id: 'ch_001', title: '开场', section_ids: ['sec_001'], continuity_in: '空舞台', continuity_out: '主持人站定' },
    { chapter_id: 'ch_002', title: '副本', section_ids: ['sec_002'], continuity_in: '主持人站定', continuity_out: '两张副本卡亮起' }],
  shots: [
    shot('shot_001', 'ch_001', 'sec_001', { section_id: 'sec_001' }, { character_actions: [host()] }),
    shot('shot_002', 'ch_001', 'sec_001', { word_id: 'sec_001-w002', edge: 'start' }, { camera: 'close' }),
    shot('shot_003', 'ch_001', 'sec_001', { word_id: 'sec_001-w003', edge: 'start' }),
    shot('shot_004', 'ch_002', 'sec_002', { section_id: 'sec_002' }, { ...diagram, audio_anchors: ['cue_copy_1', 'cue_copy_2'], depends_on: ['shot_003'],
      visual_cues: [cue('browser', { cue_id: 'cue_copy_1', edge: 'start' }), cue('server', { cue_id: 'cue_copy_2', edge: 'start' }), cue('server', { local_frame: 0 }, 'show')] }),
  ],
});

test('word anchors quantize once: samples 2,399/2,400 cut at frames 1/2 and the last real sample is covered', async () => {
  const { project } = await aligned();
  const saved = await ok(call(project, 'storyboard', { ...(await envelope(project, 'board-1')), ...board() }));
  assert.equal(saved.state, 'STORYBOARD_READY');
  const sb = saved.document.storyboard;
  assert.equal(sb.timing_basis, 'aligned');
  assert.deepEqual(sb.shots.map((s) => [s.shot_id, s.frame_range.start, s.frame_range.end]),
    [['shot_001', 0, 1], ['shot_002', 1, 2], ['shot_003', 2, 30], ['shot_004', 30, 91]]);
  // Adjacent shots share one cut; the final cut is (144,504 + 1,599) // 1,600 = 91 with 1,096 padding samples.
  assert.deepEqual(saved.document.cuts.map((c) => [c.sample, c.frame, c.before, c.after]),
    [[0, 0, null, 'shot_001'], [2399, 1, 'shot_001', 'shot_002'], [2400, 2, 'shot_002', 'shot_003'], [48000, 30, 'shot_003', 'shot_004'], [144504, 91, 'shot_004', null]]);
  assert.deepEqual([sb.total_frames, saved.document.padding_samples], [91, 1096]);
  assert.deepEqual(sb.chapters.map((c) => [c.chapter_id, c.frame_range.start, c.frame_range.end]), [['ch_001', 0, 30], ['ch_002', 30, 91]]);
  // Repeated “副本”: each cue resolves its own word ID → master 64,000 / 86,000 → frames 40 / 54 → local 10 / 24.
  assert.deepEqual(sb.shots[3].visual_cues.map((c) => [c.element_id, c.at_local_frame]), [['browser', 10], ['server', 24], ['server', 0]]);
});

test('production compilation freezes a timeline with resolved references, audio, captions and dependencies', async () => {
  const { project, audio, alignment } = await aligned();
  await ok(call(project, 'storyboard', { ...(await envelope(project, 'board-1')), ...board() }));
  const request = { ...(await envelope(project, 'compile-1')), storyboard_version: 1 };
  const compiled = await ok(call(project, 'compile', request));
  assert.equal(compiled.state, 'COMPILED');
  const timeline = compiled.document.timeline;
  assert.deepEqual([timeline.total_frames, timeline.storyboard_version], [91, 1]);
  assert.deepEqual(timeline.shots.map((s) => [s.shot_id, s.absolute_range.start, s.absolute_range.end, s.local_frames]),
    [['shot_001', 0, 1, 1], ['shot_002', 1, 2, 1], ['shot_003', 2, 30, 28], ['shot_004', 30, 91, 61]]);
  for (const s of timeline.shots) {
    assert.equal(s.audio_ref, audio.master_ref);
    assert.equal(s.subtitle_ref, alignment.srt_ref);
    assert.match(s.cache_key, /^sha256:[0-9a-f]{64}$/);
  }
  assert.deepEqual(timeline.shots[3].layer_refs, [ref('studio_backdrop'), ref('diagram_cache')]);
  assert.deepEqual(timeline.shots[3].visual_cues.map((c) => c.at_local_frame), [10, 24, 0]);
  assert.match(timeline.input_snapshot_hash, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(compiled.document.dependencies, [{ shot_id: 'shot_004', depends_on: ['shot_003'] }]);
  // The alignment reference pins the exact alignment revision the cues were compiled from.
  const pinned = compiled.assets.find((a) => a.asset_ref === timeline.alignment_ref);
  assert.deepEqual(JSON.parse(readFileSync(join(project, pinned.path), 'utf8')), alignment.alignment);
  // Replaying the same request returns the frozen document without a new version.
  const again = await ok(call(project, 'compile', request));
  assert.equal(again.status, 'REPLAYED');
  assert.deepEqual(again.document, compiled.document);
});

test('dangling cues, unknown words, cross-section triggers, out-of-range highlights and cycles name shot and field', async () => {
  const { project } = await aligned();
  const before = await status(project);
  const bad = board();
  bad.shots[1].audio_anchors = ['cue_missing'];
  bad.shots[1].depends_on = ['shot_004'];
  Object.assign(bad.shots[2], diagram, { visual_cues: [cue('browser', { cue_id: 'cue_copy_1', edge: 'start' })] });
  bad.shots[3].visual_cues = [cue('browser', { word_id: 'sec_002-w099', edge: 'start' }), cue('server', { local_frame: 61 }), cue('server', { local_frame: 1, cue_id: 'cue_copy_1' })];
  bad.shots[3].depends_on = ['shot_002'];
  const rejected = await call(project, 'storyboard', { ...(await envelope(project, 'board-bad')), ...bad });
  assert.equal(rejected.code, 1, rejected.stdout);
  assert.deepEqual(issues(rejected, 'code', 'shot_id', 'field'), [
    ['CUE_UNKNOWN', 'shot_002', 'audio_anchors'],
    ['CUE_CROSS_SECTION', 'shot_003', 'visual_cues[0].at'],
    ['CUE_WORD_UNKNOWN', 'shot_004', 'visual_cues[0].at'],
    ['CUE_OUT_OF_RANGE', 'shot_004', 'visual_cues[1].at'],
    ['CUE_TRIGGER_INVALID', 'shot_004', 'visual_cues[2].at'],
    ['DEPENDENCY_CYCLE', 'shot_002', 'depends_on']]);
  assert.deepEqual(rejected.json.issues[3].local_frames, 61);
  assert.deepEqual(rejected.json.issues[5].cycle, ['shot_002', 'shot_004']);

  // A cut that moves backwards gives a non-positive length; planned frame ranges are not production timing.
  const backwards = board();
  backwards.shots[2].start = { word_id: 'sec_001-w001', edge: 'start' };
  const negative = await call(project, 'storyboard', { ...(await envelope(project, 'board-back')), ...backwards });
  assert.deepEqual(issues(negative, 'code', 'shot_id', 'field', 'start', 'end'), [['SHOT_LENGTH_INVALID', 'shot_002', 'frame_range', 1, 0]]);
  const planned = board();
  planned.shots[0] = { ...planned.shots[0], frame_range: { start: 0, end: 1 } };
  delete planned.shots[0].start;
  const fixed = await call(project, 'storyboard', { ...(await envelope(project, 'board-planned')), ...planned });
  assert.deepEqual(issues(fixed, 'code', 'shot_id', 'field'), [['TIMING_NOT_ALIGNED', 'shot_001', 'start']]);

  const after = await status(project);
  assert.deepEqual([after.state, after.version], ['ALIGNMENT_READY', before.version]);
  const compile = await call(project, 'compile', { ...(await envelope(project, 'compile-0')) });
  assert.deepEqual(issues(compile, 'code'), [['STORYBOARD_MISSING']]);
});

test('production compilation blocks an unsupported action and uncleared assets', async () => {
  const { project } = await aligned();
  const plan = board();
  plan.shots[0].character_actions = [host('wave')];
  plan.shots[1].scene_ref = ref('studio_pending');
  plan.shots[1].scene_layers = [ref('backdrop_pending')];
  await ok(call(project, 'storyboard', { ...(await envelope(project, 'board-1')), ...plan }));
  const blocked = await call(project, 'compile', { ...(await envelope(project, 'compile-1')) });
  assert.equal(blocked.code, 1, blocked.stdout);
  assert.deepEqual(issues(blocked, 'code', 'shot_id', 'field', 'asset_ref'), [
    ['ACTION_UNREGISTERED', 'shot_001', 'gesture', ref('host_main')],
    ['ASSET_NOT_CLEARED', 'shot_002', undefined, ref('backdrop_pending')]]);
  assert.equal(blocked.json.state, 'STORYBOARD_READY');
});

test('planned example boards stay readable as fixed-frame timelines without production status', async () => {
  const project = makeProject();
  for (const [example, shots, frames] of [['topic-cache-speed', 14, 3600], ['topic-kafka-to-doris', 34, 14400]]) {
    const storyboard = JSON.parse(readFileSync(join(ROOT, 'examples', example, 'storyboard.json'), 'utf8'));
    const read = await ok(call(project, 'compile', { project_id: storyboard.project_id, storyboard }));
    assert.equal(read.status, 'PLANNED');
    assert.equal(read.production, false);
    assert.equal(read.shots.length, shots);
    assert.deepEqual([read.shots[0].absolute_range.start, read.shots.at(-1).absolute_range.end, read.total_frames], [0, frames, frames]);
    read.shots.slice(1).forEach((s, i) => assert.equal(s.absolute_range.start, read.shots[i].absolute_range.end));
    assert.deepEqual(read.shots.flatMap((s) => s.visual_cues.map((c) => c.at_local_frame)),
      storyboard.shots.flatMap((s) => s.visual_cues.map((c) => c.at_local_frame)));
  }
});
