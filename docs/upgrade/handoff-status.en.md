# Handoff status and evidence

[简体中文](交接状态与证据.md) · English

Updated November 23, 2026, China Standard Time. The design handoff is ready. **T01, environment diagnostics and a 12-second clip with sound, is the first implementation task.** The architecture checker and technical media checker run locally today.

## 1 · Where to resume

| Card or case | Status | Evidence or next action |
| --- | --- | --- |
| T00 / C00 | PASS · CONTRACT | 13 skills, nine adapter contracts, ten schemas and the quality and fast-draft paths. Cache example has 14 shots/3,600 frames. Kafka to Doris has seven chapters, 34 shots/14,400 frames. |
| T00 / C01 | PASS · FIXTURE_MEDIA | Media CLI, 14 media regressions and six calibration reports. Each report binds its input bytes by SHA-256. |
| T01 / A01 | NOT_RUN, ready | First fail a diagnostic assertion for a missing font, then make a 12-second, 360-frame clip with real sound and visible motion. |
| T02–T05 / A02–A05 | NOT_RUN | Persist events, WAV files and approvals for state, review, accounting, sourced scripts and aligned voice. |
| T06–T08 / A06–A08 | NOT_RUN | Register original character and rights, compile aligned boards and verify sequential baking and random frame access. |
| T09–T11 / A09–A13 | NOT_RUN | Render shots, recover and revise, inspect frames, review with sound and export a restorable project. |
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
```

For a real master, use its actual path, for example `python3 -B evals/check_design.py --media renders/final.mp4 --profile standard8 --target-seconds 480`. Include the exact target only when required for that episode. Record the appropriate unexecuted or blocked state where original art, real speech or authorized sign-off is pending.

## 5 · Next evidence record

Create a record and its artifacts under `evidence/runs/<run_id>/<case_id>/`. This unexecuted example is for T01. Fill in the real IDs, commands, paths and status after execution and update section 1.

```json
{
  "task_id": "T01", "case_id": "A01", "run_id": null,
  "status": "NOT_RUN",
  "evidence_level": "RUNTIME",
  "environment": {},
  "commands_and_exit_codes": [],
  "input_hashes": [], "output_hashes": [],
  "observations": [], "evidence_paths": [], "reviewer": null
}
```
