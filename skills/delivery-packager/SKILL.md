---
name: delivery-packager
description: 对已审核的知识视频生成导出清单，验签、校验文件并交付可恢复的工程包。 Use to create a versioned export manifest, verify approvals and deliver a restorable knowledge-video project.
metadata:
  version: "1.0.0"
  input_contracts: "workflow.schema.json#/$defs/ShotArtifacts workflow.schema.json#/$defs/QAReport workflow.schema.json#/$defs/Approval"
  output_contracts: "workflow.schema.json#/$defs/ExportManifest workflow.schema.json#/$defs/FinalPackage"
  permissions: "policies/permissions.yaml#/skills/delivery-packager"
  budget_class: "delivery"
  gates: "G4 G5"
---

# 打包可编辑工程与批准母版 · Package the editable project and approved master

<a id="chinese"></a>

中文 · [English](#english)

## 启动条件与输入

G4 绑定的是本次正式母版和 QA，G5 绑定的是待导出的文件清单哈希。

输入契约见[ShotArtifacts](../../schemas/workflow.schema.json#/$defs/ShotArtifacts)、[QAReport](../../schemas/workflow.schema.json#/$defs/QAReport)、[Approval](../../schemas/workflow.schema.json#/$defs/Approval)。

## 工作步骤

1. 列出 MP4、SRT、WAV、脚本、证据、DSL、资产、审批、账本及 QA。长片随包附章节起点，开启无字幕母版或封面时列入清单。
2. 逐个检查实物哈希、授权与版本，显示新增或替换文件，生成 ExportManifest，等待 G5 人类确认。
3. G5 通过后打包、解包核对相对路径和文件哈希。将 G5 收据与清单关联，记录包哈希，返回 FinalPackage。

## 输出与交接

向项目所有者交付本地项目包、视频、来源与 QA 报告，以及可追溯的版本和费用。

输出契约见[ExportManifest](../../schemas/workflow.schema.json#/$defs/ExportManifest)、[FinalPackage](../../schemas/workflow.schema.json#/$defs/FinalPackage)。

## 受限或失败时

文件缺失、批准过期或清单哈希不匹配时定位条目，停止正式交付。

## English

[中文](#chinese)

### Inputs and prerequisites

G4 binds the specific production master and QA. G5 binds the hash of the file manifest prepared for export.

Input contracts — [ShotArtifacts](../../schemas/workflow.schema.json#/$defs/ShotArtifacts), [QAReport](../../schemas/workflow.schema.json#/$defs/QAReport), [Approval](../../schemas/workflow.schema.json#/$defs/Approval).

### Procedure

1. List the MP4, SRT, WAV, script, evidence, DSL, assets, approvals, ledger and QA. Include chapter starts for long programs. List the clean master or cover whenever either deliverable is enabled.
2. Check the hash, rights and revision of each file, show additions and replacements, create `ExportManifest` and wait for human G5 approval.
3. After G5, package and extract the archive. Check relative paths and file hashes, associate the G5 receipt with the manifest, record the archive hash and return `FinalPackage`.

### Outputs and handoff

Deliver the local project package, video, sources and QA report to the owner, with traceable revisions and costs.

Output contracts — [ExportManifest](../../schemas/workflow.schema.json#/$defs/ExportManifest), [FinalPackage](../../schemas/workflow.schema.json#/$defs/FinalPackage).

### When blocked

Identify any missing file, expired approval or manifest mismatch and stop formal delivery until the specific issue is resolved.
