---
name: scene-art-direction
description: 按镜头目的建立主持人、知识图解或主题插画场景，登记资产候选和图层关系。 Use to design shot layers, scene layout, editable technical graphics and approved illustration assets.
metadata:
  version: "1.0.0"
  input_contracts: "storyboard.schema.json workflow.schema.json#/$defs/AssetCatalog evidence-set.schema.json"
  output_contracts: "workflow.schema.json#/$defs/ScenePlan"
  permissions: "policies/permissions.yaml#/skills/scene-art-direction"
  budget_class: "art"
  gates: "G1 G3"
---

# 设计场景与可编辑图解 · Build scenes and editable diagrams

<a id="chinese"></a>

中文 · [English](#english)

## 启动条件与输入

读取镜头意图、参考美术、角色站位和图表使用的证据。

输入契约见[storyboard](../../schemas/storyboard.schema.json)、[AssetCatalog](../../schemas/workflow.schema.json#/$defs/AssetCatalog)、[evidence-set](../../schemas/evidence-set.schema.json)。

## 工作步骤

1. 以舞台左上为原点，定义图层顺序、焦点、遮挡、道具、角色活动区和字幕安全区。
2. 精确文字、单位、数据与流程线由 SVG/Canvas 绘制，保留其 claim_id。插画候选登记来源、使用范围、版本和哈希。
3. 复杂插入镜头先给可替代的静态或程序图解方案。仅在项目启用、预算已预留时请求视频候选，选择结果写入固定资产版本。

## 输出与交接

ScenePlan 连同引用的版本和未解决资产请求交给 animation-compiler。

输出契约见[ScenePlan](../../schemas/workflow.schema.json#/$defs/ScenePlan)。

## 受限或失败时

候选风格偏离时沿用批准的布局和资产版本。缺少许可或使用范围时暂停该素材进入正式合成。

## English

[中文](#chinese)

### Inputs and prerequisites

Read the shot intent, reference art, character position and evidence supporting the diagram.

Input contracts — [storyboard](../../schemas/storyboard.schema.json), [AssetCatalog](../../schemas/workflow.schema.json#/$defs/AssetCatalog), [evidence-set](../../schemas/evidence-set.schema.json).

### Procedure

1. Use the stage’s upper-left corner as the origin. Define layer order, focal point, occlusion, props, character movement area and subtitle safe area.
2. Draw exact text, units, data and flow lines in SVG/Canvas and keep their `claim_id`. Record source, usage rights, version and hash for each illustration candidate.
3. Offer a static illustration or procedural diagram for complex inserts. Request video candidates only after the project enables the channel and reserves the budget. Bind the selected candidate to a fixed asset version.

### Outputs and handoff

Pass `ScenePlan`, referenced versions and unresolved asset requests to `animation-compiler`.

Output contracts — [ScenePlan](../../schemas/workflow.schema.json#/$defs/ScenePlan).

### When blocked

If a candidate drifts from the style reference, retain the approved layout and asset revision. Hold an asset out of formal compositing until its permission or permitted scope is known.
