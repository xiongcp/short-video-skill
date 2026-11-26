# B 原生竖屏实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同一份 `project.json` 能出原生 1080×1920 竖屏成片（`settings.ratio: "9:16"` 或 `render.mjs --ratio 9:16`）：文字留在平台安全框里，小青和物件照样同台互动，横屏成片逐帧不变。

**Architecture:** 新增 `scripts/lib/frame.mjs`，放两组排版几何（16:9 就是现在散在各模块里的常量，9:16 是竖屏）和几个纯几何小工具。`buildShotPlans` 把当前画幅的几何挂到每个镜头计划的 `plan.frame` 上，`motion`、`stage`、`templates`、`world`、`scene`、`encode`、`qa`、`sound` 都从 `plan.frame` 或参数取值，缺省一律是 16:9。竖屏专有的排法（模板竖排、场景分组摆位、字幕翻页）只在 `isPortrait(frame)` 为真时走。第一个任务先把横屏帧录成金样，之后每个任务都必须让金样测试照常通过。

**Tech Stack:** Node ≥ 22（ESM，`node --test`）；`@resvg/resvg-js`（已有，唯一运行时依赖）；FFmpeg/FFprobe（已有）。不加 npm 包。

**Spec:** [竖屏设计](竖屏设计.md)（展开 [个性化路线图](个性化路线图.md) §6.6）

## Global Constraints

- skill 目录 ≤ 45 个文件、≤ 5 MB；本计划只新增 `scripts/lib/frame.mjs`，38 → 39 个文件；不加图片、音频和 npm 依赖。
- `SKILL.md` ≤ 150 行、≤ 8 KB；每份 reference ≤ 250 行、≤ 10 KB（`storyboard.md` 现在 10022 字节，只能加一行约 150 字节）；一次 L0 读取合计 ≤ 100 KB。
- 横屏不变：`tests/fixtures/golden-16x9.json` 里每个哈希在每个任务结束时都一致；16:9 的镜头缓存键不变；`SCENE_VERSION` 不变。
- `project.json` 不改 schema，`version` 仍为 1；`rights.json` 的 `usage` 不动；不调用付费服务。
- 竖屏几何（逻辑画布 1080×1920）：文字安全框 x 64–910、y 250–1440；标题带 y 260–370；空中层 y 400–720；地面 y 1180；同台站位 160/325/490/655/820；小青可走 x 140–860（`move` 的走动夹在 110–970）；`move` 的 left/center/right 为 200/490/780；`host-left` 图解区 {x 64, y 260, w 846, h 640}，`full` {x 64, y 260, w 846, h 940}；字幕中心 x 540、y 1330，60 px，每行 ≤ 12 字、每页 ≤ 2 行、行距 80；镜头缓推中心 (540, 960)。
- 分辨率按短边：竖屏 `preview` 540×960、`1080p` 1080×1920、`1440p` 1440×2560、`2160p` 2160×3840。
- 输出：画幅与 `settings.ratio` 相同写 `out/`；不同写 `out/9x16/` 或 `out/16x9/`，文件名相同。
- `SKILL.md`、`references/` 用中文；`README.md` 与 `README.en.md` 同步；`AGENTS.md` 保持英文。
- 每个任务先写失败测试，再写最小实现，结束时跑通 `npm test` 并提交到分支 `lite/portrait`；不提交 `.DS_Store`，不 push。提交信息末尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. 横屏项目临时用 `--ratio 9:16` 出片，其中一个同台镜头有 5 件地面物件：不能崩，`layoutStage` 退到 0.6 倍照出，出片 QA 报 `STAGE_CROWDED`，L0 自检不报（项目本身是 16:9）。→ Task 8 测试。
2. 字幕里有英文词或数字串（`Redis`、`304`），或一句 30 字没有逗号：竖屏每行 ≤ 12 字、每页 ≤ 2 行，英文词和数字串不能从中间断开。→ Task 7 测试。
3. 同一项目先出 16:9、再 `--ratio 9:16`、再出 16:9：16:9 镜头缓存键不变（全部命中），`out/final.mp4` 不被竖屏覆盖，竖屏落在 `out/9x16/`。→ Task 8 测试。
4. 竖屏里 `full` → `host-left` 小青从左边小跑进场、`stage` → `full` 小跑出场：起止点在画面外，图解区缩放过渡用的是竖屏的两个图解区，不会闪到横屏坐标。→ Task 4 测试。
5. `--preview --ratio 9:16`：输出 540×960 的 `out/9x16/preview.mp4`，QA 用实际期望尺寸比对，不误报 `SIZE_MISMATCH`；封面是 1080×1920。→ Task 8 测试。

---

## 文件地图

| 文件 | 动作 | 职责 | 任务 |
| --- | --- | --- | --- |
| `tests/helpers/golden.mjs`、`tests/golden.test.mjs`、`tests/fixtures/golden-16x9.json` | Create | 横屏金样帧 | 1 |
| `skills/topic-to-video/scripts/lib/frame.mjs` | Create | `FRAMES`、`frameFor`、`isPortrait`、`outputSubdir`、`sizeFor`、`textBox`、`textOutsideSafe`、`flowArrowEnds` | 2 |
| `skills/topic-to-video/scripts/lib/stage.mjs` | Modify | 常量改为 16:9 几何的别名；布局、站位、渲染按 `frame` 取值；流程运送用 `flowArrowEnds` | 2、3、5 |
| `skills/topic-to-video/scripts/lib/templates.mjs` | Modify | `DIAGRAM_ZONES` 别名；`frame` 参数；竖排分支 | 2、4、5 |
| `skills/topic-to-video/scripts/lib/world.mjs` | Modify | `GROUND_Y` 别名；场景竖屏分组摆位 | 2、6 |
| `skills/topic-to-video/scripts/lib/motion.mjs` | Modify | 站位、走动边界、落点、默认焦点按 `plan.frame` 取值 | 3 |
| `skills/topic-to-video/scripts/lib/project.mjs` | Modify | `STAGE_CROWDED` 按项目画幅的几何检查 | 3 |
| `skills/topic-to-video/scripts/lib/scene.mjs` | Modify | `plan.frame`、画布、缓推、进出场、字幕、竖屏排版问题扫描 | 4、6、7、8 |
| `skills/topic-to-video/scripts/lib/timing.mjs` | Modify | `subtitlePages` | 7 |
| `skills/topic-to-video/scripts/lib/encode.mjs` | Modify | 竖屏 ASS；`--ratio`、尺寸、输出目录、文字光栅、封面 | 7、8 |
| `skills/topic-to-video/scripts/lib/qa.mjs` | Modify | `outDir`、`SIZE_MISMATCH`、排版问题、竖屏联系表与 `contact-safe.png` | 8 |
| `skills/topic-to-video/scripts/lib/sound.mjs`、`music.mjs` | Modify | 声像按画面宽度比例 | 8 |
| `skills/topic-to-video/scripts/render.mjs` | Modify | `--ratio`；把输出目录和排版问题交给 QA | 8 |
| `skills/topic-to-video/scripts/lib/match.mjs` | Modify | `PORTRAIT_CROWDED` 警告 | 9 |
| `SKILL.md`、`references/providers.md`、`references/storyboard.md`、`README.md`、`README.en.md` | Modify | 文档 | 9 |
| `docs/lite/竖屏设计.md` | Modify | 验收结论 | 10 |
| `tests/frame.test.mjs`、`tests/portrait-stage.test.mjs`、`tests/portrait-scene.test.mjs`、`tests/portrait-templates.test.mjs`、`tests/portrait-world.test.mjs`、`tests/portrait-subtitles.test.mjs`、`tests/portrait-render.test.mjs`、`tests/portrait-lint.test.mjs` | Create | 各任务的测试 | 2–9 |
| `tests/readme.test.mjs` | Modify | 两份 README 都写了 `--ratio 9:16` | 9 |

---

### Task 1: 横屏金样帧

**Files:**
- Create: `tests/helpers/golden.mjs`
- Create: `tests/golden.test.mjs`
- Create: `tests/fixtures/golden-16x9.json`（由测试生成）

**Interfaces:**
- Consumes: 现有的 `buildTimeline(project, timing, fps)`、`buildShotPlans(project, timeline, manifest)`、`evaluateFrame(manifest, plan, t)`、`buildSubtitlesAss(project, timeline)`、`splitSentences(text)`
- Produces（`tests/helpers/golden.mjs` 导出，后面的任务会复用）:
  - `manifest`：主持人 manifest 对象
  - `fakeTiming(project, ms = 2600) -> Record<string, timingEntry>`：每段每句一条估算时间
  - `sceneTour() -> project`：覆盖 8 个场景、8 个模板、3 种版式的合成项目
  - `goldenCases() -> Record<string, project>`
  - `digestProject(project) -> Record<string, string>`：每个镜头 3 个时刻的帧哈希加 ASS 哈希

这个任务只做"录像"，不改产品代码，所以没有"先失败"的一步：先录金样，再确认测试能读回同样的值。必须在任何重构之前完成。

- [ ] **Step 1: 写 `tests/helpers/golden.mjs`**

```js
// Golden 16:9 frames (竖屏设计 §8.1): hashes of evaluateFrame output and the ASS file, recorded before the portrait
// refactor, so every later task can prove landscape output did not change.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitSentences } from '../../skills/topic-to-video/scripts/lib/captions.mjs';
import { buildSubtitlesAss } from '../../skills/topic-to-video/scripts/lib/encode.mjs';
import { buildShotPlans, evaluateFrame } from '../../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../../skills/topic-to-video/scripts/lib/timebase.mjs';

const root = join(import.meta.dirname, '../..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export const manifest = readJson('skills/topic-to-video/assets/host/manifest.json');

export function fakeTiming(project, ms = 2600) {
  const timing = {};
  for (const sec of project.sections) {
    splitSentences(sec.text).forEach((_, i) => {
      const key = `${sec.id}-${i}`;
      timing[key] = { file: `audio/${key}.wav`, duration_ms: ms, speech: [60, ms - 120], source: 'estimate', words: [], sha256: key };
    });
  }
  return timing;
}

const SCENES = ['blank', 'podium', 'lab', 'office', 'workshop', 'outdoor', 'street', 'kitchen'];
const EXTRA_SHOTS = [
  { layout: 'full', visual: { template: 'compare', data: { left: { label: '没变', rows: ['返回304', '继续用旧内容'] }, right: { label: '已更新', rows: ['传回新正文'] } } } },
  { layout: 'host-left', visual: { template: 'number', data: { value: '304', label: '状态码' } } },
  { layout: 'host-left', visual: { template: 'flow', data: { nodes: ['问', '答', '用'] } } },
  { layout: 'full', visual: { template: 'timeline', data: { items: [{ time: '第一天', label: '下载' }, { time: '第二天', label: '复用' }, { time: '第三天', label: '过期' }] } } },
  { layout: 'host-left', visual: { template: 'cycle', data: { items: [{ label: '请求' }, { label: '缓存' }, { label: '复用' }] } } },
  { layout: 'full', visual: { template: 'bars', data: { items: [{ label: '首次', value: 800 }, { label: '再次', value: 5 }], unit: '毫秒' } } },
  { layout: 'host-left', visual: { template: 'bullets', data: { items: ['新鲜直接拿', '过期先问', '没变就用'] } } },
  { layout: 'full', visual: { template: 'title', data: { heading: '缓存三招', sub: '记住就够' } } },
];

/** A synthetic project covering every scene, every template and every layout (stage, host-left, full). */
export function sceneTour() {
  const n = SCENES.length + EXTRA_SHOTS.length;
  const text = Array.from({ length: n }, (_, i) => `第${i + 1}句讲一件事。`).join('');
  const shots = [
    ...SCENES.map((scene, i) => ({
      id: `sh${String(i + 1).padStart(2, '0')}`, section: 's01', sentences: [i], layout: 'stage', scene,
      host: { expr: 'explaining', gesture: 'point', at: 'left' },
      visual: { template: 'stage', data: { heading: '场景', objects: [{ prop: 'box', label: '箱子', at: 'mid-left' }, { prop: 'lock', label: '锁', at: 'right' }], links: [{ from: 0, to: 1, style: 'dashed', label: '很远' }] } },
      cues: [{ sentence: i, do: 'move', target: 0 }],
      note: `场景 ${scene}`,
    })),
    ...EXTRA_SHOTS.map((s, k) => {
      const i = SCENES.length + k;
      return {
        id: `sh${String(i + 1).padStart(2, '0')}`, section: 's01', sentences: [i], ...s,
        ...(s.layout === 'host-left' ? { host: { expr: 'curious', gesture: 'idle' } } : {}),
        cues: s.visual.template === 'title' ? [] : [{ sentence: i, do: 'reveal', target: 1 }],
        note: s.visual.template,
      };
    }),
  ];
  return {
    version: 1, revision: 1, title: '场景巡游',
    brief: { topic: '测试', audience: '测试', promise: '测试', sources: [], open_questions: [] },
    settings: { ratio: '16:9', target_seconds: 60, lang: 'zh-CN', host: 'xiaoqing', theme: 'light' },
    voice: { provider: 'undecided' },
    world: { metaphor: '测试', style: 'paper', scene: 'blank' },
    sections: [{ id: 's01', title: '巡游', text }],
    shots, checkpoints: [], jobs: [],
  };
}

export function goldenCases() {
  return {
    'cache-speed': readJson('examples/cache-speed/project.json'),
    'world-flight': readJson('tests/fixtures/world-flight.json'),
    'world-cache': readJson('tests/fixtures/world-cache.json'),
    minimal: readJson('tests/fixtures/minimal-project.json'),
    'scene-tour': sceneTour(),
  };
}

/** Three moments per shot (start of the transition, middle, end) plus the ASS file. `opts` is passed to buildShotPlans. */
export function digestProject(project, opts) {
  const timeline = buildTimeline(project, fakeTiming(project), 60);
  const plans = opts ? buildShotPlans(project, timeline, manifest, opts) : buildShotPlans(project, timeline, manifest);
  const out = { ass: hash(buildSubtitlesAss(project, timeline)) };
  for (const plan of plans) {
    for (const t of [0.05, plan.durationSec / 2, Math.max(0.05, plan.durationSec - 0.05)]) {
      const f = evaluateFrame(manifest, plan, t);
      out[`${plan.id}@${t.toFixed(3)}`] = hash(f.vectorSvg + JSON.stringify(f.textItems));
    }
  }
  return out;
}
```

- [ ] **Step 2: 写 `tests/golden.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digestProject, goldenCases, sceneTour } from './helpers/golden.mjs';

const file = join(import.meta.dirname, 'fixtures/golden-16x9.json');

test('scene tour covers all 8 scenes, all 8 templates and all 3 layouts', () => {
  const p = sceneTour();
  assert.deepEqual(new Set(p.shots.filter((s) => s.scene).map((s) => s.scene)).size, 8);
  assert.equal(new Set(p.shots.map((s) => s.visual.template)).size, 9); // 8 diagram templates + stage
  assert.deepEqual([...new Set(p.shots.map((s) => s.layout))].sort(), ['full', 'host-left', 'stage']);
});

test('16:9 frames and ASS stay identical to the recorded golden hashes (竖屏设计 §8.1)', () => {
  const actual = Object.fromEntries(Object.entries(goldenCases()).map(([name, p]) => [name, digestProject(p)]));
  if (process.env.UPDATE_GOLDEN === '1') {
    writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  assert.ok(existsSync(file), '先在改代码之前运行 UPDATE_GOLDEN=1 node --test tests/golden.test.mjs 录一次金样');
  assert.deepEqual(actual, JSON.parse(readFileSync(file, 'utf8')));
});
```

- [ ] **Step 3: 确认第一个测试通过、第二个因为缺金样失败**

Run: `node --test tests/golden.test.mjs`
Expected: 第一个 PASS；第二个 FAIL，信息是"先在改代码之前运行 UPDATE_GOLDEN=1 …"。如果 `sceneTour` 的某个镜头让 `buildShotPlans` 抛错（例如道具名不存在），把道具换成 `PROP_META` 里有的（`box`、`lock`、`fridge`、`shop` 都有），不要改产品代码。

- [ ] **Step 4: 录金样并确认读回一致**

Run: `UPDATE_GOLDEN=1 node --test tests/golden.test.mjs && node --test tests/golden.test.mjs`
Expected: 两次都 PASS；`tests/fixtures/golden-16x9.json` 有 5 个键（`cache-speed`、`world-flight`、`world-cache`、`minimal`、`scene-tour`），每个下面有 `ass` 和若干 `shXX@t`。

- [ ] **Step 5: 跑全部测试并提交**

Run: `npm test`
Expected: 全部 PASS。

```bash
git add tests/helpers/golden.mjs tests/golden.test.mjs tests/fixtures/golden-16x9.json
git commit -m "test(golden): record 16:9 frame and ASS hashes before the portrait refactor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 几何表 `frame.mjs`

**Files:**
- Create: `skills/topic-to-video/scripts/lib/frame.mjs`
- Modify: `skills/topic-to-video/scripts/lib/stage.mjs:8-30`（`STAGE_SLOTS`、`STAGE_BOUNDS`）
- Modify: `skills/topic-to-video/scripts/lib/templates.mjs:9-12`（`DIAGRAM_ZONES`）
- Modify: `skills/topic-to-video/scripts/lib/world.mjs:5`（`GROUND_Y`）
- Test: `tests/frame.test.mjs`

**Interfaces:**
- Consumes: 无（`frame.mjs` 不引用任何其他模块）
- Produces（都从 `frame.mjs` 导出）:
  - `FRAMES: { '16:9': Frame, '9:16': Frame }`（深冻结）；`Frame` 的字段：`ratio, width, height, center: [x, y], textSafe: {x, y, w, h}, ground, hostHome, spots: {left, center, right}, walk: {minX, maxX}, focusDefault: [x, y], zones: {'host-left', full}, stage: {slots, bounds, hostMinX, hostMaxX, heading: {x, y, underlineY, fontSize}}, subtitle: {x, y, fontSize, maxChars, maxLines, lineHeight}`
  - `RATIOS = ['16:9', '9:16']`
  - `frameFor(ratio = '16:9') -> Frame`；`null`/`undefined` 给 16:9；未知画幅抛 `Error('未知画幅 …，可选 16:9、9:16')`
  - `isPortrait(frame) -> boolean`
  - `outputSubdir(projectRatio, renderRatio) -> '' | '9x16' | '16x9'`
  - `sizeFor({width, height}, frame) -> {width, height}`（竖屏交换宽高）
  - `textBox(item) -> {x, y, w, h}`（中日韩字符宽 1 个字号，其他 0.6 个）
  - `textOutsideSafe(items, frame) -> string[]`（越出文字安全框的 `key`；横屏恒为空数组）
  - `flowArrowEnds(prevBox, currBox) -> { from: [x, y], to: [x, y], bend: [dx, dy] }`（上下相叠时竖直箭头，否则水平）
- `stage.mjs` 的 `STAGE_SLOTS`、`STAGE_BOUNDS`，`templates.mjs` 的 `DIAGRAM_ZONES`，`world.mjs` 的 `GROUND_Y` 继续导出，值不变，但变成 `FRAMES['16:9']` 里对应字段的别名（同一个对象）。

- [ ] **Step 1: 写失败测试 `tests/frame.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowArrowEnds, frameFor, FRAMES, isPortrait, outputSubdir, RATIOS, sizeFor, textBox, textOutsideSafe } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { STAGE_BOUNDS, STAGE_SLOTS } from '../skills/topic-to-video/scripts/lib/stage.mjs';
import { DIAGRAM_ZONES } from '../skills/topic-to-video/scripts/lib/templates.mjs';
import { GROUND_Y } from '../skills/topic-to-video/scripts/lib/world.mjs';

const L = FRAMES['16:9'];
const P = FRAMES['9:16'];
const inside = (b, s) => b.x >= s.x - 1e-6 && b.y >= s.y - 1e-6 && b.x + b.w <= s.x + s.w + 1e-6 && b.y + b.h <= s.y + s.h + 1e-6;

test('16:9 geometry is exactly the constants the modules used before (竖屏设计 §4.2)', () => {
  assert.deepEqual([L.width, L.height, L.ground, L.hostHome], [1920, 1080, 930, 320]);
  assert.deepEqual(L.center, [960, 540]);
  assert.deepEqual(L.spots, { left: 320, center: 960, right: 1600 });
  assert.deepEqual(L.walk, { minX: 120, maxX: 1800 });
  assert.deepEqual(L.focusDefault, [1240, 320]);
  assert.deepEqual(L.zones, { 'host-left': { x: 640, y: 48, w: 1200, h: 400 }, full: { x: 120, y: 120, w: 1680, h: 740 } });
  assert.deepEqual(L.stage.slots, { left: 240, 'mid-left': 600, center: 960, 'mid-right': 1320, right: 1680 });
  assert.deepEqual(L.stage.bounds, { minX: 120, maxX: 1800, titleTop: 48, titleBottom: 150, airTopMin: 160, airBottomMax: 470, midDefaultBottom: 762, subtitleSafeY: 950, gap: 40, hostClearWidth: 200, minScale: 0.6 });
  assert.deepEqual([L.stage.hostMinX, L.stage.hostMaxX], [200, 1720]);
  assert.deepEqual(L.stage.heading, { x: 960, y: 92, underlineY: 130, fontSize: 52 });
  assert.deepEqual([L.subtitle.x, L.subtitle.y, L.subtitle.fontSize, L.subtitle.maxLines], [960, 1012, 44, 1]);
});

test('module constants are aliases of the 16:9 geometry', () => {
  assert.equal(STAGE_SLOTS, L.stage.slots);
  assert.equal(STAGE_BOUNDS, L.stage.bounds);
  assert.equal(DIAGRAM_ZONES, L.zones);
  assert.equal(GROUND_Y, L.ground);
  assert.ok(Object.isFrozen(L.stage.bounds) && Object.isFrozen(P.zones.full));
});

test('9:16 text regions stay inside the text-safe box', () => {
  assert.deepEqual([P.width, P.height, P.ground], [1080, 1920, 1180]);
  assert.deepEqual(P.textSafe, { x: 64, y: 250, w: 846, h: 1190 });
  for (const z of Object.values(P.zones)) assert.ok(inside(z, P.textSafe), JSON.stringify(z));
  const h = P.stage.heading;
  assert.ok(inside(textBox({ text: '一二三四五六七八九十一二三四', x: h.x, y: h.y, fontSize: h.fontSize }), P.textSafe), 'heading of 14 chars');
  const s = P.subtitle;
  for (const y of [s.y - s.lineHeight / 2, s.y + s.lineHeight / 2]) {
    assert.ok(inside(textBox({ text: '一二三四五六七八九十一二', x: s.x, y, fontSize: s.fontSize }), P.textSafe), `subtitle line at ${y}`);
  }
  const b = P.stage.bounds;
  assert.ok(b.minX >= P.textSafe.x && b.maxX <= P.textSafe.x + P.textSafe.w && b.airTopMin >= P.textSafe.y);
  for (const x of Object.values(P.stage.slots)) assert.ok(x >= b.minX && x <= b.maxX);
  for (const x of Object.values(P.spots)) assert.ok(x >= P.walk.minX && x <= P.walk.maxX);
});

test('frameFor, isPortrait, outputSubdir and sizeFor', () => {
  assert.deepEqual(RATIOS, ['16:9', '9:16']);
  assert.equal(frameFor(), L);
  assert.equal(frameFor(null), L);
  assert.equal(frameFor('9:16'), P);
  assert.throws(() => frameFor('1:1'), /未知画幅 1:1/);
  assert.equal(isPortrait(P), true);
  assert.equal(isPortrait(L), false);
  assert.equal(outputSubdir('16:9', '16:9'), '');
  assert.equal(outputSubdir(undefined, '16:9'), '');
  assert.equal(outputSubdir('16:9', '9:16'), '9x16');
  assert.equal(outputSubdir('9:16', '16:9'), '16x9');
  assert.deepEqual(sizeFor({ width: 1920, height: 1080 }, P), { width: 1080, height: 1920 });
  assert.deepEqual(sizeFor({ width: 960, height: 540 }, P), { width: 540, height: 960 });
  assert.deepEqual(sizeFor({ width: 1920, height: 1080 }, L), { width: 1920, height: 1080 });
});

test('textBox measures CJK as one font size and Latin as 0.6; textOutsideSafe only flags portrait', () => {
  assert.deepEqual(textBox({ text: '缓存AB', x: 100, y: 200, fontSize: 40 }), { x: 36, y: 180, w: 128, h: 40 });
  assert.deepEqual(textBox({ text: 'AB', x: 100, y: 200, fontSize: 40, align: 'start' }), { x: 100, y: 180, w: 48, h: 40 });
  const items = [
    { key: 'ok', text: '标题', x: 540, y: 300, fontSize: 52 },
    { key: 'top', text: '标题', x: 540, y: 120, fontSize: 52 },
    { key: 'right', text: '很长很长的标签', x: 900, y: 800, fontSize: 36 },
    { key: 'hidden', text: '看不见', x: 540, y: 100, fontSize: 52, opacity: 0 },
  ];
  assert.deepEqual(textOutsideSafe(items, P), ['top', 'right']);
  assert.deepEqual(textOutsideSafe(items, L), []);
});

test('flowArrowEnds runs horizontal arrows side by side and vertical arrows when stacked', () => {
  assert.deepEqual(flowArrowEnds({ x: 0, y: 0, w: 100, h: 50 }, { x: 200, y: 0, w: 100, h: 50 }), { from: [108, 25], to: [192, 25], bend: [0, -14] });
  assert.deepEqual(flowArrowEnds({ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 100, w: 100, h: 50 }), { from: [50, 58], to: [50, 92], bend: [14, 0] });
});
```

- [ ] **Step 2: 确认测试失败**

Run: `node --test tests/frame.test.mjs`
Expected: FAIL，`Cannot find module …/frame.mjs`。

- [ ] **Step 3: 写 `skills/topic-to-video/scripts/lib/frame.mjs`**

```js
// Per-ratio layout geometry (竖屏设计 §4). The 16:9 values are the constants every module used before the portrait
// work; 9:16 is the native 1080×1920 frame with the text-safe box that keeps titles, labels and subtitles clear of the
// Douyin, TikTok and Shorts overlays (third-party estimates, 竖屏设计 §4.1). Pure data and pure geometry, no imports.

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

const LANDSCAPE = {
  ratio: '16:9',
  width: 1920,
  height: 1080,
  center: [960, 540],
  textSafe: { x: 0, y: 0, w: 1920, h: 1080 },
  ground: 930,
  hostHome: 320,
  spots: { left: 320, center: 960, right: 1600 },
  walk: { minX: 120, maxX: 1800 },
  focusDefault: [1240, 320],
  zones: {
    'host-left': { x: 640, y: 48, w: 1200, h: 400 },
    full: { x: 120, y: 120, w: 1680, h: 740 },
  },
  stage: {
    slots: { left: 240, 'mid-left': 600, center: 960, 'mid-right': 1320, right: 1680 },
    bounds: { minX: 120, maxX: 1800, titleTop: 48, titleBottom: 150, airTopMin: 160, airBottomMax: 470, midDefaultBottom: 762, subtitleSafeY: 950, gap: 40, hostClearWidth: 200, minScale: 0.6 },
    hostMinX: 200,
    hostMaxX: 1720,
    heading: { x: 960, y: 92, underlineY: 130, fontSize: 52 },
  },
  subtitle: { x: 960, y: 1012, fontSize: 44, maxChars: null, maxLines: 1, lineHeight: 0 },
};

const PORTRAIT = {
  ratio: '9:16',
  width: 1080,
  height: 1920,
  center: [540, 960],
  textSafe: { x: 64, y: 250, w: 846, h: 1190 },
  ground: 1180,
  hostHome: 200,
  spots: { left: 200, center: 490, right: 780 },
  walk: { minX: 110, maxX: 970 },
  focusDefault: [487, 580],
  zones: {
    'host-left': { x: 64, y: 260, w: 846, h: 640 },
    full: { x: 64, y: 260, w: 846, h: 940 },
  },
  stage: {
    slots: { left: 160, 'mid-left': 325, center: 490, 'mid-right': 655, right: 820 },
    bounds: { minX: 90, maxX: 890, titleTop: 260, titleBottom: 370, airTopMin: 400, airBottomMax: 720, midDefaultBottom: 1012, subtitleSafeY: 1200, gap: 32, hostClearWidth: 200, minScale: 0.6 },
    hostMinX: 140,
    hostMaxX: 860,
    heading: { x: 540, y: 300, underlineY: 340, fontSize: 52 },
  },
  subtitle: { x: 540, y: 1330, fontSize: 60, maxChars: 12, maxLines: 2, lineHeight: 80 },
};

export const FRAMES = deepFreeze({ '16:9': LANDSCAPE, '9:16': PORTRAIT });
export const RATIOS = Object.keys(FRAMES);

export function frameFor(ratio = '16:9') {
  if (ratio === null || ratio === undefined) return FRAMES['16:9'];
  if (!Object.hasOwn(FRAMES, ratio)) throw new Error(`未知画幅 ${ratio}，可选 ${RATIOS.join('、')}`);
  return FRAMES[ratio];
}

export const isPortrait = (frame) => frame.height > frame.width;

/** '' when rendering the project's own ratio (out/), otherwise '9x16' or '16x9' (out/9x16/). */
export function outputSubdir(projectRatio, renderRatio) {
  return (projectRatio ?? '16:9') === renderRatio ? '' : renderRatio.replace(':', 'x');
}

/** Resolution specs are landscape; a portrait frame swaps them (1080p → 1080×1920). */
export function sizeFor(spec, frame) {
  return isPortrait(frame) ? { width: spec.height, height: spec.width } : { width: spec.width, height: spec.height };
}

const WIDE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/u;

/** Approximate box of one text item, matching how encode.mjs anchors the raster (x by align, y at the middle). */
export function textBox(item) {
  const fs = item.fontSize;
  const w = [...String(item.text)].reduce((s, ch) => s + (WIDE.test(ch) ? fs : 0.6 * fs), 0);
  const align = item.align ?? 'middle';
  const x = align === 'start' ? item.x : align === 'end' ? item.x - w : item.x - w / 2;
  return { x, y: item.y - fs / 2, w, h: fs };
}

/** Keys of visible text items that leave the text-safe box; always [] for landscape. */
export function textOutsideSafe(items, frame) {
  if (!isPortrait(frame)) return [];
  const s = frame.textSafe;
  return items
    .filter((it) => (it.opacity ?? 1) > 0.02 && it.text)
    .filter((it) => {
      const b = textBox(it);
      return b.x < s.x - 1 || b.y < s.y - 1 || b.x + b.w > s.x + s.w + 1 || b.y + b.h > s.y + s.h + 1;
    })
    .map((it) => it.key);
}

/** Arrow ends between two flow nodes: vertical when the next node sits below, otherwise left to right. */
export function flowArrowEnds(prev, curr) {
  if (curr.y >= prev.y + prev.h - 1e-6) {
    return { from: [prev.x + prev.w / 2, prev.y + prev.h + 8], to: [curr.x + curr.w / 2, curr.y - 8], bend: [14, 0] };
  }
  return { from: [prev.x + prev.w + 8, prev.y + prev.h / 2], to: [curr.x - 8, curr.y + curr.h / 2], bend: [0, -14] };
}
```

- [ ] **Step 4: 把四个常量改成别名**

`stage.mjs`：在 import 区加 `import { FRAMES } from './frame.mjs';`，把第 8–30 行的两个对象字面量换成：

```js
export const STAGE_SLOTS = FRAMES['16:9'].stage.slots;
export const STAGE_BOUNDS = FRAMES['16:9'].stage.bounds;
```

`templates.mjs`：加 `import { FRAMES } from './frame.mjs';`，第 9–12 行换成 `export const DIAGRAM_ZONES = FRAMES['16:9'].zones;`。

`world.mjs`：加 `import { FRAMES } from './frame.mjs';`，第 5 行换成 `export const GROUND_Y = FRAMES['16:9'].ground;`。

- [ ] **Step 5: 确认测试通过、金样不变**

Run: `node --test tests/frame.test.mjs tests/golden.test.mjs tests/stage.test.mjs tests/visuals.test.mjs`
Expected: 全部 PASS。如果某个旧测试因为对象被冻结而报 `Cannot assign to read only property`，说明它在改常量，改成先复制再改（`{ ...STAGE_BOUNDS, … }`），不要去掉冻结。

- [ ] **Step 6: 跑全部测试并提交**

Run: `npm test`
Expected: 全部 PASS（`budget.test.mjs` 显示 39 个文件仍 ≤ 45）。

```bash
git add skills/topic-to-video/scripts/lib/frame.mjs skills/topic-to-video/scripts/lib/stage.mjs skills/topic-to-video/scripts/lib/templates.mjs skills/topic-to-video/scripts/lib/world.mjs tests/frame.test.mjs
git commit -m "feat(frame): add per-ratio layout geometry and alias the 16:9 constants to it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 小青与同台按画幅取值

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/stage.mjs`（`resolveAtX`、`resolveHostPreferredX`、`findHostX`、`buildAttempt`、`layoutStage`、`simResolveStandX`、`evaluateStageObjects`、`renderStage`）
- Modify: `skills/topic-to-video/scripts/lib/motion.mjs`（`SPOTS`、`clampStageX`、`isSpotClearOfOthers`、`applyObjectShift`、`resolveInteractionStandX`、`resolveStandX`、`computeDropSpot`、`planHostTimeline`、`getCachedHostPlan`、`evaluateHostAt`）
- Modify: `skills/topic-to-video/scripts/lib/project.mjs:310`
- Test: `tests/portrait-stage.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `FRAMES`、`frameFor`、`isPortrait`
- Produces:
  - `layoutStage(visualData, { hostAt, customProps = [], hostHeight = 400, frame = FRAMES['16:9'], prevHostX = frame.hostHome } = {})`：返回值形状不变
  - `renderStage(visualData, { …原参数, frame = FRAMES['16:9'] })`
  - `evaluateStageObjects(shotPlan, t, hostMeta)`：几何取 `shotPlan.frame ?? FRAMES['16:9']`
  - `resolveStandX(target, currentX = 320, elements = [], geo = FRAMES['16:9'])`
  - `evaluateHostAt(manifest, plan, t, audioFrame)`、`hostEventTimeline(manifest, plan)`：几何取 `plan.frame ?? FRAMES['16:9']`，`ground` 缺省取 `geo.ground`
  - `checkProject` 的 `STAGE_CROWDED` 用 `FRAMES[project.settings?.ratio] ?? FRAMES['16:9']` 检查

- [ ] **Step 1: 写失败测试 `tests/portrait-stage.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { evaluateHostAt, resolveStandX } from '../skills/topic-to-video/scripts/lib/motion.mjs';
import { checkProject } from '../skills/topic-to-video/scripts/lib/project.mjs';
import { layoutStage, renderStage } from '../skills/topic-to-video/scripts/lib/stage.mjs';
import { manifest, sceneTour } from './helpers/golden.mjs';

const P = FRAMES['9:16'];
const three = { objects: [{ prop: 'fridge', label: '冰箱', at: 'left' }, { prop: 'box', label: '箱子', at: 'center' }, { prop: 'shop', label: '超市', at: 'right', size: 'sm' }] };

test('portrait stage lays three objects inside the portrait bounds on ground 1180', () => {
  const lay = layoutStage(three, { frame: P });
  assert.equal(lay.ok, true);
  for (const el of lay.elements) {
    assert.ok(el.bbox.x >= P.stage.bounds.minX - 1e-6 && el.bbox.x + el.bbox.w <= P.stage.bounds.maxX + 1e-6, `${el.prop} x`);
    if (el.layer === 'ground') assert.ok(Math.abs(el.bbox.y + el.bbox.h - 1180) < 1e-6, `${el.prop} on the ground`);
  }
  assert.ok(lay.hostX >= P.stage.hostMinX && lay.hostX <= P.stage.hostMaxX);
});

test('portrait stage with five ground objects is crowded, landscape is not', () => {
  const five = { objects: ['fridge', 'box', 'shop', 'table', 'chair'].map((prop) => ({ prop })) };
  assert.equal(layoutStage(five, { frame: P }).crowded, true);
  assert.equal(layoutStage(five).crowded, false);
});

test('resolveStandX uses the portrait spots and walk bounds', () => {
  assert.equal(resolveStandX('left', 490, [], P), 200);
  assert.equal(resolveStandX('center', 200, [], P), 490);
  assert.equal(resolveStandX('right', 200, [], P), 780);
  const edge = [{ bbox: { x: 880, y: 1000, w: 150, h: 180 } }];
  assert.ok(resolveStandX(0, 1000, edge, P) <= P.walk.maxX);
  assert.equal(resolveStandX('right', 320, []), 1600, 'landscape default unchanged');
});

test('evaluateHostAt walks to the portrait right spot and stands on the portrait ground', () => {
  const plan = {
    seed: 'sh-p', style: 'paper', durationSec: 4, frame: P,
    startState: { x: 200, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' },
    elements: [],
    cues: [{ sentence: 0, do: 'move', target: 'right', timeMs: 100 }],
    sentences: [{ index: 0, startMs: 0, endMs: 4000, text: '我们去右边。' }],
  };
  const end = evaluateHostAt(manifest, plan, 4);
  assert.ok(Math.abs(end.x - 780) < 1, `x=${end.x}`);
  assert.ok(Math.abs(end.bodyBbox.y + end.bodyBbox.h - 1180) < 1, 'feet on 1180');
});

test('renderStage puts the portrait heading in the title band', () => {
  const res = renderStage({ ...three, heading: '冰箱与超市' }, { frame: P, layoutResult: layoutStage(three, { frame: P }) });
  const heading = res.textItems.find((t) => t.key === 'stage-heading');
  assert.deepEqual([heading.x, heading.y], [540, 300]);
});

test('checkProject reports STAGE_CROWDED with the portrait geometry only for 9:16 projects', () => {
  const p = sceneTour();
  p.shots[0].visual.data.objects = ['fridge', 'box', 'shop', 'table', 'chair'].map((prop) => ({ prop }));
  p.shots[0].cues = [];
  assert.ok(!checkProject(p).some((e) => e.code === 'STAGE_CROWDED'), '16:9 fits');
  p.settings.ratio = '9:16';
  const crowded = checkProject(p).filter((e) => e.code === 'STAGE_CROWDED');
  assert.equal(crowded.length, 1);
  assert.match(crowded[0].message, /竖屏/);
});
```

- [ ] **Step 2: 确认测试失败**

Run: `node --test tests/portrait-stage.test.mjs`
Expected: FAIL（portrait 布局仍按横屏坐标；`resolveStandX('right', 200, [], P)` 返回 1600 等）。

- [ ] **Step 3: 改 `stage.mjs`**

在文件顶部：

```js
const LANDSCAPE = FRAMES['16:9'];
```

删掉 `const HOST_MIN_X = 200;`、`const HOST_MAX_X = 1720;`，删掉对 `GROUND_Y` 的 import（改用 `geo.ground`）。然后逐个函数改，函数头改成下面这样，函数体里按右栏替换：

| 函数（新函数头） | 函数体内替换 |
| --- | --- |
| `function resolveAtX(at, fallback, geo = LANDSCAPE)` | `STAGE_SLOTS` → `geo.stage.slots`；`at * 1920` → `at * geo.width` |
| `function resolveHostPreferredX(hostAt, prevHostX, geo = LANDSCAPE)` | `STAGE_SLOTS` → `geo.stage.slots`；`hostAt * 1920` → `hostAt * geo.width`；末尾 `: 320` → `: geo.hostHome` |
| `function findHostX(groundRects, preferredX, geo = LANDSCAPE)` | 第一行加 `const B = geo.stage.bounds;`；`STAGE_BOUNDS.` → `B.`；`HOST_MIN_X` → `geo.stage.hostMinX`；`HOST_MAX_X` → `geo.stage.hostMaxX` |
| `function buildAttempt(specs, scale, preferredHostX, hostHeight, geo = LANDSCAPE)` | 第一行加 `const B = geo.stage.bounds; const G = geo.ground;`；`STAGE_BOUNDS.` → `B.`；`GROUND_Y` → `G`；`HOST_MIN_X`/`HOST_MAX_X` 同上；`findHostX(hostBlockingRects, preferredHostX)` → `findHostX(hostBlockingRects, preferredHostX, geo)` |
| `function simResolveStandX(target, currentX, elements, geo = LANDSCAPE)` | `return 320` → `return geo.spots.left`；`return 960` → `return geo.spots.center`；`return 1600` → `return geo.spots.right`；`GROUND_Y` → `geo.ground`；`490` → `geo.ground - 440`；`STAGE_BOUNDS.` → `geo.stage.bounds.` |

`layoutStage` 的函数头和相关行：

```js
export function layoutStage(visualData, { hostAt, customProps = [], hostHeight = 400, frame = LANDSCAPE, prevHostX = frame.hostHome } = {}) {
  const data = unwrapVisualData(visualData);
  const rawObjects = Array.isArray(data.objects) ? data.objects : [];
  const rawLinks = Array.isArray(data.links) ? data.links : [];
  const preferredHostX = resolveHostPreferredX(hostAt, prevHostX, frame);
```

函数体里：空物件分支的 `HOST_MIN_X, HOST_MAX_X` → `frame.stage.hostMinX, frame.stage.hostMaxX`；`resolveAtX(obj.at, STAGE_SLOTS.center)` → `resolveAtX(obj.at, frame.stage.slots.center, frame)`；`buildAttempt(specs, s, preferredHostX, hostHeight)` → `buildAttempt(specs, s, preferredHostX, hostHeight, frame)`；`standSpots` 里的 `STAGE_BOUNDS.minX/maxX` → `frame.stage.bounds.minX/maxX`；连线兜底点 `[960, 540]` → `[...frame.center]`。

`evaluateStageObjects`：第一行后加 `const geo = shotPlan?.frame ?? LANDSCAPE;`；兜底的 `layoutStage(rawData, { … prevHostX: shotPlan?.startState?.x ?? 320, customProps })` 改成 `layoutStage(rawData, { hostAt: shotPlan?.shot?.host?.at, prevHostX: shotPlan?.startState?.x ?? geo.hostHome, customProps, frame: geo })`；推拉位移的 `STAGE_BOUNDS.minX`/`maxX` → `geo.stage.bounds.minX`/`maxX`；函数里所有 `simResolveStandX(…)` 调用末尾加 `geo` 参数。

`renderStage`：参数表末尾加 `frame = LANDSCAPE,`；`layoutStage(data, { customProps })` → `layoutStage(data, { customProps, frame })`；标题段换成：

```js
  const headOp = clamp01(headingOpacity);
  if (data.heading && headOp > 0.005) {
    const hd = frame.stage.heading;
    const halfUl = clamp([...String(data.heading)].length * 24, 110, 320);
    const hlOpAttr = headOp < 0.999 ? ` opacity="${num(headOp)}"` : '';
    backVectors.push(
      `<path${hlOpAttr} d="${inkStroke([[hd.x - halfUl, hd.underlineY], [hd.x + halfUl, hd.underlineY]], { seed: `${seed}:stage-hl`, width: [5, 7], wobble: 2 }).d}" fill="${pal.accent}"/>`,
    );
    textItems.push({
      key: 'stage-heading',
      text: data.heading,
      x: hd.x,
      y: hd.y,
      fontSize: hd.fontSize,
      color: pal.ink,
      align: 'middle',
      weight: 'bold',
      opacity: headOp,
      isTitle: true,
    });
  }
```

连线标签的 `clamp(midY - 20, STAGE_BOUNDS.airTopMin + 16, GROUND_Y - 24)` → `clamp(midY - 20, frame.stage.bounds.airTopMin + 16, frame.ground - 24)`；物件标签的 `yAbove < STAGE_BOUNDS.airTopMin` → `yAbove < frame.stage.bounds.airTopMin`。改完后 `grep -n "GROUND_Y\|STAGE_BOUNDS\.\|STAGE_SLOTS\[\|1920\|\b960\b\|HOST_M" stage.mjs` 只应剩下第 8–9 行的两个导出。

- [ ] **Step 4: 改 `motion.mjs`**

import 区加 `import { FRAMES } from './frame.mjs';`。删掉第 10 行 `const SPOTS = …`，第 313 行改成：

```js
const LANDSCAPE = FRAMES['16:9'];
const clampX = (v, geo = LANDSCAPE) => Math.max(geo.walk.minX, Math.min(geo.walk.maxX, v));
```

逐个函数改：

| 函数（新函数头） | 函数体内替换 |
| --- | --- |
| `function isSpotClearOfOthers(sx, elements, geo = LANDSCAPE)` | `930` → `geo.ground`；`490` → `geo.ground - 440` |
| `function applyObjectShift(elements, objDx, droppedSpots, geo = LANDSCAPE)` | `clampStageX(…)` → `clampX(…, geo)` |
| `function resolveInteractionStandX(targetIdx, currentX, elements, anchorX, maxReach, geo = LANDSCAPE)` | `resolveStandX(targetIdx, currentX, elements)` → 末尾加 `geo`；`isSpotClearOfOthers(…, elements)` → 末尾加 `geo`；`clampStageX(…)` → `clampX(…, geo)` |
| `export function resolveStandX(target, currentX = 320, elements = [], geo = LANDSCAPE)` | `SPOTS` → `geo.spots`；两处 `Math.max(120, Math.min(1800, …))` → `clampX(…, geo)`；`isSpotClearOfOthers(…, elements)` → 末尾加 `geo` |
| `function computeDropSpot(curX, curFacing, ground, el, headR, obstacles = [], geo = LANDSCAPE)` | `120 + w / 2` → `geo.walk.minX + w / 2`；`1800 - w / 2` → `geo.walk.maxX - w / 2`；`{ x: 960, y: ground }` → `{ x: geo.center[0], y: ground }` |
| `function planHostTimeline(H, elements, orderedCues, { startX, startFacing, ground, totalDur, headR = 47, geo = LANDSCAPE })` | `clampStageX(…)` → `clampX(…, geo)`；推拉的 `120 - origEl.bbox.x` → `geo.walk.minX - origEl.bbox.x`，`1800 - (…)` → `geo.walk.maxX - (…)`；函数里每个 `resolveStandX(…)`、`applyObjectShift(…)`、`computeDropSpot(…)`、`resolveInteractionStandX(…)`、`isSpotClearOfOthers(…)` 调用末尾加 `geo` |

`getCachedHostPlan`：

```js
function getCachedHostPlan(manifest, plan) {
  const H = manifest.height_px;
  const geo = plan.frame ?? LANDSCAPE;
  const ground = plan.ground ?? geo.ground;
  const start = plan.startState ?? { x: geo.hostHome, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' };
```

缓存判断里加一行 `&& prev.geo === geo`；`planHostTimeline(…, { startX: start.x, startFacing: start.facing ?? 1, ground, totalDur, headR })` → 选项里加 `geo`；`entry` 对象里加 `geo,`。

`evaluateHostAt`：开头同样取 `const geo = plan.frame ?? LANDSCAPE; const ground = plan.ground ?? geo.ground;`，`start` 缺省的 `x: 320` → `x: geo.hostHome`；默认焦点 `[1240, 320]` → `geo.focusDefault`；函数里所有 `clampStageX(…)` → `clampX(…, geo)`；所有 `applyObjectShift(…)` 末尾加 `geo`。

改完后 `grep -n "clampStageX\|SPOTS\|1800\|\b960\b\|\[1240, 320\]" motion.mjs` 应该为空（`aimArmAt`、`walkFrame` 参数缺省里的 `x = 320`、`ground = 930` 保持不动，它们总是被显式传值）。

- [ ] **Step 5: 改 `project.mjs`**

import 区加 `import { FRAMES } from './frame.mjs';`。第 310–313 行换成：

```js
    if (isStageLayout && stageValidForLayout && objects.length > 0) {
      const frame = FRAMES[project.settings?.ratio] ?? FRAMES['16:9'];
      const staged = layoutStage(shot.visual.data, { hostAt: shot.host?.at, prevHostX, customProps, frame });
      if (staged.crowded) {
        const where = frame.ratio === '9:16' ? '竖屏舞台' : '舞台';
        add(`${at}/visual/data/objects`, 'STAGE_CROWDED', `镜头 ${shot.id} 的${where}太挤，缩到 0.6 倍仍放不下全部物件和主持人；减少物件或拆成两个镜头（见 world.md）`);
      }
      prevHostX = staged.hostX;
    }
```

同一函数里 `prevHostX` 的初值如果是 `320`，改成 `(FRAMES[project.settings?.ratio] ?? FRAMES['16:9']).hostHome`。16:9 时消息与原来逐字相同。

- [ ] **Step 6: 确认测试通过、金样不变**

Run: `node --test tests/portrait-stage.test.mjs tests/golden.test.mjs tests/stage.test.mjs tests/motion.test.mjs tests/interaction.test.mjs tests/project.test.mjs`
Expected: 全部 PASS。

- [ ] **Step 7: 跑全部测试并提交**

Run: `npm test`
Expected: 全部 PASS。

```bash
git add skills/topic-to-video/scripts/lib/stage.mjs skills/topic-to-video/scripts/lib/motion.mjs skills/topic-to-video/scripts/lib/project.mjs tests/portrait-stage.test.mjs
git commit -m "feat(stage,motion): take slots, bounds, spots and walk limits from the frame geometry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 镜头计划与竖屏画布

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/scene.mjs`（`getCachedSceneBg`、`getCachedEvalPlan`、`buildShotPlans`、`subtitleAt`、`renderPrevLayer`、`evaluateFrame`）
- Modify: `skills/topic-to-video/scripts/lib/templates.mjs`（`layoutElements`、`renderDiagram` 只加 `frame` 参数和图解区）
- Test: `tests/portrait-scene.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `FRAMES`、`frameFor`；Task 3 的 `layoutStage({ frame })`、`renderStage({ frame })`、`evaluateHostAt` 读 `plan.frame`
- Produces:
  - `buildShotPlans(project, timeline, manifest, { frame = frameFor(project.settings?.ratio) } = {})`：每个计划多一个 `plan.frame`
  - `layoutElements(visual, layout = 'full', zoneOverride = null, frame = FRAMES['16:9'])`
  - `renderDiagram(visual, { …原参数, frame = FRAMES['16:9'] })`
  - `evaluateFrame` 的输出 SVG 画布是 `frame.width × frame.height`

这一步之后竖屏已经能出画面，但模板仍横排、场景仍按比例拉伸、字幕仍单行，后面三个任务分别处理。

- [ ] **Step 1: 写失败测试 `tests/portrait-scene.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { buildShotPlans, evaluateFrame } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { digestProject, fakeTiming, manifest, sceneTour } from './helpers/golden.mjs';

const portraitPlans = (p) => buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest, { frame: FRAMES['9:16'] });

test('buildShotPlans attaches the frame; 9:16 projects default to the portrait frame', () => {
  const p = sceneTour();
  assert.ok(portraitPlans(p).every((pl) => pl.frame.ratio === '9:16'));
  p.settings.ratio = '9:16';
  assert.ok(buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest).every((pl) => pl.frame.ratio === '9:16'));
});

test('portrait frames are 1080×1920 with the host on ground 1180 and the camera centred on (540, 960)', () => {
  const plans = portraitPlans(sceneTour());
  const stage = plans.find((pl) => pl.shot.layout === 'stage');
  const f = evaluateFrame(manifest, stage, stage.durationSec - 0.05);
  assert.ok(f.vectorSvg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">'));
  assert.ok(f.vectorSvg.includes('translate(540 960)'));
  assert.ok(Math.abs(f.hostMeta.bodyBbox.y + f.hostMeta.bodyBbox.h - 1180) < 1);
});

test('host-left starts from the portrait home x and diagram text stays in the portrait zone', () => {
  const plans = portraitPlans(sceneTour());
  const hl = plans.find((pl) => pl.shot.layout === 'host-left' && pl.shot.visual.template === 'number');
  assert.equal(hl.startState.x, 200);
  for (const el of hl.elements) {
    const z = FRAMES['9:16'].zones['host-left'];
    assert.ok(el.bbox.x >= z.x - 1e-6 && el.bbox.x + el.bbox.w <= z.x + z.w + 1e-6);
  }
});

test('layout switches trot from off-screen and interpolate between the portrait zones', () => {
  const plans = portraitPlans(sceneTour());
  const i = plans.findIndex((pl, k) => k > 0 && pl.shot.layout === 'host-left' && plans[k - 1].shot.layout === 'full');
  assert.ok(i > 0, 'tour has full -> host-left');
  const f = evaluateFrame(manifest, plans[i], 0.05);
  assert.ok(f.isFastMotion);
  assert.ok(f.vectorSvg.includes('data-host="xiaoqing"'));
  const out = plans.findIndex((pl, k) => k > 0 && pl.shot.layout === 'full' && plans[k - 1].shot.layout !== 'full');
  const g = evaluateFrame(manifest, plans[out], 0.1);
  assert.ok(g.vectorSvg.includes('data-host="xiaoqing"'), 'trots out');
  for (const ti of g.textItems) assert.ok(ti.x < 1080 + 400, `text ${ti.key} not at landscape x ${ti.x}`);
});

test('portrait subtitles are centred at x 540 in 60 px', () => {
  const plans = portraitPlans(sceneTour());
  const f = evaluateFrame(manifest, plans[0], plans[0].durationSec / 2);
  const sub = f.textItems.find((t) => t.key.startsWith('sub-'));
  assert.deepEqual([sub.x, sub.fontSize], [540, 60]);
});

test('passing the 16:9 frame explicitly gives the same digest as the default', () => {
  const p = sceneTour();
  assert.deepEqual(digestProject(p, { frame: FRAMES['16:9'] }), digestProject(p));
});
```

- [ ] **Step 2: 确认测试失败**

Run: `node --test tests/portrait-scene.test.mjs`
Expected: FAIL（`plan.frame` 不存在，画布仍是 1920×1080）。

- [ ] **Step 3: 改 `templates.mjs`（只加参数，排法不变）**

`layoutElements` 和 `renderDiagram`：

```js
export function layoutElements(visual, layout = 'full', zoneOverride = null, frame = FRAMES['16:9']) {
  const z = zoneOverride ?? frame.zones[layout] ?? frame.zones.full;
```

`renderDiagram` 的参数表末尾加 `frame = FRAMES['16:9'],`，函数体前两行换成：

```js
  const zone = zoneOverride ?? frame.zones[layout] ?? frame.zones.full;
  const elements = layoutElements(visual, layout, zoneOverride, frame);
```

- [ ] **Step 4: 改 `scene.mjs`**

import 区加 `import { FRAMES, frameFor } from './frame.mjs';`，删掉 `DIAGRAM_ZONES` 和 `GROUND_Y` 的 import（改用 `frame`），加 `const LANDSCAPE = FRAMES['16:9'];`。

`getCachedSceneBg` 改为接收 `frame`（场景竖屏摆位在 Task 6 才用到，这里先把 `ground` 和 `width` 传进去）：

```js
function getCachedSceneBg(sceneName, styleName, seed, frame) {
  const key = `${sceneName}|${styleName}|${seed}|${frame.ground}|${frame.ratio}`;
  if (sceneBgCache.has(key)) return sceneBgCache.get(key);
  const svg = sceneBackgroundSvg(sceneName, { style: styleName, seed, ground: frame.ground, width: frame.width, height: frame.height });
```

（16:9 时 `width`、`height` 就是函数的缺省值 1920、1080，输出不变；缓存键多出的 `|16:9` 只是进程内 Map 的键。）

`getCachedEvalPlan`：`ground: GROUND_Y,` → `ground: (shotPlan.frame ?? LANDSCAPE).ground,`，对象里加 `frame: shotPlan.frame ?? LANDSCAPE,`，缓存判断加 `&& prev.frame === (shotPlan.frame ?? LANDSCAPE)`。

`buildShotPlans`：

```js
export function buildShotPlans(project, timeline, manifest, { frame = frameFor(project.settings?.ratio) } = {}) {
  …
  let lastHostEnd = { x: frame.hostHome, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none', autoSnaps: 0 };
```

函数体里：`prevHostX: reenteringFromFull ? 320 : lastHostEnd.x` → `frame.hostHome`；`layoutStage(shot.visual.data, { … hostHeight: manifest.height_px })` 加 `frame`；`layoutElements(shot.visual, shot.layout)` → `layoutElements(shot.visual, shot.layout, null, frame)`；`startState.x` 里的 `320` → `frame.hostHome`；自动走回的 `Math.abs(startState.x - 320) > 80` → `Math.abs(startState.x - frame.hostHome) > 80`；`plan` 对象里加 `frame,`；`evaluateHostAt(manifest, { … ground: GROUND_Y, …` → `ground: frame.ground,` 并加 `frame,`。

`subtitleAt`：`x: 960, y: 1012, fontSize: 44,` 换成：

```js
    x: (shotPlan.frame ?? LANDSCAPE).subtitle.x,
    y: (shotPlan.frame ?? LANDSCAPE).subtitle.y,
    fontSize: (shotPlan.frame ?? LANDSCAPE).subtitle.fontSize, // >= 40 px clarity requirement (超越路线图 §5.2)
```

`renderPrevLayer`：`renderStage(prev.shot.visual, { …` 和 `renderDiagram(prev.shot.visual, { …` 都加 `frame: shotPlan.frame ?? LANDSCAPE,`。

`evaluateFrame`：开头加 `const frame = shotPlan.frame ?? LANDSCAPE; const [cx, cy] = frame.center;`，然后：

- 两处 `walkFrame(manifest, t * 2, { x: …, ground: GROUND_Y, …` → `ground: frame.ground`；小跑出场 `drawHost` 里的 `ground: GROUND_Y` → `ground: frame.ground`。
- 图解区插值：`DIAGRAM_ZONES[…]` → `frame.zones[…]`。
- `unscalePt`：`[960 + (pt[0] - 960) / camZoom, 540 + (pt[1] - 540) / camZoom]` → `[cx + (pt[0] - cx) / camZoom, cy + (pt[1] - cy) / camZoom]`。
- `getCachedSceneBg(shotPlan.scene ?? 'blank', styleName, shotPlan.id, GROUND_Y)` → `getCachedSceneBg(shotPlan.scene ?? 'blank', styleName, shotPlan.id, frame)`。
- `renderStage(…)`、`renderDiagram(…)` 都加 `frame,`。
- 缓推和画布：

```js
  const camOpen = `<g transform="translate(${cx} ${cy}) scale(${camScaleStr}) translate(${-cx} ${-cy})">`;
  …
  const vectorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">`
    + styleBackgroundSvg(styleName, frame.width, frame.height, bgParallax)
```

- 文字缓推：`x: 960 + (ti.x - 960) * camScale, y: 540 + (ti.y - 540) * camScale,` → `x: cx + (ti.x - cx) * camScale, y: cy + (ti.y - cy) * camScale,`。

16:9 时 `translate(-960 -540)` 与 `translate(${-cx} ${-cy})` 生成的字符串相同（`-960 -540`），金样不变。改完后 `grep -n "1920\|1080\|\b960\b\|\b540\b\|GROUND_Y\|DIAGRAM_ZONES\|\b320\b" scene.mjs` 只应剩下 `shotCacheKey` 参数缺省里的 `width = 1920, height = 1080` 和注释。

- [ ] **Step 5: 确认测试通过、金样不变**

Run: `node --test tests/portrait-scene.test.mjs tests/golden.test.mjs tests/scene-encode.test.mjs tests/visuals.test.mjs tests/world.test.mjs`
Expected: 全部 PASS。

- [ ] **Step 6: 跑全部测试并提交**

Run: `npm test`
Expected: 全部 PASS。

```bash
git add skills/topic-to-video/scripts/lib/scene.mjs skills/topic-to-video/scripts/lib/templates.mjs tests/portrait-scene.test.mjs
git commit -m "feat(scene): carry the frame on every shot plan and draw portrait canvases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 模板竖排

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/templates.mjs`（`layoutElements` 的 `bullets`、`flow`、`timeline`、`cycle`；`renderDiagram` 的字号、`title`、`number`、`flow` 箭头与运送、`compare` 行字号、`timeline` 轴和枝）
- Modify: `skills/topic-to-video/scripts/lib/stage.mjs`（`evaluateStageObjects` 里非同台的运送端点）
- Test: `tests/portrait-templates.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `isPortrait`、`flowArrowEnds`、`textBox`；Task 4 的 `layoutElements(…, frame)`、`renderDiagram({ frame })`
- Produces: 竖屏下 8 个模板的新排法（§5.1）；横屏排法逐字不变

- [ ] **Step 1: 写失败测试 `tests/portrait-templates.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES, textBox } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { layoutElements, renderDiagram } from '../skills/topic-to-video/scripts/lib/templates.mjs';

const P = FRAMES['9:16'];
const VISUALS = {
  title: { template: 'title', data: { heading: '一二三四五六七八九十一二三四五六', sub: '一二三四五六七八九十一二三四五六七八九十一二三四' } },
  bullets: { template: 'bullets', data: { items: ['一二三四五六七八九十一二三四', '短', '中等长度', '第四条'] } },
  flow: { template: 'flow', data: { nodes: ['一二三四五六', '二', '三', '四', '五'] } },
  compare: { template: 'compare', data: { left: { label: '一二三四五六七八', rows: ['一二三四五六七八九十一二', '二', '三'] }, right: { label: '右', rows: ['一二三四五六七八九十一二'] } } },
  number: { template: 'number', data: { value: '12345678', label: '一二三四五六七八九十一二' } },
  bars: { template: 'bars', data: { items: [1, 2, 3, 4, 5].map((v) => ({ label: `第${v}`, value: v * 10 })), unit: '毫秒' } },
  timeline: { template: 'timeline', data: { items: ['一', '二', '三', '四', '五'].map((d) => ({ time: `第${d}天`, label: '一二三四五六七八' })) } },
  cycle: { template: 'cycle', data: { items: ['请求', '缓存', '复用', '过期', '再问'].map((label) => ({ label })) } },
};
const inside = (b, s) => b.x >= s.x - 1e-6 && b.y >= s.y - 1e-6 && b.x + b.w <= s.x + s.w + 1e-6 && b.y + b.h <= s.y + s.h + 1e-6;
const overlap = (a, b) => a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 && a.y < b.y + b.h - 1e-6 && a.y + a.h > b.y + 1e-6;

for (const layout of ['host-left', 'full']) {
  for (const [name, visual] of Object.entries(VISUALS)) {
    test(`portrait ${layout} ${name}: elements inside the zone, no overlap, text inside the safe box`, () => {
      const zone = P.zones[layout];
      const els = layoutElements(visual, layout, null, P);
      els.forEach((el, i) => {
        assert.ok(inside(el.bbox, zone), `${name}[${i}] inside zone`);
        els.slice(i + 1).forEach((o, j) => assert.ok(!overlap(el.bbox, o.bbox), `${name}[${i}] vs [${i + 1 + j}]`));
      });
      const res = renderDiagram(visual, { layout, frame: P, t: 5, duration: 5 });
      for (const ti of res.textItems) assert.ok(inside(textBox(ti), P.textSafe), `${name} text ${ti.key} at ${ti.x},${ti.y} size ${ti.fontSize}`);
    });
  }
}

test('portrait flow stacks nodes top to bottom with downward arrows; bullets use one column', () => {
  const flow = layoutElements(VISUALS.flow, 'full', null, P);
  for (let i = 1; i < flow.length; i += 1) assert.ok(flow[i].bbox.y >= flow[i - 1].bbox.y + flow[i - 1].bbox.h);
  const bullets = layoutElements(VISUALS.bullets, 'host-left', null, P);
  assert.equal(new Set(bullets.map((b) => b.bbox.x)).size, 1);
});

test('portrait timeline alternates cards left and right of a vertical axis; cycle is nearly round', () => {
  const tl = layoutElements(VISUALS.timeline, 'full', null, P);
  const axisX = P.zones.full.x + P.zones.full.w / 2;
  tl.forEach((el, i) => assert.ok(i % 2 === 0 ? el.bbox.x + el.bbox.w <= axisX : el.bbox.x >= axisX));
  const cy = layoutElements(VISUALS.cycle, 'full', null, P).map((e) => [e.bbox.x + e.bbox.w / 2, e.bbox.y + e.bbox.h / 2]);
  const xs = cy.map((c) => c[0]);
  const ys = cy.map((c) => c[1]);
  const rx = (Math.max(...xs) - Math.min(...xs)) / 2;
  const ry = (Math.max(...ys) - Math.min(...ys)) / 2;
  assert.ok(rx / ry < 1.3, `rx/ry=${rx / ry}`);
});
```

- [ ] **Step 2: 确认测试失败**

Run: `node --test tests/portrait-templates.test.mjs`
Expected: FAIL（`flow` 节点横排挤在一起、`title` 文字超框、`timeline` 不交替等）。

- [ ] **Step 3: 改 `layoutElements`**

import 区把 frame 的导入改成 `import { FRAMES, flowArrowEnds, isPortrait } from './frame.mjs';`。函数开头：

```js
  const z = zoneOverride ?? frame.zones[layout] ?? frame.zones.full;
  const portrait = isPortrait(frame);
  const compact = layout === 'host-left' || portrait;
  const d = visual.data;
```

`bullets`：`const cols = layout === 'host-left' && n > 2 ? 2 : 1;` → `const cols = !portrait && layout === 'host-left' && n > 2 ? 2 : 1;`

`flow`：在 `case 'flow': {` 后、原代码前插入：

```js
      if (portrait) {
        const n = d.nodes.length;
        const gap = 44;
        const pad = 16;
        const w = Math.min(560, z.w - pad * 2);
        const h = Math.min(140, (z.h - pad * 2 - gap * (n - 1)) / n);
        const totalH = n * h + (n - 1) * gap;
        const x = z.x + (z.w - w) / 2;
        const startY = z.y + (z.h - totalH) / 2;
        return d.nodes.map((label, index) => ({ index, label, bbox: { x, y: startY + index * (h + gap), w, h } }));
      }
```

`timeline`：在 `case 'timeline': {` 后插入：

```js
      if (portrait) {
        const n = d.items.length;
        const gapY = 16;
        const stemGap = 22;
        const axisX = z.x + z.w / 2;
        const w = z.w / 2 - stemGap - 12;
        const h = Math.min(120, (z.h - 32 - gapY * (n - 1)) / n);
        const totalH = n * h + (n - 1) * gapY;
        const startY = z.y + (z.h - totalH) / 2;
        return d.items.map((item, index) => {
          const x = index % 2 === 0 ? axisX - stemGap - w : axisX + stemGap;
          return { index, label: item.label, bbox: { x, y: startY + index * (h + gapY), w, h } };
        });
      }
```

`cycle`：`layout === 'host-left'` 的三处（`cardW`、`cardH`、`rx` 系数）改用 `compact`，`rx` 系数改为：

```js
      const rx = Math.min(maxRx, ry * (portrait ? 1 : compact ? 2.25 : 1.55));
```

（横屏时 `compact === (layout === 'host-left')`，结果不变。）

- [ ] **Step 4: 改 `renderDiagram`**

`zone`、`elements` 两行后加：

```js
  const portrait = isPortrait(frame);
  const compact = layout === 'host-left' || portrait;
  /** Largest font up to `base` that fits `text` across `width` (portrait only; landscape keeps `base`). */
  const fitFont = (base, text, width) => (portrait ? Math.min(base, Math.floor((width - 48) / Math.max(1, [...String(text)].length))) : base);
```

把函数里每个 `fontSize: layout === 'host-left' ? A : B` 换成 `fontSize: compact ? A : B`。再改 4 处：

- `title` 的标题字号：`fontSize: layout === 'host-left' ? 68 : 88,` → `fontSize: fitFont(compact ? 68 : 88, heading, b.w),`；副标题的 `fontSize: layout === 'host-left' ? 40 : 48,` → `fontSize: fitFont(compact ? 40 : 48, d.sub, b.w),`。
- `number` 的数值字号：`fontSize: layout === 'host-left' ? 116 : 164,` → `fontSize: fitFont(compact ? 116 : 164, String(d.value), b.w),`。
- `compare` 的行字号：`fontSize: layout === 'host-left' ? 34 : 42,` → `fontSize: portrait ? 30 : compact ? 34 : 42,`。
- `number` 的标签 `y: cy + (layout === 'host-left' ? 105 : 145)` 改用 `compact`。

`flow` 的箭头：把 `if (i > 0) { … const arrow = handArrow(…); … }` 里的 `handArrow` 调用换成：

```js
          const ends = flowArrowEnds(
            { x: prevB.x + (prevSt.dx ?? 0), y: prevB.y + (prevSt.dy ?? 0), w: prevB.w, h: prevB.h },
            { x: b.x + (st.dx ?? 0), y: b.y + (st.dy ?? 0), w: b.w, h: b.h },
          );
          const arrow = handArrow(ends.from[0], ends.from[1], ends.to[0], ends.to[1], {
            seed: `${seed}:arr${i}`,
            color: st.highlight > 0 ? pal.red : pal.teal,
            progress: st.arrowProgress * st.opacity,
            bend: ends.bend,
          });
```

（横屏时 `bend` 是 `[0, -14]`，`handArrow` 算出的控制点与原来不写 `bend` 时完全相同。）`flow` 的运送兜底端点同样改用 `flowArrowEnds`：

```js
          const ends = flowArrowEnds(
            { x: prevB.x + (prevSt.dx ?? 0), y: prevB.y + (prevSt.dy ?? 0), w: prevB.w, h: prevB.h },
            { x: currB.x + (currSt.dx ?? 0), y: currB.y + (currSt.dy ?? 0), w: currB.w, h: currB.h },
          );
          const fromPt = !hasOverride && Array.isArray(s.fromPt) ? s.fromPt : ends.from;
          const toPt = !hasOverride && Array.isArray(s.toPt) ? s.toPt : ends.to;
          const pktSvg = renderSendPacket(fromPt, toPt, s.prop, s.u, {
            style: styleName,
            seed: `${seed}:send:${s.index ?? idx}`,
            customProps,
            bend: s.bend ?? ends.bend,
          });
```

`timeline` 的轴、枝和圆点：

```js
      const axisX = zone.x + zone.w / 2;
      const axisY = zone.y + zone.h / 2;
      const axisPts = portrait
        ? [[axisX, zone.y + 24], [axisX, zone.y + zone.h - 24]]
        : [[zone.x + 24, axisY], [zone.x + zone.w - 24, axisY]];
      const axis = `<path d="${inkStroke(axisPts, { seed: `${seed}:tl-axis`, width: [4.5, 6], wobble: 1.8 }).d}" fill="${pal.ink}"/>`;
```

循环里：

```js
        const cx = b.x + b.w / 2;
        const cyMid = b.y + b.h / 2;
        const stemPts = portrait
          ? [[axisX, cyMid], [cx < axisX ? b.x + b.w : b.x, cyMid]]
          : [[cx, axisY], [cx, isTop ? b.y + b.h : b.y]];
        const stem = `<path d="${inkStroke(stemPts, { seed: `${seed}:tls${i}`, width: [3.5, 5], wobble: 1.2 }).d}" fill="${pal.ink}"/>`;
        const dotPts = portrait
          ? circlePoints(axisX, cyMid, 10, { seed: `${seed}:tld${i}`, overdraw: 0.25, count: 18 })
          : circlePoints(cx, axisY, 10, { seed: `${seed}:tld${i}`, overdraw: 0.25, count: 18 });
```

删掉原来的 `const stemY = …` 一行（横屏的 `stemPts` 已经包含它）。

- [ ] **Step 5: 改 `stage.mjs` 的非同台运送端点**

import 区改成 `import { FRAMES, flowArrowEnds } from './frame.mjs';`。`evaluateStageObjects` 里 `} else {` 分支（`const dstIdx = entry.cue.target;` 那段）的 `fromPt`、`toPt`、`bend` 三个赋值换成：

```js
      const prevSt = objectStates[dstIdx - 1];
      const currSt = objectStates[dstIdx];
      const ends = flowArrowEnds(
        { x: prevB.x + (prevSt?.dx ?? 0), y: prevB.y + (prevSt?.dy ?? 0), w: prevB.w, h: prevB.h },
        { x: currB.x + (currSt?.dx ?? 0), y: currB.y + (currSt?.dy ?? 0), w: currB.w, h: currB.h },
      );
      fromPt = ends.from;
      toPt = ends.to;
      bend = ends.bend;
```

- [ ] **Step 6: 确认测试通过、金样不变**

Run: `node --test tests/portrait-templates.test.mjs tests/golden.test.mjs tests/visuals.test.mjs tests/stage.test.mjs`
Expected: 全部 PASS。如果某个竖屏模板的文字仍超框，按 §5.1 调这个模板竖屏分支里的尺寸或用 `fitFont`，不要动横屏分支。

- [ ] **Step 7: 跑全部测试并提交**

Run: `npm test`
Expected: 全部 PASS。

```bash
git add skills/topic-to-video/scripts/lib/templates.mjs skills/topic-to-video/scripts/lib/stage.mjs tests/portrait-templates.test.mjs
git commit -m "feat(templates): stack flow and timeline, single-column bullets, round cycle and fitted titles in portrait

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 场景竖屏摆位

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/world.mjs`（`sceneBackgroundSvg`）
- Modify: `skills/topic-to-video/scripts/lib/scene.mjs`（`getCachedSceneBg` 传 `frame`）
- Test: `tests/portrait-world.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `isPortrait`；Task 4 的 `getCachedSceneBg(sceneName, styleName, seed, frame)`
- Produces: `sceneBackgroundSvg(sceneName, { style, width, height, seed, ground, frame = null })`：`frame` 为竖屏时按分组摆位，其他情况输出与原来逐字相同

竖屏下每组陈设整体等比缩到 0.7 倍，形状不变形：左边的组贴左边（x × 0.7），右边的组贴右边（1080 − (1920 − x) × 0.7），横跨全宽的线条（电线、横梁、山脊）横向压缩到 1080 宽；落地的组以地面为基准（y′ = 1180 − (930 − y) × 0.7），顶上的组以安全框上沿为基准（y′ = 250 + (y − 40) × 0.7）。设计 §5.3 已按这个规则修订（原稿写的是只平移、不缩放，那样左右陈设各占画面宽度约 40%）。按现有 8 个场景估算，竖屏左组最右约 347、右组最左约 730，中间 x 360–720 留空。

- [ ] **Step 1: 写失败测试 `tests/portrait-world.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { SCENE_NAMES, sceneBackgroundSvg } from '../skills/topic-to-video/scripts/lib/world.mjs';

const P = FRAMES['9:16'];
/** Every [x, y] point in the path data of decoration paths, skipping the ground line. */
function points(svg) {
  const out = [];
  for (const m of svg.matchAll(/<path([^>]*)\sd="([^"]+)"/g)) {
    if (m[1].includes('data-ground')) continue;
    const nums = m[2].match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  }
  return out;
}
const portraitSvg = (scene) => sceneBackgroundSvg(scene, { seed: 't', ground: P.ground, width: P.width, height: P.height, frame: P });

test('portrait floor decorations stay out of the central performance zone x 360–720', () => {
  for (const scene of SCENE_NAMES) {
    for (const [x, y] of points(portraitSvg(scene))) {
      if (y < 470) continue; // ceiling band
      assert.ok(x <= 360 || x >= 720, `${scene}: (${x}, ${y}) inside the central zone`);
    }
  }
});

test('portrait decorations stay inside the frame and ceiling groups sit below the top safe line', () => {
  for (const scene of SCENE_NAMES) {
    for (const [x, y] of points(portraitSvg(scene))) {
      assert.ok(x >= -10 && x <= 1090, `${scene}: x ${x}`);
      assert.ok(y >= 240 && y <= 1190, `${scene}: y ${y}`);
    }
  }
});

test('portrait left floor group keeps its proportions at 0.7 (no stretching)', () => {
  const box = (pts) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const land = box(points(sceneBackgroundSvg('kitchen', { seed: 't' })).filter(([x, y]) => x < 560 && y > 40));
  const port = box(points(portraitSvg('kitchen')).filter(([x, y]) => x < 360 && y >= 470));
  assert.ok(Math.abs(port.w / land.w - 0.7) < 0.03, `w ratio ${port.w / land.w}`);
  assert.ok(Math.abs(port.h / land.h - 0.7) < 0.03, `h ratio ${port.h / land.h}`);
});

test('without a portrait frame the output is unchanged', () => {
  for (const scene of SCENE_NAMES) {
    assert.equal(sceneBackgroundSvg(scene, { seed: 't', frame: FRAMES['16:9'] }), sceneBackgroundSvg(scene, { seed: 't' }));
  }
});
```

- [ ] **Step 2: 确认测试失败**

Run: `node --test tests/portrait-world.test.mjs`
Expected: FAIL（竖屏陈设仍按 `kx`、`ky` 拉伸，进入中间区）。

- [ ] **Step 3: 改 `sceneBackgroundSvg` 的坐标换算**

import 区加 `import { FRAMES, isPortrait } from './frame.mjs';`（Task 2 已经引入 `FRAMES`，这里补 `isPortrait`）。函数头和换算函数：

```js
export function sceneBackgroundSvg(sceneName, { style = 'paper', width = 1920, height = 1080, seed = 'scene', ground = GROUND_Y, frame = null } = {}) {
  if (!SCENE_NAMES.includes(sceneName)) throw new Error(`unknown scene: ${sceneName}`);
  const { palette: pal } = resolveStyle(style);
  const kx = width / 1920;
  const ky = ground / GROUND_Y;
  const portrait = Boolean(frame) && isPortrait(frame);
  // Portrait (竖屏设计 §5.3): each decoration group keeps its shape at 0.7, pinned to its side and to the floor or ceiling.
  const K = 0.7;
  let side = 'center';
  let band = 'floor';
  const place = (s, b) => { side = s; band = b; };
  const mapX = (x) => (side === 'left' ? x * K : side === 'right' ? frame.width - (1920 - x) * K : frame.width / 2 + (x - 960) * (frame.width / 1920));
  const mapY = (y) => (band === 'floor' ? ground - (GROUND_Y - y) * K : frame.textSafe.y + (y - 40) * K);
  const sx = (x) => (portrait ? mapX(x) : x * kx);
  const sy = (y) => (portrait ? mapY(y) : y * ky);
  const pt = (x, y) => [sx(x), sy(y)];
  const poly = (pts) => pts.map(([x, y]) => pt(x, y));
```

`circle` 的半径：`r * Math.min(kx, ky)` → `r * (portrait ? K : Math.min(kx, ky))`。

地面线：在 `const groundLine = wobbleStroke(…)` 前一行加 `place('center', 'floor');`，地面线的两个端点仍写 `[sx(40), ground]`、`[sx(1880), ground]`（横屏 `place` 不影响 `sx`；竖屏 `center` 映射到 22.5 和 1057.5）。

- [ ] **Step 4: 在 8 个场景里插入 `place(…)`**

在 `switch (sceneName)` 的各个 `case` 里，按下表在每一段陈设的第一个 `parts.push` 前插入一行 `place('<side>', '<band>');`。只插入，不调整 `parts.push` 的顺序（顺序变了横屏输出就变了）。表中按代码顺序列出每一段的第一个和最后一个部件键：

| 场景 | 段（按出现顺序） |
| --- | --- |
| `podium` | `curtain-l1`–`curtain-l2`：left floor；`curtain-r1`–`curtain-r2`：right floor；`lectern-fill`–`mic`：left floor；`stand-pole`–`speaker-cone`：right floor；`spot-l-cord`–`spot-l-hood`：left ceiling；`spot-r-cord`–`spot-r-hood`：right ceiling |
| `kitchen` | `cab-l`–`kettle-spout`：left floor；`pan-rail`–`pan-2`：right ceiling；`window`–`counter-r`：right floor |
| `street` | `wire`：center ceiling；`shop-l`–`shop-door`（含 `awning-stripe-*` 循环）：left floor；`lamp-post`–`cafe-win2`：right floor |
| `lab` | `lamp-l-cord`–`lamp-l`：left ceiling；`lamp-r-cord`–`lamp-r`：right ceiling；`shelf-l`–`microscope`：left floor；`board-r`–`atom-core`：right ceiling；`cabinet-r`–`cabinet-r-door`：right floor |
| `office` | `ceiling-beam`：center ceiling；`bookcase`–`mug-l`（含 `shelf-*` 循环）：left floor；`clock`–`clock-h`：right ceiling；`office-win`–`leaf-3`（含 `blind-*` 循环、`pot`）：right floor |
| `outdoor` | `sun-fill`–`sun`：right ceiling；`cloud-1`：left ceiling；`cloud-2`–`hills`：center ceiling；`tree-trunk-l1`–`fence-l-p2`：left floor；`tree-crown-r`–`fence-r-p2`：right floor |
| `workshop` | `beam`：center ceiling；`lamp-l-stem`–`lamp-l-shade`：left ceiling；`lamp-r-stem`–`lamp-r-shade`：right ceiling；`pegboard-l`–`bench-cross`：left floor；`gear-r`–`drawer-*` 循环：right floor |
| `blank` | 无 |

例如 `podium` 开头变成：

```js
    case 'podium':
      // Left curtain + lectern, right speaker stand + curtain, top twin spotlights
      place('left', 'floor');
      parts.push(inkPath([[55, 45], [75, 290], [60, 620], [72, 920]], 'curtain-l1', { smooth: 1 }));
      parts.push(inkPath([[115, 45], [135, 310], [118, 640], [130, 920]], 'curtain-l2', { smooth: 1 }));
      place('right', 'floor');
      parts.push(inkPath([[1865, 45], [1845, 290], [1860, 620], [1848, 920]], 'curtain-r1', { smooth: 1 }));
```

- [ ] **Step 5: 让 `scene.mjs` 传 `frame`**

`getCachedSceneBg` 里的调用改成 `sceneBackgroundSvg(sceneName, { style: styleName, seed, ground: frame.ground, width: frame.width, height: frame.height, frame })`。

- [ ] **Step 6: 确认测试通过、金样不变**

Run: `node --test tests/portrait-world.test.mjs tests/golden.test.mjs tests/world.test.mjs`
Expected: 全部 PASS。

- [ ] **Step 7: 跑全部测试并提交**

Run: `npm test`
Expected: 全部 PASS。

```bash
git add skills/topic-to-video/scripts/lib/world.mjs skills/topic-to-video/scripts/lib/scene.mjs tests/portrait-world.test.mjs
git commit -m "feat(world): place scene decoration groups at 0.7 on the portrait sides, floor and ceiling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 竖屏字幕翻页与 ASS

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/timing.mjs`（新增 `subtitlePages`）
- Modify: `skills/topic-to-video/scripts/lib/scene.mjs`（新增 `subtitleItems`，`evaluateFrame` 改用它）
- Modify: `skills/topic-to-video/scripts/lib/encode.mjs`（`buildSubtitlesAss` 加 `frame` 参数）
- Test: `tests/portrait-subtitles.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `FRAMES`、`isPortrait`；现有的 `splitClauses`
- Produces:
  - `subtitlePages(text, { maxChars = 12, maxLines = 2 } = {}) -> string[][]`：每页最多 `maxLines` 行，每行最多 `maxChars` 字；英文词和数字串不拆开；去掉行尾逗号类标点
  - `buildSubtitlesAss(project, timeline, frame = FRAMES['16:9'])`：横屏输出不变；竖屏 `PlayRes` 1080×1920、字号 60、左右边距 170，每页一条事件

- [ ] **Step 1: 写失败测试 `tests/portrait-subtitles.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubtitlesAss } from '../skills/topic-to-video/scripts/lib/encode.mjs';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { buildShotPlans, evaluateFrame } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { subtitlePages } from '../skills/topic-to-video/scripts/lib/timing.mjs';
import { fakeTiming, goldenCases, manifest } from './helpers/golden.mjs';

const len = (s) => [...s].length;

test('subtitlePages packs clauses into pages of at most two 12-character lines', () => {
  assert.deepEqual(subtitlePages('你昨天见过的这张图标，今天再打开，还要从头下载吗？'), [['你昨天见过的这张图标', '今天再打开'], ['还要从头下载吗？']]);
  assert.deepEqual(subtitlePages('一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十。'), [['一二三四五六七八九十一', '二三四五六七八九十一二'], ['三四五六七八九十。']]);
  assert.deepEqual(subtitlePages('短句。'), [['短句。']]);
});

test('subtitlePages never splits a Latin word or a digit run', () => {
  const pages = subtitlePages('我们把热点数据放进Redis缓存里面然后返回304给浏览器。');
  const lines = pages.flat();
  assert.ok(lines.some((l) => l.includes('Redis')));
  assert.ok(lines.some((l) => l.includes('304')));
  for (const l of lines) assert.ok(len(l) <= 12, l);
});

test('every narration sentence in the fixtures fits the portrait page limits', () => {
  for (const p of Object.values(goldenCases())) {
    for (const sec of p.sections) {
      for (const page of subtitlePages(sec.text)) {
        assert.ok(page.length <= 2);
        for (const line of page) assert.ok(len(line) <= 12, line);
      }
    }
  }
});

test('portrait frames show one or two subtitle lines centred on x 540 around y 1330', () => {
  const p = goldenCases()['cache-speed'];
  const plans = buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest, { frame: FRAMES['9:16'] });
  let seenTwo = false;
  for (const plan of plans) {
    for (let t = 0.1; t < plan.durationSec; t += 0.4) {
      const subs = evaluateFrame(manifest, plan, t).textItems.filter((ti) => ti.key.startsWith('sub-'));
      assert.ok(subs.length <= 2);
      if (subs.length === 2) {
        seenTwo = true;
        assert.deepEqual(subs.map((s) => s.y), [1290, 1370]);
      }
      if (subs.length === 1) assert.equal(subs[0].y, 1330);
      for (const s of subs) assert.equal(s.x, 540);
    }
  }
  assert.ok(seenTwo, 'some page has two lines');
});

test('portrait ASS uses a 1080×1920 canvas, 60 px and 170 px side margins', () => {
  const p = goldenCases()['cache-speed'];
  const ass = buildSubtitlesAss(p, buildTimeline(p, fakeTiming(p), 60), FRAMES['9:16']);
  assert.match(ass, /PlayResX: 1080\nPlayResY: 1920/);
  assert.match(ass, /Style: Default,Hiragino Sans GB,60,.*,2,170,170,520,1/);
  for (const line of ass.split('\n').filter((l) => l.startsWith('Dialogue:'))) {
    const text = line.split(',').slice(9).join(',').replace(/\{[^}]*\}/g, '');
    for (const part of text.split('\\N')) assert.ok(len(part) <= 12, part);
  }
});
```

- [ ] **Step 2: 确认测试失败**

Run: `node --test tests/portrait-subtitles.test.mjs`
Expected: FAIL（`subtitlePages` 未导出）。

- [ ] **Step 3: 在 `timing.mjs` 加 `subtitlePages`**

紧接 `splitClauses` 之后：

```js
/**
 * Portrait subtitle pages (竖屏设计 §6.5): clauses split into lines of at most `maxChars`, packed `maxLines` lines per
 * page. Latin words and digit runs are never split; a trailing comma-like mark is dropped from each line.
 */
export function subtitlePages(text, { maxChars = 12, maxLines = 2 } = {}) {
  const lines = [];
  for (const clause of splitClauses(text)) {
    const c = clause.replace(/[，、；：,:;]$/, '');
    const tokens = c.match(/[A-Za-z0-9.%]+|./gsu) ?? [];
    const total = tokens.reduce((s, tk) => s + [...tk].length, 0);
    if (!total) continue;
    const per = Math.ceil(total / Math.ceil(total / maxChars));
    let cur = '';
    for (const tk of tokens) {
      if (cur && !/^\p{P}$/u.test(tk) && [...cur].length + [...tk].length > per) {
        lines.push(cur);
        cur = '';
      }
      cur += tk;
    }
    if (cur) lines.push(cur);
  }
  const pages = [];
  let page = [];
  for (const line of lines) {
    if (page.length === maxLines) {
      pages.push(page);
      page = [];
    }
    page.push(line);
  }
  if (page.length) pages.push(page);
  return pages;
}
```

（`per` 先按字数平均分行，例如 31 字分成 3 行、每行最多 11 字；一个英文词比剩余空间长时整个移到下一行；标点不另起一行，跟在上一行末尾。一个英文词本身超过 12 字的极端情况允许单独成行超长，测试里没有这种词。）

- [ ] **Step 4: 在 `scene.mjs` 加 `subtitleItems` 并在 `evaluateFrame` 使用**

import 区：`import { resolveCueTiming, splitClauses, subtitlePages } from './timing.mjs';`，frame 导入补 `isPortrait`。在 `subtitleAt` 后加：

```js
/** Subtitle text items for one moment: the landscape single line, or a portrait page of up to two lines. */
function subtitleItems(shotPlan, t, pal) {
  const frame = shotPlan.frame ?? LANDSCAPE;
  if (!isPortrait(frame)) {
    const sub = subtitleAt(shotPlan, t, pal);
    return sub ? [sub] : [];
  }
  const ms = t * 1000;
  const sent = shotPlan.sentences.find((s) => ms >= s.startMs && ms <= s.endMs + 120);
  if (!sent || !sent.text) return [];
  const activeAnchor = shotPlan.cues
    .filter((c) => c.sentence === sent.index && c.at && ms >= c.anchorMs - 50)
    .at(-1)?.at;
  const S = frame.subtitle;
  const pages = subtitlePages(sent.text, { maxChars: S.maxChars, maxLines: S.maxLines });
  if (!pages.length) return [];
  const sizes = pages.map((pg) => [...pg.join('')].length);
  const total = sizes.reduce((a, b) => a + b, 0);
  const sp0 = sent.startMs + (sent.speech?.[0] ?? 0);
  const sp1 = sent.startMs + (sent.speech?.[1] ?? (sent.endMs - sent.startMs));
  const frac = clamp01((ms - sp0) / Math.max(1, sp1 - sp0));
  let acc = 0;
  let page = pages.at(-1);
  for (let i = 0; i < pages.length; i += 1) {
    acc += sizes[i];
    if (frac <= acc / total) {
      page = pages[i];
      break;
    }
  }
  const y0 = S.y - ((page.length - 1) * S.lineHeight) / 2;
  return page.map((line, i) => ({
    key: `sub-${sent.key}-${i}-${line}-${activeAnchor ?? ''}`,
    text: line,
    highlightWord: activeAnchor && line.includes(activeAnchor) ? activeAnchor : null,
    x: S.x,
    y: y0 + i * S.lineHeight,
    fontSize: S.fontSize,
    color: pal.ink,
    highlightColor: pal.teal,
    stroke: pal.paper,
    align: 'middle',
    weight: 'bold',
    opacity: 1,
  }));
}
```

`evaluateFrame` 里：

```js
  const sub = subtitleAt(shotPlan, t, pal);
  if (sub) scaledText.push(sub);
```

换成 `scaledText.push(...subtitleItems(shotPlan, t, pal));`。

- [ ] **Step 5: 改 `buildSubtitlesAss`**

import 区加 `import { FRAMES, isPortrait } from './frame.mjs';`、`import { subtitlePages } from './timing.mjs';`。函数头改成 `export function buildSubtitlesAss(project, timeline, frame = FRAMES['16:9']) {`，header 的两行和样式行换成：

```js
  const portrait = isPortrait(frame);
  const S = frame.subtitle;
  const marginV = Math.round(frame.height - (S.y + ((S.maxLines - 1) * S.lineHeight) / 2 + S.fontSize / 2));
  const style = portrait
    ? `Style: Default,Hiragino Sans GB,${S.fontSize},&H001F1F1F,&H00A3A520,&H00F6FAFB,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,2,170,170,${marginV},1`
    : 'Style: Default,Hiragino Sans GB,44,&H001F1F1F,&H00A3A520,&H00F6FAFB,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,40,40,48,1';
```

header 数组里 `'PlayResX: 1920'`、`'PlayResY: 1080'` → `` `PlayResX: ${frame.width}` ``、`` `PlayResY: ${frame.height}` ``，样式行用 `style`。（竖屏 `marginV` = 1920 − (1330 + 40 + 30) = 520。）

事件循环：横屏分支保持原样；竖屏每页一条事件，时间按字数比例切分：

```js
  for (const shot of timeline.shots) {
    for (const s of shot.sentenceRanges) {
      const kw = anchors.get(s.key);
      const mark = (text) => (kw && text.includes(kw) ? text.replace(kw, `{\\c&HA3A520&}${kw}{\\r}`) : text);
      if (!portrait) {
        // 原来的那一行 lines.push(…) 保持不变，text 用 mark(s.text)
        continue;
      }
      const pages = subtitlePages(s.text, { maxChars: S.maxChars, maxLines: S.maxLines });
      const sizes = pages.map((pg) => [...pg.join('')].length);
      const total = sizes.reduce((a, b) => a + b, 0) || 1;
      let acc = 0;
      pages.forEach((pg, i) => {
        const start = s.startMs + ((s.endMs - s.startMs) * acc) / total;
        acc += sizes[i];
        const end = s.startMs + ((s.endMs - s.startMs) * acc) / total;
        lines.push(`Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${pg.map(mark).join('\\N')}`);
      });
    }
  }
```

改的时候先看清原循环里事件行的确切写法（变量名 `lines` 或其他、`Dialogue:` 的字段），横屏那一行一个字符都不要动。

- [ ] **Step 6: 确认测试通过、金样不变**

Run: `node --test tests/portrait-subtitles.test.mjs tests/golden.test.mjs tests/render-core.test.mjs tests/scene-encode.test.mjs tests/captions.test.mjs`
Expected: 全部 PASS。

- [ ] **Step 7: 跑全部测试并提交**

Run: `npm test`
Expected: 全部 PASS。

```bash
git add skills/topic-to-video/scripts/lib/timing.mjs skills/topic-to-video/scripts/lib/scene.mjs skills/topic-to-video/scripts/lib/encode.mjs tests/portrait-subtitles.test.mjs
git commit -m "feat(captions): page portrait subtitles in two 12-character lines and write a portrait ASS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 出片管道与 QA

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/scene.mjs`（`shotCacheKey`；新增 `portraitLayoutIssues`）
- Modify: `skills/topic-to-video/scripts/lib/encode.mjs`（`makeTextRasterizer`、`renderSingleRgba`、`renderShotToMp4`、`renderProject`）
- Modify: `skills/topic-to-video/scripts/lib/qa.mjs`（`generateContactSheet`、`generateTransitionStrip`、`runQa`）
- Modify: `skills/topic-to-video/scripts/lib/sound.mjs`（`panGains`、`renderSfxStem`）、`skills/topic-to-video/scripts/lib/music.mjs`（`buildSoundtrack`）
- Modify: `skills/topic-to-video/scripts/render.mjs`（`parseArgs`、`main`、用法注释）
- Test: `tests/portrait-render.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `frameFor`、`isPortrait`、`outputSubdir`、`sizeFor`、`textOutsideSafe`；Task 4 的 `buildShotPlans(…, { frame })`；Task 7 的 `buildSubtitlesAss(…, frame)`
- Produces:
  - `parseArgs` 认 `--ratio <16:9|9:16>`，写进 `opts.ratio`
  - `renderProject(projectDir, opts)` 的返回值多 `outDir`、`frame`、`layoutIssues`
  - `portraitLayoutIssues(manifest, plans, { fps = 60, step = 6 } = {}) -> Array<{ code: 'STAGE_CROWDED' | 'SAFE_ZONE_TEXT', shotId, frames?, keys?, message }>`；横屏计划返回 `[]`
  - `runQa(projectDir, { …原参数, outDir, frame, expectedSize, layoutIssues = [] })`
  - `panGains(x, frameWidth = 1920)`；`renderSfxStem(events, totalSamples, { …原参数, frameWidth = 1920 })`
  - `shotCacheKey`：16:9 计划的键不变；其他画幅在键里加 `ratio`

- [ ] **Step 1: 写失败测试 `tests/portrait-render.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderProject } from '../skills/topic-to-video/scripts/lib/encode.mjs';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { makeWavBuffer } from '../skills/topic-to-video/scripts/lib/mouth.mjs';
import { runQa } from '../skills/topic-to-video/scripts/lib/qa.mjs';
import { buildShotPlans, portraitLayoutIssues, shotCacheKey } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { panGains } from '../skills/topic-to-video/scripts/lib/sound.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { parseArgs } from '../skills/topic-to-video/scripts/render.mjs';
import { fakeTiming, manifest, sceneTour } from './helpers/golden.mjs';
import { pngSize } from './helpers/png.mjs';

const plansOf = (p, frame) => buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest, frame ? { frame } : undefined);

test('parseArgs reads --ratio', () => {
  assert.equal(parseArgs(['proj', '--ratio', '9:16', '--preview']).ratio, '9:16');
  assert.equal(parseArgs(['proj']).ratio, undefined);
});

test('16:9 cache keys do not change; portrait keys differ', () => {
  const p = sceneTour();
  const land = plansOf(p);
  const explicit = plansOf(p, FRAMES['16:9']);
  const port = plansOf(p, FRAMES['9:16']);
  const key = (pl, w, h) => shotCacheKey(pl, { fps: 60, width: w, height: h, motionBlur: false });
  land.forEach((pl, i) => {
    assert.equal(key(pl, 1920, 1080), key(explicit[i], 1920, 1080));
    assert.notEqual(key(pl, 1920, 1080), key(port[i], 1080, 1920));
  });
});

test('panGains is proportional to the frame width', () => {
  assert.deepEqual(panGains(540, 1080), [1, 1]);
  assert.deepEqual(panGains(1080, 1080), panGains(1920));
  assert.deepEqual(panGains(960), [1, 1]);
});

test('portraitLayoutIssues flags crowded stages and text outside the safe box, nothing in landscape', () => {
  const p = sceneTour();
  p.shots[0].visual.data.objects = ['fridge', 'box', 'shop', 'table', 'chair'].map((prop) => ({ prop }));
  p.shots[0].cues = [];
  p.shots[1].visual.data.heading = '一个特别特别特别长的竖屏标题文字';
  const issues = portraitLayoutIssues(manifest, plansOf(p, FRAMES['9:16']));
  assert.ok(issues.some((i) => i.code === 'STAGE_CROWDED' && i.shotId === 'sh01'));
  assert.ok(issues.some((i) => i.code === 'SAFE_ZONE_TEXT' && i.shotId === 'sh02'));
  assert.deepEqual(portraitLayoutIssues(manifest, plansOf(p)), []);
});

test('--ratio 9:16 on a 16:9 project renders 540×960 into out/9x16 with a portrait cover, ASS and safe sheet', async (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg unavailable');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'svs-portrait-'));
  try {
    const p = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));
    p.voice = { provider: 'import' };
    mkdirSync(join(dir, 'audio'), { recursive: true });
    for (const key of ['s01-0', 's01-1']) {
      const sr = 48000;
      const samples = new Int16Array(Math.round(sr * 0.6));
      for (let i = 2000; i < samples.length - 2000; i += 1) samples[i] = Math.round(9000 * Math.sin((2 * Math.PI * 330 * i) / sr));
      writeFileSync(join(dir, `audio/${key}.wav`), makeWavBuffer(samples, sr));
    }
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));
    const res = await renderProject(dir, { preview: true, ratio: '9:16', workers: 2 });
    assert.equal(res.outDir, join(dir, 'out/9x16'));
    assert.ok(res.videoPath.endsWith(join('out', '9x16', 'preview.mp4')));
    assert.ok(!existsSync(join(dir, 'out/preview.mp4')), 'landscape location untouched');
    const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', res.videoPath], { encoding: 'utf8' }).stdout);
    const v = probe.streams.find((s) => s.codec_type === 'video');
    assert.deepEqual([v.width, v.height], [540, 960]);
    assert.deepEqual(pngSize(readFileSync(join(res.outDir, 'cover.png'))), { width: 1080, height: 1920 });
    assert.match(readFileSync(join(res.outDir, 'captions.ass'), 'utf8'), /PlayResX: 1080/);
    const qa = await runQa(dir, {
      videoPath: res.videoPath, outDir: res.outDir, frame: res.frame, expectedSize: { width: res.width, height: res.height },
      expectedFps: res.fps, timeline: res.timeline, shotPlans: res.shotPlans, qaByShot: res.qaByShot, audio: res.audio, layoutIssues: res.layoutIssues,
    });
    assert.ok(!qa.issues.some((i) => i.code === 'SIZE_MISMATCH'));
    assert.ok(existsSync(join(res.outDir, 'contact.png')) && existsSync(join(res.outDir, 'contact-safe.png')));
    assert.match(readFileSync(join(res.outDir, 'qa.md'), 'utf8'), /真机遮挡：`not_checked`/);
    const wrong = await runQa(dir, { videoPath: res.videoPath, outDir: res.outDir, frame: res.frame, expectedSize: { width: 1080, height: 1920 }, expectedFps: res.fps, timeline: res.timeline, shotPlans: res.shotPlans });
    assert.ok(wrong.issues.some((i) => i.code === 'SIZE_MISMATCH'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 确认测试失败**

Run: `node --test tests/portrait-render.test.mjs`
Expected: FAIL（`portraitLayoutIssues` 未导出、`parseArgs` 不认 `--ratio` 等）。

- [ ] **Step 3: `scene.mjs`：缓存键与排版问题扫描**

frame 导入补 `textOutsideSafe`。`shotCacheKey` 的 JSON 对象在 `motionBlur,` 之后加一行（放在最后，16:9 时展开为空，JSON 字符串不变）：

```js
    ...(shotPlan.frame && shotPlan.frame.ratio !== '16:9' ? { ratio: shotPlan.frame.ratio } : {}),
```

文件末尾加：

```js
/** Portrait-only layout problems (竖屏设计 §7.1): crowded stages and text leaving the safe box on sampled frames. */
export function portraitLayoutIssues(manifest, plans, { fps = 60, step = 6 } = {}) {
  const issues = [];
  for (const plan of plans) {
    const frame = plan.frame ?? LANDSCAPE;
    if (!isPortrait(frame)) continue;
    if (plan.stageLayout?.crowded) {
      issues.push({ code: 'STAGE_CROWDED', shotId: plan.id, message: `竖屏镜头 ${plan.id} 的同台物件缩到 0.6 倍仍排不下；减少物件或拆成两个镜头` });
    }
    let frames = 0;
    const keys = new Set();
    for (let f = 0; f < plan.frameCount; f += step) {
      const out = textOutsideSafe(evaluateFrame(manifest, plan, f / fps).textItems, frame);
      if (out.length) {
        frames += 1;
        out.forEach((k) => keys.add(k));
      }
    }
    if (frames) {
      const list = [...keys];
      issues.push({ code: 'SAFE_ZONE_TEXT', shotId: plan.id, frames, keys: list.slice(0, 5), message: `竖屏镜头 ${plan.id} 有 ${frames} 个抽样帧的文字超出安全框（${list.slice(0, 3).join('、')}）` });
    }
  }
  return issues;
}
```

- [ ] **Step 4: `encode.mjs`：尺寸、目录、光栅、封面**

import 区：`import { buildShotPlans, evaluateFrame, portraitLayoutIssues, shotCacheKey } from './scene.mjs';`，`import { FRAMES, frameFor, isPortrait, outputSubdir, sizeFor } from './frame.mjs';`（Task 7 已引入部分，合并成一行）。

`makeTextRasterizer(Resvg, scale)` → `makeTextRasterizer(Resvg, scale, maxWidth = 1920)`，`Math.min(Math.round(1920 * scale), …)` → `Math.min(Math.round(maxWidth * scale), …)`。

`renderSingleRgba`：`const scale = width / 1920;` → `const scale = width / (shotPlan.frame?.width ?? 1920);`。

`renderShotToMp4`：`const rasterText = makeTextRasterizer(Resvg, width / 1920);` 换成：

```js
  const fw = shotPlan.frame?.width ?? 1920;
  const rasterText = makeTextRasterizer(Resvg, width / fw, fw);
```

`renderProject`：读完 `project` 后：

```js
  const projectRatio = project.settings?.ratio ?? '16:9';
  const ratio = opts.ratio ?? projectRatio;
  const frame = frameFor(ratio);
  const resKey = opts.preview ? 'preview' : (opts.resolution ?? project.settings?.resolution ?? '1080p');
  const spec = RESOLUTIONS[resKey] ?? RESOLUTIONS['1080p'];
  const fps = opts.preview ? 30 : (opts.fps ?? project.settings?.fps ?? spec.fps);
  const { width, height } = sizeFor(spec, frame);
  const { crf } = spec;
```

（删掉原来的 `const { width, height, crf } = spec;`。）`buildShotPlans(project, timeline, manifest)` → `buildShotPlans(project, timeline, manifest, { frame })`；`const outDir = join(projectDir, 'out');` → `const outDir = join(projectDir, 'out', outputSubdir(projectRatio, ratio));`；`buildSubtitlesAss(project, timeline)` → `buildSubtitlesAss(project, timeline, frame)`。

封面一段：

```js
  // Cover PNG from shot 0 at t = 0.6s, at the frame's logical size (1920×1080 or 1080×1920)
  const { Resvg } = await import('@resvg/resvg-js');
  const coverPlan = allPlans[0];
  const coverFrame = evaluateFrame(manifest, coverPlan, Math.min(0.6, coverPlan.durationSec * 0.5));
  const rasterCoverText = makeTextRasterizer(Resvg, 1, frame.width);
  const coverBase = new Resvg(coverFrame.vectorSvg, { fitTo: { mode: 'width', value: frame.width }, font: { loadSystemFonts: false } }).render();
  const coverRgba = Buffer.from(coverBase.pixels);
  for (const item of coverFrame.textItems) {
    if (item.key?.startsWith('sub-')) continue;
    const bmp = rasterCoverText(item);
    alphaBlit(coverRgba, frame.width, frame.height, bmp.pixels, bmp.width, bmp.height, item.x - bmp.anchorX, item.y - bmp.anchorY, item.opacity ?? 1);
  }
  const coverRaw = join(cacheDir, 'cover.rgba');
  writeFileSync(coverRaw, coverRgba);
  spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${frame.width}x${frame.height}`, '-i', coverRaw, '-frames:v', '1', join(outDir, 'cover.png')]);
```

返回对象加 `outDir, frame, layoutIssues: portraitLayoutIssues(manifest, selectedPlans, { fps }),`。

- [ ] **Step 5: `sound.mjs`、`music.mjs`：声像**

```js
/** Equal-power pan scaled so the centre is unity on both channels; x is a screen coordinate on a `frameWidth`-wide frame. */
export function panGains(x, frameWidth = 1920) {
  if (x === null || x === undefined || !Number.isFinite(x)) return [1, 1];
  const pan = Math.max(-0.3, Math.min(0.3, (x / frameWidth - 0.5) * 0.6));
```

`renderSfxStem` 的选项加 `frameWidth = 1920`，`panGains(ev.x)` → `panGains(ev.x, frameWidth)`。`music.mjs` 的 `buildSoundtrack` 里 `renderSfxStem(events, totalSamples, { voiceRefDb, intervals, seed: project.title })` 加 `frameWidth: selectedPlans[0]?.frame?.width ?? 1920`。

- [ ] **Step 6: `qa.mjs`：目录、尺寸、排版问题、联系表**

import 区加 `import { relative } from 'node:path';`（与已有 `join` 合并）、`import { FRAMES, isPortrait } from './frame.mjs';`。

联系表和转场条：

```js
function generateContactSheet(videoPath, outPng, durationSec, ffmpeg = 'ffmpeg', frame = FRAMES['16:9'], safeBox = false) {
  const interval = Math.max(0.05, durationSec / 12);
  const portrait = isPortrait(frame);
  const [tw, th] = portrait ? [180, 320] : [480, 270];
  const k = tw / frame.width;
  const s = frame.textSafe;
  const box = safeBox ? `,drawbox=x=${Math.round(s.x * k)}:y=${Math.round(s.y * k)}:w=${Math.round(s.w * k)}:h=${Math.round(s.h * k)}:color=red@0.8:t=2` : '';
  spawnSync(ffmpeg, [
    '-y', '-loglevel', 'error', '-i', videoPath,
    '-vf', `fps=1/${interval.toFixed(4)},scale=${tw}:${th}${box},tile=${portrait ? '6x2' : '4x3'}:padding=8:margin=8:color=0xfbfaf6`,
    '-frames:v', '1', outPng,
  ]);
}
```

`generateTransitionStrip` 加参数 `frame = FRAMES['16:9']`，`scale=320:180` → `` scale=${isPortrait(frame) ? '180:320' : '320:180'} ``。

`runQa` 参数表加 `outDir = join(projectDir, 'out'), frame = null, expectedSize = null, layoutIssues = [],`；删掉函数体里的 `const outDir = join(projectDir, 'out');`；读完 `project` 后加 `const fr = frame ?? FRAMES[project.settings?.ratio] ?? FRAMES['16:9'];`。帧率检查之后加：

```js
  if (v && expectedSize && (v.width !== expectedSize.width || v.height !== expectedSize.height)) {
    issues.push({ code: 'SIZE_MISMATCH', message: `成片是 ${v.width}×${v.height}，期望 ${expectedSize.width}×${expectedSize.height}` });
  }
```

在"Host occlusion & rushed moves"循环之后加 `issues.push(...layoutIssues);`。联系表调用：

```js
  generateContactSheet(videoPath, join(outDir, 'contact.png'), durSec, ffmpeg, fr);
  if (isPortrait(fr)) generateContactSheet(videoPath, join(outDir, 'contact-safe.png'), durSec, ffmpeg, fr, true);
  generateTransitionStrip(videoPath, join(outDir, 'transitions.png'), cutFrames, fps, ffmpeg, fr);
```

`qa.md` 的人工复核项：把 `'- 画面审美与排版平衡：`not_checked`（请看 `out/contact.png`、`out/transitions.png`）',` 换成下面两段（横屏时 `rel` 是 `out`，文字不变）：

```js
    `- 画面审美与排版平衡：\`not_checked\`（请看 \`${rel}/contact.png\`、\`${rel}/transitions.png\`）`,
    ...(isPortrait(fr) ? [`- 真机遮挡：\`not_checked\`（文字安全框 x ${fr.textSafe.x}–${fr.textSafe.x + fr.textSafe.w}、y ${fr.textSafe.y}–${fr.textSafe.y + fr.textSafe.h} 是第三方估算，见 \`${rel}/contact-safe.png\`；上传前设为仅自己可见，在抖音、TikTok、Shorts 预览一次）`] : []),
```

并在 `const md = [` 之前定义 `const rel = relative(projectDir, outDir).split('\\').join('/') || 'out';`。

- [ ] **Step 7: `render.mjs`**

用法注释加 `[--ratio 16:9|9:16]`。`parseArgs` 加 `else if (a === '--ratio') opts.ratio = argv[++i];`。`main` 里的 `runQa` 调用加：

```js
        outDir: result.outDir,
        frame: result.frame,
        expectedSize: { width: result.width, height: result.height },
        layoutIssues: result.layoutIssues,
```

打印对象里 `resolution` 后加 `ratio: result.frame.ratio,`。

- [ ] **Step 8: 确认测试通过、金样不变**

Run: `node --test tests/portrait-render.test.mjs tests/golden.test.mjs tests/scene-encode.test.mjs tests/qa.test.mjs tests/sound.test.mjs tests/music.test.mjs`
Expected: 全部 PASS（没有 FFmpeg 时冒烟测试显示 skip）。

- [ ] **Step 9: 跑全部测试并提交**

Run: `npm test`
Expected: 全部 PASS。

```bash
git add skills/topic-to-video/scripts/lib/scene.mjs skills/topic-to-video/scripts/lib/encode.mjs skills/topic-to-video/scripts/lib/qa.mjs skills/topic-to-video/scripts/lib/sound.mjs skills/topic-to-video/scripts/lib/music.mjs skills/topic-to-video/scripts/render.mjs tests/portrait-render.test.mjs
git commit -m "feat(render): --ratio 9:16 renders portrait into out/9x16 with safe-zone QA and a portrait contact sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: L0 自检与文档

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/match.mjs`（`lintStoryboard` 加 `PORTRAIT_CROWDED`）
- Modify: `skills/topic-to-video/SKILL.md`、`references/providers.md`、`references/storyboard.md`
- Modify: `README.md`、`README.en.md`
- Modify: `tests/readme.test.mjs`
- Test: `tests/portrait-lint.test.mjs`

**Interfaces:**
- Consumes: 现有的 `PROP_META`、`customPropMeta`（`icons.mjs`）
- Produces: 警告 `{ path: '/shots/<i>/visual/data/objects', code: 'PORTRAIT_CROWDED', message }`，只在 `settings.ratio === '9:16'` 时出现

- [ ] **Step 1: 写失败测试 `tests/portrait-lint.test.mjs`，并在 `tests/readme.test.mjs` 末尾追加一条**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintStoryboard } from '../skills/topic-to-video/scripts/lib/match.mjs';
import { sceneTour } from './helpers/golden.mjs';

const crowded = (ratio) => {
  const p = sceneTour();
  p.settings.ratio = ratio;
  p.shots[0].visual.data.objects = [{ prop: 'fridge' }, { prop: 'box' }, { prop: 'shop' }, { prop: 'table' }];
  p.shots[1].visual.data.objects = [{ prop: 'cloud', layer: 'air' }, { prop: 'plane', layer: 'air' }, { prop: 'rocket', layer: 'air' }];
  return lintStoryboard(p).filter((w) => w.code === 'PORTRAIT_CROWDED');
};

test('PORTRAIT_CROWDED warns about more than 3 lower or 2 air objects in 9:16 projects only', () => {
  const warns = crowded('9:16');
  assert.deepEqual(warns.map((w) => w.path), ['/shots/0/visual/data/objects', '/shots/1/visual/data/objects']);
  assert.match(warns[0].message, /地面和中间层有 4 件/);
  assert.deepEqual(crowded('16:9'), []);
});
```

`tests/readme.test.mjs` 追加：

```js
test('both READMEs describe native portrait output with --ratio 9:16', () => {
  for (const name of ['README.md', 'README.en.md']) {
    const text = readFileSync(join(import.meta.dirname, '..', name), 'utf8');
    assert.ok(text.includes('--ratio 9:16') && text.includes('1080×1920'), name);
  }
});
```

（如果 `readme.test.mjs` 读文件的方式不同，照文件里已有测试的写法改。）

- [ ] **Step 2: 确认测试失败**

Run: `node --test tests/portrait-lint.test.mjs tests/readme.test.mjs`
Expected: 两条新测试 FAIL。

- [ ] **Step 3: 在 `lintStoryboard` 加 `PORTRAIT_CROWDED`**

`match.mjs` import 区加 `import { customPropMeta, PROP_META } from './icons.mjs';`。`lintStoryboard` 里 `project.shots.forEach((shot, i) => {` 的循环体开头（`const said = …` 之前）加：

```js
    if (project.settings?.ratio === '9:16' && shot.layout === 'stage') {
      const custom = new Map((project.world?.custom_props ?? []).map((c) => [c.id, c]));
      const layerOf = (o) => (['ground', 'mid', 'air'].includes(o.layer) ? o.layer
        : PROP_META[o.prop]?.layer ?? (custom.has(o.prop) ? customPropMeta(custom.get(o.prop)).layer : 'ground'));
      const objects = shot.visual?.data?.objects ?? [];
      const air = objects.filter((o) => layerOf(o) === 'air').length;
      const lower = objects.length - air;
      if (lower > 3 || air > 2) {
        warnings.push({ path: `/shots/${i}/visual/data/objects`, code: 'PORTRAIT_CROWDED', message: `竖屏镜头 ${shot.id} 地面和中间层有 ${lower} 件、空中 ${air} 件；竖屏最多地面 3 件、空中 2 件，减少物件或拆成两个镜头（见 storyboard.md）` });
      }
    }
```

- [ ] **Step 4: 改文档**

`SKILL.md` 第 9 行（L1 那条）把 `输出 1080p60/4K \`out/final.mp4\`` 改成 `输出 1080p60/4K \`out/final.mp4\`（横屏或 1080×1920 竖屏）`；第 19 行默认值里的比例一条换成：

```markdown
   - 比例 16:9（也可以用 9:16：提示词包按竖屏构图，L1 直接出 1080×1920 竖屏；同一项目还能用 `--ratio` 再出另一种，见 [providers.md](references/providers.md)）
```

`references/providers.md` §3 的可选参数列表在 `--resolution` 那行之前加：

```
#   --ratio 9:16|16:9          换画幅出片：竖屏 1080×1920（预览 540×960）；和 settings.ratio 不同时写到 out/9x16/ 或 out/16x9/
```

文件末尾加一节：

```markdown
## 6. 竖屏（9:16）

- `settings.ratio` 是 9:16 时直接出竖屏；横屏项目加 `--ratio 9:16` 再出一版，写到 `out/9x16/`，配音、音效和音乐共用，不重新合成。
- 标题、物件标签和字幕都留在文字安全框（x 64–910、y 250–1440）里，避开抖音、TikTok、Shorts 的标题栏、点赞栏和文案区；超出时 QA 报 `SAFE_ZONE_TEXT`，同台排不下报 `STAGE_CROWDED`。
- 安全框是第三方估算，`qa.md` 里"真机遮挡"一项标 `not_checked`：请用户上传前设为仅自己可见，在 App 里预览一次；`contact-safe.png` 在联系表上画出了安全框。
```

`references/storyboard.md` 在 `- \`stage\` 镜头需有互动 cue 或 \`tap\`，…` 那一行之后加一行：

```markdown
- 竖屏（9:16）同台镜头地面层加中间层最多 3 件、空中最多 2 件，否则报 `PORTRAIT_CROWDED`。
```

`README.md` 表格 L1 那一行，在 `` `--audition-sound` 可以先试听 `` 之后加：`；\`--ratio 9:16\` 出原生 1080×1920 竖屏，文字避开抖音、TikTok、Shorts 的界面遮挡`。`README.en.md` 对应位置加：`; \`--ratio 9:16\` renders native 1080×1920 portrait with text kept clear of the Douyin, TikTok and Shorts overlays`。

- [ ] **Step 5: 确认测试通过**

Run: `node --test tests/portrait-lint.test.mjs tests/readme.test.mjs tests/references.test.mjs tests/budget.test.mjs tests/links.test.mjs tests/check-cli.test.mjs`
Expected: 全部 PASS。`budget.test.mjs` 若报 `storyboard.md` 超过 10 KB，把新加的那一行缩短（例如去掉"（9:16）"），不要删别的内容。

- [ ] **Step 6: 跑全部测试并提交**

Run: `npm test`
Expected: 全部 PASS。

```bash
git add skills/topic-to-video/scripts/lib/match.mjs skills/topic-to-video/SKILL.md skills/topic-to-video/references/providers.md skills/topic-to-video/references/storyboard.md README.md README.en.md tests/portrait-lint.test.mjs tests/readme.test.mjs
git commit -m "docs: document native portrait output and warn about crowded portrait stages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 验收出片

**Files:**
- 不改代码；只生成本地文件到 `examples/cache-speed/out/`（已被 `.gitignore` 忽略，不提交）
- Modify: `docs/lite/竖屏设计.md`（验收结论）

这一步需要 FFmpeg、`@resvg/resvg-js` 和 edge-tts（或 uvx）。出片不调用付费服务。

- [ ] **Step 1: 环境自检**

Run: `node skills/topic-to-video/scripts/doctor.mjs`
Expected: `l1_ready: true`。不是 true 时停下，告诉 owner 缺什么，不要安装重型依赖。

- [ ] **Step 2: 出竖屏预览和成片**

```bash
node skills/topic-to-video/scripts/render.mjs examples/cache-speed --ratio 9:16 --preview
node skills/topic-to-video/scripts/render.mjs examples/cache-speed --ratio 9:16
```

Expected: 两次都 `ok: true`、`ratio: "9:16"`；成片在 `examples/cache-speed/out/9x16/final.mp4`；`qa.ok` 为 true。`qa.md` 里有 `SAFE_ZONE_TEXT` 或 `STAGE_CROWDED` 时，记下镜头，回到对应任务调几何或模板，不改示例的分镜来"过关"。

- [ ] **Step 3: 出 8 个场景的竖屏样帧**

用 `tests/helpers/golden.mjs` 的 `sceneTour()` 写一个一次性脚本（放 `out/review/portrait/`，不提交）：对 8 个同台镜头各取镜头中点一帧，用 `@resvg/resvg-js` 按 1080 宽光栅化成 PNG。

- [ ] **Step 4: 请 owner 验收**

把这些路径交给 owner：`examples/cache-speed/out/9x16/contact-safe.png`、`out/9x16/preview.mp4`、`out/9x16/final.mp4`、`out/review/portrait/*.png`。请 owner 看构图，并可选地把竖屏片设为仅自己可见，在抖音、TikTok、Shorts 各预览一次字幕是否被挡。owner 指出的问题按所在任务修，修完重跑 `npm test` 和 Step 2。

- [ ] **Step 5: 记录结论并提交**

owner 确认后，把 `docs/lite/竖屏设计.md` 的状态改成 `- 状态：B 已完成，owner 看竖屏样片验收通过（<日期>）；实施计划在合并前按 \`AGENTS.md\` 移除，见 git 历史`。真机预览做了就写上结果；没做就写"真机遮挡未检查"。

```bash
git add docs/lite/竖屏设计.md
git commit -m "docs(lite): mark B accepted after the owner reviewed the portrait sample

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
