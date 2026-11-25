# topic-to-video：中文知识解说视频 Skill

[English](README.en.md) · [官网](https://xiongcp.github.io/short-video-skill/)

给 agy、Claude Code、Codex 等 Agent 用的轻量 skill。说一个主题，或者给一份资料、一篇讲稿，它会写出中文知识解说视频的讲稿和分镜，请你确认后，可输出交给外部视频模型的提示词包（L0），也可直接调用本地矢量渲染器（原创手绘火柴人主持人"小青"、1080p60/4K、平滑同元素转场、`edge-tts` 或离线配音）合成成片（L1）。

## 三步出片

1. **说主题**：只缺主题时一次问齐，时长、受众、比例都有默认值（120 秒、零基础观众、16:9）。
2. **确认讲稿和分镜**：产出 `project.json`、`讲稿.md`、`分镜.md`，并自检每句字数、估时、句子与镜头是否一一对应、画面关键词是否出自口播。你确认后才进入下一步。
3. **拿提示词包出片**：`提示词包.md` 逐镜给出口播、节拍、首帧图和运动提示词，按"先出首帧图，再图生视频"的流程交给即梦、可灵、Vidu、海螺、Veo 等平台；讲稿.md 就是配音稿。

改讲稿或分镜时，它只重做改到的部分，并说明哪些确认因此失效。

## 交付档位

| 档位 | 状态 | 交付物 |
| --- | --- | --- |
| L0 文本包 | 可用，不需要任何依赖 | `project.json`、`讲稿.md`、`分镜.md`、`提示词包.md` |
| L1 本地成片 | 可用（缺 FFmpeg 时自动退回 L0） | 在 L0 之外加 `out/final.mp4`（1080p60，可选 1440p/4K）、`.srt`/`.ass` 字幕、封面、章节时间戳和 QA 报告 |

L1 的设计与路线图见 [出片质量设计](docs/lite/出片质量设计.md)、[火柴人主持人设计](docs/lite/火柴人主持人设计.md) 和 [超越路线图](docs/lite/超越路线图.md)：手绘火柴人全身骨架与两节逆解、60fps、同元素补间转场、快动作 4x 运动模糊、关键词级音画对齐，以及 BT.709/跳变/卡顿/遮挡自动 QA。

## 主持人

主持人是原创手绘火柴人"小青"：黑色墨线，系一条青色围巾，全身 17 个关节由代码画出。分镜按名字选 12 个动作、8 种表情和 6 件道具；在 `host-left` 镜头里，小青能走到某个图解元素旁边指着讲。

![小青速查图：12 个动作、8 种表情和 6 件道具](site/assets/host-cheatsheet.png)

## 安装

把 `skills/topic-to-video/` 整个目录复制到 Agent 的 skills 目录：

| Agent | 目录 |
| --- | --- |
| agy | 用户级 `~/.gemini/antigravity/skills/` 或工作区 `.gemini/skills/` |
| Codex | 用户级 `~/.agents/skills/`（官方文档也列出 `~/.codex/skills/`）；仓库级 `.agents/skills/` |
| Claude Code | 用户级 `~/.claude/skills/`；项目级 `.claude/skills/` |

```sh
cp -R skills/topic-to-video ~/.claude/skills/
# 如需 L1 本地出片（可选，仅 1 个运行时包 + 系统 FFmpeg）：
npm install --prefix ~/.claude/skills/topic-to-video/scripts
```

然后运行 `node ~/.claude/skills/topic-to-video/scripts/doctor.mjs` 检查环境，在 Agent 里说："用 topic-to-video 把'为什么缓存能让网页变快'做成 2 分钟的解说视频。"

## 示例

[examples/cache-speed](examples/cache-speed/) 是一个 120 秒的完整 L0 示例，包括 [讲稿](examples/cache-speed/讲稿.md)、[分镜](examples/cache-speed/分镜.md) 和 [project.json](examples/cache-speed/project.json)。

## 路线图

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 旧版工作室归档到 tag `studio-v1`，仓库瘦身为单一 skill | 完成 |
| P1 | L0 文本包与场景评测（[汇总](tests/scenarios/results/p1-summary.md)） | 完成 |
| 设计 | 出片质量：人物、帧率、匹配度、平滑动画 | 完成 |
| S1 / M1 | 火柴人主持人"小青"：骨架、精修造型、3 种手型、V 形缺口围巾与评审工具 | 完成 |
| M2–M4 | 本地渲染器：60fps/4K、24 手绘图标、6 套手绘模板、全身运动与两节逆解、本地配音（`edge-tts`/`say`） | 完成 |
| M5 | 同元素补间转场、选择性运动模糊、BT.709/跳变/卡顿/同步/遮挡 QA 与交付物 | 完成 |
| M6–M7 | 跨 Agent（agy/Claude Code/Codex）统一入口与端到端对标验收 | 进行中 |

完整计划见 [轻量化 Skill 计划书](docs/lite/轻量化Skill计划书.md)。

## 开发

```sh
npm install
npm test
```

开发规则见 [AGENTS.md](AGENTS.md)。旧版工作室实现（13 个 skill、TypeScript runtime、G1–G5 门禁）保存在 tag `studio-v1` 和分支 `archive/studio-v1`。

## 许可

代码以 [Apache License 2.0](LICENSE) 发布。主持人"小青"的使用权由项目 owner 决定，见 [rights.json](skills/topic-to-video/assets/host/rights.json)。
