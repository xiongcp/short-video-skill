---
name: character-performance
description: 按原创日系角色的已注册视角、表情、手势和 Rig 边界制作逐镜表演计划。 Use to plan an original host’s shot-level poses, expressions, gestures and lip movements within registered rig capabilities.
metadata:
  version: "1.0.0"
  input_contracts: "storyboard.schema.json character.schema.json workflow.schema.json#/$defs/Alignment"
  output_contracts: "workflow.schema.json#/$defs/CharacterActionPlan"
  permissions: "policies/permissions.yaml#/skills/character-performance"
  budget_class: "local"
  gates: "G3"
---

# 为主持人编排表演 · Direct the host’s performance

<a id="chinese"></a>

中文 · [English](#english)

## 启动条件与输入

使用镜头固定的角色、Rig、声音版本及受支持动作表。

输入契约见[storyboard](../../schemas/storyboard.schema.json)、[character](../../schemas/character.schema.json)、[Alignment](../../schemas/workflow.schema.json#/$defs/Alignment)。

## 工作步骤

1. 对主持人镜头登记初始姿态、视线目标、左右站位和离场姿态。近景讲话先保证嘴型和眼神。
2. 把重音、停顿对应到视素和手势局部帧段，词锚、viseme 与控制曲线分开存放。图解独占镜头可省略角色层。
3. 逐镜指定重置状态、依赖的上一镜末态或显式新姿态。把 blink、呼吸、物理与 Rig 版本交给顺序烘焙器。

## 输出与交接

将 CharacterActionPlan 交编译器，由 render-orchestrator 调 bake_character。

输出契约见[CharacterActionPlan](../../schemas/workflow.schema.json#/$defs/CharacterActionPlan)。

## 受限或失败时

未注册角度或手势回报 shot_id 和可用替代。角色极值穿帮标记待返修。

## English

[中文](#chinese)

### Inputs and prerequisites

Use the character, rig and voice revisions pinned to the shot and load their supported actions.

Input contracts — [storyboard](../../schemas/storyboard.schema.json), [character](../../schemas/character.schema.json), [Alignment](../../schemas/workflow.schema.json#/$defs/Alignment).

### Procedure

1. For host shots, register the starting pose, gaze target, screen position and exit pose. Prioritize mouth shapes and eye direction in close-ups.
2. Map stress and pauses to local frame ranges for visemes and gestures. Store word anchors, visemes and control curves separately. A diagram-only shot may omit the character layer.
3. Specify a reset, an inherited end pose or an explicit new pose for each shot. Pass blink, breathing, physics and the rig version to the sequential baker.

### Outputs and handoff

Send `CharacterActionPlan` to the compiler. `render-orchestrator` invokes `bake_character`.

Output contracts — [CharacterActionPlan](../../schemas/workflow.schema.json#/$defs/CharacterActionPlan).

### When blocked

Report the `shot_id` and available alternatives for unregistered angles or gestures. Flag visual defects at extreme poses for revision.
