import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkProject, estimateSeconds, isApproved, lintScript } from '../skills/topic-to-video/scripts/lib/project.mjs';

const minimal = () => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));
const codes = (p) => checkProject(p).map((e) => e.code);
const placed = (p) => checkProject(p).map((e) => `${e.code} ${e.path}`);
const section2 = { id: 's02', title: '二', text: '第二段。' };
const titleShot = (id, section, sentences = [0]) => ({ id, section, sentences, layout: 'full', visual: { template: 'title', data: { heading: '二' } }, note: '过渡' });

test('minimal project has no cross-reference errors', () => {
  assert.deepEqual(checkProject(minimal()), []);
});

test('accepts shots across two sections in order', () => {
  const p = minimal();
  p.sections.push(section2);
  p.shots.push(titleShot('sh03', 's02'));
  assert.deepEqual(checkProject(p), []);
});

test('reports a sentence no shot covers', () => {
  const p = minimal();
  p.shots.pop();
  assert.deepEqual(placed(p), ['SENTENCE_GAP /sections/0']);
});

test('reports overlapping sentences', () => {
  const p = minimal();
  p.shots[1].sentences = [0, 1];
  assert.deepEqual(codes(p), ['SENTENCE_OVERLAP']);
});

test('reports a sentence index past the section end', () => {
  const p = minimal();
  p.shots[1].sentences = [1, 2];
  assert.deepEqual(codes(p), ['SENTENCE_RANGE']);
});

test('reports a shot that goes back to an earlier section', () => {
  const p = minimal();
  p.sections.push(section2);
  p.shots.push(titleShot('sh03', 's02'), titleShot('sh04', 's01', [1]));
  assert.deepEqual(codes(p), ['SECTION_ORDER']);
});

test('reports a section without any shot', () => {
  const p = minimal();
  p.sections.push(section2);
  assert.deepEqual(placed(p), ['SENTENCE_GAP /sections/1']);
});

test('reports a first section without any shot', () => {
  const p = minimal();
  p.sections.unshift({ id: 's00', title: '零', text: '零段。' });
  assert.deepEqual(placed(p), ['SENTENCE_GAP /sections/0']);
});

test('reports an unknown section and the sentence it leaves uncovered', () => {
  const p = minimal();
  p.shots[1].section = 's09';
  assert.deepEqual(codes(p), ['UNKNOWN_SECTION', 'SENTENCE_GAP']);
});

test('reports duplicate ids', () => {
  const p = minimal();
  p.shots[1].id = 'sh01';
  assert.deepEqual(codes(p), ['DUPLICATE_ID']);
});

test('reports a cue outside its shot', () => {
  const p = minimal();
  p.shots[1].cues[0].sentence = 0;
  assert.deepEqual(codes(p), ['CUE_OUTSIDE_SHOT']);
});

test('reports a reveal target past the last element', () => {
  const p = minimal();
  p.shots[1].cues[0].target = 3;
  assert.deepEqual(codes(p), ['CUE_TARGET_RANGE']);
});

test('reports reveal on a template without elements', () => {
  const p = minimal();
  p.shots[0].cues = [{ sentence: 0, do: 'reveal', target: 0 }];
  assert.deepEqual(codes(p), ['CUE_NOT_SUPPORTED']);
});

test('reports a host cue on a full-screen shot', () => {
  const p = minimal();
  p.shots[1].cues = [{ sentence: 1, do: 'expr', target: 'happy' }];
  assert.deepEqual(codes(p), ['CUE_NEEDS_HOST']);
});

test('reports a checkpoint newer than the project', () => {
  const p = minimal();
  p.checkpoints.push({ stage: 'plan', revision: 2, at: '2026-11-23T10:00', note: '好' });
  assert.deepEqual(codes(p), ['CHECKPOINT_REVISION']);
});

test('reports an unknown source', () => {
  const p = minimal();
  p.sections[0].source_ids = ['src01'];
  assert.deepEqual(codes(p), ['UNKNOWN_SOURCE']);
});

test('estimates seconds from spoken characters and sentence gaps', () => {
  assert.equal(estimateSeconds(minimal()), 15 / 4 + 2 * 0.25);
});

test('warns about long sentences and off-target estimates', () => {
  const p = minimal();
  p.sections[0].text = `${'一'.repeat(31)}。`;
  assert.deepEqual(lintScript(p).map((w) => w.code).sort(), ['ESTIMATE_OFF_TARGET', 'SENTENCE_TOO_LONG']);
});

test('isApproved follows the revision', () => {
  const p = minimal();
  assert.equal(isApproved(p, 'plan'), false);
  p.checkpoints.push({ stage: 'plan', revision: 1, at: '2026-11-23T10:00', note: '可以' });
  assert.equal(isApproved(p, 'plan'), true);
  p.revision = 2;
  assert.equal(isApproved(p, 'plan'), false);
});

test('reports missing fields instead of throwing', () => {
  const p = minimal();
  delete p.checkpoints;
  delete p.shots[0].sentences;
  assert.deepEqual(placed(p), ['MISSING_FIELD /checkpoints']);
  const q = minimal();
  delete q.shots[0].sentences;
  q.shots[1].visual = { template: 'bullets', data: {} };
  assert.deepEqual(placed(q), ['MISSING_FIELD /shots/0/sentences', 'MISSING_FIELD /shots/1/visual/data/items']);
  assert.deepEqual(placed(null), ['MISSING_FIELD ']);
});

test('lintScript returns no warnings for a project with missing fields', () => {
  const p = minimal();
  delete p.settings;
  assert.deepEqual(lintScript(p), []);
});
