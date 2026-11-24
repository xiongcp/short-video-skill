# topic-to-video：中文知识解说视频 Skill

[English](README.en.md)

给 Codex、Claude Code 等 Agent 用的轻量 skill。输入主题、资料或已有讲稿，产出中文知识解说视频的讲稿、分镜，以及交给外部视频模型逐镜生成的提示词包（L0）。后续版本会在本地合成带原创动漫主持人"晴"的成片（L1）。

## 当前状态

- 已完成：P0（旧版工作室实现归档到 tag `studio-v1`，仓库瘦身为单一 skill）和 P1（L0 文本包，场景评测 01–04，见 [P1 汇总](tests/scenarios/results/p1-summary.md)）。
- 下一步：P2，本地渲染最小可用版本。
- 全部计划见 [轻量化 Skill 计划书](docs/lite/轻量化Skill计划书.md)。

## 安装

把 `skills/topic-to-video/` 整个目录复制到 Agent 的 skills 目录：

| Agent | 目录 |
| --- | --- |
| Codex | 用户级 `~/.agents/skills/`（官方文档也列出 `~/.codex/skills/`）；仓库级 `.agents/skills/` |
| Claude Code | 用户级 `~/.claude/skills/`；项目级 `.claude/skills/` |

安装路径会在 P4 实测后更新。

## 开发

```sh
npm install
npm test
```

开发规则见 [AGENTS.md](AGENTS.md)。旧版工作室实现（13 个 skill、TypeScript runtime、G1–G5 门禁）保存在 tag `studio-v1` 和分支 `archive/studio-v1`。

## 许可

见 [LICENSE](LICENSE)。
