# 场景 03：确认后只改一段讲稿和一个镜头的表情（skill）

运行：2026-11-24T09:08:37.477Z · agy 1.5.16 · 模型 gemini-3.8-flash-high · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [x] 第 2 轮记录了 plan 确认，并产出提示词包.md
  - 证据：turn-2：checkpoints 增加 plan/revision 1（“确认，没问题。”），产出提示词包.md
- [x] 第 3 轮只改了第二段（s02）及其镜头，以及第一个镜头的表情；其他段落和镜头逐字未变（对比第 2、3 轮的 workspace）
  - 证据：project.json 对比 turn-2→turn-3：只有 s02、sh03、sh04 和 sh01 的表情（curious→happy）变化，其余不变
- [x] revision 加 1；回复里说明原确认因改动失效，列出改了什么、没改什么，并请用户确认改动部分
  - 证据：revision 1→2；turn-3.md 列出“改动内容清单”和“保持不变的内容（逐字保留）”，说明原确认已失效并请确认
- [x] 第 3 轮没有重写提示词包.md，只在标题下加了一行“以下镜头已过期，待确认后更新：…”
  - 证据：diff 提示词包.md turn-2→turn-3：只多了一行“> 以下镜头已过期，待确认后更新：sh01、sh03、sh04”
- [x] 自动检查摘要中 schema_errors、check_errors、derived_docs 都为空
  - 证据：report.json：schema_errors、check_errors、derived_docs 均为空

## 自动检查摘要

```json
[
  {
    "file": "http-cache/project.json",
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
    "derived_docs": [],
    "revision": 2,
    "target_seconds": 90,
    "checkpoints": [
      {
        "stage": "plan",
        "revision": 1,
        "at": "2026-11-24T01:03:43-08:00",
        "note": "确认，没问题。"
      }
    ]
  }
]
```
