# 配音来源、字体、声音与竖屏

配音来源、字体、声音和竖屏的细节；出片步骤见 [render.md](render.md)。

## 1. 配音来源（`project.json` 的 `voice` 字段）

优先使用**免费的本地工具或命令行工具**，零 API 成本即可出片（edge-tts 免费，但需要联网，讲稿文本会发给微软的朗读服务）：

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

## 2. 字体与画质

- 正文与字幕自动查找系统中文黑体（macOS `Hiragino Sans GB` / `STHeiti`，Linux `Noto Sans CJK`，Windows 微软雅黑），也可用环境变量 `SVS_FONT`、`SVS_TITLE_FONT` 指定自定义字体或霞鹜文楷（LXGW WenKai，OFL 许可，下载前先告知文件大小并征得用户同意，放缓存目录，不放 skill 目录）。
- 返修单句讲稿或单镜图解时，只重新合成或重渲染受影响的镜头，其余镜头自动命中 `cache/shots/` 缓存。

## 3. 声音（`project.json` 的 `sound` 字段）

L1 出片时用代码合成纸面手绘风的音效和背景音乐，不下载、不调用付费接口。`sound` 可以不写：有 `world` 时音效开、音乐取场景推荐的情绪；没有 `world` 时都不开，和以前一样只有配音。

```json
"sound": { "sfx": "auto", "music": { "mood": "playful" } }
"sound": { "sfx": "off", "music": { "file": "music/bed.mp3", "source": "用户说的来源", "license": "用户说的许可" } }
```

| 字段 | 取值 |
| --- | --- |
| `sfx` | `auto`（在出现、高亮、开门、落地等动作上卡点）或 `off` |
| `music.mood` | `calm`、`playful`、`curious`、`upbeat` 或 `none`（不要音乐）；和 `file` 二选一 |
| `music.file` | 项目文件夹内的相对路径（mp3/wav/m4a/aac/flac/ogg），必须同时写 `source` 和 `license` |

| 情绪 | 中文名 | 速度 | 推荐场景 |
| --- | --- | --- | --- |
| `calm` | 平静 | 72 BPM | `blank`、`podium`、`office` |
| `playful` | 俏皮 | 100 BPM | `kitchen`、`street` |
| `curious` | 好奇 | 84 BPM | `lab`；`night` 风格一律用它 |
| `upbeat` | 轻快 | 112 BPM | `outdoor`、`workshop` |

- 用户自己的音乐：只用用户给的文件，放进项目文件夹；`source`、`license` 照抄用户原话，不替用户判断能不能用，也不去网上找音乐。自检报错 `MUSIC_LICENSE_MISSING`（缺来源或许可）、`MUSIC_PATH_INVALID`（绝对路径、网址或 `..`）；警告 `MUSIC_FILE_MISSING`（文件还没放进来）；出片时文件几乎没声音会警告 `MUSIC_SILENT` 并按没有音乐处理。
- 混音：配音先润色，再混入音效和音乐。音乐整体比人声低 14 dB，说话时再压低 6 dB，段落之间换气一小节。
- QA：`MUSIC_TOO_LOUD` 是说话时音乐离人声不到 15 dB，`SFX_OVER_VOICE` 是音效离人声不到 8 dB。出现时换更安静的情绪、改用 `"mood": "none"`，或关掉音效 `"sfx": "off"`，再重新出片。
- 试听：`node <本 skill 目录>/scripts/render.mjs <项目文件夹> --audition-sound [calm,playful]` 写出 `out/audition/music-<情绪>.wav`（每个 15 秒）和 `out/audition/sfx.wav`（全部音效依次播放），不读 `project.json`，不需要 FFmpeg。

## 4. 竖屏（9:16）

- `settings.ratio` 是 9:16 时直接出竖屏；横屏项目加 `--ratio 9:16` 再出一版，写到 `out/9x16/`，配音、音效和音乐共用，不重新合成。
- 标题、物件标签和字幕都留在文字安全框（x 64–910、y 250–1440）里，避开抖音、TikTok、Shorts 的标题栏、点赞栏和文案区；超出时 QA 报 `SAFE_ZONE_TEXT`，同台排不下报 `STAGE_CROWDED`。
- 安全框是第三方估算，`qa.md` 里"真机遮挡"一项标 `not_checked`：请用户上传前设为仅自己可见，在 App 里预览一次；`contact-safe.png` 在联系表上画出了安全框。
