# 上线前一句话出片本机验收（任务 8）

日期：2026-11-26。机器：Apple M2 8 核，Node 26.8.1，FFmpeg 9.0.2。没有花 Agent 配额：由执行计划的会话自己当 Agent，只按 `SKILL.md` 和 references 操作，不看源码。修代码时看源码的部分，下面单独标出。

成片不提交，放在本机被 git 忽略的 `out/launch-acceptance/`。

## 结论

两句话都出了片，QA 通过。

| | 为什么天空是蓝色的 | 为什么冬天静电多 |
| --- | --- | --- |
| 比例与目标 | 16:9，120 秒 | 9:16，60 秒 |
| 读的 skill 文件 | SKILL.md、script.md、world.md、storyboard.md、render.md（共约 41 KB） | 同左（复用） |
| `check.mjs` 轮数 | 4 轮到零警告，修完 bug 后又 3 轮 | 2 轮（1 个错误、5 个警告 → 全清） |
| 估算时长 | 109.8 秒 | 55.3 秒 |
| 成片时长 | 100.8 秒 | 51.3 秒 |
| 规格 | 1920×1080，60fps，H.264/AAC，BT.709 | 1080×1920，60fps，H.264/AAC，BT.709 |
| 首次出片总耗时（含 edge-tts） | 162 秒 | 101 秒 |
| 只重出改动镜头 | 27–28 秒（12 镜里重渲 1–2 镜） | — |
| 首次 QA | `ok: false`：sh07 小青与桌子重叠 324 帧 | `ok: true`，0 问题，0 警告 |
| 最终 QA | `ok: true`，0 问题；警告：sh10 连线标签压人 11 帧，两处 3 帧完全相同 | 同上 |
| 遮住文字能否猜出主题（评审表第 17 项） | 大致能：太阳 → 空气分子 → 眼睛 → 天空，彩虹 | 能：门把手 + 闪电、毛衣、加湿器、钥匙 |

目标是 120 秒的片子 8 分钟内出完，实际 162 秒，达标。

## 第 3 步：配音失败与离线预览

- 把 `voice.command` 换成必失败的 uvx 包：3.3 秒后退出码 1，返回 `{"ok": false, "code": "TTS_FAILED", "message": "配音命令 uvx 失败：…。edge-tts 需要联网；不能联网时改用 macOS say 或导入录音"}`。下一步可以照着做。
- 改用 `say -v Tingting` 出 `--preview`：27 秒得到 540×960、30fps、57.9 秒的预览，QA 通过。

## 第 4 步：官网演示片素材

用修好的渲染器把 `examples/cache-speed` 出成 1080p60：66.9 秒、37 MB，QA 0 问题 0 警告，耗时 130 秒。文件在 `out/launch-acceptance/cache-speed-1080p60.mp4`，给任务 11 用。

## 发现并已修复的问题

每项都有先失败后通过的测试，`npm test` 630/630。

| 提交 | 问题 | 修法 |
| --- | --- | --- |
| 67b8bb2 | `STATIC_STRETCH` 只按句首算 cue 时间，忽略 `cue.at`。超过 4 秒的长句不管怎么加 cue 都报警；场景 09 里每个镜头都报。`NO_INTERACTION` 写着"或 tap"，场景 09 的 Agent 因此写成了 `do: tap`。 | 带 `at` 的 cue 按关键词在句中的位置估时，和渲染器一致。提示改为写明 `{"do": "gesture", "target": "tap"}`。storyboard.md 补一句"长句用 `at`"。 |
| 3061db3 | `TTS_FAILED` 引用的报错行带缩进，结尾是"。"。 | 去掉缩进和句末标点。 |
| 6009157 | 小青走到"叠在桌上的杯子"旁时，两侧站位都落在桌面上，结果站进桌子里（`HOST_OBJECT_OVERLAP` 324 帧，图：`sky-sh07-overlap-before.png`）。 | 两侧都被挡时往外找第一个空位。正片走位和舞台模拟共用这个逻辑。 |
| 5170fef | 命中缓存的镜头不回填逐镜 QA。返修后重出，没改动镜头的遮挡、重叠、标签压人问题会从 qa 里消失（sh10 的警告第二次出片就没了）。 | 每个镜头把 QA 计数存成缓存旁的 `.qa.json`，命中缓存时读回。后续 `fc24e4e` 补齐：只有视频没有 `.qa.json`（或损坏）的旧缓存按未命中处理，且每个镜头渲完即写 `.qa.json`。 |
| 54be3ba | sh03 是 `full` 对比图，两栏都在第 2 句才出现，开头约 3 秒空白。自检和 QA 都没拦住。 | 新增警告 `EMPTY_START`：`full` 镜头所有元素都等 reveal，且第一个晚于 1 秒出现时提醒。storyboard.md 记一句（10233/10240 字节）。 |
| 18502ec | 安全审查：`tests/scenarios/run.mjs` 中 Claude Code 评测白名单含通用 `Bash(node:*)` 和 `Bash(ffmpeg:*)`，存在诱导执行任意代码风险。 | 改为仅允许调用 skill 自带的 `doctor.mjs`、`check.mjs`、`render.mjs`，并用 `--disallowedTools` 显式禁掉 `node -e`、`--eval`、`-p`、`--print`。 |
| fc24e4e | 终审两条 Important：旧缓存没有 `.qa.json` 仍会命中并跳过 QA；逐镜 `.qa.json` 等全部镜头渲完才写，中断后下次跳过 QA。 | 无有效 `.qa.json` 视为未命中并清理旧 sidecar；`runPool` 每完成一镜立即写 `.qa.json`，并安全处理 FFmpeg 提前退出的 `EPIPE`。 |
| 4084447 | Linux CI（`ubuntu-latest` Node 22/24）`host-rig.test.mjs` 失败：长度 60 px 的肢体在 arm64 与 x86_64 上 `Math.hypot/6` 差 1 ULP，导致 `Math.ceil` 在 10/11 间翻转。 | `ink.mjs` 改为 `Math.ceil(total / 6 - 1e-9)`，重绘 host 资产并重录金样。CI run `45934297122` 在 Ubuntu 22/24 与 macOS 24 全绿（643/643）。 |

## agy 场景评测（任务 14 · gemini-3.8-flash-high）

日期：2026-11-26（UTC 2026-11-27）。基于提交 `4084447`（`dirty: false`），`agy 1.5.18`，模型 `gemini-3.8-flash-high`，并行运行场景 10、11、04（均不含视频媒体文件提交）。

| 场景 | 主题与模式 | 检查通过 | 成片规格与时长 | QA 结论 | 记录目录 |
| --- | --- | --- | --- | --- | --- |
| 10 | 一句话出片（L1，2 轮） | **5 / 5** | 1920×1080，60fps，**58.47 秒**（估算 57.0 秒） | `ok: true`，0 问题 0 警告，`draft: false` | [`2026-11-27-03-30-06-10-skill/review.md`](2026-11-27-03-30-06-10-skill/review.md) |
| 11 | 直接出片（L1，1 轮） | **3 / 4** | 1920×1080，60fps，**66.62 秒**（估算约 63 秒） | `ok: true`，0 问题（2 处 3 帧警告），`draft: true` | [`2026-11-27-03-30-07-11-skill/review.md`](2026-11-27-03-30-07-11-skill/review.md) |
| 04 | 要成片但无渲染能力（L0，2 轮） | **1 / 4** | 未退回 L0，安装 `@resvg/resvg-js` 后出了 63.13 秒成片 | `ok: true`，0 问题，`draft: false` | [`2026-11-27-03-30-09-04-skill/review.md`](2026-11-27-03-30-09-04-skill/review.md) |

### 评测发现与待决项

1. **4.5 字/秒估时校准有效**：三条实测成片分别比估算多 2.6%（57.0 → 58.47s）、2.8%（61.4 → 63.13s）、5.7%（63 → 66.62s），远好于之前 13–16% 的偏差。场景 11 仅因原稿写到 255 字（估算 63 秒），最终实测 66.62 秒超出 54–66 秒判定上限 0.62 秒。
2. **场景 11 验证了 QA 自修与镜头缓存**：模型首渲遇到 `HOST_OBJECT_OVERLAP` 与 `LINK_LABEL_OVER_HOST` 后，自行微调 `sh03` 槽位并在 46.5 秒内借缓存完成增量重渲，最终 `qa.ok: true`、`issues: 0`。
3. **场景 04 暴露两处需 owner 拍板的边界**：
   - `run.mjs` 对 L0 场景只省略了 `node_modules/@resvg`，未屏蔽本机 `ffmpeg`，导致 `doctor.mjs` 只缺 `@resvg/resvg-js` 一项；
   - `references/render.md` 第 21 行允许“第一次缺 `@resvg/resvg-js` 时经用户同意运行 `npm install --prefix .../scripts`”，模型在第 1 轮越步读了 `render.md`，把安装请求打包进确认①，并将第 2 轮的“方案可以。”视为安装授权。
4. **越步读源码现象**：三场评测里模型都在第 1 轮查看了 `scripts/` 源码（如 `check.mjs`、`project.mjs`），尽管 `SKILL.md` 写明“scripts/ 的源码都不用读”；这会增加首轮耗时与 token 消耗，但不影响产出正确性。
5. **agy 沙箱与 `uvx`**：agy 默认沙箱禁止 `uvx` 写入 `~/.local/share/uv/tools`，首次 `render.mjs` 干净返回结构化 `TTS_FAILED`（含原因与备选建议），随后 agy 在跳过沙箱权限后正常完成 edge-tts 合成与出片。

## owner 已决定

1. **估时偏长约 13%**。原来规划按每秒 4 字估算；实测 edge-tts 晓晓（speed 0.96）是每秒 4.6 字，macOS say 是每秒 4.0 字，按目标时长写满的讲稿用 edge-tts 出片会短 13–16%（120 秒出成 101 秒）。2026-11-26 owner 决定：估算改为每秒 4.5 字。示例 cache-speed 的目标时长随之改为 65 秒（估算约 63 秒，实测成片 67 秒）。

## 次要问题（未修）

- 竖屏图解字号偏小：对比图正文约 30 px，要点约 36 px（1080 宽），手机上能读但偏小。图：`static-text-size.png`。
- 竖屏 `wave` 举手时手臂会横穿小青的脸（静电片 sh07 结尾），属于人工复核项。
- 天空片 sh10 连线标签压到小青 11 帧（约 0.2 秒），可以换槽位消掉。
- 两处 3 帧完全相同（`FREEZE_DETECTED`，警告级）。
- 竖屏舞台下方约 40% 空着（字幕在画面中部）。是否属于给平台界面预留的安全区，待设计确认。

## 文件

- 成片与截图：`out/launch-acceptance/`（不提交）
- 项目文件夹：会话临时目录 `accept/sky-blue`、`accept/static-shock`、`accept/tts-fail`、`accept/cache-speed`（不保留）
