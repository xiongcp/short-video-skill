# 场景 01：缺主题时一次问齐，给出主题后用默认值出方案（skill）

运行：2026-11-24T10:36:31.848Z · agy 1.5.16 · 模型 gemini-3.8-flash-high · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [x] 第 1 轮只提问、不产出文件；一次列出所有缺失项：主题标为必答，时长、受众、比例给出默认值供修改
  - 证据：turn-1.md 只提问：主题标“必填”，时长“默认 120 秒”、受众“默认 零基础普通观众”、比例“默认 16:9 横屏”；workspace-turn-1 为空
- [x] 第 2 轮没有再追问可以用默认值的项，直接产出 project.json、讲稿.md、分镜.md
  - 证据：turn-2.md 直接交付 project.json、讲稿.md、分镜.md，没有再追问
- [x] 讲稿.md 开头写明采用的默认值（120 秒、普通观众、16:9）
  - 证据：讲稿.md 第 3–6 行：受众、“目标时长：120 秒”、“采用的默认值：比例 16:9，浅色主题”
- [x] 第 2 轮结束时请用户确认讲稿和分镜，没有产出提示词包.md
  - 证据：turn-2.md 结尾“请回复‘确认’”；files 只有 project.json、分镜.md、讲稿.md
- [x] 自动检查摘要中 schema_errors、check_errors、derived_docs 都为空，lint_warnings 没有 ESTIMATE_OFF_TARGET
  - 证据：report.json 中 schema_errors、check_errors、lint_warnings、derived_docs 都为空；讲稿.md 各段估时（15/15/28/22/23/21 秒）和总估算 124 秒与 check.mjs 的 estimates 一致
- [x] 讲稿没有编造具体数据、研究或引用；需要核实的说法写进了 brief.open_questions
  - 证据：sources 为空；巡航高度、密度三成、八九百公里、对流层顶高度都写进了 open_questions；讲稿用“大多集中在这里”“通常进入了平流层”“极少有恶劣天气”这类中性说法，lint 没有 ABSOLUTE_CLAIM。小瑕疵：“零下几十度”“十几分钟”这类模糊数字没有列进待核实

## 自动检查摘要

```json
[
  {
    "file": "cruise-altitude/project.json",
    "files": [
      "project.json",
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

## 读文件与自检

全程读 3 份 skill 文件：`SKILL.md`、`script.md`、`storyboard.md`。从第 1 步起每写完一步就运行一次 `check.mjs`，共 5 次。估时照抄了 `estimates`；但 Agent 仍用 `node -e` 数了两次总字数，因为 `check.mjs` 没有输出字数。
