# 场景 03：确认后只改一段讲稿和一个镜头的表情（skill）

运行：2026-11-24T10:46:18.611Z · agy 1.5.16 · 模型 gemini-3.8-flash-high · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [x] 第 2 轮记录了 plan 确认，并产出提示词包.md
  - 证据：report.json checkpoints 有 {stage: plan, revision: 1, note: “确认，没问题。”}；workspace-turn-2 有 提示词包.md
- [x] 第 3 轮只改了第二段（s02）及其镜头，以及第一个镜头的表情；其他段落和镜头逐字未变（对比第 2、3 轮的 workspace）
  - 证据：第 2、3 轮 workspace 对比：只改了 s02 的标题和正文、sh03 与 sh04 的图解和 note、sh01 的表情（由 curious 改为 happy，并删掉了原本在第 1 句切到 happy 的那条 cue，note 措辞也顺带改了）；其他段落和镜头逐字未变
- [x] revision 加 1；回复里说明原确认因改动失效，列出改了什么、没改什么，并请用户确认改动部分
  - 证据：revision 1 → 2；turn-3.md 有“本次改动内容”“未改动部分（逐字保留）”“请您确认”三节，并说明原方案确认已失效
- [x] 第 3 轮没有重写提示词包.md，只在标题下加了一行“以下镜头已过期，待确认后更新：…”
  - 证据：提示词包.md 的 diff 只有标题下新增的一行“> 以下镜头已过期，待确认后更新：sh01、sh03、sh04”
- [x] 自动检查摘要中 schema_errors、check_errors、derived_docs 都为空
  - 证据：report.json 中 schema_errors、check_errors、derived_docs 都为空

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
        "at": "2026-11-24T02:40:42-08:00",
        "note": "确认，没问题。"
      }
    ]
  }
]
```

## 读文件与自检

- 第 1 轮读 `SKILL.md`、`script.md`、`storyboard.md`，还分 3 段读了 `schema/project.schema.json`（日志里看不出原因）。第 2 轮读 `prompt-pack.md` 和 `profile.json`。第 3 轮读了 `scripts/lib/docs.mjs`。
- 第 3 轮读源码，是被自检的报错误导了。Agent 改完 `project.json` 后运行 `check.mjs`，它报“提示词包.md 标题下第一行应写‘未经确认的方案’”，但返修时正确的做法是加“已过期”一行。Agent 去翻了 `check.mjs` 和 `docs.mjs` 的源码，才加对了这一行。这个报错已在之后的提交里改成“提示词包.md 已过期……在标题下加一行‘以下镜头已过期……’”。
