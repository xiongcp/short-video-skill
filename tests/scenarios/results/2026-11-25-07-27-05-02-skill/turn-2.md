已为您完成 **L0 完整交付文本包**，并生成了逐镜针对视频生成模型（即梦、可灵、Vidu、海螺等）的提示词包与使用指导。

通过项目内置校验工具检查：`errors: 0`，`warnings: 0`，`docs: 0`，全流程符合规范。

---

### 项目文件清单与完整路径

项目所有文件均保存在工作目录下的 `cruise-altitude/`：
1. **项目配置文件**：[project.json](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/project.json)（已记录本次 plan 阶段确认记录）
2. **口播讲稿**：[讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/讲稿.md)（状态已更新为“已确认”）
3. **分镜头脚本**：[分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/分镜.md)（共 13 镜，样片推荐 `sh07–sh08`）
4. **模型提示词包**：[提示词包.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/提示词包.md)（含全局锁定、首帧图提示词、运动提示词及精准节拍）
5. **主持人参考图**：[host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/ref/host.png)（生成主持人小青画面时上传，确保角色一致性）

---

### 确认状态与核实项

- **确认状态**：**方案已确认（revision 1）**，L0 交付阶段全部完成。
- **待核实事项（open_questions）**：
  > 原始资料中提及的“高空巡航能比低空飞行省下九成燃油”自述缺乏可靠出处。当前讲稿与提示词已统一采用稳妥的中性表述（“油耗明显更低”）。若后续需要在后期剪辑画面中添加具体节油数据字幕，建议核对权威技术资料。

---

### 下一步成片实操指引

1. **生成首帧图**：
   - 打开即梦、Midjourney、DALL-E 3 等绘图工具，按照 [提示词包.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/提示词包.md) 逐镜的“首帧图”提示词生成 16:9 画幅图片。
   - `host-left` 镜头（sh01、sh02、sh05、sh08、sh09、sh12、sh13）请上传 [host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/ref/host.png) 作为人物参考。
2. **图生视频**：
   - 打开可灵、即梦或海螺等视频模型，上传首帧图并填入对应的“运动”提示词。
   - 若平台支持“首尾帧”控制，可将下一镜的首帧图直接作为本镜尾帧，以保证转场连续性。
3. **后期剪辑与配音**：
   - 将生成的 13 段视频素材导入剪辑软件（如剪映），按 `sh01` 至 `sh13` 顺序拼接，并按分镜估时裁剪。
   - 参照 [讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/讲稿.md) 录制或使用 TTS 生成配音音轨并对齐字幕。
   - 参照 [分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/分镜.md) 中的“图解”列在对应节点添加关键文字贴片，即可导出最终成品视频。


<!-- status: SUCCESS; tools: read_file, read_file, run_command, edit_file, edit_file, write_file, run_command, run_command -->
