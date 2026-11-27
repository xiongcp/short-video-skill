# 场景 11：直接出片：不确认，一轮出带“未审核初稿”角标的 MP4（skill）

运行：2026-11-27T03:42:22.071Z · agy 1.5.18 · 模型 gemini-3.8-flash-high · 隔离用户级 skills：否

## 检查清单

逐条判定：通过写 [x]，不通过保持 [ ]；每条都在“证据”后引用 turn-N.md 的原话或 report.json 的字段。

- [ ] 一轮内产出 project.json、讲稿.md、分镜.md，并出了 out/final.mp4（1920×1080、60 fps、时长 54–66 秒）
  - 证据：一轮内产出了 `project.json`、`讲稿.md`、`分镜.md` 与 `out/final.mp4`，分辨率和帧率达标（`report.json` `render.final` 为 `width: 1920, height: 1080, fps: 60`），`schema_errors`、`check_errors`、`lint_warnings`、`storyboard_warnings`、`derived_docs` 全为空，`render.qa` 为 `ok: true, issues: 0`；但实测时长为 **66.62 秒**（`duration: 66.616667`），超出 54–66 秒区间 0.62 秒，故此项按严格口径判不通过。
- [x] qa.json 的 draft 为 true，checkpoints 里没有 plan 确认
  - 证据：`report.json` 中 `render.qa.draft` 为 `true`，`checkpoints` 为 `[]`；`workspace-turn-1/winter-static/out/qa.md` 第 4 行为“未审核初稿：讲稿和分镜还没确认，画面左上角带"未审核初稿"角标；确认后重新出片即可去掉”。
- [x] 最后的回复说明这是未审核初稿、画面带角标，以及确认后重出就能去掉角标
  - 证据：`turn-1.md` 第 32 行写明“因您指定直接出片，当前成片画面左上角自动附带‘未审核初稿’角标”，第 39 行与第 56 行写明“确认后重新渲染即可去掉‘未审核初稿’角标”及“回复‘确认方案’，系统将记录 plan checkpoint 并仅重渲生成无角标的最终母版”。
- [x] 没有写提示词包.md；没有安装工具，没有付费调用
  - 证据：`report.json` 的 `files` 为 `["audio", "cache", "out", "project.json", "分镜.md", "讲稿.md"]`，无 `提示词包.md`；`turn-1.log` 中所有 `run_command` 均为本地 `doctor.mjs`、`check.mjs`、`render.mjs`、`uvx --from edge-tts`、`say`、`grep`/`ls`/`node -e`，无安装工具或付费调用。

## 结论

- 3 / 4 通过（1 项因时长 66.62 秒超出 54–66 秒上限 0.62 秒未通过）。skill 版本：commit `4084447`（`dirty: false`）；`agy 1.5.18`，模型 `gemini-3.8-flash-high`。
- 观察：模型一轮内完成讲稿、分镜、配音与 1080p60 渲染，并在首次 QA 发现 `HOST_OBJECT_OVERLAP` 与 `LINK_LABEL_OVER_HOST` 后主动调整 `sh03` 物件槽位，借助镜头缓存 46.5 秒完成局部重渲，使最终 QA 归零（`ok: true, issues: 0`，保留两条 3 帧 `FREEZE_DETECTED` 警告）。轻微瑕疵：除实测时长超出 66 秒上限 0.62 秒外，模型在制作前多次 `grep`/读取了 `scripts/` 源码并用 `node -e` 预检。

## 自动检查摘要

```json
[
  {
    "file": "winter-static/project.json",
    "files": [
      "audio",
      "cache",
      "out",
      "project.json",
      "分镜.md",
      "讲稿.md"
    ],
    "schema_errors": [],
    "check_errors": [],
    "lint_warnings": [],
    "storyboard_warnings": [],
    "derived_docs": [],
    "revision": 1,
    "target_seconds": 60,
    "checkpoints": [],
    "render": {
      "final": {
        "exists": true,
        "width": 1920,
        "height": 1080,
        "fps": 60,
        "duration": 66.616667
      },
      "qa": {
        "ok": true,
        "issues": 0,
        "draft": true
      }
    }
  }
]
```
