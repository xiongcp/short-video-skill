方案已确认！已为您正式生成完整的 **L0 视频制作交付包**，并记录了确认状态。

---

### 一、 交付文件清单

项目工程目录：[`winter-static/`](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static)

- [project.json](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/project.json)：项目数据源，已追加记录确认节点（`revision 1`，确认阶段 `plan`）。
- [讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/讲稿.md)：已更新为“已确认”状态，包含 5 个段落逐字口播稿（225 字，估时约 59 秒）。
- [分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/分镜.md)：包含全片 7 个镜头的版式、主持人表情动作及图解配置。
- [提示词包.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/提示词包.md)：**已正式生成**，包含全局锁定、逐镜 AI 提示词（规格、画风、动作、运镜、首尾衔接与负向词）及剪辑指引。
- [ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/ref/host.png)：主持人“晴”的外观参考图。

---

### 二、 1 分钟 MP4 成片制作流程（实操指引）

您可以按照以下 4 步快速完成 1 分钟成片导出：

#### 1. 逐镜生成视频片段
打开任意主流 AI 视频生成平台（如即梦 AI、可灵 AI、海螺 AI、智谱清影、Veo 等）：
- 对于 **`sh01`、`sh02`、`sh05`、`sh06`、`sh07`**（含主持人镜头）：在平台中开启“角色参考 / 垫图”，上传 [`ref/host.png`](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/ref/host.png)，然后复制对应镜头的提示词进行生成。
- 对于 **`sh03`、`sh04`**（纯科普图解镜头）：直接复制提示词生成纯净图解画面。

#### 2. 剪辑轨道排列与时长对齐
打开剪辑软件（如剪映、CapCut、Premiere Pro）：
- 新建 16:9 横屏项目（分辨率 1920×1080）。
- 将 7 段生成的视频按镜头编号依次排列，并按各镜头估时进行裁剪：
  - `sh01`（3 秒）
  - `sh02`（11 秒）
  - `sh03`（11 秒）
  - `sh04`（13 秒）
  - `sh05`（6 秒）
  - `sh06`（8 秒）
  - `sh07`（8 秒）
  - **总画面时长精确为 60 秒**。

#### 3. 配音与字幕合成
- **配音**：直接复制 [`讲稿.md`](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/讲稿.md) 的逐字稿，使用剪辑软件的“文本朗读 / 智能配音”（推荐明快女声），或自行录制旁白，置于音频轨并对齐画面转场。
- **字幕**：使用“自动识别字幕”生成底部台词字幕。
- **图解关键词**：参考 [`分镜.md`](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/分镜.md) 的“图解”列，在右侧留白处添加花字贴纸（如“夏天潮湿 vs 冬天干燥”、“数千伏”、“加湿器 / 护手霜”等）。

#### 4. 音乐音效与导出
- 添加一段轻松、舒缓的科普轻音乐作为 BGM（音量调至 15%–20%）。
- 在 `sh01`、`sh02`、`sh05` 放电处增加微小的“噼啪”触电音效。
- 导出设置为 **1080p（1920×1080）、30 fps、H.264 MP4 格式**，即可获得高质量的 1 分钟成片！


<!-- status: SUCCESS; tools: update_steps, run_command, update_steps, write_file, update_steps, run_command, update_steps -->
