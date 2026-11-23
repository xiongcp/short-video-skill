---
name: audio-production
description: 为中文讲稿生成或导入配音，建立可手工修正的采样级字词及口型锚点。 Use to generate or import Chinese narration, align words at sample precision and correct lip-sync anchors.
metadata:
  version: "1.0.0"
  input_contracts: "script.schema.json character.schema.json"
  output_contracts: "audio-manifest.schema.json workflow.schema.json#/$defs/Alignment workflow.schema.json#/$defs/SubtitleTrack"
  permissions: "policies/permissions.yaml#/skills/audio-production"
  budget_class: "voice"
  gates: "G2 G3"
---

# 录制、发音与字词对齐 · Record, pronounce and align speech

<a id="chinese"></a>

中文 · [English](#english)

## 启动条件与输入

正式音频读取 G2 对应脚本，初稿可处理待审稿并随产物继承草稿标记。取得音色使用范围和术语表。

输入契约见[script](../../schemas/script.schema.json)、[character](../../schemas/character.schema.json)。

## 工作步骤

1. 逐段生成或导入 WAV，记录 provider、参数、文本哈希、段落起点和长度，统一到 48 kHz。保留停顿及片头片尾留白。
2. 对齐器输出字词采样边界与置信度，把脚本 cue 映射到词序列。低置信或专有名词可逐句试听、手校并升版本。
3. 以实测音频反推时长。明显超出目标则提供可删段落或替代说法，改稿走 G2 后局部重配。字幕、口型、重音共享锚点。

## 输出与交接

AudioManifest 与 Alignment 交导演、表演和编译，附实际与规划片长之差。

输出契约见[audio-manifest](../../schemas/audio-manifest.schema.json)、[Alignment](../../schemas/workflow.schema.json#/$defs/Alignment) 和 [SubtitleTrack](../../schemas/workflow.schema.json#/$defs/SubtitleTrack)。

## 受限或失败时

提交超时保留原 job 与预留。源音频不可用时只交付估时，时长字段不冒充设备实测。

## English

[中文](#chinese)

### Inputs and prerequisites

Use the script approved at G2 for production audio. A draft may use a pending script and inherits its draft label. Obtain the voice usage scope and glossary.

Input contracts — [script](../../schemas/script.schema.json), [character](../../schemas/character.schema.json).

### Procedure

1. Generate or import a WAV for each section. Record provider, parameters, text hash, section start and length. Normalize to 48 kHz, preserving pauses and intentional opening and closing holds.
2. Emit word boundaries in samples plus confidence scores. Map each script cue to its word sequence. Audition low-confidence words and proper names sentence by sentence, apply manual corrections and version the result.
3. Recalculate duration from real audio. If the target is substantially exceeded, offer cuts or alternative wording. Route a revised script through G2 before rerecording affected sections. Share the same anchors for subtitles, mouth shapes and stress.

### Outputs and handoff

Send `AudioManifest` and `Alignment` to the director, performance planner and compiler. Include the difference between measured and planned duration.

Output contracts — [audio-manifest](../../schemas/audio-manifest.schema.json), [Alignment](../../schemas/workflow.schema.json#/$defs/Alignment), [SubtitleTrack](../../schemas/workflow.schema.json#/$defs/SubtitleTrack).

### When blocked

Retain the original job and budget reservation after a submission timeout. If the source audio is unavailable, deliver estimates and identify their timing basis.
