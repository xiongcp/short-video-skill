import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARS_PER_SECOND, DEFAULT_SENTENCE_GAP_MS, MAX_SENTENCE_CHARS, estimateReport, VOICE_PRESETS } from '../skills/topic-to-video/scripts/lib/project.mjs';
import { splitSentences } from '../skills/topic-to-video/scripts/lib/captions.mjs';
import { MAX_MOVES, STATIC_SECONDS } from '../skills/topic-to-video/scripts/lib/match.mjs';

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

test('storyboard.md documents every template, expression, gesture, prop and cue in the schema', () => {
  const text = ref('storyboard.md');
  const templates = schema.$defs.visual.oneOf.map((v) => schema.$defs[v.$ref.split('/').at(-1)].properties.template.const);
  const cues = schema.$defs.cue.properties.do.enum;
  for (const name of [...templates, ...schema.$defs.expr.enum, ...schema.$defs.gesture.enum, ...schema.$defs.prop.enum, ...cues, 'none', 'left', 'center', 'right']) {
    assert.ok(text.includes(`\`${name}\``), name);
  }
});

test('prompt-pack.md uses the host prompt lock and reference image', () => {
  const text = ref('prompt-pack.md');
  assert.ok(text.includes('prompt_lock'));
  assert.ok(text.includes('](../assets/host/host-ref.png)'), 'links the reference image');
  for (const word of ['手绘', '墨线', '围巾', '走位', '道具', '不把英文枚举名写进提示词']) assert.ok(text.includes(word), word);
  assert.match(text, /^首帧图：[^\n]*站在上方第一张卡片/m);
});

test('storyboard.md maps sentence intent to host acting and names the storyboard warnings', () => {
  const text = ref('storyboard.md');
  for (const word of ['句意', 'VISUAL_NOT_IN_NARRATION', 'POINT_MISSING', 'MOVE_TOO_MANY', 'FOCUS_SPLIT', 'STATIC_STRETCH']) assert.ok(text.includes(word), word);
  assert.ok(text.includes(`超过 ${STATIC_SECONDS} 秒没有变化`), 'the still-picture limit');
  assert.ok(text.includes(`最多 ${MAX_MOVES} 次 \`move\``), 'the move limit');
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

test('script.md says pronunciation goes in the section it belongs to', () => {
  assert.match(ref('script.md'), /段落的 `pronunciation`/);
});

test('SKILL.md names the stick-figure host 小青', () => {
  const skill = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  assert.match(skill, /手绘火柴人“小青”/);
  assert.ok(!skill.includes('晴'));
});

test('script.md lists every voice preset with the name 讲稿.md uses, the audition command and the tone rules', () => {
  const text = ref('script.md');
  assert.match(text, /^## 配音人设与口吻$/m);
  for (const [id, { name }] of Object.entries(VOICE_PRESETS)) assert.ok(text.includes(`| \`${id}\` | ${name} |`), id);
  assert.ok(text.includes('"voice": { "provider": "undecided", "preset": "female-warm" }'));
  assert.ok(text.includes('- 配音：女声·晓晓（female-warm）'));
  assert.ok(text.includes('--audition'));
});

test('SKILL.md defaults to 女声·晓晓, takes 男声·云希 for a male voice, and asks for a new sample after a preset change', () => {
  const skill = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('女声·晓晓（`female-warm`）'));
  assert.ok(skill.includes('男声·云希（`male-sunny`）'));
  assert.ok(skill.includes('`{"provider": "undecided", "preset": "<人设>"}`'));
  assert.match(skill, /只换配音人设.*不加 `revision`.*重新出样片/);
});

test('providers.md documents {pitch}, the preset form of the edge-tts voice and the audition', () => {
  const text = ref('providers.md');
  assert.ok(text.includes('`{pitch}`'));
  assert.ok(text.includes('{"provider":"command","preset":"female-warm","command":"edge-tts --voice {voice} --rate={rate} --pitch={pitch} '));
  assert.match(text, /^### 试听人设$/m);
  assert.ok(text.includes('--audition'));
  assert.ok(!text.includes('中文常用神经音色'));
});
