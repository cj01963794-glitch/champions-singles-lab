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


## Non-negotiable model isolation and authoritative game data (user directive, 2026-10-27)
- External AI GitHub repositories (Foul Play through poke-env) are **methodology/algorithm references only**. Do not transplant their Pokémon datasets, move power tables, stats, translations, learnsets, ability/item definitions, damage rules or modified battle simulators as authorities.
- **Single source of truth** for battles is the website's pinned Pokémon Showdown **Champions** mod (currently `FORMAT='gen9championscustomgame'`, `dex=Sim.Dex.forFormat(FORMAT)`, Showdown `Battle`). Keep original `validate` / SP / base-form-to-Mega handling and other existing app-specific validation. For UI naming and localization, reuse the site's existing catalog and `korean-forms.cjs` / Showdown language data, maintaining canonical internal IDs. If external source uses different mechanics, adapt its algorithm to our mechanics rather than replacing ours.
- **Legacy is frozen.** The website currently has `<option value="legacy" selected>` and `<option value="experimental">` in `index.html`. `POST /api/duel` branches on `model`: `legacy` executes existing `simulation(...)` and `experimental` executes `engines/experimental.cjs`. Keep Legacy source and observable behavior unchanged; continue to leave Legacy the default. Changes for the sequential benchmarking project must be isolated in **Stage 1B** (experimental engine and its own new modules/tests).
- Be especially careful with **shared server helpers, catalog/translation, validation, UI, route selection, and dependency versions**: editing these can silently alter Legacy despite separate model names. Do not touch them unless unavoidable; if unavoidable, first show necessity and verify Legacy parity through dedicated regression and identical seeded outputs. Preserve the public site's Legacy selector and result rendering.
- For each external technique: study license, dependencies, ability to work with existing Showdown mod and Stage 1B interface, benchmark against current Stage 1B and Legacy with equal budgets, retain only improvements demonstrated on existing **and held-out** open-sheet 1v1 cases. Do not import current or planned 2v2/3v3 team switching, hidden opponent sample datasets, or self-play infrastructure prematurely.
- No autonomous deployment or change to Legacy just because a reference repository has a newer/fast engine. Record test limits explicitly. This directive does not itself authorize implementation/deployment.


## Override: replace old Experimental entirely; Legacy strictly immutable (2026-10-27)
**This section overrides any earlier instruction to enhance, maintain, benchmark against or incrementally inherit the old Stage 1B engine.**
- `model:'legacy'` is **absolutely immutable** unless the user separately and explicitly authorizes changing it. Do not modify its implementation, default selection, response or any common code/dependency/data in a way that changes Legacy behavior. Do not make an exception for convenience: request explicit permission instead of touching Legacy.
- The **existing** `model:'experimental'` implementation (current `engines/experimental.cjs` strategic plan generation and its old planner dependencies) is **rejected/discarded**, not an asset to improve or preserve. On the user's next explicit implementation order, **replace its internal decision engine from scratch** based first on the Foul Play method. Keeping the HTTP discriminator `model:'experimental'` and user-facing Stage 1B model slot is intentional; do not create a third model slot or change Legacy.
- Preserve existing site's Showdown Champions format, canonical Dex/move stats/abilities/items, input/sample interface and Korean localization. Reuse only *external AI algorithms/methodology*, no third-party game database.
- For staged testing, compare the new Stage 1B candidate against known cases and Legacy **read-only** as control; the rejected old Experimental is **not** the baseline to beat and its heuristics/plan generator are not to be reintroduced as patches. Preserve its historical source in Git history only, not as the new architecture.
- This message clarifies intended implementation location; it **does not yet order the implementation or deployment**.
