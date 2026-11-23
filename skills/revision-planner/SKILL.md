---
name: revision-planner
description: 用户要求改讲稿、一个表情、字幕、图表或角色版本时，计算需重做的最小依赖集合。 Use to translate a natural-language revision into affected fields, shots, approvals and reusable artifacts.
metadata:
  version: "1.0.0"
  input_contracts: "workflow.schema.json#/$defs/RevisionRequest"
  conditional_input_contracts: "script.schema.json storyboard.schema.json workflow.schema.json#/$defs/CompiledTimeline"
  output_contracts: "workflow.schema.json#/$defs/ChangePlan"
  permissions: "policies/permissions.yaml#/skills/revision-planner"
  budget_class: "local"
  gates: "G1 G2 G3 G4 G5"
---

# 把自然语言返修映射为局部变更 · Map an edit request to its dependencies

<a id="chinese"></a>

中文 · [English](#english)

## 启动条件与输入

从编辑基线的版本和依赖图出发，首次编译前使用当前脚本/分镜依赖，无须制造编译产物。

输入契约见[RevisionRequest](../../schemas/workflow.schema.json#/$defs/RevisionRequest)、[CompiledTimeline](../../schemas/workflow.schema.json#/$defs/CompiledTimeline)。

## 工作步骤

1. 定位字段和对象，说明变更意图、预计费用、受影响镜头、可复用产物及须重开的审批。
2. 样式只动字幕/合成。表情只动该镜头角色层及合成。语音长度变化时重算后续绝对位置，同步检查跨边界字幕与音效。
3. 用户确认高影响变更后，由编排器创建新版本并比较基线快照，保留原审批和缓存用于回看。

## 输出与交接

ChangePlan 提交编排器派回原负责 Skill，再由 QA 复查受影响范围。

输出契约见[ChangePlan](../../schemas/workflow.schema.json#/$defs/ChangePlan)。

## 受限或失败时

基线过期返回版本冲突并重新估算。无法定位所指镜头时用缩略图或时间码让用户选择。

## English

[中文](#chinese)

### Inputs and prerequisites

Start from the edit baseline revision and its dependency graph. Before the first compile, use the available script and storyboard dependencies.

Input contracts — [RevisionRequest](../../schemas/workflow.schema.json#/$defs/RevisionRequest), [CompiledTimeline](../../schemas/workflow.schema.json#/$defs/CompiledTimeline).

### Procedure

1. Locate the affected objects and fields. Describe the requested change, estimated cost, affected shots, reusable outputs and approvals to reopen.
2. A subtitle style change affects subtitles and compositing. An expression change affects the shot’s character layer and composition. When speech length changes, recalculate downstream absolute positions and inspect captions and sound effects crossing the boundary.
3. After the user confirms a high-impact change, have the orchestrator create a revision and compare it against the baseline snapshot. Retain previous approvals and cached outputs for review.

### Outputs and handoff

Submit `ChangePlan` to the orchestrator, which routes work back to the owning skill. QA checks the affected range.

Output contracts — [ChangePlan](../../schemas/workflow.schema.json#/$defs/ChangePlan).

### When blocked

Return a version conflict and re-estimate when the baseline is stale. If the intended shot is ambiguous, ask the user to choose by thumbnail or timecode.
