---
name: render-orchestrator
description: 从编译快照安排角色烘焙、镜头合成、章节拼接和最终编码。 Use to schedule character baking, shot composition, chapter assembly and final encoding from a compiled snapshot.
metadata:
  version: "1.0.0"
  input_contracts: "workflow.schema.json#/$defs/CompiledTimeline workflow.schema.json#/$defs/CharacterActionPlan workflow.schema.json#/$defs/ScenePlan"
  output_contracts: "render-job.schema.json workflow.schema.json#/$defs/ShotArtifacts workflow.schema.json#/$defs/ChapterCheckpoint"
  permissions: "policies/permissions.yaml#/skills/render-orchestrator"
  budget_class: "render"
  gates: "G3 G4"
---

# 调度样片与成片渲染 · Schedule samples and final renders

<a id="chinese"></a>

中文 · [English](#english)

## 启动条件与输入

锁定渲染器、字体、Rig、媒体规格和输入快照。正式全片渲染检查 G3。

输入契约见[CompiledTimeline](../../schemas/workflow.schema.json#/$defs/CompiledTimeline)、[CharacterActionPlan](../../schemas/workflow.schema.json#/$defs/CharacterActionPlan)、[ScenePlan](../../schemas/workflow.schema.json#/$defs/ScenePlan)。

## 工作步骤

1. 先检查缓存和实物哈希，角色按镜头顺序烘焙透明帧。独立镜头的合成可并行，章内外按绝对帧顺序拼接。
2. 为每个工作单元持久化作业、幂等键和状态，涉及费用时先预留再提交。样片优先处理所选镜头。
3. 每镜回写帧数、产物哈希和依赖，长片逐章写检查点，最终统一混音和编码，向 QA 报告实际时长。

## 输出与交接

样片和正式母版分别交 quality-auditor，附对应版本和作业记录。

输出契约见[render-job](../../schemas/render-job.schema.json)、[ShotArtifacts](../../schemas/workflow.schema.json#/$defs/ShotArtifacts) 和 [ChapterCheckpoint](../../schemas/workflow.schema.json#/$defs/ChapterCheckpoint)。

## 受限或失败时

进程中断只补未完成且可证明未提交的任务。提交回执丢失进入 UNKNOWN，按原键查询供应商。

## English

[中文](#chinese)

### Inputs and prerequisites

Pin the renderer, fonts, rig, media specification and input snapshot. Check G3 before rendering a full production master.

Input contracts — [CompiledTimeline](../../schemas/workflow.schema.json#/$defs/CompiledTimeline), [CharacterActionPlan](../../schemas/workflow.schema.json#/$defs/CharacterActionPlan), [ScenePlan](../../schemas/workflow.schema.json#/$defs/ScenePlan).

### Procedure

1. Check cache entries against artifact hashes. Bake each shot’s character frames in sequence with transparency. Composite independent shots concurrently, assembling shots and chapters in absolute frame order.
2. Persist the job, idempotency key and state for each work unit. Reserve funds before a chargeable submission. Prioritize the selected shots when rendering a review sample.
3. Record frame count, artifact hash and dependencies for every shot. Write chapter checkpoints for longer programs. Mix and encode the final timeline as one program, then report the measured duration to QA.

### Outputs and handoff

Send the sample and master separately to `quality-auditor` with their revisions and job records.

Output contracts — [render-job](../../schemas/render-job.schema.json), [ShotArtifacts](../../schemas/workflow.schema.json#/$defs/ShotArtifacts), [ChapterCheckpoint](../../schemas/workflow.schema.json#/$defs/ChapterCheckpoint).

### When blocked

After interruption, resubmit only unfinished work that can be shown never to have been submitted. When a receipt is lost, retain `UNKNOWN` and query the provider using the original key.
