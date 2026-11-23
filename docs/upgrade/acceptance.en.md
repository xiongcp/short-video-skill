# Acceptance plan and release decision

[简体中文](验收计划.md) · English

This plan covers 1–3 minute shorts and programs targeting eight minutes. It extends the [requirements matrix](../../evals/acceptance.en.md). See [current status and evidence](handoff-status.en.md) for working commands and recorded results. For intentional reading holds, silence or black frames, the director records the shot, frame range and reason.

## 1 · Reviewers and evidence levels

| Level | Evidence inspected | Conclusion supported |
| --- | --- | --- |
| CONTRACT | Versioned schemas, policies, paper boards, positive and negative cases | The checked contracts agree with the design. |
| FIXTURE_MEDIA | Reproducible patterns or color fields and tones, encoded and decoded as MP4 | The media checker works on the tested files. |
| RUNTIME | Actual project API, database, Studio UI, cache and workers running in a recorded environment | A particular runtime behavior meets its criteria. |
| PRODUCTION / HUMAN | Genuine sources, approved host and voice, complete program and authorized reviewers | A particular episode revision passed its identified human gate. |

Assign a `run_id` to each run. Record PASS, FAIL, BLOCKED or NOT_RUN per case. FAIL means an executed check missed its requirement. BLOCKED identifies a concrete missing dependency. NOT_RUN means the case has yet to run. Identify skipped checks, fixtures and human observations in the evidence record. A PASS needs evidence at the required level. The release decision is separate from each case result.

## 2 · Offline baseline and media commands

Run from the project root with the dependencies in `evals/requirements.txt`. Media inspection requires ffprobe, and fixture generation requires FFmpeg with libx264 and AAC. Supply the actual export path when measuring an episode.

```sh
python3 -B evals/check_design.py
python3 -B -m unittest discover -s evals -p 'test_*.py' -v
python3 -B evals/check_design.py --media renders/final.mp4 --profile short --target-seconds 120
python3 -B evals/check_design.py --media renders/final.mp4 --profile standard8
```

The third command checks exactly 120 seconds. The fourth checks the 450–510 second window. Add `--target-seconds 480` for an exact eight-minute agreement. The media report is JSON. Exit 0 means its technical checks passed, 1 identifies a media or decode failure, and 2 requires fixing arguments or the environment. Pair technical results with review records, an evidence index and an archive manifest.

| Case | Action and criterion | Evidence | Recorded status |
| --- | --- | --- | --- |
| C00 | Run the architecture checker and 11 original regressions. The two-minute plan has 14 shots/3,600 frames and the long plan has seven chapters, 34 shots/14,400 frames. Graph and contract checks pass. | CONTRACT, both planning projects and command log | Tested. See handoff status. |
| C01 | Decode locally generated MP4s. Check container, dimensions, codecs, pixel format, 30 fps spacing, 48 kHz audio, coverage and duration. Inject half-frame jitter, remove audio or substitute proxy resolution and require rejection. | FIXTURE_MEDIA, TDD logs, binary hashes and JSON reports | Tested. See handoff status. |

Expect one program video track, excluding attached cover art. Select the default audio track or the first if none is preferred. Derive the half-open time range from actual decoded frames. Frame `i` should be at `i/30` seconds, allowing time-base rounding. Declared and decoded audio endpoints may differ from video by at most one video frame to accommodate AAC padding. Compare each audio block’s timestamp step with the previous block’s sample duration. The tolerance is the larger of one audio sample and one audio time-base tick. Each report includes the media SHA-256. [FFprobe manual](https://ffmpeg.org/ffprobe.html)

## 3 · Runtime and content cases

A01–A16 start at NOT_RUN for the implementation handoff. Apply the same pass conditions to a revised artifact. Generate, register or obtain the fixtures described for each case.

| Case / card | Setup, action and fault | Pass condition and minimum evidence |
| --- | --- | --- |
| A01 Environment and vertical slice · T01 | Run doctor on a new project. Capture engine, fonts, decode/encode, graphics backend and a licensed host fixture. Make a 10–15 second sound clip with a local WAV, host and diagram. Remove the test font and retry. | Playable output has the timeline’s frame count. Negative case names the missing font or capability. Save doctor JSON, probe, first/middle/last frames, WAV and environment lock. Use the technical clip’s own time range. |
| A02 State and permissions · T02 | Repeat an event, reuse its key with a new payload, send a stale revision, forged reviewer, expired G2 and direct draft export. Supply valid decisions through an authenticated human test session. | Replay creates one event. Conflicts return the current revision. Unauthorized call count is zero. G4 binds media and G5 binds the manifest. Save SQLite records, audit and UI receipts. |
| A03 Budget and unknown receipt · T03 | Set a 100-unit cap. Concurrently reserve 70 twice for different intents. Drop the receipt after provider acceptance, restart and reconcile. | At most one 70-unit reservation leaves 30 available. UNKNOWN retains its reservation. Query the original key and settle exactly once. If lookup is unavailable, keep pending verification. Save request counts, ledger and recovery logs, and identify simulated providers. |
| A04 Sources and script · T04 | Start from the cache topic or an existing script. Supply an expired source, two contradictory sources and an unsupported assertion. Ask to shorten a section during review. | Trace original section IDs. Every key claim has status, locator and qualifications. Remove or qualify unsupported conclusions and obtain human G1/G2 decisions. Save source cards, script diff and approved hashes. |
| A05 Recording, alignment and lips · T05 | Import real Chinese speech including b/p/m, English abbreviations, numbers and pauses. Correct one pronunciation and one anchor. Test chunk timestamps reset to zero. | Retain original samples, dictionary/voice versions and correction origin. Rerun the affected section, updating captions and visemes together. Use at least 100 hand-labeled anchors. Report median and nearest-rank P95 absolute errors (sorted rank `ceil(0.95n)`). Owner records calibration against the initial 80/150 ms goals. |
| A06 Original art and style · T06 | Render the same host on dark, light and checkerboard backgrounds. Cover front/approved side angle, closed lips and maximum reach. Enlarge diagram data with an intentionally undersized background. | No visible hair halo, sleeve seam, identity drift or wrong data. Identify the undersized asset. Record revisions, rights, asset index, references, three-background screenshots and human decision. |
| A07 Direction and compilation · T07 | Compile aligned copies of both example boards. Inject repeated words, sample 2399/2400 boundaries, dangling cue, out-of-range local highlight, unsupported action and dependency cycle. | Boundaries map to frames 1/2. References resolve and frames continuously cover the program from zero. Negative cases identify shot and field and block production compilation. Save DSL, frozen timeline and rejections. |
| A08 Bake and render determinism · T08 | With an approved rig, wave, close the lips and turn the head. Request last/first/middle frames, then change worker order. | In a pinned environment each local frame has the same lossless RGBA hash. Inheriting shots use the preceding end-state hash. Independent shots render alone. Save parameters, seed, pixel comparisons and boundary frames. |
| A09 Crash and cache · T09 | Interrupt long chapter four at temporary write and after rename before indexing, and corrupt an indexed artifact. Compare restart to a clean full run. | Resume from a verified checkpoint. Verified shots add zero generation calls. Rebuild corrupt output. Compare final timeline, shot contents and audio samples. Save old/new cache keys, job events and chapter checkpoints. |
| A10 Automated QA · T10 | Inject a caption collision mid-motion, a one-frame white flash, unintended black, long freeze and missing audio. Include a declared static reading hold. | Locate hard defects by shot and absolute frame range. Retain the reason for the planned hold. A 12-cell timecoded contact sheet locates shots, and per-frame checks catch the flash. Save frames, waveform, bounding boxes and report. |
| A11 Subjective quality and sample · T06/T10 | Compare baseline and upgrade with identical script, voice and specification. Randomize A/B order and play 20–30 seconds with sound. Assess identity, performance, diagram, legibility and pacing. | Record improvements and regressions by shot and reason. Close required fixes before a human signs G3. If historical footage is missing, label any newly created controlled baseline and leave historical comparison untested. Save both clips, contact sheet and notes. |
| A12 Revision scope · T09 | Separately recolor captions, change one expression and shorten chapter four by ten seconds. Capture original shot hashes, calls and G1–G5. | A caption change triggers zero TTS, image/video generation or character bakes. The expression affects the shot and explicit end-state dependents. Without redistribution, the chapter ends at frame 7,800 and the master lasts 470 s. Save ChangePlan, diff and actual calls. |
| A13 Studio, sign-off and archive · T11 | In the UI, verify one source, change a cue, play the sample and pass G3–G5. Change one manifest byte before packaging. Unpack a valid archive into a new directory and reopen. | The old signature fails on the changed manifest. Verify original hashes for MP4, SRT, WAV, sources, assets, QA, ledger and approvals. Reopen for shot-level editing. Save browser record, manifest, receipt and restore report. |

## 4 · Episode and optional-channel qualification

For A05/A10 retain the isolated voice, final mix and measured intervals. A10 reports integrated loudness (LUFS), maximum true peak (dBTP) and locations of unintended silence. Register each delivery target’s acceptable values and version before G3. Flag any missing target for confirmation. At A11 listen to a dense diagram and a pause on both phone speakers and headphones. Record masked words, mispronunciations and harsh joins. The calibration tone verifies the media track.

At A11 evaluate each shot for five things: face and costume continuity, mouth/gesture timing on the stressed word, pointing at the correct diagram element, mobile reading time, and whether the explanation remains clear across the cut. Mark improved/unchanged/regressed with timecodes in both versions and a reason. The owner assigns required fixes or accepts regressions with reasons. Close all required fixes before G3. Where no comparable historical clip exists, assess this version’s usability and leave historical improvement open.

| Case / card | Action | Pass condition and evidence |
| --- | --- | --- |
| A14 Short production · T12 | Produce decodable 60-, 120- and 180-second outputs. At least one uses a real topic, sources, voice and original host through the full workflow. | 1,800/3,600/5,400 frames respectively. The real episode also has G1–G5, complete playback, a reopenable archive and actual costs. Label evidence levels of the other two. Keep probe, WAV/SRT and sign-off. |
| A15 Long production · T12 | Produce three consecutive, substantively distinct eight-minute episodes with the same approved host. Restart and revise across a chapter boundary on at least one. | Each meets its agreed duration window. An exact 480 s is 14,400 frames. Each has boundary continuity, complete master, human playback, per-episode cost, cold/warm times and archive restore. Keep three independent `run_id` values. |
| A16 Optional generated insert · T13 | Request an insert under defaults, then explicitly enable an authorized channel with a shot cap and a driving clip. Exercise over-budget, UNKNOWN and fallback. | Default added paid calls are zero. Check selected candidate entry/exit frames, identity and length. Refuse over-cap submissions, settle UNKNOWN once and review the procedural fallback. Without a real channel, record NOT_RUN or BLOCKED as applicable. |

## 5 · Evidence and release signatures

Save formal evidence under `evidence/runs/<run_id>/<case_id>/`. Record case, card, run, status and level, tool/environment versions, commands and exit codes, input snapshot or media hashes, findings, issues, relative evidence paths and reviewer or outstanding review reason. Keep credentials, authentication headers and private source material out of logs.

Blocking issues include missing assets or references, serious factual errors, duration outside agreement, hard decode or safe-area defects, stale approvals and unreconciled duplicate charges. Record cause, owning card, repaired revision and retest case. Attach art and pacing feedback to frames for the content owner. G4 reviews the whole program with QA. G5 checks the manifest. Production qualification requires A01–A15 plus actual human reviews. Record the decision on optional A16 separately.
