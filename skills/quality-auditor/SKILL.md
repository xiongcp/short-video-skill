---
name: quality-auditor
description: 对样片、整片或返修镜头生成可复核的视听与事实质量报告。 Use to produce a reviewable quality report for a sample, complete program or revised shot.
metadata:
  version: "1.0.0"
  input_contracts: "workflow.schema.json#/$defs/ShotArtifacts workflow.schema.json#/$defs/CompiledTimeline evidence-set.schema.json"
  output_contracts: "workflow.schema.json#/$defs/QAReport"
  permissions: "policies/permissions.yaml#/skills/quality-auditor"
  budget_class: "local"
  gates: "G1 G3 G4"
---

# 把缺陷定位到事实、画面和声音 · Locate factual, visual and audio defects

<a id="chinese"></a>

中文 · [English](#english)

## 启动条件与输入

检查与目标哈希相同的文件、对齐、来源和媒体规格。审核状态从项目服务读取。

输入契约见[ShotArtifacts](../../schemas/workflow.schema.json#/$defs/ShotArtifacts)、[CompiledTimeline](../../schemas/workflow.schema.json#/$defs/CompiledTimeline)、[evidence-set](../../schemas/evidence-set.schema.json)。

## 工作步骤

1. 结构查引用、空洞、相邻边界，画面查黑帧、闪帧、字幕溢出、缺字体与角色漂移，声音查声轨、对齐、静音、峰值和编码信息。
2. 事实按 claim 回查来源与审核，图中数字与讲稿逐项比对。给每个问题附时间范围、镜头、严重度以及截图或波形引用。
3. 短片整支回看，长片额外抽查章口、重复图例与跨章响度。G4 提供全片播放、联系表、QA 和待修项。

## 输出与交接

QAReport 交人类 G3/G4，问题可转 revision-planner，自动 QA 不能签发批准。

输出契约见[QAReport](../../schemas/workflow.schema.json#/$defs/QAReport)。

## 受限或失败时

确定性硬缺陷记 blocking，审美及低置信问题交人工，保留 needs_review。

## English

[中文](#chinese)

### Inputs and prerequisites

Inspect the files, alignment, sources and media specification corresponding to the target hash. Read approval state from the project service.

Input contracts — [ShotArtifacts](../../schemas/workflow.schema.json#/$defs/ShotArtifacts), [CompiledTimeline](../../schemas/workflow.schema.json#/$defs/CompiledTimeline), [evidence-set](../../schemas/evidence-set.schema.json).

### Procedure

1. Check references, gaps and adjacent boundaries. Inspect frames for unintended black or flashing frames, caption overflow, missing fonts and identity drift. Check audio tracks, alignment, silence, peaks and codec information.
2. Trace each claim to its source and approval, and compare on-screen numbers to the script. Attach the time range, shot ID, severity and screenshot or waveform reference to each issue.
3. Watch every short in full. For long programs, also check chapter joins, recurring legends and loudness across chapters. Provide full playback, a contact sheet, the QA report and open fixes at G4.

### Outputs and handoff

Send `QAReport` to human G3/G4 reviewers and route actionable issues to `revision-planner`. Human reviewers issue approvals.

Output contracts — [QAReport](../../schemas/workflow.schema.json#/$defs/QAReport).

### When blocked

Mark deterministic hard defects `blocking`. Retain `needs_review` for aesthetic judgments and low-confidence findings until a human decides.
