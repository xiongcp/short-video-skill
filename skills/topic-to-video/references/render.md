# L1 本地出片

确认①之后、要交付成片时阅读本文件。配音来源的完整写法、字体、声音和竖屏的细节见 [providers.md](providers.md)。

## 1. 环境

```sh
node <本 skill 目录>/scripts/doctor.mjs
```

| 字段 | 意思 |
| --- | --- |
| `l1_ready` | Node ≥ 20、FFmpeg/FFprobe、`@resvg/resvg-js` 和中文字体都在，可以本机出片 |
| `tts_ready` | 找到了 edge-tts、uvx 或 macOS `say`，能自动配音 |
| `missing` | 缺了哪几项，例如 `ffmpeg`、`cjk-font` |
| `hints` | 每个缺项在当前系统上的安装命令或做法 |
| `recommended_voice` | 本机能用的配音设置，出片前写进 `project.json` 的 `voice` |

- `l1_ready` 为 false：不要硬跑，也不要擅自安装，交付 L0 文本包，并把 `missing` 和 `hints` 原样转告用户。用户装好后再运行一次 doctor。
- `tts_ready` 为 false 且用户没有录音：同样交付 L0，并转告 `hints.tts`。
- 在独立安装的 skill 目录里第一次缺 `@resvg/resvg-js` 时，经用户同意运行一次 `npm install --prefix <本 skill 目录>/scripts`（只有这一个运行时包）。

## 2. 配音

出片前把 `recommended_voice` 合并进 `project.json` 的 `voice`。是 edge-tts 命令时保留项目原来的 `preset`：

```json
"voice": { "provider": "command", "preset": "female-warm", "command": "uvx --from edge-tts edge-tts --voice {voice} --rate={rate} --pitch={pitch} --text {text} --write-media {out} --write-subtitles {sub}" }
```

- edge-tts 免费，但需要联网，每句讲稿会发给微软的朗读服务。确认①时已经告诉用户；用户不同意或不能联网时，改用下面两种。
- macOS `say`（离线）：`{"provider": "command", "voice": "Tingting", "command": "say -v Tingting -o {out} {text}"}`，`preset` 不起作用。
- 用户的录音：`{"provider": "import"}`，把按句录音 `audio/s01-0.wav` 或整段录音 `audio/full.wav` 放进项目文件夹。
- 选人设前想先听：`--audition`，见 providers.md 的“试听人设”。

## 3. 出片

```sh
# 成片：1080p60、BT.709，自动跑 QA
node <本 skill 目录>/scripts/render.mjs <项目文件夹>
```

- 短片在确认①后直接出成片。章节节目或用户要求样片时，先用 `--sample sh08-sh09` 出 2–3 个代表镜头，用户看过后追加 `sample` 确认，再出成片。
- 可选参数：
  - `--preview`：540p30 快速预览，写到 `out/preview.mp4`
  - `--sample shA-shB`：只出这一段镜头
  - `--ratio 9:16|16:9`：换画幅；和 `settings.ratio` 不同时写到 `out/9x16/` 或 `out/16x9/`，配音共用
  - `--resolution 1440p|2160p`：更高清晰度
  - `--fps 30`：更快导出
  - `--motion-blur`：快动作加运动模糊
  - `--master`：另出 yuv444p 高码率母版 `out/master.mp4`
  - `--skip-tts`：复用 `audio/timing.json`，不重新配音
- 耗时（实测，Apple M2 8 核）：67 秒的视频，edge-tts 配音约 40 秒，1080p60 渲染约 100 秒；视频更长时大致按时长增加。重出时没改的句子和镜头命中缓存，快得多。
- 交付物都在 `out/`：`final.mp4`、`captions.srt`、`captions.ass`、`cover.png`、`chapters.txt`、`contact.png`、`transitions.png`、`qa.json`、`qa.md`。

## 4. 读结果

成功时打印一段 JSON：`video` 是成片路径，还有 `resolution`、`fps`、`draft`（true 表示画面带"未审核初稿"角标）、`qa.ok`、`qa.issues`（技术问题数）。

出错时打印 `{"ok": false, "code": "…", "message": "…"}`，退出码 1：

| `code` | 怎么办 |
| --- | --- |
| `PROJECT_NOT_FOUND` | 路径不对，或项目文件夹里还没有 `project.json` |
| `PROJECT_INVALID` | 运行 `check.mjs`，按 `errors` 改好再出片 |
| `VOICE_UNDECIDED` | 把输出里的 `fix.voice` 写回 `project.json` 的 `voice`，再出片 |
| `TTS_FAILED` | 多半是不能联网：检查网络，或改用 `say`、录音。已合成的句子留在 `audio/`，重出时不再重配 |
| `AUDIO_MISSING` | 导入录音缺文件：按提示补上那一句，或放整段 `audio/full.wav` |
| `SAMPLE_RANGE_INVALID` | `--sample` 的镜头 ID 不存在或前后颠倒，改成 `sh03-sh05` 这样的区间 |
| `RENDER_FAILED` | 其他错误：把 `message` 原样告诉用户，不要反复重试 |

退出码 2 表示缺依赖、退回 L0：输出里有 `missing` 和 `hints`，按第 1 节处理。

## 5. QA

- `qa.ok` 为 false 时读 `qa.md` 的“技术问题”：
  - `SYNC_DRIFT`、`FREEZE_DETECTED`、`UNPLANNED_JUMP`：重出一次；还在就如实告诉用户。
  - `HOST_OCCLUSION`、`HOST_OBJECT_OVERLAP`、`STAGE_CROWDED`、`SAFE_ZONE_TEXT`：改分镜（换槽位、减物件或拆镜头），再出片。
  - `MUSIC_TOO_LOUD`、`SFX_OVER_VOICE`：见 providers.md 的声音一节。
- `warnings` 里的 `LINK_LABEL_OVER_HOST` 是连线标签压在小青身上：换物件槽位、缩短标签或让小青站到另一边，再出片。
  - `COLOR_NOT_BT709`、`FPS_MISMATCH`、`SIZE_MISMATCH` 等规格问题：多半出在 FFmpeg 版本或参数上，原样报告。
- `manual_review` 里标 `not_checked` 的人工项（审美、配音自然度、口型抽查、混音、数字读法）照实告诉用户，请用户看一遍；数字读法对照 `qa.md` 的“读法对照”听，读错的写进该段 `pronunciation` 后重新出片（只重配那一句）；竖屏的“真机遮挡”见 providers.md 的竖屏一节。

## 6. 返修

- 改讲稿或分镜：按 SKILL.md 的返修规则改，重新确认后再出片；只有改动的镜头重渲，其余命中 `cache/shots/`。
- 只换配音人设：改 `voice.preset` 后重新出片，配音全部重新合成，不加 `revision`。
- 用户看过成片、表示满意后，追加 `final` 确认。
