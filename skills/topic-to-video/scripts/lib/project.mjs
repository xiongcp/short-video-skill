// Cross-reference checks and planning estimates for project.json. Field types are covered by
// schema/project.schema.json; these checks cover what a JSON Schema cannot express.
import { countChars, splitSentences } from './captions.mjs';

export const CHARS_PER_SECOND = 4;
export const DEFAULT_SENTENCE_GAP_MS = 250;
export const MAX_SENTENCE_CHARS = 30;

const LIST_FIELD = { bullets: 'items', flow: 'nodes', bars: 'items' };

/** Elements a reveal or highlight cue can address: list items, flow nodes, bars, or the two compare columns. */
export function elementCount(visual) {
  if (visual.template === 'compare') return 2;
  const field = LIST_FIELD[visual.template];
  return field ? visual.data[field].length : 0;
}

const duplicates = (ids) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

const isObject = (v) => typeof v === 'object' && v !== null;

// The fields the checks below read. A project missing one gets MISSING_FIELD errors instead of a crash;
// nested fields are checked only when the top level is complete.
function checkShape(project) {
  const errors = [];
  const need = (ok, path, what) => { if (!ok) errors.push({ path, code: 'MISSING_FIELD', message: `缺少或格式不对：${what}，字段见 schema/project.schema.json` }); };
  need(isObject(project), '', 'project.json 应是一个对象');
  if (errors.length) return errors;
  need(Number.isInteger(project.revision), '/revision', 'revision 应是整数');
  need(Array.isArray(project.brief?.sources), '/brief/sources', 'brief.sources 应是数组');
  need(typeof project.settings?.target_seconds === 'number', '/settings/target_seconds', 'settings.target_seconds 应是数字');
  ['sections', 'shots', 'checkpoints'].forEach((key) => need(Array.isArray(project[key]), `/${key}`, `${key} 应是数组`));
  if (errors.length) return errors;
  project.brief.sources.forEach((s, i) => need(isObject(s), `/brief/sources/${i}`, '来源应是对象'));
  project.sections.forEach((s, i) => need(typeof s?.text === 'string', `/sections/${i}/text`, `段落 ${s?.id ?? i} 的 text 应是字符串`));
  project.checkpoints.forEach((c, i) => need(isObject(c), `/checkpoints/${i}`, '确认记录应是对象'));
  project.shots.forEach((shot, i) => {
    need(Array.isArray(shot?.sentences) && shot.sentences.every(Number.isInteger), `/shots/${i}/sentences`, `镜头 ${shot?.id ?? i} 的 sentences 应是整数数组`);
    need(isObject(shot?.visual), `/shots/${i}/visual`, `镜头 ${shot?.id ?? i} 缺少 visual`);
    const field = LIST_FIELD[shot?.visual?.template];
    if (field) need(Array.isArray(shot.visual.data?.[field]), `/shots/${i}/visual/data/${field}`, `镜头 ${shot.id ?? i} 的 visual.data.${field} 应是数组`);
    need(shot?.cues === undefined || (Array.isArray(shot.cues) && shot.cues.every(isObject)), `/shots/${i}/cues`, `镜头 ${shot?.id ?? i} 的 cues 应是对象数组`);
  });
  return errors;
}

/** @returns {{path: string, code: string, message: string}[]} */
export function checkProject(project) {
  const shape = checkShape(project);
  if (shape.length) return shape;
  const errors = [];
  const add = (path, code, message) => errors.push({ path, code, message });
  duplicates(project.sections.map((s) => s.id)).forEach((id) => add('/sections', 'DUPLICATE_ID', `段落 ${id} 重复`));
  duplicates(project.shots.map((s) => s.id)).forEach((id) => add('/shots', 'DUPLICATE_ID', `镜头 ${id} 重复`));
  const sources = new Set(project.brief.sources.map((s) => s.id));
  project.sections.forEach((s, i) => (s.source_ids ?? []).forEach((id) => {
    if (!sources.has(id)) add(`/sections/${i}/source_ids`, 'UNKNOWN_SOURCE', `段落 ${s.id} 引用了不存在的来源 ${id}`);
  }));
  checkCoverage(project, add);
  project.shots.forEach((shot, i) => checkCues(shot, `/shots/${i}`, add));
  project.checkpoints.forEach((c, i) => {
    if (c.revision > project.revision) add(`/checkpoints/${i}/revision`, 'CHECKPOINT_REVISION', `确认记录的版本 ${c.revision} 比项目当前版本 ${project.revision} 还新`);
  });
  return errors;
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

function checkCues(shot, at, add) {
  (shot.cues ?? []).forEach((cue, j) => {
    const path = `${at}/cues/${j}`;
    if (!shot.sentences.includes(cue.sentence)) add(`${path}/sentence`, 'CUE_OUTSIDE_SHOT', `镜头 ${shot.id} 的 cue 指向不属于本镜头的第 ${cue.sentence} 句`);
    if (cue.do === 'reveal' || cue.do === 'highlight') {
      const count = elementCount(shot.visual);
      if (count === 0) add(`${path}/do`, 'CUE_NOT_SUPPORTED', `模板 ${shot.visual.template} 没有可逐个出现或高亮的元素`);
      else if (cue.target >= count) add(`${path}/target`, 'CUE_TARGET_RANGE', `镜头 ${shot.id} 的 cue 目标 ${cue.target} 超出元素个数 ${count}`);
    } else if (shot.layout !== 'host-left') {
      add(`${path}/do`, 'CUE_NEEDS_HOST', `镜头 ${shot.id} 不显示主持人，不能切换表情或手势`);
    }
  });
}

/** Planning estimate for some sentences of one section: characters at 4 per second plus a gap after each sentence. */
export function estimateSentences(project, section, indexes) {
  const gap = (project.settings.sentence_gap_ms ?? DEFAULT_SENTENCE_GAP_MS) / 1000;
  const sentences = splitSentences(section.text);
  return indexes.reduce((sum, i) => sum + countChars(sentences[i] ?? '') / CHARS_PER_SECOND + gap, 0);
}

/** Planning estimate for the whole project, in seconds. */
export function estimateSeconds(project) {
  return project.sections.reduce((sum, s) => sum + estimateSentences(project, s, splitSentences(s.text).map((_, i) => i)), 0);
}

/** Advisory checks from references/script.md; these are warnings, not errors. Empty when checkProject reports MISSING_FIELD. */
export function lintScript(project) {
  if (checkShape(project).length) return [];
  const warnings = [];
  project.sections.forEach((s, i) => splitSentences(s.text).forEach((sentence, j) => {
    const length = [...sentence].length;
    if (length > MAX_SENTENCE_CHARS) warnings.push({ path: `/sections/${i}/text`, code: 'SENTENCE_TOO_LONG', message: `段落 ${s.id} 第 ${j} 句有 ${length} 字，超过 ${MAX_SENTENCE_CHARS} 字` });
  }));
  const estimate = estimateSeconds(project);
  const target = project.settings.target_seconds;
  if (Math.abs(estimate - target) > target * 0.1) warnings.push({ path: '/settings/target_seconds', code: 'ESTIMATE_OFF_TARGET', message: `估算 ${estimate.toFixed(1)} 秒，目标 ${target} 秒，偏差超过 10%` });
  return warnings;
}

/** True when the latest checkpoint for `stage` confirms the current revision. */
export function isApproved(project, stage) {
  const last = project.checkpoints.filter((c) => c.stage === stage).at(-1);
  return last !== undefined && last.revision === project.revision;
}
