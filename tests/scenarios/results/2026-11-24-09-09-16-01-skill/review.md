# 场景 01：缺主题时一次问齐，给出主题后用默认值出方案（skill）

运行：2026-11-24T09:14:07.615Z · agy 1.5.16 · 模型 gemini-3.8-flash-high · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [x] 第 1 轮只提问、不产出文件；一次列出所有缺失项：主题标为必答，时长、受众、比例给出默认值供修改
  - 证据：turn-1.md：只提问、未产出文件，只读了 SKILL.md（另读了 agy 自带的 using-superpowers）；主题必填，其余列默认值
- [x] 第 2 轮没有再追问可以用默认值的项，直接产出 project.json、讲稿.md、分镜.md
  - 证据：turn-2 未再追问，产出 airplane-cruise/ 下 project.json、讲稿.md、分镜.md
- [x] 讲稿.md 开头写明采用的默认值（120 秒、普通观众、16:9）
  - 证据：讲稿.md 第 6 行“采用的默认值：时长 120 秒，比例 16:9，浅色主题，普通观众受众”
- [x] 第 2 轮结束时请用户确认讲稿和分镜，没有产出提示词包.md
  - 证据：turn-2.md“五、确认提示……请回复确认”；没有提示词包.md；checkpoints 为空
- [x] 自动检查摘要中 schema_errors、check_errors、derived_docs 都为空，lint_warnings 没有 ESTIMATE_OFF_TARGET
  - 证据：report.json：schema_errors、check_errors、derived_docs、lint_warnings 均为空
- [x] 讲稿没有编造具体数据、研究或引用；需要核实的说法写进了 brief.open_questions
  - 证据：brief.sources 为空；讲稿里的 4 个具体数字（巡航高度区间、密度约三分之一、零下五十度、省一半以上燃油）逐条写进 open_questions，讲稿.md“待核实”照实列出。注意：“省一半以上燃油”本身缺乏依据，靠待核实交给用户

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
