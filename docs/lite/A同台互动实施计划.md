# A 同台互动实施计划（批次 2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让小青真正动手操作舞台上的物件：支持 8 个同台互动动作（`open`、`carry`、`push`、`pull`、`hold_up`、`draw`、`sit_on`、`react`）、物体状态切换（`state`）和沿箭头运送（`send`），补齐自动转头/点头、动作卡和 `NO_INTERACTION`/`GESTURE_REPEAT`/4 秒静止上限自检，并把 `examples/cache-speed/` 升级为冰箱+超市同台示范片。

**Architecture:** 复用批次 1 建好的 `stage.mjs` 世界锚点和 `motion.mjs` 两节反向求解（`solveTwoBoneIK`）。`motion.mjs` 负责把远距离互动拆成"自动走近互动侧 → 手贴锚点/骨盆对齐座面 → 输出互动态与手部世界坐标"；`stage.mjs` 根据互动态和 `state`/`send` cue 计算每个物件的位移、跟随、开合/打叉/盖章动效与沿线飞行包裹，并将画面拆成背景物件层与前景手持层交由 `scene.mjs` 夹住小青渲染。`project.mjs` 与 `match.mjs` 补齐能力校验和节奏警告。

**Tech Stack:** Node ≥ 20（ESM，`node --test`）、`@resvg/resvg-js`（开发依赖）；Ajv 只在测试里校验 schema。

**Spec:** [画面与同台互动设计](画面与同台互动设计.md)（批次 2，展开 [个性化路线图](个性化路线图.md) §6.4；前置依赖 [S 画面与主题世界实施计划](S画面与主题世界实施计划.md) 已完成）

## Global Constraints

- 保持 skill 预算红线：总文件数不超过 45（本批次不加新代码文件，保持 36 个）、总大小不超过 5 MB；`SKILL.md` ≤ 150 行/8 KB；`world.md` 和 `storyboard.md` 各自 ≤ 250 行/10 KB；L0 读取总计 ≤ 100 KB；0 新增 npm 依赖。
- 只做向后兼容的新增：`version` 仍为 1；旧的 `host-left` 和 `full` 镜头照常渲染。
- 互动时长与参数照抄设计 §6.1–§6.5：`open` 0.6 秒、`push`/`pull` 位移 160 px、`hold_up` 1.5 秒、`draw` 1 秒、`react` 0.8 秒、`state` 切换动效 0.25–0.35 秒、`send` 沿线飞行 0.8 秒；超过手臂长度（`0.35 H`）自动走近且不计入 `MOVE_TOO_MANY`；`STATIC_STRETCH` 从 8 秒收紧到 4 秒（仅警告）。
- 场景评测 09 消耗配额，运行前必须先征得 owner 同意；若用 agy 按 owner 先前约定使用 `--model gemini-3.8-flash-medium`。
- 先写失败测试，再写最小实现，每个任务跑通 `npm test` 并提交；不提交 `.DS_Store`，不 push、不合并，除非 owner 说。

## Review Focus

1. 小青距目标锚点超过手臂长度（`0.35 H`）时触发 `open`/`carry`/`push`/`pull`/`hold_up`/`draw`/`sit_on`：必须先自动走近到互动侧再做动作，不能隔空拉断手臂，且自动走近不触发 `MOVE_TOO_MANY`。→ Task 2、Task 4 测试。
2. 抱着物件（`carry`）时又触发 `move`、手持 `prop` 或再抱第二件：物件跟着手移动；原本手里的 `prop` 自动放下；`carry` `target: "none"` 把物件放回脚边地面；连抱两件时前一件放回地面，不出现悬空或双持。→ Task 3、Task 4 测试。
3. 互动进行中（`sit_on`、`open`、`carry`、`push`/`pull`）小青身体外框必然接触目标物件外框：QA 必须在 `hostMeta.interacting === true` 时豁免 `HOST_OBJECT_OVERLAP`，只在非互动帧误穿模时报错。→ Task 5 测试。
4. `send` 包裹在起飞前（`t < t0`）和落地后（`t > t0 + 0.8`）不能残留漂浮图标，且指向不存在的 `link` 或不可运送物件时被 `checkProject` 拦截。→ Task 1、Task 3 测试。
5. `STATIC_STRETCH` 改为 4 秒后，旧项目只出警告不失败；升级后的 `examples/cache-speed/` 必须 0 errors、0 docs 问题且 0 warnings（不触发 `NO_INTERACTION`、`GESTURE_REPEAT`、`STATIC_STRETCH`）。→ Task 2、Task 6 测试。

---

## 文件地图

| 文件 | 动作 | 职责 | 任务 |
| --- | --- | --- | --- |
| `skills/topic-to-video/schema/project.schema.json` | Modify | `cue.do` 加 10 个新值、`cue.value` 字段与分支校验 | 1 |
| `skills/topic-to-video/scripts/lib/project.mjs` | Modify | 校验 8 个互动的物件能力匹配（`INTERACTION_INVALID`）、`state`（`STATE_UNSUPPORTED`）与 `send` 范围 | 1 |
| `skills/topic-to-video/scripts/lib/match.mjs` | Modify | 新增 `NO_INTERACTION`、`GESTURE_REPEAT`；`STATIC_SECONDS` 改为 4 | 2 |
| `skills/topic-to-video/scripts/lib/stage.mjs`、`templates.mjs` | Modify | `evaluateStageObjects`、`renderSendPacket`、`state` 过渡、`draw` 逐字显影、前/背景分层 | 3 |
| `skills/topic-to-video/scripts/lib/motion.mjs`、`rig.mjs` | Modify | 8 个同台互动走近与 IK 求解、`sit_on` 座面对齐、`carry` 跟踪、自动转头与点头 | 4 |
| `skills/topic-to-video/scripts/lib/scene.mjs`、`encode.mjs` | Modify | 互动管线串联、前景层夹心渲染、`SCENE_VERSION = 5`、互动期豁免 `HOST_OBJECT_OVERLAP` | 5 |
| `skills/topic-to-video/references/world.md`、`storyboard.md`、`README.md`、`README.en.md`、`site/index.html` | Modify | 动作卡与 10 个新 cue 文档、4 秒上限与两项新警告、同步站内说明 | 2、6 |
| `examples/cache-speed/` | Modify | 升级为冰箱+超市同台互动示范片（`project.json`、`讲稿.md`、`分镜.md`、`提示词包.md`） | 6 |
| `tests/interaction.test.mjs` | Create | 互动动作、锚点误差、物体跟随、`state`、`send`、自动配合与前/后分层全套测试 | 3、4、5 |
| `tests/scenarios/09-stage-interaction.json`、`tests/scenario-specs.test.mjs` | Create / Modify | 场景 09：把缓存讲成冰箱和超市的 L0 实测规格 | 7 |

---

### Task 1: Schema 与 `project.mjs` 互动/`state`/`send` 校验

**Files:**
- Modify: `skills/topic-to-video/schema/project.schema.json`
- Modify: `skills/topic-to-video/scripts/lib/project.mjs`
- Test: `tests/schema.test.mjs`、`tests/project.test.mjs`

**Interfaces:**
- Consumes: `PROP_META`, `customPropMeta`, `COMMON_STATES`, `propSupportsState` from `./icons.mjs`（批次 1）
- Produces:
  - `INTERACTION_CUES = ['open', 'carry', 'push', 'pull', 'hold_up', 'draw', 'sit_on', 'react']`
  - `SENDABLE_PROPS = ['package', 'doc', 'mail', 'ticket', 'money', 'key']`
  - `DRAWABLE_PROPS = ['whiteboard', 'clipboard', 'doc', 'book']`
  - `project.mjs` 校验错误码：`INTERACTION_INVALID`（提示该物件支持的动作）、`STATE_UNSUPPORTED`（覆盖 `state` cue）、`CUE_TARGET_RANGE`（覆盖 `send` 的 `link`/节点索引）

- [ ] **Step 1: 写失败测试（`tests/schema.test.mjs`、`tests/project.test.mjs`）**

测试以下断言：
1. Schema 接受合法的 8 个互动 cue（含 `carry` `"none"`）、`state` cue（带 `value`）、`send` cue（带 `value`）；拒绝：`state`/`send` 缺 `value`、普通 cue 如 `reveal` 多写了 `value`、`open` 写字符串目标。
2. `checkProject`：
   - 对 `cup` 写 `open`、对 `fridge` 写 `carry`/`hold_up`/`sit_on`、对 `cloud`（空中）写 `push`、对 `box` 写 `draw`、对自定义道具写 `open` 或 `draw`、或在 `host-left` 上写互动 cue → 均报 `INTERACTION_INVALID`，且错误信息列出该物件支持的动作。
   - 对 `stage` 物件写 `state` 为支持的专属/通用/`count:304` 通过；写不支持的状态报 `STATE_UNSUPPORTED`；非 `stage` 模板写通用状态（如 `crossed`）通过、写专属状态（如 `open`）报 `STATE_UNSUPPORTED`。
   - `send` 在 `stage` 里 `target` 必须在 `[0, links.length)`，在 `flow` 里必须在 `[1, nodes.length)`，`value` 须在 `SENDABLE_PROPS` 或可拿起的自定义道具里，否则报错。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/schema.test.mjs tests/project.test.mjs`
Expected: FAIL（schema 和 `project.mjs` 不认识新 `do` 与 `value`）。

- [ ] **Step 3: 实现 schema 与 `project.mjs` 校验**

- 在 `project.schema.json` 的 `$defs.cue` 增加 `value` 字符串字段与 10 个新 `do` 的 `allOf` 条件约束。
- 在 `project.mjs` 更新 `SCHEMA_FIELDS.cue`（加 `value`），导出 `INTERACTION_CUES`、`SENDABLE_PROPS`、`DRAWABLE_PROPS`，在 `checkCues` 里按设计 §4.3、§6.1–§6.3 实现能力判定辅助函数 `supportedInteractions(propId, layer, customProps)` 并返回清晰的中文错误提示。

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/schema.test.mjs tests/project.test.mjs && npm test`
Expected: 全部通过（同步检查 `tests/references.test.mjs`：若它断言 schema 中每个 cue 都出现在文档里，顺手在 `references/world.md` 先列出这 10 个 cue 名称清单并在 Task 6 补完动作卡，确保每步提交 `npm test` 都全绿）。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/schema/project.schema.json skills/topic-to-video/scripts/lib/project.mjs skills/topic-to-video/references/world.md tests/schema.test.mjs tests/project.test.mjs
git commit -m "feat(check): validate stage interaction cues, state transitions, and send cues"
```

---

### Task 2: `match.mjs` 新增 `NO_INTERACTION`、`GESTURE_REPEAT` 并收紧 `STATIC_STRETCH` 到 4 秒

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/match.mjs`
- Modify: `skills/topic-to-video/references/storyboard.md`（同步"超过 4 秒没有变化"及两项警告名，保持 ≤ 10 KB）
- Test: `tests/match.test.mjs`、`tests/references.test.mjs`

**Interfaces:**
- Consumes: `INTERACTION_CUES` from `./project.mjs`
- Produces:
  - `STATIC_SECONDS = 4`
  - `lintStoryboard(project)` 新增返回 `NO_INTERACTION` 和 `GESTURE_REPEAT` 警告

- [ ] **Step 1: 写失败测试（`tests/match.test.mjs`）**

测试以下断言：
1. `stage` 镜头没有任何互动 cue 且没有 `tap` → 报 `NO_INTERACTION`；加上 `open` 或 `tap` 后警告消失；`host-left` 镜头不报 `NO_INTERACTION`。
2. `GESTURE_REPEAT`：
   - 同一镜头 `host.gesture: "point"` 后第 1 句又显式写了 `gesture: "point"` → 报 `GESTURE_REPEAT`。
   - 同一镜头连续两次显式 `gesture` cue 目标相同 → 报 `GESTURE_REPEAT`。
   - 相邻两个出镜镜头 `host.gesture` 相同且后一个镜头没有别的显式 `gesture` cue → 报 `GESTURE_REPEAT`；后一个镜头有别的 `gesture` cue 或换了起始动作则不报。
3. `STATIC_SECONDS === 4`：5 秒无 cue 的镜头报 `STATIC_STRETCH`，3.5 秒的不报；检查结果仍为 warning（`checkProject` 无 error）。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/match.test.mjs`
Expected: FAIL（`STATIC_SECONDS` 仍为 8，缺少两个新警告）。

- [ ] **Step 3: 实现 `match.mjs` 规则并同步 `storyboard.md`**

- `match.mjs`：把 `STATIC_SECONDS` 改为 `4`；新增 `lintStageInteraction`（查 `NO_INTERACTION`）和 `lintGestureRepeat`（查镜头内连续显式动作重复 + 跨相邻出镜镜头起始动作重复）。
- `storyboard.md`：把 `8 秒` 改成 `4 秒`，在自查/警告句中补充 `NO_INTERACTION` 和 `GESTURE_REPEAT`（确认字节数仍 ≤ 10 KB）。
- 检查 `tests/match.test.mjs` 中依赖 8 秒阈值的旧用例（如有）同步更新为以 `STATIC_SECONDS` 为准。

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/match.test.mjs tests/references.test.mjs tests/budget.test.mjs && npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/match.mjs skills/topic-to-video/references/storyboard.md tests/match.test.mjs
git commit -m "feat(lint): add NO_INTERACTION and GESTURE_REPEAT warnings and tighten STATIC_STRETCH to 4s"
```

---

### Task 3: `stage.mjs` 与 `templates.mjs` 的动态状态、`draw` 显影与 `send` 运送

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/stage.mjs`
- Modify: `skills/topic-to-video/scripts/lib/templates.mjs`
- Test: `tests/interaction.test.mjs`（新建）

**Interfaces:**
- Consumes: `drawIcon`, `drawCustomProp`, `isCountState` from `./icons.mjs`; `easeOutBack`, `easeOutCubic`, `easeInOutCubic`, `clamp01`, `lerp` from `./ease.mjs`
- Produces:
  - `evaluateStageObjects(shotPlan, t, hostMeta) -> { objectStates: ObjectRuntimeState[], sends: SendRuntime[] }`
    - `ObjectRuntimeState`: `{ state, prevState, stateProgress, dx, dy, liftY, carried, heldUp, drawProgress, bump }`
  - `renderSendPacket(fromPt, toPt, propName, u, { style, seed, customProps }) -> string`（沿与 `links`/`flow` 相同的二次贝塞尔弧线绘制小物件，`u` 在 `(0, 1)` 之外返回空字符串）
  - `renderStage` 输出拆分 `backVectorSvg`（常规物件与连线）和 `frontVectorSvg`（正在 `carry`/`hold_up` 的物件与飞行中的 `send` 包裹），`vectorSvg = backVectorSvg + frontVectorSvg`；`drawProgress < 1` 时 `label` 逐字显影；`state` 切换在 `0.3 s` 内完成动效后保持新状态
  - `renderDiagram` 支持非 `stage` 模板上的通用状态叠加（`crossed`/`stamped`/`broken`/`dim`/`active`/`count:*`）以及 `flow` 箭头上的 `send` 包裹

- [ ] **Step 1: 写失败测试 `tests/interaction.test.mjs`**

测试以下断言：
1. `state` cue：切换前保持初始状态；切换后 `0.15 s` 处于动效中（`0 < stateProgress < 1`）；`0.35 s` 后稳定为新状态（`data-state="expired"` / `"open"` / `"crossed"`）；`open` 互动 cue 结束后物件状态自动变为 `open`。
2. `push`/`pull` 位移：动作完成后目标物件 `dx` 变化约 `±160 px`（方向背离或朝向小青）并夹紧在舞台 `[120, 1800]` 内，过程带轻微回弹。
3. `carry` 与 `hold_up` 分层：被抱起或举起时物件跟随 `hostMeta.interaction.handPos` 坐标并出现在 `frontVectorSvg` 而不在 `backVectorSvg`；放下后回到 `backVectorSvg`。
4. `draw`：`t` 在 `[t0, t0 + 1]` 期间 `label` 逐字增长，`t >= t0 + 1` 显示完整文字。
5. `send`：在 `stage` 的 `links[0]` 和 `flow` 箭头上，`t = t0 + 0.4` 时渲染出 `data-send-packet="package"` 且位置在起终点弧线中点附近；`t < t0` 与 `t > t0 + 0.85` 时无残留包裹，到达 `0.8 s` 时终点物件触发 `bump > 0`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/interaction.test.mjs`
Expected: FAIL（`evaluateStageObjects`、`renderSendPacket` 未导出）。

- [ ] **Step 3: 实现 `stage.mjs` 与 `templates.mjs` 动效与分层**

- 在 `stage.mjs` 实现 `evaluateStageObjects`、`renderSendPacket` 并把 `renderStage` 拆为 `backVectorSvg` / `frontVectorSvg`；更新 `label` 截断逻辑支持 `drawProgress`；对 `bump` 做 `1 + 0.08 * sin(pi * u)` 弹性缩放。
- 在 `templates.mjs` 的 `renderDiagram` 接入通用状态叠加（读取 `elementStates[i].state`/`stateProgress`）与 `flow` 的 `send` 包裹绘制。

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/interaction.test.mjs tests/stage.test.mjs tests/visuals.test.mjs && npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/stage.mjs skills/topic-to-video/scripts/lib/templates.mjs tests/interaction.test.mjs
git commit -m "feat(stage): animate object states, push/pull/carry/draw transforms, send packets, and front/back layering"
```

---

### Task 4: `motion.mjs` 8 个同台互动、自动走近与自动微配合

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/motion.mjs`
- Modify: `skills/topic-to-video/scripts/lib/rig.mjs`（若 `sit_on` 需要按 `seatY` 调整骨盆落座高度，增加可选 `seatY` 支持，默认不动）
- Test: `tests/interaction.test.mjs`

**Interfaces:**
- Consumes: `solveTwoBoneIK`, `aimArmAt`, `walkFrame`, `forwardKinematics`（已有）；`elements[i].anchors` & `standSpots`（来自 `layoutStage`）
- Produces:
  - `evaluateHostAt` 返回新增字段：
    - `interacting: boolean`（互动进行中或正坐在物件上时为 `true`）
    - `interaction: null | { kind, targetIdx, phase, handPos: [number, number], carriedIdx: number | null, carriedPos: [number, number] | null, droppedSpots: Record<number, { x, y }> }`
  - 支持 8 个互动 cue：
    - 距离目标锚点 `> 0.35 * H` 时自动插入走近段（`source: 'auto_approach'`），走完后再触发动作（复用已有 `afterWalk` 机制）
    - `open`（0.6 s，IK 握 `handle` 拉开）、`carry`（握 `handle` 抬起跟随，放下旧 `prop`；`target: 'none'` 放下在脚边）、`push`/`pull`（0.7 s，前倾/后仰 IK 抵住侧面/把手并同步推拉 160 px）、`hold_up`（1.5 s，双手举过头顶后放回）、`draw`（1.0 s，在 `front` 锚点做书写往复轨迹）、`sit_on`（持续到下次 `move` 或互动，骨盆落到 `seat` 高度）、`react`（0.8 s，不走动，面朝目标按好/坏状态欢呼或后缩）
  - 自动配合（设计 §6.4）：新元素 `reveal` 后空闲时转头看 0.6 s；`highlight` 或 `state` 变化后空闲时点头 0.35 s；`stage` 镜头句意自动挑动作同样跳过上一句保持型动作

- [ ] **Step 1: 写失败测试（追加到 `tests/interaction.test.mjs`）**

测试以下断言（完整覆盖设计 §6.1、§6.4、§9 及 Review Focus #1–#2）：
1. 8 个互动全覆盖：每个动作峰值帧时，计算 `forwardKinematics` 的手腕/手掌（或 `sit_on` 的 `pelvis`）世界坐标，距离目标锚点误差 `<= 2 px`（`react` 校验朝向目标且坏状态 `expired` 身体后缩、好状态 `fresh` 举手欢呼）。
2. 自动走近：小青在 `x = 240`，冰箱在 `x = 1320`，触发 `open` 目标 0 → 先出现 `walking` 片段走到冰箱旁，再在到达后执行 `open`（不是在 `240` 隔空伸手）。
3. `carry` 链条：原本手里拿着 `prop: 'phone'`，`carry` 物件 0 后 `prop` 自动变为 `'none'`，`carriedIdx === 0`，随后 `move` 到 `right` 时 `carriedPos[0]` 跟着小青一起向右移动；`carry` `"none"` 后 `carriedIdx === null` 且记录落地位置；若直接 `carry` 物件 1，物件 0 自动放下。
4. `sit_on`：坐在 `chair` 上时 `pelvis[1]` 贴合 `chair.anchors.seat[1]`（误差 `<= 4 px`），小青脚仍不穿地；下一次 `move` 时站起离开。
5. 自动配合：无显式动作时，元素 `reveal` 后 `0.2 s` 头部转向目标元素；`highlight` 或 `state` 变化后 `0.15 s` 头部产生点头角度偏移。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/interaction.test.mjs`
Expected: FAIL（`evaluateHostAt` 尚未处理互动 cue，`interaction` 未返回）。

- [ ] **Step 3: 实现 `motion.mjs` 与 `rig.mjs` 座面对齐**

- 在 `motion.mjs` 中：
  - 规划走位段时同时扫描需要走近的 7 个互动 cue（不含 `react`、不含 `carry: "none"`），若距目标站位超过 `0.35 * H` 自动合成 `auto_approach` 走位段，把互动起始时间锚在走完那一刻；考虑前面 `push`/`pull` 对物件 `x` 的累计偏移，保证后续互动对准最新位置。
  - 针对每个互动用 `solveTwoBoneIK` 计算手臂关节角（`hold_up` 和 `push` 解算双臂），实时输出 `handPos`（通过 `forwardKinematics` 精确读取 `l_hand` 世界坐标，保证物件与手 0 像素错位）。
  - 在 `rig.mjs` 的 `forwardKinematics` 支持可选 `seatY`：当 `sit_on` 传入 `seatY` 时，将 `pelvis` 对齐到 `seatY` 并让小腿自然垂向地面（不穿出 `ground`）。
  - 在 `computeMicroActing` 中把 `reveal`（0.6 s 转头）与 `highlight`/`state`（0.35 s 轻点头）叠加到空闲帧的 `head`/`gaze`。

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/interaction.test.mjs tests/motion.test.mjs tests/persona.test.mjs && npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/motion.mjs skills/topic-to-video/scripts/lib/rig.mjs tests/interaction.test.mjs
git commit -m "feat(motion): add eight stage interactions with auto-approach IK, carry tracking, seat alignment, and micro-reactions"
```

---

### Task 5: `scene.mjs` 与 `encode.mjs` 接通互动管线与 `SCENE_VERSION = 5`

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/scene.mjs`
- Modify: `skills/topic-to-video/scripts/lib/encode.mjs`
- Test: `tests/interaction.test.mjs`、`tests/scene-encode.test.mjs`、`tests/qa.test.mjs`

**Interfaces:**
- Consumes: `evaluateHostAt`（Task 4）；`evaluateStageObjects`、`renderStage`、`renderSendPacket`（Task 3）
- Produces:
  - `SCENE_VERSION = 5`
  - `evaluateFrame` 在 `stage` 镜头中按顺序合成：`styleBackground → sceneBackground → backVectorSvg → hostSvg → frontVectorSvg → textItems`
  - `buildElementStates` 支持把 `state` 与 `send` cue 传给非 `stage` 模板
  - `encode.mjs` 当 `main.hostMeta.interacting` 为真时豁免 `objectOverlapFrames`（Review Focus #3）

- [ ] **Step 1: 写失败测试（`tests/interaction.test.mjs`、`tests/scene-encode.test.mjs`）**

测试以下断言：
1. `evaluateFrame` 渲染带 `carry` 和 `send` 的 `stage` 镜头时，`vectorSvg` 中 `data-scene` 在前、普通物件居中、小青（`data-host`）在后、被抱起的物件与 `data-send-packet` 在小青之后。
2. `evaluateFrame` 渲染带 `send` 的 `flow` 镜头时，在 `0.4 s` 出现 `data-send-packet`；带 `state: "crossed"` 的 `bullets` 镜头出现 `data-state="crossed"`。
3. 互动中（如 `sit_on` / `open` / `carry`）`hostMeta.interacting === true`，`renderProject` 渲染该镜头时 QA 不报 `HOST_OBJECT_OVERLAP`；非互动帧故意让小青与物件重叠时仍报 `HOST_OBJECT_OVERLAP`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/interaction.test.mjs tests/scene-encode.test.mjs`
Expected: FAIL（`scene.mjs` 未调用 `evaluateStageObjects`、未拆分前/后层、`SCENE_VERSION` 仍为 4）。

- [ ] **Step 3: 串联 `scene.mjs` 与 `encode.mjs`**

- `scene.mjs`：
  - `SCENE_VERSION = 5`。
  - `evaluateFrame`：先跑 `evaluateHostAt` 拿到 `hostMeta`（含 `interaction`），再跑 `evaluateStageObjects(shotPlan, t, hostMeta)` 传给 `renderStage`，拼装 `backVectorSvg + hostSvg + frontVectorSvg`；非 `stage` 模板把 `state`/`send` 信息传入 `renderDiagram`。
  - 互动发生时（`carry`/`open`/`push`/`pull`/`send` 运动窗）置 `isFastMotion = true`（开启选择性运动模糊）。
- `encode.mjs`：统计 `objectOverlapFrames` 时加条件 `&& !main.hostMeta.interacting`。

- [ ] **Step 4: 跑测试验证全绿**

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/scene.mjs skills/topic-to-video/scripts/lib/encode.mjs tests/interaction.test.mjs tests/scene-encode.test.mjs
git commit -m "feat(scene): wire stage interactions, layered rendering, flow send packets, and interaction QA exemption"
```

---

### Task 6: 完善动作卡文档、README/官网并升级 `examples/cache-speed/` 为同台示范片

**Files:**
- Modify: `skills/topic-to-video/references/world.md`（补完 8 个互动、`state`/`send`、动作卡与删除测试，≤ 10 KB）
- Modify: `skills/topic-to-video/references/storyboard.md`（链接到动作卡，保持 ≤ 10 KB）
- Modify: `skills/topic-to-video/references/prompt-pack.md`（若示例片 `sh05` 变动，同步示例片节拍校验）
- Modify: `README.md`、`README.en.md`、`site/index.html`
- Modify: `examples/cache-speed/project.json`、`examples/cache-speed/讲稿.md`、`examples/cache-speed/分镜.md`、`examples/cache-speed/提示词包.md`
- Test: `tests/example.test.mjs`、`tests/references.test.mjs`、`tests/budget.test.mjs`

**Interfaces:**
- Consumes: Task 1–5 全部能力
- Produces: 0 错误、0 文档差异、0 警告的新版 `examples/cache-speed/` 冰箱+超市同台示范片，以及完整的 L0 互动文档

- [ ] **Step 1: 写失败测试（`tests/example.test.mjs`、`tests/references.test.mjs`）**

测试以下断言：
1. `references/world.md` 包含"动作卡"、全部 10 个批次 2 cue（`open`、`carry`、`push`、`pull`、`hold_up`、`draw`、`sit_on`、`react`、`state`、`send`）、删除测试与 `NO_INTERACTION`/`GESTURE_REPEAT` 说明，且体积 ≤ 10 KB、行数 ≤ 250。
2. `examples/cache-speed/project.json` 包含 `world`（比喻含冰箱与超市），出镜镜头中 `stage` 占比 ≥ 60%，至少用到 4 种不同互动 cue、`state` 和 `send`，且 `checkProject`、`checkDerivedDocs`、`lintScript`、`lintStoryboard` 全部返回空数组（0 errors、0 docs、0 warnings）。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/example.test.mjs tests/references.test.mjs`
Expected: FAIL（`examples/cache-speed/` 还是旧版 `host-left`，`world.md` 缺动作卡）。

- [ ] **Step 3: 更新文档并改写 `examples/cache-speed/`**

- 在 `world.md` 补完动作卡（句意 → 动作 → 对象 → 前后状态 + 删除测试）与 10 个新 cue 用法；确认 `world.md` 和 `storyboard.md` 都在 10 KB 以内。
- 改写 `examples/cache-speed/project.json`：
  - `world`: `metaphor: "缓存是家门口的冰箱，服务器是远处的超市，304 是打电话问超市东西还新鲜吗"`、`style: "paper"`、`scene: "kitchen"`（超市镜头单镜切 `street`）。
  - 把核心讲解镜头改为 `stage` 版式：开冰箱拿东西（`open` + `carry`）、推走旧包裹（`push`）、沿箭头发请求/回 304（`send`）、过期打叉与盖章（`state` + `react`）、高举 304 票据（`hold_up`）、坐在箱子上总结（`sit_on`）；保留开场 `host-left` 标题与纯数据 `full` 柱状图展示三种版式自然混排。
  - 同步更新 `讲稿.md`、`分镜.md`（含视觉世界一行）、`提示词包.md`（含风格与场景描述），并用 `node skills/topic-to-video/scripts/check.mjs examples/cache-speed` 核对输出 `errors: []`、`warnings: []`、`docs: []`；同步 `references/prompt-pack.md` 里引用的示例镜头节拍。
- 同步更新 `README.md`、`README.en.md`、`site/index.html` 介绍同台互动能力。

- [ ] **Step 4: 跑全量测试验证全绿**

Run: `node skills/topic-to-video/scripts/check.mjs examples/cache-speed && npm test`
Expected: `check.mjs` 退出码 0 且 `errors`/`warnings`/`docs` 全为空；`npm test` 全部通过（含 `tests/budget.test.mjs`）。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/references/world.md skills/topic-to-video/references/storyboard.md skills/topic-to-video/references/prompt-pack.md README.md README.en.md site/index.html examples/cache-speed tests/example.test.mjs tests/references.test.mjs
git commit -m "feat(example): upgrade cache-speed to fridge-and-supermarket stage interactions and finish action card docs"
```

---

### Task 7: 场景评测 09 与批次 2 全片 540p 预览验收

**Files:**
- Create: `tests/scenarios/09-stage-interaction.json`
- Modify: `tests/scenario-specs.test.mjs`

**Interfaces:**
- Consumes: 完整的 S + A 技能与渲染器
- Produces: 场景 09 评测规格 + `out/a-accept/out/preview.mp4` 完整 540p 预览片供 owner 验收；经 owner 同意后在 agy 上跑场景 09 并记录结果

- [ ] **Step 1: 添加场景 09 规格并更新 `tests/scenario-specs.test.mjs`**

创建 `tests/scenarios/09-stage-interaction.json`：
- 第 1 轮提示：`"帮我做一个 1 分钟左右的视频，把“浏览器缓存和 304”讲成家门口的冰箱和远处超市，让小青和冰箱、超市互动起来。"`
- 第 2 轮提示：`"方案可以，出提示词包。"`
- 检查项（4 条）：
  1. `project.json` 写了 `world`（含冰箱/超市比喻、合法 `style` 和 `scene`），且 `分镜.md` 开头列出视觉世界。
  2. 至少 60% 的出镜镜头使用 `layout: "stage"`，且至少用到 2 种批次 2 互动/状态 cue（如 `open`、`carry`、`state`、`send`、`hold_up`、`react`）。
  3. 自动检查摘要 `schema_errors`、`check_errors`、`derived_docs` 全为空，无 `NO_INTERACTION` 和 `ESTIMATE_OFF_TARGET`。
  4. 第 2 轮记录 `plan` 确认并产出 `提示词包.md`，提示词里体现风格包、场景和同台互动（不含英文枚举名）；全程无付费调用。

Run: `node --test tests/scenario-specs.test.mjs && npm test`
Expected: 全部通过。

```bash
git add tests/scenarios/09-stage-interaction.json tests/scenario-specs.test.mjs
git commit -m "test(scenario): add scenario 09 for visual world and stage interactions"
```

- [ ] **Step 2: 渲染 `examples/cache-speed` 540p 预览并自检**

把 `examples/cache-speed` 复制到 `out/a-accept/`（配置免费 `edge-tts` `female-warm`，不改动 `examples/cache-speed/project.json`）并渲染：

```bash
node skills/topic-to-video/scripts/render.mjs out/a-accept --preview
```

核对项：
1. `qa.json`：`ok: true`、`issues: 0`（无 `HOST_OBJECT_OVERLAP`、`RUSHED_MOVE`、`UNPLANNED_JUMP`）。
2. 逐镜抽帧检查每个 `stage` 镜头：小青真的走到物件旁拉开门/搬包裹/发请求/盖章/举票据/坐箱子，没有隔空指空气，画面静止不超过 4 秒。
3. 核对 540p 渲染耗时相对 H 阶段增幅不超过 30%。

- [ ] **Step 3: 征得 owner 同意后跑场景 09 实测**

先向 owner 说明会消耗 agy 配额并请示，获得同意后运行：

```bash
npm run scenario -- --scenario 09 --mode skill --agent agy --model gemini-3.8-flash-medium
```

4 条检查全过后把结果目录提交进仓库，汇总批次 2 验收报告与预览片路径请 owner 终审。
