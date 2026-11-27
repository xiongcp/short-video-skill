import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARS_PER_SECOND, DEFAULT_SENTENCE_GAP_MS, MAX_SENTENCE_CHARS, estimateReport, VOICE_PRESETS } from '../skills/topic-to-video/scripts/lib/project.mjs';
import { splitSentences } from '../skills/topic-to-video/scripts/lib/captions.mjs';
import { COMMON_STATES, ICONS, PROP_META } from '../skills/topic-to-video/scripts/lib/icons.mjs';
import { MAX_MOVES, STATIC_SECONDS } from '../skills/topic-to-video/scripts/lib/match.mjs';
import { SCENE_NAMES, STYLE_NAMES } from '../skills/topic-to-video/scripts/lib/world.mjs';
import { STAGE_SLOTS } from '../skills/topic-to-video/scripts/lib/stage.mjs';
import { ERROR_CODES } from '../skills/topic-to-video/scripts/render.mjs';

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

test('storyboard.md and world.md document every template, expression, gesture, prop and cue in the schema', () => {
  const text = `${ref('storyboard.md')}\n${ref('world.md')}`;
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
  for (const word of ['句意', 'VISUAL_NOT_IN_NARRATION', 'POINT_MISSING', 'MOVE_TOO_MANY', 'FOCUS_SPLIT', 'STATIC_STRETCH', 'EMPTY_START', 'NO_INTERACTION', 'GESTURE_REPEAT']) assert.ok(text.includes(word), word);
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

test('storyboard.md introduces the 呆毛, the outfits and when to leave settings.outfit out', () => {
  const text = ref('storyboard.md');
  assert.ok(text.includes('呆毛'));
  assert.ok(text.includes('settings.outfit'));
  for (const outfit of ['glasses', 'hardhat', 'chef_hat', 'apron']) assert.ok(text.includes(`\`${outfit}\``), outfit);
  assert.match(text, /用户要求时才写/);
  assert.match(text, /\| 想通了、揭晓答案 \| `amazed` \| `snap` \|/);
});

test('prompt-pack.md allows the 呆毛 and settings.outfit instead of banning them', () => {
  const text = ref('prompt-pack.md');
  assert.ok(text.includes('呆毛'));
  assert.ok(text.includes('settings.outfit'));
  assert.ok(!text.includes('人物不加头发、衣服和身体填色'));
});

test('world.md documents all 5 styles, 8 scenes, 72 built-in icons, custom prop limits, stage slots and scene recommendations', () => {
  const text = ref('world.md');
  assert.equal(ICONS.length, 72);
  assert.ok(text.includes('72 个内置物件'));
  for (const name of STYLE_NAMES) assert.ok(text.includes(`\`${name}\``), `style ${name}`);
  for (const name of SCENE_NAMES) assert.ok(text.includes(`\`${name}\``), `scene ${name}`);
  for (const name of ICONS) assert.ok(text.includes(`\`${name}\``), `icon ${name}`);
  const exclusiveStates = new Set(Object.values(PROP_META).flatMap((m) => m.states));
  for (const state of [...exclusiveStates, ...COMMON_STATES]) assert.ok(text.includes(`\`${state}\``), `state ${state}`);
  assert.ok(text.includes('4 件'));
  assert.match(text, /12\s*(?:个)?图元/);
  for (const shape of ['rect', 'circle', 'line', 'poly']) assert.ok(text.includes(`\`${shape}\``), shape);
  for (const slot of Object.keys(STAGE_SLOTS)) assert.ok(text.includes(`\`${slot}\``), `slot ${slot}`);
  for (const layer of ['ground', 'mid', 'air']) assert.ok(text.includes(`\`${layer}\``), `layer ${layer}`);
  for (const size of ['sm', 'md', 'lg']) assert.ok(text.includes(`\`${size}\``), `size ${size}`);
  assert.ok(text.includes('`links`'));
  for (const rec of ['apron', 'hardhat', 'glasses', 'female-warm', 'male-sunny']) assert.ok(text.includes(rec), rec);
});

test('SKILL.md includes 定视觉世界 and links references/world.md', () => {
  const skill = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('定视觉世界'));
  assert.ok(skill.includes('](references/world.md)'));
});

test('storyboard.md links world.md and updates opening/full rules for stage', () => {
  const text = ref('storyboard.md');
  assert.ok(text.includes('](world.md)'));
  assert.ok(text.includes('`host-left` 或 `stage`'));
  assert.ok(text.includes('`timeline`') && text.includes('`cycle`') && text.includes('`stage`'));
});

test('prompt-pack.md prepends world.style and world.scene descriptions and describes stage ground line', () => {
  const text = ref('prompt-pack.md');
  assert.ok(text.includes('world.style'));
  assert.ok(text.includes('world.scene'));
  assert.ok(text.includes('`stage`'));
  assert.ok(text.includes('同一条地面线'));
});

test('world.md documents the action card, all 10 stage/state/send cues, deletion test and warnings within budgets', () => {
  const text = ref('world.md');
  const bytes = Buffer.byteLength(text, 'utf8');
  const lines = text.replace(/\n$/, '').split('\n').length;
  assert.ok(bytes <= 10 * 1024, `world.md is ${bytes} bytes (> 10240)`);
  assert.ok(lines <= 250, `world.md is ${lines} lines (> 250)`);
  for (const term of [
    '动作卡', '删除测试', 'NO_INTERACTION', 'GESTURE_REPEAT',
    '`open`', '`carry`', '`push`', '`pull`', '`hold_up`', '`draw`', '`sit_on`', '`react`', '`state`', '`send`',
  ]) {
    assert.ok(text.includes(term), `world.md missing ${term}`);
  }
});

test('storyboard.md links to world.md action card within budgets', () => {
  const text = ref('storyboard.md');
  const bytes = Buffer.byteLength(text, 'utf8');
  const lines = text.replace(/\n$/, '').split('\n').length;
  assert.ok(bytes <= 10 * 1024, `storyboard.md is ${bytes} bytes (> 10240)`);
  assert.ok(lines <= 250, `storyboard.md is ${lines} lines (> 250)`);
  assert.ok(text.includes('动作卡'), 'storyboard.md mentions 动作卡');
  assert.ok(text.includes('](world.md)'), 'storyboard.md links world.md');
});

test('providers.md documents the sound field, licenses, QA codes and the sound audition; world.md and SKILL.md point to it', () => {
  const providers = ref('providers.md');
  assert.ok(providers.includes('## 3. 声音（`project.json` 的 `sound` 字段）'));
  for (const word of ['"sound"', 'MUSIC_LICENSE_MISSING', 'MUSIC_PATH_INVALID', 'MUSIC_FILE_MISSING', 'MUSIC_SILENT', 'MUSIC_TOO_LOUD', 'SFX_OVER_VOICE', '--audition-sound', 'calm', 'playful', 'curious', 'upbeat']) {
    assert.ok(providers.includes(word), word);
  }
  assert.match(ref('world.md'), /\]\(providers\.md\)/);
  assert.match(readFileSync(join(SKILL, 'SKILL.md'), 'utf8'), /^ {3}- 音乐：/m);
  assert.ok(ref('prompt-pack.md').includes('配乐建议'));
});

const read = (rel) => readFileSync(join(SKILL, rel), 'utf8');

test('SKILL.md makes L1 the default when doctor says it can render and links render.md', () => {
  const skill = read('SKILL.md');
  for (const word of ['l1_ready', 'tts_ready', '未审核初稿', '](references/render.md)', '需要联网']) assert.ok(skill.includes(word), word);
  assert.ok(!skill.includes('交出确认过的 L0 就是完整完成'));
});

test('render.md documents every render error code, the voice fix and the QA follow-up', () => {
  const render = read('references/render.md');
  for (const code of ERROR_CODES) assert.ok(render.includes(`\`${code}\``), code);
  for (const word of ['recommended_voice', 'preset', '--sample', 'qa.md', 'not_checked', 'npm install --prefix', '退出码 2', 'LINK_LABEL_OVER_HOST']) assert.ok(render.includes(word), word);
});

test('the description says the skill renders a video locally', () => {
  const description = read('SKILL.md').match(/^description: (.+)$/m)[1];
  assert.match(description, /渲染成片/);
  assert.match(description, /rendered MP4/);
});
