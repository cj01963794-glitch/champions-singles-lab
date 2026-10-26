# Pokémon Champions Matchup Lab — continuity instructions

This repository stores the code, design reasoning, test cases, development chronology, and available conversation transcripts. **This GitHub repository is public.**

## At the start of any development session
1. Read `docs/PROJECT_MEMORY.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TEST_CASES.md`, and `docs/DEVELOPMENT_LOG.md`.
2. First read the **single ongoing development-dialogue log** `docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md`; review older files under `docs/TRANSCRIPTS/` only if historical exact wording is needed.
3. Inspect `README.md`, actual source and tests, and latest Git commits to verify status. Notes can be stale.
4. Distinguish user expectations, proposals, implementations, observed behavior, and confirmed tests.
5. Never invent missing transcripts or the unrecovered exact historical section "5. 이걸 실제 코드로 만들 계획".

## During and after substantive changes
- Record accepted design choices, rejected alternatives, and rationale in `docs/DECISIONS.md`.
- Update `docs/ARCHITECTURE.md` when architecture or intended algorithms change.
- Update `docs/TEST_CASES.md` when new matchup examples are reported or verified, with precise spreads and outcomes **only when known**.
- Append to `docs/DEVELOPMENT_LOG.md` with date (KST), files touched, reason, tests actually run, remaining issues, and commit.
- Preserve development dialogue verbatim in `docs/TRANSCRIPTS/` only from text available in the working session; clearly mark excerpt boundaries, omissions, and unverified recollections. Record dialogue summaries separately; never label paraphrases as raw transcripts.
- **Single-file append policy (user request, 2026-10-27):** Do not create a new transcript backup file per turn or chat. Append new available user/assistant development dialogue in chronological sections (date KST, speaker, exact text when available, and omissions clearly marked) to **`docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md`** using `fetch_file` plus `update_file` with the latest blob SHA. This remains the canonical rolling transcript even on later dates. Keep previously created transcript files to preserve old links; do not re-copy old entries each turn. Update other docs only when substantive decisions/code change.
- Always state whether a GitHub write actually succeeded and cite the commit; never claim an automatic background backup.

## Boundaries
- A new chat is not a live event stream that auto-commits to GitHub. An assistant with connected GitHub tools must perform each write.
- User authorized public storage of development-related original dialogue on 2026-10-27. Still avoid tokens, passwords, private third-party details, and unrelated sensitive data.
- Do not present heuristic or sampled policies as mathematically proven global optima.
