# 场景 03：确认后只改一段讲稿和一个镜头的表情（skill）

运行：2026-11-25T02:01:56.444Z · agy 1.5.16 · 模型 gemini-3.8-flash-high · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [x] 第 2 轮记录了 plan 确认，并产出提示词包.md
  - 证据：report.json checkpoints 有 {stage: plan, revision: 1, note: “确认，没问题。”}；workspace-turn-2 有 提示词包.md
- [x] 第 3 轮只改了第二段（s02）及其镜头，以及第一个镜头的表情；其他段落和镜头逐字未变（对比第 2、3 轮的 workspace）
  - 证据：第 2、3 轮 project.json 对比：只改了 s02、sh04 的图解和 note（书桌抽屉 → 快递驿站）、sh01 的表情（curious → happy）和 revision；s02 的另一个镜头 sh03（浏览器、沟通规则、网站）与比喻无关，未改；其他段落和镜头逐字未变
- [x] revision 加 1；回复里说明原确认因改动失效，列出改了什么、没改什么，并请用户确认改动部分
  - 证据：revision 1 → 2；turn-3.md：“本次修改已使 revision 1 的确认状态转为待确认”，并有“改动内容清单”“未改动内容（逐字保留）”“请确认改动”三节
- [x] 第 3 轮没有重写提示词包.md，只在标题下加了一行“以下镜头已过期，待确认后更新：…”
  - 证据：提示词包.md 的 diff 只有标题下新增的一行“> 以下镜头已过期，待确认后更新：sh01、sh04”
- [ ] 自动检查摘要中 schema_errors、check_errors、derived_docs 都为空
  - 证据：report.json schema_errors 为 ["/ must NOT have additional properties"]，check_errors 和 derived_docs 因此跳过。原因是第 1 轮就在顶层写了 `pronunciation: [{term: "HTTP", reading: "H-T-T-P"}]`，schema 只允许它出现在 `sections[]` 里。script.md 只说“写进 `pronunciation`”，没有说写在段落里；`check.mjs` 不检查顶层的未知字段，三轮自检都是 0 错误，Agent 以为通过了

## 观察

1. **自检漏掉了 schema 错误**：这和此前“`check.mjs` 不检查字数上限”是同一类问题。需要两处修改：script.md 写明 `pronunciation` 放在对应段落里；`check.mjs` 对 schema 不认识的顶层字段（以及放错位置的 `pronunciation`）报错。这个缺口在本分支之前就存在，上一次场景 03 只是没有碰到。
2. **提示词包**：第 2 轮的提示词包有 11 个镜头，每镜都有四行，所有节拍秒数都在 `starts` 里，5 个 host-left 镜头的首帧图都逐字包含 `prompt_lock.zh` 的外观部分。
3. **新警告没有触发**：第 1 轮第一次运行 `check.mjs` 报了 `ABSOLUTE_CLAIM`、`SENTENCE_TOO_LONG`、`ESTIMATE_OFF_TARGET`，Agent 改完后之后 6 次都是空的；没有出现 `VISUAL_NOT_IN_NARRATION` 或 `POINT_MISSING`。
4. **读文件**：第 1 轮 3 份（`SKILL.md`、`script.md`、`storyboard.md`），第 2 轮 2 份（`prompt-pack.md`、`profile.json`），返修那一轮没有再读 skill 文件。

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
    "schema_errors": [
      "/ must NOT have additional properties"
    ],
    "check_errors": "skipped: schema errors",
    "lint_warnings": "skipped: schema errors",
    "storyboard_warnings": "skipped: schema errors",
    "derived_docs": "skipped: schema errors or missing 讲稿.md/分镜.md",
    "revision": 2,
    "target_seconds": 90,
    "checkpoints": [
      {
        "stage": "plan",
        "revision": 1,
        "at": "2026-11-24T17:57:00-08:00",
        "note": "确认，没问题。"
      }
    ]
  }
]
```
