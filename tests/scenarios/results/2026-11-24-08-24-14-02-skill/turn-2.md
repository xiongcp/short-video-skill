已为您完成**确认①**的记录与归档，并正式交付完整的视频方案 **L0 文本包**（含逐镜提示词包）。

---

### 一、交付文件清单与路径

所有文件均位于项目文件夹 [cruise-altitude/](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-UZ2b6p/cruise-altitude) 下，已通过 schema 校验与交叉一致性自检：

1. **项目数据源**：[cruise-altitude/project.json](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-UZ2b6p/cruise-altitude/project.json)
   - 已追加确认记录：`{"stage": "plan", "revision": 1, "at": "2026-11-24T00:30:10", "note": "可以，按这个出提示词包。"}`。
2. **口播讲稿**：[cruise-altitude/讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-UZ2b6p/cruise-altitude/讲稿.md)
   - 状态已更新为“已确认（revision 1，2026-11-24）”，共 6 段，口播 448 字，估算约 117 秒。
3. **视觉分镜**：[cruise-altitude/分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-UZ2b6p/cruise-altitude/分镜.md)
   - 共 15 个镜头，镜头类型与主持人状态均与讲稿严格对齐；样片候选区间为 **sh07–sh08**（约 19 秒）。
4. **逐镜提示词包**：[cruise-altitude/提示词包.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-UZ2b6p/cruise-altitude/提示词包.md)
   - 包含 15 个镜头的独立提示词（规格、画风、人物锁定、画面内容、分段动作、镜头运动、首尾衔接与禁止项）。
5. **角色参考图**：[cruise-altitude/ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-UZ2b6p/cruise-altitude/ref/host.png)
   - 主持人“晴”的原设参考图，用于在视频生成平台垫图锁定长相。

---

### 二、项目状态与待核实事项

- **确认状态**：**已确认（revision 1，2026-11-24）**
- **待核实事项（`open_questions`）**：
  - 资料原文提及“高空巡航比低空节油九成”的说法缺乏权威出处；讲稿已采用“更理想的节油表现 / 显著更省油”的稳妥中性表述。如后续需要加入具体百分比，可查阅权威民航工程资料后直接补充。

---

### 三、下一步制作与出片指南

1. **画面生成（外部 AI 视频平台）**：
   - **模型推荐**：即梦（Jimeng AI）、可灵（Kling AI）、海螺（Hailuo AI）、Runway Gen-3 或 OpenAI Sora 等。
   - **角色一致性**：在生成 `sh01`、`sh03`、`sh04`、`sh07`、`sh09`、`sh11`、`sh13`、`sh15` 等带主持人的镜头时，上传 [ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-UZ2b6p/cruise-altitude/ref/host.png) 作为角色参考（Character Reference），确保“晴”的外貌、发型、青色挑染与墨蓝短外套一致。
   - **生成时长**：模型单次生成时长通常为 5 秒、10 秒或 15 秒，生成后导入剪辑软件按分镜估时裁剪。
2. **配音与音频轨**：
   - 以 [讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-UZ2b6p/cruise-altitude/讲稿.md) 为基准录制真人旁白或使用 TTS 工具（如剪映朗读、CosyVoice、IndexTTS 等）生成清澈亲切的女性旁白。
   - 选配轻快、明朗且带有探索感的科技风背景音乐（BGM 建议音量在 -18dB 到 -24dB 之间，避免压过人声）。
3. **剪辑拼装与字幕包装**：
   - 在剪映、Premiere 或 Final Cut Pro 中建立 16:9 时间线，按 `sh01` 至 `sh15` 顺序拼入视频切片并对齐配音。
   - 依 [分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-UZ2b6p/cruise-altitude/分镜.md) 的“图解”列添加关键词与图形遮罩，最终导出 1080P/4K 高清 MP4 即可发布。


<!-- status: SUCCESS; tools: update_steps, run_command, read_file, read_file, run_command, update_steps -->
