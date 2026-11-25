90 秒科普视频项目 **“为什么 HTTP 缓存能让网页变快？”** 的全套 L0 文本包与配套素材已全部制作完成并通过校验交付！

---

### 项目文件清单与路径

项目完整根目录位于：[http-cache/](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-s8XYji/http-cache/)

1. **项目统一数据源**：[project.json](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-s8XYji/http-cache/project.json)
   - 已包含目标参数（16:9、90 秒、浅色主题）、段落口播数据、11 镜分镜数据与用户确认记录（`checkpoint: revision 1`）。
2. **口播讲稿**：[讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-s8XYji/http-cache/讲稿.md)
   - 包含 5 个精简段落，共 349 字，模型精准估时约 **92.5 秒**（完美落在目标 90 秒的 ±10% 范围内）。
3. **逐镜分镜脚本**：[分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-s8XYji/http-cache/分镜.md)
   - 规划了 11 个独立镜头（包含 5 个主持人出镜镜、6 个全屏流程/对比图解镜），附带句内节拍 cue 动效标记与样片候选推荐（`sh04–sh05`）。
4. **外部模型提示词包**：[提示词包.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-s8XYji/http-cache/提示词包.md)
   - 包含使用说明、全局画风/人物锁定、负向禁止词、逐镜首帧图提示词、图生视频运动提示词及剪辑配音指引。
5. **主持人参考图**：[ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-s8XYji/http-cache/ref/host.png)
   - 原创主持人“晴”的高清立绘参考图，用于在视频/生图平台中作为参考图上传以锁定角色外观。

---

### 状态核对

- **确认状态**：**已确认（revision 1，2026-11-24）**。全部讲稿、分镜及提示词包均已核对锁定。
- **待核实事项（open_questions）**：**无**。本片采用了通俗易懂的“仓库与书桌抽屉”比喻，避开了枯燥的网络专业词汇，核心机制（本地副本、新鲜度过期、协商缓存 304）严谨公认，无待核实事项。
- **工程自检结果**：运行 `check.mjs` 校验通过，**0 errors, 0 warnings, 0 docs issues**。

---

### 下一步成片实操指南

您可按以下步骤快速完成视频成片：

1. **生成首帧图（文生图）**：
   - 使用 Midjourney、即梦、Stable Diffusion 或可灵的文生图功能。
   - `host-left` 镜头（sh01、sh02、sh05、sh07、sh11）上传 [ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-s8XYji/http-cache/ref/host.png) 作为垫图/角色参考，复制对应镜头的“首帧图提示词”。
   - `full` 镜头（sh03、sh04、sh06、sh08、sh09、sh10）直接复制首帧图提示词生成 16:9 无人物图解底图。

2. **生成视频片段（图生视频）**：
   - 将生成的首帧图上传至可灵、即梦、海螺、Vidu 或 Veo。
   - 复制对应镜头的“运动提示词”生成 5 秒或 10 秒片段；如果平台支持“首尾帧”控制，可将下一镜的首帧图直接作为当前镜的尾帧，转场将更加平滑自然。

3. **录音与后期剪辑**：
   - **配音**：将 [讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-s8XYji/http-cache/讲稿.md) 导入剪映 TTS（推荐少年或元气女声，与晴的形象匹配）或真人录制，生成单条完整配音轨。
   - **拼接**：在剪辑软件中将 11 个镜头依次排开，按 [分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-s8XYji/http-cache/分镜.md) 中的“估时”精准裁剪尾帧并与音频对齐。
   - **字幕与贴片**：根据讲稿一键生成字幕；参照分镜表中的“图解”列在对应时间点添加关键词贴片与高亮动效，即可导出成品！


<!-- status: SUCCESS; tools: update_steps, read_file, read_file, run_command, write_file, write_file, write_file, run_command, update_steps -->
