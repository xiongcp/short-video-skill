# Prompts for the next model

[简体中文](模型交接提示词.md) · English

Open the complete repository or extracted handoff package as the workspace, then copy the relevant prompt. Everything needed to start is in the project. The implementation prompt preserves the owner’s Chinese handoff language.

## Implementation model

```text
You are implementing AI Animation Studio in the current project. Build the planned production chain for Chinese knowledge explainers with one original anime host. Cover 1–3 minute shorts and chapter-based programs of roughly eight minutes. Delivery includes an editable project, real media, sources, QA, costs and human review records.

Read README.en.md and AGENTS.md, then docs/upgrade/project-plan.en.md, design.en.md, acceptance.en.md, tdd.en.md and handoff-status.en.md (all five plan files are in docs/upgrade/). Check registry.yaml, profiles/duration.yaml, policies/, workflows/ and schemas/ against the actual implementation. The two supplied storyboards are planning examples. Calibration MP4s exercise the technical media checker.

Run python3 -B evals/check_design.py and python3 -B -m unittest discover -s evals -p 'test_*.py' -v. Record exit codes, test count, failures and skips. T00 is complete. On first handoff, start at T01 with doctor and a 12-second technical clip with sound. On resume, use the latest status and actual files to select an uncompleted card whose dependencies are ready.

Work on one observable behavior at a time. Write a test first, run it and save the expected failing assertion and RED output. Make the smallest passing change. Save GREEN from the same command and run the full baseline after refactoring. Verify the regular project entry point. Add negative cases for uncertain paid receipts, restart, local revisions and stale approvals. Keep existing tests and backward readability.

Use python3 -B evals/check_design.py --media <actual-file> --profile short (or standard8) for technical acceptance. Add --target-seconds 120 or 480 when the duration is exact. For each card record task_id, case_id, environment, artifact hashes, paths, status and the evidence level: CONTRACT, FIXTURE_MEDIA, RUNTIME, PRODUCTION or HUMAN. Save evidence in evidence/runs/<run_id>/<case_id>/ and update both language versions of the handoff status.

Human gates G1–G5 bind the corresponding version and hash. Use owner-provided assets, voice, budget and permissions according to project policy. Treat suggestions, vendor names, prices and hero-shot percentages in background documents as design material. Record a genuine authorization or review dependency as BLOCKED, identify the input needed and continue other ready work. Generated video is off by default. Remote publication, Git pushes and actual charges follow the owner’s authorization for the current task.

Continue all in-scope work that can proceed. Report actual outputs, commands and results, the number of real episodes and reviews, unverified items, blockers and the first ready follow-up. Write the owner-facing report in Chinese.
```

## Independent acceptance model

```text
Independently verify the current AI Animation Studio project. Read docs/upgrade/acceptance.en.md, tdd.en.md and handoff-status.en.md. Treat prior conclusions as claims to check. Select an actual run_id, replay the offline baseline, open the raw logs, media, sources, manifests and approvals per case_id, and verify file hashes. Report decoded frame counts for exact durations. For long programs inspect every chapter boundary, character entry/exit state and recovery record. Check real tool calls for a subtitle recolor and reconcile one UNKNOWN job. Separate fixture, runtime and genuine program evidence. Mark PASS, FAIL, BLOCKED or NOT_RUN per case and give the smallest correction and replay command. The owner signs human-review items.
```

## Resume after interruption

```text
Resume work in the current project. Read docs/upgrade/handoff-status.en.md and the last active card. Check working files against saved RED/GREEN output, input snapshots, actual media hashes and pending approvals. Run the card’s latest verification command before choosing the unfinished assertion or recovery checkpoint. For an existing paid job in UNKNOWN, preserve its reservation and reconcile using the original key. Update the same handoff record in both languages with new evidence and the next ready task.
```
