---
name: animation-compiler
description: 将分镜、资产、音频和表演计划编译成可重放的整数帧时间线。 Use to compile a storyboard, assets, audio and performance plans into a replayable integer-frame timeline.
metadata:
  version: "1.0.0"
  input_contracts: "storyboard.schema.json workflow.schema.json#/$defs/AssetCatalog audio-manifest.schema.json workflow.schema.json#/$defs/Alignment workflow.schema.json#/$defs/CharacterActionPlan workflow.schema.json#/$defs/ScenePlan"
  output_contracts: "workflow.schema.json#/$defs/CompiledTimeline"
  permissions: "policies/permissions.yaml#/skills/animation-compiler"
  budget_class: "local"
  gates: "G2"
---

# 编译不可变项目时间线 · Compile an immutable project timeline

<a id="chinese"></a>

中文 · [English](#english)

## 启动条件与输入

读取同一项目的快照。正式编译的分镜 timing_basis 为 aligned，正式资源已物化、获准使用并可核验哈希。

输入契约见[storyboard](../../schemas/storyboard.schema.json)、[AssetCatalog](../../schemas/workflow.schema.json#/$defs/AssetCatalog)、[audio-manifest](../../schemas/audio-manifest.schema.json)、[Alignment](../../schemas/workflow.schema.json#/$defs/Alignment)、[CharacterActionPlan](../../schemas/workflow.schema.json#/$defs/CharacterActionPlan)、[ScenePlan](../../schemas/workflow.schema.json#/$defs/ScenePlan)。

## 工作步骤

1. 做结构校验后解析项目内所有引用，核对能力、源段落版本、cue 和时间边界，检查依赖图无环。
2. 以 30 fps 半开区间从第 0 帧覆盖至总帧数。48 kHz 下每帧 1600 个采样，共享边界只量化一次。区分段落/镜头局部时间与全片绝对时间。
3. 产出不可变快照、逐镜局部帧数、图层引用与缓存键。版本与输入哈希一起交给运行时。

## 输出与交接

CompiledTimeline 交 render-orchestrator，坏引用回到对应资产、音频或导演 Skill。

输出契约见[CompiledTimeline](../../schemas/workflow.schema.json#/$defs/CompiledTimeline)。

## 受限或失败时

遇缺失、越界、能力不匹配返回对象 ID、字段及修复方向。planned 分镜只允许结构预检。

## English

[中文](#chinese)

### Inputs and prerequisites

Load a consistent snapshot of one project. For production compilation, require an `aligned` storyboard, materialized assets, permission to use them and verifiable hashes.

Input contracts — [storyboard](../../schemas/storyboard.schema.json), [AssetCatalog](../../schemas/workflow.schema.json#/$defs/AssetCatalog), [audio-manifest](../../schemas/audio-manifest.schema.json), [Alignment](../../schemas/workflow.schema.json#/$defs/Alignment), [CharacterActionPlan](../../schemas/workflow.schema.json#/$defs/CharacterActionPlan), [ScenePlan](../../schemas/workflow.schema.json#/$defs/ScenePlan).

### Procedure

1. Validate structure, resolve all project references and check capabilities, source-section revisions, cues and time boundaries. Reject cycles in the dependency graph.
2. Cover the timeline from frame 0 to its exclusive end at 30 fps. At 48 kHz each frame spans 1,600 samples. Quantize a shared boundary once and distinguish shot- or section-local time from absolute program time.
3. Emit the immutable snapshot, local frame counts, layer references and cache keys. Hand revisions and input hashes to the runtime together.

### Outputs and handoff

Send `CompiledTimeline` to `render-orchestrator`. Route a broken reference back to its asset, audio or directing owner.

Output contracts — [CompiledTimeline](../../schemas/workflow.schema.json#/$defs/CompiledTimeline).

### When blocked

For missing objects, out-of-range values and unsupported actions, return the object ID, field and corrective action. A `planned` storyboard is eligible for structural preflight only.
