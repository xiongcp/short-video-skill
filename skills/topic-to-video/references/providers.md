# L1 本地渲染、配音来源与跨 Agent 配置

只在用户确认要本地合成 MP4（L1）时阅读本文件；只做 L0 文本包时不用读。

## 1. 环境自检与自动退回

先运行环境自检：

```sh
node <本 skill 目录>/scripts/doctor.mjs
```

- `l1_ready: true`：具备 Node ≥ 20、FFmpeg/FFprobe 与 `@resvg/resvg-js`，可直接本地出片。
- 首次在独立安装的 skill 目录启用 L1 时，如缺 `@resvg/resvg-js`，经用户同意后运行一次 `npm install --prefix <本 skill 目录>/scripts`（仅 1 个运行时包）。
- 缺少 FFmpeg 或 `@resvg/resvg-js`（例如无 FFmpeg 的云沙箱）：不要硬跑，也不要擅自装重型工具，直接按 `SKILL.md` 交付 L0 文本包，并告知用户缺少哪一项。

## 2. 配音来源（`project.json` 的 `voice` 字段）

优先使用**免费本地或 CLI 工具**，零 API 成本即可出片：

| 方案 | `voice` 配置示例 | 词级时间 | 适用场景 |
| --- | --- | --- | --- |
| **edge-tts**（推荐，微软免费神经语音） | `{"provider":"command","preset":"female-warm","command":"edge-tts --voice {voice} --rate={rate} --pitch={pitch} --text {text} --write-media {out} --write-subtitles {sub}"}` | 实测（SRT/VTT） | 自然度高、支持断句语速微调；音色和语速由 `preset` 决定；无全局安装时可用 `uvx --from edge-tts edge-tts ...` |
| **macOS `say`**（离线零依赖） | `{"provider":"command","voice":"Tingting","command":"say -v Tingting -o {out} {text}"}` | 估算 | macOS 本机离线快速试片 |
| **本地开源 TTS**（Kokoro / CosyVoice 等） | `{"provider":"command","command":"python3 my_tts.py --text {text} --out {out}"}` | 估算或自出 VTT | 完全本地私有语音 |
| **导入录音**（`import`） | `{"provider":"import"}` | 估算 | 把按句录音 `audio/s01-0.wav` 或整段录音 `audio/full.wav`（按静音切句）放入项目 |
| **OpenAI 兼容接口** | `{"provider":"openai-compatible","base_url":"https://...","model":"tts-1","voice":"alloy","api_key_env":"SVS_TTS_API_KEY"}` | 估算 | 使用云端付费 TTS（调用前先报价并获确认） |

占位符：`{text}` 读音替换后的单句文本、`{out}` 输出音频路径、`{sub}` 字幕时间戳输出路径、`{voice}` 音色名、`{speed}` 语速倍率、`{rate}` `edge-tts` 语速格式（如 `0.96` → `-4%`）、`{pitch}` `edge-tts` 音高格式（`voice.pitch` 为 `-3` 时是 `-3Hz`，缺省 `+0Hz`）。写了 `preset` 时，`{voice}`、`{speed}`、`{rate}` 取人设的音色和语速；另写 `voice.voice` 会换掉人设的音色（自检报 `PRESET_UNUSED`），另写 `voice.speed` 会换掉人设的语速。命令按参数数组直接执行，不经过 shell 拼接。

韵律与音质处理（自动完成）：合成后自动裁掉首尾死静音并加 20ms 淡入淡出防爆音；按标点自动插入自然呼吸停顿（陈述句 250ms、问句/感叹句 +160ms、段落切换 +350ms）；混音经 `highpass 80Hz` + 轻压缩 + 双遍 `loudnorm`（-16 LUFS）；字幕按逗号分句同步显示。

配音人设：8 个人设的音色和适合的题材见 [script.md](script.md) 的“配音人设与口吻”。换人设只改 `voice.preset`；`voice.pitch`（−20 到 20 Hz）只在用户要求时微调音高。

### 试听人设

选人设或换人设之前可以先试听。只需 FFmpeg 和 edge-tts（或 uvx），不需要 `@resvg/resvg-js`，也不调用付费接口：

```sh
# 全部 8 个人设
node <本 skill 目录>/scripts/render.mjs <项目文件夹> --audition
# 只听男声和晓晓
node <本 skill 目录>/scripts/render.mjs <项目文件夹> --audition male,female-warm
```

- 台词是讲稿最前面的两句。每个人设出一个文件，例如 `out/audition/01-male-sunny.wav`；`out/audition/all.wav` 把它们依次连起来，中间隔 0.8 秒。终端打印每个人设的音色、语速、文件和时长。
- 人设列表写人设 ID，或 `female`、`male`、`child`（选出以它开头的所有人设）。
- 只写 `out/audition/`，不改 `project.json`，也不动 `audio/`。把 `all.wav` 的路径告诉用户，等用户选定后再改 `voice.preset`。
- 项目的 `command` 是 edge-tts 命令时用它，否则用 `doctor.mjs` 推荐的 edge-tts 或 uvx 命令；两者都没有时报错"试听需要 edge-tts 或 uvx"，不改用 macOS `say`。

## 3. 本地渲染命令（agy / Claude Code / Codex 通用）

```sh
# 1) 540p30 快速预览
node <本 skill 目录>/scripts/render.mjs <项目文件夹> --preview

# 2) 1080p60 样片（选 2–3 个代表镜头确认）
node <本 skill 目录>/scripts/render.mjs <项目文件夹> --sample sh08-sh09

# 3) 1080p60 成片（默认 BT.709、CRF 16、双遍 loudnorm、自动跑 QA）
node <本 skill 目录>/scripts/render.mjs <项目文件夹>

# 可选参数：
#   --resolution 1440p|2160p   更高清晰度（纯矢量重绘，无需换素材）
#   --fps 30                   30fps 更快导出
#   --motion-blur              快动作（跳/挥手/小跑/元素入场）4x 子帧运动模糊
#   --master                   额外输出 yuv444p 高码率母版 out/master.mp4
#   --skip-tts                 复用已有 audio/timing.json
#   --audition [人设列表]      只试听配音人设，写入 out/audition/，不出片
```

交付物全部写在 `<项目文件夹>/out/`：`final.mp4`、`captions.srt`、`captions.ass`（保留关键词高亮）、`cover.png`、`chapters.txt`、`contact.png`、`transitions.png`、`qa.json`、`qa.md`。

## 4. 字体与画质

- 正文与字幕自动查找系统中文黑体（macOS `Hiragino Sans GB` / `STHeiti`，Linux `Noto Sans CJK`，Windows 微软雅黑），也可用环境变量 `SVS_FONT`、`SVS_TITLE_FONT` 指定自定义字体或霞鹜文楷（LXGW WenKai，OFL 许可，下载前先告知文件大小并征得用户同意，放缓存目录，不放 skill 目录）。
- 返修单句讲稿或单镜图解时，只重新合成或重渲染受影响的镜头，其余镜头自动命中 `cache/shots/` 缓存。
