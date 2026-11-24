# 场景 01：缺主题时一次问齐，给出主题后用默认值出方案（skill）

运行：2026-11-24T09:52:29.898Z · agy 1.5.16 · 模型 gemini-3.8-flash-high · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [x] 第 1 轮只提问、不产出文件；一次列出所有缺失项：主题标为必答，时长、受众、比例给出默认值供修改
  - 证据：turn-1.md 只提问：主题标“必填”，时长“默认：120 秒”、受众“默认：对该主题没有专业基础的普通观众”、比例“默认：16:9 横屏”；workspace-turn-1 为空
- [x] 第 2 轮没有再追问可以用默认值的项，直接产出 project.json、讲稿.md、分镜.md
  - 证据：turn-2.md 直接交付 project.json、讲稿.md、分镜.md，没有再追问
- [x] 讲稿.md 开头写明采用的默认值（120 秒、普通观众、16:9）
  - 证据：讲稿.md 第 3–6 行：受众“对这个主题没有专业基础的普通观众”、“目标时长：120 秒”、“采用的默认值：比例 16:9，浅色主题”
- [x] 第 2 轮结束时请用户确认讲稿和分镜，没有产出提示词包.md
  - 证据：turn-2.md 结尾“请回复‘确认’”；files 只有 project.json、分镜.md、讲稿.md
- [ ] 自动检查摘要中 schema_errors、check_errors、derived_docs 都为空，lint_warnings 没有 ESTIMATE_OFF_TARGET
  - 证据：report.json schema_errors 非空：/shots/5/visual/data/left/label 和 right/label 超过 8 字（“对流层 (万米下)”“平流层 (万米上)”）。Agent 两次运行 check.mjs 都是 0 错误，因为 check.mjs 不检查 schema 的字数上限
- [ ] 讲稿没有编造具体数据、研究或引用；需要核实的说法写进了 brief.open_questions
  - 证据：sources 为空，三个数字（一万米、三分之一、十几分钟）都写进了 open_questions；但讲稿.md 第 25、34、36 行“一万米高空处于平流层底部”“雷暴、大雨和大风，都发生在一万米以下的对流层”“雷暴和暴雨都被踩在脚下”是说得过满的关键说法（中纬度对流层顶约 11 公里，强雷暴可高过巡航高度），没有列入待核实，也没有改成中性说法

## 自动检查摘要

```json
[
  {
    "file": "airplane-cruising-altitude/project.json",
    "files": [
      "project.json",
      "分镜.md",
      "讲稿.md"
    ],
    "schema_errors": [
      "/shots/5/visual/template must be equal to constant",
      "/shots/5/visual/data must have required property 'heading'",
      "/shots/5/visual/data must NOT have additional properties",
      "/shots/5/visual/data must NOT have additional properties",
      "/shots/5/visual/template must be equal to constant",
      "/shots/5/visual/data must have required property 'items'",
      "/shots/5/visual/data must NOT have additional properties",
      "/shots/5/visual/data must NOT have additional properties",
      "/shots/5/visual/template must be equal to constant",
      "/shots/5/visual/data must have required property 'nodes'",
      "/shots/5/visual/data must NOT have additional properties",
      "/shots/5/visual/data must NOT have additional properties",
      "/shots/5/visual/data/left/label must NOT have more than 8 characters",
      "/shots/5/visual/data/right/label must NOT have more than 8 characters",
      "/shots/5/visual/template must be equal to constant",
      "/shots/5/visual/data must have required property 'value'",
      "/shots/5/visual/data must have required property 'label'",
      "/shots/5/visual/data must NOT have additional properties",
      "/shots/5/visual/data must NOT have additional properties",
      "/shots/5/visual/template must be equal to constant",
      "/shots/5/visual/data must have required property 'items'",
      "/shots/5/visual/data must NOT have additional properties",
      "/shots/5/visual/data must NOT have additional properties",
      "/shots/5/visual must match exactly one schema in oneOf"
    ],
    "check_errors": "skipped: schema errors",
    "lint_warnings": "skipped: schema errors",
    "derived_docs": "skipped: schema errors or missing 讲稿.md/分镜.md",
    "revision": 1,
    "target_seconds": 120,
    "checkpoints": []
  }
]
```

## 读文件统计

第 1 轮只读 `SKILL.md`。第 2 轮读 `references/script.md`、`references/storyboard.md`，并运行两次 `scripts/check.mjs`；没有读 schema、`profile.json` 或脚本源码。全程共读 3 份 skill 文件，预算是 4 份；commit 3aed074 之前是 8 份。（第 1 轮另读了一份用户级的 superpowers skill，不属于本 skill。）
