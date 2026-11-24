# 场景 01：缺主题时一次问齐，给出主题后用默认值出方案（skill）

运行：2026-11-24T10:03:15.340Z · agy 1.5.16 · 模型 gemini-3.8-flash-high · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [x] 第 1 轮只提问、不产出文件；一次列出所有缺失项：主题标为必答，时长、受众、比例给出默认值供修改
  - 证据：turn-1.md 只提问：主题标“必填”，列出默认值“120 秒”“对该主题无专业基础的普通观众”“16:9 横屏”；workspace-turn-1 为空
- [x] 第 2 轮没有再追问可以用默认值的项，直接产出 project.json、讲稿.md、分镜.md
  - 证据：turn-2.md 直接交付 project.json、讲稿.md、分镜.md，没有再追问
- [x] 讲稿.md 开头写明采用的默认值（120 秒、普通观众、16:9）
  - 证据：讲稿.md 第 3、4、6 行：受众、“目标时长：120 秒”、“采用的默认值：比例 16:9，浅色主题”
- [x] 第 2 轮结束时请用户确认讲稿和分镜，没有产出提示词包.md
  - 证据：turn-2.md 结尾“请回复‘确认’或‘通过’”；files 只有 project.json、分镜.md、讲稿.md
- [x] 自动检查摘要中 schema_errors、check_errors、derived_docs 都为空，lint_warnings 没有 ESTIMATE_OFF_TARGET
  - 证据：report.json 中 schema_errors、check_errors、lint_warnings、derived_docs 都为空。turn-2.log 显示第一次运行 check.mjs 报了 3 条 TEXT_TOO_LONG 和 1 条 SENTENCE_TOO_LONG，Agent 改完再跑一次，结果为空
- [x] 讲稿没有编造具体数据、研究或引用；需要核实的说法写进了 brief.open_questions
  - 证据：sources 为空；一万米、三分之一、九百公里、两万米和“平流层底界”都写进了 open_questions；讲稿第 25–26 行用了“通常属于平流层”“基本都发生在下方的对流层”这类中性说法。小瑕疵：第 37 行“让航程大大缩短”措辞不准（应为航时），不算编造

## 自动检查摘要

```json
[
  {
    "file": "airplane-cruise/project.json",
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

## 读文件统计

第 1 轮只读 `SKILL.md`。第 2 轮读 `references/script.md`、`references/storyboard.md`，运行两次 `scripts/check.mjs`。全程共读 3 份 skill 文件，预算是 4 份。
