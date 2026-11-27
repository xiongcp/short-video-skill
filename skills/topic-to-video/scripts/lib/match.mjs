// Storyboard advice from references/storyboard.md: what is on screen against what is said, and how the host acts.
// Warnings only: VISUAL_NOT_IN_NARRATION, POINT_MISSING, MOVE_TOO_MANY, FOCUS_SPLIT, STATIC_STRETCH, EMPTY_START, NO_INTERACTION and GESTURE_REPEAT.
import { splitSentences } from './captions.mjs';
import { customPropMeta, PROP_META } from './icons.mjs';
import { checkShape, elementCount, estimateReport, HOST_LAYOUTS, INTERACTION_CUES } from './project.mjs';

const DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNITS = { 十: 10, 百: 100, 千: 1000 };
const LARGE = { 万: 1e4, 亿: 1e8 };
const NUMERAL = /[零〇一二两三四五六七八九十百千万亿]+(?:点[零〇一二三四五六七八九]+)?/g;
const PERCENT = new RegExp(`百分之(${NUMERAL.source})`, 'g');

// 三零四 → 304, 三百零四 → 304, 一万 → 10000, 三点五 → 3.5, 一万五 → 15000, 三百五 → 350
function readNumeral(run) {
  const [whole, fraction] = run.split('点');
  let value;
  if (/[十百千万亿]/.test(whole)) {
    let total = 0;
    let section = 0;
    let digit = 0;
    for (const ch of whole) {
      if (ch in DIGITS) digit = DIGITS[ch];
      else if (ch in UNITS) { section += (digit || 1) * UNITS[ch]; digit = 0; }
      else { total += (section + digit) * LARGE[ch]; section = 0; digit = 0; }
    }
    // A digit right after a unit is one place lower: 一万五 is 15000, 三百五 is 350; 一千零五 keeps 5.
    const before = [...whole].at(-2) ?? '';
    const unit = UNITS[before] ?? LARGE[before] ?? 10;
    value = String(total + section + digit * (unit / 10));
  } else {
    value = [...whole].map((ch) => DIGITS[ch]).join('');
  }
  return fraction === undefined ? value : `${value}.${[...fraction].map((ch) => DIGITS[ch]).join('')}`;
}

/** Lowercases letters and turns Chinese number readings into digits, so 三零四 in the script matches 304 on screen. */
export function normalizeText(text) {
  return text.toLowerCase().replace(PERCENT, (_, n) => `${readNumeral(n)}%`).replace(NUMERAL, readNumeral);
}

// Two-character Han pieces plus whole numbers and Latin words; a one-character keyword has none and is not judged.
function fragments(keyword) {
  const text = normalizeText(keyword);
  const han = (text.match(/\p{Script=Han}{2,}/gu) ?? []).flatMap((run) => [...run].slice(1).map((ch, i) => run[i] + ch));
  return [...han, ...(text.match(/[a-z0-9]+(?:\.[0-9]+)?/g) ?? [])];
}

const list = (value) => (Array.isArray(value) ? value : []);

/** On-screen words of a visual; title cards summarize, so they are left out. */
export function visualKeywords(visual) {
  const d = visual?.data ?? {};
  const pickers = {
    bullets: () => list(d.items),
    flow: () => list(d.nodes),
    compare: () => [d.left?.label, ...list(d.left?.rows), d.right?.label, ...list(d.right?.rows)],
    number: () => [d.value, d.label],
    bars: () => list(d.items).map((item) => item?.label),
    stage: () => [d.heading, ...list(d.objects).map((obj) => obj?.label)],
    timeline: () => list(d.items).flatMap((item) => [item?.time, item?.label]),
    cycle: () => list(d.items).map((item) => item?.label),
  };
  const tpl = visual?.template;
  const pick = typeof tpl === 'string' && Object.hasOwn(pickers, tpl) ? pickers[tpl] : undefined;
  return (pick?.() ?? []).filter((t) => typeof t === 'string' || typeof t === 'number').map(String);
}

const DEICTIC_WORDS = ['看右边', '右边的', '右侧', '看这张图', '看这里', '看这儿', '看这边', '右图'];
// Gestures that aim at the focus element; point_right is the old name of point.
const POINTING = ['point', 'point_right', 'present', 'tap'];
export const MAX_MOVES = 2;
export const STATIC_SECONDS = 4;

// The gesture in effect at sentence n: the shot's gesture, changed by gesture cues up to that sentence.
function gestureAt(shot, n) {
  return (shot.cues ?? []).filter((c) => shot.sentences.includes(c.sentence) && c.do === 'gesture' && c.sentence <= n)
    .sort((a, b) => a.sentence - b.sentence)
    .reduce((gesture, c) => c.target, shot.host?.gesture);
}

/** Advisory checks from references/storyboard.md. Empty when checkProject reports MISSING_FIELD. */
export function lintStoryboard(project) {
  if (checkShape(project).length) return [];
  const bySection = new Map(project.sections.map((s) => [s.id, splitSentences(s.text)]));
  const warnings = [];
  project.shots.forEach((shot, i) => {
    if (project.settings?.ratio === '9:16' && shot.layout === 'stage') {
      const custom = new Map((project.world?.custom_props ?? []).map((c) => [c.id, c]));
      const layerOf = (o) => (['ground', 'mid', 'air'].includes(o.layer) ? o.layer
        : (typeof o.prop === 'string' && Object.hasOwn(PROP_META, o.prop) ? PROP_META[o.prop].layer
          : (custom.has(o.prop) ? customPropMeta(custom.get(o.prop)).layer : 'ground')));
      const objects = shot.visual?.data?.objects ?? [];
      const air = objects.filter((o) => layerOf(o) === 'air').length;
      const lower = objects.length - air;
      if (lower > 3 || air > 2) {
        warnings.push({ path: `/shots/${i}/visual/data/objects`, code: 'PORTRAIT_CROWDED', message: `竖屏镜头 ${shot.id} 地面和中间层有 ${lower} 件、空中 ${air} 件；竖屏最多地面 3 件、空中 2 件，减少物件或拆成两个镜头（见 storyboard.md）` });
      }
    }
    const said = shot.sentences.map((n) => bySection.get(shot.section)?.[n] ?? '');
    const narration = normalizeText(said.join(''));
    const judged = visualKeywords(shot.visual).filter((k) => fragments(k).length);
    if (judged.length && !judged.some((k) => fragments(k).some((f) => narration.includes(f)))) {
      warnings.push({ path: `/shots/${i}/visual`, code: 'VISUAL_NOT_IN_NARRATION', message: `镜头 ${shot.id} 的画面关键词（${judged.join('、')}）都不在本镜口播里；改用口播里的词，或调整这一镜包含的句子（见 storyboard.md）` });
    }
    if (!HOST_LAYOUTS.includes(shot.layout)) return;
    shot.sentences.forEach((n, j) => {
      const word = DEICTIC_WORDS.find((w) => said[j].includes(w));
      if (word && !POINTING.includes(gestureAt(shot, n))) {
        warnings.push({ path: `/shots/${i}`, code: 'POINT_MISSING', message: `镜头 ${shot.id} 第 ${n} 句说了“${word}”，这一句的动作应是 point、present 或 tap（见 storyboard.md 的主持人一节）` });
      }
    });
    warnings.push(...lintActing(shot, i));
    warnings.push(...lintStageInteraction(shot, i));
  });
  warnings.push(...lintGestureRepeat(project));
  warnings.push(...lintStatic(project));
  return warnings;
}

// MOVE_TOO_MANY and FOCUS_SPLIT: a host-left shot walks at most twice, and a sentence has one focus element.
function lintActing(shot, i) {
  const cues = (shot.cues ?? []).filter((c) => shot.sentences.includes(c.sentence));
  const out = [];
  const moves = cues.filter((c) => c.do === 'move').length;
  if (moves > MAX_MOVES) out.push({ path: `/shots/${i}/cues`, code: 'MOVE_TOO_MANY', message: `镜头 ${shot.id} 有 ${moves} 次 move，最多 ${MAX_MOVES} 次；走动跟着正在讲的对象（见 storyboard.md 的主持人一节）` });
  for (const n of shot.sentences) {
    const here = cues.filter((c) => c.sentence === n && Number.isInteger(c.target));
    const shownHere = here.filter((c) => c.do === 'reveal' || c.do === 'highlight');
    const pair = here.filter((c) => c.do === 'move').map((w) => [w, shownHere.find((s) => s.target !== w.target)]).find(([, s]) => s);
    if (pair) out.push({ path: `/shots/${i}/cues`, code: 'FOCUS_SPLIT', message: `镜头 ${shot.id} 第 ${n} 句 move 到元素 ${pair[0].target}，${pair[1].do} 的却是元素 ${pair[1].target}；同一句只留一个焦点（见 storyboard.md 的主持人一节）` });
  }
  return out;
}

// NO_INTERACTION: a stage shot should include at least one interaction cue or tap so the host engages with the scene.
function lintStageInteraction(shot, i) {
  if (shot.layout !== 'stage') return [];
  const cues = (shot.cues ?? []).filter((c) => shot.sentences.includes(c.sentence));
  const hasInteraction = shot.host?.gesture === 'tap'
    || cues.some((c) => INTERACTION_CUES.includes(c.do) || (c.do === 'gesture' && c.target === 'tap'));
  return hasInteraction ? [] : [{
    path: `/shots/${i}`,
    code: 'NO_INTERACTION',
    message: `镜头 ${shot.id} 是 stage 舞台镜头，但没有任何互动 cue 或 tap；加一个 react、open 等互动 cue，或 {"do": "gesture", "target": "tap"}，让小青参与进来（见 world.md）`,
  }];
}

const normGesture = (g) => (g === 'point_right' ? 'point' : g);

// GESTURE_REPEAT: consecutive explicit gestures inside a shot (starting from host.gesture) must differ,
// and adjacent host shots cannot share host.gesture unless the latter introduces another gesture cue.
function lintGestureRepeat(project) {
  const out = [];
  let prevHostGesture;
  project.shots.forEach((shot, i) => {
    if (!HOST_LAYOUTS.includes(shot.layout)) return;
    const cues = (shot.cues ?? [])
      .filter((c) => shot.sentences.includes(c.sentence) && c.do === 'gesture')
      .sort((a, b) => a.sentence - b.sentence);
    let prev = normGesture(shot.host?.gesture);
    let intraWarned = false;
    for (const c of cues) {
      const next = normGesture(c.target);
      if (prev !== undefined && next === prev && !intraWarned) {
        out.push({
          path: `/shots/${i}/cues`,
          code: 'GESTURE_REPEAT',
          message: `镜头 ${shot.id} 第 ${c.sentence} 句连续重复动作 ${c.target}；换一个动作或去掉重复的 gesture cue（见 storyboard.md）`,
        });
        intraWarned = true;
      }
      prev = next;
    }
    const startGesture = normGesture(shot.host?.gesture);
    if (!intraWarned && cues.length === 0 && prevHostGesture !== undefined && startGesture === prevHostGesture) {
      out.push({
        path: `/shots/${i}/host`,
        code: 'GESTURE_REPEAT',
        message: `镜头 ${shot.id} 的起始动作 ${shot.host.gesture} 与上一个出镜镜头相同，且本镜没有别的动作 cue；换一个起始动作或加 gesture cue（见 storyboard.md）`,
      });
    }
    prevHostGesture = startGesture;
  });
  return out;
}

// STATIC_STRETCH: by the planning estimate, the picture changes at the shot start, at every cue and at the shot end;
// two neighbouring changes more than STATIC_SECONDS apart leave the picture still for too long.
// A cue with `at` lands that far into its sentence, in proportion to the keyword's position, as the renderer times it.
function lintStatic(project) {
  const estimates = new Map(estimateReport(project).shots.map((s) => [s.id, s]));
  const out = [];
  project.shots.forEach((shot, i) => {
    const estimate = estimates.get(shot.id);
    if (!estimate) return;
    const texts = splitSentences(project.sections.find((s) => s.id === shot.section)?.text ?? '');
    const cueTime = (c) => {
      const k = shot.sentences.indexOf(c.sentence);
      const start = estimate.starts[k];
      if (start === undefined) return undefined;
      const text = texts[c.sentence] ?? '';
      const idx = c.at ? text.indexOf(c.at) : -1;
      if (idx <= 0) return start;
      const end = estimate.starts[k + 1] ?? estimate.seconds;
      return Math.round((start + (end - start) * idx / text.length) * 10) / 10;
    };
    const cueTimes = (shot.cues ?? []).map(cueTime).filter((t) => t !== undefined);
    // EMPTY_START: a full shot has no host, so when every element waits for a reveal the opening frames are blank.
    const n = shot.layout === 'full' ? elementCount(shot.visual ?? {}) : 0;
    const reveals = (shot.cues ?? []).filter((c) => c.do === 'reveal' && Number.isInteger(c.target));
    const firstReveal = Math.min(...reveals.map(cueTime).filter((t) => t !== undefined));
    if (n > 0 && new Set(reveals.map((c) => c.target)).size >= n && firstReveal > 1) {
      out.push({ path: `/shots/${i}`, code: 'EMPTY_START', message: `镜头 ${shot.id} 开头约 ${firstReveal} 秒画面是空的：所有元素都要等 reveal 才出现；让第一个元素从镜头开始就显示，或把它的 reveal 提到镜头开头（见 storyboard.md）` });
    }
    const times = [0, ...cueTimes, estimate.seconds].sort((a, b) => a - b);
    const k = times.findIndex((t, j) => j > 0 && Math.round((t - times[j - 1]) * 10) > STATIC_SECONDS * 10);
    if (k > 0) out.push({ path: `/shots/${i}`, code: 'STATIC_STRETCH', message: `镜头 ${shot.id} 在 ${times[k - 1]}–${times[k]} 秒之间画面没有变化，超过 ${STATIC_SECONDS} 秒；加一个 cue 或拆成两个镜头（见 storyboard.md）` });
  });
  return out;
}
