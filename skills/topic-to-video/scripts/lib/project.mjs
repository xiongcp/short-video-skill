// Cross-reference checks and planning estimates for project.json. Field types are covered by
// schema/project.schema.json; these checks cover what a JSON Schema cannot express.
import { readFileSync } from 'node:fs';
import { countChars, splitSentences } from './captions.mjs';
import { COMMON_STATES, customPropMeta, ICONS, isCountState, PROP_META, propSupportsState, validateCustomProps } from './icons.mjs';
import { layoutStage, STAGE_SLOTS } from './stage.mjs';
import { SCENE_NAMES, STYLE_NAMES } from './world.mjs';

const PROFILE = JSON.parse(readFileSync(new URL('../../assets/host/profile.json', import.meta.url), 'utf8'));
/** The only host this skill draws; settings.host must name it (assets/host/profile.json). */
export const HOST_ID = PROFILE.id;

export const CHARS_PER_SECOND = 4;
export const DEFAULT_SENTENCE_GAP_MS = 250;
export const MAX_SENTENCE_CHARS = 30;
export const HOST_LAYOUTS = ['host-left', 'stage'];
// Words that make a claim absolute. Without sources, script.md asks for neutral wording or an open question.
// 都 counts only in a sentence without a hedge such as 大部分 or 通常.
const ABSOLUTE_WORDS = ['所有', '全部', '一切', '任何', '总是', '从不', '永远', '一定', '必然', '绝对', '完全', '彻底', '唯一', '都'];
const HEDGES = ['大部分', '大多', '多数', '基本', '通常', '一般', '往往'];
const absoluteWords = (sentence) => ABSOLUTE_WORDS.filter((w) => sentence.includes(w) && (w !== '都' || !HEDGES.some((h) => sentence.includes(h))));

const LIST_FIELD = { bullets: 'items', flow: 'nodes', bars: 'items', timeline: 'items', cycle: 'items', stage: 'objects' };

/** Elements a reveal, highlight or move cue can address: list items, flow nodes, bars, timeline/cycle items, stage objects, or the two compare columns. */
function elementCount(visual) {
  if (visual.template === 'compare') return 2;
  const tpl = visual?.template;
  const field = typeof tpl === 'string' && Object.hasOwn(LIST_FIELD, tpl) ? LIST_FIELD[tpl] : undefined;
  return field && Array.isArray(visual.data?.[field]) ? visual.data[field].length : 0;
}

const duplicates = (ids) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStageAt = (at) => (typeof at === 'string' && Object.hasOwn(STAGE_SLOTS, at))
  || (typeof at === 'number' && Number.isFinite(at) && at >= 0.08 && at <= 0.92);

// Length limits from schema/project.schema.json, kept in sync by tests/project.test.mjs. A number is the
// maximum length in characters; [min, max, item] is the allowed list length and the limit for each item.
export const ICON_NAMES = ICONS;
const COLUMN = { label: 8, rows: [1, 3, 12] };
export const VISUAL_LIMITS = {
  title: { heading: 16, sub: 24 },
  bullets: { items: [1, 4, 14], icons: [1, 4, undefined] },
  flow: { nodes: [2, 5, 6], icons: [2, 5, undefined] },
  compare: { left: COLUMN, right: COLUMN },
  number: { value: 8, label: 12 },
  bars: { items: [1, 6, { label: 6 }], unit: 4 },
  stage: { heading: 14, objects: [1, 5, { label: 8 }], links: [0, 4, undefined] },
  timeline: { items: [2, 5, { time: 6, label: 8 }] },
  cycle: { items: [3, 5, { label: 6 }] },
};
// Field names from schema/project.schema.json, kept in sync by tests/project.test.mjs. The schema rejects any
// other field, and nothing else here reads one, so without this a misplaced field passes the self-check.
export const SCHEMA_FIELDS = {
  project: ['version', 'revision', 'title', 'brief', 'settings', 'voice', 'world', 'sections', 'shots', 'checkpoints', 'jobs'],
  brief: ['topic', 'audience', 'promise', 'sources', 'open_questions'],
  source: ['id', 'title', 'where', 'note'],
  settings: ['ratio', 'target_seconds', 'lang', 'host', 'theme', 'sentence_gap_ms', 'fps', 'resolution', 'outfit'],
  voice: ['provider', 'model', 'voice', 'speed', 'base_url', 'api_key_env', 'command', 'preset', 'pitch'],
  world: ['metaphor', 'style', 'scene', 'custom_props'],
  section: ['id', 'title', 'text', 'pronunciation', 'source_ids'],
  shot: ['id', 'section', 'sentences', 'layout', 'scene', 'host', 'visual', 'cues', 'transition', 'note'],
  host: ['expr', 'gesture', 'at'],
  stage_object: ['prop', 'label', 'at', 'layer', 'size', 'state'],
  stage_link: ['from', 'to', 'style', 'label'],
  timeline_item: ['time', 'label', 'icon'],
  cycle_item: ['label', 'icon'],
  cue: ['sentence', 'at', 'do', 'target', 'value'],
  checkpoint: ['stage', 'revision', 'at', 'note'],
  job: ['id', 'provider', 'kind', 'status', 'ref', 'cost', 'at'],
};
// Voice presets from docs/lite/声音人设设计.md §3, in its table order, kept in sync with the schema enum by
// tests/project.test.mjs. `name` is how 讲稿.md and script.md call the preset; the speeds keep every preset
// within ±5% of 晓晓's pace.
export const VOICE_PRESETS = {
  'female-warm': { voice: 'zh-CN-XiaoxiaoNeural', speed: 0.96, name: '女声·晓晓' },
  'female-lively': { voice: 'zh-CN-XiaoyiNeural', speed: 0.96, name: '女声·晓伊' },
  'male-sunny': { voice: 'zh-CN-YunxiNeural', speed: 0.9, name: '男声·云希' },
  'male-passion': { voice: 'zh-CN-YunjianNeural', speed: 0.98, name: '男声·云健' },
  'male-pro': { voice: 'zh-CN-YunyangNeural', speed: 0.92, name: '男声·云扬' },
  'child-cute': { voice: 'zh-CN-YunxiaNeural', speed: 0.98, name: '童声·云夏' },
  'female-dongbei': { voice: 'zh-CN-liaoning-XiaobeiNeural', speed: 1.02, name: '东北话·晓北' },
  'female-shaanxi': { voice: 'zh-CN-shaanxi-XiaoniNeural', speed: 0.96, name: '陕西话·晓妮' },
};

/** True for an edge-tts command template that takes its voice from {voice}: the only kind of command a preset steers. */
export function isEdgeVoiceCommand(command) {
  return typeof command === 'string' && /edge[-_]?tts/i.test(command) && command.includes('{voice}');
}
const TITLE_LIMIT = 40;
const SECTION_TITLE_LIMIT = 20;

// `label` names the owner (段落 s01 的标题, 镜头 sh06 的 compare 图解); `field` is the dotted path below it.
function checkLimits(value, limit, path, add, label, where, field = '') {
  if (value === undefined || limit === undefined) return;
  const name = field ? `${label} ${field} ` : label; // a space only around the ASCII field path
  if (typeof limit === 'number') {
    const length = [...String(value)].length;
    if (length > limit) add(path, 'TEXT_TOO_LONG', `${name}有 ${length} 字，上限 ${limit} 字${where}`);
  } else if (Array.isArray(limit)) {
    if (!Array.isArray(value)) return;
    const [min, max, item] = limit;
    if (value.length < min || value.length > max) add(path, 'ITEM_COUNT', `${name}有 ${value.length} 项，应为 ${min}–${max} 项${where}`);
    value.forEach((v, i) => checkLimits(v, item, `${path}/${i}`, add, label, where, `${field}[${i}]`));
  } else if (isObject(value)) {
    Object.entries(limit).forEach(([key, l]) => checkLimits(value[key], l, `${path}/${key}`, add, label, where, field ? `${field}.${key}` : key));
  }
}

// The fields the checks below read. A project missing one gets MISSING_FIELD errors instead of a crash;
// nested fields are checked only when the top level is complete.
export function checkShape(project) {
  const errors = [];
  const need = (ok, path, what) => { if (!ok) errors.push({ path, code: 'MISSING_FIELD', message: `缺少或格式不对：${what}，字段见 schema/project.schema.json` }); };
  need(isObject(project), '', 'project.json 应是一个对象');
  if (errors.length) return errors;
  need(Number.isInteger(project.revision), '/revision', 'revision 应是整数');
  need(Array.isArray(project.brief?.sources), '/brief/sources', 'brief.sources 应是数组');
  need(typeof project.settings?.target_seconds === 'number', '/settings/target_seconds', 'settings.target_seconds 应是数字');
  ['sections', 'shots', 'checkpoints'].forEach((key) => need(Array.isArray(project[key]), `/${key}`, `${key} 应是数组`));
  if (errors.length) return errors;
  need(project.world === undefined || isObject(project.world), '/world', 'world 应是对象');
  project.brief.sources.forEach((s, i) => need(isObject(s), `/brief/sources/${i}`, '来源应是对象'));
  project.sections.forEach((s, i) => need(typeof s?.text === 'string', `/sections/${i}/text`, `段落 ${s?.id ?? i} 的 text 应是字符串`));
  project.checkpoints.forEach((c, i) => need(isObject(c), `/checkpoints/${i}`, '确认记录应是对象'));
  project.shots.forEach((shot, i) => {
    need(Array.isArray(shot?.sentences) && shot.sentences.every(Number.isInteger), `/shots/${i}/sentences`, `镜头 ${shot?.id ?? i} 的 sentences 应是整数数组`);
    need(isObject(shot?.visual), `/shots/${i}/visual`, `镜头 ${shot?.id ?? i} 缺少 visual`);
    const tpl = shot?.visual?.template;
    const field = typeof tpl === 'string' && Object.hasOwn(LIST_FIELD, tpl) ? LIST_FIELD[tpl] : undefined;
    if (field) need(Array.isArray(shot.visual.data?.[field]), `/shots/${i}/visual/data/${field}`, `镜头 ${shot.id ?? i} 的 visual.data.${field} 应是数组`);
    if (shot?.visual?.template === 'stage' && Array.isArray(shot.visual.data?.objects)) {
      need(shot.visual.data.objects.every(isObject), `/shots/${i}/visual/data/objects`, `镜头 ${shot.id ?? i} 的 stage.objects 应是对象数组`);
      need(shot.visual.data?.links === undefined || (Array.isArray(shot.visual.data.links) && shot.visual.data.links.every(isObject)),
        `/shots/${i}/visual/data/links`, `镜头 ${shot.id ?? i} 的 stage.links 应是对象数组`);
    }
    if ((shot?.visual?.template === 'timeline' || shot?.visual?.template === 'cycle') && Array.isArray(shot.visual.data?.items)) {
      need(shot.visual.data.items.every(isObject), `/shots/${i}/visual/data/items`, `镜头 ${shot.id ?? i} 的 items 应是对象数组`);
    }
    need(shot?.cues === undefined || (Array.isArray(shot.cues) && shot.cues.every(isObject)), `/shots/${i}/cues`, `镜头 ${shot?.id ?? i} 的 cues 应是对象数组`);
  });
  return errors;
}

const WORLD_METAPHOR_LIMIT = 60;
const STAGE_LAYERS = ['ground', 'mid', 'air'];
const STAGE_SIZES = ['sm', 'md', 'lg'];
const LINK_STYLES = ['solid', 'dashed'];

function checkWorld(world, add) {
  if (typeof world.metaphor !== 'string' || !world.metaphor.trim()) {
    add('/world/metaphor', 'INVALID_VALUE', '视觉世界缺少一句话比喻 metaphor（见 world.md）');
  } else {
    checkLimits(world.metaphor, WORLD_METAPHOR_LIMIT, '/world/metaphor', add, '视觉世界比喻', '（见 world.md）');
  }
  if (!STYLE_NAMES.includes(world.style)) {
    add('/world/style', 'INVALID_VALUE', `视觉世界风格 ${world.style ?? '空'} 不存在，可选 ${STYLE_NAMES.join('、')}（见 world.md）`);
  }
  if (!SCENE_NAMES.includes(world.scene)) {
    add('/world/scene', 'INVALID_VALUE', `视觉世界场景 ${world.scene ?? '空'} 不存在，可选 ${SCENE_NAMES.join('、')}（见 world.md）`);
  }
  if (world.custom_props !== undefined) {
    for (const err of validateCustomProps(world.custom_props)) {
      const ptr = `/${err.path.replace(/\[(\d+)\]/g, '/$1').replace(/\./g, '/')}`;
      add(ptr, err.code, err.message);
    }
  }
}

function checkStageShots(project, add) {
  const customProps = Array.isArray(project.world?.custom_props) ? project.world.custom_props.filter(isObject) : [];
  const customIds = new Set(customProps.map((p) => p.id).filter((id) => typeof id === 'string'));
  let prevHostX = 320;

  project.shots.forEach((shot, i) => {
    const at = `/shots/${i}`;
    const isStageLayout = shot.layout === 'stage';
    const isStageTemplate = shot.visual?.template === 'stage';
    if (isStageLayout && !project.world) {
      add(`${at}/layout`, 'STAGE_NEEDS_WORLD', `镜头 ${shot.id} 用了 stage 版式，但项目还没定视觉世界 world（见 world.md）`);
    }
    if (isStageLayout && !isStageTemplate) {
      add(`${at}/visual/template`, 'STAGE_LAYOUT_MISMATCH', `镜头 ${shot.id} 是 stage 版式，visual.template 必须是 stage`);
    } else if (!isStageLayout && isStageTemplate) {
      add(`${at}/layout`, 'STAGE_LAYOUT_MISMATCH', `镜头 ${shot.id} 用了 stage 模板，layout 必须是 stage`);
    }
    if (shot.scene !== undefined && !isStageLayout) {
      add(`${at}/scene`, 'STAGE_LAYOUT_MISMATCH', `镜头 ${shot.id} 的 scene 只能写在 stage 镜头上`);
    } else if (shot.scene !== undefined && !SCENE_NAMES.includes(shot.scene)) {
      add(`${at}/scene`, 'INVALID_VALUE', `镜头 ${shot.id} 的场景 ${shot.scene ?? '空'} 不存在，可选 ${SCENE_NAMES.join('、')}（见 world.md）`);
    }
    if (isStageLayout && !isObject(shot.host)) {
      add(`${at}/host`, 'STAGE_LAYOUT_MISMATCH', `镜头 ${shot.id} 是 stage 版式，必须写 host（见 world.md）`);
    }
    if (isObject(shot.host) && shot.host.at !== undefined && !isStageAt(shot.host.at)) {
      add(`${at}/host/at`, 'INVALID_VALUE', `镜头 ${shot.id} 的 host.at ${shot.host.at} 不合法，写槽位（${Object.keys(STAGE_SLOTS).join('、')}）或 0.08–0.92 的比例`);
    }

    if (!isStageTemplate) {
      if (shot.layout === 'full') prevHostX = 320;
      return;
    }

    const objects = shot.visual.data?.objects ?? [];
    let stageValidForLayout = true;
    objects.forEach((obj, k) => {
      const hasProp = typeof obj.prop === 'string' && (ICON_NAMES.includes(obj.prop) || customIds.has(obj.prop));
      if (!hasProp) {
        stageValidForLayout = false;
        add(`${at}/visual/data/objects/${k}/prop`, 'UNKNOWN_ICON', `镜头 ${shot.id} 的物件 ${obj.prop ?? '空'} 不在内置 ${ICON_NAMES.length} 个物件或 world.custom_props 里`);
      }
      if (!isStageAt(obj.at)) {
        add(`${at}/visual/data/objects/${k}/at`, 'INVALID_VALUE', `镜头 ${shot.id} 的物件站位 ${obj.at ?? '空'} 不合法，写槽位（${Object.keys(STAGE_SLOTS).join('、')}）或 0.08–0.92 的比例`);
      }
      if (obj.layer !== undefined && !STAGE_LAYERS.includes(obj.layer)) {
        add(`${at}/visual/data/objects/${k}/layer`, 'INVALID_VALUE', `镜头 ${shot.id} 的高度层 ${obj.layer} 不合法，可选 ${STAGE_LAYERS.join('、')}`);
      }
      if (obj.size !== undefined && !STAGE_SIZES.includes(obj.size)) {
        add(`${at}/visual/data/objects/${k}/size`, 'INVALID_VALUE', `镜头 ${shot.id} 的尺寸 ${obj.size} 不合法，可选 ${STAGE_SIZES.join('、')}`);
      }
      if (obj.state !== undefined && hasProp && !propSupportsState(obj.prop, obj.state, customProps)) {
        const metaStates = Object.hasOwn(PROP_META, obj.prop) ? PROP_META[obj.prop].states : [];
        const supported = [...metaStates, ...COMMON_STATES, 'count:<值>'].join('、');
        add(`${at}/visual/data/objects/${k}/state`, 'STATE_UNSUPPORTED', `镜头 ${shot.id} 的物件 ${obj.prop} 不支持状态 ${obj.state}，可用 ${supported}`);
      }
    });

    (shot.visual.data?.links ?? []).forEach((lnk, k) => {
      if (!Number.isInteger(lnk.from) || lnk.from < 0 || lnk.from >= objects.length) {
        add(`${at}/visual/data/links/${k}/from`, 'INVALID_VALUE', `镜头 ${shot.id} 的连线起点 ${lnk.from ?? '空'} 超出物件个数 ${objects.length}`);
      }
      if (!Number.isInteger(lnk.to) || lnk.to < 0 || lnk.to >= objects.length || lnk.to === lnk.from) {
        add(`${at}/visual/data/links/${k}/to`, 'INVALID_VALUE', `镜头 ${shot.id} 的连线终点 ${lnk.to ?? '空'} 必须是不同于起点的物件序号`);
      }
      if (lnk.style !== undefined && !LINK_STYLES.includes(lnk.style)) {
        add(`${at}/visual/data/links/${k}/style`, 'INVALID_VALUE', `镜头 ${shot.id} 的连线样式 ${lnk.style} 不合法，可选 ${LINK_STYLES.join('、')}`);
      }
    });

    if (isStageLayout && stageValidForLayout && objects.length > 0) {
      const staged = layoutStage(shot.visual.data, { hostAt: shot.host?.at, prevHostX, customProps });
      if (staged.crowded) {
        add(`${at}/visual/data/objects`, 'STAGE_CROWDED', `镜头 ${shot.id} 的舞台太挤，缩到 0.6 倍仍放不下全部物件和主持人；减少物件或拆成两个镜头（见 world.md）`);
      }
      prevHostX = staged.hostX;
    }
  });
}

/** @returns {{path: string, code: string, message: string}[]} */
export function checkProject(project) {
  const shape = checkShape(project);
  if (shape.length) return shape;
  const errors = [];
  const add = (path, code, message) => errors.push({ path, code, message });
  checkFields(project, add);
  if (project.world !== undefined) checkWorld(project.world, add);
  const preset = project.voice?.preset;
  if (preset !== undefined && !Object.hasOwn(VOICE_PRESETS, preset)) {
    add('/voice/preset', 'INVALID_VALUE', `配音人设 ${preset} 不存在，可选 ${Object.keys(VOICE_PRESETS).join('、')}（见 script.md 的配音人设一节）`);
  }
  const outfit = project.settings.outfit;
  if (outfit !== undefined && !PROFILE.outfits.includes(outfit)) {
    add('/settings/outfit', 'INVALID_VALUE', `服装 ${outfit} 不存在，可选 ${PROFILE.outfits.join('、')}（见 storyboard.md 的主持人一节）`);
  }
  if (project.settings.host !== HOST_ID) {
    add('/settings/host', 'UNKNOWN_HOST', `settings.host 是 ${project.settings.host ?? '空'}，主持人只有 ${HOST_ID}（${PROFILE.name}）；旧项目的 hare 直接改成 ${HOST_ID}（见 script.md）`);
  }
  checkLimits(project.title, TITLE_LIMIT, '/title', add, '项目标题', '（见 script.md）');
  project.sections.forEach((s, i) => checkLimits(s.title, SECTION_TITLE_LIMIT, `/sections/${i}/title`, add, `段落 ${s.id} 的标题`, '（见 script.md）'));
  project.shots.forEach((shot, i) => {
    const tpl = shot.visual.template;
    const limit = typeof tpl === 'string' && Object.hasOwn(VISUAL_LIMITS, tpl) ? VISUAL_LIMITS[tpl] : undefined;
    checkLimits(shot.visual.data, limit, `/shots/${i}/visual/data`, add,
      `镜头 ${shot.id} 的 ${tpl} 图解`, '（见 storyboard.md 的图解模板表）');
  });
  duplicates(project.sections.map((s) => s.id)).forEach((id) => add('/sections', 'DUPLICATE_ID', `段落 ${id} 重复`));
  duplicates(project.shots.map((s) => s.id)).forEach((id) => add('/shots', 'DUPLICATE_ID', `镜头 ${id} 重复`));
  const sources = new Set(project.brief.sources.map((s) => s.id));
  project.sections.forEach((s, i) => (s.source_ids ?? []).forEach((id) => {
    if (!sources.has(id)) add(`/sections/${i}/source_ids`, 'UNKNOWN_SOURCE', `段落 ${s.id} 引用了不存在的来源 ${id}`);
  }));
  if (project.shots.length) checkCoverage(project, add); // empty after step 1, before the storyboard
  checkStageShots(project, add);
  const customProps = Array.isArray(project.world?.custom_props) ? project.world.custom_props.filter(isObject) : [];
  const sentencesBySection = new Map(project.sections.map((s) => [s.id, splitSentences(s.text)]));
  project.shots.forEach((shot, i) => checkCues(shot, `/shots/${i}`, sentencesBySection.get(shot.section) ?? [], add, customProps));
  project.checkpoints.forEach((c, i) => {
    if (c.revision > project.revision) add(`/checkpoints/${i}/revision`, 'CHECKPOINT_REVISION', `确认记录的版本 ${c.revision} 比项目当前版本 ${project.revision} 还新`);
  });
  return errors;
}

// Every object an L0 run writes, paired with the SCHEMA_FIELDS entry that lists its fields.
function checkFields(project, add) {
  const objects = [
    [project, 'project', '', 'project.json'],
    [project.brief, 'brief', '/brief', 'brief'],
    [project.settings, 'settings', '/settings', 'settings'],
    [project.voice, 'voice', '/voice', 'voice'],
    ...(isObject(project.world) ? [[project.world, 'world', '/world', 'world']] : []),
    ...project.brief.sources.map((s, i) => [s, 'source', `/brief/sources/${i}`, `来源 ${s.id ?? i}`]),
    ...project.sections.map((s, i) => [s, 'section', `/sections/${i}`, `段落 ${s.id}`]),
    ...project.shots.flatMap((shot, i) => {
      const list = [[shot, 'shot', `/shots/${i}`, `镜头 ${shot.id}`]];
      if (isObject(shot.host)) list.push([shot.host, 'host', `/shots/${i}/host`, `镜头 ${shot.id} 的 host`]);
      if (shot.visual?.template === 'stage' && isObject(shot.visual.data)) {
        if (Array.isArray(shot.visual.data.objects)) {
          list.push(...shot.visual.data.objects.map((o, k) => [o, 'stage_object', `/shots/${i}/visual/data/objects/${k}`, `镜头 ${shot.id} 的物件 ${k}`]));
        }
        if (Array.isArray(shot.visual.data.links)) {
          list.push(...shot.visual.data.links.map((l, k) => [l, 'stage_link', `/shots/${i}/visual/data/links/${k}`, `镜头 ${shot.id} 的连线 ${k}`]));
        }
      }
      if ((shot.visual?.template === 'timeline' || shot.visual?.template === 'cycle') && Array.isArray(shot.visual.data?.items)) {
        const schemaKey = shot.visual.template === 'timeline' ? 'timeline_item' : 'cycle_item';
        list.push(...shot.visual.data.items.map((it, k) => [it, schemaKey, `/shots/${i}/visual/data/items/${k}`, `镜头 ${shot.id} 的元素 ${k}`]));
      }
      list.push(...(shot.cues ?? []).map((c, j) => [c, 'cue', `/shots/${i}/cues/${j}`, `镜头 ${shot.id} 的 cue ${j}`]));
      return list;
    }),
    ...project.checkpoints.map((c, i) => [c, 'checkpoint', `/checkpoints/${i}`, `确认记录 ${i}`]),
    ...(Array.isArray(project.jobs) ? project.jobs : []).map((j, i) => [j, 'job', `/jobs/${i}`, `任务 ${j?.id ?? i}`]),
  ];
  for (const [value, name, path, owner] of objects) {
    if (!isObject(value)) continue;
    Object.keys(value).filter((key) => !SCHEMA_FIELDS[name].includes(key)).forEach((key) => add(`${path}/${key}`, 'UNKNOWN_FIELD',
      `${owner}：多了 schema 里没有的字段 ${key}${key === 'pronunciation' ? '；读音表写在所在段落的 pronunciation 里（见 script.md）' : '，字段见 schema/project.schema.json'}`));
  }
}

// Shots walk the sections in order and cover every sentence exactly once.
function checkCoverage(project, add) {
  const order = project.sections.map((s) => s.id);
  const counts = project.sections.map((s) => splitSentences(s.text).length);
  let current = 0;
  let next = 0;
  const closeUntil = (end) => {
    for (; current < end; current += 1, next = 0) {
      if (next < counts[current]) add(`/sections/${current}`, 'SENTENCE_GAP', `段落 ${order[current]} 的第 ${next}–${counts[current] - 1} 句没有镜头`);
    }
  };
  project.shots.forEach((shot, i) => {
    const idx = order.indexOf(shot.section);
    if (idx < 0) return add(`/shots/${i}/section`, 'UNKNOWN_SECTION', `镜头 ${shot.id} 指向不存在的段落 ${shot.section}`);
    if (idx < current) return add(`/shots/${i}/section`, 'SECTION_ORDER', `镜头 ${shot.id} 回到了更早的段落 ${shot.section}`);
    closeUntil(idx);
    shot.sentences.forEach((s, j) => {
      const at = `/shots/${i}/sentences/${j}`;
      if (s >= counts[idx]) return add(at, 'SENTENCE_RANGE', `镜头 ${shot.id} 的第 ${s} 句超出段落 ${shot.section}（共 ${counts[idx]} 句）`);
      if (s < next) add(at, 'SENTENCE_OVERLAP', `镜头 ${shot.id} 的第 ${s} 句已经属于前面的镜头`);
      else if (s > next) add(at, 'SENTENCE_GAP', `镜头 ${shot.id} 应从第 ${next} 句接着，实际是第 ${s} 句`);
      next = Math.max(next, s + 1);
    });
  });
  closeUntil(order.length);
}

const HOST_CUES = ['expr', 'gesture', 'move', 'prop'];
export const INTERACTION_CUES = ['open', 'carry', 'push', 'pull', 'hold_up', 'draw', 'sit_on', 'react'];
export const SENDABLE_PROPS = ['package', 'doc', 'mail', 'ticket', 'money', 'key'];
export const DRAWABLE_PROPS = ['whiteboard', 'clipboard', 'doc', 'book'];
const CUE_ACTIONS = ['reveal', 'highlight', ...HOST_CUES, ...INTERACTION_CUES, 'state', 'send'];
const SPOTS = ['left', 'center', 'right'];

/** Lists the stage interaction cues supported by `propId` at `layer` (defaults to the prop's natural layer). */
export function supportedInteractions(propId, layer, customProps = []) {
  if (typeof propId !== 'string') return [];
  const builtin = Object.hasOwn(PROP_META, propId) ? PROP_META[propId] : null;
  const customDef = !builtin && Array.isArray(customProps) ? customProps.find((p) => p?.id === propId) : null;
  if (!builtin && !customDef) return [];
  const meta = builtin ?? customPropMeta(customDef);
  const resolvedLayer = STAGE_LAYERS.includes(layer) ? layer : meta.layer;
  return INTERACTION_CUES.filter((action) => {
    if (action === 'open') return Boolean(builtin && builtin.states.includes('open'));
    if (action === 'carry' || action === 'hold_up') return meta.carry === true;
    if (action === 'push' || action === 'pull') return resolvedLayer === 'ground';
    if (action === 'draw') return Boolean(builtin && DRAWABLE_PROPS.includes(propId));
    if (action === 'sit_on') return Boolean(meta.anchors?.seat);
    return true;
  });
}

function checkInteractionCue(shot, cue, path, customProps, customIds, add) {
  if (!HOST_LAYOUTS.includes(shot.layout)) {
    return add(`${path}/do`, 'CUE_NEEDS_HOST', `镜头 ${shot.id} 不显示主持人，不能用 ${cue.do} cue（互动 cue 仅支持 stage 版式）`);
  }
  if (shot.layout !== 'stage') {
    return add(`${path}/do`, 'INTERACTION_INVALID', `镜头 ${shot.id} 是 ${shot.layout} 版式，互动 cue ${cue.do} 只支持 stage 舞台版式`);
  }
  if (cue.value !== undefined) {
    add(`${path}/value`, 'INVALID_VALUE', `镜头 ${shot.id} 的 ${cue.do} cue 不能写 value`);
  }
  if (cue.do === 'carry' && cue.target === 'none') return;
  if (!Number.isInteger(cue.target)) {
    return add(`${path}/target`, 'INVALID_VALUE', `镜头 ${shot.id} 的 ${cue.do} 目标应是物件序号（从 0 开始）${cue.do === 'carry' ? '或 none' : ''}`);
  }
  if (shot.visual?.template !== 'stage') return;
  const objects = shot.visual.data?.objects ?? [];
  if (cue.target < 0 || cue.target >= objects.length) {
    return add(`${path}/target`, 'CUE_TARGET_RANGE', `镜头 ${shot.id} 的 cue 目标 ${cue.target} 超出元素个数 ${objects.length}`);
  }
  const obj = objects[cue.target];
  const hasProp = typeof obj?.prop === 'string' && (ICON_NAMES.includes(obj.prop) || customIds.has(obj.prop));
  if (!hasProp) return;
  const supported = supportedInteractions(obj.prop, obj.layer, customProps);
  if (!supported.includes(cue.do)) {
    add(`${path}/do`, 'INTERACTION_INVALID', `镜头 ${shot.id} 的物件 ${obj.prop} 不支持 ${cue.do}，可用 ${supported.join('、')}`);
  }
}

function checkStateCue(shot, cue, path, customProps, customIds, add) {
  const hasValue = typeof cue.value === 'string' && cue.value.length > 0;
  if (!hasValue) {
    add(`${path}/value`, 'INVALID_VALUE', `镜头 ${shot.id} 的 state cue 必须写 value`);
  }
  if (!Number.isInteger(cue.target)) {
    return add(`${path}/target`, 'INVALID_VALUE', `镜头 ${shot.id} 的 state 目标应是元素序号（从 0 开始）`);
  }
  const count = elementCount(shot.visual);
  if (count === 0) {
    return add(`${path}/do`, 'CUE_NOT_SUPPORTED', `模板 ${shot.visual.template} 没有可单独指定的元素`);
  }
  if (cue.target < 0 || cue.target >= count) {
    return add(`${path}/target`, 'CUE_TARGET_RANGE', `镜头 ${shot.id} 的 cue 目标 ${cue.target} 超出元素个数 ${count}`);
  }
  if (!hasValue) return;
  if (shot.visual.template === 'stage') {
    const obj = shot.visual.data?.objects?.[cue.target];
    const hasProp = typeof obj?.prop === 'string' && (ICON_NAMES.includes(obj.prop) || customIds.has(obj.prop));
    if (hasProp && !propSupportsState(obj.prop, cue.value, customProps)) {
      const metaStates = Object.hasOwn(PROP_META, obj.prop) ? PROP_META[obj.prop].states : [];
      const supported = [...metaStates, ...COMMON_STATES, 'count:<值>'].join('、');
      add(`${path}/value`, 'STATE_UNSUPPORTED', `镜头 ${shot.id} 的物件 ${obj.prop} 不支持状态 ${cue.value}，可用 ${supported}`);
    }
    return;
  }
  if (!COMMON_STATES.includes(cue.value) && !isCountState(cue.value)) {
    const supported = [...COMMON_STATES, 'count:<值>'].join('、');
    add(`${path}/value`, 'STATE_UNSUPPORTED', `模板 ${shot.visual.template} 只支持通用状态，不支持 ${cue.value}，可用 ${supported}`);
  }
}

function checkSendCue(shot, cue, path, customProps, add) {
  if (typeof cue.value !== 'string' || !cue.value.length) {
    add(`${path}/value`, 'INVALID_VALUE', `镜头 ${shot.id} 的 send cue 必须写 value`);
  } else {
    const customDef = customProps.find((p) => p?.id === cue.value);
    const carryableCustom = customDef ? customPropMeta(customDef).carry : false;
    if (!SENDABLE_PROPS.includes(cue.value) && !carryableCustom) {
      add(`${path}/value`, 'INVALID_VALUE', `镜头 ${shot.id} 的 send 物件 ${cue.value} 不可运送，可选 ${SENDABLE_PROPS.join('、')} 或可拿起的自定义道具（height ≤ 0.45）`);
    }
  }
  if (shot.visual?.template === 'stage') {
    const links = Array.isArray(shot.visual.data?.links) ? shot.visual.data.links : [];
    if (!Number.isInteger(cue.target)) {
      return add(`${path}/target`, 'INVALID_VALUE', `镜头 ${shot.id} 的 send 目标在 stage 里应是连线序号（从 0 开始）`);
    }
    if (links.length === 0) {
      return add(`${path}/do`, 'CUE_NOT_SUPPORTED', `镜头 ${shot.id} 的 stage 没有连线 links，不能用 send cue`);
    }
    if (cue.target < 0 || cue.target >= links.length) {
      return add(`${path}/target`, 'CUE_TARGET_RANGE', `镜头 ${shot.id} 的 send 目标 ${cue.target} 超出连线个数 ${links.length}`);
    }
    return;
  }
  if (shot.visual?.template === 'flow') {
    const nodes = Array.isArray(shot.visual.data?.nodes) ? shot.visual.data.nodes : [];
    if (!Number.isInteger(cue.target)) {
      return add(`${path}/target`, 'INVALID_VALUE', `镜头 ${shot.id} 的 send 目标在 flow 里应是箭头指向的节点序号（从 1 开始）`);
    }
    if (cue.target < 1 || cue.target >= nodes.length) {
      return add(`${path}/target`, 'CUE_TARGET_RANGE', `镜头 ${shot.id} 的 send 目标 ${cue.target} 超出 flow 节点箭头范围（可选 1–${Math.max(1, nodes.length - 1)}）`);
    }
    return;
  }
  add(`${path}/do`, 'CUE_NOT_SUPPORTED', `模板 ${shot.visual.template} 没有连线或箭头，不能用 send cue（仅支持 stage 和 flow）`);
}

function checkCues(shot, at, sentences, add, customProps = []) {
  const customIds = new Set(customProps.map((p) => p.id).filter((id) => typeof id === 'string'));
  if (shot.visual.data?.icons !== undefined) {
    const icons = shot.visual.data.icons;
    const count = elementCount(shot.visual);
    if (!Array.isArray(icons) || icons.length !== count) {
      add(`${at}/visual/data/icons`, 'UNKNOWN_ICON', `镜头 ${shot.id} 的 icons 个数应等于元素个数 ${count}`);
    } else {
      icons.forEach((name, k) => {
        if (!ICON_NAMES.includes(name)) add(`${at}/visual/data/icons/${k}`, 'UNKNOWN_ICON', `镜头 ${shot.id} 的图标 ${name ?? '空'} 不在内置 ${ICON_NAMES.length} 个图标里`);
      });
    }
  }
  if ((shot.visual.template === 'timeline' || shot.visual.template === 'cycle') && Array.isArray(shot.visual.data?.items)) {
    shot.visual.data.items.forEach((item, k) => {
      if (item?.icon !== undefined && !ICON_NAMES.includes(item.icon)) {
        add(`${at}/visual/data/items/${k}/icon`, 'UNKNOWN_ICON', `镜头 ${shot.id} 的图标 ${item.icon ?? '空'} 不在内置 ${ICON_NAMES.length} 个图标里`);
      }
    });
  }
  if (isObject(shot.host)) {
    if (!PROFILE.expressions.includes(shot.host.expr)) add(`${at}/host/expr`, 'INVALID_VALUE', `镜头 ${shot.id} 的表情 ${shot.host.expr ?? '空'} 不在可选列表里（见 storyboard.md 的主持人一节）`);
    if (!PROFILE.gestures.includes(shot.host.gesture)) add(`${at}/host/gesture`, 'INVALID_VALUE', `镜头 ${shot.id} 的动作 ${shot.host.gesture ?? '空'} 不在可选列表里（见 storyboard.md 的主持人一节）`);
  }
  (shot.cues ?? []).forEach((cue, j) => {
    const path = `${at}/cues/${j}`;
    if (!shot.sentences.includes(cue.sentence)) add(`${path}/sentence`, 'CUE_OUTSIDE_SHOT', `镜头 ${shot.id} 的 cue 指向不属于本镜头的第 ${cue.sentence} 句`);
    if (cue.at !== undefined) {
      const sentenceText = sentences[cue.sentence] ?? '';
      if (typeof cue.at !== 'string' || !cue.at.length || !sentenceText.includes(cue.at)) {
        add(`${path}/at`, 'ANCHOR_NOT_IN_SENTENCE', `镜头 ${shot.id} 第 ${cue.sentence} 句里找不到锚点词“${cue.at ?? ''}”`);
      }
    }
    if (!CUE_ACTIONS.includes(cue.do)) return add(`${path}/do`, 'INVALID_VALUE', `镜头 ${shot.id} 的 cue 动作 ${cue.do ?? '空'} 不存在，可选 ${CUE_ACTIONS.join('、')}`);
    if (INTERACTION_CUES.includes(cue.do)) return checkInteractionCue(shot, cue, path, customProps, customIds, add);
    if (cue.do === 'state') return checkStateCue(shot, cue, path, customProps, customIds, add);
    if (cue.do === 'send') return checkSendCue(shot, cue, path, customProps, add);
    if (cue.value !== undefined) add(`${path}/value`, 'INVALID_VALUE', `镜头 ${shot.id} 的 ${cue.do} cue 不能写 value`);
    if (HOST_CUES.includes(cue.do) && !HOST_LAYOUTS.includes(shot.layout)) {
      add(`${path}/do`, 'CUE_NEEDS_HOST', `镜头 ${shot.id} 不显示主持人，不能用 ${cue.do} cue`);
    }
    // move takes an element number or a preset spot (left, center, right); only a number has to exist.
    if (cue.do === 'reveal' || cue.do === 'highlight' || (cue.do === 'move' && Number.isInteger(cue.target))) {
      if (!Number.isInteger(cue.target)) return add(`${path}/target`, 'INVALID_VALUE', `镜头 ${shot.id} 的 ${cue.do} 目标应是元素序号（从 0 开始）`);
      const count = elementCount(shot.visual);
      const instead = cue.do === 'move' ? '；move 改用 left、center 或 right' : '';
      if (count === 0) add(`${path}/do`, 'CUE_NOT_SUPPORTED', `模板 ${shot.visual.template} 没有可单独指定的元素${instead}`);
      else if (cue.target < 0 || cue.target >= count) add(`${path}/target`, 'CUE_TARGET_RANGE', `镜头 ${shot.id} 的 cue 目标 ${cue.target} 超出元素个数 ${count}`);
    } else if (cue.do === 'move' && !SPOTS.includes(cue.target)) {
      add(`${path}/target`, 'INVALID_VALUE', `镜头 ${shot.id} 的 move 目标 ${cue.target ?? '空'} 不合法，写元素序号或 ${SPOTS.join('、')}`);
    } else if (cue.do === 'expr' && !PROFILE.expressions.includes(cue.target)) {
      add(`${path}/target`, 'INVALID_VALUE', `镜头 ${shot.id} 的表情 ${cue.target ?? '空'} 不在可选列表里（见 storyboard.md 的主持人一节）`);
    } else if (cue.do === 'gesture' && !PROFILE.gestures.includes(cue.target)) {
      add(`${path}/target`, 'INVALID_VALUE', `镜头 ${shot.id} 的动作 ${cue.target ?? '空'} 不在可选列表里（见 storyboard.md 的主持人一节）`);
    } else if (cue.do === 'prop' && cue.target !== 'none' && !PROFILE.props.includes(cue.target)) {
      add(`${path}/target`, 'INVALID_VALUE', `镜头 ${shot.id} 的道具 ${cue.target ?? '空'} 不在可选列表里，放下写 none（见 storyboard.md 的主持人一节）`);
    }
  });
}

/** Planning estimate for some sentences of one section: characters at 4 per second plus a gap after each sentence. */
function estimateSentences(project, section, indexes) {
  const gap = (project.settings.sentence_gap_ms ?? DEFAULT_SENTENCE_GAP_MS) / 1000;
  const sentences = splitSentences(section.text);
  return indexes.reduce((sum, i) => sum + countChars(sentences[i] ?? '') / CHARS_PER_SECOND + gap, 0);
}

/** Planning estimate for the whole project, in seconds. */
export function estimateSeconds(project) {
  return project.sections.reduce((sum, s) => sum + estimateSentences(project, s, splitSentences(s.text).map((_, i) => i)), 0);
}

/** Planning estimates the agent copies into 讲稿.md, 分镜.md and 提示词包.md: whole seconds per section and shot,
 *  where each sentence of a shot starts (one decimal), and one decimal in total. */
export function estimateReport(project) {
  const bySection = new Map(project.sections.map((s) => [s.id, s]));
  return {
    total_seconds: Math.round(estimateSeconds(project) * 10) / 10,
    sections: project.sections.map((s) => ({ id: s.id, seconds: Math.round(estimateSentences(project, s, splitSentences(s.text).map((_, i) => i))) })),
    shots: project.shots.filter((shot) => bySection.has(shot.section)).map((shot) => {
      const section = bySection.get(shot.section);
      const starts = shot.sentences.map((_, k) => Math.round(estimateSentences(project, section, shot.sentences.slice(0, k)) * 10) / 10);
      return { id: shot.id, seconds: Math.round(estimateSentences(project, section, shot.sentences)), starts };
    }),
  };
}

/** Advisory checks from references/script.md; these are warnings, not errors. Empty when checkProject reports MISSING_FIELD. */
export function lintScript(project) {
  if (checkShape(project).length) return [];
  const warnings = [];
  project.sections.forEach((s, i) => splitSentences(s.text).forEach((sentence, j) => {
    const length = [...sentence].length;
    if (length > MAX_SENTENCE_CHARS) warnings.push({ path: `/sections/${i}/text`, code: 'SENTENCE_TOO_LONG', message: `段落 ${s.id} 第 ${j} 句有 ${length} 字，超过 ${MAX_SENTENCE_CHARS} 字` });
    const absolute = project.brief.sources.length ? [] : absoluteWords(sentence);
    if (absolute.length) warnings.push({ path: `/sections/${i}/text`, code: 'ABSOLUTE_CLAIM', message: `段落 ${s.id} 第 ${j} 句用了${absolute.map((w) => `“${w}”`).join('')}；没有来源时改成中性说法，或写进 brief.open_questions` });
  }));
  const estimate = estimateSeconds(project);
  const target = project.settings.target_seconds;
  if (Math.abs(estimate - target) > target * 0.1) warnings.push({ path: '/settings/target_seconds', code: 'ESTIMATE_OFF_TARGET', message: `估算 ${estimate.toFixed(1)} 秒，目标 ${target} 秒，偏差超过 10%` });
  return warnings;
}

/** Advisory check from docs/lite/声音人设设计.md §7: a valid preset that the rest of the voice settings would ignore. */
export function lintVoice(project) {
  const v = project?.voice;
  if (!isObject(v) || !Object.hasOwn(VOICE_PRESETS, v.preset ?? '')) return [];
  const why = v.voice !== undefined ? `同时写了 voice.voice（${v.voice}），合成时用它，不用人设的音色`
    : v.provider === 'import' || v.provider === 'openai-compatible' ? `provider 是 ${v.provider}，人设只对 edge-tts 起作用`
      : v.provider === 'command' && !isEdgeVoiceCommand(v.command) ? 'command 不是带 {voice} 的 edge-tts 命令，人设的音色传不进去'
        : null;
  return why ? [{ path: '/voice/preset', code: 'PRESET_UNUSED', message: `配音人设 ${v.preset} 不起作用：${why}（见 providers.md 的配音来源）` }] : [];
}

/** True when the latest checkpoint for `stage` confirms the current revision. */
export function isApproved(project, stage) {
  const last = project.checkpoints.filter((c) => c.stage === stage).at(-1);
  return last !== undefined && last.revision === project.revision;
}
