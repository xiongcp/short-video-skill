# topic-to-video: a skill for Chinese explainer videos

[简体中文](README.md)

A lightweight skill for Codex, Claude Code and other agents. Give it a topic, sources or a draft and it produces the script and storyboard for a Chinese explainer video, plus a prompt pack for generating each shot with an external video model (L0). Later versions will render the video locally with the original anime host "晴" (L1).

## Status

- Done: P0. The previous Studio implementation is archived at tag `studio-v1`; the repository now holds a single skill.
- In progress: P1, the L0 text package and scenario evaluations.
- The full plan (in Chinese) is in [docs/lite/轻量化Skill计划书.md](docs/lite/轻量化Skill计划书.md).

## Install

Copy the whole `skills/topic-to-video/` folder into the agent's skills folder:

| Agent | Folder |
| --- | --- |
| Codex | user `~/.agents/skills/` (the docs also list `~/.codex/skills/`); repository `.agents/skills/` |
| Claude Code | user `~/.claude/skills/`; project `.claude/skills/` |

These paths will be confirmed by installation tests in P4.

## Development

```sh
npm install
npm test
```

See [AGENTS.md](AGENTS.md) for the development rules. The previous Studio implementation (13 skills, a TypeScript runtime and G1–G5 gates) is kept at tag `studio-v1` and branch `archive/studio-v1`.

## License

See [LICENSE](LICENSE).
