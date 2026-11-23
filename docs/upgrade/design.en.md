# AI Animation Studio upgrade design

[简体中文](升级详细设计.md) · English

Version 1.1, November 19, 2026. This document builds on the [studio architecture](../architecture.en.md). It identifies which ideas from the earlier stick-figure image-quality and motion proposal carry over to an original anime host, and how to verify them in a Chinese knowledge program.

## 1 · Decisions from the earlier proposal

The source PDF has 22 pages. Its SHA-256 is `9fdc2eb358aaec7c54dbecf43506cac901e9173be476cf490ccc3d8e4003226e`. Page references below are physical PDF pages. The source describes techniques and research assumptions. Project artifacts and execution records establish implementation status.

| Pages | Earlier idea | Decision for the studio | Case |
| --- | --- | --- | --- |
| 1–3 | External generation (A), local composition (B), directing rules easy to miss | Keep one entry and explicit contracts. Use a deterministic main pipeline. Record quality/fast-draft mode separately from the rendering route. | A02, A04, A07 |
| 2–3, 16 | Doctor → validate → approve sample with sound → render | Retain capability checks, compile preflight and representative samples. Connect them to G1 research, G2 script, G3 sample, G4 master and G5 export. | A01, A02, A11 |
| 2, 13–14 | Real voice sets the clock, word-bound actions retime after edits | Align real 48 kHz audio first. Drive lips, gestures, captions and effects from word anchors on a 30 fps integer grid. | A05, A07, A12 |
| 2–3, 13 | Content-addressed caches, locked character references and prebaked physics | Pin original art, rig, voice and fonts. Key local layers by their actual input fields and assembly by absolute order. | A06, A08, A09 |
| 4–7, 17–18 | Web skeletons, professional rigs, generated inserts and estimated costs | Use Live2D for the host, SVG/Canvas for exact graphics, Remotion for composition and FFmpeg for encoding. Evaluate Rive, Spine or Blender separately if needed. Generated video is disabled by default. | A01, A06, A16 |
| 7–11 | Alpha layers, zoom resolution, materials, depth, fine lines and mobile codecs | Inspect hair on dark/light backgrounds, check effective resolution at maximum zoom and keep labels and captions sharp. Decode the H.264/yuv420p/AAC export. | A06, A10, C01 |
| 8, 11–13 | Two-pass outlines, two-bone IK, damped dynamics and line boil | Set the host’s range from approved art and deformers. Keep pointing, anticipation and follow-through. Restrict procedural line effects to selected graphic layers and lock seed and timestep. | A06, A08 |
| 14–16 | Continuous canvas, cue-driven motion recipes, three QA levels, 3×4 contact sheet | Share spatial conventions within a chapter. Bound each recipe’s parameters. Retain distinct geometry, frame-anomaly, contact-sheet and human playback evidence. | A07, A10, A11 |
| 5–7, 16–19 | 80/20 split, unit quotes, schedule and third-party benchmarks | Measure actual insert share, cost and throughput. A full program can use the fixed host and diagrams alone. Reference 12 on page 19 is marked `unknown_url`. Its estimates are not release thresholds. | A03, A14–A16 |

## 2 · From request to editable project

The [entry skill](../../skills/topic-to-video/SKILL.md#english) reads defaults, duration profile and mode. One orchestrator owns jobs, costs and approvals. Thirteen skills exchange registered objects. The nine execution adapters are specified in `tools/*/contract.yaml`. The working media acceptance command lives in `evals/`. Collect runtime evidence for adapters after connecting them to a host.

| Stage | Visible outputs | Invariants and failures |
| --- | --- | --- |
| Topic, research, script | TopicBrief, EvidenceSet, ScriptDocument, source cards | Trace every key claim to a locator. Label, qualify or remove disputed material. Keep original section mapping. Production voice binds G2. |
| Audio and direction | WAV, AudioManifest, Alignment, Storyboard | Keep original word sample positions. Mark estimates `planned` and measured alignment `aligned`. Identify a missing object by ID. |
| Art and compilation | CharacterActionPlan, ScenePlan, CompiledTimeline | Pin assets and revisions. Resolve capability, font, legend, gaze and cue targets. Cover the entire program with contiguous shots. |
| Rendering and revisions | Alpha layers, shot clips, ChapterCheckpoint, ChangePlan | Reuse equivalent local inputs. Reconcile uncertain paid submissions. Recompute shots that actually inherit a changed cross-chapter pose. |
| Review and delivery | QAReport, ExportManifest, FinalPackage | G3 releases full rendering. G4 binds master and QA. G5 binds the file manifest. Keep draft watermarks and outstanding issues. |

Writes carry `project_id`, `expected_version` and `idempotency_key`. SQLite transactions record revisions, events and dependency edges. Write artifacts to temporary files, verify and move atomically on the same filesystem before indexing. On startup reconcile incomplete files, lost jobs and missing artifacts. Retain prior hashes. Engines may use authorized, registered assets in the current project. Authenticate human reviewers through the host session.

## 3 · Two durations and two cuts of one topic

| Property | 1–3 minute short | Roughly eight-minute program |
| --- | --- | --- |
| Timing | 60–180 s, default 180 s. Exact 60/120/180 s gives 1,800/3,600/5,400 frames. | Target 480 s or 14,400 frames. The working 450–510 s window is 13,500–15,300 frames. |
| Editorial unit | One question, one mechanism, one example or boundary and a closing answer. | One main question, related chapters, a running example, a stable legend and explicit chapter boundary states. |
| Sample | Cache example, 14 shots. `[240,900)` totals 22 s and includes the host and request diagram. | Order example, seven chapters and 34 shots. `[0,180)`, `[5580,5880)` and `[7950,8190)` total 24 s. |
| Lock and revise | Lock cuts after section alignment and watch the complete short. | Keep chapter entry/exit states, sound reference, boundary frames and checkpoints. Play the full master at G4. |
| Delivery frame | Both profiles default to 1920×1080 landscape, 30 fps, 48 kHz. Portrait needs a separate layout and safe area. | Same defaults. Derive chapter markers from the final compiled frames. |

Two versions of one topic each get their own project ID, script, duration and approvals. Register sources, approved host and base diagrams in each project to reuse underlying hashes. The short drops secondary argumentation and rewrites the opening and ending. The long develops the case and its boundary conditions. An exact 120 seconds means 3,600 frames. Use a range when the request says “roughly eight minutes.”

## 4 · Sample timing, word cues and Chinese lip sync

1. Record or import each speech section as 48 kHz PCM WAV. Retain channels, original text, dictionary, sample count and local origin. Add the section’s master start to timestamps reset by chunking. Account for breaths, pauses and end holds.
2. For each word retain `section_id`, `word_id`, `[start_sample,end_sample)`, confidence and a manual-correction flag. Distinguish repeated words by ID. A cue points to ordered word IDs. Report the cue if a word, revision or section fails to resolve.
3. Round shared boundaries using `(sample + 800) // 1600`. Sample 2,399 maps to frame 1, and 2,400 to frame 2. Half-open shots cover the timeline without gaps or overlap. At the end, `(samples + 1599) // 1600` includes the last real sample. Record up to 1,599 padding samples.
4. Adjacent words may round to the same frame. Preserve their original anchors and use the stress or blended viseme curve for that frame. Reject negative shot lengths. Requantize shared boundaries after speech edits and generate subtitle milliseconds from the same absolute frames.
5. Map phonetics, stress and pauses to registered mouth shapes. Manually mark b/p/m lip closure, rounded lips, open mouth and silence. Calibrate transitions with the actual rig and voice. Use at least 100 anchors and report median and P95 absolute offsets, including names and mixed-language subsets. The initial 80/150 ms goals require calibration on real footage.

## 5 · Character performance, diagrams and image quality

The character pack includes original front/limited side references, layered PSD, rig, expressions, gestures, visemes, parameter limits and usage records. The director specifies supported semantic actions, such as pointing to the blue card while explaining it. Resolve the target in the scene graph before mapping the gesture to an approved angle. For an unreachable target, propose a closer camera or highlight and report the shot ID. Reference images lock identity, outfit, hair clip, eye color, lighting and facing direction.

Use host, knowledge diagram and topic illustration scenes. The first recipes cover turning the gaze for a question, revealing a process with speech, and comparing two results. Record layer, bounded parameters, focal point, cue, local timing and end state. Draw Chinese text, code, amounts and arrows from structured elements. Inspect moving text boxes and caption safe areas between endpoints as well as at rest.

Calculate effective pixels from output size, crop and maximum zoom. A full-screen 1.5× push-in on a 1920×1080 frame requires at least 2880×1620 source pixels for native coverage. Inspect hair and sleeves on dark, light and checkerboard backgrounds. Define one conversion point for straight/premultiplied alpha and keep enlarged defect images. Apply grading, depth of field and motion blur only to chosen layers. Keep captions and data labels on sharp layers. Holding animation drawings for two or three frames at 30 fps yields approximately 66.7 or 100 ms.

## 6 · Baking, camera and local revisions

Bake sequentially from an approved start pose or explicitly inherited end state, using a fixed 1/30 second step for performance, physics and secondary movement. Emit alpha frames or replayable trajectories. Record rig, curves, visemes, seed, timestep and baker version. The compositor looks up a shot snapshot and local frame. Frame 0, the last frame, reverse access and concurrent consumers all read the same result.

Share stage coordinates within chapters. Move the camera between explanatory focal points. Declare a static diagram hold with its purpose and interval. Use foreground/middle/background parallax to separate depth. Give transitions handles on both shots and count each timeline frame once.

| Edit | Recompute | Reuse and review |
| --- | --- | --- |
| Caption color | Subtitle appearance, affected composites and media QA | Reuse research, voice, alignment and character layers. Reopen G3 if its sampled media hash changes. |
| One expression | Character layer, composite and successors that explicitly inherit the new end state | Reuse independent diagrams and audio. |
| Chapter 4 shortened by 10 s | That chapter’s voice, alignment, affected lips and absolute assembly | Boundary moves from 8,100 to 7,800. With no redistribution the master is 470 s. Later local layers can hit the cache. |
| A fact or data value | Source, claim, chart and related narration | Reopen the affected subset of G1–G5 according to evidence, script and media hashes. |

On the same machine, lock engine, fonts, seed and color settings to compare RGBA pixels. Across hardware or lossy encodings, retain decoder environment and diff reports and first calibrate a tolerance on samples. Parallelize independent shots. Record actual graphics backend and sample. Expose a software fallback with measured performance and verify deployment settings on the target machine.

### Migration for existing projects

| Existing representation | Planned extension | Compatibility and acceptance |
| --- | --- | --- |
| `VisualCue.at_local_frame` fixes a local shot frame. | T07 adds an authoring choice of a fixed frame or a specified section, word ID, word start/end and offset in frames. | Replay the two existing examples as fixed frames. For a word cue, convert the aligned sample to absolute frame, subtract shot start and add offset. Emit one local integer in the compiled form. Missing words, double triggers and out-of-range results identify shot and field. A07. |
| Chapter `continuity_in/out` is prose. A checkpoint already has `continuity_state_hash`. | T08/T09 store a versioned boundary snapshot of pose, stage coordinates, legend, sound reference and any inherited end state. | Preserve the director’s notes. Verify the actual snapshot hash on recovery. If an old project has no snapshot, rebuild from the nearest verified shot or chapter start. A08, A09, A12. |
| AssetCatalog and capabilities already hold asset references, angles and actions. | T06 binds real art, rig, ranges, reference images and edge tests on three backgrounds. Record rights and hash per artifact. | Retain old planning examples. Verify actual assets before baking. A changed rig invalidates its affected character layers and triggers review of the same poses. A06, A11. |

First write replay tests for both old examples and one word-triggered example. Extend the authoring schema in a new version, retain originals and revision history, and save migration output as a new revision. T06–T09 own their respective structural changes.

## 7 · QA, budgets and optional inserts

Preflight checks contracts, references, capabilities, fonts, safe areas and timing. Media QA inspects frame order, undeclared black frames, single-frame flashes, long freezes, missing audio and endpoints. A motion heat map prompts inspection. An intentional diagram reading hold can remain. A 3×4 contact sheet locates frames for human review, and playing the sample with sound establishes pacing and intelligibility. An independent visual reviewer may add observations. Authorized humans issue G3/G4/G5.

Chargeable adapters check cache and limits, reserve funds, persist submission intent and then submit. Retain the reservation and query with the same key if the receipt is lost. Confirmed settlement produces one ledger entry. Optional hero shots take an approved driving clip, character references, a frame budget and a candidate limit. After selection, insert into the original slot and verify incoming/outgoing frames, identity and visible text. Without permission or a quote, keep the channel off and continue with the main pipeline.

C00/C01 establish contract and calibration-media evidence. A01–A13 need a connected runtime, authorized assets and replayable evidence. A14/A15 require a genuine short and three genuine long programs. Execute A16 if the optional channel is enabled. [Acceptance plan](acceptance.en.md)
