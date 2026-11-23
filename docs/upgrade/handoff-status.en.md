# Handoff status and evidence

[简体中文](交接状态与证据.md) · English

Updated November 23, 2026, China Standard Time. **T01 (technical clip), T02 (project state and approvals), T03 (budget and provider reconciliation), T04 (topic, evidence and reviewable scripts), the T05 data path (audio, words, visemes and SRT), the T06 asset catalog (registration, clearance, scene templates and formal preflight), T07 direction and compilation (director DSL, word/cue triggers, shared cut quantization and frozen timelines), T08 character baking (performance plans, sequential baking and deterministic frame reads with a simulated rig), T09 rendering, targeted edits and crash recovery (local vs assembly caching, RenderJob/ChapterCheckpoint/ChangePlan persistence, chapter-4 recovery and 480 s → 470 s revision with fixture assets and simulated rig), T10 three-level QA and blinded sample review (`tools/inspect_media/adapter.ts`, `runtime/qa.ts`, per-frame flash/black/freeze/caption-collision detection, EBU R128 loudness/silence/waveform, 3×4 timecoded contact sheet, 22 s audible sample, delivery-target checks, Studio shot+waveform links and A11 blinded A/B review gating G3 with controlled baseline and simulated reviewer), and T11 headless delivery, traceability and restorable archive (`runtime/export.ts`, `tools/package_project/adapter.ts`, claim/subtitle traceability, XSS-escaped static HTML review report, G4/G5 binding, 1-byte tamper rejection, `.tar.gz` verification and full directory restore/reopen for shot editing; React `studio/` UI formally descoped per owner-approved Plan A) passed at RUNTIME level.** A05 still needs real speech and at least 100 hand-labeled anchors; A06/A11 still need original host art, real speech and genuine human art/sample decisions. **T12, genuine episodes and production acceptance,** is the next card. Runnable entry points are the architecture checker, the media checker and the `doctor`, `preview`, `init`, `status`, `event`, `decide`, `budget`, `submit`, `reconcile`, `ledger`, `brief`, `evidence`, `script`, `resume`, `search`, `audio`, `align`, `tts`, `calibrate`, `register`, `clear`, `scene`, `preflight`, `storyboard`, `compile`, `plan`, `bake`, `render`, `recover`, `revise`, `inspect`, `qa`, `target`, `compare`, `trace`, `manifest`, `package` and `restore` operations of `runtime/cli.ts`, whose output supports `zh-CN` (default) and `en`.

## 1 · Where to resume

| Card or case | Status | Evidence or next action |
| --- | --- | --- |
| T00 / C00 | PASS · CONTRACT | 13 skills, nine adapter contracts, ten schemas and the quality and fast-draft paths. Cache example has 14 shots/3,600 frames. Kafka to Doris has seven chapters, 34 shots/14,400 frames. |
| T00 / C01 | PASS · FIXTURE_MEDIA | Media CLI, 14 media regressions and six calibration reports. Each report binds its input bytes by SHA-256. |
| T01 / A01 | PASS · RUNTIME | Doctor names the missing font and capability status (Chinese and English messages). A 12-second WAV produced a decodable 360-frame clip with sound and differing first/middle/last frames. The host layer is a procedural placeholder, not original art. See section 6 and [`evidence/runs/t01-20261122-01/A01/record.json`](evidence/runs/t01-20261122-01/A01/record.json). |
| T02 / A02 | PASS · RUNTIME | SQLite project store with idempotent events: a replayed key returns the same event; a reused key with a new payload, a stale version, a forged reviewer, an agent session, an expired G2 and a draft export are all rejected without changing the version. G4/G5 bind the master and manifest hashes; eight concurrent writers produce one event. Human sessions are simulated by the host hook; UI receipts wait for T11. See section 8 and [`evidence/runs/t02-20261122-01/A02/record.json`](evidence/runs/t02-20261122-01/A02/record.json). |
| T03 / A03 | PASS · RUNTIME (simulated vendor) | Under a 100 limit, two concurrent 70 intents leave one reservation and 30 available; repeated and concurrent duplicates are accepted once; a lost receipt is never resubmitted and a new process reconciles it by the original key and settles exactly once; without lookup support the job stays UNKNOWN with 70 pending verification; an unpermitted skill and an agent budget change are rejected with zero calls. The vendor is a local test endpoint; real credentials and receipts are pending. See section 9 and [`evidence/runs/t03-20261122-01/A03/record.json`](evidence/runs/t03-20261122-01/A03/record.json). |
| T04 / A04 | PASS · RUNTIME (fixture sources, simulated reviewer) | Two disagreeing source versions keep both locators and make the claim `disputed`. An unsupported claim is marked `unsupported`, and a script citing it is rejected. G1/G2 bind the saved evidence and script hashes, and a stale hash is rejected. Section IDs survive an inserted paragraph and punctuation edits. Duration defaults are shared by start and resume (120/180/480). Offline search reads only owner-authorized material with matching hashes. Real sources and a real reviewer are pending. See section 10 and [`evidence/runs/t04-20261122-01/A04/record.json`](evidence/runs/t04-20261122-01/A04/record.json). |
| T05 / A05 | PASS · RUNTIME (synthetic audio, fixture aligner); A05 acceptance NOT_RUN | Imported and synthesized takes share one manifest contract. Section-local samples map to the master (48,000 + 2,400 = 50,400). Repeated terms keep distinct word IDs. Low-confidence words block until manually corrected, with the correction origin kept. Subtitles, SRT and visemes come from the same alignment revision. TTS uses T03 budgeting and reconciliation, and a pronunciation retake reposts one section. Real speech, a real aligner, 100 hand-labeled anchors and the owner's calibration decision are pending. See section 11 and [`evidence/runs/t05-20261122-01/A05/record.json`](evidence/runs/t05-20261122-01/A05/record.json). |
| T06 / A06 | PASS · RUNTIME (code-generated fixture bitmaps); A06/A11 art acceptance NOT_RUN | Formal preflight names the asset for a missing rig version, uncleared usage and an unregistered 90-degree angle. A 1920×1080 bitmap fails a native 1.5× push-in (needs 2880×1620). Diagram elements are checked against the safe area at the shot zoom. Usage clearance is human-only. Prior versions stay resolvable. Host, diagram and illustration templates fix layer roles. Original art, the 45–60 s sample and the human art decision are pending. See section 12 and [`evidence/runs/t06-20261122-01/A06/record.json`](evidence/runs/t06-20261122-01/A06/record.json). |
| T07 / A07 | PASS · RUNTIME (synthetic audio, fixture aligner, fixture bitmaps) | Word starts at samples 2,399/2,400 cut at frames 1/2; adjacent shots share one cut, and the timeline ends at (samples + 1,599) // 1,600, covering the last real sample. Repeated words resolve by ID. Dangling cues, unknown words, cross-section triggers, out-of-range highlights, double triggers, cycles, backwards cuts and fixed frames name shot and field. An unsupported action or uncleared asset blocks production compilation. Aligned copies of both examples compile to schema-valid timelines whose references all resolve, and both planned boards stay readable. Real speech and character action plans are pending. See section 13 and [`evidence/runs/t07-20261122-01/A07/record.json`](evidence/runs/t07-20261122-01/A07/record.json). |
| T08 / A08 | PASS · RUNTIME (simulated rig); original rig NOT_RUN | Frames 29/0/15 and 0/15/29 read identical lossless RGBA hashes in separate projects, and two concurrent worker orders give identical hashes for every frame of both shots. The inheriting shot starts from the preceding end-state hash, and a changed predecessor changes its cache key. The independent shot bakes alone. Lips close on the marked word and the head turns. Plan errors name shot and field. A restricted rig blocks baking. The approved original rig is pending. See section 14 and [`evidence/runs/t08-20261122-01/A08/record.json`](evidence/runs/t08-20261122-01/A08/record.json). |
| T09 / A09, A12 | PASS · RUNTIME (synthetic audio, fixture art, simulated rig) | Local shot keys ignore absolute offsets; assembly binds ordered shots and audio. Cold/warm/recovered runs match byte-for-byte on decoded frames and PCM audio. Worker stops in chapter 4 at temp write, atomic rename and index insertion plus corrupt shot and corrupt character-bake files rebuild only unfinished or damaged units. Caption recoloring uses 0 bakes and 0 TTS calls (G3 stale, G1/G2 kept). One expression edit recomputes only the shot and explicit end-state dependents; independent shots keep identical hashes. Cutting 10 s from chapter 4 moves the boundary from 8,100 to 7,800, hits cache on shifted ch5–ch7 local shots and yields a 470 s / 14,100-frame master passing `check_design.py --media`. See section 15, [`evidence/runs/t09-20261122-01/A09/record.json`](evidence/runs/t09-20261122-01/A09/record.json) and [`evidence/runs/t09-20261122-01/A12/record.json`](evidence/runs/t09-20261122-01/A12/record.json). |
| T10 / A10, A11 | PASS · RUNTIME (synthetic audio, fixture art, simulated rig, controlled baseline, simulated reviewer); original-art A06/A11 & historical comparison NOT_RUN | Three-level QA binds `QAReport` to exact media SHA-256 and catches injected 1-frame white flash (frame 15), mid-motion caption collision (`shot_002`, frames 40–50, IoU 0.2756), unintended black (`[100, 105)`), undeclared freeze (`shot_003`), unintended 1.5 s silence (`[75, 120)`) and missing audio (`AUDIO_TRACK`), while preserving the declared reading hold (`shot_004`) with its reason. Generates 12-cell 3×4 timecoded contact sheets, EBU R128 loudness/true-peak (final mix & isolated voice), waveform PNG/JSON, motion heatmap, extracted defect frames and Studio shot+waveform links. Flags missing delivery target before G3, wires recorded `qa_reports` into `sample_qa_pass`/`final_qa_pass`, produces a 22 s / 660-frame audible sample vs controlled baseline with seeded blinded A/B ordering, rejects agent review (`HUMAN_REQUIRED`) and blocks G3 (`REQUIRED_FIXES_OPEN`) until required fixes close. Genuine original-art/real-voice subjective review and historical footage comparison remain open. See section 16, [`evidence/runs/t10-20261122-01/A10/record.json`](evidence/runs/t10-20261122-01/A10/record.json) and [`evidence/runs/t10-20261122-01/A11/record.json`](evidence/runs/t10-20261122-01/A11/record.json). |
| T11 / A13 | PASS · RUNTIME (Plan A headless delivery; synthetic audio, fixture art, simulated rig, simulated reviewer) | Shared `trace` resolves claim → source and subtitle → word and refreshes after shot revision. `manifest` emits `ExportManifest` (excluding itself and G5 receipt) plus an XSS-escaped static `deliverables/review-report.html` and redacted WAL-safe `project/studio.sqlite`. Rejects draft export, missing/stale G4, agent G5 and a 1-byte tampered manifest (`MANIFEST_HASH_MISMATCH`). `package` builds and self-extracts `.tar.gz`, verifies all 55 files by SHA-256 and wires `archive_verified` → `DELIVERED`. `restore` unpacks into a clean directory with matching hashes and reopens cleanly for shot-level `revise` + `render`. React `studio/` UI was formally descoped per owner-approved Plan A. See section 17 and [`evidence/runs/t11-20261122-01/A13/record.json`](evidence/runs/t11-20261122-01/A13/record.json). |
| T12 / A14, A15 | NOT_RUN | Gather technical evidence for 60/120/180 seconds with one original end-to-end short at minimum. Three distinct long episodes need individual sign-off. Real episodes and human sign-offs for this handoff both total zero. |
| T13 / A16 | NOT_RUN, optional | Generated video inserts are off by default. If enabled by the owner, verify budget, continuity and fallback per shot. |

Give the [implementation prompt](handoff-prompts.en.md) to the next model. Follow the [task cards](tdd.en.md) and independently replay the [acceptance cases](acceptance.en.md).

## 2 · Recorded TDD results for T00

Three test-first cycles ran on November 19. On November 23, video and audio checks were separated, then the entire suite reran. Each RED/GREEN pair used the same command. The published tracebacks use repository-relative paths to locate the recorded files and line numbers. [Recorded commands, assertions and exit codes](evidence/TDD实测日志.txt)

| Runs | Observed RED | Observed GREEN |
| --- | --- | --- |
| 01 → 02 | All three new cases failed. The existing command did not accept media arguments. | 3/3 passed. Decoded 1,800 frames from 60 seconds and identified wrong pixel format and missing audio. |
| 03 → 04 | Five of ten failed. Proxy size, renamed QuickTime, ALAC, irregular frame timestamps and short audio were wrongly accepted. | 10/10 passed, including a real decode of 14,400 frames in a 480-second fixture. |
| 05 → 06 | Two of fourteen failed. Valid endpoints hid an internal audio gap, and the report lacked the input hash. | 14/14 passed. The discontinuity was traced to adjacent audio blocks and the report included the file hash. |
| 07 / 08 / 09 | Refactored video/audio inspection and exercised the original CLI again. | 11 contract plus 14 media regressions, **25/25 passed, zero skipped**. The architecture check and a separate run of the 11 contract cases also exited successfully. |

## 3 · Measured durations

The recorded environment used Python 3.9.6 on arm64 macOS and FFmpeg/ffprobe 8.1.1. The fixture loops one second of navy 1080p30 video and encodes one continuous 440 Hz tone. Real MP4 files were muxed and fully decoded. Each produced H.264, yuv420p, a 30 fps grid and 48 kHz AAC. The archive carries the regeneration script, sizes, full hashes and measurements. The media files are generated temporarily.

| Profile | Target seconds | Decoded frames | Audio start to end (s) | C01 |
| --- | ---: | ---: | --- | --- |
| short | 60 | 1,800 | 0.000 to 60.000 | PASS |
| short | 120 | 3,600 | 0.000 to 120.000 | PASS |
| short | 180 | 5,400 | 0.000 to 180.000 | PASS |
| standard8 | 450 | 13,500 | 0.000 to 450.000 | PASS |
| standard8 | 480 | 14,400 | 0.000 to 480.000 | PASS |
| standard8 | 510 | 15,300 | 0.000 to 510.000 | PASS |

Different encoders may produce different bytes. Record the new hash, decoded frame count and coverage together. [Six raw reports](evidence/媒体校准.json) · [Fixture and probe replay](evidence/replay_media.py)

## 4 · Replay from an extracted archive

Enter the directory containing `registry.yaml` and use Python with the dependencies in `evals/requirements.txt`. Media regressions require FFmpeg and ffprobe, including H.264/libx264 and AAC encoding. Record the number of tests and skips. Missing media tools make that portion BLOCKED.

```sh
python3 -B evals/check_design.py
python3 -B -m unittest discover -s evals -p 'test_*.py' -v
python3 -B docs/upgrade/evidence/replay_media.py
node --test tests/runtime/
node docs/upgrade/evidence/replay_t01.mjs <run_id> python3
node docs/upgrade/evidence/replay_t02.mjs <run_id> python3
node docs/upgrade/evidence/replay_t03.mjs <run_id> python3
node docs/upgrade/evidence/replay_t04.mjs <run_id> python3
node docs/upgrade/evidence/replay_t05.mjs <run_id> python3
node docs/upgrade/evidence/replay_t06.mjs <run_id> python3
node docs/upgrade/evidence/replay_t07.mjs <run_id> python3
node docs/upgrade/evidence/replay_t08.mjs <run_id> python3
node docs/upgrade/evidence/replay_t09.mjs <run_id> python3
node docs/upgrade/evidence/replay_t10.mjs <run_id> python3
node docs/upgrade/evidence/replay_t11.mjs <run_id> python3
```

Runtime tests need Node.js 22.18 or later (this run used v26.9.0, executing `.ts` directly). `replay_t01.mjs` needs a real font on the host; the font is recorded by hash only and is not redistributed.

For a real master, use its actual path, for example `python3 -B evals/check_design.py --media renders/final.mp4 --profile standard8 --target-seconds 480`. Include the exact target only when required for that episode. Record the appropriate unexecuted or blocked state where original art, real speech or authorized sign-off is pending.

## 5 · Next evidence record

Create a record and its artifacts under `evidence/runs/<run_id>/<case_id>/`. This is a blank template; a completed instance is the [T01 record](evidence/runs/t01-20261122-01/A01/record.json). Fill in the real IDs, commands, paths and status after execution and update section 1.

```json
{
  "task_id": "T12", "case_id": "A14", "run_id": null,
  "status": "NOT_RUN",
  "evidence_level": "PRODUCTION",
  "environment": {},
  "commands_and_exit_codes": [],
  "input_hashes": [], "output_hashes": [],
  "observations": [], "evidence_paths": [], "reviewer": null
}
```

## 6 · Recorded TDD results for T01

Run `t01-20261122-01` executed on November 23, 2026, 10:19–10:24 China Standard Time, on arm64 macOS with Node.js v26.9.0, FFmpeg/ffprobe 9.0.2 and Python 3.14.4 (an isolated venv with `evals/requirements.txt`). The first baseline with the system Python lacked PyYAML and FFmpeg: one import error and 14 skips. After installing them the baseline was **25/25 passed, zero skipped**. Each RED/GREEN pair used the same command. [Full TDD log](evidence/runs/t01-20261122-01/tdd-log.txt)

| Runs | Observed RED | Observed GREEN |
| --- | --- | --- |
| 01 → 02 | The missing-font case failed: `runtime/cli.ts` did not exist. | 1/1 passed. With the font present `captions` is READY; after moving it the exit code is 1, `captions` is BLOCKED, `missing_fonts` and `FONT_MISSING` name `caption-zh`, and audio and video encoding stay READY. |
| 03 → 04 | The i18n cases failed: `runtime/i18n.ts` did not exist. | 5/5 passed. `code` is stable, `message` follows `--lang`, `zh-CN` is the default, `--lang fr` exits 2 with `LOCALE_UNSUPPORTED`, and both catalogs have the same keys. |
| 05 → 06 | Both clip cases failed: the CLI did not know `preview`. | 7/7 passed. A 12-second 48 kHz WAV (576,000 samples) became a 360-frame timeline; ffprobe independently decoded 360 frames of H.264/yuv420p/1920×1080/30 fps with 48 kHz stereo AAC, decoded RMS > 0.01, and frames 0/180/359 differ pairwise. A 44.1 kHz WAV is rejected with `AUDIO_SAMPLE_RATE` before rendering. |
| 07 / 10–12 | Refactor: `preview` reuses the doctor tool-version probe; the graphics backend label is unified as `software-rgb24`. | Runtime 7/7 and Python 25/25 passed with zero skips; the architecture check exited 0. |

The existing media command (`--profile short`) also re-checked the clip: isom container, 360 frames, 30 fps grid, 48 kHz AAC, audio 0.000–12.000 s. Its only issue is `DURATION_PROFILE`, because A01 lists the technical clip separately from the 60-second short minimum.

| Artifact | SHA-256 |
| --- | --- |
| [`A01/renders/t01/master.mp4`](evidence/runs/t01-20261122-01/A01/renders/t01/master.mp4) | `1c2b79980bc9bf0d2a08da7dd9b5e63c768f40ee764d02e55819b3d7d93fc6df` |
| [`A01/renders/t01/source.wav`](evidence/runs/t01-20261122-01/A01/renders/t01/source.wav) | `f8fb9e01b99dafcbab8649972df634d4d6d14064ac42716ebf10aaaa39dcf10d` |
| [`A01/renders/t01/frames/frame-0000.png`](evidence/runs/t01-20261122-01/A01/renders/t01/frames/frame-0000.png) | `71dd0c5a702869fea88cfebd58cc31af9629b039e58e362e5899e2535408ea16` |
| [`A01/renders/t01/frames/frame-0180.png`](evidence/runs/t01-20261122-01/A01/renders/t01/frames/frame-0180.png) | `f9e44c2b1b9c30db13ec8373ebc40f2029a47dd74c688449c9491cea7373d18a` |
| [`A01/renders/t01/frames/frame-0359.png`](evidence/runs/t01-20261122-01/A01/renders/t01/frames/frame-0359.png) | `ceeedb8d91b567665a080d171f859393508e720cbfcc4eb0173beee10c0cd4f8` |
| [`A01/record.json`](evidence/runs/t01-20261122-01/A01/record.json) | `838582ea83d5826aab4a5f66d486e5e2780d5e5eaab03db0a73017527ca65c7b` |

Doctor reports (font present, moved with Chinese output, moved with English output), the preview report, render configuration, probe and media re-check JSON live in the same directory; every file hash is listed in `record.json`.

**Remaining gaps** The host layer is a code-drawn placeholder (`procedural-placeholder-host` 0.1.0, `original: false`); the original rig waits for T06. The default FFmpeg 9.0.2 build has no `drawtext`, so the clip has no text layer and the font is checked only as a caption dependency. Remotion composition is not connected yet; the graphics backend is in-process software drawing. This is a RUNTIME result, not PRODUCTION or HUMAN acceptance.

## 7 · Internationalization conventions

- **Documentation**: upstream documents are maintained in pairs (`*.md` and `*.en.md`, or Chinese and English file names) and both languages are updated together; `AGENTS.md` stays English-only.
- **Runtime**: `runtime/i18n.ts` holds the `zh-CN` and `en` message catalogs. Codes, capability names, field names and status enums in JSON output are never translated; only `message` follows `--lang`, defaulting to `zh-CN`. Unknown locales are rejected with exit code 2. A new issue code must be added to both catalogs; `tests/runtime/i18n.test.mjs` checks that the keys match.

## 8 · Recorded TDD results for T02

Run `t02-20261122-01` executed on November 23, 2026, 10:32–10:39 China Standard Time, in the section 6 environment with SQLite 3.53.4 (Node's built-in `node:sqlite`). [Full TDD log](evidence/runs/t02-20261122-01/tdd-log.txt)

| Runs | Observed RED | Observed GREEN |
| --- | --- | --- |
| 01 → 02 | All four cases failed: the CLI had no `init` / `event`. | 4/4 passed. A new project is NEW v1; the same key and request return the same `event_id` (REPLAYED) with one event; a reused key with a new payload gives `IDEMPOTENCY_CONFLICT`; a stale `expected_version` gives `VERSION_CONFLICT` with the current version. |
| 03 → 04 | Gate cases could not load: `runtime/approvals.ts` did not exist. | 8/8 passed. Missing G1 gives `APPROVAL_MISSING`; a material event without a hash gives `ARTIFACT_HASH_REQUIRED`; a reviewer field gives `REVIEWER_IN_REQUEST`, an agent or missing session gives `APPROVAL_UNAUTHENTICATED`, none of them changing the version; a replaced script gives `APPROVAL_STALE`; signing G5 with the master hash gives `APPROVAL_TARGET_MISMATCH`; export events after DRAFT_READY give `TRANSITION_INVALID`. |
| 05 → 06 | The restart read-back case passed at once (every CLI call is already a new process; recorded as existing coverage). The concurrency case failed in two of three runs: concurrent writers crashed with `database is locked` instead of returning a conflict. | A 10-second busy timeout makes writers queue on `BEGIN IMMEDIATE`. Five consecutive passes; a manual 16-way race gave 1 applied, 15 rejected, 0 crashed. |
| 07 / 09–11 | Refactor: the idempotency/version precheck and event insert moved to `project-store.ts`, shared by `event` and `decide`. | Runtime 17/17 and Python 25/25 with zero skips; the architecture check exited 0. |

The evidence replay (`replay_t02.mjs`) made 59 CLI writes; 15 were rejected and each left the version and event count unchanged. The quality project went from NEW to PACKAGING (v28, 27 events, seven human decisions), and the seven approvals validate against `workflow.schema.json#/$defs/Approval` with the existing contract tooling. Every call's request, exit code and response is in `A02/audit/`; session tokens are never written to evidence.

| Artifact | SHA-256 |
| --- | --- |
| [`A02/record.json`](evidence/runs/t02-20261122-01/A02/record.json) | `be9de1b46f8cd6b9b34f124586a8e0c74bea80c4888114f2d2c8539f78ef5154` |
| [`A02/quality.sqlite`](evidence/runs/t02-20261122-01/A02/quality.sqlite) | `4bcb9d146f0c1c427a6e55db9f46ccd3cabf970893fe7a1e2fe3644faf80cdfc` |
| [`A02/draft.sqlite`](evidence/runs/t02-20261122-01/A02/draft.sqlite) | `163979f7cc83187aee848a008df12485cc737ca77146e5a0410e80c64ac39586` |
| [`A02/race.sqlite`](evidence/runs/t02-20261122-01/A02/race.sqlite) | `ed2421266938f583b687b396b74e1b9194cb70c775bf2c7abb6be0fc501fb479` |
| [`A02/approvals.json`](evidence/runs/t02-20261122-01/A02/approvals.json) | `851202707d3ce727e19fd025d7049c4a483392b42bfae716c0a670b3592bb762` |
| [`A02/rejections.json`](evidence/runs/t02-20261122-01/A02/rejections.json) | `678f973866faad9734e901e2c921c783360711a45d5152d9f7431067eb76d835` |
| [`A02/concurrency.json`](evidence/runs/t02-20261122-01/A02/concurrency.json) | `cbff720b69d26b367faae985e0e7f380659a9c2a1ea0ba88bcfc4778d53c6c84` |

**Design notes** Reviewer identity comes only from a host-authenticated session: the token arrives in `SVS_SESSION_TOKEN` and only its hash is stored. Sessions are created by the host-side `createSession` hook, which the CLI does not expose, so an agent cannot mint a human session. Decisions bind (project_id, gate, target_hash), and material events (`evidence_saved`, `script_saved`, `sample_rendered`, `master_checked`, `manifest_prepared`) must carry `artifact_hash`. A rejection in the review state re-enters the stage that produces the material.

**Remaining gaps** Human sessions are simulated by tests and the replay script; real sign-in arrives with host authentication in T12; UI receipts no longer apply because `studio/` was descoped under Plan A. Non-gate requirements (such as `sample_qa_pass` and `final_qa_pass`) are declared in the event payload's `checks` until T10 records them as its own facts. Pause, resume and draft promotion from `interruptions` are not implemented yet.

## 9 · Recorded TDD results for T03

Run `t03-20261122-01` executed on November 23, 2026, 10:47–10:52 China Standard Time, in the environment of sections 6 and 8. The vendor is a local HTTP test endpoint inside the test process (`tests/runtime/fake-provider.mjs`, price 60 minor units, able to drop receipts after acceptance and to disable lookup); no real vendor or money is involved. [Full TDD log](evidence/runs/t03-20261122-01/tdd-log.txt)

| Runs | Observed RED | Observed GREEN |
| --- | --- | --- |
| 01 → 02 | All six cases failed: the CLI had no `budget` / `submit` / `reconcile` / `ledger`. The first attempt hung because the fixture did not close the endpoint when an assertion failed and left no log; after fixing the fixture the rerun produced this RED. | 6/6 passed. No budget gives `BUDGET_UNCONFIGURED`; an agent budget change gives `HUMAN_REQUIRED`; two concurrent 70 intents under 100 give one UNKNOWN and one `BUDGET_EXCEEDED` (30 available) with one provider acceptance; a repeated key and four concurrent duplicates POST once, and a reused key with a new payload gives `IDEMPOTENCY_CONFLICT`; after a lost receipt a resubmission does not POST, and a new process looks up the original key, settles 60 and releases 70, with no second settlement on a repeat; without lookup support it reports `PENDING_VERIFICATION` with 70 pending; `script-writer` calling `generate_tts` gives `TOOL_NOT_PERMITTED` with zero calls and zero entries. |
| 03 | Refactor: provider response parsing (`callProvider`) only yields an outcome type; ledger writes live in `reserve`/`settle`/`release` in `ledger.ts`, and `jobs.ts` no longer writes entries directly. | 6/6 in three consecutive runs. |
| 04 / 07–09 | Full regression (T02 `decide` now reuses `humanSession`). | Runtime 23/23 and Python 25/25 with zero skips; the architecture check exited 0. |

**Found by the evidence self-check** The first replay (log 05) recorded FAIL: the two concurrent calls read the same sequence number before awaiting, wrote the same request file, and actually submitted the same key twice. The defect was in the evidence script, not the runtime (the test counter increments synchronously). After allocating the sequence before awaiting, the replay (log 06) passed all eight checks.

| Artifact | SHA-256 |
| --- | --- |
| [`A03/record.json`](evidence/runs/t03-20261122-01/A03/record.json) | `7a8a658b99a3513c725c1d941af32945660531938b44eef352ffc2581d59c082` |
| [`A03/budget-race.sqlite`](evidence/runs/t03-20261122-01/A03/budget-race.sqlite) | `aacae804ed36894033c8d5ebdf9e4f79284d96600f562db5323f5fc79aca5570` |
| [`A03/no-lookup.sqlite`](evidence/runs/t03-20261122-01/A03/no-lookup.sqlite) | `dc8e5fddf657f0ecbd4a7e65b0a17c5ad4beae72cfab2c49bb3a40e6b13b5d5d` |
| [`A03/repeat-intent.sqlite`](evidence/runs/t03-20261122-01/A03/repeat-intent.sqlite) | `b896d9800cfbe4bdbd54e5b6a265b0464e0ef6f6107a76e86f2ac91e28d9ad18` |
| [`A03/provider-counts.json`](evidence/runs/t03-20261122-01/A03/provider-counts.json) | `9c994d976ec123ed433c985d0a9bf3f471034b7ff4ead96f929057b311e96ce2` |
| [`A03/provider-requests.json`](evidence/runs/t03-20261122-01/A03/provider-requests.json) | `6dd932b810f482f325111a4f14f0e41b3230193c4e27b622b03e3e12d5ab1ffb` |
| [`A03/ledger-entries.json`](evidence/runs/t03-20261122-01/A03/ledger-entries.json) | `1a18424e3e6d73ca70fd311992922d272bfba6855c26e31116e6014479967e45` |

Eight ledger rows validate against `workflow.schema.json#/$defs/LedgerEntry` and ten tool results against `#/$defs/ToolResult` with the existing contract tooling. Each CLI call's request, exit code and response is in `A03/audit/`; every provider-side request is in `provider-requests.json`.

**Design notes** Submission has three steps: one transaction checks permission, idempotency and budget and writes the SUBMITTING job and its reserve; the provider is called with `Idempotency-Key: <project_id>:<idempotency_key>`; a second transaction settles or marks UNKNOWN. UNKNOWN work is never resubmitted (`allow_resubmit: false`) and can only be reconciled; settlement re-checks job state so it happens exactly once. Setting or raising the limit accepts only a human session. The host configures the vendor address through `SVS_PROVIDER_URL`.

**Remaining gaps** Real vendor credentials, quotes and receipts are not connected; `per_job_limit_minor`, `max_paid_candidates_per_shot` and cache-hit entries are not implemented; the quote is currently declared by the request's `quote_minor`. When the vendor has no record (404) the reservation stays held for a human decision and is not released automatically.

## 10 · Recorded TDD results for T04

Run `t04-20261122-01` executed on November 23, 2026, 10:57–11:06 China Standard Time, in the environment of sections 6 and 8. Sources are local fixtures (`example.invalid` URLs and owner-authorized material written by the test or replay), and the G1/G2 human sessions are created by the test or replay script rather than a Studio host. [Full TDD log](evidence/runs/t04-20261122-01/tdd-log.txt)

| Runs | Observed RED | Observed GREEN |
| --- | --- | --- |
| 01 → 02/03 | All four cases failed: the CLI had no `brief` / `evidence` / `script`. | Run 02 passed 3/4. The failing case was a test inconsistency: its second, valid save still cited the disputed `no-expiry`. After the test was corrected (noted in the log), run 03 passed 4/4. Two guide versions that disagree make `no-expiry` `disputed`, and the conflict keeps both locators (`第 2 章第 3 段` and `第 2 章第 4 段`). A claim with no support is `unsupported`. A script citing it gets `CLAIM_UNSUPPORTED`, and one citing an unresolved dispute gets `CLAIM_DISPUTED`. G1 approves the saved evidence hash. An imported manuscript with an inserted paragraph and punctuation edits keeps `sec_001/002/003` and gives the new paragraph `sec_004`. |
| 04 → 05 | Shared defaults: `resume` did not exist (exit 2). Start already gave 120/180/480. | 5/5. Start and `resume` share `resolveDefaults`, in this order: explicit override, then stored brief, then profile target. Explicit 120 resumes as 120 (3,600 frames). A new short is 180. `standard8` is 480 (14,400 frames). 300 seconds on short gives `DURATION_OUT_OF_PROFILE`; an unknown profile gives `DURATION_PROFILE_UNKNOWN`. |
| 06 → 07 | Offline search: the CLI had no `search`. | 6/6. Only files listed in `materials/authorized.json` whose sha256 still matches are searched, returning paragraph locators. An unlisted file is never read. A changed file gives `MATERIAL_HASH_MISMATCH` and a `partial` result. Another source policy gives `SOURCE_POLICY_UNAVAILABLE` and `failed`. Cost is 0. |
| 08 / 09–11 | Refactor: content saves run the replay/version precheck before building, so a replayed request returns the stored version instead of being re-validated. Content writes and the workflow step share one transaction (`advance`). | T04 6/6, including a new replay assertion. Runtime 29/29 and Python 25/25 with zero skips; the architecture check exited 0. |

**Found by the evidence self-check** The first replay recorded FAIL (`schemas_valid=false`). The inline Python in `replay_t04.mjs` had an unmatched parenthesis. The defect was in the evidence script, not the runtime. After fixing it, the replay passed all twelve checks.

| Artifact | SHA-256 |
| --- | --- |
| [`A04/record.json`](evidence/runs/t04-20261122-01/A04/record.json) | `cf8eea53c44f3ec48c28a9f468b9e2822989a6aa44ae70a8c4d0d4d8d1dde815` |
| [`A04/studio.sqlite`](evidence/runs/t04-20261122-01/A04/studio.sqlite) | `5f2619f3d488a6b8a948cd259c7f1c854da5f659fe151cf0e3d38101df7510bc` |
| [`A04/source-cards.json`](evidence/runs/t04-20261122-01/A04/source-cards.json) | `07cc338338e9b2d3c859cef8306c3c6264d551c84e9297e1a6605a140425090a` |
| [`A04/evidence-v1.json`](evidence/runs/t04-20261122-01/A04/evidence-v1.json) | `41cb96106348b2cdc7d652caff3ce05920b5c7a486a2429351aa85b381e31637` |
| [`A04/evidence-v2.json`](evidence/runs/t04-20261122-01/A04/evidence-v2.json) | `a719bd833cd0ff61f6133722074be9dfd33e35a0fcb4eafd33190a4a92083c7c` |
| [`A04/script-v1.json`](evidence/runs/t04-20261122-01/A04/script-v1.json) | `dbd7ef2124e05c7619d6b6007daaaace5215fcb28de691102fbd8413fb170061` |
| [`A04/script-v2.json`](evidence/runs/t04-20261122-01/A04/script-v2.json) | `19fd994270c13463b1f546890c63635013f2088290d1ee63487084f030a6e7fd` |
| [`A04/script-diff.json`](evidence/runs/t04-20261122-01/A04/script-diff.json) | `9f0097ad9a792597feb0a29ecf8a9a45e58229ffc8ee33402af9316bcc3f36ca` |
| [`A04/approvals.json`](evidence/runs/t04-20261122-01/A04/approvals.json) | `d15bc9f3dc738f529b45678afb85341d085d4bda3e16153921a31e3e11ece796` |

| Approval (simulated owner session) | Bound version | target_hash |
| --- | --- | --- |
| G1 reject | evidence v1 | `sha256:30fc76c8c1e0d4921944a4003c109d4f2cff9c238ca37cb38b7b3b16b8e0f630` |
| G1 approve | evidence v2 | `sha256:9a80b7470dea00a6cf5fb8a4c47e329a37d063ad5fd567084417cd9cf79f029f` |
| G2 reject | script v1 | `sha256:b12c4258264c61bb068d6524ff40178dedc39781668b1030985e041a47712e93` |
| G2 approve | script v2 | `sha256:98b06d7f17009c3d344d14ad5c719700121482318cb73bcef2d87b39c370095b` |

Brief, both evidence versions and both scripts validate against `topic-brief`, `evidence-set` and `script`. The four approvals validate against `workflow#Approval`, and the search result against `workflow#ToolResult`. Each CLI call's request, exit code and response is in `A04/audit/`. `script-diff.json` shows v1→v2 per section: `sec_001` edited, `sec_006` added, all others unchanged. Claims and terms needing audition (`304`) carry over by section ID.

**Design notes** Saving a TopicBrief, EvidenceSet or ScriptDocument stores the version in the `content` table and appends `brief_saved` / `evidence_saved` / `script_saved` in the same transaction, with `artifact_hash` = the content hash. G1/G2 therefore bind exactly the version a human reviewed. Claim status is derived from source links, not declared. Manuscript paragraphs keep the ID of the previous paragraph they still resemble (character-bigram Dice ≥ 0.6, nearest match first). New paragraphs get the next unused number. Retrieved excerpts are untrusted data.

**Remaining gaps** Network search, real sources and a real reviewer are not connected. Chargeable retrieval through T03 is not wired. The duration estimate (4.5 characters per second) is recomputed for every imported section, so the example's v1 planned 3,600 frames becomes 3,069 in v2. G2 does not yet compare planned frames with the target, which waits for measured audio in T05. Material paths in `authorized.json` are trusted as written by the owner, and path traversal is not checked.

## 11 · Recorded TDD results for T05

Run `t05-20261122-01` executed on November 23, 2026, 11:15–11:23 China Standard Time, in the environment of sections 6 and 8 with ffprobe 9.0.2. All audio is a synthetic 220 Hz speech-like tone. The aligner output is a fixture. The TTS vendor is the local test endpoint, and the G1/G2 sessions are created by the replay script. **This is RUNTIME evidence for the data path only; the A05 acceptance with real speech is still open (see Remaining gaps).** [Full TDD log](evidence/runs/t05-20261122-01/tdd-log.txt)

| Runs | Observed RED | Observed GREEN |
| --- | --- | --- |
| 01 → 02/03 | All five cases failed: the CLI had no `audio` / `align` / `tts` / `calibrate`. | Run 02 passed 4/5. The failing case was a test request that sent only one of the two script sections; the contract is one take per script section, so it was rejected as `AUDIO_SECTIONS_MISMATCH` before any audio was read. After the test was corrected (noted in the log), run 03 passed 5/5. 44.1 kHz gives `AUDIO_SAMPLE_RATE`. Imported takes keep their original bytes (sha256 equals the source). Segments are `[0, 48000)` and `[48000, 144000)`, and the master WAV has 144,000 samples. A section starting at 48,000 with a word at local sample 2,400 maps to master 50,400. The two `副本` cues map to `sec_002-w003` and `sec_002-w006`. A word with confidence 0.4 blocks with its sample window. A manual correction records its origin, and captions and visemes follow that revision. TTS takes go through T03 budgeting: a lost receipt is never resubmitted and is reconciled. A pronunciation retake reposts only one section (3 POSTs in total), and spending is 180 with nothing held. With 100 anchors, median is 49.5 ms and P95 is 94 ms; 99 anchors give `CALIBRATION_ANCHORS_INSUFFICIENT`. |
| 04 → 05 | Full regression found a T05-caused failure: T03 submits `generate_tts` through raw `submit`, the endpoint now returns a WAV for that tool, and the take handler assumed the `generateTts` payload and threw (two T03 cases). | The handler stores a take only for `generateTts` intents. Runtime 34/34 with zero skips. |

**Design notes**
- **Audio import.** `audio` requires exactly one take per script section, in script order. A take is either a project-relative WAV import or a settled `generate_tts` job. Every take is verified (16-bit PCM, 48 kHz, matching channels and current narration hash) before anything is indexed. The step then stores the original take, a settings record and a concatenated master as immutable assets, and appends `audio_verified` with the manifest hash.
- **Alignment.** `align` maps each section's zero-based word samples onto the master. Word IDs are `<section_id>-wNNN`. Each cue takes the next whole-word run matching its text. The step refuses to save while any word below confidence 0.6 is uncorrected, and returns the word's sample window for audition instead.
- **Derived tracks.** Subtitles (one line per sentence), SRT and viseme ranges are derived from that same alignment revision and stored with it. Shared boundaries use `(sample + 800) // 1600`; the frame count uses `(samples + 1599) // 1600`. Viseme ranges cover `[0, total)` contiguously; mouth shapes are `open` by default or the manual marks `closed` / `rounded` / `rest`.
- **Synthesized voice.** `tts` runs only in `AUDIO_RUNNING` (in quality mode that is after G2). It sends the section text and pronunciation list, keyed by `pronunciation_hash`, through `submitJob`. The take is stored in the settling transaction, so lookup after a lost receipt stores it exactly once.

| Artifact | SHA-256 |
| --- | --- |
| [`A05/record.json`](evidence/runs/t05-20261122-01/A05/record.json) | `c2d57f099c9060ef62deb30b2ce5ecbf40f14fff1d3e8f148f838f5b5488b3f8` |
| [`A05/import-path.sqlite`](evidence/runs/t05-20261122-01/A05/import-path.sqlite) | `f250449dcb9f5a0ed011e42433bd3c4778bf6c59fff639984467bc3ec4bf6c25` |
| [`A05/tts-path.sqlite`](evidence/runs/t05-20261122-01/A05/tts-path.sqlite) | `3320eead70ffeb34ca66b3dc5391385dc823086ea59cbc9b195cf2dc8f14bf30` |
| [`A05/master-import.wav`](evidence/runs/t05-20261122-01/A05/master-import.wav) | `d20438c54d3fb538c0e12101b52b0f42a1233ca9129d4987403a7f8683285f60` |
| [`A05/master-tts.wav`](evidence/runs/t05-20261122-01/A05/master-tts.wav) | `bec9d79a2bea1576aad677766fdca81bb77ceef78c90f69ca296eff508abcbaa` |
| [`A05/audio-manifest-import.json`](evidence/runs/t05-20261122-01/A05/audio-manifest-import.json) | `0f0878555aff5174a51cf096702a73e5e0e74dd8d843c8c03594d6942f461ada` |
| [`A05/audio-manifest-tts.json`](evidence/runs/t05-20261122-01/A05/audio-manifest-tts.json) | `3fdd123f6a1a40df51238c63e49bc7e9c2cc2fd20addf50f8b508afa8c743f38` |
| [`A05/alignment.json`](evidence/runs/t05-20261122-01/A05/alignment.json) | `60e9e6bc5539d8075161b7c486f2ca4b37a8bc4d0add5ac3f57108340df18976` |
| [`A05/subtitles.json`](evidence/runs/t05-20261122-01/A05/subtitles.json) | `6cfb5431fd7aebf1f25ae59ff78861f57150f4c789f692e2c69b6194b6a012c9` |
| [`A05/subtitles.srt`](evidence/runs/t05-20261122-01/A05/subtitles.srt) | `40392415cc2e89e642348a1cc36aeebbaeaa5b6e5aee6adc4f50f7ae739a507c` |
| [`A05/visemes.json`](evidence/runs/t05-20261122-01/A05/visemes.json) | `ddafa7f7787ffc82e66650ad5c23ce1e35de6ea48e27050c250363750531fe9d` |
| [`A05/corrections.json`](evidence/runs/t05-20261122-01/A05/corrections.json) | `e4b30d76d6232967c2e8fcec112c717fcfcd2b8118a911b99927e9b5aec86ef5` |
| [`A05/media-probe.json`](evidence/runs/t05-20261122-01/A05/media-probe.json) | `9f9484e5ebb81c9a78d4627d5c6b8b6dfc88f8acdab3a87cee26434f25da6f8f` |
| [`A05/provider-counts.json`](evidence/runs/t05-20261122-01/A05/provider-counts.json) | `16861c728e53e32dfb6ae0b3fd46ca79d3bf175a57ab92fdba491c45301a4ad2` |

Both manifests validate against `audio-manifest`, the alignment against `workflow#Alignment`, the subtitles against `workflow#SubtitleTrack`, and five tool results against `workflow#ToolResult`. ffprobe reads `pcm_s16le`, 48,000 Hz, mono, `duration_ts` 144,000 for the imported master. Each CLI call is in `A05/audit/` (53 calls).

**Remaining gaps**
- **A05 acceptance is NOT_RUN.** Missing are real Chinese speech (b/p/m, English abbreviations, numbers, pauses), a real aligner, at least 100 hand-labeled anchors on that speech, median/P95 against the initial 80/150 ms goals, and the owner's calibration decision. The calibration run above only checks the arithmetic on offsets constructed as 0–99 ms.
- **No phonetic viseme mapping yet.** Mouth shapes default to `open` unless marked by hand; this waits for the T06 rig.
- **Revisions after verification wait for T09.** The forward-only workflow has no self-loops, so an anchor or retake after `alignment_verified` goes through T09 revision planning.
- **Voice rights are not checked.** `voice_ref` is not yet verified against registered rights.
- **Raw-submitted TTS audio is lost.** A `generate_tts` job sent through raw `submit` is charged but stores no take.
- **Orphaned files.** Files written in a rejected transaction are left on disk until startup reconciliation (T09).
- **No migration for older databases.** Databases created before T05 lack the new `content` kinds, `assets` table and `jobs.payload` column; there is no migration because no production databases exist.

## 12 · Recorded TDD results for T06

Run `t06-20261122-01` executed on November 23, 2026, 11:30–11:36 China Standard Time, in the environment of sections 6 and 8. Every bitmap is a solid-colour PNG generated in code, so the run exercises the asset catalog and preflight checks, not art quality. Clearance sessions are created by the test or replay script. **The original host art and the A06/A11 art acceptance are still open (see Remaining gaps).** [Full TDD log](evidence/runs/t06-20261122-01/tdd-log.txt)

| Runs | Observed RED | Observed GREEN |
| --- | --- | --- |
| 01 → 02 | All six cases failed: the CLI had no `register` / `clear` / `scene` / `preflight`. | 6/6 on the first implementation. Formal preflight names the asset in each case: a profile pointing at the unregistered `host_rig/v2` gives `ASSET_NOT_FOUND`; a pending backdrop gives `ASSET_NOT_CLEARED`; angle `side_90` gives `ANGLE_UNREGISTERED` on `host_main`. A 1920×1080 backdrop under a native 1.5× push-in gives `COVERAGE_INSUFFICIENT` (needs 2880×1620), while 2880×1620 and the vector diagram pass. At 1.5× both diagram elements leave the safe area (`ELEMENT_OUTSIDE_SAFE_AREA`); at 1× they stay inside. Only a human session can clear usage (an agent gets `HUMAN_REQUIRED`). Identical bytes replay the same version; new bytes become v2 with usage pending, and v1 still resolves with its own hash. The three templates fix layer roles and z order; a wrong layer kind gives `LAYER_KIND_MISMATCH` and an unknown template `TEMPLATE_UNKNOWN`. |
| 03 / 04 | Refactor: imports and media detection (type, extension, pixel size) consolidated in `runtime/assets.ts`. | T06 6/6; runtime 40/40 with zero skips. |
| 08 → 09 | Found by security review: `scene` did not validate `name`, so `../../escaped` wrote `v1.json` outside the project (observed, then removed). | `scene` now rejects the name with `ASSET_KIND_INVALID`. `registerAsset` also refuses any name or extension that could leave `assets/` (defence in depth; script section IDs are system-generated `sec_NNN`). T06 7/7; runtime 41/41 with zero skips; `check_design.py` and the Python suite unchanged. The replay records above predate this fix; the happy path is unchanged. |

**Design notes**
- **Registration.** `register` stores the original bytes as an immutable versioned asset with rights (holder, license, source, original) and the measured media (PNG width/height, WAV, JSON vector spec). A character also carries its CharacterProfile: style lock, rig, voice, angles, expressions, gestures, parameter ranges.
- **Clearance.** Usage clearance is a separate, append-only record (`asset_usage`) written only from a human session. Scenes built from templates are recorded as derived, and their layers are still checked one by one.
- **Templates.** `host` has a background only (the host is bound per shot), `diagram` has background + structured diagram, `illustration` has background + illustration. The safe area is 0.07/0.07/0.93/0.85, as in the examples.
- **Preflight.** `preflight` uses one resolver for scene, layers, character, rig and voice, so host and diagram shots follow the same path. Each pin needs an existing version, file bytes that match the hash, and cleared usage (`policies/content-safety.yaml`: pinned version, content hash, cleared usage). Full-frame bitmaps need 1920×1080 × zoom native pixels; diagram element boxes, scaled about the centre by the zoom, must stay inside the safe area.

| Artifact | SHA-256 |
| --- | --- |
| [`A06/record.json`](evidence/runs/t06-20261122-01/A06/record.json) | `abc974d6cdb0dacdec2f22428f1937c9f18c78b8076bd6ac6bbe312e53cbf06d` |
| [`A06/studio.sqlite`](evidence/runs/t06-20261122-01/A06/studio.sqlite) | `499ed2de6b7eac52632fbeab3cfa0d0279cefcc1898749e9719827aecdf2a23b` |
| [`A06/asset-catalog.json`](evidence/runs/t06-20261122-01/A06/asset-catalog.json) | `87d12defcc5d397c97d892aedd4200f4c508c5c98157110a04266df4e866dd87` |
| [`A06/preflight-negative.json`](evidence/runs/t06-20261122-01/A06/preflight-negative.json) | `39a7d05e1be3e85e156578e7402dc98743bbe3e3681e91a1a10824c8f3af7000` |
| [`A06/preflight-positive.json`](evidence/runs/t06-20261122-01/A06/preflight-positive.json) | `51e860c1c6be057122c17e605017f0f1cbb8b40dd209fba0705e763746056f53` |
| [`A06/scenes.json`](evidence/runs/t06-20261122-01/A06/scenes.json) | `b517299da81a38b2e454515ab3c6875aee26b3bae5eace1f8b0b88ebf147a734` |
| [`A06/tables.json`](evidence/runs/t06-20261122-01/A06/tables.json) | `4bad7c2ae3f9cc42cea51134d7258d903fc6f9d039ea2ce65faac8ec26763c4f` |

The registry exported as an AssetCatalog validates against `workflow#AssetCatalog`, the three scenes against `scene`, and the resolved host profile against `character`. The existing examples still pass `check_design.py` unchanged. Each CLI call is in `A06/audit/` (29 calls).

**Remaining gaps**
- **A06/A11 acceptance is NOT_RUN.** Missing are original anime host art (layered PSD, rig, references), the 45–60 second art sample, renders on dark/light/checkerboard backgrounds, hair-halo and sleeve-seam inspection, front/side and maximum-reach poses, and the human art decision.
- **Character art has no on-screen coverage check yet.** Its framing comes from the storyboard (T07/T08).
- **There is no draft-mode relaxation.** Preflight always applies the formal rules.
- **Voice rights stop at registration.** A voice registered here carries rights, but T05 takes are not yet tied to it.
- **No migration for older databases.** Databases created before T06 lack `asset_usage`; there is no migration because no production databases exist.

## 13 · Recorded TDD results for T07

Run `t07-20261122-01` executed on November 23, 2026, 11:46–11:54 China Standard Time, in the environment of sections 6 and 8. Section audio is synthetic and the aligner is a fixture. All bitmaps are code-generated placeholders, cleared by an owner session created by the test or replay script. **This run exercises direction, timing and references, not speech, art or rendering.** [Full TDD log](evidence/runs/t07-20261122-01/tdd-log.txt)

| Runs | Observed RED | Observed GREEN |
| --- | --- | --- |
| 01 → 02 | All five cases failed: the CLI had no `storyboard` / `compile` (every fixture step up to alignment passed). | 5/5 on the first implementation. Word starts at master samples 2,399 and 2,400 cut at frames 1 and 2. Adjacent shots read one shared cut, and the final cut is (144,504 + 1,599) // 1,600 = 91 with 1,096 padding samples. The two “副本” cues resolve to their own word IDs (local frames 10 and 24). In one rejected board, each case names its shot and field: a dangling cue, an unknown word, a cross-section trigger, an out-of-range highlight (61 in a 61-frame shot), a double trigger and a dependency cycle. A backwards cut gives `SHOT_LENGTH_INVALID`, and fixed frames in a production board give `TIMING_NOT_ALIGNED`. The project version does not change. Compiling without a board gives `STORYBOARD_MISSING`. An unregistered gesture and an uncleared backdrop block compilation, and the state stays `STORYBOARD_READY`. Both planned examples read as fixed-frame timelines marked `production: false`. |
| 03–05 | Refactor. Quantization moved to `runtime/timebase.ts`, now shared by audio, alignment and the compiler. Formal preflight became the reusable `preflightShots`. The content replay helper is shared. | Runtime 46/46 with zero skips; `check_design.py` and the Python suite (25/25) unchanged. |

**Design notes**
- **Director DSL.** `storyboard` takes chapters and shots. A shot starts at exactly one anchor: a section start, a word edge or a cue edge. A visual cue fires at a fixed `local_frame`, or at a section/word/cue edge plus `offset_frames`. A shot ends where the next shot starts, and the last shot ends at the program end. Coverage is therefore contiguous by construction.
- **Timebase.** Each cut is quantized once with `(sample + 800) // 1600`, and the program end with `(samples + 1599) // 1600`. The saved board records each cut's sample, frame and the shots before and after it.
- **Freezing.** The saved document is a standard `storyboard` (v1, `timing_basis: aligned`, integer frames) plus the DSL, cuts, padding and dependencies. `compile` pins the exact alignment revision as an asset. In one transaction it then runs formal preflight, appends `assets_resolved` and `snapshot_compiled` (the second under `<key>:compiled`), and stores a `workflow#CompiledTimeline`. Each shot carries:
  - absolute and local intervals;
  - layers, the master audio and the SRT;
  - its compiled cue frames;
  - a cache key over its pinned asset hashes and the keys of the shots it depends on.

  `input_snapshot_hash` binds the board, alignment, audio and pins.
- **Planned boards.** `compile` with an inline `storyboard` is read-only. It checks coverage and cue bounds and writes nothing.

Both examples were replayed as draft projects from their brief, evidence and script:
- Measured section lengths differ from the plan by a deterministic −1,200…+1,199 samples.
- The fixture aligner places one word per character.
- The first shot of a section cuts on the section start. Later shots cut on the word at their planned proportional position.
- Planned visual cues keep their fixed local frames.

Results:
- Cache speed compiled 14 shots and 3,600 frames from 5,758,790 samples.
- Kafka to Doris compiled 34 shots and 14,400 frames from 23,039,499 samples.
- In both, the timeline covers the program from frame 0, the last frame contains the last real sample and every cut is shared.
- Every reference resolves to a file whose bytes match its registered hash.
- The storyboards, timelines and alignments of both copies and of the injection project validate against `storyboard`, `workflow#CompiledTimeline` and `workflow#Alignment` (`schema-check.txt`).
- Each CLI call is in `A07/audit/` (157 calls).

| Artifact | SHA-256 |
| --- | --- |
| [`A07/record.json`](evidence/runs/t07-20261122-01/A07/record.json) | `50ab7235ce3d0a8054285b2ac559e8a9f849ca3f9eb7068a7435231595f2cbf6` |
| [`A07/cache-speed/dsl.json`](evidence/runs/t07-20261122-01/A07/cache-speed/dsl.json) | `03e4f65153ef8632e62be327a8ea6ab524870809807d321617500956608c145a` |
| [`A07/cache-speed/timeline.json`](evidence/runs/t07-20261122-01/A07/cache-speed/timeline.json) | `7c46e7681708e933a2c7961f52616fd19a51bb96755449e7881ab9020025c1b6` |
| [`A07/cache-speed/planned-read.json`](evidence/runs/t07-20261122-01/A07/cache-speed/planned-read.json) | `c4700d9e98affda386ccafdfc998c2133e44ca5dc8da347f6a704cde21b609d5` |
| [`A07/kafka-to-doris/dsl.json`](evidence/runs/t07-20261122-01/A07/kafka-to-doris/dsl.json) | `c7ae7c5a66ec81c2ca344b97fbe6c5285984f248c48cbe762be08e294903db4f` |
| [`A07/kafka-to-doris/timeline.json`](evidence/runs/t07-20261122-01/A07/kafka-to-doris/timeline.json) | `b84cdaf400c92a7ec710fc5a24c55dbf160e91330183e4cce8a4df47ebea8ebf` |
| [`A07/kafka-to-doris/planned-read.json`](evidence/runs/t07-20261122-01/A07/kafka-to-doris/planned-read.json) | `88815cfc0ce91e0cc146290686bfe3e8612b99e796a8048fe03c000a5eaad87e` |
| [`A07/injection/storyboard.json`](evidence/runs/t07-20261122-01/A07/injection/storyboard.json) | `fd5751e989415d3247249dc634709d205fa04b36db0dc3dcaaf06aa5df21ed30` |
| [`A07/injection/cuts.json`](evidence/runs/t07-20261122-01/A07/injection/cuts.json) | `e4a1282ca73350c07c1eaba45d7e77cc80d5856a2ff7c7207202d41024494b3d` |
| [`A07/injection/timeline.json`](evidence/runs/t07-20261122-01/A07/injection/timeline.json) | `531cf95c9d813a35a1304e772284e5a7ccbaeafcc9a1750240f1325fb423b1cc` |
| [`A07/injection/rejections.json`](evidence/runs/t07-20261122-01/A07/injection/rejections.json) | `ee4416f92a7482daee847d534229f654820803105f0034032cbb06250837c78c` |

**Remaining gaps**
- **Real timing is pending.** The copies use synthetic audio and a per-character fixture aligner. Cutting on real speech, with its breaths and pauses, waits for the A05 recordings.
- **Character performance is not compiled yet.** Storyboard v1 actions have no intervals, so `character_plan_ref` is `null` and each shot accepts one character action (`CHARACTER_ACTIONS_LIMIT`). T08 adds the CharacterActionPlan.
- **The DSL has no JSON Schema of its own.** `runtime/compiler.ts` validates it, and the frozen outputs use the existing contracts. A versioned authoring schema is still to be added.
- **No recompilation after a revision.** The workflow only moves forward. A new board after `STORYBOARD_READY`, and invalidation of an earlier compile, wait for T09 (ChangePlan).
- **Cache keys include the absolute range.** A shot that only moves in time gets a new key. T09 decides reuse across shifts.
- **No migration for older databases.** The `content` kind check now includes `storyboard` and `timeline`, so databases created before T07 must be recreated.
- `runtime/preview.ts` (T01) still declares its own timebase constants. It was left untouched.

## 14 · Recorded TDD results for T08

Run `t08-20261122-01` executed on November 23, 2026, 12:20–12:26 China Standard Time, in the environment of sections 6 and 8. The rig is the code-defined `simulated-2d` rig in `tools/bake_character/adapter.ts`. It stands in for the approved original rig and is cleared by an owner session created by the test fixture. **This is development evidence for sequential baking and deterministic reads, not for the host's appearance.** [Full TDD log](evidence/runs/t08-20261122-01/tdd-log.txt)

| Runs | Observed RED | Observed GREEN |
| --- | --- | --- |
| 01 → 02 | All three cases failed: the CLI had no `plan` / `bake` (the storyboard and compile steps of the fixture passed). | 3/3 on the first implementation. Two fresh projects read frames 29, 0, 15 and 0, 15, 29 of a 30-frame shot. Every frame has the same lossless RGBA hash, and the PNG decodes back to it. The cache keys match, and the three frames differ. A second read is `CACHED` with the same hashes. The independent shot bakes alone. The snapshot records step order, fps, seed, physics and rig. The lips are 0 on the marked closure (frames 5–9) and above 0.5 on the open word. The head turns after frame 12. The inheriting shot bakes its predecessor first and starts from its end-state hash. A different plan for the predecessor changes its end state, the dependent cache key and the dependent's first frame. Each plan error names shot and field: unknown pose, unregistered gesture, out-of-range or overlapping action, inherited pose mismatch, unknown cue and a shot outside the timeline. Frame 30 of a 30-frame shot gives `FRAME_OUT_OF_RANGE`. A rig the owner marked `restricted` blocks baking (`ASSET_NOT_CLEARED`). |
| 03–05 | Refactor. Initial-state resolution (`resolveInitial`) is separated from frame lookup (`readFrames`). The T07 test now uses the shared `tests/runtime/studio-fixture.mjs`. | Runtime 49/49 with zero skips; `check_design.py` and the Python suite (25/25) unchanged. |

**Design notes**
- **Plan.** `plan` stores a `workflow#CharacterActionPlan` as an immutable asset, bound to one timeline version. It checks each shot against the compiled timeline, the storyboard character, the CharacterProfile and the rig's pose, angle, expression and gesture tables. An identical plan replays the stored version.
- **Bake.** The initial state is either the end state of the explicitly inherited shot (from the T07 dependencies; that shot is baked first) or the named pose with the seed. Each frame advances the previous state by 1/30 s in a fixed order:
  1. pose easing, with the bounded wave oscillation;
  2. lips from the pinned alignment's visemes, where a marked closure snaps shut;
  3. secondary motion: seeded blinks and a damped hair spring.

  The generator state is part of the character state, so an inherited state carries it forward. The trajectory (every frame's state and RGBA hash) is stored under its cache key. The key covers the baker version, the rig and character hashes, the plan entry, the frame count, the visemes, the seed and the initial-state hash.
- **Reads.** A read renders the requested frames from their recorded states. It checks each hash against the record (`BAKE_NONDETERMINISTIC` otherwise) and keeps a lossless PNG. Character and rig pins (present, unchanged, cleared) are checked on every read, cached or not. The response includes a `workflow#ToolResult`.

The replay compared:
- the two request orders in separate projects: 0 differing pixels on every frame;
- two worker orders started concurrently on fresh projects: identical hashes on all 30 + 61 frames, each shot baked once per project;
- inheritance and a changed predecessor;
- the boundary frames (shot_001 frame 29 and shot_002 frame 0 differ by one integration step toward the new action: 2,997 pixels).

The plan, a bake input for T09, the tool result and the timeline validate against `workflow#CharacterActionPlan`, `workflow#BakeCharacterInput`, `workflow#ToolResult` and `workflow#CompiledTimeline` (`schema-check.txt`). Plan, bake and clear calls are in `A08/audit/` (16 calls); project setup uses the shared test fixture.

| Artifact | SHA-256 |
| --- | --- |
| [`A08/record.json`](evidence/runs/t08-20261122-01/A08/record.json) | `9acdc30a7d8ece331adbdf7111482e617080eb12872ed3480c730562cd946fb5` |
| [`A08/comparisons.json`](evidence/runs/t08-20261122-01/A08/comparisons.json) | `74bcb2874b525611dc768324f0c598027d06334b024cd84710aa9a83771c6213` |
| [`A08/plan.json`](evidence/runs/t08-20261122-01/A08/plan.json) | `f25b76d2ae2b166ea425537aa6aae5642e338b47658a3f4340bc3c45187fb5f3` |
| [`A08/rig.json`](evidence/runs/t08-20261122-01/A08/rig.json) | `dcd70722532366c79b13e06df8aba60cdbb7a3712cb6783c874f6aa5ff7084bb` |
| [`A08/trajectory-shot_001.json`](evidence/runs/t08-20261122-01/A08/trajectory-shot_001.json) | `0938817cfa92f52e6153e3db68d4f70df9f0bf8ca998bd937c873ed4d9d27486` |
| [`A08/trajectory-shot_002.json`](evidence/runs/t08-20261122-01/A08/trajectory-shot_002.json) | `b40d48ee7e0e806161c73bed2c4bb4c4acfe5220e7f8b44d1fc0cb35f020738c` |
| [`A08/tool-result.json`](evidence/runs/t08-20261122-01/A08/tool-result.json) | `084003c89a6c9b3755d53a8bbd6859e868389d4f5db0be3e0c01bd6a6da06b3a` |
| [`A08/frames/shot_001-f00000.png`](evidence/runs/t08-20261122-01/A08/frames/shot_001-f00000.png) | `c48c9b0c0d255b62a72712e9af889319a6e6ae96243ad1f7bf0b8e1515680d6f` |
| [`A08/frames/shot_001-f00015.png`](evidence/runs/t08-20261122-01/A08/frames/shot_001-f00015.png) | `1ec3c26b26dbd050a40bf39d8a8b12eacdc1b00fb79d5ecdb24d13261befbc6c` |
| [`A08/frames/shot_001-f00029.png`](evidence/runs/t08-20261122-01/A08/frames/shot_001-f00029.png) | `79f38588dab03e52615842bb630f7de96c0dd555fbeb94120e3e9587976dbdf5` |
| [`A08/frames/boundary-shot_002-f00000.png`](evidence/runs/t08-20261122-01/A08/frames/boundary-shot_002-f00000.png) | `7bf4ee2fffb240a7060a2d43d5dea472bcddf8d19db7c1b36bbc7cf4cabd7a4d` |

**Remaining gaps**
- **The approved original rig is pending (A06/A11).** The simulated rig proves the baking path, not the host's art, hair or sleeves.
- **Determinism is checked in one pinned environment.** Cross-machine RGBA tolerance is not calibrated, and the environment lock is recorded in `record.json`.
- **The timeline still has `character_plan_ref: null`.** The plan is bound to its timeline version through its asset metadata. T09's render job is where plan, timeline and bake meet.
- **Bake calls carry no envelope.** Idempotency comes from the content-addressed cache key, and nothing changes the workflow state. Render jobs with budgets and recovery belong to T09.
- **One character per shot.** Several characters and gaze targets in the scene graph are not baked yet; the simulated rig records gaze but does not draw it.

## 15 · Recorded TDD results for T09

Run `t09-20261122-01` executed on November 23, 2026, 12:51–13:13 China Standard Time, in the environment of sections 6 and 8 (Node.js v26.9.0, FFmpeg/ffprobe 9.0.2, Python 3.14.4). All audio is synthetic 220 Hz speech-like PCM, backgrounds are solid-colour PNG fixtures, the host uses the code-defined `simulated-2d` rig, and G1–G3 approvals come from host-simulated owner sessions. **This is RUNTIME evidence for rendering, shift-invariant local caching, targeted revision scope and crash/corruption recovery, not for original art or real speech.** [Full TDD log](evidence/runs/t09-20261122-01/tdd-log.txt)

| Runs | Observed RED | Observed GREEN |
| --- | --- | --- |
| 01 → 02/03 | All five cases failed: the CLI had no `render` / `recover` / `revise` (all setup steps through `plan` passed). | Run 02 passed 4/5; the 480 s → 470 s revision case hit `ERR_INVALID_ARG_TYPE` because `revision.ts` read `newAlignDoc.version` instead of `newAlignDoc.alignment.version`. After fixing that field (and making revision aborts roll back atomically plus lossless 30-frame GOP repetition for static segments), run 03 passed 5/5. Quality mode rejects formal `master` before G3 (`APPROVAL_MISSING`), accepts a `sample` render + human G3, and reuses cached sample shots on cold master render; warm re-render is 100% `CACHED`. Caption recoloring (`#FFFFFF` → `#FFE066`) uses 0 bakes and 0 TTS calls, changes rendered media hashes, and marks old G3 `APPROVAL_STALE` while keeping G1/G2 valid. Changing `shot_001` expression (`explaining` → `focused`) recomputes `shot_001` and explicit end-state dependent `shot_002`, while independent `shot_003` keeps identical bake, local cache and MP4 hashes. Cutting 10 s from chapter 4 moves its boundary from 8,100 to 7,800, hits cache on all six unchanged/shifted shots (`ch_001`–`ch_003`, `ch_005`–`ch_007`), and produces a 14,100-frame / 470-second master. Stopping the worker in chapter 4 (exit 137) at temp write, atomic rename before indexing, and after index insertion, plus corrupting an indexed shot, rebuilds only unfinished or damaged units and matches the clean full run. |
| 04–07 | Refactor: extracted shared 3-phase `commitArtifact` helper (marking failed probes `FAILED`), deduplicated warm checkpoints, removed unused map, and added corrupt `character-bake` dependency-invalidation coverage. | Runtime **54/54** and Python **25/25** with zero skips; `check_design.py` exited 0; A09 (8/8 checks) and A12 (8/8 checks) replay passed. |

**Design notes**
- **Local vs assembly keys.** `compiler.ts` and `render.ts` project only shot-local fields (local frame count, camera/zoom, scene and layer hashes, local cues, character bake key, local subtitle slices and subtitle style pin) into `local_cache_key`, excluding `absolute_range` and whole-program audio. Assembly (`chapter_cache_key`, `assembly_cache_key`) binds ordered shots, absolute ranges, master audio and SRT. Shifting chapters 5–7 earlier by 300 frames therefore reuses their character bakes and local shot MP4s verbatim.
- **3-phase atomic commit and recovery.** Every shot, chapter and master renders to `assets/<name>/v<N>.mp4.tmp`, runs `ffprobe` to verify codec/pixel format/frame count (and 48 kHz AAC on master), hashes the verified bytes, atomically renames on the same filesystem, and only then commits `assets`, `render_jobs` (`SUCCEEDED`) and `checkpoints` in one SQLite transaction. `recover` (also invoked automatically before every `render`) cleans `*.tmp` and unindexed orphan files under managed render/bake directories, checks every indexed render/bake artifact on disk, propagates invalidation to dependent shots/chapters/masters (`invalidated_assets`, keeping audit rows intact), resets interrupted `RUNNING` jobs, and verifies each `ChapterCheckpoint` against both shot hashes and its boundary `continuity_state_hash`.
- **Single-pass final mix and encode.** Shots encode with identical bit-exact H.264/yuv420p (`-bf 0 -g 30 -video_track_timescale 15360 -threads 1 -fflags +bitexact`) parameters; chapters stream-copy with `-c:v copy`; the master concatenates video losslessly and encodes the 48 kHz stereo AAC audio track once across the full program.
- **Revision planning (`revise`).** Checks `base_snapshot_hash` (`SNAPSHOT_STALE` on mismatch), persists `RevisionRequest` and `ChangePlan`, computes transitive dependents from the compiled dependency graph, and on `apply: true` creates new versioned objects inside one transaction while preserving prior versions, approvals and cached artifacts (appending `script_saved` when section text/duration changes so G2 becomes `APPROVAL_STALE`).

Cold vs warm vs recovered runs on the 5-chapter A09 fixture (180 frames, 288,000 stereo PCM samples): cold render took 3,135 ms (1 bake, 6 shots, 5 chapters, 1 master); warm render took 12 ms (0 bakes, 0 shots, 100% cached); all three chapter-4 crashes (exit 137) plus corrupt shot (`shot_002`) and corrupt character bake (`shot_001`) rebuilt only unfinished or damaged units and produced byte-identical master MP4s, sampled decoded RGB24 frame hashes and decoded PCM audio hashes. On the 7-chapter A12 fixture, both the 480-second (14,400 frames) and revised 470-second (14,100 frames) masters passed `evals/check_design.py --media --profile standard8` with zero issues.

All persisted `RenderJob`, `ShotArtifacts`, `RenderShotInput`, `ChapterCheckpoint`, `ToolResult`, `CompiledTimeline`, `RevisionRequest`, `ChangePlan` and `storyboard` outputs validated against their JSON Schemas (`A09/schema-check.txt`, `A12/schema-check.txt`). Audited CLI calls are in `A09/audit/` (11 calls) and `A12/audit/` (12 calls).

| Artifact | SHA-256 |
| --- | --- |
| [`A09/record.json`](evidence/runs/t09-20261122-01/A09/record.json) | `e00e911a6ee00d5be518bd3c1cf4fd3116a509df9500d51a59fe46f3d8db707b` |
| [`A09/comparisons.json`](evidence/runs/t09-20261122-01/A09/comparisons.json) | `b91436f0118378d34a2debb83e1f0449ad472c6579a22af76a214dd6abde5649` |
| [`A09/checkpoints.json`](evidence/runs/t09-20261122-01/A09/checkpoints.json) | `a7e7c0af323b6e90f7c81e840b843dbfe3e67abcce1609210666be5e59ae1e14` |
| [`A09/render-jobs.json`](evidence/runs/t09-20261122-01/A09/render-jobs.json) | `4fba183645e454e83855e30a0304e11d2943975425378c9b10d79baf129d7e92` |
| [`A09/recovery-events.json`](evidence/runs/t09-20261122-01/A09/recovery-events.json) | `5df97f9cb4eb259d101f7a2967fa5993aacace61d1f7d7e7404fec98ed7b5c43` |
| [`A12/record.json`](evidence/runs/t09-20261122-01/A12/record.json) | `3b9d280a2f6bda9a6c0082531d051b9f8d22e452616b3ceda83232fdcb49df67` |
| [`A12/change-plans.json`](evidence/runs/t09-20261122-01/A12/change-plans.json) | `e5ae8a2db9fcd39bb602faf6a332576bd7e590b5704850f6478f49f393be68d3` |
| [`A12/diffs.json`](evidence/runs/t09-20261122-01/A12/diffs.json) | `d5337ece89ddc571cec43c3e928ef047626d7c2d354ea189e0e7377d4c469bcd` |
| [`A12/calls-and-gates.json`](evidence/runs/t09-20261122-01/A12/calls-and-gates.json) | `71809c0c79cc15354f97f5de8ea593af9f0d9155ac042d5a74f27125436ff5f3` |
| [`A12/media-check-480s.json`](evidence/runs/t09-20261122-01/A12/media-check-480s.json) | `aa56467fd637214a605a80339ec2d975e8b2cfa62d00e93893306bb1a141d3f4` |
| [`A12/media-check-470s.json`](evidence/runs/t09-20261122-01/A12/media-check-470s.json) | `4d3ae0ace273286b23af914709588a4f61905b454589a7b08b920d08d82bb0fe` |

**Remaining gaps**
- **Fixtures only, not production media.** Synthetic audio, solid-colour PNGs and the `simulated-2d` rig exercise rendering, caching, revision and recovery; real speech (A05) and original host art (A06/A11) remain open.
- **No automated QA or contact sheets yet.** Frame-anomaly checks (flash, black, freeze, subtitle collision), loudness (LUFS/dBTP) and the 3×4 contact sheet belong to T10.
- **Subtitle overlay is geometric glyph blocks.** The default FFmpeg 9.0.2 build lacks `drawtext`, so captions render as deterministic styled blocks in the caption safe band; real typographic font rendering waits for the Remotion/Studio renderer.
- **Sequential shot loop.** Independent shots have independent local keys and can be parallelized across workers, though `render.ts` currently executes them sequentially inside one process.
- **Evidence-level patch application is plan-only.** `revise` plans `evidence` patches (reopening G1–G5), while evidence re-ingestion still goes through `evidence`/`script` commands.
- **No migration for older databases.** Databases created before T09 lack `render_jobs`, `render_events`, `checkpoints`, `change_plans` and `invalidated_assets`; `openStore` creates them automatically on open (`CREATE TABLE IF NOT EXISTS`).

## 16 · Recorded TDD results for T10

Run `t10-20261122-01` executed on November 23, 2026, 14:42–15:05 China Standard Time, in the environment of sections 6 and 8 (Node.js v26.9.0, FFmpeg/ffprobe 9.0.2, Python 3.13.15 venv with `evals/requirements.txt`). All audio is synthetic 220 Hz speech-like PCM, backgrounds are solid-colour PNG fixtures, the host uses the `simulated-2d` rig, the A11 baseline is a newly generated controlled baseline (`baseline_kind: controlled_baseline`, `historical_comparison_status: NOT_RUN`), and G1–G3 / A11 review sessions come from host-simulated owner sessions. **This is RUNTIME evidence for three-level automated QA, contact sheets, loudness/waveform analysis, Studio links and blinded A/B review gating; genuine original-art (A06/A11) and real-voice (A05) subjective human reviews remain NOT_RUN.** [Full TDD log](evidence/runs/t10-20261122-01/tdd-log.txt)

| Runs | Observed RED | Observed GREEN |
| --- | --- | --- |
| 01 → 02/03 | All four cases failed: the CLI had no `inspect` / `qa` / `target` / `compare` (all setup steps through T09 `render` passed). | Run 02 passed 2/4: the initial full-frame mean-MAD freeze threshold (`< 0.8`) falsely flagged the animated 240×270 `simulated-2d` host inside a 1920×1080 frame (3.1% area). Tightening stillness detection to require both `mad < 0.05` and `max_pixel_diff < 8` passed 4/4 on run 03. Injected faults are located by shot and exact absolute frame range: 1-frame white flash (`shot_001`, `[15, 16)`), mid-motion caption collision (`shot_002`, `[40, 50)`, peak frame 45, IoU 0.2756), unintended black (`shot_003`, `[100, 105)`), undeclared freeze (`shot_003`), unintended 1.5 s silence (`shot_003`, `[75, 120)`) and missing audio (`AUDIO_TRACK`). The declared reading hold on `shot_004` is preserved with its original reason and never flagged as a freeze. Without a registered delivery target, QA flags `DELIVERY_TARGET_MISSING` (`needs_review`); after registering a target, the 22 s / 660-frame audible sample passes cleanly and satisfies `sample_checked` from recorded `qa_reports` without `payload.checks`, while a blocking QA report rejects spoofed `sample_qa_pass` (`QA_BLOCKING_ISSUES`). Blinded A/B preparation hides baseline/upgrade roles, rejects agent review (`HUMAN_REQUIRED`) and blocks G3 (`REQUIRED_FIXES_OPEN`) until the open `required_fix` is closed by a human session. |
| 04–05 | Refactor: deduplicated `buildWav` by sharing from `tools/render_shot/adapter.ts`, added path-traversal guard (`ASSET_PATH_INVALID`) in `inspectOp`, added persisted `getLatestQaBundle` + `resolveStudioTarget` coverage, C01 negative parity (720p + 44.1 kHz) and strict loudness violation (`LOUDNESS_OUT_OF_RANGE`). | Runtime **59/59** and Python **25/25** with zero skips; `check_design.py` exited 0; A10 (10/10 checks) and A11 (7/7 checks) replay passed. |

**Design notes**
- **Technical parity & per-frame visual scan (`tools/inspect_media/adapter.ts`).** Implements exact BigInt rational arithmetic matching `evals/media_acceptance.py` C01 rules (container, codecs, `yuv420p`, 30 fps grid cadence, 48 kHz AAC span and audio-gap continuity), verified 1:1 against `check_design.py --media`. Decodes every frame at 160×90 RGB24 to catch 1-frame white flashes/luminance spikes, unintended black frames, undeclared long freezes (subtracting declared holds) and per-second motion heatmaps.
- **Audio loudness, waveform & delivery targets.** Uses FFmpeg `ebur128=peak=true` on both the final mix and the isolated voice WAV over the exact measured intervals, decodes 48 kHz PCM for per-frame RMS/peak waveforms and unintended silence detection, renders a deterministic 1200×240 waveform PNG with a built-in 5×7 pixel font, and checks registered versioned `delivery_targets` (`DELIVERY_TARGET_MISSING` before G3 if unconfigured; `LOUDNESS_OUT_OF_RANGE` / `TRUE_PEAK_EXCEEDED` on violation).
- **Mid-motion geometry & 3×4 contact sheet (`runtime/qa.ts`).** Shares `interpolateBox` and `CAPTION_BOX_NORM` with `tools/render_shot/adapter.ts` to test every frame of moving diagram elements against both `SAFE_AREA` and active caption bounding boxes, extracting full-resolution 1920×1080 defect PNGs. Generates a 1920×810 3×4 (12-cell) contact sheet PNG with per-cell timecode, frame index, shot ID and red/amber status borders without requiring FFmpeg `drawtext`.
- **Gate wiring, Studio navigation & A11 blinded review.** `qa_reports` persists strict `workflow#QAReport` rows plus full Studio navigation bundles (`getLatestQaBundle`, `resolveStudioTarget` by `issue_id`, `cell` or `frame` returning exact shot, local frame and `1600`-sample-aligned waveform range). `runtime/approvals.ts` enforces recorded `qa_reports` for `sample_qa_pass`/`final_qa_pass` (while retaining `payload.checks` fallback for pre-T10 workflow tests) and blocks G3 approval when `ab_comparisons.open_required_fixes > 0`.

All persisted `QAReport`, `InspectMediaInput`, `ToolResult` and `Approval` artifacts validated against their JSON Schemas (`A10/schema-check.txt`, `A11/schema-check.txt`). Audited CLI calls are in `A10/audit/` (4 calls) and `A11/audit/` (10 calls).

| Artifact | SHA-256 |
| --- | --- |
| [`A10/record.json`](evidence/runs/t10-20261122-01/A10/record.json) | `323de889a7a0cd1abf6591dda08ac8fd12bf25f96d8a536a992f9a7e16d7056e` |
| [`A10/qa-report-defects.json`](evidence/runs/t10-20261122-01/A10/qa-report-defects.json) | `c5af16070c6249d0f7fe2628f81fec1bc4c75a9916c145646cb001d59086e63f` |
| [`A10/bounding-boxes.json`](evidence/runs/t10-20261122-01/A10/bounding-boxes.json) | `4109b6b0ae8b3ff7357a112f681f2fe5172751a97ba6d91ad7a8cb8e7e53bb1e` |
| [`A10/audio-metrics.json`](evidence/runs/t10-20261122-01/A10/audio-metrics.json) | `1bd72330c2c7fad9843f33cdba94cf73af2fa9170037f86ade15de0046bce5b9` |
| [`A10/contact-sheet-defects.png`](evidence/runs/t10-20261122-01/A10/contact-sheet-defects.png) | `5cc0f0a05753c0445efb316b3ae4ce8d8f86ef033e797da86d65d5489069d3fe` |
| [`A10/waveform-defects.png`](evidence/runs/t10-20261122-01/A10/waveform-defects.png) | `5d688659abefb5bf12cc6a61645efd68685219e71afd2d9e00a26a988a6980e4` |
| [`A10/studio-navigation.json`](evidence/runs/t10-20261122-01/A10/studio-navigation.json) | `ad50515b6ae08133bffc940ba372e201e74f9fbb6832eb98db66dc9638486bdc` |
| [`A11/record.json`](evidence/runs/t10-20261122-01/A11/record.json) | `30692fbbdc7fb870624eb3592be0388e60eaf1badabb6857e0ebe4aff45d2a67` |
| [`A11/sample-upgrade.mp4`](evidence/runs/t10-20261122-01/A11/sample-upgrade.mp4) | `cb3824a3cc13bd30a9d128c1f19c9f4eaf3d4b9dfe60b976c6c425ecac31f5f9` |
| [`A11/sample-baseline.mp4`](evidence/runs/t10-20261122-01/A11/sample-baseline.mp4) | `99b598cd91917db5eadab8f1c093ab099e0fea366d65358c87413248b4021bc7` |
| [`A11/contact-sheet-sample.png`](evidence/runs/t10-20261122-01/A11/contact-sheet-sample.png) | `7bfe0c66ff1190d72ae82ec5db16eb4e9a7b1b3ab24edaef4b2e46e0baf4f79e` |
| [`A11/blinded-packet.json`](evidence/runs/t10-20261122-01/A11/blinded-packet.json) | `0201bc9f2482e60a3315fb1ecce2220160810d8a7bed480a46939fd17cd16f0c` |
| [`A11/ab-review.json`](evidence/runs/t10-20261122-01/A11/ab-review.json) | `600fa575171b19688e2f61d89e6d22bbd985d9fcaa6af795b6cf3aec14a670e1` |

**Remaining gaps**
- **Fixtures and controlled baseline only, not real human subjective acceptance.** Real Chinese speech (A05), original anime host art (A06/A11), genuine historical footage comparison (`historical_comparison_status: NOT_RUN`), phone/headphone human listening notes and real owner G3 sign-off remain open.
- **React Studio UI descoped under Plan A.** `getLatestQaBundle` and `resolveStudioTarget` expose the exact shot/frame/waveform navigation contract for CLI use; export packaging was completed in T11 (see section 17).
- **Subtitle collision checks structured diagram motion against the caption band.** Typographic font overflow and multi-line Chinese line-wrap measurement wait for the Remotion/Studio text renderer.
- **No migration for older databases.** Databases created before T10 lack `qa_reports`, `delivery_targets` and `ab_comparisons`; `openStore` creates them automatically on open (`CREATE TABLE IF NOT EXISTS`).

## 17 · Recorded TDD results for T11

Run `t11-20261122-01` executed on November 23, 2026, 15:22–15:37 China Standard Time, in the environment of section 16 (`Node.js v26.9.0`, `bsdtar 3.5.3`, `SQLite 3.53.4`, `Python 3.13.15` venv with `evals/requirements.txt`). Per the project owner's **Plan A (Pure Agent Skill descoping)** decision, React `studio/` UI and browser automation were formally descoped because all editing runs through the Agent + Skill CLI. All audio is synthetic 220 Hz PCM, visuals use fixture PNGs and the `simulated-2d` rig, and G1–G5 approvals come from host-simulated owner sessions. **This is RUNTIME evidence for traceability, manifest/G4/G5 binding, archive packaging and directory restore/reopen; real speech (A05), original art (A06/A11) and genuine owner sign-offs remain open.** [Full TDD log](evidence/runs/t11-20261122-01/tdd-log.txt)

| Runs | Observed RED | Observed GREEN |
| --- | --- | --- |
| 01 → 02–04 | All four cases failed: the CLI had no `trace` / `manifest` / `package` / `restore` (setup through T10 `qa` and `G4` passed). | Run 02 passed 1/4 (`PackageOp` lacked `mkdtempSync` import, and test registered `alt_master` with invalid kind `render-master`). After fixing those, run 03 passed 3/4: `restoreOp` opened the restored `studio.sqlite` via writable `openStore`, whose `PRAGMA journal_mode = WAL` flipped the restored file's header bytes. Switching `restoreOp` to `{ readOnly: true }` passed 4/4 on run 04. `trace` resolves `claim -> source` and `subtitle/word -> shot` and updates immediately after `revise`. Draft export (`DRAFT_EXPORT_FORBIDDEN`), missing/stale G4 (`APPROVAL_MISSING` / `APPROVAL_STALE`), agent G5 (`APPROVAL_UNAUTHENTICATED`) and a 1-byte tampered manifest (`MANIFEST_HASH_MISMATCH`) are rejected without mutating state. Valid packaging archives 55 files (`.tar.gz`), verifies every extracted byte by SHA-256, advances `archive_verified` → `DELIVERED` from `packages`, escapes `<script>`/`<img>` in `deliverables/review-report.html`, and restores into a new directory where all 55 hashes match and shot-level `revise` + `render` succeeds. |
| 05–06 | Refactor: bound `manifest` replay lookup directly to the event's `manifest_ref`, replaced dummy `'tar.gz'` reserve helper with `nextVersion`, removed unused `ledger` import, and added replay, negative `trace` (`CLAIM_UNKNOWN` / `WORD_UNKNOWN` / `RENDER_TARGET_UNKNOWN`) and modified-file (`ASSET_FILE_CHANGED`) packaging tests. | Runtime **64/64** and Python **25/25** with zero skips; `check_design.py` exited 0; A13 (7/7 checks, 19 audited calls) replay passed. |

**Design notes**
- **Shared snapshot & traceability (`runtime/export.ts`).** `getProjectSnapshot` unifies `trace`, `manifest` and `package` reads over latest versioned content, active assets, QA reports, G1–G5 approvals, cost ledger and claim/subtitle/word lookup maps.
- **WAL-safe SQLite snapshot & non-circular manifest (`manifestOp`).** `VACUUM INTO` captures the clean `APPROVED` database BEFORE writing export artifacts into the live DB, redacts `sessions.token_hash`, strips prior export-artifact rows and sets `journal_mode = DELETE`. `ExportManifest` excludes both itself and the G5 receipt and binds exact SHA-256 hashes of all deliverables (including XSS-escaped `deliverables/review-report.html`), `project/studio.sqlite` and every `project/assets/...` file.
- **Tamper-proof packaging & restore (`tools/package_project/adapter.ts`).** Validates safe relative paths (`isSafeRelativePath`), verifies `manifest.json` bytes against `manifest_hash` and G5 `target_hash`, re-verifies non-stale G4, packs `.tar.gz` with `COPYFILE_DISABLE=1`, self-extracts and checks every archived file before atomic commit, and opens restored `studio.sqlite` read-only during verification so restored bytes remain identical to the manifest. `approvals.ts` reads `packages.verified = 1` for `archive_hashes_match`.

All persisted `ExportManifest`, `PackageProjectInput`, `FinalPackage`, `ToolResult` and G4/G5 `Approval` artifacts validated against their JSON Schemas (`A13/schema-check.txt`). Audited CLI calls are in `A13/audit/` (19 calls).

| Artifact | SHA-256 |
| --- | --- |
| [`A13/record.json`](evidence/runs/t11-20261122-01/A13/record.json) | `f2438c1e60f37d798482846e95845ec86f2f3c2b1db088ae928972761521fa0f` |
| [`A13/export-manifest.json`](evidence/runs/t11-20261122-01/A13/export-manifest.json) | `e8d5c89ae0324d86b4c933957a222dca8c31515eb9c6bce6427fc12a81a329e9` |
| [`A13/package-input.json`](evidence/runs/t11-20261122-01/A13/package-input.json) | `d99ed5cc10804d0595a233de39c8350b254fbbb520ec0924e2a588b4afebf6b0` |
| [`A13/final-package.json`](evidence/runs/t11-20261122-01/A13/final-package.json) | `0d1f74bd5f09cfb6af9c2baf43ff0e751e0265d023464a5740666a9e42e20dbd` |
| [`A13/tool-result.json`](evidence/runs/t11-20261122-01/A13/tool-result.json) | `ca4cbb70cbe475c620871a198e025d687a5b5d193d1dd0e7dde43b66950a4468` |
| [`A13/g4-approval.json`](evidence/runs/t11-20261122-01/A13/g4-approval.json) | `6263499aae359c7326cd7fb2d38df7b465e56b265b1cca6247b23b27ff0794e9` |
| [`A13/g5-approval.json`](evidence/runs/t11-20261122-01/A13/g5-approval.json) | `bc8d408d0a84834457ee70aadd78ad98ab59233dd60482832d19df58bdd1740e` |
| [`A13/tamper-rejection.json`](evidence/runs/t11-20261122-01/A13/tamper-rejection.json) | `9d48e61fc0dd2b750beebaab377fc871621fe52870b8832c4c0ccc8fda39b64f` |
| [`A13/restore-report.json`](evidence/runs/t11-20261122-01/A13/restore-report.json) | `a66e07c8f1b1fb9d39abf80716ec97c1c798f4bf2633e14fecbd706f6cc2c42b` |
| [`A13/review-report.html`](evidence/runs/t11-20261122-01/A13/review-report.html) | `e7aaf3c615563d6fd21fd06cc443017da6ee69f2de294ce69c053aa616b18af5` |
| [`A13/trace-report.json`](evidence/runs/t11-20261122-01/A13/trace-report.json) | `78c539ea791ee65ad2bb82c125feb120a9b4be3d5000902606651a06823c0e44` |

**Remaining gaps**
- **Fixtures and host-simulated approvals only.** Genuine episodes with real Chinese speech (A05), original anime host art (A06/A11) and real owner G1–G5 sign-offs remain open for **T12**.
- **Plan A descoping of `studio/`.** Interactive browser SPA editing is not built because all authoring runs through Agent + Skill CLI; `deliverables/review-report.html` provides standalone browser-viewable summary inspection.
- **No migration for older databases.** Databases created before T11 lack `export_manifests` and `packages`; `openStore` creates them automatically on open (`CREATE TABLE IF NOT EXISTS`).
