import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkProject, estimateReport, estimateSeconds, HOST_ID, isApproved, lintScript, lintVoice, SCHEMA_FIELDS, VISUAL_LIMITS, VOICE_PRESETS } from '../skills/topic-to-video/scripts/lib/project.mjs';

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

test('reports move and prop cues on a full-screen shot', () => {
  const p = minimal();
  p.shots[1].cues = [{ sentence: 1, do: 'move', target: 'left' }, { sentence: 1, do: 'prop', target: 'bulb' }];
  assert.deepEqual(placed(p), ['CUE_NEEDS_HOST /shots/1/cues/0/do', 'CUE_NEEDS_HOST /shots/1/cues/1/do']);
});

test('a move to an element is checked like a reveal', () => {
  const p = minimal();
  p.shots[0].visual = { template: 'bullets', data: { items: ['阳光', '空气'] } };
  p.shots[0].cues = [{ sentence: 0, do: 'move', target: 1 }];
  assert.deepEqual(checkProject(p), []);
  p.shots[0].cues[0].target = 2;
  assert.deepEqual(placed(p), ['CUE_TARGET_RANGE /shots/0/cues/0/target']);
  p.shots[0].cues[0].target = -1;
  assert.deepEqual(placed(p), ['CUE_TARGET_RANGE /shots/0/cues/0/target']);
});

test('reports invalid host acting values and cue targets without needing ajv', () => {
  const p = minimal();
  p.shots[0].host = { expr: 'angry', gesture: 'dance' };
  p.shots[0].cues = [
    { sentence: 0, do: 'move', target: 'top' },
    { sentence: 0, do: 'prop', target: 'umbrella' },
    { sentence: 0, do: 'expr', target: 'sleepy' },
    { sentence: 0, do: 'gesture', target: 'spin' },
    { sentence: 0, do: 'zoom', target: 0 },
  ];
  p.shots[1].cues = [{ sentence: 1, do: 'reveal', target: -1 }];
  assert.deepEqual(placed(p), [
    'INVALID_VALUE /shots/0/host/expr',
    'INVALID_VALUE /shots/0/host/gesture',
    'INVALID_VALUE /shots/0/cues/0/target',
    'INVALID_VALUE /shots/0/cues/1/target',
    'INVALID_VALUE /shots/0/cues/2/target',
    'INVALID_VALUE /shots/0/cues/3/target',
    'INVALID_VALUE /shots/0/cues/4/do',
    'CUE_TARGET_RANGE /shots/1/cues/0/target',
  ]);
});

test('a title shot can move to a preset spot but not to an element', () => {
  const p = minimal();
  p.shots[0].cues = [{ sentence: 0, do: 'move', target: 'right' }];
  assert.deepEqual(checkProject(p), []);
  p.shots[0].cues[0].target = 0;
  assert.deepEqual(codes(p), ['CUE_NOT_SUPPORTED']);
  assert.match(checkProject(p)[0].message, /left、center 或 right/);
});

test('reports a host other than the profile, with the way to migrate an old project', () => {
  assert.equal(HOST_ID, 'xiaoqing');
  const p = minimal();
  p.settings.host = 'hare';
  assert.deepEqual(placed(p), ['UNKNOWN_HOST /settings/host']);
  assert.match(checkProject(p)[0].message, /hare 直接改成 xiaoqing/);
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

test('reports text past the schema limits', () => {
  const p = minimal();
  p.title = '一'.repeat(41);
  p.sections[0].title = '一'.repeat(21);
  p.shots[1].visual = { template: 'compare', data: { left: { label: '对流层 (万米下)', rows: ['雷暴'] }, right: { label: '平流层', rows: ['平稳'] } } };
  p.shots[1].cues = [];
  assert.deepEqual(placed(p), ['TEXT_TOO_LONG /title', 'TEXT_TOO_LONG /sections/0/title', 'TEXT_TOO_LONG /shots/1/visual/data/left/label']);
});

test('reports list lengths outside the schema limits', () => {
  const p = minimal();
  p.shots[1].visual.data.items = ['一', '二', '三', '四', '五'];
  p.shots[0].layout = 'full';
  delete p.shots[0].host;
  p.shots[0].visual = { template: 'flow', data: { nodes: ['只有一个'] } };
  assert.deepEqual(placed(p), ['ITEM_COUNT /shots/0/visual/data/nodes', 'ITEM_COUNT /shots/1/visual/data/items']);
});

test('VISUAL_LIMITS matches the length limits in the schema', () => {
  const schema = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/schema/project.schema.json'), 'utf8'));
  const resolve = (node) => (node.$ref ? schema.$defs[node.$ref.split('/').at(-1)] : node);
  const limits = (raw) => {
    const node = resolve(raw);
    if (node.maxLength) return node.maxLength;
    if (node.type === 'array') return [node.minItems, node.maxItems, limits(node.items)];
    if (node.type !== 'object') return undefined;
    const out = Object.fromEntries(Object.entries(node.properties).map(([k, v]) => [k, limits(v)]).filter(([, v]) => v !== undefined));
    return Object.keys(out).length ? out : undefined;
  };
  const fromSchema = Object.fromEntries(schema.$defs.visual.oneOf.map((ref) => {
    const def = resolve(ref);
    return [def.properties.template.const, limits(def.properties.data)];
  }));
  assert.deepEqual(VISUAL_LIMITS, fromSchema);
});

test('reports fields the schema does not know, and says pronunciation belongs in a section', () => {
  const p = minimal();
  p.pronunciation = [{ term: 'HTTP', reading: 'H-T-T-P' }];
  p.sections[0].pronunciation = [{ term: 'HTTP', reading: 'H-T-T-P' }];
  p.sections[0].speaker = '晴';
  p.shots[1].cues[0].when = 'start';
  assert.deepEqual(placed(p), ['UNKNOWN_FIELD /pronunciation', 'UNKNOWN_FIELD /sections/0/speaker', 'UNKNOWN_FIELD /shots/1/cues/0/when']);
  assert.match(checkProject(p)[0].message, /pronunciation.*段落/);
});

test('SCHEMA_FIELDS matches the field names in the schema', () => {
  const schema = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/schema/project.schema.json'), 'utf8'));
  const fromSchema = Object.fromEntries(Object.keys(SCHEMA_FIELDS).map((name) => [name, Object.keys((name === 'project' ? schema : schema.$defs[name]).properties)]));
  assert.deepEqual(SCHEMA_FIELDS, fromSchema);
});

test('estimateReport gives rounded seconds per section, per shot and in total', () => {
  assert.deepEqual(estimateReport(minimal()), {
    total_seconds: 4.3,
    sections: [{ id: 's01', seconds: 4 }],
    shots: [{ id: 'sh01', seconds: 2, starts: [0] }, { id: 'sh02', seconds: 2, starts: [0] }],
  });
});

test('estimateReport lists where each sentence of a shot starts', () => {
  const p = minimal();
  p.shots = [{ ...p.shots[0], sentences: [0, 1] }];
  // 天空为什么是蓝的？ is 8 characters: 8 / 4 + 0.25 = 2.25 seconds before the second sentence
  assert.deepEqual(estimateReport(p).shots, [{ id: 'sh01', seconds: 4, starts: [0, 2.3] }]);
});

test('a project without shots yet skips the coverage check', () => {
  const p = minimal();
  p.shots = [];
  assert.deepEqual(checkProject(p), []);
});

test('warns about absolute claims only when the brief has no sources', () => {
  const p = minimal();
  p.settings.target_seconds = 5;
  p.sections[0].text = '天空为什么总是蓝的？所有阳光都会散射。';
  assert.deepEqual(lintScript(p).map((w) => `${w.code} ${w.path}`), ['ABSOLUTE_CLAIM /sections/0/text', 'ABSOLUTE_CLAIM /sections/0/text']);
  assert.match(lintScript(p)[0].message, /s01 第 0 句.*“总是”/);
  p.brief.sources = [{ id: 'src01', title: '大气光学' }];
  assert.deepEqual(lintScript(p), []);
});

test('flags 都 unless the sentence is already hedged', () => {
  const p = minimal();
  p.settings.target_seconds = 5;
  p.sections[0].text = '雷暴都发生在对流层。大部分雷暴都在下方。';
  assert.deepEqual(lintScript(p).map((w) => w.message.match(/第 \d 句/)[0]), ['第 0 句']);
});

test('limit messages name the shot, the field and where the limits are listed', () => {
  const p = minimal();
  p.sections[0].title = '一'.repeat(21);
  p.shots[1].visual = { template: 'compare', data: { left: { label: '对流层 (万米下)', rows: ['雷暴'] }, right: { label: '平流层', rows: ['平稳'] } } };
  p.shots[1].cues = [];
  assert.deepEqual(checkProject(p).map((e) => e.message), [
    '段落 s01 的标题有 21 字，上限 20 字（见 script.md）',
    '镜头 sh02 的 compare 图解 left.label 有 9 字，上限 8 字（见 storyboard.md 的图解模板表）',
  ]);
  p.shots[1].visual = { template: 'flow', data: { nodes: ['只有一个'] } };
  assert.deepEqual(checkProject(p).map((e) => e.message).slice(1), ['镜头 sh02 的 flow 图解 nodes 有 1 项，应为 2–5 项（见 storyboard.md 的图解模板表）']);
});

test('checks cue.at anchor substring and visual.data.icons names and length', () => {
  const p = minimal();
  p.settings.fps = 60;
  p.settings.resolution = '1440p';
  p.shots[0].transition = 'cut';
  p.shots[1].visual.data.icons = ['bulb', 'globe', 'clock'];
  p.shots[1].cues[0].at = '阳光';
  assert.deepEqual(checkProject(p), []);

  p.shots[1].cues[0].at = '红光';
  assert.deepEqual(placed(p), ['ANCHOR_NOT_IN_SENTENCE /shots/1/cues/0/at']);

  p.shots[1].cues[0].at = '阳光';
  p.shots[1].visual.data.icons = ['bulb', 'unknown_icon', 'clock'];
  assert.deepEqual(placed(p), ['UNKNOWN_ICON /shots/1/visual/data/icons/1']);

  p.shots[1].visual.data.icons = ['bulb', 'clock'];
  assert.deepEqual(placed(p), ['UNKNOWN_ICON /shots/1/visual/data/icons']);
});

test('VOICE_PRESETS matches the preset enum in the schema, with 晓晓 and 云希 as the female and male defaults', () => {
  const schema = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/schema/project.schema.json'), 'utf8'));
  assert.deepEqual(Object.keys(VOICE_PRESETS), schema.$defs.voice.properties.preset.enum);
  assert.deepEqual(VOICE_PRESETS['female-warm'], { voice: 'zh-CN-XiaoxiaoNeural', speed: 0.96, name: '女声·晓晓' });
  assert.deepEqual(VOICE_PRESETS['male-sunny'], { voice: 'zh-CN-YunxiNeural', speed: 0.92, name: '男声·云希' });
});

test('reports an unknown voice preset', () => {
  const p = minimal();
  p.voice = { provider: 'undecided', preset: 'male-deep' };
  assert.deepEqual(placed(p), ['INVALID_VALUE /voice/preset']);
  assert.match(checkProject(p)[0].message, /male-deep.*female-warm/);
  p.voice = { provider: 'undecided', preset: 'male-sunny', pitch: -3 };
  assert.deepEqual(placed(p), []);
});

test('warns when the voice settings would ignore the preset', () => {
  const edge = 'edge-tts --voice {voice} --rate={rate} --pitch={pitch} --text {text} --write-media {out} --write-subtitles {sub}';
  const warned = (voice) => lintVoice({ ...minimal(), voice }).map((w) => `${w.code} ${w.path}`);
  for (const voice of [
    { provider: 'undecided' },
    { provider: 'undecided', preset: 'male-sunny' },
    { provider: 'command', preset: 'male-sunny', command: edge },
    { provider: 'command', preset: 'male-sunny', command: `uvx --from edge-tts ${edge}` },
    { provider: 'undecided', preset: 'male-deep' }, // already an INVALID_VALUE error, not also a warning
  ]) assert.deepEqual(warned(voice), [], JSON.stringify(voice));
  for (const voice of [
    { provider: 'command', preset: 'male-sunny', voice: 'zh-CN-YunjianNeural', command: edge },
    { provider: 'import', preset: 'male-sunny' },
    { provider: 'openai-compatible', preset: 'male-sunny', base_url: 'https://api.example.com/v1', model: 'm', voice: 'v', api_key_env: 'SVS_TTS_API_KEY' },
    { provider: 'command', preset: 'male-sunny', command: 'say -v Tingting -o {out} {text}' },
    { provider: 'command', preset: 'male-sunny', command: 'python3 my_tts.py --text {text} --out {out}' },
  ]) assert.deepEqual(warned(voice), ['PRESET_UNUSED /voice/preset'], JSON.stringify(voice));
});
