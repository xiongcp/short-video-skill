# Requirements acceptance matrix

[简体中文](acceptance.md) · English

`check_design.py` checks the package and paper storyboards. Its `--media` mode decodes local MP4s frame by frame. `test_design.py` deliberately damages planning inputs. `test_media_acceptance.py` uses real encoded fixtures. The rows below retain the original requirement IDs. See the [upgrade acceptance plan](../docs/upgrade/acceptance.en.md) for fault injection, release conditions and ownership, and the [evidence index](../docs/upgrade/handoff-status.en.md) for observed results.

| Requirement | Exercise | Checkable in this package | Evidence to retain for production |
| --- | --- | --- | --- |
| E2E-01 · Topic or existing script | Start with defaults. Preserve original sections when importing a script. | Entry, contracts and two complete planning projects | Generation records, section mapping, G1/G2 decisions, playable draft |
| E2E-02 · Quality mode | Attempt voice before G2, full rendering before G3 and packaging before G5. | Forward graph contains G1–G5. Regression rejects a G5 bypass. | Host denial, tool counts, invalidated old approval hash |
| E2E-03 · Fast draft | Make a pending version within budget, then request formal export. | Draft ends at `DRAFT_READY`. A direct delivery edge fails. | Watermark, outstanding issues and valid promotion approvals |
| DUR-01 · Short | Test 59, 60, 120, 180 and 181 seconds. | Short boundaries and a two-minute, 14-shot plan | Probes at 60/120/180 seconds, narration and caption endpoints |
| DUR-02 · Long | Test 449, 450, 480, 510 and 511 seconds. Break the chapter-five start. | Long boundaries, seven chapters/34 shots and detected gap | Genuine eight-minute episode, boundary contact sheet, continuous playback |
| RES-01 · Research | Remove support for a `supported` claim. Add conflicting and stale material. | Rejects broken or absent support. Represents conflicts and qualifications. | Original locator, editorial decision and recheck time |
| SCR-01 · Script | Edit wording with a qualifier and request an exact duration. | Stable sections, claim links, chapter estimates and cues traceable to text | Script diff, timed reading and revised G2 |
| SB/CHR-01 · Storyboard/host | Reference a wrong cue, unsupported gesture and highlight beyond a shot’s end. | All three negative inputs fail. | Compile rejection, extreme-pose images, blinded character assessment |
| AUD-01 · Audio | Mix Chinese/English, numbers and pauses, and correct a term’s pronunciation. | Word anchors, sample counts, tracks, subtitles and dictionary contracts | Alignment error distribution, listening record, separate voice and background |
| EDIT-01 · Subtitle style | Change only caption color. | Revision dependency rules and ChangePlan | Logs show zero TTS, generated images/video and character bakes. |
| EDIT-02 · Shot expression | Change only the expression in `shot_001`. | Version boundaries for performance and layers | Affected shot set, cache hashes and local preview |
| EDIT-03 · Narration | Shorten chapter four by ten seconds. | Expected cut shifts from 8,100 to 7,800 frames with downstream reuse. | Rerecorded section, new SRT, duration and updated manifest |
| FAIL-01 · Unknown paid receipt | Drop acknowledgement after submission. | ToolResult rejects `unknown` combined with automatic retry. | Reservation, lookup and actual bill with one charge |
| FAIL-02 · Recovery | Stop a worker mid-chapter four, then resume. | Job and ChapterCheckpoint contracts | Verified shots reused, corrupt item rebuilt, matching chapter end frames |
| QA-01 · Missing media | Remove an asset reference, then simulate a missing font or corrupt audio. | Broken layer reference regression | Blocking QA report, frame numbers, probe and repair |
| SEC-01 · Tool and budget limits | Supply embedded instructions, an unauthorized call or excess budget. | Permission table, video off by default and invalid candidate-count case | Host denial, unchanged ledger and audit record |
| EXP-01 · Editable export | Change a G5 manifest item and try packaging. | Manifest, target hash and receipt contracts | Rejected old signature, file-by-file verification after extraction, reopened project |

For every sample, record character, rig, voice, fonts, model and renderer versions. Re-read the same fixed frames from one snapshot and compare pixels and audio samples. For consecutive production, report success, cache hits, human rework time, actual spend and cost per finished minute per episode. Keep the sample size and measurement definitions alongside the report.
