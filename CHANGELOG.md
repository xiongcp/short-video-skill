# 更新记录

## v1.0.0（2026-11-26）

第一个上线版本：说一句话，就能在本机得到一条中文知识解说视频。

### 出片

- **一句话出片**：用户要视频、成片或只说"做成解说视频"时，`doctor.mjs` 显示环境齐全，就在确认①后直接出 `out/final.mp4`；短片默认不再单独出样片。
- **L1 为默认，L0 兜底**：缺依赖或用户只要文本时交付提示词包，并转告缺什么、怎么装。
- **未审核初稿角标**：用户说"不用确认，直接出片"时，成片左上角带"未审核初稿"角标，`qa.md` 注明；补记确认后重出即可去掉。
- **12 个通用科普物件**：太阳、月亮、星星、树、水滴、火焰、闪电、温度计、原子、病菌、眼睛、苹果，内置物件从 60 个增加到 72 个。

### 出错时能看懂

- `render.mjs` 出错时打印 `{"ok": false, "code", "message"}`，错误码有 `PROJECT_NOT_FOUND`、`PROJECT_INVALID`、`VOICE_UNDECIDED`、`TTS_FAILED`、`AUDIO_MISSING`、`SAMPLE_RANGE_INVALID`、`RENDER_FAILED`；退出码 2 表示缺依赖、退回 L0。
- 出片前先检查项目，`--sample` 的区间在配音前检查；每合成一句就保存 `timing.json`，配音中途失败时已合成的句子不重配。
- `doctor.mjs` 新增 `tts_ready`、中文字体检查，并按 macOS、Linux、Windows 给出每个缺项的安装命令（`hints`）。

### 画面与 QA

- 连线标签自动避开小青，压到时报警告 `LINK_LABEL_OVER_HOST`。
- 小青走到叠在桌上的物件旁时，站到桌子外侧，不再站进桌子里。
- 返修重出时，命中缓存的镜头保留逐镜 QA 结果。
- 自检：带 `at` 的 cue 按关键词位置估时（`STATIC_STRETCH`）；新增 `EMPTY_START`，提醒 `full` 镜头开头空白。
- 估时改为每秒 4.5 字（按 edge-tts 晓晓实测每秒 4.6 字校准），按目标时长写的讲稿出片不再短 13% 左右。

### 文档与官网

- 新增 [安装与部署](docs/guide/安装部署.md) 和 [使用指南](docs/guide/使用指南.md)。
- `SKILL.md` 和 references 改为环境具备时默认出片，新增 `references/render.md`。
- README 中英文同步改写：以一句话出片开头，写明 edge-tts 免费但需要联网，并链接两份指南。
- 官网首屏换成本机渲染的演示片，加分享卡片（Open Graph），更新安装、常见问题和路线图。
- 新增 GitHub Actions：每次推送和拉取请求都运行 `npm test`。
- 场景评测支持 Claude Code，新增一句话出片和直接出片两个场景；上线前的本机验收记录见 `tests/scenarios/results/launch-summary.md`。
