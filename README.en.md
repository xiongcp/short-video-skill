# topic-to-video: a skill for Chinese explainer videos

[简体中文](README.md) · [Website](https://xiongcp.github.io/short-video-skill/)

A lightweight skill for agy, Claude Code, Codex and other agents. Name a topic, or give it sources or a draft, and it writes the script and storyboard for a Chinese explainer video. Once you approve them, it outputs a prompt pack for external video models (L0) or renders the finished MP4 locally (L1) with 小青 (Xiaoqing), an original hand-drawn stick-figure host, at 1080p60/4K with matched-element transitions and local TTS: `edge-tts` with 8 male and female voice presets you can audition first, or macOS `say`.

## Three steps

1. **Name a topic.** If the topic is missing it asks once, with defaults for everything else (120 seconds, a general audience, 16:9).
2. **Approve the script and storyboard.** It writes `project.json`, `讲稿.md` (script) and `分镜.md` (storyboard), and checks sentence length, timing estimates, one shot for every sentence, and that on-screen keywords come from the narration. Nothing else happens until you approve.
3. **Make the video from the prompt pack.** `提示词包.md` gives every shot its narration, beats, a first-frame image prompt and a motion prompt, for a "first frame, then image-to-video" workflow on Jimeng, Kling, Vidu, Hailuo, Veo and similar models. The script doubles as the voice-over script.

When you change the script or storyboard it redoes only what changed and tells you which approvals that voids.

## Delivery levels

| Level | Status | Output |
| --- | --- | --- |
| L0 text package | Available, no dependencies | `project.json`, `讲稿.md`, `分镜.md`, `提示词包.md` |
| L1 local render | Available (falls back to L0 if FFmpeg is missing) | L0 plus `out/final.mp4` (1080p60, optional 1440p/4K), `.srt`/`.ass` captions, a cover image, chapter timestamps and a QA report |

The L1 design and roadmap are in the [render quality design](docs/lite/出片质量设计.md), the [stick-figure host design](docs/lite/火柴人主持人设计.md) and the [surpass roadmap](docs/lite/超越路线图.md) (in Chinese): hand-drawn stick-figure full-body rig with 2-bone IK, 60 fps, matched-element transitions, selective 4x motion blur, keyword-level sync and automated BT.709/jump/freeze/occlusion QA.

## The host

The host is 小青 (Xiaoqing), an original hand-drawn stick figure: black ink lines, a teal scarf and a cowlick on top that changes shape with each mood, with 17 joints drawn by code. The storyboard picks from 17 gestures, 9 expressions, 6 props and 4 outfits by name; in `host-left` shots Xiaoqing can walk over to a diagram element and point at it, and a sentence with no gesture gets one picked from its meaning.

![Xiaoqing cheatsheet: 17 gestures, 9 expressions, 6 props and 4 outfits](site/assets/host-cheatsheet.png)

## Install

Copy the whole `skills/topic-to-video/` folder into the agent's skills folder:

| Agent | Folder |
| --- | --- |
| agy | user `~/.gemini/antigravity/skills/` or workspace `.gemini/skills/` |
| Codex | user `~/.agents/skills/` (the docs also list `~/.codex/skills/`); repository `.agents/skills/` |
| Claude Code | user `~/.claude/skills/`; project `.claude/skills/` |

```sh
cp -R skills/topic-to-video ~/.claude/skills/
# Optional for L1 local rendering (1 runtime npm package + system FFmpeg):
npm install --prefix ~/.claude/skills/topic-to-video/scripts
```

Check your environment with `node ~/.claude/skills/topic-to-video/scripts/doctor.mjs`, then ask your agent: "Use topic-to-video to make a 2-minute explainer on why caching makes web pages faster."

## Example

[examples/cache-speed](examples/cache-speed/) is a complete 120-second L0 example, with the [script](examples/cache-speed/讲稿.md), the [storyboard](examples/cache-speed/分镜.md) and [project.json](examples/cache-speed/project.json), in Chinese.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| P0 | Archive the previous Studio at tag `studio-v1`; slim the repository down to one skill | Done |
| P1 | L0 text package and scenario evaluations ([summary](tests/scenarios/results/p1-summary.md), in Chinese) | Done |
| Design | Render quality: host detail, frame rate, sync, smooth animation | Done |
| S1 / M1 | Stick-figure host 小青: rig, visual polish, 3 hand shapes, notched scarf and review tool | Done |
| M2–M4 | Local renderer: 60 fps/4K, 24 hand-drawn icons, 6 templates, full-body motion & 2-bone IK, local TTS (`edge-tts`/`say`) | Done |
| M5 | Matched-element transitions, selective motion blur, BT.709/jump/freeze/sync/occlusion QA and deliverables | Done |
| M6–M7 | Cross-agent (agy/Claude Code/Codex) CLI & end-to-end benchmark acceptance | In progress |

The full plan (in Chinese) is in [docs/lite/轻量化Skill计划书.md](docs/lite/轻量化Skill计划书.md).

## Development

```sh
npm install
npm test
```

See [AGENTS.md](AGENTS.md) for the development rules. The previous Studio implementation (13 skills, a TypeScript runtime and G1–G5 gates) is kept at tag `studio-v1` and branch `archive/studio-v1`.

## License

The code is released under the [Apache License 2.0](LICENSE). Usage rights for the host 小青 (Xiaoqing) are decided by the project owner; see [rights.json](skills/topic-to-video/assets/host/rights.json).
