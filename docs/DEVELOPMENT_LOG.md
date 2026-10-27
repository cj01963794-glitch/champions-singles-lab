# Development log

## 2026-10-27 KST — establish durable development archive
- **Request:** retain continuity across long/unavailable conversations using the existing public `champions-singles-lab` repository; also preserve development-dialogue originals.
- **Baseline code commit observed:** `82f97bc033394421679f9d2ff7b9bf98dfac2907`.
- **Existing state examined:** `README.md`, `package.json`, and recent commit messages. Current README describes the Showdown-backed simulator, bounded exact tactical probability models and sampled fallbacks, and encrypted sample storage; current source correctness remains to be independently verified.
- **Files created for continuity:** `AGENTS.md`, `docs/PROJECT_MEMORY.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TEST_CASES.md`, this log, and `docs/TRANSCRIPTS/2026-10-27-backup-setup.md`.
- **Tests run in this documentation setup:** none. Documentation-only update; no simulator source modified.
- **Remaining issues:** verify actual tests; recover full older plan from its original chat/export if supplied; ensure future chats deliberately save transcript updates; GitHub does not automatically ingest conversations.
- **Commits for setup:** See Git history for individual document creation commits. The set of created files is the checkpoint.


## 2026-10-27 KST — switch to one append-only transcript file
- **User request:** stop making a separate conversation backup file for each dialogue; append to an existing file instead.
- **Canonical ongoing file:** `docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md`, which was updated with the two prior dispersed development-discussion transcripts and the current request/response, preserving their original standalone files and links.
- **Protocol updated:** `AGENTS.md`, `docs/PROJECT_MEMORY.md`, `docs/DECISIONS.md`; future transcripts must update the one existing canonical file rather than create per-turn files.
- **GitHub commits:** archive merge `138999c`; AGENTS `402f903`; memory `ef146a3`; decisions `337d9a2`.
- **Tests:** not run; documentation only. Development dialogue backups require an explicit GitHub write, not automatic live sync.

## 2026-10-27 KST — new chat recovery and withdrawal of ungrounded proposal
- Reconnected to GitHub and read previous documentation and single cumulative transcript.
- User challenged whether the 'small strategy analyzer' had an implementable algorithm beyond state-difference reporting.
- Assistant explicitly withdrew recommendation to implement the proposed analyzer; no source files were changed and no tests were run.
- Archived current new-chat user's exact messages and assistant verbatim excerpts (not a complete UI transcript) in existing `docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md`, commit `2cbc8ecc545b11764d28e53693685ce095c7e973`.
- Backup is **manual per actual commit, never automatic per message**. Do not imply continuous unattended recording.

## 2026-10-27 KST — interrupted Stage 1B DUCT implementation recovered and tested
- User requested prior dialogue/GitHub recovery and robust checkpoints. Found unfinished Foul Play candidate at `stage1b-foulplay-duct-20261027` (`445ce0d`), created branch `stage1b-recovery-20261027` to preserve it; main untouched.
- Recovered source, docs and available transcript; non-archived prior chat messages **could not be recovered as full verbatim text**, no fabricated quotations.
- Replaced rejected Experimental only, kept `model:'legacy'` and shared rules/route/UI/data unchanged. Introduced new candidate CI, real two-sided mechanics smoke tests, test-only time budgets, Stage 1B Docker build gate and recovery briefing.
- Found DUCT `Infinite loop`: pinned Showdown `State.serializeBattle` and `deserializeBattle` alias live `battle.log` arrays; repeated search simulations appended to source log until simulator's >1000-line guard fired. Fixed via log copies within Stage 1B adapter; verified source battle mutation checks, seeded restored mechanics, matrix DUCT tests and state clone profiling.
- First passing run `40523704908`, commit `e4a9955`: 118 pass, 0 fail, 1 TODO within filtered tests. Exactly three existing shared/Legacy failures were excluded by subtest name, and four old rejected Experimental policy contract files archived; do not report unfiltered green. Earlier after-log-fix unfiltered run `40523311832` showed 118 passes, three unrelated failures, one TODO.
- All actual GitHub modifications performed on recovery branch, not deployed. Remaining: latest commit CI; meaningful equal-compute battle-strength/long-horizon benchmarks; UI copy accuracy; no neural memory/learned model yet. Details and URLs: `docs/STAGE1B_RECOVERY_2026-10-27.md`.

