---
name: script-writer
description: 将已整理的证据或用户原稿改成有来源、段落时长和视觉意图的中文讲稿。 Use to turn reviewed evidence or the author’s draft into timed spoken sections, voice cues and a G2 review.
metadata:
  version: "1.0.0"
  input_contracts: "topic-brief.schema.json evidence-set.schema.json"
  output_contracts: "script.schema.json"
  permissions: "policies/permissions.yaml#/skills/script-writer"
  budget_class: "local"
  gates: "G1 G2"
---

# 把证据写成可口播的分段讲稿 · Write a script that works aloud

<a id="chinese"></a>

中文 · [English](#english)

## 启动条件与输入

正式制作读取 G1 对应的 EvidenceSet。保留用户提供的口吻、论点限定和术语。

输入契约见[topic-brief](../../schemas/topic-brief.schema.json)、[evidence-set](../../schemas/evidence-set.schema.json)。

## 工作步骤

1. 每个段落给稳定 section_id、口播、claim_ids、术语读音、视觉意图和提示词组 cue。用画面停留与换气时间计算净口播预算。
2. 短片从提问进入机制、例子、结论。约 8 分钟让同一个案例贯穿各章，用上一章留下的问题引入下一章。
3. 按段落估时并求和。超时优先删重复解释或调整范围。G2 审核卡同时呈现脚本版本、预计片长、未决事实和需要试听的专名。

## 输出与交接

G2 通过后交 audio-production，director-storyboard 可提前准备纸面方案，正式分镜等待对齐。

输出契约见[script](../../schemas/script.schema.json)。

## 受限或失败时

关键事实发生变化回到 G1。已有稿件的实质改写展示差异，时长偏差先改稿并保留版本。

## English

[中文](#chinese)

### Inputs and prerequisites

For formal production, load the `EvidenceSet` approved at G1. Preserve the author’s voice, qualifications and terminology.

Input contracts — [topic-brief](../../schemas/topic-brief.schema.json), [evidence-set](../../schemas/evidence-set.schema.json).

### Procedure

1. Give each section a stable `section_id`, narration, `claim_ids`, pronunciation notes, visual intent and phrase cues. Allow time for reading the screen and for breaths when estimating net speaking time.
2. In a short, move from the question to the mechanism, example and conclusion. In an eight-minute program, carry one example through the chapters and use the question left open in one chapter to introduce the next.
3. Estimate and sum section durations. Cut repetition or narrow scope when the script runs long. The G2 card shows the script revision, estimated duration, open factual questions and proper names to audition.

### Outputs and handoff

After G2, send the script to `audio-production`. The director may plan shots on paper in parallel. Time the production storyboard against measured alignment.

Output contracts — [script](../../schemas/script.schema.json).

### When blocked

Return a material factual change to G1. Show a diff for a substantive rewrite of supplied text. Address timing overruns in a versioned script revision.
