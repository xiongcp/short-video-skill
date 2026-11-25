# topic-to-video: a skill for Chinese explainer videos

[简体中文](README.md) · [Website](https://xiongcp.github.io/short-video-skill/)

A lightweight skill for Codex, Claude Code and other agents. Name a topic, or give it sources or a draft, and it writes the script and storyboard for a Chinese explainer video. Once you approve them, it hands you a prompt pack for generating each shot with an external video model. Local rendering (the original anime host "晴" at 1080p60) is in development.

## Three steps

1. **Name a topic.** If the topic is missing it asks once, with defaults for everything else (120 seconds, a general audience, 16:9).
2. **Approve the script and storyboard.** It writes `project.json`, `讲稿.md` (script) and `分镜.md` (storyboard), and checks sentence length, timing estimates, one shot for every sentence, and that on-screen keywords come from the narration. Nothing else happens until you approve.
3. **Make the video from the prompt pack.** `提示词包.md` gives every shot its narration, beats, a first-frame image prompt and a motion prompt, for a "first frame, then image-to-video" workflow on Jimeng, Kling, Vidu, Hailuo, Veo and similar models. The script doubles as the voice-over script.

When you change the script or storyboard it redoes only what changed and tells you which approvals that voids.

## Delivery levels

| Level | Status | Output |
| --- | --- | --- |
| L0 text package | Available, no dependencies | `project.json`, `讲稿.md`, `分镜.md`, `提示词包.md` |
| L1 local render | In development | L0 plus `out/final.mp4` (1080p60), captions, a cover image, chapter timestamps and a QA report |

The L1 design is in the [render quality design](docs/lite/出片质量设计.md) (in Chinese): a vector host rig, 60 fps, matched-element transitions, keyword-level sync between narration and picture, and sync checks in QA.

## Install

Copy the whole `skills/topic-to-video/` folder into the agent's skills folder:

| Agent | Folder |
| --- | --- |
| Codex | user `~/.agents/skills/` (the docs also list `~/.codex/skills/`); repository `.agents/skills/` |
| Claude Code | user `~/.claude/skills/`; project `.claude/skills/` |

```sh
cp -R skills/topic-to-video ~/.claude/skills/
```

Then ask your agent: "Use topic-to-video to make a 2-minute explainer on why caching makes web pages faster." These paths will be confirmed by installation tests in P4.

## Example

[examples/cache-speed](examples/cache-speed/) is a complete 120-second L0 example, with the [script](examples/cache-speed/讲稿.md), the [storyboard](examples/cache-speed/分镜.md) and [project.json](examples/cache-speed/project.json), in Chinese.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| P0 | Archive the previous Studio at tag `studio-v1`; slim the repository down to one skill | Done |
| P1 | L0 text package and scenario evaluations ([summary](tests/scenarios/results/p1-summary.md), in Chinese) | Done |
| Design | Render quality: host detail, frame rate, sync, smooth animation | Done |
| P2a | Host v2: a vector rig | Not started |
| P2b | Local renderer: 60 fps, keyword sync, parallel rendering | Not started |
| P3 | Transitions, samples, revisions and QA | Not started |
| P4 | Installation tests and release | Not started |

The full plan (in Chinese) is in [docs/lite/轻量化Skill计划书.md](docs/lite/轻量化Skill计划书.md).

## Development

```sh
npm install
npm test
```

See [AGENTS.md](AGENTS.md) for the development rules. The previous Studio implementation (13 skills, a TypeScript runtime and G1–G5 gates) is kept at tag `studio-v1` and branch `archive/studio-v1`.

## License

The code is released under the [Apache License 2.0](LICENSE). Usage rights for the host "晴" are decided by the project owner; see [rights.json](skills/topic-to-video/assets/host/rights.json).
