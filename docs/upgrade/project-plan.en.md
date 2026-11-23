# AI Animation Studio upgrade project plan

[简体中文](项目计划书.md) · English

Design baseline v1.1, November 19, 2026. Audience: the project owner and the model implementing the production system.

## Goals and handoff

Build an editable Chinese knowledge program with traceable sources and one original anime host. A solo creator supplies a topic, references or script, reviews research and narration, watches a sound sample, reviews the master and confirms the export. The 1–3 minute and roughly eight-minute profiles share character assets and a timebase.

The handoff includes the [upgrade design](design.en.md), [TDD execution plan](tdd.en.md), [acceptance plan](acceptance.en.md) and [model prompts](handoff-prompts.en.md). Completed offline work is recorded in the [evidence index](handoff-status.en.md). Start production implementation at T01.

## Scope and decision owners

| Area | In scope | Owner and decision |
| --- | --- | --- |
| Content | Topic breakdown, sourced claims, spoken sections, pronunciation, both durations, edits and revisions | Content owner reviews G1/G2. Return conflicts with original source locators. |
| Original art | One host with fixed costume, limited angles, expressions, gestures and three scene types | Art delivers original drawings, PSD, rig, capability list and usage scope. Owner reviews samples. |
| Production system | Local Studio, project API, controlled adapters, alignment, shot baking and composition, durable jobs, caching and budget | Implementer supplies code, red/green records and assets. QA independently replays them. |
| Delivery | MP4, SRT, WAV, editable project, sources, chapter markers, approvals, costs and QA | Humans review G3/G4/G5 and verify the package against the approved hashes. |
| Optional channel | Generated inserts with a clear narrative purpose. Disabled by default. Approved stills or procedural diagrams are available as fallbacks. | Owner enables the channel, supplies authorized references and sets the quote and cap. Evaluate separately at A16. |

Use Node.js/TypeScript, SQLite and a controlled local store. Bake the host sequentially, composite with Remotion and encode with FFmpeg. Multi-character physics, a bulk SaaS platform, real-time collaboration and foundation-model training are outside this release. The earlier PDF informs the design. Deployment, procurement and external submissions follow the current project’s authorization.

## Milestones, dependencies and release evidence

The original estimate is 24 weeks plus two weeks of buffer. Treat these as planning assumptions. Advance by dependency and verified deliverable. Engineering milestone decisions and each episode’s G1–G5 decisions use separate records.

| Stage | Window | Required output | Release evidence |
| --- | --- | --- | --- |
| M1 Technical and art validation | W1–4 | A 10–15 second technical clip with sound at W2, a 45–60 second original-host sample and capability bounds at W4 | Reproducible technical chain, three background tests and reviewable mouth shapes. A licensed fixture can unblock the technical clip while original art awaits review. |
| M2 Editable project | W5–8 | Editable 60-second project, three scene types, stable IDs, project and review events, shot and character panels | Reopen a shot, reject an unsupported action and stale edit, inspect a prior revision. |
| M3 Topic to short | W9–12 | Sources, G1/G2, voice/import, alignment, compilation and playable short | Evidence at 60/120/180 seconds, at least one real fully reviewed episode and editable low-confidence pronunciation. |
| M4 Reliability | W13–16 | Shot/chapter cache, impact analysis, reconciliation, crash recovery and partial rerenders | One payment per intent, zero TTS calls after a subtitle-only edit, identifiable corrupt cache. |
| M5 Image quality and QA | W17–20 | Fixed shot set, geometry/frame reports, contact sheet, lip-sync calibration and decoded master | Preserve samples and reviewer notes. Replay negative cases after repair. Qualify enabled generated inserts separately. |
| M6 Continuous production | W21–24 | Three consecutive, genuine eight-minute episodes, each with an editable archive, cost and sign-off | Together they satisfy A15. At least one includes cross-chapter revision and recovery. Keep full-watch records per episode. |
| Buffer | W25–26 | Critical defect fixes and regression tests | Reassess status after collecting replacement artifacts and review evidence. |

T01 establishes a small end-to-end clip. T02/T03 cover state and chargeable calls, T04/T05 cover evidence and voice, T06 supplies production art, and T07–T09 connect compilation, baking and rendering. T10/T11 add QA, interactions and export. T12 gathers genuine episode evidence. T13 is optional. Early art and sample work can overlap engineering. The [task cards](tdd.en.md) define completion dependencies.

## Staffing, cost and risk

Estimate two engineers across Studio/services and rendering/QA, roughly 0.4 FTE of early art/rigging, and 2–4 review hours per week from the content owner. A solo implementer should re-estimate from completed cards and observed blockers. Production still needs original art and an owner’s sign-off.

Track costs by project, task, shot and provider. Cost per finished minute equals paid generation, render compute, storage and allocated art and human rework divided by actual program minutes. Record cold and warm render times, peak memory, repeated generation, cache hits and review time. With no budget configured, research from available materials, script writing and offline calibration can proceed. Paid submissions wait for a project limit.

| Risk signal | Immediate response | Evidence needed to resume |
| --- | --- | --- |
| Late original rig, broken finger or mouth at pose extremes | Run the technical chain with a licensed fixture. Return the specific parameters to art. | Revised asset, comparison images and W4 original sample |
| Actual narration misses the duration or mispronounces a term | Rewrite/rerecord locally, realign and reopen affected reviews. | New G2 revision, measured WAV, frames and section diff |
| Missing provider receipt or unclear bill | Retain the reservation and query the original business key. | Receipt, reconciliation result and unique settlement |
| A late-chapter edit rerenders the whole program | Compare local layer and absolute assembly keys. Inspect the fields used by each dependency. | Before/after cache results, real call counts and durations |
| Missing renderer, plugin, font or permission | Record capabilities and gaps in doctor, then proceed with other ready work. | Same-machine probe, real technical clip and rights inventory |

## Definition of done

The design handoff requires the files, actual offline tests, calibration report and replay of the handoff archive. Production requires A01–A15, a recorded decision for optional channels, a reopenable project, media, sources and human sign-off. Bind every PASS to a specific revision, evidence level and artifact.
