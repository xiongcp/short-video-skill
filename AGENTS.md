# 仓库代理入口 · Repository Agent Entry

[简体中文](#zh) · [English](#en)

---

<a id="zh"></a>

## 简体中文

欢迎使用 **AI Animation Studio Skills**。本仓库的代理工作约定、TDD 开发规范、媒体规格及维护规则完整定义在 **[AGENT.md](AGENT.md)**（纯英文技术规范）。在本项目内工作时请优先阅读该指南。

### 核心任务入口

- **策划或制作一期节目**：阅读 [主技能 (topic-to-video)](skills/topic-to-video/SKILL.md#chinese)
- **接续系统工程开发与 TDD**：阅读 [交接状态与证据](docs/upgrade/交接状态与证据.md) 与 [TDD 执行计划](docs/upgrade/TDD执行计划.md)
- **执行离线验收与质量回归**：阅读 [验收矩阵](evals/acceptance.md)
- **跨模型或工程师交接**：阅读 [模型交接提示词](docs/upgrade/模型交接提示词.md)

### 快速验证命令

```sh
python3 -B evals/check_design.py
python3 -B -m unittest discover -s evals -p 'test_*.py' -v
```

---

<a id="en"></a>

## English

Welcome to **AI Animation Studio Skills**. Complete engineering instructions, TDD conventions, media specifications, and maintenance rules are codified in **[AGENT.md](AGENT.md)**. Please consult this guide before performing tasks in this repository.

### Key Entry Points

- **Plan or Produce an Episode**: See [Entry Skill (topic-to-video)](skills/topic-to-video/SKILL.md#english)
- **Continue Studio Engineering & TDD**: See [Handoff Status & Evidence](docs/upgrade/handoff-status.en.md) and [TDD Plan](docs/upgrade/tdd.en.md)
- **Run Acceptance & Regressions**: See [Acceptance Matrix](evals/acceptance.en.md)
- **Model or Human Handoff**: See [Handoff Prompts](docs/upgrade/handoff-prompts.en.md)

### Quick Verification Commands

```sh
python3 -B evals/check_design.py
python3 -B -m unittest discover -s evals -p 'test_*.py' -v
```
