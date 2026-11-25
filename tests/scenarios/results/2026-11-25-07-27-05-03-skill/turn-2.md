90 秒科普视频方案（**L0 完整文本包**）已全部制作完成并通过校验交付。

---

### 一、交付文件清单与路径

项目文件夹位于：`http-cache/`
- **项目全量数据**：[project.json](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-6xDbS1/http-cache/project.json)（已记录用户确认记录 `revision 1`）
- **口播讲稿**：[讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-6xDbS1/http-cache/讲稿.md)（共 5 段，估算约 88 秒，纯文本 342 字）
- **逐镜分镜表**：[分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-6xDbS1/http-cache/分镜.md)（共 11 个镜头，含情绪、动作、图解与节拍点）
- **视频模型提示词包**：[提示词包.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-6xDbS1/http-cache/提示词包.md)（含全局画风锁定、首帧图生成提示词与图生视频运动提示词）
- **主持人参考图**：[ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-6xDbS1/http-cache/ref/host.png)（“小青”手绘火柴人基准参考图）

---

### 二、状态与核验记录

- **确认状态**：**全流程已确认（revision 1，2026-11-24）**
  - 讲稿结构、口播文案及 11 镜分镜已由您确认通过。
- **待核实事项（`open_questions`）**：
  - 本期面向零基础受众，已将强缓存、协商缓存等技术机制通俗化为“本地小仓库”与“发极短消息核对”，该通俗化表述已确认适用。

---

### 三、下一步成片操作指南

本版本交付完整的 L0 制作方案包。您可以按照以下步骤配合外部 AI 工具和剪辑软件快速出片：

1. **画面生成（两步法）**：
   - 打开支持参考图的视频/图像生成平台（如**即梦、可灵、海螺、Vidu、Veo** 等）；
   - 打开 [提示词包.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-6xDbS1/http-cache/提示词包.md)，复制各镜头的**首帧图提示词**生成静态图；遇到 `host-left` 镜头时上传 [ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-6xDbS1/http-cache/ref/host.png) 保证主持人小青形象统一；
   - 将首帧图作为参考图，配合**运动提示词**生成视频片段。如果平台支持首尾帧控制，可将下一镜的首帧图上传为尾帧以实现自然衔接。
2. **配音与字幕**：
   - 将 [讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-6xDbS1/http-cache/讲稿.md) 的文本输入 TTS 语音工具或自行录制，讲稿已严格按照每秒 4 字与句末停顿控制在约 88 秒；
   - 剪辑软件中自动识别生成单句字幕，放置于画面底部安全区。
3. **剪辑拼合**：
   - 按照 `sh01` 至 `sh11` 顺序将片段排入轨道，裁切到各镜头估时长度；
   - 参照 [分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-6xDbS1/http-cache/分镜.md) 的“图解”列在剪辑软件中添加动态关键词贴字，即可完成成片导出。


<!-- status: SUCCESS; tools: read_file, read_file, run_command, edit_file, edit_file, write_file, run_command -->
