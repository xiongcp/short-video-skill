# 分镜：把口播变成镜头

## 镜头与句子

- 每段 `text` 按 `。！？`（含半角 `!?`）切句，从 0 编号；句末紧跟的 `”`、`）`、`》` 归前句。
- 每镜只属一段，如 `"section": "s02", "sentences": [0, 1]`。
- 按顺序覆盖：每段每句恰好属于一镜，顺序与段落一致，不跳句、不重叠、不回头。
- 每镜通常 1–3 句（4–12 秒）。同一画面超过 4 秒没有变化时加 cue 或拆镜，否则报 `STATIC_STRETCH`。
- 镜头 ID 依次为 `sh01`、`sh02`……。先写 `note`（这镜观众要看懂的变化），再选画面。
- 每镜只讲一个意思，只画此刻在说的东西；口播里的关键数字用 `number` 或 `bars` 表现。
- 镜头估时照抄 `check.mjs` 输出的 `estimates.shots`。

```json
{ "id": "sh01", "section": "s01", "sentences": [0], "layout": "host-left",
  "host": { "expr": "curious", "gesture": "think" },
  "visual": { "template": "title", "data": { "heading": "同一张图，两次打开", "sub": "还要从头下载吗？" } },
  "cues": [{ "sentence": 0, "do": "prop", "target": "question" }],
  "note": "抛出问题：第二次打开还要重新下载吗" }
{ "id": "sh02", "section": "s02", "sentences": [0, 1], "layout": "full",
  "visual": { "template": "flow", "data": { "nodes": ["浏览器", "服务器", "图标"] } },
  "cues": [{ "sentence": 1, "do": "reveal", "target": 2 }],
  "note": "第一次要走完整的来回" }
```

## 版式

| 版式 | 画面 | 适合 |
| --- | --- | --- |
| `host-left` | 图解在上部，主持人在下方，能走到元素旁边 | 开场标题、提问、文字总结 |
| `stage` | 主持人和物件落地同台（见 [world.md](world.md)） | 比喻、过程、对比（主力版式） |
| `full` | 图解占满画面，不出现主持人 | 纯数据图表、密集流程 |

- `host-left` 和 `stage` 必须写 `host`；`full` 不写。用 `stage` 须先在 `project.json` 定 `world`。
- 开场和结尾用 `host-left` 或 `stage`。连续 3 个以上 `full` 镜头时，中间插一个 `host-left` 或 `stage`，让观众喘口气。

## 主持人

主持人是火柴人"小青"：手绘墨线，系一条青色围巾，头顶一根呆毛随表情变形，在 `host-left` 和 `stage` 出场。性格是好奇的伙伴：爱凑近看，想通了打响指。

- **表情**（`expr`）：`explaining` 平稳讲解，`focused` 讲难点，`happy` 结论或轻松处，`curious` 提问（问号），`surprised` 意外（惊叹线），`worried` 踩坑（汗滴），`frustrated` 着急（抖动线），`proud` 得意（闪光），`amazed` 恍然大悟（星星眼、闪光）。
- **动作**（`gesture`）：保持型做到下一个动作：`idle` 站着，`point` 指向焦点元素，`present` 摊手介绍，`emphasize` 握拳下压，`think` 托腮，`shrug` 耸肩，`sit` 坐下，`lean_in` 凑近看。一次性做完回原位：`wave` 挥手，`jump` 原地跳，`cheer` 欢呼，`tap` 拍元素，`snap` 打响指，`startle` 吓一跳，`double_take` 再看一眼，`scratch_head` 挠头。未写动作时按句意自动挑。`point_right` 同 `point`。
- **道具**（`prop` cue）：`pointer` 教鞭，`magnifier` 放大镜，`phone` 手机，`doc` 文件，`bulb` 灯泡，`question` 问号牌；`none` 放下。同一时间只拿一件。
- **走位**（`move` cue）：走到元素旁，或 `left`、`center`、`right`。走到后面朝元素，要指再写 `point`。
- **焦点元素**：本镜最近一次 `reveal`、`highlight` 或 `move` 指定的元素，没有时为图解区中心。
- **服装**（`settings.outfit`）：`glasses`、`hardhat`、`chef_hat`、`apron`，全片一套；用户要求时才写，缺省不穿（场景推荐见 [world.md](world.md)）。
- **接戏**：每个出镜镜头从上一个出镜镜头结束时的站位、动作和道具接着演；道具不用了要放下。

按句意选：

| 句意 | 表情 | 动作 | 道具 | 走位 |
| --- | --- | --- | --- | --- |
| 开场打招呼、结尾告别 | `happy` | `wave` | — | — |
| 提问、制造悬念 | `curious` | `lean_in` 或 `think` | `question` | — |
| 反问、"其实没那么简单" | `curious` | `shrug` | — | — |
| 踩坑、出问题 | `worried` | `idle` | — | — |
| 着急、"等了半天" | `frustrated` | `emphasize` | — | — |
| 意外的事实、反转 | `surprised` | `startle` 或 `jump` | — | — |
| "等一下，再看一眼" | `surprised` | `double_take` | — | — |
| 困惑、"这就怪了" | `curious` | `scratch_head` | — | — |
| 讲难点、提醒注意 | `focused` | `emphasize` 或 `idle` | — | — |
| 让观众看某个元素 | `explaining` | `point` 或 `present` | 元素在高处时 `pointer` | 走到该元素 |
| 细看某个细节 | `focused` | `point` | `magnifier` | 走到该元素 |
| 敲定某个元素是关键 | `focused` | `tap` | — | 先走到该元素 |
| 讲手机、文档 | `explaining` | `present` | `phone` 或 `doc` | — |
| 想通了、揭晓答案 | `amazed` | `snap` | `bulb` | — |
| 关键结论 | `happy` 或 `proud` | `cheer` 或 `emphasize` | — | — |
| 轻松过渡 | `happy` | `sit` 或 `idle` | — | — |

- 同一镜头里句意变了，用 `expr`、`gesture` 或 `prop` cue 在那一句切换。
- 删除测试：每个 cue 都要对应口播，去掉它观众也不会少懂的就删掉。
- 同一句只有一个焦点：`move` 和这句的 `reveal`、`highlight` 指向同一个元素，否则 `check.mjs` 报 `FOCUS_SPLIT`。
- 每个镜头最多 2 次 `move`，否则报 `MOVE_TOO_MANY`；走动跟着正在讲的对象，不要来回踱步。`tap` 之前先走到该元素。
- 每个镜头最多换 1 次道具；`wave` 全片最多 2 次，`jump` 和 `cheer` 全片合计最多 3 次。
- 口播有"看右边""右侧""看这张图""看这里"等指示词时，该句动作要是 `point`、`present` 或 `tap`，否则报 `POINT_MISSING`。
- `stage` 镜头需有互动 cue 或 `tap`，否则报 `NO_INTERACTION`；连续重复同一动作报 `GESTURE_REPEAT`；同台互动、`state`/`send` 与动作卡见 [world.md](world.md)。

## 图解模板

| 模板 | `data` | 文字上限 | 可逐个出现的元素 |
| --- | --- | --- | --- |
| `title` | `heading`，可选 `sub` | 16 字 / 24 字 | 无 |
| `bullets` | `items`：1–4 条 | 每条 14 字 | 每一条 |
| `flow` | `nodes`：2–5 个 | 每个 6 字 | 每个节点（连同指向它的箭头） |
| `compare` | `left`、`right`：各含 `label` 和 1–3 行 `rows` | 标签 8 字，每行 12 字 | 0 是左栏，1 是右栏 |
| `number` | `value`、`label` | 8 字 / 12 字 | 无 |
| `bars` | `items`：1–6 个 `{label, value}`，可选 `unit` | 标签 6 字，单位 4 字 | 每根柱子 |
| `stage` | `objects` 1–5 个，可选 `heading`/`links`（详见 [world.md](world.md)） | 14 / 8 字 | 每个物件 |
| `timeline` | `items` 2–5 个 `{time, label, icon?}` | 6 / 8 字 | 每个时间点 |
| `cycle` | `items` 3–5 个 `{label, icon?}` | 6 字 | 每一步（含箭头） |

```json
{ "template": "flow", "data": { "nodes": ["验证信息", "询问服务器", "返回304"] } }
{ "template": "compare", "data": { "left": { "label": "没变", "rows": ["返回304", "继续用旧内容"] }, "right": { "label": "已更新", "rows": ["传回新正文", "替换旧内容"] } } }
```

- 画面只写从本镜口播取的关键词（可用阿拉伯数字），全部不在口播里时报 `VISUAL_NOT_IN_NARRATION`。
- 超字数上限时删字或拆镜，不缩字号。

## cue：说到某句时让画面变化

```json
"cues": [
  { "sentence": 3, "do": "reveal", "target": 1 },
  { "sentence": 3, "do": "move", "target": 1 },
  { "sentence": 3, "do": "gesture", "target": "point" },
  { "sentence": 4, "do": "highlight", "target": 2 },
  { "sentence": 4, "do": "expr", "target": "happy" }
]
```

| `do` | `target` | 效果 |
| --- | --- | --- |
| `reveal` | 元素序号（从 0 开始） | 该元素在这句开始时出现；没有 reveal 的元素从镜头开始就显示 |
| `highlight` | 元素序号 | 该元素在这句开始时变成强调色 |
| `expr` | 表情名 | 主持人在这句开始时换表情（仅限出镜镜头） |
| `gesture` | 动作名 | 主持人在这句开始时换动作（仅限出镜镜头） |
| `move` | 元素序号，或 `left`、`center`、`right` | 主持人在这句开始时走过去（仅限出镜镜头） |
| `prop` | 道具名，或 `none` | 主持人在这句开始时拿起道具，`none` 放下（仅限出镜镜头） |

- `sentence` 须在本镜 `sentences` 内；可选：`cue.at` 填本句关键词子串；`shot.transition: "cut"` 强制硬切；`bullets`/`flow` 可配 `data.icons`（[60 个内置图标](world.md)）。
- `title` 和 `number` 没有可单独指定的元素，不能用 `reveal`、`highlight` 或写序号的 `move`。

## 分镜.md 格式

```markdown
# 分镜：为什么缓存能让网页变快？

视觉世界：缓存是家门口的冰箱，服务器是远处的超市；风格 paper；场景 kitchen
共 14 个镜头，估算约 114 秒。样片候选：sh08–sh09（约 19 秒，含主持人、最难的图解和一次版式切换）。

| 镜头 | 段·句 | 估时 | 版式 | 主持人 | 图解 | 观众看懂什么 | cue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sh01 | s01·0 | 6 秒 | host-left | curious / think | title：同一张图，两次打开 / 还要从头下载吗？ | 抛出问题：第二次打开还要重新下载吗 | 句 0 拿起问号牌 |
```

样片候选：15–20 秒连续镜头，含主持人、最难图解和一次版式切换。

## 交付前自查

- [ ] 每句恰好属于一镜，顺序正确；cue 句号和元素序号不越界
- [ ] 画面文字不超上限，关键词出自口播；表情、动作、道具和走位与句意相符
- [ ] 开场和结尾是 `host-left` 或 `stage`；没有超过 4 秒不变的画面
- [ ] 分镜.md 列出每个镜头 ID 及视觉世界一行（有 `world` 时）；`check.mjs` 的 `docs` 为空
