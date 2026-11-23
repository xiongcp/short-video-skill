---
name: topic-planner
description: 从主题或已有稿件确定知识解说的受众、范围、问题树和资料检索计划。 Use to turn a topic or existing script into an audience-specific question and a research plan for either duration profile.
metadata:
  version: "1.0.0"
  input_contracts: "topic-brief.schema.json"
  output_contracts: "workflow.schema.json#/$defs/ResearchPlan"
  permissions: "policies/permissions.yaml#/skills/topic-planner"
  budget_class: "local"
  gates: "G1"
---

# 界定本期要回答的问题 · Define the question this episode will answer

<a id="chinese"></a>

中文 · [English](#english)

## 启动条件与输入

读取已经解析的受众与片长。记录用户提供的资料和要求保留的词。

输入契约见[topic-brief](../../schemas/topic-brief.schema.json)。

## 工作步骤

1. 把主题改写成一个观众能在片尾回答的问题，列出本期明确放弃展开的旁支。
2. 短片只选一个能画出来的机制。约 8 分钟先列主问题和章节间的因果关系，各章分别给出观众应能解释的结果。
3. 按子问题列检索词、一手来源类型和判定答案所需的证据。已有稿件按原段落提取可验证论点。

## 输出与交接

将 ResearchPlan 连同原始材料引用交给 research-evidence。

输出契约见[ResearchPlan](../../schemas/workflow.schema.json#/$defs/ResearchPlan)。

## 受限或失败时

若受众或含义的歧义会改变结论，列出最少的待确认项，其余使用项目默认。

## English

[中文](#chinese)

### Inputs and prerequisites

Read the resolved audience and duration. Record the materials supplied and any terminology the author wants to retain.

Input contracts — [topic-brief](../../schemas/topic-brief.schema.json).

### Procedure

1. Express the topic as a question the audience should be able to answer by the end. Identify branches outside this episode’s scope.
2. For a short, choose one mechanism that can be illustrated. For an eight-minute program, map the main question and causal links between chapters, and state what viewers should be able to explain after each one.
3. For each subquestion, list search terms, primary-source types and the evidence needed to reach a conclusion. For an existing script, extract verifiable claims section by section.

### Outputs and handoff

Pass `ResearchPlan` and references to the original material to `research-evidence`.

Output contracts — [ResearchPlan](../../schemas/workflow.schema.json#/$defs/ResearchPlan).

### When blocked

When ambiguity about the audience or meaning could change the conclusion, ask for the minimum clarification needed. Use project defaults for the rest.
