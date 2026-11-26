# S 画面与主题世界实施计划（批次 1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每期视频有自己的视觉世界（比喻、5 套风格包、8 个手绘场景、60 个带比例/锚点/状态的内置物件与结构化自定义道具），新增 `stage` 同台舞台版式以及 `timeline`、`cycle` 两个模板，使两个不同主题的样片一眼看出不同，又认得出是小青的同一个节目。

**Architecture:** 新增 `world.mjs`（风格包色板、纸面、8 个场景）和 `stage.mjs`（`stage` 语义自动排版与舞台渲染），把 60 个内置物件元数据、状态画法和自定义道具白名单渲染扩进现有的 `icons.mjs`（保持原 24 个图标向后兼容）。`templates.mjs` 统一改用风格包色键并加入 `timeline`/`cycle`；`scene.mjs` 和 `motion.mjs` 接入 `stage` 版式、场景层、版式衔接与缓存键；`project.mjs`、`match.mjs`、`docs.mjs`、`qa.mjs` 补齐自检与遮挡检查；新增 `references/world.md` 承接 L0 视觉世界规范，保证 `storyboard.md` 留在 10 KB 以内。

**Tech Stack:** Node ≥ 20（ESM，`node --test`）、`@resvg/resvg-js`（开发依赖，用于导出速查表和渲染）；Ajv 只在测试里校验 schema。

**Spec:** [画面与同台互动设计](画面与同台互动设计.md)（批次 1，展开 [个性化路线图](个性化路线图.md) §6.3）

## Global Constraints

- skill 目录保持在 45 个文件、5 MB 以内（本批次新增 `scripts/lib/world.mjs`、`scripts/lib/stage.mjs`、`references/world.md`，共 33 → 36 个文件）；运行时 npm 依赖仍最多 1 个；不加任何图片文件。
- `SKILL.md` 不超过 150 行、8 KB；每份 reference 不超过 250 行、10 KB；一次 L0 读取合计不超过 100 KB；描述前 60 字说清用途。
- 只做向后兼容的新增：`project.json` 的 `version` 仍为 1；不写 `world` 的旧项目自检和渲染结果不变；`rights.json` 的 `usage` 不动。
- 地面线统一为 `GROUND_Y = 930`，小青身高 `H = 400 px`，字幕中心 `y = 1012`（y 950 以下禁止物件和标签进入）。
- 风格包语义色键固定为：`paper`、`grid`、`ink`、`muted`、`card`、`accent`、`yellow`、`red`、`soft_accent`、`soft_yellow`、`soft_red`；`paper` 与 `night` 色值与原 `THEME_PALETTE.light` / `.dark` 完全一致；不用细颗粒噪点纹理。
- `SKILL.md` 和 `references/` 用中文；`README.md` 与 `README.en.md` 同步；`AGENTS.md` 保持英文。
- 先写失败测试，再写最小实现，每个任务结束跑通 `npm test` 并提交到分支 `lite/stage-world`；不提交 `.DS_Store`，不 push。

## Review Focus

1. 深底风格包（`chalkboard`、`blueprint`、`night`）下小青、物件和图解必须用浅色墨线，不能出现黑色描边，且小青的青色围巾保持亮青。→ Task 1、Task 2、Task 6 测试。
2. 自定义道具（`world.custom_props`）遇到超界坐标、`NaN`、超过 12 个图元、超过 4 件、与内置重名或试图塞入 `<script>`/`<text>` 时，校验报 `CUSTOM_PROP_INVALID`，渲染器截断数值且不输出白名单外标签。→ Task 2、Task 5 测试。
3. 不带 `world` 的旧项目必须照常通过自检并保持原画面不变；但如果没写 `world` 却写了 `layout: "stage"`，必须报 `STAGE_NEEDS_WORLD`。→ Task 5、Task 6 测试。
4. 舞台塞满 5 个大物件时，`layoutStage` 先同层推开（间隔 ≥ 40 px）、再整体等比缩小（最低 0.6），仍放不下时报错 `STAGE_CROWDED`，任何合法排版都不能把物件压进字幕区（y ≥ 950）或吃掉小青的 200 px 站位。→ Task 4、Task 5 测试。
5. `stage` 与 `host-left` 切换时小青脚踩同一条地面线且保持水平位置连续；`stage` 与 `full` 切换时走入/走出；修改 `world.style`、`shot.scene` 或 `custom_props` 必须使 `shotCacheKey` 变化，避免复用旧缓存。→ Task 6 测试。

---

## 文件地图

| 文件 | 动作 | 职责 | 任务 |
| --- | --- | --- | --- |
| `skills/topic-to-video/scripts/lib/world.mjs` | Create | 5 套风格包色板、纸面背景、8 个手绘场景背景、`GROUND_Y` | 1 |
| `skills/topic-to-video/scripts/lib/icons.mjs` | Modify | 60 个内置物件画法/元数据/专属与通用状态、自定义道具校验与绘制 | 2 |
| `tools/export-props.mjs`、`package.json` | Create / Modify | 导出 60 物件速查表到 `out/review/props-cheatsheet.png`（开发工具，不在 skill 内） | 2 |
| `skills/topic-to-video/scripts/lib/templates.mjs` | Modify | 接入风格包色键；新增 `timeline`、`cycle` 模板 | 1、3 |
| `skills/topic-to-video/scripts/lib/stage.mjs` | Create | `stage` 语义自动排版（`layoutStage`）与舞台/连线/标签渲染（`renderStage`） | 4 |
| `skills/topic-to-video/schema/project.schema.json` | Modify | 顶层 `world`、60 图标枚举、`stage`/`timeline`/`cycle`、`shot.scene`、`host.at` | 5 |
| `skills/topic-to-video/scripts/lib/project.mjs`、`match.mjs`、`docs.mjs` | Modify | 批次 1 自检错误码、关键词提取、`stage` 表演警告、`分镜.md` 视觉世界核对 | 5 |
| `skills/topic-to-video/scripts/lib/scene.mjs`、`motion.mjs`、`rig.mjs`、`encode.mjs`、`qa.mjs` | Modify | 舞台渲染管线、深底风格小青墨线、版式切换、缓存键、`HOST_OBJECT_OVERLAP` | 6 |
| `skills/topic-to-video/references/world.md` | Create | 视觉世界、风格包/场景推荐、60 物件分组与状态表、自定义道具、`stage` 写法（≤10 KB） | 7 |
| `skills/topic-to-video/SKILL.md`、`references/storyboard.md`、`references/prompt-pack.md`、`README.md`、`README.en.md`、`site/index.html` | Modify | L0 步骤加"定视觉世界"、链接 `world.md`、提示词加风格与场景、同步站内说明 | 7 |
| `tests/world.test.mjs`、`tests/stage.test.mjs` | Create | 风格包、场景、60 物件、自定义道具、舞台排版与渲染、QA 遮挡测试 | 1、2、4、6 |
| `tests/fixtures/world-cache.json`、`tests/fixtures/world-flight.json` | Create | 两个不同主题的批次 1 回归夹具与 540p 预览验收样本 | 8 |

---

### Task 1: 风格包与 8 个手绘场景（`world.mjs`）

**Files:**
- Create: `skills/topic-to-video/scripts/lib/world.mjs`
- Modify: `skills/topic-to-video/scripts/lib/templates.mjs:12-56`
- Test: `tests/world.test.mjs`（新建）

**Interfaces:**
- Consumes: `inkStroke`, `markerFill`, `circlePoints`, `num` from `./ink.mjs`
- Produces:
  - `GROUND_Y = 930`
  - `STYLE_NAMES = ['paper', 'chalkboard', 'blueprint', 'kraft', 'night']`
  - `SCENE_NAMES = ['blank', 'podium', 'kitchen', 'street', 'lab', 'office', 'outdoor', 'workshop']`
  - `STYLE_PALETTES`: 每套含 `paper, grid, ink, muted, card, accent, yellow, red, soft_accent, soft_yellow, soft_red, textStroke, isDark` 及兼容别名 `teal, softTeal, softYellow, softRed`
  - `resolveStyle(input)` -> `{ name, palette }`（接受风格名、`'light'|'dark'`、或整个 `project` 对象；无 `world.style` 时按 `theme` 映射到 `paper`/`night`）
  - `styleBackgroundSvg(styleName, width = 1920, height = 1080, parallax = [0, 0]) -> string`
  - `sceneBackgroundSvg(sceneName, { style = 'paper', width = 1920, height = 1080, seed = 'scene', ground = GROUND_Y } = {}) -> string`

- [ ] **Step 1: 写失败测试 `tests/world.test.mjs`**

测试以下断言：
1. `STYLE_NAMES` 恰为 5 套；每套 `STYLE_PALETTES[name]` 都包含 11 个语义色键和布尔值 `isDark`；`paper` 的颜色与原 `THEME_PALETTE.light` 完全相等，`night` 与 `THEME_PALETTE.dark` 完全相等；深底风格（`chalkboard`、`blueprint`、`night`）的 `isDark === true` 且 `ink` 不是 `#1f1f1f`。
2. `styleBackgroundSvg` 对 5 套风格都确定性输出纯向量 SVG（无 `<text>`、无 `<filter>` 噪点），支持视差偏移，未知风格抛错。
3. `SCENE_NAMES` 恰为 8 个；每个 `sceneBackgroundSvg(name, { style, seed: 'sh01' })` 都输出带 `data-scene="${name}"` 的 `<g>`，无 `<text>`，包含 `y = 930` 地面线，所有绘制坐标都不低于 `y = 935`（不越过地面线进入字幕区），且除地面线外不把大块形状画进中央表演区 `x 560..1360, y 360..920`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/world.test.mjs`
Expected: FAIL（`ERR_MODULE_NOT_FOUND` 找不到 `world.mjs`）。

- [ ] **Step 3: 实现 `world.mjs` 并让 `templates.mjs` 复用色板**

在 `skills/topic-to-video/scripts/lib/world.mjs` 实现上述导出：
- `paper`/`night` 直接复用原 `THEME_PALETTE.light`/`dark` 色值；`chalkboard` 用深墨绿 `#1d3328` + 粉笔白 `#f3f1e8` + 淡擦痕；`blueprint` 用工程蓝 `#143252` + 浅蓝白 `#eaf3ff` + 48/192 双网格；`kraft` 用牛皮纸 `#e8d5b7` + 深棕 `#3b2818` + 淡纤维长线。
- 8 个场景用低透明度（`opacity="0.26"`）`inkStroke` 勾勒两侧与上方轮廓（例如 `kitchen` 两侧墙砖线/吊柜/窗，`street` 远处店面剪影/路灯，`outdoor` 远山/太阳/云），统一画一条手绘地面线在 `y = GROUND_Y`。
- 更新 `templates.mjs`：从 `world.mjs` 导入 `STYLE_PALETTES` 与 `styleBackgroundSvg`，让 `THEME_PALETTE = { light: STYLE_PALETTES.paper, dark: STYLE_PALETTES.night }`，`paperBackgroundSvg(themeOrStyle, ...)` 转调 `styleBackgroundSvg`。

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/world.test.mjs tests/visuals.test.mjs && npm test`
Expected: 全部通过，旧测试 0 回归。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/world.mjs skills/topic-to-video/scripts/lib/templates.mjs tests/world.test.mjs
git commit -m "feat(world): add five style packs and eight hand-drawn scenes"
```

---

### Task 2: 60 个内置物件、元数据、状态画法与自定义道具（`icons.mjs` + `tools/export-props.mjs`）

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/icons.mjs`
- Create: `tools/export-props.mjs`
- Modify: `package.json`（添加 `export-props` 脚本）
- Test: `tests/world.test.mjs`、`tests/visuals.test.mjs`

**Interfaces:**
- Consumes: `STYLE_PALETTES`, `resolveStyle` from `./world.mjs`; `inkStroke`, `markerFill`, `circlePoints`, `num` from `./ink.mjs`
- Produces:
  - `ICONS`：60 个名称（设计 §4.1 列表，前 24 个顺序不变）
  - `PROP_META`：`Record<string, { height: number, aspect: number, layer: 'ground'|'mid'|'air', anchors: { handle: [number, number], top: [number, number], front: [number, number], seat?: [number, number] }, states: string[], carry: boolean }>`（锚点为 `[0..1, 0..1]` 归一化到外框）
  - `COMMON_STATES = ['normal', 'active', 'dim', 'crossed', 'stamped', 'broken']`
  - `isCountState(state) -> boolean`（匹配 `/^count:.{1,4}$/`）
  - `propSupportsState(propId, state, customProps = []) -> boolean`
  - `drawIcon(name, { x, y, size, width, height, theme, style, seed, state, stateProgress } = {}) -> string`（无 `style`/`state` 且 `size` 传入时对原 24 图标保持与旧版完全兼容；输出含 `data-icon` 和 `data-state`；不含 `<text>`）
  - `validateCustomProps(customProps) -> { path, code: 'CUSTOM_PROP_INVALID', message }[]`
  - `customPropMeta(def) -> { height, aspect, layer, anchors, states: [], carry: boolean }`
  - `drawCustomProp(def, { x, y, w, h, style, seed, state, stateProgress } = {}) -> string`

- [ ] **Step 1: 写失败测试（追加到 `tests/world.test.mjs`）**

测试以下断言：
1. `ICONS.length === 60`，前 24 个与原名单一致；每个物件在 `PROP_META` 中都有合法的 `height`（0.1–1.5）、`aspect`（0.3–3.0）、`layer`、`anchors`（`handle`/`top`/`front` 坐标均在 `[0, 1]` 内，有 `seat` 时也在 `[0, 1]` 内）、`states` 和 `carry`。
2. 60 个物件在 `paper` 和 `chalkboard` 风格下都能确定性画出，无 `<text>`，深底风格不出现 `#1f1f1f`；舞台尺寸（如 `height = 400 * meta.height`）下描边宽度不低于小青身体线宽的一半（`>= 4.4 px` at 1080p）。
3. 每个物件声明的专属状态（如 `fridge` 的 `open`/`closed`/`full`/`empty`、`lock` 的 `locked`/`unlocked`、`bulb` 的 `lit`/`off`、`ticket`/`fridge` 的 `fresh`/`expired`）以及 6 个通用状态、`count:3` 都能画出不同的 SVG 并带 `data-state="<state>"`（`count:` 徽标用路径/数字状态标记，文字由 `stage.mjs` 的 `textItems` 叠字，向量层仍零 `<text>`）。
4. `validateCustomProps` 接受合法 `c_fishtank` 示例；拒绝：超过 4 件、超过 12 个图元、`id` 不以 `c_` 开头、与内置物件重名、坐标超出 `[-1, 1]` 或 `NaN`、未知 `shape`、未知 `fill` 色键、`line` 少于 2 点或超过 6 点、`poly` 少于 3 点或超过 8 点、`height` 超出 `[0.1, 1.5]`。
5. `drawCustomProp` 画出带 `data-icon="c_fishtank"` 的纯向量手绘 SVG，输入里混入 `<script>` 或越界数字时截断且输出绝不包含 `<script` 或 `<text`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/world.test.mjs`
Expected: FAIL（`PROP_META`、`validateCustomProps` 等未导出，`ICONS.length` 仍为 24）。

- [ ] **Step 3: 扩充 `icons.mjs` 并添加 `tools/export-props.mjs`**

- 在 `icons.mjs` 中：
  - 保留原 24 个小图标的绘制逻辑（兼容 `theme: 'light'|'dark'`），接入 `resolveStyle(style ?? theme)`。
  - 新增 36 个大物件（按家居厨房、商店街道、交通物理、科学教育、办公信息、小件与符号 6 组组织），所有坐标基于外框宽 `w` / 高 `h` 归一化，支持 `open`/`closed`、`full`/`empty`、`locked`/`unlocked`、`fresh`/`expired`、`lit`/`off` 专属状态几何绘制。
  - 实现通用状态叠加 helper `drawStateOverlay(state, bbox, pal, seed, progress)`：`active`（手绘强调光圈）、`dim`（外层降不透明度至 0.45）、`crossed`（两笔红叉随 `progress` 划出）、`stamped`（印章框随 `progress` 弹落）、`broken`（锯齿裂纹）、`count:*`（右上角手绘圆形底徽标，数字由调用方放进 `textItems`）。
  - 实现 `validateCustomProps`、`customPropMeta`、`drawCustomProp`（所有坐标用 `Math.max(-1, Math.min(1, Number(v) || 0))` 截断，统一经 `inkStroke`/`markerFill` 输出）。
- 新建 `tools/export-props.mjs`：把 60 个内置物件以网格速查表导出到 `out/review/props-cheatsheet.png`（同时支持 `--style chalkboard`），并在根 `package.json` 加 `"export-props": "node tools/export-props.mjs"`。
- 同步更新 `tests/visuals.test.mjs` 中原有的 `assert.equal(ICONS.length, 24)`（改为验证 `ICONS.length === 60` 且包含全部 schema 枚举；注意 schema 枚举在 Task 5 同步，本步先确保 `visuals.test.mjs` 断言 `ICONS` 是 schema 的超集、原 24 个都在且输出不变，Task 5 改为精确相等）。

- [ ] **Step 4: 跑测试并导出物件速查表目检**

Run: `node --test tests/world.test.mjs tests/visuals.test.mjs && npm test && npm run export-props`
Expected: 测试全部通过；`out/review/props-cheatsheet.png` 生成成功（抽查视觉风格与比例一致性）。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/icons.mjs tools/export-props.mjs package.json tests/world.test.mjs tests/visuals.test.mjs
git commit -m "feat(props): expand built-in props to 60 with metadata, states, custom prop whitelist, and cheatsheet tool"
```

---

### Task 3: `templates.mjs` 接入风格包色键并新增 `timeline`、`cycle` 模板

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/templates.mjs`
- Test: `tests/visuals.test.mjs`

**Interfaces:**
- Consumes: `resolveStyle` from `./world.mjs`; `drawIcon` from `./icons.mjs`
- Produces:
  - `layoutElements(visual, layout, zoneOverride)` 新增支持 `timeline`（`items.length` 个节点外框）和 `cycle`（`items.length` 个环上节点外框）
  - `renderDiagram(visual, { layout, theme, style, seed, t, duration, elementStates, zoneOverride })` 全部模板使用 `resolveStyle(style ?? theme).palette`，并渲染 `timeline` 与 `cycle`

- [ ] **Step 1: 写失败测试（追加到 `tests/visuals.test.mjs`）**

测试以下断言：
1. `timeline`（2–5 个 `{ time, label, icon? }`）和 `cycle`（3–5 个 `{ label, icon? }`）在 `host-left` 和 `full` 下都返回纯向量 `vectorSvg`（无 `<text>`）、对应数量的 `textItems` 与完全落在 `DIAGRAM_ZONES[layout]` 内的 `elements`。
2. `renderDiagram` 传 `style: 'blueprint'` 或 `style: 'chalkboard'` 时使用对应风格包色板，不出现 `#1f1f1f` 黑色墨线；不传 `style` 时行为与原 `theme: 'light'|'dark'` 一致。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/visuals.test.mjs`
Expected: FAIL（`unknown template timeline`）。

- [ ] **Step 3: 实现 `timeline`、`cycle` 与风格包色键接入**

- `timeline`：在 `zone` 垂直中线画一条手绘横向主轴，2–5 个节点均匀分布，节点圆点 + 可选图标 + `time` 与 `label` 上下交替排布（避开碰撞）。
- `cycle`：在 `zone` 中心按圆周均匀放置 3–5 个手绘圆角卡片/节点，顺时针用弧形 `handArrow` 首尾相连；每个元素的 `arrowProgress` 控制指向它的弧形箭头绘制。
- 所有 8 个 `templates.mjs` 模板统一通过 `const { name: styleName, palette: pal } = resolveStyle(style ?? theme)` 取色，向 `drawIcon` 传 `style: styleName`。

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/visuals.test.mjs && npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/templates.mjs tests/visuals.test.mjs
git commit -m "feat(templates): add timeline and cycle templates and wire style pack palettes"
```

---

### Task 4: `stage.mjs` 语义自动排版与舞台渲染

**Files:**
- Create: `skills/topic-to-video/scripts/lib/stage.mjs`
- Test: `tests/stage.test.mjs`（新建）

**Interfaces:**
- Consumes: `GROUND_Y`, `resolveStyle` from `./world.mjs`; `PROP_META`, `customPropMeta`, `drawIcon`, `drawCustomProp`, `isCountState` from `./icons.mjs`; `inkStroke`, `num`, `resample` from `./ink.mjs`
- Produces:
  - `STAGE_SLOTS = { left: 240, 'mid-left': 600, center: 960, 'mid-right': 1320, right: 1680 }`
  - `SIZE_MULTIPLIERS = { sm: 0.75, md: 1, lg: 1.3 }`
  - `STAGE_BOUNDS = { minX: 120, maxX: 1800, titleTop: 48, titleBottom: 150, airTopMin: 160, airBottomMax: 470, midDefaultBottom: 762, subtitleSafeY: 950, gap: 40, hostClearWidth: 200, minScale: 0.6 }`
  - `layoutStage(visualData, { hostAt, prevHostX = 320, customProps = [], hostHeight = 400 } = {}) -> { ok: boolean, crowded: boolean, scale: number, hostX: number, elements: StageElement[], links: StageLink[] }`
    - 每个 `StageElement`：`{ index, prop, label, layer, state, bbox: { x, y, w, h }, anchors: { handle, top, front, seat? }, standSpots: { left: number, right: number } }`（`anchors` 已换算为 1920×1080 世界像素坐标！）
  - `renderStage(visualData, { style = 'paper', seed = 'sh01', t = 1, duration = 4, elementStates = [], customProps = [], layoutResult } = {}) -> { vectorSvg, backVectorSvg, frontVectorSvg, textItems, elements }`（批次 1 `frontVectorSvg` 为空字符串，批次 2 用于被抱起/举起的物件与运送包裹，接口一次定清）

- [ ] **Step 1: 写失败测试 `tests/stage.test.mjs`**

测试以下断言（完整覆盖设计 §5.2–§5.3 及 Review Focus #4）：
1. 槽位定位：`left`/`mid-left`/`center`/`mid-right`/`right` 分别对应 `240/600/960/1320/1680`，比例 `0.5` 对应 `960`；`size` `sm/md/lg` 缩放 `0.75/1/1.3`。
2. 高度层：`ground` 物件底边 `y + h === 930`；同槽位有 `table`（`ground`）和 `cup`（`mid`）时，`cup` 底边落在 `table` 顶面 `y` 上；无同槽位落地物件时 `mid` 底边在 `762`；`air` 物件底边 `<= 470` 且顶边 `>= 160`。
3. 防重叠与小青站位：同一高度层两个相邻物件重叠时向两侧推开且间距 `>= 40 px`；所有物件在 `[120, 1800]` 内且底边 `< 950`；`hostX` 周围有 `200 px` 净空（不与落地物件外框重叠）；`hostAt` 未指定时优先继承 `prevHostX`，被占则选最近空位。
4. 拥挤缩放与报错：5 个大号落地物件先自动缩小（`scale >= 0.6`），超过 0.6 仍放不下时返回 `{ ok: false, crowded: true }`。
5. 确定性与渲染：`layoutStage` 同输入输出完全相同；`renderStage` 输出纯向量 `vectorSvg`（无 `<text>`），带 `heading`、物件 `label`（避开标题带和空中物件，冲突时放物件正面）、`links`（实线/虚线手绘箭头与文字）、`count:*` 徽标文字和 `highlight`/`reveal`/`tapShake` 状态变换。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/stage.test.mjs`
Expected: FAIL（找不到 `stage.mjs`）。

- [ ] **Step 3: 实现 `skills/topic-to-video/scripts/lib/stage.mjs`**

按设计 §5.2–§5.3 实现纯函数 `layoutStage`：
1. 查 `PROP_META` 或 `customPropMeta` 算自然宽 `w = h * aspect`、高 `h = hostHeight * meta.height * SIZE_MULTIPLIERS[size]`。
2. 迭代缩放因子 `s` 从 `1.0` 递减（步长 `0.05` 至 `0.6`）：
   - 按 `at` 定位水平中心，把同层（`ground`、`air` 及未叠在落地物件上的 `mid`）物件按 `x` 排序后双向推开至间隔 `>= 40 px` 并夹紧到 `[120, 1800]`。
   - 算纵坐标：`ground` 贴 `930`；`mid` 若水平中心落在某落地物件 `[x, x+w]` 内则底边贴其 `y`，否则底边 `762`；`air` 居中于 `[160, 470]`。
   - 在 `[200, 1720]` 找满足 `[cx - 100, cx + 100]` 不与落地物件重叠的候选区间，优先取 `hostAt`（或 `prevHostX`），否则取最近空区间边界；找不到则继续降 `s`。
   - 检查所有物件在边界内、间距 `>= 40 px`（同层）、顶边 `>= 160`（无冲突）、底边 `<= 930`；满足即返回 `ok: true`，降到 `0.6` 仍不满足返回 `ok: false, crowded: true`。
3. 把每个物件的局部 `anchors` 转成世界像素坐标，并算好 `standSpots: { left: bbox.x - 70, right: bbox.x + bbox.w + 70 }`（夹紧到 `[120, 1800]`）。
4. 实现 `renderStage`：画 `links` 曲线箭头（`solid` 或 `dashed`）、逐物件画 `drawIcon`/`drawCustomProp`（带 `highlight`/`tapShake`/`opacity`/`scale`/`dy`）、输出 `heading`（y = 92）、物件 `label`（优先 `y = bbox.y - 24`，若与标题带 `< 160` 或其他物件重叠则放 `y = bbox.y + bbox.h * 0.55`）与 `count:*` 数字到 `textItems`。

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/stage.test.mjs && npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/stage.mjs tests/stage.test.mjs
git commit -m "feat(stage): add semantic stage auto-layout and renderer"
```

---

### Task 5: Schema 与 `project.mjs` / `match.mjs` / `docs.mjs` 批次 1 自检

**Files:**
- Modify: `skills/topic-to-video/schema/project.schema.json`
- Modify: `skills/topic-to-video/scripts/lib/project.mjs`
- Modify: `skills/topic-to-video/scripts/lib/match.mjs`
- Modify: `skills/topic-to-video/scripts/lib/docs.mjs`
- Test: `tests/schema.test.mjs`、`tests/project.test.mjs`、`tests/match.test.mjs`、`tests/derived-docs.test.mjs`、`tests/visuals.test.mjs`

**Interfaces:**
- Consumes: `STYLE_NAMES`, `SCENE_NAMES` from `./world.mjs`; `ICONS`, `validateCustomProps`, `propSupportsState` from `./icons.mjs`; `layoutStage`, `STAGE_SLOTS` from `./stage.mjs`
- Produces:
  - Schema 支持 `world`、`layout: 'stage'`、`shot.scene`、`shot.host.at`、`visual_stage`、`visual_timeline`、`visual_cycle`、60 个 `$defs.icon`
  - `project.mjs` 新增错误码：`STAGE_NEEDS_WORLD`、`STAGE_LAYOUT_MISMATCH`、`STAGE_CROWDED`、`CUSTOM_PROP_INVALID`、`STATE_UNSUPPORTED`；`HOST_LAYOUTS = ['host-left', 'stage']`
  - `match.mjs` 的 `visualKeywords` 支持 `stage`（`heading` + 物件 `label`）、`timeline`（`time` + `label`）、`cycle`（`label`）；`POINT_MISSING`、`MOVE_TOO_MANY`、`FOCUS_SPLIT` 同时检查 `host-left` 和 `stage`
  - `docs.mjs`：有 `world` 时核对 `分镜.md` 含视觉世界说明（`style`、`scene` 和 `metaphor`）

- [ ] **Step 1: 写失败测试**

分别在以下测试文件追加用例：
- `tests/schema.test.mjs`：合法的带 `world` + `stage` + `custom_props` + `timeline` + `cycle` 项目通过；非法项被拒：`stage` 缺 `host`、`stage` 版式配 `bullets`、`host-left` 配 `stage` 模板、`full` 带 `scene`、`world.metaphor` 超 60 字、`custom_props` 超 4 件、`timeline` 1 项、`cycle` 2 项。
- `tests/project.test.mjs`：无 `world` 用 `stage` 报 `STAGE_NEEDS_WORLD`；拥挤舞台报 `STAGE_CROWDED`；非法自定义道具报 `CUSTOM_PROP_INVALID`；给 `cup` 设 `open` 状态报 `STATE_UNSUPPORTED`；`stage` 镜头允许 `expr`/`gesture`/`move`/`prop`/`reveal`/`highlight`；`SCHEMA_FIELDS` 和 `VISUAL_LIMITS` 与 schema 完全同步；无 `world` 的旧项目零变化。
- `tests/match.test.mjs`：`visualKeywords` 能抽出 `stage`/`timeline`/`cycle` 的字；`stage` 镜头说"看这里"没指报 `POINT_MISSING`。
- `tests/derived-docs.test.mjs`：有 `world` 的项目，`分镜.md` 缺少视觉世界行或 `style`/`scene` 不一致时 `checkDerivedDocs` 报错；无 `world` 的旧项目不要求该行。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/schema.test.mjs tests/project.test.mjs tests/match.test.mjs tests/derived-docs.test.mjs`
Expected: FAIL（schema 拒绝 `world`/`stage` 等新字段，新错误码未实现）。

- [ ] **Step 3: 更新 schema、`project.mjs`、`match.mjs`、`docs.mjs`**

- `project.schema.json`：按设计 §3.1、§4.3、§5.1、§5.5、§8.1 精确补全定义，`additionalProperties: false` 保持严格；`$defs.icon.enum` 同步为 60 个；`shot` 用 `allOf` 约束 `host-left` / `stage` / `full` 三者对 `host`、`scene`、`visual.template` 的搭配关系。
- `project.mjs`：
  - `ICON_NAMES` 直接复用 `ICONS`（60 个）。
  - `SCHEMA_FIELDS` 与 `VISUAL_LIMITS` 同步新增对象与上限（保持 `tests/project.test.mjs` 同步测试通过）。
  - `checkProject` 校验 `world`（`style`、`scene`、`metaphor` 上限 60、`validateCustomProps`）、`stage` 镜头必须有 `world`（`STAGE_NEEDS_WORLD`）、版式与模板/`scene` 匹配（`STAGE_LAYOUT_MISMATCH`）、物件 `prop` 存在且初始 `state` 合法（`STATE_UNSUPPORTED`）、`links` 索引合法、调 `layoutStage` 检查 `STAGE_CROWDED`。
  - `checkCues`：`HOST_CUES` 允许在 `host-left` 和 `stage` 上使用。
- `match.mjs`：`visualKeywords` 加 `stage`/`timeline`/`cycle`；`if (!['host-left', 'stage'].includes(shot.layout)) return;`。
- `docs.mjs`：当 `project.world` 存在时，检查 `boardMd` 包含 `project.world.style`、`project.world.scene` 及 `squash(project.world.metaphor)`。
- 同步在 `storyboard.md` 模板表先列出 `stage`、`timeline`、`cycle`（完整说明与 `world.md` 链接在 Task 7 补齐），确保本步 `tests/references.test.mjs` 全绿；并恢复 `tests/visuals.test.mjs` 的 `assert.deepEqual([...ICONS].sort(), [...schema.$defs.icon.enum].sort())`。

- [ ] **Step 4: 跑测试验证全绿**

Run: `npm test`
Expected: 全部通过（含 `tests/example.test.mjs`、`tests/check-cli.test.mjs`）。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/schema/project.schema.json skills/topic-to-video/scripts/lib/project.mjs skills/topic-to-video/scripts/lib/match.mjs skills/topic-to-video/scripts/lib/docs.mjs tests/schema.test.mjs tests/project.test.mjs tests/match.test.mjs tests/derived-docs.test.mjs tests/visuals.test.mjs
git commit -m "feat(check): validate world, stage, timeline, cycle, custom props, and storyboard world header"
```

---

### Task 6: 渲染管线接入 `world` / `stage` / 场景层与 `HOST_OBJECT_OVERLAP` QA

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/rig.mjs:351-378`
- Modify: `skills/topic-to-video/scripts/lib/motion.mjs:238-252, 427-432, 520-525`
- Modify: `skills/topic-to-video/scripts/lib/scene.mjs`
- Modify: `skills/topic-to-video/scripts/lib/encode.mjs:174-192`
- Modify: `skills/topic-to-video/scripts/lib/qa.mjs:209-218`
- Test: `tests/stage.test.mjs`、`tests/scene-encode.test.mjs`、`tests/qa.test.mjs`

**Interfaces:**
- Consumes: `resolveStyle`, `styleBackgroundSvg`, `sceneBackgroundSvg`, `GROUND_Y` from `./world.mjs`; `layoutStage`, `renderStage` from `./stage.mjs`
- Produces:
  - `SCENE_VERSION = 4`（`scene.mjs`）
  - `drawHost` 接受可选 `style`（或用 `resolveStyle(style ?? theme)` 决定浅/深墨线，深底用 `manifest.ink.body.dark`，围巾恒用 `manifest.ink.accent`）
  - `buildShotPlans` 在 `shotPlan` 上挂载 `style`、`scene`、`customProps`、`stageLayout`，在 `stage` 与 `host-left` 间连续传递 `x`/`startState`/`endHostState`；`shotCacheKey` 包含 `style`、`scene`、`customProps`
  - `evaluateHostAt` 在 `stage` 镜头里：`resolveStandX` 使用 `el.standSpots`，`focusPt` 对准 `el.anchors.front`，`tap` 拍在 `el.anchors.front` 上
  - `encode.mjs` + `qa.mjs`：在 `stage` 镜头非互动帧里检测小青 `bodyBbox` 与物件外框重叠，记录 `objectOverlapFrames` 并报 `HOST_OBJECT_OVERLAP`

- [ ] **Step 1: 写失败测试**

追加用例到 `tests/stage.test.mjs`、`tests/scene-encode.test.mjs`、`tests/qa.test.mjs`：
1. `stage` 镜头渲染：输出包含 `styleBackgroundSvg`、`sceneBackgroundSvg`（`data-scene="kitchen"`）、物件 SVG、小青 SVG（层次顺序：场景 → 物件 → 小青 → 文字/字幕）；`chalkboard` 风格下小青墨线为 `#f2f2f2` 且青色围巾 `#20a5a3` 仍在。
2. `stage` 上 `move` 到物件 0 后，小青站在其空位侧，距离物件 `front` 锚点在手部够得着范围内；`tap` 时手触达 `front` 锚点并产生 `tapImpact > 0.5`。
3. 版式衔接：`stage` → `host-left` 和 `host-left` → `stage` 共享 `y = 930`、小青 `x` 连续不跳变；`stage` ↔ `full` 触发小跑走入/走出。
4. 缓存键：改动 `world.style`、`shot.scene` 或 `world.custom_props` 时 `shotCacheKey` 必须改变；无 `world` 的旧项目 `evaluateFrame` 渲染与旧版兼容。
5. QA：当 `qaByShot[id].objectOverlapFrames > 0` 时 `runQa` 报 `HOST_OBJECT_OVERLAP`；正常 `stage` 镜头排布下 `objectOverlapFrames === 0`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/stage.test.mjs tests/scene-encode.test.mjs tests/qa.test.mjs`
Expected: FAIL（`scene.mjs` 只认 `host-left` 和 `full`，`rig.mjs` 不认 `style`，`qa.mjs` 没有 `HOST_OBJECT_OVERLAP`）。

- [ ] **Step 3: 实现管线接线**

- `rig.mjs`：`drawHost` 根据 `resolveStyle(state.style ?? state.theme).palette.isDark` 选择 `manifest.ink.body.dark` 或 `.light`（不再因 `theme` 为风格名抛错，仍校验合法值）。
- `motion.mjs`：`resolveStandX` 若 `el.standSpots` 存在则优先选离 `currentX` 更近的 `standSpots.left`/`right`；`focusPt` 若 `focusEl?.anchors?.front` 存在则直接取它（用于 `point`/`lean_in`/`tap`）。
- `scene.mjs`：
  - `SCENE_VERSION = 4`。
  - `isHostLayout = (layout) => layout === 'host-left' || layout === 'stage'`。
  - `buildShotPlans`：`stage` 镜头调用 `layoutStage` 得到 `elements` 和 `hostX`（若 `shot.host.at` 存在优先用它，否则继承 `lastHostEnd.x` 经 `layoutStage` 避让）；`host-left` 与 `stage` 之间不触发强制回到 `x = 320` 的 `auto_return`（只在 `host-left` → `host-left` 时保留原逻辑）；`full->stage` 走入 `0.6 s`，`stage->full` 走出 `0.4 s`；`stage<->host-left` 保持小青不动、物件与卡片交叉淡化。
  - `shotCacheKey` 增加 `style`、`scene`、`customProps`。
  - `evaluateFrame`：用 `styleBackgroundSvg(shotPlan.style, ...)`；`stage` 镜头叠加 `sceneBackgroundSvg(shotPlan.scene, ...)`（镜头内随 `camOpen` 轻推）+ `renderStage`；`stage` 图解与 `hostSvg` 按"场景 → 物件 → 小青 → 前景物件"拼装；字幕颜色取 `resolveStyle(shotPlan.style).palette`。
- `encode.mjs` & `qa.mjs`：`encode.mjs` 在 `shotPlan.shot.layout === 'stage'` 时用 `qaEvents.objectOverlapFrames` 统计非互动帧中 `bodyBbox` 与物件 `bbox` 的重叠（批次 1 `hostMeta.interacting` 缺省为 `false`）；`qa.mjs` 遇到 `objectOverlapFrames > 0` 报 `HOST_OBJECT_OVERLAP`。

- [ ] **Step 4: 跑全量测试验证全绿**

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/rig.mjs skills/topic-to-video/scripts/lib/motion.mjs skills/topic-to-video/scripts/lib/scene.mjs skills/topic-to-video/scripts/lib/encode.mjs skills/topic-to-video/scripts/lib/qa.mjs tests/stage.test.mjs tests/scene-encode.test.mjs tests/qa.test.mjs
git commit -m "feat(scene): render visual worlds, stage layout, transitions, style-aware host ink, and stage overlap QA"
```

---

### Task 7: L0 文档（`world.md`、`SKILL.md`、`storyboard.md`、`prompt-pack.md`）、预算测试、README 与官网

**Files:**
- Create: `skills/topic-to-video/references/world.md`（≤ 250 行、≤ 10 KB）
- Modify: `skills/topic-to-video/SKILL.md`
- Modify: `skills/topic-to-video/references/storyboard.md`（保持 ≤ 10 KB）
- Modify: `skills/topic-to-video/references/prompt-pack.md`
- Modify: `README.md`、`README.en.md`、`site/index.html`
- Test: `tests/budget.test.mjs`、`tests/references.test.mjs`、`tests/readme.test.mjs`、`tests/site.test.mjs`

**Interfaces:**
- Consumes: Task 1–5 定下的所有风格名、场景名、60 物件名、状态名与错误码
- Produces: 完整的批次 1 L0 文档体系；`tests/budget.test.mjs` 把 `references/world.md` 纳入 100 KB L0 读取总预算

- [ ] **Step 1: 写失败测试**

更新测试断言：
- `tests/budget.test.mjs`：把 `'references/world.md'` 加入 `a full L0 run reads at most 100 KB of skill files` 的 `read` 列表。
- `tests/references.test.mjs`：
  - `storyboard.md` + `world.md` 合计覆盖 schema 里全部模板（含 `stage`/`timeline`/`cycle`）、表情、动作、道具、cue、风格包（5 套）和场景（8 个）。
  - `world.md` 列出 60 个内置物件名、自定义道具上限（4 件 / 12 图元）和场景→服装/配音推荐表。
  - `SKILL.md` 的流程表包含"定视觉世界"并链接 `references/world.md`。
  - `prompt-pack.md` 要求在首帧图前写上 `world.style` 和 `world.scene` 的画风与场景描述。
- `tests/readme.test.mjs` & `tests/site.test.mjs`：中英文 README 与官网提到风格包、手绘场景与同台 `stage` 舞台。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/budget.test.mjs tests/references.test.mjs tests/readme.test.mjs tests/site.test.mjs`
Expected: FAIL（`world.md` 不存在，引用与文案未更新）。

- [ ] **Step 3: 编写 `world.md` 并精简更新各文档**

- 新建 `skills/topic-to-video/references/world.md`（控制在 ~160 行、≤ 8 KB，给批次 2 留出 2 KB 空间写动作卡）：
  - 定视觉世界步骤（比喻、风格包、场景、按场景推荐服装与配音）
  - 5 套风格包表、8 个场景表
  - 60 个内置物件分组表（含可支持的专属状态）与自定义道具白名单规范（`c_` 前缀、4 件/12 图元、4 种图元）
  - `stage` 舞台版式写法（槽位、高度层、尺寸、`links`、`分镜.md` 视觉世界一行示例）
- 更新 `SKILL.md`：第 2 步改为"定视觉世界、写 `shots` 和 `分镜.md`"，先读 `[world.md](references/world.md)` 与 `[storyboard.md](references/storyboard.md)`。
- 更新 `storyboard.md`（务必检查字节数 ≤ 10,240 B！）：版式表加 `stage` 并指向 `[world.md](world.md)`；开场/结尾和"连续 3 个 `full`"改为"`host-left` 或 `stage`"；模板表补 `timeline`、`cycle` 并注明 `stage` 详见 `world.md`；去掉重复废话保证字节数安全。
- 更新 `prompt-pack.md`：第 3 行首帧图与全局锁定加上 `world.style` 和 `world.scene` 描述，并说明 `stage` 镜头把人物和物件画在同一条地面线上。
- 同步更新 `README.md`、`README.en.md`、`site/index.html`。

- [ ] **Step 4: 跑测试验证预算与引用全绿**

Run: `node --test tests/budget.test.mjs tests/references.test.mjs tests/readme.test.mjs tests/site.test.mjs && npm test`
Expected: 全部通过（文件数 36 ≤ 45，`world.md` 和 `storyboard.md` 均 ≤ 10 KB，L0 合计 ≤ 100 KB）。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/references/world.md skills/topic-to-video/SKILL.md skills/topic-to-video/references/storyboard.md skills/topic-to-video/references/prompt-pack.md README.md README.en.md site/index.html tests/budget.test.mjs tests/references.test.mjs tests/readme.test.mjs tests/site.test.mjs
git commit -m "docs(world): add references/world.md and document visual worlds, style packs, scenes, and stage layout"
```

---

### Task 8: 批次 1 双主题回归夹具与 540p 预览验收

**Files:**
- Create: `tests/fixtures/world-cache.json`（缓存：`paper` + `kitchen`/`street`，含冰箱/超市 `stage` 镜头 + 自定义道具）
- Create: `tests/fixtures/world-flight.json`（飞机为什么能飞：`chalkboard` + `outdoor`/`lab`，含 `plane`/`scale`/`timeline`/`cycle` + `stage` 镜头）
- Test: `tests/stage.test.mjs`（追加双主题夹具自检与单帧渲染回归测试）

**Interfaces:**
- Consumes: 批次 1 全部模块与 `render.mjs`
- Produces: 两个不同主题的回归夹具（进 git）+ `out/s-accept-cache/` 与 `out/s-accept-flight/` 540p 预览片和联系表（不进 git，供 owner 验收）

- [ ] **Step 1: 写两个主题夹具及回归测试**

- 新建 `tests/fixtures/world-cache.json` 和 `tests/fixtures/world-flight.json`：出镜镜头里 `stage` 占比均 ≥ 60%，小青至少一半镜头不在左下角（`x != 320`），分别覆盖 `paper`+`kitchen`/`street` 与 `chalkboard`+`outdoor`/`lab`、`timeline`、`cycle` 和 1 个自定义道具。
- 在 `tests/stage.test.mjs` 追加测试：两份夹具均通过 schema 校验、`checkProject`（0 errors），且 `buildShotPlans` + `evaluateFrame` 在每个镜头中点都能无报错生成纯向量 SVG，两个主题的底纸颜色与场景标记不同但共享小青青色围巾。

- [ ] **Step 2: 跑全量测试并提交夹具**

Run: `npm test`
Expected: 全部通过。

```bash
git add tests/fixtures/world-cache.json tests/fixtures/world-flight.json tests/stage.test.mjs
git commit -m "test(stage): add dual-theme world fixtures for cache and flight"
```

- [ ] **Step 3: 生成批次 1 验收素材供 owner 拍板**

使用免费本地 `edge-tts`（复制两份夹具到 `out/s-accept-cache/` 与 `out/s-accept-flight/`，不改仓库里的夹具文件）各跑一次 540p 预览，同时导出物件速查表：

```bash
npm run export-props
node skills/topic-to-video/scripts/render.mjs out/s-accept-cache --preview
node skills/topic-to-video/scripts/render.mjs out/s-accept-flight --preview
```

验收核对项（逐项汇报 owner，不跳过目检）：
1. 看 `out/review/props-cheatsheet.png`：60 个物件线宽、比例、色键统一。
2. 并排看 `out/s-accept-cache/out/contact.png` 和 `out/s-accept-flight/out/contact.png`：一眼看出主题完全不同，又认得出是小青的同一档节目；遮住文字能猜出主题。
3. 核对 `qa.json`：`ok: true`、`issues: 0`（无 `HOST_OBJECT_OVERLAP`），出镜镜头 `stage` ≥ 60%，记录 540p 渲染耗时与 H 阶段对比（不超过 +30%）。
4. owner 确认批次 1 验收通过后，再进入 [A 同台互动实施计划](A同台互动实施计划.md)。
