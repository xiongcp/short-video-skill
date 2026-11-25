# 场景 03：确认后只改一段讲稿和一个镜头的表情（skill）

运行：2026-11-25T02:17:10.607Z · agy 1.5.16 · 模型 gemini-3.8-flash-high · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [x] 第 2 轮记录了 plan 确认，并产出提示词包.md
  - 证据：report.json checkpoints 有 {stage: plan, revision: 1, note: “确认，没问题。”}；workspace-turn-2 有 提示词包.md
- [x] 第 3 轮只改了第二段（s02）及其镜头，以及第一个镜头的表情；其他段落和镜头逐字未变（对比第 2、3 轮的 workspace）
  - 证据：第 2、3 轮 project.json 对比：只改了 s02、它的三个镜头 sh03–sh05 的图解和 note、sh01 的表情（curious → happy）、revision，以及 brief.open_questions 里关于旧比喻的那一条（改成快递驿站比喻，随 s02 一起更新）；其他段落和镜头逐字未变
- [x] revision 加 1；回复里说明原确认因改动失效，列出改了什么、没改什么，并请用户确认改动部分
  - 证据：revision 1 → 2；turn-3.md：“本次改动会使原先的确认暂时失效”，并有“改动的内容”“未改动的内容（逐字保留）”“请确认”三节
- [x] 第 3 轮没有重写提示词包.md，只在标题下加了一行“以下镜头已过期，待确认后更新：…”
  - 证据：提示词包.md 的 diff 只有标题下新增的一行“> 以下镜头已过期，待确认后更新：sh01、sh03、sh04、sh05”
- [x] 自动检查摘要中 schema_errors、check_errors、derived_docs 都为空
  - 证据：report.json 中 schema_errors、check_errors、derived_docs 都为空；三轮里 `pronunciation` 都写在段落 s01、s04 里，项目顶层没有

## 观察

1. **读音表位置**：第 1 轮就把 `pronunciation` 写进了段落（s01、s04 各一条 HTTP），没有触发 `UNKNOWN_FIELD`。三轮共运行 `check.mjs` 6 次，全部没有报错或警告。
2. **读文件**：第 1 轮 3 份（`SKILL.md`、`script.md`、`storyboard.md`），第 2 轮 2 份（`prompt-pack.md`、`profile.json`），返修那一轮没有再读 skill 文件。

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
    "storyboard_warnings": [],
    "derived_docs": [],
    "revision": 2,
    "target_seconds": 90,
    "checkpoints": [
      {
        "stage": "plan",
        "revision": 1,
        "at": "2026-11-24T18:13:08-08:00",
        "note": "确认，没问题。"
      }
    ]
  }
]
```
