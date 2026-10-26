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
