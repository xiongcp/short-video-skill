# 场景 03：确认后只改一段讲稿和一个镜头的表情（skill）

运行：2026-11-25T07:34:58.859Z · agy 1.5.17 · 模型 default · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [x] 第 2 轮记录了 plan 确认，并产出提示词包.md
  - 证据：report.json checkpoints 有 {stage: plan, revision: 1, note: “确认，没问题。”}；workspace-turn-2 有 提示词包.md，脚本核对 11 镜都有口播、节拍、首帧图、运动四行，7 个 host-left 镜头首帧图都逐字含 prompt_lock.zh；turn-2.md：“主持人参考图：ref/host.png（“小青”手绘火柴人基准参考图）”，ref/host.png 与 host-ref.png 相同，提示词包.md 无“晴”
- [x] 第 3 轮只改了第二段（s02）及其镜头，以及第一个镜头的表情；其他段落和镜头逐字未变（对比第 2、3 轮的 workspace）；除表情外，Agent 还删掉了 sh01 句 1 的 `expr surprised` cue，并删去分镜.md sh01 的“，换惊叹表情”（仍在 sh01 内，判定不变）
  - 证据：diff workspace-turn-2 与 workspace-turn-3：project.json 只改了 revision、s02 的 text、sh01 的 host.expr（curious → happy）并删掉 sh01 句 1 的 expr surprised cue、sh03 和 sh04 的 visual 与 note；讲稿.md 只改 s02、状态行和估时行；分镜.md 只改 sh01、sh03、sh04 三行和总估时；其他段落和镜头逐字未变
- [x] revision 加 1；回复里说明原确认因改动失效，列出改了什么、没改什么，并请用户确认改动部分
  - 证据：report.json revision 为 2；turn-3.md：“方案版本已更新为 revision 2”“本次改动会让之前的确认失效”，有“改动的内容”“未改动的内容”两节，末尾“请检查上述改动的段落与镜头。如果确认符合预期，请回复确认”
- [x] 第 3 轮没有重写提示词包.md，只在标题下加了一行“以下镜头已过期，待确认后更新：…”
  - 证据：提示词包.md 的 diff 只有标题下第 4 行新增“> 以下镜头已过期，待确认后更新：sh01、sh03、sh04”，没有改其他内容
- [x] 自动检查摘要中 schema_errors、check_errors、derived_docs 都为空
  - 证据：report.json 中 schema_errors、check_errors、derived_docs 都为空，storyboard_warnings 和 lint_warnings 也为空；turn-3.log 最后一次 check.mjs 的 errors、warnings、docs 都是空数组

## 观察

1. **读文件**：第 1 轮读了 `SKILL.md`（5,575）、`script.md`（6,178）、`storyboard.md`（9,044）3 份，第 2 轮读了 `prompt-pack.md`（5,858）、`profile.json`（1,271），共 5 份 27,926 字节，没有读脚本和 schema；第 3 轮没有再读 skill 文件。第 1 轮先运行了一次 `check.mjs --help`，得到 PARSE_ERROR（把 `--help` 当成了项目路径）。
2. **新动作、道具和 move**：动作用了 `think`、`shrug`、`present`、`point`、`emphasize`、`wave`，道具只用了一次（sh01 句 0 拿起 `question` 问号牌，句 1 `none` 放下）；`move` 一次都没有用。
3. **新警告**：`MOVE_TOO_MANY`、`FOCUS_SPLIT`、`STATIC_STRETCH` 都没有触发；第 1 轮唯一的错误是 sh05 的 flow 节点超过 6 字（`TEXT_TOO_LONG`），改完后为空。
4. **返修**：第 3 轮没有读任何 skill 文件，第一次 `check.mjs` 报“讲稿.md 没有逐字包含段落 s02”和“提示词包.md 已过期”两条 docs，Agent 补上讲稿和提示词包的标注后，第二次为空。
5. **两个小问题**：sh01 改成 `happy` 后，Agent 顺手删掉了 sh01 句 1 的 `expr: surprised` cue，turn-3.md 没有提到这一处；第 2 轮 turn-2.md 把 open_questions 写成“该通俗化表述已确认适用”，而 project.json 里的原文是“需确认此简化程度是否符合预期”，回复和文件不一致。

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
        "at": "2026-11-24T23:30:51-08:00",
        "note": "确认，没问题。"
      }
    ]
  }
]
```
