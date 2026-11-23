---
name: director-storyboard
description: 将脚本、声音锚点和资产能力分配到主持人、程序图解和主题插画镜头。 Use to allocate narration, audio cues and available assets to host shots, editable diagrams and topic illustrations.
metadata:
  version: "1.0.0"
  input_contracts: "topic-brief.schema.json script.schema.json workflow.schema.json#/$defs/AssetCatalog"
  conditional_input_contracts: "workflow.schema.json#/$defs/Alignment"
  output_contracts: "storyboard.schema.json"
  permissions: "policies/permissions.yaml#/skills/director-storyboard"
  budget_class: "local"
  gates: "G2 G3"
---

# 把口播变成镜头 · Turn narration into shots

<a id="chinese"></a>

中文 · [English](#english)

## 启动条件与输入

纸面分镜使用 planned 时间基并注明估时。正式分镜使用实测音频与人工校正后的锚点。

输入契约见[topic-brief](../../schemas/topic-brief.schema.json)、[script](../../schemas/script.schema.json)、[Alignment](../../schemas/workflow.schema.json#/$defs/Alignment)、[AssetCatalog](../../schemas/workflow.schema.json#/$defs/AssetCatalog)。

## 工作步骤

1. 先写每镜观众要看懂的变化，再选机位与模板。把关键数字、箭头和标签交给可编辑的矢量图层。
2. 每镜绑定章节、段落、语音 cue、半开帧区间、场景版本和已登记动作。短片检查开场和结尾，长片记录章间进出场状态。
3. 选 20–30 秒代表样片，覆盖主持人、一个解释难点和一次转接。列出涉及的镜头及具体取样区间。

## 输出与交接

Storyboard 的同一版本分派给 character-performance 与 scene-art-direction，再与音频合同一起进入编译。

输出契约见[storyboard](../../schemas/storyboard.schema.json)。

## 受限或失败时

请求了缺失资产时登记为 planned。动作超能力时给一个能力表内的替代或切到图解，并让导演确认。

## English

[中文](#chinese)

### Inputs and prerequisites

Mark paper storyboards `planned` and label durations as estimates. Use measured audio and human-corrected anchors for the production storyboard.

Input contracts — [topic-brief](../../schemas/topic-brief.schema.json), [script](../../schemas/script.schema.json), [Alignment](../../schemas/workflow.schema.json#/$defs/Alignment), [AssetCatalog](../../schemas/workflow.schema.json#/$defs/AssetCatalog).

### Procedure

1. For each shot, first state the change the viewer should understand. Then select framing and a template. Place critical numbers, arrows and labels on editable vector layers.
2. Bind each shot to its chapter, section, audio cue, half-open frame range, scene version and registered actions. Check the opening and close of shorts. Record chapter entry and exit states for longer programs.
3. Select a representative 20–30 second sample covering the host, a difficult explanation and one transition. List the shot IDs and exact excerpt ranges.

### Outputs and handoff

Give the same `Storyboard` revision to `character-performance` and `scene-art-direction`, then compile it with the matching audio contracts.

Output contracts — [storyboard](../../schemas/storyboard.schema.json).

### When blocked

Register a missing asset as `planned`. If a requested action exceeds the rig’s capabilities, suggest a supported action or a diagram cutaway and obtain the director’s confirmation.
