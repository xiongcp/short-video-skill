# 视觉世界与舞台（world + stage）

写分镜前先定全片 `world`，在**确认①**连同讲稿、分镜给用户看。无 `world` 旧项目按 `settings.theme`（`light` → `paper`，`dark` → `night`）配色，不能用 `stage`（`check.mjs` 报 `STAGE_NEEDS_WORLD`）。

## 1. 定视觉世界（`world`）

```json
"world": {
  "metaphor": "缓存是家门口的冰箱，服务器是远处的超市，304 是打电话问超市东西还新鲜吗",
  "style": "paper",
  "scene": "kitchen",
  "custom_props": []
}
```

- `metaphor`（必填，≤ 60 字）：贯穿全片的一句话比喻，决定物件与舞台关系。
- `style`（必填）：5 套风格包之一；`settings.theme` 仍按必填写，仅用于 L0 区分浅/深色。
- `scene`（必填）：8 个场景之一，用作默认背景；单个 `stage` 镜头可用 `shot.scene` 切换。
- 服装和配音不写进 `world`：按场景推荐写进 `settings.outfit` 和 `voice.preset`。
- 音乐情绪按场景自动推荐，不用写；要改、要关或用自己的音乐见 [providers.md](providers.md) 的声音一节。
- `分镜.md` 开头写：`视觉世界：<比喻>；风格 <style>；场景 <scene>`（须与 `world` 一致）。

## 2. 五套风格包（`style`）

同一种手绘墨线；深色纸面小青自动改浅色墨线，青色围巾和呆毛始终不变。

| `style` | 纸面 | 墨线 | 强调色 | 适合主题 |
| --- | --- | --- | --- | --- |
| `paper` | 米白手账纸 + 96 px 浅网格 | 深灰 | 青、黄、红 | 通用知识（默认） |
| `chalkboard` | 墨绿黑板 + 淡擦痕 | 粉笔白 | 粉笔黄、粉笔红、粉笔青 | 科普、历史、课堂 |
| `blueprint` | 深蓝底 + 48/192 px 双网格 | 浅蓝白 | 青蓝、黄、红 | 工程、原理、结构 |
| `kraft` | 暖色牛皮纸 + 淡纤维线 | 深棕 | 砖红、墨绿、芥黄 | 生活、商业、怀旧 |
| `night` | 深灰蓝 + 浅网格 | 浅灰白 | 青、黄、红 | 安全、宇宙、夜间话题 |

语义色键（11 个，自定义道具 `fill` 用它或 `none`）：`paper`、`grid`、`ink`、`muted`、`card`、`accent`、`yellow`、`red`、`soft_accent`、`soft_yellow`、`soft_red`。

## 3. 八个场景（`scene`）与推荐搭配

场景仅画在 `stage` 后方两侧与上方，避开中央表演区，共踩地面线 y = 930。

| `scene` | 背景画面 | 推荐服装（`settings.outfit`） | 推荐配音（`voice.preset`） |
| --- | --- | --- | --- |
| `blank` | 只有地面线 | 不穿（`none`） | `female-warm` / `male-sunny` |
| `podium` | 讲台、幕布、聚光灯 | `glasses`（或 `none`） | `male-pro` / `female-warm` |
| `kitchen` | 墙砖、吊柜、台面、窗户 | `apron` 或 `chef_hat` | `female-lively` / `female-warm` |
| `street` | 店面雨棚、路灯、咖啡馆 | 不穿（`none`） | `female-warm` / `male-sunny` |
| `lab` | 实验架、烧瓶、操作台、吊灯 | `glasses` | `male-sunny` / `female-warm` |
| `office` | 书架、办公桌、百叶窗、挂钟 | `glasses` | `male-pro` / `female-warm` |
| `outdoor` | 远山、太阳、云朵、树木围栏 | 不穿（`none`） | `male-passion` / `child-cute` |
| `workshop` | 工具墙、扳手锤子、工作台 | `hardhat` | `male-sunny` / `male-passion` |

## 4. 60 个内置物件与状态

用于 `stage` 的 `objects[].prop`，及 `bullets`/`flow` 的 `icons`、`timeline`/`cycle` 的 `icon`。

| 分组 | 物件名 |
| --- | --- |
| 原有 24 个 | `browser`、`server`、`database`、`cache`、`clock`、`doc`、`user`、`phone`、`cloud`、`lock`、`key`、`chart`、`check`、`cross`、`warn`、`bulb`、`gear`、`network`、`folder`、`image`、`search`、`money`、`plane`、`globe` |
| 家居厨房 8 个 | `fridge`、`cup`、`pot`、`table`、`chair`、`door`、`window`、`trash` |
| 商店街道 6 个 | `shop`、`cart`、`box`、`wallet`、`piggybank`、`house` |
| 交通物理 6 个 | `car`、`truck`、`rocket`、`battery`、`magnet`、`scale` |
| 科学教育 6 个 | `beaker`、`microscope`、`book`、`whiteboard`、`brain`、`heart` |
| 办公信息 6 个 | `laptop`、`mail`、`megaphone`、`calendar`、`stamp`、`clipboard` |
| 小件与符号 4 个 | `package`、`ticket`、`shield`、`hourglass` |

- **通用状态**（所有物件支持）：`normal`、`active`、`dim`、`crossed`、`stamped`、`broken`、`count:<值>`（`<>` 内最多 4 个字符）。
- **专属状态**（仅部分物件支持，错用报 `STATE_UNSUPPORTED`）：
  - `open` / `closed`：`folder`、`fridge`、`pot`、`door`、`window`、`trash`、`shop`、`box`、`wallet`、`book`、`laptop`、`mail`
  - `full` / `empty`：`server`、`database`、`fridge`、`cup`、`pot`、`trash`、`cart`、`box`、`wallet`、`piggybank`、`truck`、`battery`、`beaker`、`hourglass`
  - `locked` / `unlocked`：`lock`、`folder`、`door`、`shield`
  - `fresh` / `expired`：`doc`、`fridge`、`package`、`ticket`、`hourglass`
  - `lit` / `off`：`browser`、`server`、`cache`、`phone`、`bulb`、`rocket`、`laptop`

## 5. 自定义道具（`world.custom_props`）

内置不够时用几何图元拼接（不收任意 SVG）：

```json
{ "id": "c_fishtank", "label": "鱼缸", "height": 0.5, "layer": "ground",
  "parts": [
    { "shape": "rect", "x": -0.9, "y": -0.5, "w": 1.8, "h": 1.5, "fill": "soft_accent" },
    { "shape": "circle", "cx": -0.3, "cy": 0.2, "r": 0.15, "fill": "yellow" },
    { "shape": "poly", "points": [[0.1, 0.2], [0.4, 0.05], [0.4, 0.35]], "fill": "yellow" },
    { "shape": "line", "points": [[-0.9, -0.3], [0.9, -0.3]] }
  ] }
}
```

- **上限**：每期最多 **4 件**，每件最多 **12 个图元**；越界、超量或重名报 `CUSTOM_PROP_INVALID`。
- **规格**：`id` 以 `c_` 开头（小写字母/数字/下划线）；`height` 在 `0.1–1.5`（以小青身高 400 px 为 1 H）；坐标在 `[-1, 1]`，底边 `y = 1`；图元只支持 `rect`（`x, y, w, h`）、`circle`（`cx, cy, r`）、`line`（2–6 点）、`poly`（3–8 点）；`fill` 写语义色键或 `none`。只支持通用状态。

## 6. `stage` 舞台版式写法

`stage` 为主力出镜版式（建议占出镜 60%–80%），人与物件共踩地面线。`layout` 与 `visual.template` 须同为 `stage`，且写 `host`（可选 `host.at`）。

```json
{ "id": "sh05", "section": "s02", "sentences": [0, 1], "layout": "stage",
  "host": { "expr": "curious", "gesture": "idle", "at": "left" },
  "visual": { "template": "stage", "data": {
    "heading": "家门口的冰箱",
    "objects": [
      { "prop": "fridge", "label": "缓存", "at": "mid-left", "state": "closed" },
      { "prop": "shop", "label": "服务器", "at": "right", "size": "sm" }
    ],
    "links": [{ "from": 0, "to": 1, "style": "dashed", "label": "很远" }]
  } },
  "cues": [{ "sentence": 1, "do": "move", "target": 0 }],
  "note": "缓存就在手边，服务器在远处" }
```

- `objects`：1–5 个（序号 0..n-1 供 cue 填 `target`）；`label` ≤ 8 字，参与关键词检查。`heading` 可选，≤ 14 字。
- `at`：5 个槽位 `left`、`mid-left`、`center`、`mid-right`、`right`（x 240/600/960/1320/1680），或 `0.08–0.92` 比例。
- `layer`：`ground`（贴地）、`mid`（叠同槽地面物顶面，否则 y 762）、`air`（高空 y ≤ 470）。缺省用物件默认值。
- `size`：`sm`（0.75×）、`md`（1×，默认）、`lg`（1.3×）。
- `links`：0–4 条连接两物件（`from`、`to` 为序号，`style` 为 `solid` 或 `dashed`，可选 `label`）。
- 自动排版：自动防重叠（≥ 40 px）并留 200 px 站位；最小缩至 0.6 倍，仍挤报 `STAGE_CROWDED`。

## 7. 同台互动、状态与动作卡

### 互动与状态 cue

- **8 个互动 cue**（限 `stage`，`target` 填物件序号，自动走近后再动作；写 `value` 报 `INVALID_VALUE`，不支持报 `INTERACTION_INVALID`）：
  - `open`：打开支持 `open` 的物件（`fridge`/`box`/`door`/`shop` 等）。
  - `carry`：拿起可携物件（或 `height ≤ 0.45` 自定义道具）随 `move` 移动；写 `"none"` 放下，拿第二件自动放下第一件。
  - `push` / `pull`：把落地物件推远或拉近 160 px。
  - `hold_up`：双手高举展示可携物件 1.5 秒。
  - `draw`：在 `whiteboard`/`clipboard`/`doc`/`book` 上比划并逐字写出 `label`。
  - `sit_on`：走去坐上 `chair`/`table`/`box`（或 `height ≤ 0.6` 自定义道具），下次 `move` 自动起身。
  - `react`：面向物件按其状态反应（`expired`/`broken`/`crossed`/`empty` 惊退，其余欢呼）。
- `state`：`target` 填元素序号，`value` 填状态名；`stage` 可用专属/通用/`count:<值>`，图解模板仅用通用与 `count:<值>`。
- `send`：`value` 为 `package`/`doc`/`mail`/`ticket`/`money`/`key` 或可携自定义道具；`stage` 填 `links` 序号，`flow` 填目标节点序号（≥ 1），沿线飞抵终点。

### 动作卡（句意 → 动作 → 对象 → 前后状态）

| 句意 | 动作 | 对象 | 前后状态 |
| --- | --- | --- | --- |
| 打开看内部 | `open` | `fridge`/`box`/`door` | `closed` → `open` |
| 取走或搬运 | `carry` + `move` | 可携物件 / `none` | 原位 → 随身 → 脚边 |
| 移开旧物 | `push` / `pull` | 落地物件 | 推远 / 拉近 160 px |
| 亮出凭证 | `hold_up` | `ticket`/`doc`/`key` | 原位 → 头顶举起 |
| 现场板书 | `draw` | `whiteboard`/`book` | 空白 → 逐字显现 |
| 坐下总结 | `sit_on` | `chair`/`box`/`table` | 站立 → 坐上 |
| 对结果反应 | `react` | 任意物件 | 异常惊退 / 正常欢呼 |
| 标出状态 | `state` | 物件或元素 | `fresh`→`expired`/`count:304` |
| 传递小件 | `send` | `links` 或 `flow` | 沿线飞抵终点 |

- **删除测试**：每条互动、`state` 或 `send` 都要推动本句句意；删掉它观众仍懂因果或位置变化的就删，不摆拍。
- **自检**：`stage` 镜头至少 1 个互动 cue 或 `tap`（否则 `NO_INTERACTION`）；连续重复 `gesture` 报 `GESTURE_REPEAT`。
