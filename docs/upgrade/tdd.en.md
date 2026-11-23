# TDD execution plan

[简体中文](TDD执行计划.md) · English

**Goal.** Connect the skills, contracts and offline checks to a local studio capable of producing both duration profiles. Work one ready card at a time. Deliver code, replayable red/green evidence and artifacts appropriate to the evidence level.

**Architecture.** One orchestrator owns state and authorization. A Node.js/TypeScript service consumes the existing JSON schemas. SQLite persists projects and jobs. Deterministic workers render shot-level character, diagram and audio plans from compiled timelines. Python remains the offline acceptance entry point.

**Handoff.** Read the [project plan](project-plan.en.md), [upgrade design](design.en.md), [acceptance plan](acceptance.en.md) and [current status](handoff-status.en.md). T00–T04 are complete and the T05 data path, T06 asset catalog, T07 compiler, T08 baker, T09 render/revision/recovery runtime, T10 three-level QA/sample review runtime, and T11 headless delivery/export/restore runtime (Plan A: React `studio/` UI formally descoped for pure Agent + Skill operation) are complete at RUNTIME level (the real-voice A05 and original-art A06/A11 acceptances are open); T12 is the next card. T01 created `runtime/cli.ts`, `runtime/doctor.ts`, `runtime/preview.ts`, `runtime/i18n.ts` and `tests/runtime/`; T02 created `runtime/project-store.ts`, `runtime/orchestrator.ts` and `runtime/approvals.ts`; T03 created `runtime/jobs.ts` and `runtime/ledger.ts`; T04 created `runtime/content.ts` and `tools/search_sources/adapter.ts`; T05 created `runtime/audio.ts`, `runtime/assets.ts`, `tools/align_audio/adapter.ts` and `tools/generate_tts/adapter.ts`; T06 added registration, clearance, scene templates and preflight to `runtime/assets.ts`; T07 created `runtime/compiler.ts` and `runtime/timebase.ts`; T08 created `runtime/baker.ts`, `tools/bake_character/adapter.ts` and `tests/runtime/studio-fixture.mjs`; T09 created `tools/render_shot/adapter.ts`, `runtime/render.ts` and `runtime/revision.ts`; T10 created `tools/inspect_media/adapter.ts` and `runtime/qa.ts`; T11 created `runtime/export.ts` and `tools/package_project/adapter.ts`. Paths under `runtime/` and `tests/runtime/` below reflect the implemented runtime layout (`studio/` was descoped under Plan A). The existing `schemas/`, `skills/`, `policies/` and `tools/` define the starting interfaces.

## Starting work and closing each card

```sh
python3 -B evals/check_design.py
python3 -B -m unittest discover -s evals -p 'test_*.py' -v
```

- [ ] Record baseline results and input revisions. Select one observable new behavior and write a minimal failing test.
- [ ] Run the card’s focused command. Save the RED exit code, failed assertion and reason. Repair a broken fixture before attributing failure to the product. If the behavior already passes, record its existing coverage and select a missing case.
- [ ] Implement the minimum passing behavior. Run the identical command for GREEN and then exercise adjacent callers and the full baseline.
- [ ] Refactor duplication introduced by the change, or record why none was needed. Rerun the suite. Save case ID, input/output hashes, logs and open human checks.
- [ ] Preserve existing callers, both duration profiles and old examples. For a breaking schema change, write legacy replay tests first, then the migration and revision record.

The proposed Node tests are `.mjs` files that exercise the public CLI or service using the built-in test runner. T01 establishes the proposed interface `node --experimental-strip-types runtime/cli.ts <operation> --project <directory> --request <json-file>`. Verify TypeScript startup against the selected Node version at implementation time. Development fixtures can use temporary projects, local WAV and test adapters. Release evidence requires genuine material. The host session authenticates the reviewer and input JSON carries the request.

## Task order

| Card | Depends on | Deliverable | Case |
| --- | --- | --- | --- |
| T00 | Existing architecture package | Technical media checker and offline evidence | C00, C01 |
| T01 | T00 | Doctor and 12-second sound clip | A01 |
| T02 | T01 | Durable state, versions, human approval and recovery | A02 |
| T03 | T02 | Permissions, budgets, submit intent and reconciliation | A03 |
| T04 | T02, plus T03 for chargeable retrieval | Topic, evidence and reviewed script | A04 |
| T05 | T04, plus T03 for chargeable voice | Measured audio, alignment and subtitles | A05 |
| T06 | T01 | Original host, three scene types and 45–60 second art sample | A06, art portion of A11 |
| T07 | T04, T05, T06 | Traceable storyboard and compiled snapshot | A07 |
| T08 | T06, T07 | Sequential bake, randomly addressable output frames | A08 |
| T09 | T02, T03, T07, T08 | Shot/chapter rendering, revision planning and recovery | A09, A12 |
| T10 | T05, T08, T09 | Geometry and media QA, contact sheet and sample review | A10, A11 |
| T11 | T02, T09, T10 | Headless delivery path (Plan A), manifest, archive and restore | A13 |
| T12 | Production dependencies T01–T11 ready | Three short durations and three long episodes qualified | A14, A15 |
| T13 optional | T03, T08, T09, T10 and owner enablement | Controlled insert and fallback | A16 |

Minimum UI, proxy renders and art experiments may run earlier as milestone subtasks. The dependencies above apply to completion of the whole card. Label early T01/T06 clips by their actual use. Formal G3/G4/G5 bind a specific program revision.

## T00 · Completed acceptance slice

The implementation is in `evals/check_design.py`, `evals/media_acceptance.py` and `evals/test_media_acceptance.py`. Replay the two-minute and eight-minute paper boards offline. The media check reads actual decoded frames and audio. It catches irregular timestamps even when total frame count is right. [Red, green and refactor evidence](handoff-status.en.md)

## T01 · Environment and a small clip with sound

Create `runtime/cli.ts`, `runtime/doctor.ts`, `runtime/preview.ts` and `tests/runtime/T01-doctor.test.mjs`. Reuse `profiles/duration.yaml` and `tools/inspect_media/contract.yaml`. Establish diagnostics first, then connect local picture, WAV, composition and a probe of the actual preview.

- [x] **RED 1** Put a real test font and WAV in a temporary project, then remove the configured font. Call doctor and assert that its structured result names the missing font and reports the capability status.
- [x] **GREEN 1** Probe dependencies, font, renderer and encoder. Retain versions, actual graphics backend and gaps. Audio and encoding capabilities remain reportable when graphics is unavailable.
- [x] **RED 2** Use a local 48 kHz WAV and redistributable host fixture. Require exactly 360 decoded frames in a 12-second clip, audible sound and positive image differences across its first, middle and last sample frames.
- [x] **GREEN 2** Compose one character layer and one procedural diagram through the intended production path. Archive the source audio, render configuration, probe and three frames. Identify the fixture if original art is pending.
- [x] Run `node --test tests/runtime/T01-doctor.test.mjs` and attach the proof to A01. The normal short acceptance command applies to programs of 60 seconds and above.

## T02 · Project state, human decisions and idempotent events

Create `runtime/project-store.ts`, `runtime/orchestrator.ts`, `runtime/approvals.ts` and `tests/runtime/T02-state.test.mjs`. Read `workflows/topic-to-video.yaml` and `policies/approval-gates.yaml`.

- [x] **RED** Two identical submissions return one event ID. Reject the same key with another payload and a stale `expected_version`. Add expired G2, direct draft export and a model attempting to sign G4.
- [x] **GREEN** In one SQLite transaction, compare revision, read authenticated identity, verify target hash, append the event and advance state. Scope unique keys by project and idempotency key. Retain old versions and approvals.
- [x] **REFACTOR** Share the service between CLI and future UI. Restart and compare stage and event count. Run `node --test tests/runtime/T02-state.test.mjs` and save the database snapshot and denial events for A02.

## T03 · Budget, provider jobs and unknown receipts

Create `runtime/jobs.ts`, `runtime/ledger.ts` and `tests/runtime/T03-jobs.test.mjs`. Use RenderJob, ToolResult and `policies/budget.yaml`. Store money in minor currency units.

- [x] **RED** Under a 100-unit cap, submit two distinct 70-unit intents concurrently. Only one reservation may remain. Duplicate one intent and require exactly one provider acceptance. Drop the receipt after acceptance and restart.
- [x] **GREEN** Persist reservation and submit intent in a transaction, then call the provider with that key. Query uncertain work by original key or receipt. Settle once on confirmation. Without lookup support, keep UNKNOWN and the pending balance.
- [x] **REFACTOR** Separate ledger writes from provider response parsing. Run `node --test tests/runtime/T03-jobs.test.mjs`. For A03 keep reservations, settlements, provider counts, permission denials and restart logs.

## T04 · Topic, evidence and reviewable scripts

Create `runtime/content.ts`, `tools/search_sources/adapter.ts` and `tests/runtime/T04-content.test.mjs`. Invoke the entry, topic, research and script skills. Reuse the short example’s brief, evidence-set and script.

- [x] **RED** Supply two source versions supporting different conclusions and an unsupported key claim. Preserve conflicting locators and prevent treating an unsupported claim as confirmed. Keep section IDs after nonmaterial edits to supplied text.
- [x] **GREEN** Version sources, claim links, qualifications, spoken sections and terms needing audition. G1 reviews source findings. G2 fixes script and duration. Owner-authorized local material remains usable offline.
- [x] **REFACTOR** Share default resolution between start and resume. Test explicit 120 seconds, 180 for a new project and 480 for `standard8`. Run `node --test tests/runtime/T04-content.test.mjs` for A04.

## T05 · Audio, words, visemes and SRT

Create `runtime/audio.ts`, `tools/align_audio/adapter.ts`, `tools/generate_tts/adapter.ts` and `tests/runtime/T05-audio.test.mjs`. Reuse AudioManifest, Alignment and SubtitleTrack. Connect WAV import first, then an authorized voice provider.

- [x] **RED** A section starts at sample 48,000 and its word at local sample 2,400. Require master sample 50,400. Distinguish two occurrences of the same term by ID. Include low confidence and a manual correction.
- [x] **GREEN** Preserve original WAV, text and voice revisions, sample times and confidence. Drive subtitle and viseme tracks from the same revision. Imported and synthesized voice share the downstream contract.
- [ ] **REFACTOR** Reuse T03 charging and retries. Run `node --test tests/runtime/T05-audio.test.mjs`. Complete A05 with a real voice and at least 100 labeled anchors, recording the calibration decision. (Charging reuse and the focused test are done; the real-voice A05 has not run, so this box stays open.)

## T06 · Original host and three editable scene templates

Create `runtime/assets.ts` and `tests/runtime/T06-assets.test.mjs`. Store assets according to their permissions. Place redistributable assets and fingerprints in tests. Replay existing examples before extending character or scene contracts.

- [x] **RED** During formal assembly, require an asset ID for a missing rig version, unauthorized asset or unregistered 90-degree angle. A full-frame 1920×1080 bitmap requested for a native-resolution 1.5× push-in must fail coverage preflight.
- [x] **GREEN** Register original art, separated layers, rig, permission, supported actions/angles and voice. Retain prior versions. Check pixels against safe areas and zoom. Establish host, procedural diagram and topic illustration templates.
- [ ] **REFACTOR** Share asset resolution between host and diagram shots. Run `node --test tests/runtime/T06-assets.test.mjs`. Make the 45–60 second original art sample and record three backgrounds, extreme poses and art decisions for A06/A11. (Shared asset resolution and the focused test are done; the original art sample has not been made, so this box stays open.)

## T07 · Director DSL, word-trigger compilation and timebase

Create `runtime/compiler.ts` and `tests/runtime/T07-compiler.test.mjs`. Use storyboard, common and workflow contracts. Feed both original examples and copies with measured alignment. Keep `planned` boards readable.

- [x] **RED** Samples 2,399 and 2,400 map to frames 1 and 2. Adjacent shots reference one cut, and the timeline includes the last real sample. An invalid action, cross-section cue, dependency cycle or out-of-range animation identifies object and field.
- [x] **GREEN** Resolve stable references and quantize shared boundaries once. Emit local and absolute intervals, bound effects, audio references, input hash and layer dependencies. Production compilation requires `aligned` timing and authorized assets.
- [x] **REFACTOR** Share quantization across both profiles. Run `node --test tests/runtime/T07-compiler.test.mjs` and the Python checks for both examples. Save inputs, frozen results and each negative diagnostic for A07.

## T08 · Sequential baking and deterministic frame reads

Create `tools/bake_character/adapter.ts`, `runtime/baker.ts` and `tests/runtime/T08-bake.test.mjs`. Use the capability table, CharacterActionPlan and compiled local frame count.

- [x] **RED** With the same rig, seed and initial state, request frames 29, 0, 15, then 0, 15, 29. Compare lossless RGBA hashes frame by frame. Changing an explicitly inherited previous end state must change the cache key.
- [x] **GREEN** Bake sequentially at a fixed step. The compositor reads the requested frame. Apply pose, lips and secondary motion in a fixed order and record rig and physics in the snapshot.
- [x] **REFACTOR** Separate initial-state resolution from frame lookup. Run `node --test tests/runtime/T08-bake.test.mjs`. Keep actual images, pixel diffs and the environment lock for A08. A simulated rig provides development evidence.

## T09 · Rendering, targeted edits and crash recovery

Create `tools/render_shot/adapter.ts`, `runtime/render.ts`, `runtime/revision.ts` and `tests/runtime/T09-render.test.mjs`. Persist RenderJob, ChapterCheckpoint and ChangePlan.

- [x] **RED** Caption recoloring produces zero bakes and TTS calls. Changing one expression keeps independent shot hashes identical. Cutting ten seconds from chapter four moves the boundary to frame 7,800 and produces a 470-second master.
- [x] **RED** Stop the worker in chapter four after temporary write, atomic rename and index insertion. Separately corrupt a cached shot. Restart should claim only unfinished or damaged units.
- [x] **GREEN** Key local layers from the fields they consume and assembly from absolute order. Verify content before indexing. On recovery verify artifacts and rebuild invalid dependencies. Mix and encode the final program once.
- [x] **REFACTOR** Compare cold, warm and recovered runs. Run `node --test tests/runtime/T09-render.test.mjs`. Keep times, hits, calls, decoded frame comparisons and recovery events for A09/A12.

## T10 · Three levels of QA and a human-reviewed sample

Create `runtime/qa.ts`, `tools/inspect_media/adapter.ts` and `tests/runtime/T10-qa.test.mjs`. Reuse the existing technical rules or their common test vectors.

- [x] **RED** Inject a one-frame flash, mid-motion subtitle collision, unintended black and a declared diagram hold. Require frame numbers for defects, preserve the hold reason and bind the report to the inspected media hash.
- [x] **GREEN** Preflight geometry and references. Check single-frame anomalies per frame and sample composition quality. Produce a 12-cell contact sheet and 20–30 second sample with sound. Return issues and evidence for human G3.
- [ ] **REFACTOR** Let the Studio open the shot and waveform from the same result. Run `node --test tests/runtime/T10-qa.test.mjs`. For A10/A11 keep both comparison clips, blinded ordering and human notes. (Studio navigation, focused tests, controlled-baseline clips, blinded ordering and simulated review are done; genuine original-art/real-voice human A11 review notes remain open, so this box stays open.)

## T11 · Headless traceability, export manifest and restorable archive (Plan A descoped)

Owner approved **Plan A (Pure Agent Skill descoping)**: because all authoring and revisions run via Agent + Skill CLI, the React `studio/` SPA and `tests/ui/T11-review.test.mjs` are formally descoped. Create `runtime/export.ts`, `tools/package_project/adapter.ts` and `tests/runtime/T11-delivery.test.mjs`. Traceability, manifest preparation and packaging share the project store snapshot and approval rules, outputting a zero-dependency standalone `deliverables/review-report.html`.

- [x] **RED** Trace from claim to source and subtitle to word, change one shot and refresh (`trace` after `revise`). Reject stale G4 or changed G5 manifest bytes. A valid archive in a new directory should reopen with its original asset hashes and allow shot-level editing.
- [x] **GREEN** Generate `deliverables/review-report.html` (XSS-escaped) and `ExportManifest` (excluding itself and G5 receipt) after human G4, bind G5 to `manifest_hash`, package `.tar.gz`, verify every archived file after extraction, advance `archive_verified` → `DELIVERED`, and reopen/edit in a new directory.
- [x] **REFACTOR** Share `getProjectSnapshot` across `trace`, `manifest` and `package`. Run `node --test tests/runtime/T11-delivery.test.mjs`. Save traceable outputs, tamper rejections, review HTML, sign-off and restore report for A13 (RUNTIME level with fixtures and simulated human sessions; real-owner sign-offs remain with T12).

## T12 · Genuine episodes and production acceptance

Create `tests/e2e/T12-programmes.test.mjs` and an independent evidence directory per episode under the [acceptance plan](acceptance.en.md). Use owner-approved topics and sources, original art and real voice. As the owner decided, production sign-off uses a **local passphrase login** (`runtime/owner.ts`, interactive owner terminal only; `runtime/cli.ts` has no sign-in operation) and a **per-episode owner attestation** (`attest`), summarized by `accept` / `programme` in `runtime/acceptance.ts`.

- [x] **RED** Missing real media, a stale approval or a missing review must identify the missing evidence and withhold production PASS. Demonstrate the failing check on a controlled input first. (Verified on the T11 fixture: host-hook sign-offs, a missing attestation and a wrong master frame count are all listed as missing; see handoff section 18.)
- [ ] **GREEN** Verify exact short frame counts, real sound, human gates, budget and restorable project. (The checks are in place; genuine episodes wait on owner material and sign-off, so this box stays open.) Cover 60/120/180 seconds, including at least one genuine end-to-end short. Produce three consecutive eight-minute episodes and exercise cross-chapter revision and recovery on at least one.
- [ ] **REFACTOR** Aggregate by `run_id` and retain per-episode details (`programme` is implemented). Run `node --test tests/e2e/T12-programmes.test.mjs` and check each actual master. Example for an exact long cut: `python3 -B evals/check_design.py --media evidence/runs/long-01/A15/final.mp4 --profile standard8 --target-seconds 480`. The owner watches, signs and verifies costs for A14/A15.

## T13 · Optional generated inserts

Implement the enabled channels in `tools/generate_image/adapter.ts` and/or `tools/generate_video/adapter.ts`, plus `tests/runtime/T13-inserts.test.mjs`. Regular host and diagram production can operate independently. A project needing still candidates may connect the image channel after T03/T06.

- [ ] **RED** Video adapter call count is zero by default. After enablement, excess candidate or frame budget and an UNKNOWN submission cannot initiate a second paid submission. Rejected candidates allow return to the original shot.
- [ ] **GREEN** Register the driving clip and references. Reuse T03 budgets and idempotency. Bind only the human-selected candidate to the slot.
- [ ] **REFACTOR** Test fallback to the original host layer/diagram. Run `node --test tests/runtime/T13-inserts.test.mjs`. Record status and reason when disabled. On real use, save a provider receipt summary, continuity evidence and human decision for A16.

## Handoff and closure

Update the [handoff status](handoff-status.en.md) with the last completed card, evidence, unresolved issues and first ready card. Git commits and remote publication follow user authorization. When the relevant files and evidence are ready, replay offline commands from a clean directory and issue a conclusion at the evidence level specified by the acceptance plan.
