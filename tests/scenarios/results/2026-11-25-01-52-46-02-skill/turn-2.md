已完成方案确认并生成全套**逐镜提示词包**（L0 文本交付包已全部就绪）。

---

### 项目交付文件清单

- **项目目录**：`/private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-uByUEx/cruise-altitude/`
- **方案数据源**：[project.json](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-uByUEx/cruise-altitude/project.json)（已记录 Revision 1 确认检查点）
- **口播讲稿**：[讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-uByUEx/cruise-altitude/讲稿.md)（状态：已确认，约 124 秒，468 字）
- **分镜设计**：[分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-uByUEx/cruise-altitude/分镜.md)（共 15 个镜头，样片候选 `sh07–sh08`）
- **提示词包**：[提示词包.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-uByUEx/cruise-altitude/提示词包.md)（含使用说明、全局锁定及 15 组首帧图与运动提示词）
- **角色参考图**：[ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-uByUEx/cruise-altitude/ref/host.png)（主持人“晴”的高清立绘参考图）

---

### 提示词包内容概览

1. **全局画风锁定**：日系二次元清新插画风格、扁平赛璐璐平涂、干净细描边、明亮浅色矢量背景。
2. **主持人一致性**：`host-left` 镜头全部逐字锁定了原创角色“晴”的形象特征（藏青短发、青色挑染、呆毛、墨蓝短外套、白衬衫与青色领结），并配置了 [ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-uByUEx/cruise-altitude/ref/host.png) 参考图。
3. **逐镜控制**：
   - 包含 `sh01` 至 `sh15` 全部镜头；
   - 严格按照口播句子的切分时间点（精确到 `check.mjs` 计算出的 `starts` 节拍）编排动作与视觉变化；
   - 画面中杜绝 AI 常见乱码文字（图解关键词留至剪辑期叠加）。

---

### 后续成片制作步骤指南

1. **画面生成（外部视频模型）**：
   - 推荐使用即梦、可灵、海螺、Vidu 或 Veo；
   - 建议优先采用“**先出首帧图，再图生视频**”模式，在带有主持人的镜头中上传 [ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-uByUEx/cruise-altitude/ref/host.png)；
   - 若平台支持首尾帧衔接（如即梦、可灵），可将下一镜首帧图作为上一镜尾帧，获得流畅转场。
2. **配音与音轨**：
   - 直接使用 [讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-uByUEx/cruise-altitude/讲稿.md) 进行单人配音录制或接入 TTS 声音克隆生成独立人声音轨。
3. **剪辑与特效合成**：
   - 导入剪辑软件（如剪映、Premiere、Final Cut 等），按 `sh01` 至 `sh15` 顺序排布视频素材，依分镜估时对齐修剪；
   - 依据 [分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-uByUEx/cruise-altitude/分镜.md) 的“图解”列在对应时间点添加关键词花字与解说字幕；
   - 垫上轻快明亮的背景音乐（BGM）并微调音量即可导出成片。


<!-- status: SUCCESS; tools: read_file, read_file, run_command, edit_file, edit_file, write_file, run_command, update_steps -->
