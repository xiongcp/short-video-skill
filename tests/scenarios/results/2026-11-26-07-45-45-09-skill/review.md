# 场景 09：视觉世界与同台互动：冰箱和超市讲浏览器缓存和 304（skill）

运行：2026-11-26T07:56:41.991Z · agy 1.5.18 · 模型 gemini-3.8-flash-medium · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [x] project.json 写了 world（含冰箱/超市比喻、合法 style 和 scene），且分镜.md 开头列出视觉世界
  - 证据：`workspace-turn-2/http-cache-304/project.json` 第 31–36 行为 `"world": {"metaphor": "缓存是家里的冰箱，服务器是远处的超市，304 是打电话确认还能吃", "style": "paper", "scene": "kitchen", "custom_props": []}`；`workspace-turn-2/http-cache-304/分镜.md` 第 3 行为 `视觉世界：缓存是家里的冰箱，服务器是远处的超市，304 是打电话确认还能吃；风格 paper；场景 kitchen`。
- [x] 至少 60% 的出镜镜头使用 layout: "stage"，且至少用到 2 种批次 2 互动/状态 cue（如 open、carry、state、send、hold_up、react）
  - 证据：全片 9 个镜头全部出镜（`sh01`、`sh08` 为 `host-left`，`sh02`–`sh07` 与 `sh09` 共 7 镜为 `stage`），`stage` 占出镜镜头 7/9 = 77.8%（≥ 60%）。同台共使用 5 种批次 2 互动/状态/传送 cue：`open`（`sh02`、`sh04`）、`react`（`sh03`、`sh05`、`sh06`）、`send`（`sh04` 发 `package`、`sh06` 发 `doc`）、`state`（`sh06` 置 `fresh`）、`carry`（`sh07` 端牛奶及 `"none"` 放下）。
- [x] 自动检查摘要 schema_errors、check_errors、derived_docs 全为空，无 NO_INTERACTION 和 ESTIMATE_OFF_TARGET
  - 证据：`report.json` 中 `schema_errors`、`check_errors`、`lint_warnings`、`storyboard_warnings`、`derived_docs` 全为 `[]`；`target_seconds` 为 60，`check.mjs` 估算 `total_seconds` 为 57.8，无 `NO_INTERACTION` 与 `ESTIMATE_OFF_TARGET`。
- [x] 第 2 轮记录 plan 确认并产出提示词包.md，提示词里体现风格包、场景和同台互动（不含英文枚举名）；全程无付费调用
  - 证据：`report.json` 的 `checkpoints` 为 `[{"stage": "plan", "revision": 1, "at": "2026-11-25T23:54:24-08:00", "note": "方案可以，出提示词包。"}]`；第 2 轮产出 `workspace-turn-2/http-cache-304/提示词包.md`，§2 与逐镜首帧图写明“米白手账纸底色（带浅色细网格），深灰色墨线”与“极简线条勾勒的厨房背景线”，运动与首帧图将互动译为中文画面（如 `sh02` 拉开冰箱门、`sh04` 包裹沿虚线飞入冰箱、`sh05` 凑近看并拿出电话、`sh06` 单据沿虚线飞向超市并让冰箱叉号变绿对勾、`sh07` 端起牛奶杯、`sh09` 轻拍冰箱挥手告别），经检索全篇 `提示词包.md` 不含英文枚举名；`turn-1.log` 与 `turn-2.log` 中的 `run_command` 均为本地 `ls`/`node`/`grep`/`check.mjs`/`doctor.mjs`/`mkdir`/`cp`，无安装工具或付费调用。

## 结论

- 4 / 4 通过。skill 版本：commit `1d54105`（`dirty: false`）；`agy 1.5.18`，模型 `gemini-3.8-flash-medium`。
- 观察：模型先独立生成 `project.json`、`讲稿.md`、`分镜.md` 并请用户确认①，在收到“方案可以，出提示词包。”后记录 `plan` checkpoint 并完整交付 9 镜 `提示词包.md`（与 `turn-2.md` 一致）。唯一轻微瑕疵是 `brief.sources` 中写入了 `src01`（RFC 9111 链接）而未在工具中抓取该网页，但未影响 4 项既定检查。

## 自动检查摘要

```json
[
  {
    "file": "http-cache-304/project.json",
    "files": [
      "project.json",
      "ref",
      "分镜.md",
      "提示词包.md",
      "讲稿.md"
    ],
    "schema_errors": [],
    "check_errors": [],
    "lint_warnings": [],
    "storyboard_warnings": [],
    "derived_docs": [],
    "revision": 1,
    "target_seconds": 60,
    "checkpoints": [
      {
        "stage": "plan",
        "revision": 1,
        "at": "2026-11-25T23:54:24-08:00",
        "note": "方案可以，出提示词包。"
      }
    ]
  }
]
```
