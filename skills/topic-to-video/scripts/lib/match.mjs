// Storyboard advice that compares what is on screen with what is said (references/storyboard.md).
// Warnings only: VISUAL_NOT_IN_NARRATION and POINT_MISSING.
import { splitSentences } from './captions.mjs';
import { checkShape } from './project.mjs';

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
  const pick = {
    bullets: () => list(d.items),
    flow: () => list(d.nodes),
    compare: () => [d.left?.label, ...list(d.left?.rows), d.right?.label, ...list(d.right?.rows)],
    number: () => [d.value, d.label],
    bars: () => list(d.items).map((item) => item?.label),
  }[visual?.template];
  return (pick?.() ?? []).filter((t) => typeof t === 'string' || typeof t === 'number').map(String);
}

export const DEICTIC_WORDS = ['看右边', '右边的', '右侧', '看这张图', '看这里', '看这儿', '看这边', '右图'];

// The gesture in effect at sentence n: the shot's gesture, changed by gesture cues up to that sentence.
function gestureAt(shot, n) {
  return (shot.cues ?? []).filter((c) => c.do === 'gesture' && c.sentence <= n)
    .sort((a, b) => a.sentence - b.sentence)
    .reduce((gesture, c) => c.target, shot.host?.gesture);
}

/** Advisory checks from references/storyboard.md. Empty when checkProject reports MISSING_FIELD. */
export function lintStoryboard(project) {
  if (checkShape(project).length) return [];
  const bySection = new Map(project.sections.map((s) => [s.id, splitSentences(s.text)]));
  const warnings = [];
  project.shots.forEach((shot, i) => {
    const said = shot.sentences.map((n) => bySection.get(shot.section)?.[n] ?? '');
    const narration = normalizeText(said.join(''));
    const judged = visualKeywords(shot.visual).filter((k) => fragments(k).length);
    if (judged.length && !judged.some((k) => fragments(k).some((f) => narration.includes(f)))) {
      warnings.push({ path: `/shots/${i}/visual`, code: 'VISUAL_NOT_IN_NARRATION', message: `镜头 ${shot.id} 的画面关键词（${judged.join('、')}）都不在本镜口播里；改用口播里的词，或调整这一镜包含的句子（见 storyboard.md）` });
    }
    if (shot.layout !== 'host-left') return;
    shot.sentences.forEach((n, j) => {
      const word = DEICTIC_WORDS.find((w) => said[j].includes(w));
      if (word && gestureAt(shot, n) !== 'point_right') {
        warnings.push({ path: `/shots/${i}`, code: 'POINT_MISSING', message: `镜头 ${shot.id} 第 ${n} 句说了“${word}”，这一句的手势应是 point_right（见 storyboard.md 的主持人一节）` });
      }
    });
  });
  return warnings;
}
