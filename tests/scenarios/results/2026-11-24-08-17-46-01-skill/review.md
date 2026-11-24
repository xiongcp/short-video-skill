# 场景 01：缺主题时一次问齐，给出主题后用默认值出方案（skill）

运行：2026-11-24T08:24:13.950Z · agy 1.5.16 · 模型 gemini-3.8-flash-high · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [x] 第 1 轮只提问、不产出文件；一次列出所有缺失项：主题标为必答，时长、受众、比例给出默认值供修改
  - 证据：turn-1.md：只提问、未产出文件；主题标“必答”，时长 120 秒、普通观众、16:9 作为默认值列出
- [x] 第 2 轮没有再追问可以用默认值的项，直接产出 project.json、讲稿.md、分镜.md
  - 证据：turn-2.md 未再追问，产出 flight-altitude/ 下 project.json、讲稿.md、分镜.md
- [x] 讲稿.md 开头写明采用的默认值（120 秒、普通观众、16:9）
  - 证据：讲稿.md 第 5 行“采用的默认值：时长 120 秒，比例 16:9，浅色主题，受众为普通观众”
- [x] 第 2 轮结束时请用户确认讲稿和分镜，没有产出提示词包.md
  - 证据：turn-2.md 结尾“请您确认（确认①）”；workspace-turn-2 没有提示词包.md；checkpoints 为空
- [x] 自动检查摘要中 schema_errors、check_errors、derived_docs 都为空，lint_warnings 没有 ESTIMATE_OFF_TARGET
  - 证据：report.json：schema_errors、check_errors、derived_docs 均为空，lint_warnings 为空（估算 118.5 秒）
- [ ] 讲稿没有编造具体数据、研究或引用；需要核实的说法写进了 brief.open_questions
  - 证据：不通过：用户没给资料，Agent 也没查阅任何网页，却在 brief.sources 写了“ICAO · 标准大气与民用航空器运行手册”“NASA · 飞机空气动力学与巡航高度原理”（只是官网首页），open_questions 为空，讲稿.md 写“待核实：无”；s02 称“空气密度仅地面四分之一”（实际约三分之一）

## 自动检查摘要

```json
[
  {
    "file": "flight-altitude/project.json",
    "files": [
      "project.json",
      "ref",
      "分镜.md",
      "讲稿.md"
    ],
    "schema_errors": [],
    "check_errors": [],
    "lint_warnings": [],
    "derived_docs": [],
    "revision": 1,
    "target_seconds": 120,
    "checkpoints": []
  }
]
```
