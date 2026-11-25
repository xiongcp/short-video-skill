import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARS_PER_SECOND, DEFAULT_SENTENCE_GAP_MS, MAX_SENTENCE_CHARS, estimateReport } from '../skills/topic-to-video/scripts/lib/project.mjs';
import { splitSentences } from '../skills/topic-to-video/scripts/lib/captions.mjs';

const SKILL = join(import.meta.dirname, '../skills/topic-to-video');
const ref = (name) => readFileSync(join(SKILL, 'references', name), 'utf8');
const schema = JSON.parse(readFileSync(join(SKILL, 'schema/project.schema.json'), 'utf8'));

test('script.md states the same planning constants as project.mjs', () => {
  const text = ref('script.md');
  assert.ok(text.includes(`每秒 ${CHARS_PER_SECOND} 个字`));
  assert.ok(text.includes(`${DEFAULT_SENTENCE_GAP_MS / 1000} 秒停顿`));
  assert.ok(text.includes(`每句不超过 ${MAX_SENTENCE_CHARS} 字`));
  assert.ok(text.includes('±10%'));
});

test('storyboard.md documents every template, expression and gesture in the schema', () => {
  const text = ref('storyboard.md');
  const templates = schema.$defs.visual.oneOf.map((v) => schema.$defs[v.$ref.split('/').at(-1)].properties.template.const);
  for (const name of [...templates, ...schema.$defs.expr.enum, ...schema.$defs.gesture.enum]) {
    assert.ok(text.includes(`\`${name}\``), name);
  }
});

test('prompt-pack.md uses the host prompt lock and reference image', () => {
  const text = ref('prompt-pack.md');
  assert.ok(text.includes('prompt_lock'));
  assert.ok(text.includes('body-idle.png'));
});

test('storyboard.md maps sentence intent to host acting and names the storyboard warnings', () => {
  const text = ref('storyboard.md');
  for (const word of ['句意', 'VISUAL_NOT_IN_NARRATION', 'POINT_MISSING']) assert.ok(text.includes(word), word);
});

test('prompt-pack.md uses first frames, image-to-video, narration and beats from starts', () => {
  const text = ref('prompt-pack.md');
  for (const word of ['首帧图', '图生视频', '首尾帧', '**口播**', '**节拍**', 'starts']) assert.ok(text.includes(word), word);
});

test('storyboard.md asks for key spoken numbers on screen as number or bars', () => {
  assert.match(ref('storyboard.md'), /关键数字[^\n]*`number`[^\n]*`bars`/);
});

test('the prompt-pack example takes its narration and beat seconds from the example project', () => {
  const text = ref('prompt-pack.md');
  const project = JSON.parse(readFileSync(join(import.meta.dirname, '../examples/cache-speed/project.json'), 'utf8'));
  const [, id, seconds] = text.match(/### (sh\d+)（估时 (\d+) 秒/);
  const shot = project.shots.find((s) => s.id === id);
  const estimate = estimateReport(project).shots.find((s) => s.id === id);
  const sentences = splitSentences(project.sections.find((s) => s.id === shot.section).text);
  assert.equal(Number(seconds), estimate.seconds);
  assert.equal(text.match(/^口播：(.*)$/m)[1], shot.sentences.map((n) => sentences[n]).join(''));
  const beats = [...text.match(/^节拍：(.*)$/m)[1].matchAll(/([\d.]+) 秒/g)].map((m) => Number(m[1]));
  assert.ok(beats.length >= 2, '节拍至少有两个时间点');
  for (const t of beats) assert.ok(estimate.starts.includes(t), `${t} 秒不在 starts ${estimate.starts} 里`);
  assert.ok(text.includes('starts[k]'), '说明 starts[k] 对应 sentences[k]');
});
