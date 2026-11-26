import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkProject, estimateSeconds, INTERACTION_CUES, lintScript, lintVoice } from '../skills/topic-to-video/scripts/lib/project.mjs';
import { lintStoryboard } from '../skills/topic-to-video/scripts/lib/match.mjs';
import { checkDerivedDocs } from './helpers/derived-docs.mjs';
import { validateProject } from './helpers/schema.mjs';

const DIR = join(import.meta.dirname, '../examples/cache-speed');
const read = (name) => readFileSync(join(DIR, name), 'utf8');
const project = JSON.parse(read('project.json'));

test('example matches the schema', () => {
  assert.deepEqual(validateProject(project).errors, []);
});

test('example has no cross-reference errors', () => {
  assert.deepEqual(checkProject(project), []);
});

test('example script and storyboard follow all rules with zero warnings', () => {
  assert.deepEqual(lintScript(project), []);
  assert.deepEqual(lintStoryboard(project), []);
  assert.deepEqual(lintVoice(project), []);
  assert.equal(Math.round(estimateSeconds(project)), 70);
});

test('example documents (including prompt pack) mirror project.json', () => {
  assert.deepEqual(checkDerivedDocs(project, read('讲稿.md'), read('分镜.md'), read('提示词包.md')), []);
});

test('example showcases world, mixed layouts (>=60% stage), >=4 stage interactions, state and send', () => {
  assert.ok(project.world, 'project.world is defined');
  assert.ok(project.world.metaphor.includes('冰箱') && project.world.metaphor.includes('超市'), 'metaphor names 冰箱 and 超市');
  assert.equal(project.world.style, 'paper');
  assert.equal(project.world.scene, 'kitchen');

  const layouts = new Set(project.shots.map((s) => s.layout));
  for (const layout of ['host-left', 'stage', 'full']) assert.ok(layouts.has(layout), `includes ${layout}`);

  const hostShots = project.shots.filter((s) => s.layout === 'host-left' || s.layout === 'stage');
  const stageShots = hostShots.filter((s) => s.layout === 'stage');
  assert.ok(stageShots.length / hostShots.length >= 0.6, `stage ratio ${stageShots.length}/${hostShots.length} >= 60%`);
  assert.ok(stageShots.some((s) => s.scene === 'street'), 'at least one stage shot overrides scene to street');

  const cues = project.shots.flatMap((s) => s.cues ?? []);
  const usedInteractions = new Set(cues.map((c) => c.do).filter((d) => INTERACTION_CUES.includes(d)));
  assert.ok(usedInteractions.size >= 4, `used ${usedInteractions.size} interaction cues: ${[...usedInteractions]}`);
  assert.ok(cues.some((c) => c.do === 'state'), 'uses state cue');
  assert.ok(cues.some((c) => c.do === 'send'), 'uses send cue');
});

test('example shows the new host acting: a move, a new gesture, a new expression and a prop', () => {
  const OLD_GESTURES = ['idle', 'point_right', 'wave', 'emphasize'];
  const OLD_EXPRESSIONS = ['explaining', 'focused', 'happy', 'curious'];
  const cues = project.shots.flatMap((s) => s.cues ?? []);
  const hosts = project.shots.filter((s) => s.host).map((s) => s.host);
  assert.ok(cues.some((c) => c.do === 'move'), 'a move cue');
  assert.ok(cues.some((c) => c.do === 'prop' && c.target !== 'none'), 'a prop cue');
  assert.ok(hosts.some((h) => !OLD_GESTURES.includes(h.gesture)), 'a new gesture');
  assert.ok(hosts.some((h) => !OLD_EXPRESSIONS.includes(h.expr)), 'a new expression');
  assert.ok(hosts.every((h) => h.gesture !== 'point_right'), 'the example uses point, not the old name');
});
