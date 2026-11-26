# 场景 08：小青人设：指定安全帽与新表情动作（skill）

运行：2026-11-26T03:37:36.416Z · agy 1.5.17 · 模型 gemini-3.8-flash-medium · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [x] 第 1 轮没有为服装追问，直接在 project.json 里写入 settings.outfit 为 "hardhat"
  - 证据：第 1 轮直接给出完整方案、讲稿和分镜，没有追问服装；turn-1.md：“按照设定，主持人原创火柴人**小青已戴上黄色安全帽**（`outfit: hardhat`）参与出镜解说。”workspace-turn-1 与 workspace-turn-2 的 `airplane-wings/project.json` 第 21 行均为 `"outfit": "hardhat"`。
- [x] 分镜里至少用到 1 个 H 阶段新增的表情或动作（amazed、snap、lean_in、startle、double_take、scratch_head）
  - 证据：`airplane-wings/project.json` 用到了 2 个 H 新增项：`sh02` 的 `"host": { "expr": "curious", "gesture": "lean_in" }`，以及 `sh10` 的 `"host": { "expr": "amazed", "gesture": "cheer" }`。
- [x] 自动检查摘要中 schema_errors、check_errors、derived_docs 都为空，lint_warnings 没有 ESTIMATE_OFF_TARGET
  - 证据：下方自动检查摘要中 `schema_errors`、`check_errors`、`lint_warnings`、`storyboard_warnings`、`derived_docs` 全为 `[]`；`target_seconds` 为 60，讲稿估算约 55.5 秒。
- [x] 第 2 轮在 checkpoints 中记录了 stage 为 plan 的确认并产出提示词包.md，提示词包里的主持人描述包含“呆毛”且体现了安全帽；全程没有安装工具，也没有调用付费服务或 TTS
  - 证据：`report.json` 的 `checkpoints` 为 `[{"stage": "plan", "revision": 1, "at": "2026-11-25T19:35:22", "note": "方案可以，出提示词包。"}]`；`workspace-turn-2/airplane-wings/提示词包.md` 第 19 行全局锁定含“头顶正中一根呆毛（平时是向前弯的小卷，好奇时卷成问号，吃惊时竖直）”及“头戴黄色安全帽”，第 20 行禁止项为“人物除头顶一根呆毛、青色围巾和黄色安全帽外不加头发、衣服和身体填色”，各 `host-left` 镜头首帧图也均保留呆毛与安全帽描述。两轮 `run_command` 只有 `ls`、`check.mjs`、`doctor.mjs`、`mkdir/cp host-ref.png` 和 `grep`，没有安装工具，也没有调用 TTS 或任何付费服务。

## 结论

- 4 / 4 通过。skill 版本：commit `6f555d0`，目录无未提交改动（`report.json` 的 `skill` 字段）；`agy 1.5.17`，模型 `gemini-3.8-flash-medium`。
- 观察：模型准确读取了 `storyboard.md`、`prompt-pack.md` 与 `profile.json`，自然组合了 `settings.outfit: "hardhat"`、`lean_in` 与 `amazed`，并在 `提示词包.md` 中完整带出呆毛与黄色安全帽，没有与禁止项冲突。

## 自动检查摘要

```json
[
  {
    "file": "airplane-wings/project.json",
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
    "revision": 1,
    "target_seconds": 60,
    "checkpoints": [
      {
        "stage": "plan",
        "revision": 1,
        "at": "2026-11-25T19:35:22",
        "note": "方案可以，出提示词包。"
      }
    ]
  }
]
```
