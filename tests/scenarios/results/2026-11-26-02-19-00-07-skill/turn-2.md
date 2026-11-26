已为您生成并交付完整的 **L0 制作级文本包**，全套方案已确认并记录至项目审计中。

---

### 项目文件清单

- **项目目录**：`winter-static/`
- **方案配置**：[project.json](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-07-TRLNXd/winter-static/project.json)
- **口播讲稿**：[讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-07-TRLNXd/winter-static/讲稿.md)
- **镜头分镜**：[分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-07-TRLNXd/winter-static/分镜.md)
- **模型提示词包**：[提示词包.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-07-TRLNXd/winter-static/提示词包.md)
- **角色参考图**：[host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-07-TRLNXd/winter-static/ref/host.png)（生成含主持人的镜头时在平台上传）

---

### 项目状态

- **确认状态**：`已确认`（revision 1，记录时间：`2026-11-25`）
- **核检结果**：自检通过（0 errors, 0 warnings, 0 doc discrepancies，预估时长 59 秒完美契合 1 分钟目标）
- **待核实事项（open_questions）**：请在正式发布前核实讲稿中关于“冬天空气干燥导致电荷易在人体表面积聚、夏天通过水蒸气导走电荷”的物理机制表述是否符合预期。

---

### 提示词包概览与使用指南

[提示词包.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-07-TRLNXd/winter-static/提示词包.md) 包含完整的 9 个镜头，每镜严格按照**口播、秒数节拍、首帧图（含全局角色锁定与禁止项）、图生视频运动提示词**组织：

1. **生图与生视频推荐流程**：
   - 推荐使用**即梦（Jimeng AI）**、**可灵（Kling AI）**、**海螺（Hailuo）**或 **Veo**。
   - 对 `sh01`、`sh02`、`sh03`、`sh05`、`sh07`、`sh09`（含主持人镜头），上传 [host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-07-TRLNXd/winter-static/ref/host.png) 并填入“首帧图”提示词出图；
   - 对 `sh04`、`sh06`、`sh08`（纯图解镜头），直接生出无人物手绘图；
   - 将生成的首帧图交由视频模型，配合“运动”提示词生成视频片段（支持首尾帧的平台建议用下一镜首帧做尾帧）。
2. **后期剪辑与男声配音**：
   - 视频模型生成时均已设定为“静音”；
   - 剪辑软件中按 `sh01` → `sh09` 依次导入拼接，裁剪到各镜头的估时长度；
   - 配音采用 [讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-07-TRLNXd/winter-static/讲稿.md)，使用 **男声·云希（`zh-CN-YunxiNeural`）** 录制或 TTS 合成，并在关键节点叠加分镜中列出的关键词图解与字幕即可出片！


<!-- status: SUCCESS; tools: read_file, read_file, read_file, run_command, write_file, write_file, write_file, run_command, run_command, update_steps -->
