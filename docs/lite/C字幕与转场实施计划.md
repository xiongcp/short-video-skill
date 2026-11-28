# C 字幕与转场实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 字幕显示阿拉伯数字、配音仍读对；竖屏字幕按词断行、按小句翻页、翻页卡在词上；转场改成先退后进，前后两镜的文字不再同时出现。

**Architecture:** 新文件 `reading.mjs` 的 `toSpoken` 从显示文本现算配音文本和替换区间 `spans`，配音、缓存键、词时间、估时、QA 都从它取。`timing.mjs` 按整体（数字组、关键词、英文词、分词结果）断行，`captionPages` 用词时间给每页定出现时刻，画面字幕和 `captions.ass` 共用。`scene.mjs` 的转场把一次过渡拆成退场段（前 45%）和进场段（后 55%），场景背景跟着内容走。

**Tech Stack:** Node ≥ 22（ESM，`node --test`）；`Intl.Segmenter`（Node 自带）；运行时依赖仍只有 `@resvg/resvg-js`。

**Spec:** [字幕与转场设计](字幕与转场设计.md)（owner 2026-11-27 审阅通过）

## Global Constraints

- skill 目录不超过 45 个文件、5 MB（本计划 40 → 41，只加 `scripts/lib/reading.mjs`）；`SKILL.md` 不动；每份 reference 不超过 250 行；运行时 npm 依赖仍只有 `@resvg/resvg-js`。
- `project.json` 不改 schema，`version` 仍为 1；讲稿里没有阿拉伯数字的旧项目，配音文本逐字不变、缓存不失效。
- 读法、断行、转场的数值照抄设计：§3.2 读法表；整体宽度用 `textBox`（汉字和全角 1，其余 0.6），竖屏每行最宽 12、每页 2 行；扣分权重 4；最后一页留到句后 120 毫秒；退场占 45%、`easeInOutCubic`，进场占 55%、`easeOutCubic`，缩放 0.96；`crossfade` 0.4 秒，`morph` 0.4 秒、进带小青的版式 0.6 秒不变。
- 在 `lite/captions-numbers` 分支上做，每个任务先写失败测试，再写最小实现，`npm test` 全绿后提交；不 push、不合并，除非 owner 说。开始 Task 1 前，先把 `docs/lite/字幕与转场设计.md` 和本计划提交一次。
- 不提交 `a-share-rally/`（owner 的项目，含媒体）和 `out/`。
- 改动金样（`tests/fixtures/golden-16x9.json`）前后各渲染一次 PNG，逐张看过变化的帧再更新（Task 3、6、7）。
- edge-tts 免费但要联网，会把句子发给微软朗读服务：Task 9 重新配音前先问 owner。
- 向 owner 汇报用中文。

## Review Focus

1. 旧讲稿里的“千万别扔”“万一过期了”“三四十个”“一点一点地”“第一点”“两点”“十几年”不是数据，`HANZI_NUMBER` 不能报。→ Task 3 测试的“不报”清单。
2. 英文逗号和冒号写的数字（“5,300只”“14:05”）在 `splitClauses` 里不能被切成两个小句，否则字幕把数字拆到两行。→ Task 5 测试。
3. 缺分词数据的精简版 Node（`Intl.Segmenter` 逐字切开）也要按 §4.5 断行，不能只在本机的 ICU 上对。→ Task 5 测试用逐字切分再跑一遍四个例句。
4. 横屏里 12 字以内、带逗号的短句（“你好，世界。”）仍整句显示，不按小句闪两次。→ Task 6 测试。
5. 配音引擎给的逐词时间和读法对不上（引擎自己把数字改写了）时，退回在引擎给的说话区间里按读法估，不能把整句时间丢掉。→ Task 2 测试（`displayWords` 返回 `null`，`synthesizeProject` 退回估算）。

---

## 文件地图

| 文件 | 动作 | 职责 | 任务 |
| --- | --- | --- | --- |
| `skills/topic-to-video/scripts/lib/reading.mjs` | Create | `toSpoken`：术语替换、读数、`spans`；`NUMBER_UNITS` | 1 |
| `skills/topic-to-video/scripts/lib/timing.mjs` | Modify | `estimateWords` 按读法分配、`displayWords`（Task 2）；`splitClauses` 数字修正、`layoutCaption`、`subtitlePages`（Task 5）；`captionPages`（Task 6） | 2、5、6 |
| `skills/topic-to-video/scripts/lib/tts.mjs` | Modify | 配音与试听送 `toSpoken().spoken`；引擎逐词时间换回显示文本；删 `applyPronunciation` | 2 |
| `skills/topic-to-video/scripts/lib/project.mjs` | Modify | 估时数配音文本；`hanziNumbers` 与 `HANZI_NUMBER` | 3 |
| `skills/topic-to-video/scripts/lib/motion.mjs` | Modify | 自动手势“指着画面”词表加 `304` | 3 |
| `skills/topic-to-video/scripts/lib/qa.mjs` | Modify | `qa.md` 读法对照、人工复核项“数字读法” | 4 |
| `skills/topic-to-video/scripts/lib/match.mjs` | Modify | `captionKeywords` | 6 |
| `skills/topic-to-video/scripts/lib/scene.mjs` | Modify | 字幕改用每句的 `captions`，进缓存键（Task 6）；先退后进、背景跟随、`SCENE_VERSION = 6`（Task 7） | 6、7 |
| `skills/topic-to-video/scripts/lib/encode.mjs` | Modify | `captions.ass` 改用 `captionPages` | 6 |
| `examples/cache-speed/`（`project.json`、`讲稿.md`、`提示词包.md`）、`site/index.html` 示例表 | Modify | “三零四”改成 `304` 加 `pronunciation` | 3 |
| `skills/topic-to-video/references/script.md`、`storyboard.md`、`render.md`、`site/index.html`、`CHANGELOG.md`、`docs/lite/字幕与转场设计.md` | Modify | 数字写法、`at` 例子、读法对照、转场说明、v1.1.0、状态行 | 8 |
| `tests/reading.test.mjs`、`tests/caption-layout.test.mjs`、`tests/caption-pages.test.mjs`、`tests/transitions.test.mjs` | Create | 读数器、断行、翻页与 ASS、转场判据 | 1、5、6、7 |
| `tests/render-core.test.mjs`、`project.test.mjs`、`stage.test.mjs`、`persona.test.mjs`、`qa.test.mjs`、`portrait-subtitles.test.mjs`、`scene-encode.test.mjs`、`interaction.test.mjs`、`fixtures/golden-16x9.json` | Modify | 新断言与随行为变化的旧断言 | 2–7 |
| `out/review/golden-png.mjs` | Create（不提交，`out/` 已忽略） | 把金样帧渲成 PNG，供改金样前后对比 | 3 |

---

### Task 1: 读数器 `reading.mjs`

**Files:**
- Create: `skills/topic-to-video/scripts/lib/reading.mjs`
- Test: `tests/reading.test.mjs`

**Interfaces:**
- Consumes: 无（不 import 任何模块）
- Produces:
  - `toSpoken(text: string, pronunciation?: {term, reading}[]) → { spoken: string, spans: { start: number, end: number, text: string, reading: string }[] }`：`spans` 按位置排列，位置是显示文本里的 UTF-16 下标，`text === display.slice(start, end)`
  - `NUMBER_UNITS: string`：跟在数字后面算作数字组一部分的单位字（Task 5 断行用）

- [ ] **Step 1: 写失败测试 `tests/reading.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitSentences } from '../skills/topic-to-video/scripts/lib/captions.mjs';
import { toSpoken } from '../skills/topic-to-video/scripts/lib/reading.mjs';
import { sentenceHash } from '../skills/topic-to-video/scripts/lib/tts.mjs';

// 字幕与转场设计 §3.2, row by row, plus the extra cases of §7.
const READINGS = [
  ['15.07%', '百分之十五点零七'], ['3.7%', '百分之三点七'], ['-2.3%', '负百分之二点三'],
  ['1.4', '一点四'], ['0.5', '零点五'],
  ['3600点', '三千六百点'], ['5300只', '五千三百只'], ['1005', '一千零五'], ['110', '一百一十'], ['15', '十五'], ['10', '十'],
  ['1.4万亿', '一点四万亿'], ['2万亿元', '两万亿元'], ['6000亿', '六千亿'],
  ['2个', '两个'], ['2倍', '两倍'], ['2点', '两点'], ['2到3倍', '两到三倍'], ['2000', '两千'], ['20000', '两万'],
  ['11月27日', '十一月二十七日'], ['2月', '二月'], ['7月', '七月'], ['2个月', '两个月'],
  ['12点半', '十二点半'], ['14:05', '十四点零五分'], ['14:00', '十四点'], ['2:30', '两点三十分'],
  ['2026年', '二零二六年'], ['2026年11月27日', '二零二六年十一月二十七日'], ['第3', '第三'], ['第2个', '第二个'],
  ['2-3倍', '两到三倍'], ['2~3倍', '两到三倍'], ['5,300只', '五千三百只'],
  ['007', '零零七'], ['000001', '零零零零零一'],
  ['5G', '5G'], ['H100', 'H100'], ['GPT-5', 'GPT-5'], ['4K', '4K'],
  ['304', '三百零四'], ['600519', '六十万零五百一十九'], ['科创50', '科创五十'],
  ['27日-28日', '二十七日到二十八日'], ['跌幅-2.3%', '跌幅负百分之二点三'], ['2%-3%', '百分之二到百分之三'],
  ['1到2个', '一到两个'], ['2到3月', '二到三月'], ['100000', '十万'], ['10500', '一万零五百'], ['100000005', '一亿零五'],
  ['超过20000人', '超过两万人'], ['iPhone 15', 'iPhone 十五'], ['', ''],
];

test('toSpoken reads every row of the 字幕与转场设计 §3.2 table', () => {
  for (const [text, spoken] of READINGS) assert.equal(toSpoken(text).spoken, spoken, text);
  assert.deepEqual(toSpoken(undefined), { spoken: '', spans: [] });
});

test('a lone 2 before a measure word reads 两, before 月 日 号 it reads 二', () => {
  for (const m of '个只位名人家户种项条次回遍倍天周年岁元块股手份批件本张台辆篇首部页杯瓶斤吨米点') assert.equal(toSpoken(`2${m}`).spoken, `两${m}`, m);
  for (const m of '月日号') assert.equal(toSpoken(`2${m}`).spoken, `二${m}`, m);
});

test('spans give each replaced range in display positions', () => {
  assert.deepEqual(toSpoken('2-3倍和27日-28日').spans, [
    { start: 0, end: 3, text: '2-3', reading: '两到三' },
    { start: 5, end: 7, text: '27', reading: '二十七' },
    { start: 8, end: 11, text: '-28', reading: '到二十八' },
  ]);
  const text = '科创50大涨15.07%，创业板涨11.61%。';
  const { spoken, spans } = toSpoken(text, [{ term: '科创50', reading: '科创五零' }]);
  assert.equal(spoken, '科创五零大涨百分之十五点零七，创业板涨百分之十一点六一。');
  assert.deepEqual(spans.map((s) => [s.start, s.end, s.text]), [[0, 4, '科创50'], [6, 12, '15.07%'], [17, 23, '11.61%']]);
  for (const s of spans) assert.equal(text.slice(s.start, s.end), s.text);
});

test('pronunciation terms win over numbers, and the first term wins over a later overlapping one', () => {
  assert.equal(toSpoken('返回304。', [{ term: '304', reading: '三零四' }]).spoken, '返回三零四。');
  assert.equal(toSpoken('返回 HTTP 304。', [{ term: 'HTTP', reading: 'H T T P' }]).spoken, '返回 H T T P 三百零四。');
  assert.equal(toSpoken('科创50指数', [{ term: '科创50', reading: '科创五零' }, { term: '50指数', reading: '五十指数' }]).spoken, '科创五零指数');
  assert.equal(toSpoken('没有数字。', [{ term: '', reading: 'x' }, { term: 'y' }]).spoken, '没有数字。');
});

// The applyPronunciation that tts.mjs used before 字幕与转场设计, kept here as the reference for old projects.
const chained = (text, pronunciation = []) => pronunciation.reduce((out, { term, reading }) => (term && reading ? out.replaceAll(term, reading) : out), text);

test('a script without Arabic digits gives the same voice text and cache key as before', () => {
  const root = join(import.meta.dirname, '..');
  const voice = { provider: 'command', command: 'edge-tts --voice {voice} --text {text} --write-media {out}' };
  let count = 0;
  for (const file of ['examples/cache-speed/project.json', 'tests/fixtures/minimal-project.json', 'tests/fixtures/world-cache.json', 'tests/fixtures/world-flight.json']) {
    const project = JSON.parse(readFileSync(join(root, file), 'utf8'));
    for (const sec of project.sections) {
      for (const sentence of splitSentences(sec.text)) {
        if (/\d/.test(sentence)) continue;
        count += 1;
        const { spoken, spans } = toSpoken(sentence, sec.pronunciation);
        assert.equal(spoken, chained(sentence, sec.pronunciation), sentence);
        assert.equal(sentenceHash(spoken, voice), sentenceHash(chained(sentence, sec.pronunciation), voice));
        if (!sec.pronunciation?.length) assert.deepEqual(spans, []);
      }
    }
  }
  assert.ok(count >= 30, `only ${count} digit-free sentences`);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/reading.test.mjs`
Expected: FAIL，`Cannot find module '.../reading.mjs'`。

- [ ] **Step 3: 写 `skills/topic-to-video/scripts/lib/reading.mjs`**

```js
// Spoken text for the voice-over (字幕与转场设计 §3): the script shows Arabic numbers and the voice reads them in
// Chinese. toSpoken applies the section's pronunciation terms first, then reads every remaining number. No imports.

const DIGITS = '零一二三四五六七八九';
/** A lone 2 right before one of these is read 两 (§3.2). */
const MEASURE_WORDS = '个只位名人家户种项条次回遍倍天周年岁元块股手份批件本张台辆篇首部页杯瓶斤吨米点';
/** Unit characters that belong to a number, as in 3600点 or 11月27日 (§4.1); captions keep them on the number's line. */
export const NUMBER_UNITS = '年月日号时分秒点半万亿千百倍元只个家位人次天岁股手';
const LIANG_NEXT = new Set([...MEASURE_WORDS, '万', '亿', '千', '百']);
// Latin words and numbers glued to letters (5G, H100, GPT-5) are left to the voice engine; then H:MM; then numbers
// with an optional sign or range mark, thousands commas, a decimal part and a percent sign.
const TOKEN = /[A-Za-z][A-Za-z0-9.+-]*|\d+[A-Za-z][A-Za-z0-9.+-]*|([01]?\d|2[0-4]):([0-5]\d)(?![\d:])|([-−~～–]?)(\d{1,3}(?:,\d{3})+(?![\d,])|\d+)(\.\d+)?([%％]?)/g;
const AFTER_RANGE = /^(?:[-~～–到至]\d[\d,]*(?:\.\d+)?[%％]?)?(.?)/u;

const spell = (digits) => [...digits].map((d) => DIGITS[d]).join('');

function readGroup(n) {
  const ds = String(n).padStart(4, '0');
  let out = '';
  let zero = false;
  for (let i = 0; i < 4; i += 1) {
    const d = Number(ds[i]);
    if (d === 0) {
      zero = out !== '';
      continue;
    }
    out += (zero ? '零' : '') + DIGITS[d] + ['千', '百', '十', ''][i];
    zero = false;
  }
  return out;
}

/** 3600 → 三千六百, 1005 → 一千零五, 15 → 十五, 600519 → 六十万零五百一十九 (at most 12 digits). */
function readInteger(digits) {
  const groups = [];
  for (let i = digits.length; i > 0; i -= 4) groups.unshift(Number(digits.slice(Math.max(0, i - 4), i)));
  let out = '';
  let zero = false;
  groups.forEach((g, k) => {
    if (g === 0) {
      zero = out !== '';
      return;
    }
    out += (out && (zero || g < 1000) ? '零' : '') + readGroup(g) + ['', '万', '亿'][groups.length - 1 - k];
    zero = false;
  });
  return (out || '零').replace(/^一十/, '十');
}

function readNumber(src, start, end, int, frac, pct) {
  const digits = int.replaceAll(',', '');
  const ordinal = src[start - 1] === '第';
  let reading;
  if (!frac && !pct && digits.length === 4 && src[end] === '年') reading = spell(digits);
  else if ((digits.length > 1 && digits[0] === '0') || digits.length > 12) reading = spell(digits);
  else if (digits === '2' && !frac && !pct && !ordinal && LIANG_NEXT.has(AFTER_RANGE.exec(src.slice(end))[1])) reading = '两';
  else reading = ordinal ? readInteger(digits) : readInteger(digits).replace(/^二(?=[千万亿])/, '两');
  if (frac) reading += `点${spell(frac.slice(1))}`;
  return pct ? `百分之${reading}` : reading;
}

function numberSpans(src, from, to) {
  const out = [];
  for (const m of src.slice(from, to).matchAll(TOKEN)) {
    const [whole, hour, minute, mark, int, frac = '', pct] = m;
    if (hour === undefined && int === undefined) continue;
    let start = from + m.index;
    const end = start + whole.length;
    if (hour !== undefined) {
      const min = Number(minute);
      const h = Number(hour);
      out.push({ start, end, text: whole, reading: `${h === 2 ? '两' : readInteger(String(h))}点${min ? `${min < 10 ? '零' : ''}${readInteger(String(min))}分` : ''}` });
      continue;
    }
    const prev = out.at(-1);
    const between = prev ? src.slice(prev.end, start) : null;
    const isRange = Boolean(mark) && prev !== undefined && (between === '' || (between.length === 1 && NUMBER_UNITS.includes(between)));
    if (mark && !isRange && !'-−'.includes(mark)) start += 1;
    const core = readNumber(src, start + (mark && (isRange || '-−'.includes(mark)) ? 1 : 0), end, int, frac, pct);
    if (isRange && between === '') {
      prev.end = end;
      prev.text = src.slice(prev.start, end);
      prev.reading += `到${core}`;
      continue;
    }
    const prefix = isRange ? '到' : mark && '-−'.includes(mark) ? '负' : '';
    out.push({ start, end, text: src.slice(start, end), reading: prefix + core });
  }
  return out;
}

function termSpans(src, pronunciation) {
  const spans = [];
  for (const { term, reading } of pronunciation ?? []) {
    if (!term || !reading) continue;
    for (let i = src.indexOf(term); i >= 0; i = src.indexOf(term, i + 1)) {
      const end = i + term.length;
      if (!spans.some((s) => i < s.end && end > s.start)) spans.push({ start: i, end, text: term, reading });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * The text the voice reads, and where it differs from the display text: `spans` lists each replaced range
 * `{ start, end, text, reading }` in display-text positions, in order. Pronunciation terms win over numbers.
 */
export function toSpoken(text, pronunciation = []) {
  const src = String(text ?? '');
  const spans = [];
  let from = 0;
  for (const term of [...termSpans(src, pronunciation), null]) {
    spans.push(...numberSpans(src, from, term ? term.start : src.length));
    if (term) spans.push(term);
    from = term ? term.end : src.length;
  }
  let spoken = '';
  let at = 0;
  for (const s of spans) {
    spoken += src.slice(at, s.start) + s.reading;
    at = s.end;
  }
  return { spoken: spoken + src.slice(at), spans };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/reading.test.mjs && npm test`
Expected: PASS；`tests/budget.test.mjs` 仍通过（41 个文件）。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/reading.mjs tests/reading.test.mjs
git commit -m "feat(reading): read Arabic numbers in Chinese for the voice-over"
```

---

### Task 2: 配音文本与词时间

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/timing.mjs:1-8`（import）、`:137-163`（`estimateWords`）
- Modify: `skills/topic-to-video/scripts/lib/tts.mjs:10`、`:52-59`、`:203-212`、`:286-298`、`:342-345`
- Test: `tests/render-core.test.mjs`

**Interfaces:**
- Consumes: `toSpoken` from `./reading.mjs`（Task 1）；`countChars` from `./captions.mjs`
- Produces:
  - `estimateWords(sentence, speechStartMs, speechEndMs, spans = toSpoken(sentence).spans) → { text, start_ms, end_ms }[]`：词是显示文本，`spans` 里每处按读法字数分配
  - `displayWords(words, sentence, spans) → { text, start_ms, end_ms }[] | null`：把配音文本上的逐词时间换回显示文本的词；两边的字对不上时返回 `null`
  - `tts.mjs` 不再导出 `applyPronunciation`；`timing.json` 的 `words` 一律是显示文本的词

- [ ] **Step 1: 写失败测试（追加到 `tests/render-core.test.mjs`）**

把第 8 行和第 10 行的 import 换成：

```js
import { detectSpeechBounds, displayWords, estimateWords, parseSubtitles, resolveAnchorMs, resolveCueTiming, splitClauses } from '../skills/topic-to-video/scripts/lib/timing.mjs';
```

```js
import { sentenceHash, speedToEdgeRate, splitCommandTemplate, synthesizeProject } from '../skills/topic-to-video/scripts/lib/tts.mjs';
import { toSpoken } from '../skills/topic-to-video/scripts/lib/reading.mjs';
```

把第 109 行 `assert.equal(applyPronunciation('返回 HTTP 304。', ...` 换成：

```js
  assert.equal(toSpoken('返回 HTTP 304。', [{ term: 'HTTP', reading: 'H T T P' }]).spoken, '返回 H T T P 三百零四。');
```

在文件末尾追加：

```js
test('estimated word times weigh a number by how it is read, and cue.at keeps the display text (字幕与转场设计 §3.3)', () => {
  // 15.07% is read 百分之十五点零七: 8 characters against 1 for 涨.
  assert.deepEqual(estimateWords('涨15.07%。', 0, 900), [
    { text: '涨', start_ms: 0, end_ms: 100 },
    { text: '15.07%', start_ms: 100, end_ms: 900 },
  ]);
  // 创业板涨 is 4 of 12 spoken characters, so 11.61% starts a third of the way in.
  const entry = { text: '创业板涨11.61%。', speech: [0, 1200], durationMs: 1200, words: [] };
  assert.deepEqual(resolveAnchorMs(entry, '11.61%'), { offsetMs: 400, source: 'estimate' });
});

test('provider word times on the voice text map back to the display words, and a mismatch returns null', () => {
  const s = '创业板涨11.61%，科创50大涨。';
  const { spans } = toSpoken(s, [{ term: '科创50', reading: '科创五零' }]);
  const provider = [
    { text: '创业板涨', start_ms: 0, end_ms: 800 },
    { text: '百分之十一点六一', start_ms: 800, end_ms: 2400 },
    { text: '科创五零大涨', start_ms: 2700, end_ms: 3600 },
  ];
  assert.deepEqual(displayWords(provider, s, spans), [
    { text: '创', start_ms: 0, end_ms: 200 },
    { text: '业', start_ms: 200, end_ms: 400 },
    { text: '板', start_ms: 400, end_ms: 600 },
    { text: '涨', start_ms: 600, end_ms: 800 },
    { text: '11.61%', start_ms: 800, end_ms: 2400 },
    { text: '科创50', start_ms: 2700, end_ms: 3300 },
    { text: '大', start_ms: 3300, end_ms: 3450 },
    { text: '涨', start_ms: 3450, end_ms: 3600 },
  ]);
  assert.equal(displayWords([{ text: '别的文字', start_ms: 0, end_ms: 100 }], s, spans), null);
});

test('the voice reads numbers in Chinese while timing.json keeps the display words (字幕与转场设计 §3.3)', async () => {
  for (const mismatch of [false, true]) {
    const dir = mkdtempSync(join(tmpdir(), 'svs-tts-spoken-'));
    try {
      const p = minimal();
      p.sections[0].text = '沪指涨3.7%。答案藏在阳光里。';
      // A local fake voice: records the text it was given, writes 0.5 s of tone and a two-cue VTT. With `mismatch`
      // the cues carry other words, as an engine that rewrote the text would.
      const fakeTts = join(dir, 'fake-tts.mjs');
      writeFileSync(fakeTts, `
        import { appendFileSync, writeFileSync } from 'node:fs';
        const [text, out, sub, mode] = process.argv.slice(2);
        appendFileSync(${JSON.stringify(join(dir, 'said.txt'))}, text + '\\n');
        const sr = 48000, n = 24000;
        const buf = Buffer.alloc(44 + n * 2);
        buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
        buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
        buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
        buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
        for (let i = 2400; i < 21600; i++) buf.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 300 * i / sr)), 44 + i * 2);
        writeFileSync(out, buf);
        const [a, b] = mode === 'mismatch' ? ['甲乙', '丙丁'] : [text.slice(0, 2), text.slice(2)];
        writeFileSync(sub, 'WEBVTT\\n\\n00:00:00.050 --> 00:00:00.150\\n' + a + '\\n\\n00:00:00.150 --> 00:00:00.450\\n' + b + '\\n');
      `);
      p.voice = { provider: 'command', command: `${process.execPath} ${fakeTts} {text} {out} {sub}${mismatch ? ' mismatch' : ''}` };
      const timing = await synthesizeProject(p, dir);
      assert.deepEqual(readFileSync(join(dir, 'said.txt'), 'utf8').trim().split('\n'), ['沪指涨百分之三点七。', '答案藏在阳光里。']);
      assert.equal(timing['s01-0'].cache_key, sentenceHash('沪指涨百分之三点七。', p.voice));
      assert.equal(timing['s01-0'].source, 'provider');
      assert.deepEqual(timing['s01-0'].words.map((w) => w.text), ['沪', '指', '涨', '3.7%'], mismatch ? 'mismatch falls back to the estimate' : 'mapped');
      assert.deepEqual(timing['s01-1'].words.map((w) => w.text), [...'答案藏在阳光里']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/render-core.test.mjs`
Expected: FAIL：`displayWords` 不存在（SyntaxError: does not provide an export named 'displayWords'）。

- [ ] **Step 3: 改 `timing.mjs`**

第 1–3 行的注释和 import 后面加两行 import：

```js
import { spawnSync } from 'node:child_process';
import { countChars } from './captions.mjs';
import { toSpoken } from './reading.mjs';
```

把第 137–163 行的 `estimateWords` 整段换成：

```js
// Display tokens of a sentence with their spoken text and weight (出片质量设计 §6.1, 字幕与转场设计 §3.3): Han char 1,
// English word 0.8 per syllable, mid-sentence pause 0.6, a replaced span (a number, a pronunciation term) its reading length.
function displayTokens(sentence, spans) {
  const tokens = [];
  const plain = (text) => {
    for (const [tok] of text.matchAll(/[A-Za-z]+|[0-9]+(?:\.[0-9]+)?|./gu)) {
      if (PAUSE_PUNCT.test(tok)) tokens.push({ text: tok, spoken: '', weight: 0.6, emit: false });
      else if (SKIP_PUNCT.test(tok)) continue;
      else if (/^[0-9]/.test(tok)) tokens.push({ text: tok, spoken: tok, weight: Math.max(1, DIGIT_COUNT(tok) + (tok.includes('.') ? 1 : 0)), emit: true });
      else if (/^[A-Za-z]/.test(tok)) tokens.push({ text: tok, spoken: tok, weight: EN_SYLLABLES(tok) * 0.8, emit: true });
      else tokens.push({ text: tok, spoken: tok, weight: 1, emit: true });
    }
  };
  let at = 0;
  for (const s of spans) {
    plain(sentence.slice(at, s.start));
    tokens.push({ text: s.text, spoken: s.reading, weight: Math.max(1, countChars(s.reading)), emit: true });
    at = s.end;
  }
  plain(sentence.slice(at));
  return tokens;
}

/**
 * Estimates word-level timestamps of the display text within [speechStartMs, speechEndMs]. `spans` (from toSpoken) are
 * weighed by their reading, so 15.07% takes as long as 百分之十五点零七.
 */
export function estimateWords(sentence, speechStartMs, speechEndMs, spans = toSpoken(sentence).spans) {
  const tokens = displayTokens(sentence, spans);
  const totalWeight = tokens.reduce((s, t) => s + t.weight, 0);
  if (!totalWeight) return [];
  const span = Math.max(1, speechEndMs - speechStartMs);
  let acc = 0;
  const out = [];
  for (const tok of tokens) {
    const start_ms = Math.round(speechStartMs + (acc / totalWeight) * span);
    acc += tok.weight;
    const end_ms = Math.round(speechStartMs + (acc / totalWeight) * span);
    if (tok.emit) out.push({ text: tok.text, start_ms, end_ms: Math.max(start_ms + 1, end_ms) });
  }
  return out;
}

const spokenChars = (s) => s.match(/[\p{L}\p{N}]/gu) ?? [];

/**
 * Maps provider word times, which are on the spoken text, back to display words (字幕与转场设计 §3.3). Returns null when
 * the provider's characters differ from the spoken text, so the caller falls back to estimateWords.
 */
export function displayWords(words, sentence, spans) {
  const tokens = displayTokens(sentence, spans);
  if (words.map((w) => spokenChars(w.text).join('')).join('') !== tokens.map((t) => spokenChars(t.spoken).join('')).join('')) return null;
  const marks = [];
  for (const w of words) {
    const chars = spokenChars(w.text);
    chars.forEach((_, i) => marks.push([w.start_ms + ((w.end_ms - w.start_ms) * i) / chars.length, w.start_ms + ((w.end_ms - w.start_ms) * (i + 1)) / chars.length]));
  }
  const out = [];
  let k = 0;
  for (const t of tokens) {
    const n = spokenChars(t.spoken).length;
    if (t.emit && n) {
      const start_ms = Math.round(marks[k][0]);
      out.push({ text: t.text, start_ms, end_ms: Math.max(start_ms + 1, Math.round(marks[k + n - 1][1])) });
    }
    k += n;
  }
  return out;
}
```

- [ ] **Step 4: 改 `tts.mjs`**

第 10 行 import 改为：

```js
import { toSpoken } from './reading.mjs';
import { detectSpeechBounds, displayWords, estimateWords, parseSubtitles, splitRecordingBySilence } from './timing.mjs';
```

删掉第 52–59 行的 `applyPronunciation`（注释和函数）。

第 203–212 行 `allSentences` 改为：

```js
  const allSentences = project.sections.flatMap((sec) =>
    splitSentences(sec.text).map((text, idx) => {
      const { spoken, spans } = toSpoken(text, sec.pronunciation);
      return { key: `${sec.id}-${idx}`, section: sec.id, index: idx, text, spoken, spans };
    }),
  );
```

第 286–298 行的词时间改为：

```js
      if (parsed.length > 1) {
        // Provider words are on the spoken text: map them back to display words, or estimate inside their span
        words = displayWords(parsed, s.text, s.spans)
          ?? estimateWords(s.text, parsed[0].start_ms, Math.max(parsed[0].start_ms + 50, parsed.at(-1).end_ms), s.spans);
        source = 'provider';
      } else if (parsed.length === 1) {
        // edge-tts v7 emits one sentence-level cue: subdivide its exact speech span into weighted words
        words = estimateWords(s.text, parsed[0].start_ms, Math.max(parsed[0].start_ms + 50, parsed[0].end_ms), s.spans);
        source = 'provider';
      }
    }
    if (!words.length) {
      words = estimateWords(s.text, speech[0], speech[1], s.spans);
    }
```

`auditionVoices`（约第 344 行）改为：

```js
    .flatMap((sec) => splitSentences(sec.text).map((t) => toSpoken(t, sec.pronunciation).spoken))
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test tests/render-core.test.mjs tests/reading.test.mjs && npm test`
Expected: PASS。`tests/golden.test.mjs` 也通过：金样用的假时间没有词，示例和夹具里还没有阿拉伯数字的 `at`，画面不变。

- [ ] **Step 6: 提交**

```bash
git add skills/topic-to-video/scripts/lib/timing.mjs skills/topic-to-video/scripts/lib/tts.mjs tests/render-core.test.mjs
git commit -m "feat(tts): send the read-out text to the voice and keep display words in timing.json"
```

---

### Task 3: 估时、`HANZI_NUMBER` 与示例改写

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/project.mjs:5`（import）、`:616-621`（`estimateSentences`）、`:644-657`（`lintScript`）
- Modify: `skills/topic-to-video/scripts/lib/motion.mjs:291`
- Modify: `examples/cache-speed/project.json`、`examples/cache-speed/讲稿.md`、`examples/cache-speed/提示词包.md`、`site/index.html:246`
- Test: `tests/project.test.mjs`、`tests/stage.test.mjs:504`、`tests/persona.test.mjs`、`tests/fixtures/golden-16x9.json`
- Create（不提交）: `out/review/golden-png.mjs`

**Interfaces:**
- Consumes: `toSpoken` from `./reading.mjs`（Task 1）
- Produces:
  - `hanziNumbers(sentence: string) → string[]`（`project.mjs` 导出）：句中写成汉字的数据，按位置排列，相邻或重叠的合并
  - `lintScript` 新警告 `{ path: '/sections/<i>/text', code: 'HANZI_NUMBER', message }`，每句一条
  - 估时按 `toSpoken(sentence, section.pronunciation).spoken` 数字
  - `out/review/golden-png.mjs <tag>`：把每个金样帧渲成 `out/review/golden-<tag>/<case>/<shot>@<t>.png`（Task 6、7 也用）

- [ ] **Step 1: 写金样对比脚本 `out/review/golden-png.mjs`，渲染改动前的帧**

```js
// Review aid (字幕与转场实施计划), not committed: renders every golden sample frame to out/review/golden-<tag>/<case>/<key>.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { fakeTiming, goldenCases, manifest } from '../../tests/helpers/golden.mjs';
import { buildShotPlans, evaluateFrame } from '../../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../../skills/topic-to-video/scripts/lib/timebase.mjs';

const tag = process.argv[2] ?? 'after';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
for (const [name, p] of Object.entries(goldenCases())) {
  const dir = `out/review/golden-${tag}/${name}`;
  mkdirSync(dir, { recursive: true });
  for (const plan of buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest)) {
    for (const t of [0.05, plan.durationSec / 2, Math.max(0.05, plan.durationSec - 0.05)]) {
      const f = evaluateFrame(manifest, plan, t);
      const text = f.textItems.filter((it) => (it.opacity ?? 1) > 0.01)
        .map((it) => `<text x="${it.x}" y="${it.y + it.fontSize * 0.35}" font-size="${it.fontSize}" fill="${it.color}" fill-opacity="${it.opacity ?? 1}" text-anchor="${it.align ?? 'middle'}" font-weight="bold">${esc(it.text)}</text>`)
        .join('');
      const png = new Resvg(f.vectorSvg.replace(/<\/svg>$/, `${text}</svg>`), { fitTo: { mode: 'width', value: 960 }, font: { loadSystemFonts: true } }).render().asPng();
      writeFileSync(`${dir}/${plan.id}@${t.toFixed(3)}.png`, png);
    }
  }
}
console.log(`out/review/golden-${tag}/`);
```

Run: `node out/review/golden-png.mjs before-t3`
Expected: 打印 `out/review/golden-before-t3/`，约 1 分钟。

- [ ] **Step 2: 写失败测试**

`tests/project.test.mjs` 的 import 里加上 `hanziNumbers`（与 `estimateSeconds`、`lintScript` 同一行列表）。把第 191 行的 `'一'.repeat(31)` 改成 `'字'.repeat(31)`（31 个“一”会被当成汉字数字）。追加：

```js
test('estimates count the characters the voice reads, not the digits on screen (字幕与转场设计 §3.3)', () => {
  const p = minimal();
  p.sections[0].text = '涨15.07%。';
  assert.equal(estimateSeconds(p).toFixed(6), (9 / 4.5 + 0.25).toFixed(6));
  p.sections[0].text = '用Redis。';
  p.sections[0].pronunciation = [{ term: 'Redis', reading: '瑞迪斯' }];
  assert.equal(estimateSeconds(p).toFixed(6), (4 / 4.5 + 0.25).toFixed(6));
});

test('HANZI_NUMBER flags data written in Chinese numerals and leaves counts and set phrases alone (字幕与转场设计 §3.4)', () => {
  const flagged = [
    ['科创五零大涨百分之十五点零七', ['百分之十五点零七']], ['沪指涨超三点七', ['三点七']], ['流入一点四万亿', ['一点四万亿']],
    ['二十七', ['二十七']], ['四百只', ['四百']], ['三千六百点', ['三千六百']], ['两万亿元', ['两万亿']],
    ['十一月二十七日', ['十一月二十七日']], ['三月五日', ['三月五日']], ['二零二六年', ['二零二六年']], ['返回三零四', ['三零四']],
    ['今天是十一月二十七日，科创五零大涨百分之十五点零七。', ['十一月二十七日', '百分之十五点零七']],
  ];
  for (const [s, want] of flagged) assert.deepEqual(hanziNumbers(s), want, s);
  for (const s of ['四股力量', '第一', '一点', '一起', '一些', '十分', '千方百计', '万众一心', '两到三倍', '三五个', '七八成',
    '百分之百', '千万别扔', '万一过期了', '三四十个', '一点一点地', '第一点', '两点', '十几年']) {
    assert.deepEqual(hanziNumbers(s), [], s);
  }

  const p = minimal();
  p.sections[0].text = '天空为什么是蓝的？阳光里有百分之四十几是蓝光，三点七倍。';
  assert.deepEqual(lintScript(p).filter((w) => w.code === 'HANZI_NUMBER'), [{
    path: '/sections/0/text',
    code: 'HANZI_NUMBER',
    message: '段落 s01 第 1 句的数字写成了汉字（百分之四十、三点七）；数据、百分比、日期和时间写阿拉伯数字，配音读法由渲染器生成（见 script.md）',
  }]);
});
```

`tests/stage.test.mjs` 第 504 行改为（`world-cache.json` 是旧项目夹具，故意保留“三零四”）：

```js
    // world-cache predates 字幕与转场设计 and keeps 三零四: an old project only gets HANZI_NUMBER (§2 C6).
    assert.deepEqual(lintScript(project).map((w) => w.code), name === 'cache' ? ['HANZI_NUMBER', 'HANZI_NUMBER', 'HANZI_NUMBER'] : [], `${name} lintScript warnings`);
```

`tests/persona.test.mjs` 追加：

```js
test('a 304 written in digits points at the picture just like 三零四', () => {
  assert.equal(inferSentenceBeat('超市回张304凭证。').gesture, 'point');
  assert.equal(inferSentenceBeat('超市回张三零四凭证。').gesture, 'point');
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test tests/project.test.mjs tests/stage.test.mjs tests/persona.test.mjs`
Expected: FAIL：`hanziNumbers` 不存在；`304` 的手势是 `present`。

- [ ] **Step 4: 改 `project.mjs`**

第 7 行（`./icons.mjs`）后加：

```js
import { toSpoken } from './reading.mjs';
```

`estimateSentences` 的 `reduce` 改为数配音文本：

```js
/** Planning estimate for some sentences of one section: spoken characters at 4.5 per second plus a gap after each sentence. */
function estimateSentences(project, section, indexes) {
  const gap = (project.settings.sentence_gap_ms ?? DEFAULT_SENTENCE_GAP_MS) / 1000;
  const sentences = splitSentences(section.text);
  return indexes.reduce((sum, i) => sum + countChars(toSpoken(sentences[i] ?? '', section.pronunciation).spoken) / CHARS_PER_SECOND + gap, 0);
}
```

在 `lintScript` 前面加：

```js
// Chinese numerals that are data (字幕与转场设计 §3.4): percentages, decimals, multi-character numbers with a unit
// character, dates, four-digit years and three or more digit characters in a row. Counts and set phrases are skipped.
const N = '零〇一二两三四五六七八九十百千万亿';
const HANZI_NUMBER_RULES = [
  { rx: new RegExp(`百分之[${N}]+(?:点[零〇一二三四五六七八九]+)?`, 'g'), skip: (m) => m === '百分之百' },
  { rx: new RegExp(`[${N}]+点[零〇一二三四五六七八九]+(?!点)`, 'g') },
  { rx: new RegExp(`[${N}]{2,}`, 'g'), skip: (m) => !/[十百千万亿]/.test(m) || ['千万', '万一'].includes(m) || /^[一二三四五六七八九]{2}[十百千万亿]$/.test(m) },
  { rx: /[零〇一二三四五六七八九十]+月[零〇一二三四五六七八九十]+[日号]/g },
  { rx: /[零〇一二三四五六七八九]{4}年/g },
  { rx: /[零〇一二两三四五六七八九]{3,}/g },
];

/** The data in a sentence written as Chinese numerals, in order; overlapping or touching hits are merged. */
export function hanziNumbers(sentence) {
  const hits = [];
  for (const { rx, skip } of HANZI_NUMBER_RULES) {
    for (const m of sentence.matchAll(rx)) if (!skip?.(m[0])) hits.push([m.index, m.index + m[0].length]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of hits) {
    const last = merged.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged.map(([s, e]) => sentence.slice(s, e));
}
```

`lintScript` 里 `ABSOLUTE_CLAIM` 那一行后面加：

```js
    const hanzi = hanziNumbers(sentence);
    if (hanzi.length) warnings.push({ path: `/sections/${i}/text`, code: 'HANZI_NUMBER', message: `段落 ${s.id} 第 ${j} 句的数字写成了汉字（${hanzi.join('、')}）；数据、百分比、日期和时间写阿拉伯数字，配音读法由渲染器生成（见 script.md）` });
```

- [ ] **Step 5: 改 `motion.mjs` 第 291 行**

```js
  } else if (hasVisualCue || /(?:看|先看|找到|并排|这边|这张图|三零四|304|服务器|浏览器|副本)/.test(s)) {
```

- [ ] **Step 6: 跑测试，确认只剩示例报警**

Run: `node --test tests/project.test.mjs tests/stage.test.mjs tests/persona.test.mjs && npm test`
Expected: 上述三个文件 PASS；`npm test` 里 `tests/example.test.mjs` 和 `tests/check-cli.test.mjs` FAIL，警告是示例 s04、s05 的 `HANZI_NUMBER`（三零四）。

- [ ] **Step 7: 改写示例**

`examples/cache-speed/project.json`：
- `brief.promise` 末尾“确认三零四”改成“确认304”。
- s04 的 `text` 里“超市回张三零四凭证”改成“超市回张304凭证”，并在 `"text"` 后加 `"pronunciation": [{ "term": "304", "reading": "三零四" }],`。
- s05 的 `text` 里“拿到三零四”改成“拿到304”，同样加 `"pronunciation": [{ "term": "304", "reading": "三零四" }]`（s05 没有 `source_ids`，注意逗号）。
- 两个 `"at": "三零四"`（约第 296 行 sh10 的 `send`、第 362 行 sh13 的 `hold_up`）改成 `"at": "304"`。

`examples/cache-speed/讲稿.md` 第 5、30、36 行、`examples/cache-speed/提示词包.md` 第 70、88 行、`site/index.html` 第 246 行：把“三零四”改成“304”，与 `project.json` 的原文逐字一致。

Run: `grep -rn "三零四" examples/cache-speed site/index.html`
Expected: 只剩 `project.json` 里两处 `"reading": "三零四"`。

Run: `node skills/topic-to-video/scripts/check.mjs examples/cache-speed`
Expected: `errors`、`warnings`、`docs` 都是 `[]`，`total_seconds` 四舍五入仍是 63（配音文本没变）。

- [ ] **Step 8: 看金样变化，再更新金样**

Run: `node --test tests/golden.test.mjs`
Expected: FAIL，只有 `cache-speed` 的哈希变了。

Run: `node out/review/golden-png.mjs after-t3`，然后列出变化的帧：

```bash
UPDATE_GOLDEN=1 node --test tests/golden.test.mjs && node --input-type=module -e "
import { execSync } from 'node:child_process'; import { readFileSync } from 'node:fs';
const a = JSON.parse(execSync('git show HEAD:tests/fixtures/golden-16x9.json')); const b = JSON.parse(readFileSync('tests/fixtures/golden-16x9.json'));
for (const c of Object.keys(b)) { const keys = Object.keys(b[c]).filter((k) => a[c]?.[k] !== b[c][k]); if (keys.length) console.log(c, keys.length, keys.join(' ')); }"
```

Expected: 只有 `cache-speed`。逐张打开变化帧的 `out/review/golden-before-t3/cache-speed/<key>.png` 和 `golden-after-t3/cache-speed/<key>.png` 对比：字幕“三零四”变成“304”；sh10、sh13 的 cue 落点因估算按读法计字略有移动（金样的假时间没有词）。其他变化都要查明原因，不对就 `git checkout tests/fixtures/golden-16x9.json` 回去修。

- [ ] **Step 9: 全量测试并提交**

Run: `npm test`
Expected: PASS。

```bash
git add skills/topic-to-video/scripts/lib/project.mjs skills/topic-to-video/scripts/lib/motion.mjs examples/cache-speed site/index.html tests/project.test.mjs tests/stage.test.mjs tests/persona.test.mjs tests/fixtures/golden-16x9.json
git commit -m "feat(check): estimate by the read-out text, warn about HANZI_NUMBER and write 304 in the example"
```

---

### Task 4: `qa.md` 读法对照

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/qa.mjs:7-10`（import）、`:310-318`、`:339-344`、`:374-382`
- Test: `tests/qa.test.mjs`

**Interfaces:**
- Consumes: `toSpoken` from `./reading.mjs`（Task 1）
- Produces:
  - `qa.json` 的 `manual_review.number_reading: 'not_checked'`
  - `qa.md` 在“## 声音”和“## 人工复核项”之间新增“## 读法对照”：有替换的句子一行 `| s01-0 | 科创50 → 科创五零；15.07% → 百分之十五点零七 |`，没有时写 `- 无`；人工复核项加“数字读法”

- [ ] **Step 1: 写失败测试（追加到 `tests/qa.test.mjs`）**

```js
test('qa.md lists how every number is read and asks for a listen (字幕与转场设计 §3.3)', async (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg unavailable');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'svs-qa-reading-'));
  try {
    const p = minimal();
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));
    const videoPath = makeQaClip(dir);
    const plain = await runQa(dir, { videoPath, audio: null });
    assert.equal(plain.manual_review.number_reading, 'not_checked');
    assert.match(readFileSync(join(dir, 'out/qa.md'), 'utf8'), /## 读法对照\n- 无\n/);

    p.sections[0].text = '科创50大涨15.07%？答案藏在阳光里。';
    p.sections[0].pronunciation = [{ term: '科创50', reading: '科创五零' }];
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));
    await runQa(dir, { videoPath, audio: null });
    const md = readFileSync(join(dir, 'out/qa.md'), 'utf8');
    assert.match(md, /## 读法对照\n\| 句子 \| 写法 → 读法 \|\n\| --- \| --- \|\n\| s01-0 \| 科创50 → 科创五零；15\.07% → 百分之十五点零七 \|\n\n/);
    assert.match(md, /- 数字读法：`not_checked`/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/qa.test.mjs`
Expected: FAIL：`number_reading` 是 `undefined`。

- [ ] **Step 3: 改 `qa.mjs`**

第 9 行（`./match.mjs`）后加：

```js
import { toSpoken } from './reading.mjs';
```

在 `const matchTable = ...` 后面加：

```js
  // 读法对照 (字幕与转场设计 §3.3): every sentence whose voice-over differs from the caption.
  const readings = project.sections.flatMap((sec) => splitSentences(sec.text)
    .map((text, j) => ({ key: `${sec.id}-${j}`, spans: toSpoken(text, sec.pronunciation).spans }))
    .filter((r) => r.spans.length));
```

`manual_review` 里 `sound_mix` 后面加 `number_reading: 'not_checked',`。

`md` 数组里 `...soundSection(audio),` 和它后面的 `''` 之后、`'## 人工复核项（`not_checked`）'` 之前插入：

```js
    '## 读法对照',
    ...(readings.length
      ? ['| 句子 | 写法 → 读法 |', '| --- | --- |', ...readings.map((r) => `| ${r.key} | ${r.spans.map((s) => `${s.text} → ${s.reading}`).join('；')} |`)]
      : ['- 无']),
    '',
```

人工复核项里 `'- 混音听感：`not_checked`',` 后面加：

```js
    '- 数字读法：`not_checked`（对照上面的读法对照听一遍；读错的写进该段 `pronunciation`）',
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/qa.test.mjs && npm test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/qa.mjs tests/qa.test.mjs
git commit -m "feat(qa): list how numbers are read and add the number_reading review item"
```

---

### Task 5: 按词断行与分页

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/timing.mjs:20-94`（`splitClauses`、删 `IS_PUNCT`/`OPEN_PUNCT`、`subtitlePages` 换成 `layoutCaption`）
- Test: `tests/caption-layout.test.mjs`（新）、`tests/portrait-subtitles.test.mjs`

**Interfaces:**
- Consumes: `NUMBER_UNITS` from `./reading.mjs`（Task 1）；`textBox` from `./frame.mjs`
- Produces:
  - `splitClauses(sentence) → string[]`：夹在两个数字之间的 `,` `:` 不切
  - `layoutCaption(text, { maxChars = null, maxLines = 1, keywords = [], segment }) → { text: string, start: number }[][]`：页 → 行；`start` 是行首在 `text` 里的下标；`maxChars === null` 是横屏（每个小句一页，12 字以内或只有一个小句时整句一页）；`segment(text) → string[]` 默认用 `Intl.Segmenter('zh-CN', { granularity: 'word' })`
  - `subtitlePages(text, opts) → string[][]`：竖屏默认 `maxChars: 12, maxLines: 2`，`opts` 可带 `keywords`、`segment`

- [ ] **Step 1: 写失败测试 `tests/caption-layout.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textBox } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { layoutCaption, splitClauses, subtitlePages } from '../skills/topic-to-video/scripts/lib/timing.mjs';

const show = (pages) => pages.map((pg) => pg.join(' / ')).join(' ‖ ');
const width = (s) => textBox({ text: s, fontSize: 1, x: 0, y: 0 }).w;
// What a Node built without ICU word data does: every character is its own segment.
const perChar = (s) => [...s];

test('the four sentences of 字幕与转场设计 §4.5 break as designed, with and without the ICU word segmenter', () => {
  const examples = [
    ['科创50大涨15.07%，创业板涨11.61%。', [], '科创50大涨15.07% / 创业板涨11.61%。'],
    ['沪指涨超3.7%站稳3600点，超5300只飘红。', [], '沪指涨超3.7%站稳3600点 / 超5300只飘红。'],
    ['国内算力需求还在，订单自然流向国产芯片和设备。', ['暂停', '流向', '国产', '海外发运', '国产替代'], '国内算力需求还在 ‖ 订单自然流向 / 国产芯片和设备。'],
    ['第三股力量，是中午12点半国常会放出稳市大招。', ['国常会', '国家队', '平准基金', '入市', '分红回购'], '第三股力量 ‖ 是中午12点半国常会 / 放出稳市大招。'],
  ];
  for (const segment of [undefined, perChar]) {
    for (const [text, keywords, want] of examples) assert.equal(show(subtitlePages(text, { keywords, segment })), want, `${text} (${segment ? 'per char' : 'ICU'})`);
  }
});

test('a number group stays on one line with its units, and so does an English word', () => {
  for (const segment of [undefined, perChar]) {
    for (const [text, group] of [
      ['我们一起来看看这只股票今天涨了15.07%又跌回来。', '15.07%'], ['央行这次一共释放的资金大约是1.4万亿元。', '1.4万亿'],
      ['会议定在明天中午的12点半准时开始。', '12点半'], ['这家公司的利润大约涨了2到3倍左右。', '2到3倍'],
      ['我们约好了在11月27日那天一起去。', '11月27日'], ['这一天全市场一共有超过5,300只股票上涨。', '5,300只'],
      ['今天上午的行情是从14:05开始才明显转强。', '14:05'], ['这次发布的新显卡型号叫做RTX5090Ti。', 'RTX5090Ti'],
    ]) {
      const lines = subtitlePages(text, { segment }).flat();
      assert.ok(lines.some((l) => l.includes(group)), `${group}: ${lines.join(' / ')}`);
      for (const l of lines) assert.ok(width(l) <= 12, `${l} is ${width(l)} wide`);
    }
  }
});

test('no line starts with 的 了 着 过 吗 呢 吧 啊', () => {
  for (const segment of [undefined, perChar]) {
    for (const text of ['这是我们今天要讲的最重要的一个知识点。', '小青说这就是我们一直在找的那个答案了。', '他们终于明白了为什么天空总是蓝色的呢？']) {
      const lines = subtitlePages(text, { segment }).flat();
      assert.equal(lines.join(''), text);
      assert.ok(lines.slice(1).every((l) => !/^[的了着过吗呢吧啊]/.test(l)), lines.join(' / '));
    }
  }
});

test('only a word wider than a line is cut inside, and a clause longer than two lines fills pages two lines at a time', () => {
  const wide = 'Supercalifragilisticexpialidocious这个词。';
  const lines = subtitlePages(wide).flat();
  assert.equal(lines.join(''), wide);
  for (const l of lines) assert.ok(width(l) <= 12, l);
  const pages = subtitlePages(`${'一二三四五六七八九十'.repeat(3)}。`);
  assert.deepEqual(pages.map((pg) => pg.length), [2, 1]);
  for (const l of pages.flat()) assert.ok(width(l) <= 12, l);
});

test('splitClauses keeps 5,300 and 14:05 whole (Review Focus 2)', () => {
  assert.deepEqual(splitClauses('超5,300只，14:05开盘, 然后'), ['超5,300只，', '14:05开盘,然后']);
  assert.equal(show(subtitlePages('超5,300只，14:05开盘。')), '超5,300只 / 14:05开盘。');
});

test('landscape layout is one clause per page, and a short or one-clause sentence stays whole', () => {
  assert.deepEqual(layoutCaption('你好，世界。'), [[{ text: '你好，世界。', start: 0 }]]);
  assert.deepEqual(layoutCaption('你昨天见过的这张图标，今天再打开，还要从头下载吗？'), [
    [{ text: '你昨天见过的这张图标', start: 0 }],
    [{ text: '今天再打开', start: 11 }],
    [{ text: '还要从头下载吗？', start: 17 }],
  ]);
  assert.deepEqual(layoutCaption(''), []);
});
```

`tests/portrait-subtitles.test.mjs` 按显示宽度断言：

- 第 10 行 `const len = ...` 下面加：

```js
const width = (s) => textBox({ text: s, fontSize: 1, x: 0, y: 0 }).w;
```

并在 import 里加 `import { textBox } from '../skills/topic-to-video/scripts/lib/frame.mjs';`（与 `FRAMES` 合成一行：`import { FRAMES, textBox } from ...`）。
- 第 14 行（30 个汉字数字那句）换成性质断言，分词随 ICU 版本不同：

```js
  const numerals = '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十。';
  const pages = subtitlePages(numerals);
  assert.equal(pages.flat().join(''), numerals);
  assert.deepEqual(pages.map((pg) => pg.length), [2, 1]);
```

- 把文件里五处 `len(...) <= 12`（`Redis` 那条、标点那条的两处、「缓存」那条、夹具那条、ASS 那条）改成 `width(...) <= 12`，错误信息里的 `len(l)` 也改成 `width(l)`：宽度才是断行的约束，`一二三四五六七Redis？` 有 13 个字符、宽 11。
- `subtitlePages('123456789012。')` 那一行改为（12 个数字宽 7.2，句号跟着整体）：

```js
  assert.deepEqual(subtitlePages('123456789012。').flat(), ['123456789012。']);
```

改完后 `len` 不再用到，删掉 `const len = ...` 那一行。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/caption-layout.test.mjs tests/portrait-subtitles.test.mjs`
Expected: FAIL：`layoutCaption` 不存在；`'123456789012。'` 仍被切成两行。

- [ ] **Step 3: 改 `timing.mjs`**

import 改为：

```js
import { spawnSync } from 'node:child_process';
import { countChars } from './captions.mjs';
import { textBox } from './frame.mjs';
import { NUMBER_UNITS, toSpoken } from './reading.mjs';
```

`splitClauses` 的 `split` 正则改为（夹在数字之间的 `,` `:` 不切）：

```js
  const raw = text.split(/(?<=[，、；：;]|——|……|(?<!\d)[,:]|[,:](?!\d))/).map((s) => s.trim()).filter(Boolean);
```

把第 35–94 行（`IS_PUNCT`、`OPEN_PUNCT` 和旧的 `subtitlePages`）整段换成：

```js
// Caption line breaking (字幕与转场设计 §4): a clause breaks only between atoms — number groups, keywords, English words
// and segmenter words — into the fewest lines, then the most even lines, avoiding breaks next to an unknown single
// character and lines that start with a particle.
const FUNCTION_WORDS = new Set('的了和与及或在是把被从向对给跟也都还就才又再很更最不没有让为以于而并但却则即每各该这那其此之将已曾正到');
const WEAK_START = new Set('的了着过吗呢吧啊');
const BREAK_PENALTY = 4;
const HARD = new RegExp(`[A-Za-z][A-Za-z0-9.+-]*|\\d+[A-Za-z][A-Za-z0-9.+-]*|\\d[\\d.,:%％]*[${NUMBER_UNITS}]*(?:[到至~～–-]?\\d[\\d.,:%％]*[${NUMBER_UNITS}]*)*`, 'gu');
const OPENING = /^[\p{Ps}\p{Pi}]+$/u;
const PUNCT = /^[\p{P}\s]+$/u;
const width = (s) => textBox({ text: s, fontSize: 1, x: 0, y: 0 }).w;

let segmenter;
function segmentWords(text) {
  segmenter ??= new Intl.Segmenter('zh-CN', { granularity: 'word' });
  return [...segmenter.segment(text)].map((s) => s.segment);
}

// Atoms of one clause: hard spans (number groups, English words, keywords; overlapping ones merged) and segmenter
// words for the gaps. Punctuation sticks to the atom before it, opening brackets and quotes to the atom after.
function atomsOf(clause, keywords, segment) {
  const hard = [...clause.matchAll(HARD)].map((m) => [m.index, m.index + m[0].length]);
  for (const k of keywords) for (let i = clause.indexOf(k); i >= 0; i = clause.indexOf(k, i + 1)) hard.push([i, i + k.length]);
  hard.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const [s, e] of hard) {
    const last = merged.at(-1);
    if (last && s < last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const raw = [];
  const words = (from, to) => {
    let p = from;
    for (const w of segment(clause.slice(from, to))) {
      const single = [...w].length === 1 && /\p{Script=Han}/u.test(w) && !FUNCTION_WORDS.has(w);
      raw.push({ text: w, start: p, kind: PUNCT.test(w) ? 'punct' : single ? 'single' : 'word' });
      p += w.length;
    }
  };
  let pos = 0;
  for (const [s, e] of merged) {
    if (pos < s) words(pos, s);
    raw.push({ text: clause.slice(s, e), start: s, kind: 'hard' });
    pos = e;
  }
  if (pos < clause.length) words(pos, clause.length);
  const atoms = [];
  let open = null;
  for (const a of raw) {
    if (a.kind === 'punct' && OPENING.test(a.text)) open = open ? { ...open, text: open.text + a.text } : { ...a };
    else if (open) {
      atoms.push({ ...a, text: open.text + a.text, start: open.start });
      open = null;
    } else if (a.kind === 'punct' && atoms.length) atoms.at(-1).text += a.text;
    else atoms.push({ ...a });
  }
  if (open) atoms.push(open);
  return atoms;
}

// Lines of one clause: the fewest lines of at most maxWidth, then the lowest cost; on a tie the earlier break wins.
function breakClause(atoms, maxWidth) {
  const units = atoms.flatMap((a) => {
    if (width(a.text) <= maxWidth) return [a];
    let p = a.start;
    return [...a.text].map((ch) => {
      const u = { text: ch, start: p, kind: 'char' };
      p += ch.length;
      return u;
    });
  });
  const w = units.map((u) => width(u.text));
  let lines = 1;
  let acc = 0;
  for (const x of w) {
    if (acc > 0 && acc + x > maxWidth + 1e-9) {
      lines += 1;
      acc = x;
    } else acc += x;
  }
  const prefix = [0];
  for (const x of w) prefix.push(prefix.at(-1) + x);
  const mean = prefix.at(-1) / lines;
  const penalty = (j) => (units[j - 1].kind === 'single' || units[j].kind === 'single' ? BREAK_PENALTY : 0)
    + (WEAK_START.has(units[j].text[0]) ? BREAK_PENALTY : 0);
  const n = units.length;
  const best = Array.from({ length: lines + 1 }, () => new Array(n + 1).fill(Infinity));
  const back = Array.from({ length: lines + 1 }, () => new Array(n + 1).fill(-1));
  best[0][0] = 0;
  for (let k = 1; k <= lines; k += 1) {
    for (let i = k; i <= n; i += 1) {
      for (let j = k - 1; j < i; j += 1) {
        const lw = prefix[i] - prefix[j];
        if (best[k - 1][j] === Infinity || lw > maxWidth + 1e-9) continue;
        const cost = best[k - 1][j] + (lw - mean) ** 2 + (j > 0 ? penalty(j) : 0);
        if (cost < best[k][i] - 1e-9) {
          best[k][i] = cost;
          back[k][i] = j;
        }
      }
    }
  }
  const out = [];
  for (let k = lines, i = n; k > 0; k -= 1) {
    const j = back[k][i];
    out.unshift({ text: units.slice(j, i).map((u) => u.text).join('').trim(), start: units[j].start });
    i = j;
  }
  return out;
}

/**
 * Caption pages of one sentence (字幕与转场设计 §4): pages of lines `{ text, start }`, `start` being the line's offset
 * in `text`. Portrait (`maxChars` set): each clause on lines of at most `maxChars` wide, all of a clause's lines on one
 * page unless it has more than `maxLines`. Landscape (`maxChars` null): one clause per page; a sentence of at most 12
 * characters or with one clause is one page.
 */
export function layoutCaption(text, { maxChars = null, maxLines = 1, keywords = [], segment = segmentWords } = {}) {
  const clauses = [];
  let at = 0;
  for (const part of splitClauses(text)) {
    // splitClauses trims spaces, so a part may not be found verbatim; its offset then only feeds page timing.
    const found = text.indexOf(part, at);
    const start = found < 0 ? at : found;
    at = start + part.length;
    clauses.push({ text: part.replace(/[，、；：,:;]$/, ''), start });
  }
  if (maxChars === null) {
    if (clauses.length <= 1 || [...text].length <= 12) return text ? [[{ text, start: 0 }]] : [];
    return clauses.map((c) => [c]);
  }
  const pages = [];
  let page = [];
  for (const c of clauses) {
    if (!c.text) continue;
    const lines = breakClause(atomsOf(c.text, keywords, segment), maxChars).map((l) => ({ text: l.text, start: c.start + l.start }));
    if (page.length && page.length + lines.length > maxLines) {
      pages.push(page);
      page = [];
    }
    for (const line of lines) {
      if (page.length === maxLines) {
        pages.push(page);
        page = [];
      }
      page.push(line);
    }
  }
  if (page.length) pages.push(page);
  return pages;
}

/** Portrait subtitle pages as text (竖屏设计 §6.5, 字幕与转场设计 §4): at most two lines of width 12 per page. */
export function subtitlePages(text, opts = {}) {
  return layoutCaption(text, { maxChars: 12, maxLines: 2, ...opts }).map((pg) => pg.map((l) => l.text));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/caption-layout.test.mjs tests/portrait-subtitles.test.mjs tests/render-core.test.mjs && npm test`
Expected: PASS。`tests/golden.test.mjs` 不变：金样只有横屏，横屏这一步还没改。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/timing.mjs tests/caption-layout.test.mjs tests/portrait-subtitles.test.mjs
git commit -m "feat(captions): break portrait subtitles between words and keep a clause on one page"
```

---

### Task 6: 翻页时间、关键词与 ASS 统一

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/timing.mjs`（加 `captionPages`）
- Modify: `skills/topic-to-video/scripts/lib/match.mjs`（加 `captionKeywords`）
- Modify: `skills/topic-to-video/scripts/lib/scene.mjs:11`（import）、`:172-176`（`relSentences`）、`:275-292`（`shotCacheKey`）、`:358-445`（`subtitleAt`、`subtitleItems`）
- Modify: `skills/topic-to-video/scripts/lib/encode.mjs:17`（import）、`:356-372`（`buildSubtitlesAss` 循环）
- Test: `tests/caption-pages.test.mjs`（新）、`tests/fixtures/golden-16x9.json`

**Interfaces:**
- Consumes: `layoutCaption`、`estimateWords`（Task 2、5）；`visualKeywords` in `match.mjs`
- Produces:
  - `captionPages(entry: { text, durationMs, speech, words }, opts) → { lines: string[], startMs: number, endMs: number }[]`：时间相对句首；`opts` 同 `layoutCaption`
  - `captionKeywords(project, shot) → string[]`：本镜 cue 的 `at`、`visualKeywords(shot.visual)`、本段 `pronunciation` 的 `term`，只留 2–6 字，去重，按这个顺序
  - `buildShotPlans` 的每个 `plan.sentences[k]` 多一个 `captions`（`captionPages` 的结果）；`shotCacheKey` 把它算进去
  - `buildSubtitlesAss` 横竖屏都按 `captionPages` 出 `Dialogue`，起止 = 句首 + 页的起止

- [ ] **Step 1: 渲染改动前的金样帧**

Run: `node out/review/golden-png.mjs before-t6`

- [ ] **Step 2: 写失败测试 `tests/caption-pages.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubtitlesAss } from '../skills/topic-to-video/scripts/lib/encode.mjs';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { captionKeywords } from '../skills/topic-to-video/scripts/lib/match.mjs';
import { buildShotPlans, evaluateFrame, shotCacheKey } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { captionPages } from '../skills/topic-to-video/scripts/lib/timing.mjs';
import { fakeTiming, goldenCases, manifest } from './helpers/golden.mjs';

const PORTRAIT = { maxChars: 12, maxLines: 2 };

test('captionPages turns a page when its first word is spoken and keeps the last page 120 ms past the sentence', () => {
  const text = '国内算力需求还在，订单自然流向国产芯片和设备。';
  // Estimated words: 订 starts after 8.6 of 21.6 weights of a 50–3900 ms speech span.
  assert.deepEqual(captionPages({ text, durationMs: 4000, speech: [50, 3900], words: [] }, { ...PORTRAIT, keywords: ['流向', '国产'] }), [
    { lines: ['国内算力需求还在'], startMs: 0, endMs: 1583 },
    { lines: ['订单自然流向', '国产芯片和设备。'], startMs: 1583, endMs: 4120 },
  ]);
  const words = [{ text: '国内算力需求还在', start_ms: 50, end_ms: 1400 }, { text: '订单自然流向国产芯片和设备', start_ms: 2222, end_ms: 3900 }];
  assert.deepEqual(captionPages({ text, durationMs: 4000, speech: [50, 3900], words }, PORTRAIT).map((pg) => pg.startMs), [0, 2222]);
});

test('landscape captions switch clauses by word time, and a short sentence with a comma stays whole (Review Focus 4)', () => {
  assert.deepEqual(captionPages({ text: '你昨天见过的这张图标，今天再打开，还要从头下载吗？', durationMs: 4000, speech: [50, 3900], words: [] }), [
    { lines: ['你昨天见过的这张图标'], startMs: 0, endMs: 1809 },
    { lines: ['今天再打开'], startMs: 1809, endMs: 2738 },
    { lines: ['还要从头下载吗？'], startMs: 2738, endMs: 4120 },
  ]);
  assert.deepEqual(captionPages({ text: '你好，世界。', durationMs: 1000, speech: [0, 1000], words: [] }), [{ lines: ['你好，世界。'], startMs: 0, endMs: 1120 }]);
});

test('captionKeywords keeps 2–6 character cue anchors, visual keywords and pronunciation terms', () => {
  const project = { sections: [{ id: 's01', text: '', pronunciation: [{ term: '科创50', reading: '科创五零' }, { term: 'A', reading: '诶' }] }] };
  const shot = {
    section: 's01',
    cues: [{ sentence: 0, do: 'reveal', target: 0, at: '国常会' }, { sentence: 0, do: 'reveal', target: 1, at: '一个很长很长的关键词' }],
    visual: { template: 'stage', data: { heading: '三股力量', objects: [{ prop: 'box', label: '国家队' }, { prop: 'box', label: '国常会' }] } },
  };
  assert.deepEqual(captionKeywords(project, shot), ['国常会', '三股力量', '国家队', '科创50']);
});

const assMs = (s) => {
  const [h, m, sec] = s.split(':');
  return ((Number(h) * 60 + Number(m)) * 60 + Number(sec)) * 1000;
};

test('burned-in subtitles and captions.ass show the same pages at the same times in both orientations', () => {
  const p = goldenCases()['cache-speed'];
  for (const frame of [FRAMES['16:9'], FRAMES['9:16']]) {
    const timeline = buildTimeline(p, fakeTiming(p), 60);
    const plans = buildShotPlans(p, timeline, manifest, { frame });
    const dialogues = buildSubtitlesAss(p, timeline, frame).split('\n').filter((l) => l.startsWith('Dialogue:'));
    assert.ok(dialogues.length > 30);
    for (const line of dialogues) {
      const [, start, end] = line.split(',');
      const text = line.split(',').slice(9).join(',').replace(/\{[^}]*\}/g, '');
      const mid = (assMs(start) + assMs(end)) / 2;
      const k = timeline.shots.findIndex((s) => mid >= s.startMs && mid < s.endMs);
      const shown = evaluateFrame(manifest, plans[k], (mid - timeline.shots[k].startMs) / 1000).textItems
        .filter((ti) => ti.key.startsWith('sub-')).sort((a, b) => a.y - b.y).map((ti) => ti.text).join('\\N');
      assert.equal(shown, text, `${frame.ratio} ${start}`);
    }
  }
});

test('a caption change alone gives the shot a new cache key', () => {
  const p = goldenCases().minimal;
  const before = buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest)[1];
  p.sections[0].text = '天空为什么是蓝的？答案就藏在阳光里，慢慢看。';
  const after = buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest)[1];
  assert.deepEqual(after.audioHashes, before.audioHashes, 'same audio');
  assert.notEqual(shotCacheKey(after), shotCacheKey(before));
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test tests/caption-pages.test.mjs`
Expected: FAIL：`captionKeywords`、`captionPages` 不存在。

- [ ] **Step 4: `timing.mjs` 加 `captionPages`（放在 `subtitlePages` 后面）**

```js
// Offset where each word ends in `text`, with its start time; null when a word is not found in order.
function placeWords(text, words) {
  const out = [];
  let cursor = 0;
  for (const w of words) {
    const pos = text.indexOf(w.text, cursor);
    if (pos < 0) return null;
    out.push({ end: pos + w.text.length, start_ms: w.start_ms });
    cursor = pos + w.text.length;
  }
  return out;
}

/**
 * Caption pages of one sentence and when each shows, in ms from the sentence start (字幕与转场设计 §4.4): the first page
 * from 0, every later page from the moment its first word is spoken, the last one until 120 ms after the sentence.
 * `entry` is a timeline sentence `{ text, durationMs, speech, words }`; `opts` go to layoutCaption.
 */
export function captionPages(entry, opts = {}) {
  const text = entry.text ?? '';
  const pages = layoutCaption(text, opts);
  if (!pages.length) return [];
  const durationMs = entry.durationMs ?? 0;
  const [sp0, sp1] = entry.speech ?? [0, durationMs];
  const placed = placeWords(text, entry.words?.length ? entry.words : estimateWords(text, sp0, sp1));
  const timeAt = (offset) => placed?.find((w) => w.end > offset)?.start_ms ?? Math.round(sp0 + (offset / Math.max(1, text.length)) * (sp1 - sp0));
  const starts = pages.map((pg, i) => (i ? timeAt(pg[0].start) : 0));
  for (let i = 1; i < starts.length; i += 1) starts[i] = Math.max(starts[i], starts[i - 1]);
  return pages.map((pg, i) => ({ lines: pg.map((l) => l.text), startMs: starts[i], endMs: i + 1 < pages.length ? starts[i + 1] : durationMs + 120 }));
}
```

- [ ] **Step 5: `match.mjs` 加 `captionKeywords`（放在 `visualKeywords` 后面）**

```js
/** Words a caption line never splits (字幕与转场设计 §4.1): this shot's cue anchors, visual keywords and its section's
 *  pronunciation terms, 2–6 characters each, without repeats. */
export function captionKeywords(project, shot) {
  const section = project.sections.find((s) => s.id === shot.section);
  const words = [
    ...(shot.cues ?? []).map((c) => c.at),
    ...visualKeywords(shot.visual),
    ...(section?.pronunciation ?? []).map((p) => p.term),
  ];
  return [...new Set(words.filter((w) => typeof w === 'string' && [...w].length >= 2 && [...w].length <= 6))];
}
```

- [ ] **Step 6: 改 `scene.mjs`**

第 6 行（`./frame.mjs`）后加：

```js
import { captionKeywords } from './match.mjs';
```

第 11 行 import 改为（`splitClauses`、`subtitlePages` 不再用）：

```js
import { captionPages, resolveCueTiming } from './timing.mjs';
```

第 172–176 行 `relSentences` 改为：

```js
    const S = frame.subtitle;
    const keywords = captionKeywords(project, shot);
    const relSentences = tl.sentenceRanges.map((r) => ({
      ...r,
      startMs: r.startMs - tl.startMs,
      endMs: r.endMs - tl.startMs,
      // Caption pages and when each shows, from the sentence start (字幕与转场设计 §4.4)
      captions: captionPages(r, { maxChars: S.maxChars, maxLines: S.maxLines, keywords }),
    }));
```

`shotCacheKey` 里 `audioHashes: shotPlan.audioHashes,` 后面加：

```js
    captions: shotPlan.sentences.map((s) => s.captions),
```

把 `subtitleAt` 整段（第 358–398 行）换成：

```js
// The caption page on screen at shot time t (字幕与转场设计 §4.4) and the cue.at keyword in effect.
function captionAt(shotPlan, t) {
  const ms = t * 1000;
  const sent = shotPlan.sentences.find((s) => ms >= s.startMs && ms <= s.endMs + 120);
  if (!sent?.captions?.length) return null;
  const page = sent.captions.findLast((pg) => ms - sent.startMs >= pg.startMs) ?? sent.captions[0];
  const activeAnchor = shotPlan.cues
    .filter((c) => c.sentence === sent.index && c.at && ms >= c.anchorMs - 50)
    .at(-1)?.at;
  return { sent, lines: page.lines, activeAnchor };
}

function subtitleAt(shotPlan, t, pal) {
  const cap = captionAt(shotPlan, t);
  if (!cap) return null;
  const { sent, activeAnchor } = cap;
  const display = cap.lines[0];
  return {
    key: `sub-${sent.key}-${display}-${activeAnchor ?? ''}`,
    text: display,
    highlightWord: activeAnchor && display.includes(activeAnchor) ? activeAnchor : null,
    x: (shotPlan.frame ?? LANDSCAPE).subtitle.x,
    y: (shotPlan.frame ?? LANDSCAPE).subtitle.y,
    fontSize: (shotPlan.frame ?? LANDSCAPE).subtitle.fontSize, // >= 40 px clarity requirement (超越路线图 §5.2)
    color: pal.ink,
    highlightColor: pal.teal,
    stroke: pal.paper,
    align: 'middle',
    weight: 'bold',
    opacity: 1,
  };
}
```

`subtitleItems` 里竖屏部分（从 `const ms = t * 1000;` 到 `const y0 = ...` 之前）换成：

```js
  const cap = captionAt(shotPlan, t);
  if (!cap) return [];
  const { sent, lines: page, activeAnchor } = cap;
  const S = frame.subtitle;
```

后面 `const y0 = ...` 和 `return page.map(...)` 不动。

- [ ] **Step 7: 改 `encode.mjs`**

第 10 行（`./frame.mjs`）后加：

```js
import { captionKeywords } from './match.mjs';
```

第 17 行改为：

```js
import { captionPages } from './timing.mjs';
```

`buildSubtitlesAss` 的 `for (const shot of timeline.shots)` 循环整段换成：

```js
  const shotsById = new Map(project.shots.map((sh) => [sh.id, sh]));
  for (const shot of timeline.shots) {
    const keywords = captionKeywords(project, shotsById.get(shot.id));
    for (const s of shot.sentenceRanges) {
      const kw = anchors.get(s.key);
      const mark = (text) => (kw && text.includes(kw) ? text.replace(kw, `{\\c&HA3A520&}${kw}{\\r}`) : text);
      // The same pages and times as the burned-in subtitles (字幕与转场设计 §4.4)
      for (const pg of captionPages(s, { maxChars: S.maxChars, maxLines: S.maxLines, keywords })) {
        header.push(`Dialogue: 0,${formatAssTime(s.startMs + pg.startMs)},${formatAssTime(s.startMs + pg.endMs)},Default,,0,0,0,,${pg.lines.map(mark).join('\\N')}`);
      }
    }
  }
```

- [ ] **Step 8: 跑测试**

Run: `node --test tests/caption-pages.test.mjs tests/portrait-subtitles.test.mjs tests/scene-encode.test.mjs tests/portrait-scene.test.mjs`
Expected: PASS。

Run: `node --test tests/golden.test.mjs`
Expected: FAIL：横屏多小句句子的切换时刻和每个用例的 `ass` 哈希变了。

- [ ] **Step 9: 看金样变化，再更新金样**

Run: `node out/review/golden-png.mjs after-t6`，再 `UPDATE_GOLDEN=1 node --test tests/golden.test.mjs`，用 Task 3 Step 8 的命令列出变化的帧。
Expected: 变化只在字幕：横屏小句切换的时刻改成按词时间，所以句中帧的那一行字幕可能换成前一个或后一个小句；图解、小青、转场不变。逐张对比 `golden-before-t6` 和 `golden-after-t6` 里变化的帧。

- [ ] **Step 10: 全量测试并提交**

Run: `npm test`
Expected: PASS。

```bash
git add skills/topic-to-video/scripts/lib/timing.mjs skills/topic-to-video/scripts/lib/match.mjs skills/topic-to-video/scripts/lib/scene.mjs skills/topic-to-video/scripts/lib/encode.mjs tests/caption-pages.test.mjs tests/fixtures/golden-16x9.json
git commit -m "feat(captions): turn pages on word times and share them between frames and captions.ass"
```

---

### Task 7: 转场先退后进与背景跟随

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/scene.mjs:14`（`SCENE_VERSION`）、`:17-20`（常量）、`:168`（`crossfade` 时长）、`:611-656`（`evaluateFrame` 的转场和背景）
- Test: `tests/transitions.test.mjs`（新）、`tests/scene-encode.test.mjs:179-193`、`:246`、`:376-430`、`tests/interaction.test.mjs:1034-1035`、`tests/fixtures/golden-16x9.json`

**Interfaces:**
- Consumes: `clamp01`、`easeInOutCubic`、`easeOutCubic`、`lerp` from `./ease.mjs`（已 import）
- Produces:
  - `SCENE_VERSION = 6`（转场画法变了，缓存键里没有别的字段能反映）
  - `crossfade` 的 `durationSec` 0.4
  - 场景背景 `<g data-scene=...>` 在过渡中被 `<g opacity="x">` 包住：舞台换场景时旧的退、新的进；`full` 进舞台在进场段淡入；舞台进 `full` 在退场段淡出；同一场景不动

- [ ] **Step 1: 写失败测试 `tests/transitions.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { buildShotPlans, evaluateFrame } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { fakeTiming, goldenCases, manifest } from './helpers/golden.mjs';

const plansOf = (p, opts) => buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest, opts);
const shownTexts = (f) => f.textItems.filter((it) => (it.opacity ?? 1) > 0.02 && it.text && !it.key?.startsWith('sub-') && it.key !== 'draft-badge');
const kindOf = ({ transition: tr }) => (tr.kind === 'crossfade' ? 'crossfade'
  : /full/.test(tr.layoutSwitch ?? '') && /stage/.test(tr.layoutSwitch ?? '') ? 'full<->stage'
    : tr.shared.length ? 'morph-shared' : 'morph');

// Frames of a transition where text only the old shot had and text only the new shot has are both visible (§5.4).
function overlaps(plans) {
  const bad = [];
  for (let i = 1; i < plans.length; i += 1) {
    const plan = plans[i];
    const prev = plans[i - 1];
    const tr = plan.transition;
    if (tr.kind === 'cut') continue;
    const before = new Set(shownTexts(evaluateFrame(manifest, prev, prev.durationSec - 1 / 60)).map((it) => it.text));
    const after = [...new Set(shownTexts(evaluateFrame(manifest, plan, Math.min(plan.durationSec - 1 / 60, tr.durationSec + 2))).map((it) => it.text))];
    for (let f = 0; f / 60 < tr.durationSec; f += 1) {
      const shown = shownTexts(evaluateFrame(manifest, plan, f / 60));
      const old = shown.find((it) => before.has(it.text) && !after.includes(it.text));
      // A title typed in letter by letter shows a prefix of its final text.
      const fresh = shown.find((it) => !before.has(it.text) && after.some((x) => x.startsWith(it.text)));
      if (old && fresh) bad.push(`${plan.id}@${f}: ${old.text} + ${fresh.text}`);
    }
  }
  return bad;
}

// The minimal fixture with both shots full and nothing in common: a crossfade.
function crossfadeProject() {
  const p = goldenCases().minimal;
  p.shots[0].layout = 'full';
  delete p.shots[0].host;
  return p;
}

test('no transition frame shows old and new text together (字幕与转场设计 §5.4)', () => {
  const kinds = new Set();
  for (const [name, p] of Object.entries({ ...goldenCases(), crossfade: crossfadeProject() })) {
    const plans = plansOf(p);
    plans.slice(1).filter((pl) => pl.transition.kind !== 'cut').forEach((pl) => kinds.add(kindOf(pl)));
    assert.deepEqual(overlaps(plans).slice(0, 3), [], name);
  }
  assert.deepEqual(overlaps(plansOf(goldenCases()['cache-speed'], { frame: FRAMES['9:16'] })).slice(0, 3), [], 'cache-speed 9:16');
  assert.deepEqual([...kinds].sort(), ['crossfade', 'full<->stage', 'morph', 'morph-shared']);
});

test('a crossfade lasts 0.4 s', () => {
  const [, second] = plansOf(crossfadeProject());
  assert.equal(second.transition.kind, 'crossfade');
  assert.equal(second.transition.durationSec, 0.4);
});

const sceneLayers = (svg) => [...svg.matchAll(/(?:<g opacity="([\d.]+)">)?<g data-scene="([\w-]+)"/g)].map((m) => [m[2], Number(m[1] ?? 1)]);

test('the scene background leaves with the old shot and enters with the new one (字幕与转场设计 §5.2)', () => {
  const plans = plansOf(goldenCases()['cache-speed']);
  const stage = (s) => s.shot.layout === 'stage';
  const find = (pred) => plans.find((pl) => pl.prevShot && pl.transition.kind !== 'cut' && pred(pl.prevShot, pl));
  const at = (pl, u) => sceneLayers(evaluateFrame(manifest, pl, u * pl.transition.durationSec).vectorSvg);
  const fading = (layers, name) => layers.length === 1 && layers[0][0] === name && layers[0][1] > 0.05 && layers[0][1] < 0.95;

  const change = find((a, b) => stage(a) && stage(b) && a.scene !== b.scene);
  assert.ok(fading(at(change, 0.2), change.prevShot.scene), JSON.stringify(at(change, 0.2)));
  assert.deepEqual(at(change, 0.45), []);
  assert.ok(fading(at(change, 0.7), change.scene), JSON.stringify(at(change, 0.7)));
  assert.deepEqual(at(change, 1.2), [[change.scene, 1]]);

  const same = find((a, b) => stage(a) && stage(b) && a.scene === b.scene);
  for (const u of [0.2, 0.45, 0.7]) assert.deepEqual(at(same, u), [[same.scene, 1]]);

  const enter = find((a, b) => a.shot.layout === 'full' && stage(b));
  assert.deepEqual(at(enter, 0.2), []);
  assert.ok(fading(at(enter, 0.7), enter.scene), JSON.stringify(at(enter, 0.7)));

  const leave = find((a, b) => stage(a) && b.shot.layout === 'full');
  assert.ok(fading(at(leave, 0.2), leave.prevShot.scene), JSON.stringify(at(leave, 0.2)));
  assert.deepEqual(at(leave, 0.7), []);
});

test('a host-left morph with no shared elements clears the old diagram, then brings in the new one', () => {
  const p = goldenCases().minimal;
  p.shots[1].layout = 'host-left';
  p.shots[1].host = { expr: 'explaining', gesture: 'point' };
  p.shots[1].cues = [];
  const [, second] = plansOf(p);
  const d = second.transition.durationSec;
  const shown = (u) => shownTexts(evaluateFrame(manifest, second, u * d)).map((it) => it.text);
  assert.ok(shown(0.2).includes('天空为什么是蓝的') && !shown(0.2).includes('阳光'), shown(0.2).join('、'));
  assert.ok(shown(0.7).includes('阳光') && !shown(0.7).includes('天空为什么是蓝的'), shown(0.7).join('、'));
});
```

`tests/scene-encode.test.mjs`（按测试名找，删掉一个测试后行号会变）：

- 删掉第 179–193 行的旧测试 `'a host-left morph with no shared elements cross-dissolves without a mid-transition blank gap'`（它要求中段旧新叠在一起，与 §5.2 相反；新版在 `tests/transitions.test.mjs`）。
- 第 246 行改成 `assert.equal(SCENE_VERSION, 6);`。
- 第 376–430 行的 `'stage->stage transition fades both old and new stage-heading ...'` 换成（项目和 `timing` 与原测试相同）：

```js
test('stage->stage transition lets the old heading and underline leave before the new ones enter (字幕与转场设计 §5.2)', () => {
  const p = {
    ...minimal(),
    world: { metaphor: '阶段转换', style: 'paper', scene: 'kitchen' },
    sections: [{ id: 's01', title: '转场', text: '先看第一幕。再看第二幕。' }],
    shots: [
      { id: 'sh01', section: 's01', sentences: [0], layout: 'stage', host: { expr: 'explaining', gesture: 'idle' }, visual: { template: 'stage', data: { heading: '第一幕', objects: [{ prop: 'fridge', label: '冰箱', at: 'center' }] } }, note: 'stage 1' },
      { id: 'sh02', section: 's01', sentences: [1], layout: 'stage', host: { expr: 'happy', gesture: 'idle' }, visual: { template: 'stage', data: { heading: '第二幕', objects: [{ prop: 'box', label: '箱子', at: 'center' }] } }, note: 'stage 2' },
    ],
  };
  const timing = {
    's01-0': { file: 'audio/s01-0.wav', duration_ms: 2000, speech: [50, 1900], source: 'estimate', words: [], sha256: 'st0' },
    's01-1': { file: 'audio/s01-1.wav', duration_ms: 2000, speech: [50, 1900], source: 'estimate', words: [], sha256: 'st1' },
  };
  const plans = buildShotPlans(p, buildTimeline(p, timing, 60), manifest);
  assert.equal(plans[1].transition.kind, 'morph');
  assert.equal(plans[1].transition.durationSec, 0.4);
  const heading = (t, text) => evaluateFrame(manifest, plans[1], t).textItems.find((ti) => ti.key === 'stage-heading' && ti.text === text && (ti.opacity ?? 1) > 0.02);
  const underlines = (t) => [...evaluateFrame(manifest, plans[1], t).vectorSvg.matchAll(/<path[^>]*opacity="([\d.]+)"[^>]*fill="#20a5a3"/g)].map((m) => Number(m[1])).filter((op) => op > 0.02);

  // 0.08 s is 20% into the transition: only the old heading and its underline, fading out.
  const leaving = heading(0.08, '第一幕');
  assert.ok(leaving && leaving.opacity < 0.95, `old heading opacity ${leaving?.opacity}`);
  assert.equal(heading(0.08, '第二幕'), undefined, 'the new heading waits for the old one to leave');
  assert.equal(underlines(0.08).length, 1, JSON.stringify(underlines(0.08)));
  // 0.3 s is 75% in: only the new heading and its underline, fading in.
  assert.equal(heading(0.3, '第一幕'), undefined, 'the old heading has left');
  const entering = heading(0.3, '第二幕');
  assert.ok(entering && entering.opacity < 1, `new heading opacity ${entering?.opacity}`);
  assert.equal(underlines(0.3).length, 1, JSON.stringify(underlines(0.3)));

  assert.equal(heading(0.5, '第一幕'), undefined);
  assert.equal(heading(0.5, '第二幕')?.opacity, 1, 'the new heading settles to opacity 1');
});
```

`tests/interaction.test.mjs` 第 1034–1035 行：标题里的 `SCENE_VERSION=5` 改成 `SCENE_VERSION=6`，断言改成 `assert.equal(SCENE_VERSION, 6);`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/transitions.test.mjs tests/scene-encode.test.mjs`
Expected: FAIL：四个转场测试都失败（第一个报出中段旧新文字同框的帧），`SCENE_VERSION` 仍是 5。

- [ ] **Step 3: 渲染改动前的金样帧**

Run: `node out/review/golden-png.mjs before-t7`

- [ ] **Step 4: 改 `scene.mjs`**

第 14 行：`export const SCENE_VERSION = 6;`

第 19 行 `const evalPlanCache = new WeakMap();` 后面加：

```js
// 先退后进: the share of a transition the old shot takes to leave (字幕与转场设计 §5.2).
const EXIT_SHARE = 0.45;
const fadeLayer = (svg, op) => (op >= 0.999 ? svg : op <= 0.005 ? '' : `<g opacity="${op.toFixed(3)}">${svg}</g>`);
```

第 168 行 `crossfade` 的 `durationSec: 0.3` 改成 `0.4`。

`evaluateFrame` 里从 `if (inTr && tr.kind === 'morph') {` 到 `crossfade` 分支结束的 `}`（第 611–651 行）换成：

```js
  let exitOp = 1;
  let enterOp = 1;
  if (inTr) {
    // 先退后进 (字幕与转场设计 §5.2): old-only content leaves in the first 45%, new-only content enters in the rest,
    // shared elements move from their old box to the new one over the whole transition.
    exitOp = 1 - easeInOutCubic(clamp01(trU / EXIT_SHARE));
    enterOp = easeOutCubic(clamp01((trU - EXIT_SHARE) / (1 - EXIT_SHARE)));
    const sharedByNext = new Map(tr.shared.map((s) => [s.nextIndex, s.prevIndex]));
    const sharedPrev = new Set(tr.shared.map((s) => s.prevIndex));
    const move = easeInOutCubic(trU);
    headingOpacity = enterOp;
    states.forEach((st, ni) => {
      if (sharedByNext.has(ni)) {
        st.overrideBbox = lerpBox(shotPlan.prevShot.elements[sharedByNext.get(ni)].bbox, shotPlan.elements[ni].bbox, move);
      } else {
        st.opacity *= enterOp;
        st.scale = (st.scale ?? 1) * lerp(0.96, 1, enterOp);
      }
    });
    if (exitOp > 0.005) {
      const prevStates = shotPlan.prevShot.elements.map((_, pi) => ({
        opacity: sharedPrev.has(pi) ? 0 : exitOp,
        scale: lerp(0.96, 1, exitOp),
      }));
      const prevRes = renderPrevLayer(shotPlan, prevStates, exitOp);
      prevDiagSvg = prevRes.vectorSvg;
      prevTextItems.push(...prevRes.textItems);
    }
    isFastMotion = true;
  }
```

紧接着的 `sceneBg` 改为：

```js
  const isStage = shotPlan.shot.layout === 'stage';
  // The scene follows the content: a new scene enters with it, the old one leaves with it; the same scene stays.
  const prevStage = inTr && shotPlan.prevShot.shot.layout === 'stage';
  const sameScene = isStage && prevStage && shotPlan.prevShot.scene === shotPlan.scene;
  const sceneBg = (prevStage && !sameScene ? fadeLayer(getCachedSceneBg(shotPlan.prevShot.scene ?? 'blank', styleName, shotPlan.prevShot.id, frame), exitOp) : '')
    + (isStage ? fadeLayer(getCachedSceneBg(shotPlan.scene ?? 'blank', styleName, shotPlan.id, frame), sameScene ? 1 : enterOp) : '');
```

`clamp01`、`easeInOutCubic`、`easeOutCubic`、`lerp` 仍都在用，`scene.mjs` 顶部的 `./ease.mjs` import 不变。

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test tests/transitions.test.mjs tests/scene-encode.test.mjs tests/interaction.test.mjs`
Expected: PASS。

- [ ] **Step 6: 看金样变化，再更新金样**

Run: `node out/review/golden-png.mjs after-t7`，`UPDATE_GOLDEN=1 node --test tests/golden.test.mjs`，再用 Task 3 Step 8 的命令列出变化的帧。
Expected: 变化的基本是每个非硬切镜头的 `@0.050` 帧（过渡开头），这一帧旧画面在退场、新画面还没进来；`durationSec / 2` 和结尾帧不变。逐张对比 `golden-before-t7` 和 `golden-after-t7`：旧标题和新标题不同时出现，背景跟着内容走。

- [ ] **Step 7: 全量测试并提交**

Run: `npm test`
Expected: PASS。

```bash
git add skills/topic-to-video/scripts/lib/scene.mjs tests/transitions.test.mjs tests/scene-encode.test.mjs tests/interaction.test.mjs tests/fixtures/golden-16x9.json
git commit -m "feat(scene): let the old shot leave before the new one enters, and fade scene backgrounds with them"
```

---

### Task 8: 文档、官网与更新记录

**Files:**
- Modify: `skills/topic-to-video/references/script.md:11`、`:64`
- Modify: `skills/topic-to-video/references/storyboard.md:121`
- Modify: `skills/topic-to-video/references/render.md:82`
- Modify: `site/index.html:229`
- Modify: `CHANGELOG.md`（顶部加 v1.1.0）
- Modify: `docs/lite/字幕与转场设计.md:4`（状态行）

**Interfaces:**
- Consumes: Task 1–7 的行为（读法、`HANZI_NUMBER`、读法对照、`at` 写显示文本、先退后进 0.4 秒）
- Produces: 无代码接口；`tests/references.test.mjs` 要求 script.md 仍有“段落的 `pronunciation`”

- [ ] **Step 1: 改 `references/script.md`**

第 11 行改为：

```markdown
- 估算方法：每秒 4.5 个字（只数汉字、字母和数字，不数标点；数字按读法算，15.07% 读“百分之十五点零七”算 8 个字；按 edge-tts 晓晓实测），每句之后另加 0.25 秒停顿。120 秒大约是 480–520 字。
```

第 64 行换成两条：

```markdown
- 数据、百分比、金额、日期、时间和代码写阿拉伯数字，例如“科创50大涨15.07%”“11月27日”“12点半”；计数、序数和固定说法照旧写汉字，例如“四股力量”“第一”“一起”。字幕照讲稿原文显示，配音读法由渲染器生成：15.07% 读“百分之十五点零七”，2026年 读“二零二六年”，0 开头的数字逐位读。讲稿里把数据写成汉字（如“百分之三点七”“三零四”）时，`check.mjs` 会给 `HANZI_NUMBER` 提醒。
- 不按数值读的数字和约定读法写进所在段落的 `pronunciation`，例如 `{"term": "304", "reading": "三零四"}`、`{"term": "科创50", "reading": "科创五零"}`；不写时 304 读“三百零四”。
```

- [ ] **Step 2: 改 `references/storyboard.md` 第 121 行**

```markdown
- `sentence` 须在本镜 `sentences` 内；可选：`cue.at` 填本句关键词子串，照讲稿原文写，数字也写阿拉伯数字，如 `"at": "11.61%"`；`shot.transition: "cut"` 强制硬切；`bullets`/`flow` 可配 `data.icons`（[72 个内置图标](world.md)）。
```

- [ ] **Step 3: 改 `references/render.md` 第 82 行**

```markdown
- `manual_review` 里标 `not_checked` 的人工项（审美、配音自然度、口型抽查、混音、数字读法）照实告诉用户，请用户看一遍；数字读法对照 `qa.md` 的“读法对照”听，读错的写进该段 `pronunciation` 后重新出片（只重配那一句）；竖屏的“真机遮挡”见 providers.md 的竖屏一节。
```

- [ ] **Step 4: 改 `site/index.html` 第 229 行**

```html
      <div class="card"><h3>同元素补间</h3><p>前后镜头里同名的节点、数字和主持人平滑移动到新位置；其余内容先退后进：旧画面先退场，新画面再进场，叠化 0.4 秒。</p></div>
```

- [ ] **Step 5: `CHANGELOG.md` 顶部（`# 更新记录` 下面）加 v1.1.0**

日期写合并当天；下面以 2026-11-27 为例。

```markdown
## v1.1.0（2026-11-27）

### 字幕

- **字幕显示阿拉伯数字**：讲稿里的数据、百分比、日期和时间写阿拉伯数字，字幕照原文显示；配音读法由渲染器生成，如 15.07% 读“百分之十五点零七”、2026年 读“二零二六年”。`qa.md` 新增“读法对照”和人工复核项“数字读法”。
- **按词断行**：竖屏字幕不再拆开数字和单位、英文词、画面关键词和 `pronunciation` 里的词；一个小句的几行放在同一页；翻页卡在下一页第一个词开口的时刻，画面字幕和 `captions.ass` 一致。
- **`HANZI_NUMBER` 提醒**：讲稿把数据写成汉字（如“百分之三点七”“三零四”）时，`check.mjs` 提醒改写。

### 转场

- **先退后进**：旧画面先退场、新画面再进场，前后两镜的标题和标签不再叠在一起；叠化从 0.3 秒改为 0.4 秒；舞台的场景背景跟着内容退场和进场。

### 兼容

- 讲稿里没有阿拉伯数字的旧项目，配音文本和缓存不变；已经写了阿拉伯数字的句子按新读法重新配音。不按数值读的数字（状态码、股票代码）写进 `pronunciation`。
- 渲染缓存版本升到 6，旧缓存的镜头会重渲一次。
```

- [ ] **Step 6: 设计文档状态行**

`docs/lite/字幕与转场设计.md` 第 4 行改为：

```markdown
- 状态：已实现（v1.1.0）；设计由 owner 2026-11-27 审阅通过，实施见 [C 字幕与转场实施计划](C字幕与转场实施计划.md)
```

- [ ] **Step 7: 检查预算和行数**

Run: `wc -l skills/topic-to-video/references/script.md skills/topic-to-video/references/storyboard.md skills/topic-to-video/references/render.md && find skills/topic-to-video -type f -not -path '*/node_modules/*' | wc -l && npm test`
Expected: 三份 reference 都在 250 行以内（约 124、144、88）；skill 文件 41 个；测试 PASS。

- [ ] **Step 8: 提交**

```bash
git add skills/topic-to-video/references/script.md skills/topic-to-video/references/storyboard.md skills/topic-to-video/references/render.md site/index.html CHANGELOG.md docs/lite/字幕与转场设计.md
git commit -m "docs: write numbers in digits, explain the reading table and the new transitions (v1.1.0)"
```

---

### Task 9: 用 `a-share-rally` 验收

**Files:**
- Modify（不提交）: `a-share-rally/project.json`
- Create（不提交）: `out/review/accept-c/*.png`

**Interfaces:**
- Consumes: 全部任务的成果；`render.mjs`、`qa.mjs`
- Produces: 给 owner 的验收截图和 `a-share-rally/out/qa.md` 读法对照

- [ ] **Step 1: 备份**

```bash
cp a-share-rally/project.json a-share-rally/project.before-c.json && cp a-share-rally/out/final.mp4 a-share-rally/out/final.before-c.mp4
```

- [ ] **Step 2: 列出要改的汉字数字**

Run: `node skills/topic-to-video/scripts/check.mjs a-share-rally | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const w of JSON.parse(s).warnings.filter(w=>w.code==='HANZI_NUMBER'))console.log(w.message)})"`
Expected: s01 的“十一月二十七日、百分之十五点零七、百分之十一点六一、百分之三点七、三千六百、五千三百、两万亿、四百”和 s05 的“十二、一点四万亿、六千亿”等。

- [ ] **Step 3: 改讲稿**

在 `a-share-rally/project.json` 里把上一步列出的写法改成阿拉伯数字（11月27日、15.07%、11.61%、3.7%、3600、5300、2万亿、400、12点半、1.4万亿、6000亿），“科创五零”改成“科创50”，并在所在段落加 `"pronunciation": [{ "term": "科创50", "reading": "科创五零" }]`。镜头 `cues` 里 `at` 引用了这些写法的同步改成新写法；画面 `data` 里本来就是阿拉伯数字的不动。

Run: `node skills/topic-to-video/scripts/check.mjs a-share-rally`
Expected: `errors` 为空，`warnings` 里没有 `HANZI_NUMBER`。

- [ ] **Step 4: 问 owner，再重新出片**

先向 owner 说明：含数字的句子要用 edge-tts 重新配音，免费，但要联网，会把这些句子发给微软朗读服务；其余句子命中缓存。owner 同意后：

Run: `node skills/topic-to-video/scripts/render.mjs a-share-rally`
Expected: 输出 `ok: true`，生成新的 `a-share-rally/out/final.mp4` 和 `qa.md`。

- [ ] **Step 5: 抽帧检查**

时间会随新配音移动，所以按 `captions.ass` 找原来出问题的句子，按时间轴找转场，各抽帧到 `out/review/accept-c/`：

```bash
mkdir -p out/review/accept-c && node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildTimeline } from './skills/topic-to-video/scripts/lib/timebase.mjs';
const grab = (sec, name) => spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', sec.toFixed(2), '-i', 'a-share-rally/out/final.mp4', '-frames:v', '1', 'out/review/accept-c/' + name + '.png']);
const ms = (s) => { const [h, m, x] = s.split(':'); return ((Number(h) * 60 + Number(m)) * 60 + Number(x)) * 1000; };
for (const line of readFileSync('a-share-rally/out/captions.ass', 'utf8').split('\n').filter((l) => l.startsWith('Dialogue:'))) {
  const [, a, b] = line.split(',');
  const text = line.split(',').slice(9).join(',');
  if (!/[0-9]|国产芯片|国常会/.test(text)) continue;
  const sec = (ms(a) + ms(b)) / 2000;
  grab(sec, 'caption-' + sec.toFixed(1));
  console.log(sec.toFixed(1), text);
}
const p = JSON.parse(readFileSync('a-share-rally/project.json', 'utf8'));
const tl = buildTimeline(p, JSON.parse(readFileSync('a-share-rally/audio/timing.json', 'utf8')), 60);
for (const id of ['sh04', 'sh05', 'sh07', 'sh12', 'sh13']) {
  const s = tl.shots.find((x) => x.id === id);
  for (const dt of [0.1, 0.2, 0.3, 0.45]) grab(s.startFrame / 60 + dt, id + '+' + dt);
}"
```

检查：
1. 开头 22 秒左右的数字都显示阿拉伯数字（15.07%、11.61%、3.7%、3600点、5300只），打印出的字幕行没有汉字数字。
2. 原 57 秒“订单自然流向 / 国产芯片和设备。”和原 82 秒“是中午12点半国常会 / 放出稳市大招。”不拆词。
3. 原来出问题的五次转场是 sh04、sh05、sh07、sh12、sh13（原 23.3、32.2、51.3、109.1、118.4 秒）：每个镜头开头 0.1–0.45 秒的四帧里，前后两个标题不同框；sh12（`full` 进舞台）那次旧卡片和书架不再同框。`a-share-rally/out/transitions.png` 也看一遍。

- [ ] **Step 6: 读法对照**

打开 `a-share-rally/out/qa.md` 的“## 读法对照”，逐行核对读法；把表和截图路径发给 owner，请 owner 听一遍数字读法（`manual_review.number_reading`）。读错的写进该段 `pronunciation`，只重配那一句。

- [ ] **Step 7: 向 owner 汇报**

用中文汇报：测试结果、三类问题的前后对比截图（`out/review/accept-c/`）、读法对照里需要 owner 确认的条目。`a-share-rally/` 和 `out/` 都不提交。
