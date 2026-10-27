# Project recovery entry point

## RECOVERY CHECKPOINT — 2026-10-27 KST (read this first)
- **Candidate:** `stage1b-recovery-20261027` (from paused `stage1b-foulplay-duct-20261027`, head `445ce0d`). Original branch + `main` preserved; GitHub branch HEAD must be refreshed before next write.
- **Working test evidence:** [Actions 40523704908](https://github.com/cj01963794-glitch/champions-singles-lab/actions/runs/40523704908), 118 pass, 0 fail, 1 TODO among *selected* tests; 3 pre-existing Legacy/mock failures excluded by exact name and 4 obsolete old Experimental test files archived. This is not unfiltered green.
- **Fixed crash:** pinned Showdown snapshot and restore share `battle.log` array with live fight; DUCT simulations pushed it past 1,000-line guard, yielding “Infinite loop”. Stage 1B adapter now makes separate log copies; regression confirms no alias.
- **Legacy strictly immutable.** `server.cjs`, `index.html`, catalogs and shared game rules unchanged; Docker build tests may change but not Legacy runtime.
- **Do NOT call initial DUCT prototype strongly validated**; 130ms smoke tests produce only 8–38 search trials; setup/heal and rare counterplay unproven, win percentages not certified. No site deployment.
- **Primary recovery briefing:** `docs/STAGE1B_RECOVERY_2026-10-27.md`. Run `npm test` with pinned `SHOWDOWN_PACKAGE_PATH`, see CI for exact source SHA.
- **Single transcript:** `docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md`. Only manually committed text is recoverable, not previous conversation in full; no background per-message sync.


Established: **2026-10-27 (Asia/Seoul)**  
Repository: `cj01963794-glitch/champions-singles-lab` (public)  
Initial source-code checkpoint observed: `82f97bc033394421679f9d2ff7b9bf98dfac2907` (last checked during documentation setup).

## When a conversation becomes too long or a new chat starts
1. Read this entry point and the four companion files under `docs/`.
2. Read the **single ongoing development-dialogue log** `docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md` for new preserved dialogue. Older separate files in `docs/TRANSCRIPTS/` remain for historical links; not every ChatGPT message is automatically retrievable.
3. Verify the repository state with `README.md`, actual source/test files, and Git history.
4. Continue development from actual code, not the assistant's recollection.
5. Make a new explicit backup commit of development documentation and any available transcript after substantive sessions.


## Transcript storage rule (updated 2026-10-27)
**Do not create one backup transcript file per message/chat.** Always append further available development dialogue to existing `docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md`, with ordered dated speaker sections and clear exact-quote vs summary labeling. Use a new GitHub commit updating the same file. Previously created separate historical files remain for existing links. Not automatic live sync.

## Long-term purpose
Create a Pokémon Champions single-battle 1v1 matchup engine that tests plausible moves and multi-turn policies with correct mechanics; discovers win plans without hardcoded matchup scripts; considers the opponent's optimal or strategically rational counterplay; exposes probabilities, limitations, conditions, and reproducible sequences.

## Previously raised trouble spots
Dragonite choosing Flamethrower instead of Draco Meteor into Focus Sash Garchomp; optional Mega evolution ignored or mistimed; Indeedee using Encore before Mimikyu has acted; Floette missing long Calm Mind + Synthesis against Charizard; Mega Sceptile opting into changed typing and wrong move against Primarina; Salamence/Primarina Giga Impact lottery comparison; short-sighted boosts, moves and probabilistic planning.

## Provenance warning
A prior chat contained a numbered section titled **"5. 이걸 실제 코드로 만들 계획"**, but the full original wording was *not available to this session*. Do not reconstruct it as a verbatim quote. Preserve it if the original is provided later.

## Storage expectation
GitHub commits persist development documents and exact conversation excerpts copied there. **Not automatic live sync** and not a guaranteed full ChatGPT history export. User explicitly chose to store development-related conversation originals in this public repository, acknowledging visibility.

## Latest design status after new-chat discussion (2026-10-27)
The previously proposed small **strategy analyzer** (state-change analysis → important issue discovery → strategy generation → counterplay) was **explicitly withdrawn** after the user challenged its implementability. Only the state-difference calculations were judged straightforward; there is no substantiated general algorithm for selecting strategically important differences without falling back on costly search or hand-built heuristics. **Do not present the strategy-analyzer experiment as an agreed next implementation step.** The user strongly rejects speculative architectures and repeated case-by-case patches. Before recommending coding, provide an executable, falsifiable core algorithm and clear reasons to believe it addresses the circularity. No implementation was made. Transcript recovery: `docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md`.


## Clarified ultimate goal and staged scope (2026-10-27)

The user corrected the perceived end-goal: this is **not only a matchup calculator**. The eventual target is a **strong actual-battle decision-making AI**, progressively developed and validated.

**Current stage / hard priority:** First make a reliable, strategically strong **fully open-sheet 1-v-1 single Pokémon matchup** engine. Both movesets/items/stats are currently known, so no need to spend current development budget sampling unknown opponent sets. No claim of solved optimality until proven.

**Later, explicitly deferred:** (1) singles battles with a roster of 2 vs 2 and eventually 3 vs 3, including switching, sacrifice, predictive moves and opponent counterplay; (2) opponent build uncertainty, with a user-curated library of multiple common sets per species and weighted evaluation across those sets; (3) full actual-battle AI. Do not confuse "2 vs 2 team sizes with switches" with doubles active-battler rules absent explicit clarification.

Benchmarking priority for this **current-stage-first, long-term-strong-AI** strategy: 1 Foul Play/poke-engine; 2 battle-engine; 3 Metamon; 4 RotomAI; 5 VGC-Bench; 6 PokéChamp; 7 showdown-brain; 8 poke-env. This is a *review/test priority*, not guaranteed overall quality ranking or approval to copy code.

No shift to later-stage switching, set distribution, or large-scale self-play until open-sheet 1v1 engine has been shown reliable.

## Eight-stage external code benchmarking workflow (2026-10-27)

The user intends to direct **sequential, evidence-gated implementation / evaluation** based on 8 open-source projects: 1 Foul Play, 2 battle-engine, 3 Metamon, 4 RotomAI, 5 VGC-Bench, 6 PokéChamp, 7 showdown-brain, 8 poke-env. This is a code-inspection and benchmark sequence, **NOT** an instruction to merge all eight codebases unconditionally and not an authorization to begin coding until the next explicit user directive.

At each stage: read actual source/license/dependencies; formulate specific transplant hypotheses; keep the last verified strong version untouched as control; implement candidate separately; run existing verified and held-out open-sheet 1v1 matchups on consistent rules/CPU budget with opponent counterplay and stochastic quality; record negative findings, compute time, unresolved cases; adopt only objectively beneficial changes, or skip, revert or replace. Preserve pinned Showdown Champions mechanics; another simulator requires engine-parity verification before tactical inference. Avoid hard-coded matchup-specific corrections. Previous best verified candidate is the baseline for the next stage, not an obligation to preserve unsuccessful modifications. Distinguish approximate policy strength from certified optimum probability.

Long-term objective = strong actual-battle AI. Currently strictly open-sheet 1v1; larger singles teams, switching and user-curated hidden-set mixtures are later phases. The entire 8-project sequence may surface learning methods that are impractical to adopt in the present stage; study/record them rather than prematurely deploy.

Research notes: docs/RESEARCH_POKEMON_BATTLE_AI_BENCHMARKS_2026-10-27.md.


## User clarification: replace Experimental from scratch, never touch Legacy (2026-10-27)
**Important superseding decision**: Previous notes that referred to enhancing existing Stage 1B/Experimental or using it as the benchmark baseline are **obsolete**. The user explicitly rejects the present `model:'experimental'` implementation and wants its strategy/search code **discarded and fully replaced** by a newly developed model in the **same** Stage 1B (`model:'experimental'`) site slot. Begin from the Foul Play algorithmic method only when further implementation instructions are issued; do not inherit legacy Experimental heuristics, plan generators, or special-case patches. Git history preserves the removed implementation if recovery becomes necessary.

`model:'legacy'` must **never be modified without the user's own distinct explicit approval**. The selected-by-default Legacy source, semantics and responses are immutable; shared components must not be changed if there is any risk to Legacy, without permission. For comparisons, Legacy is read-only control. Keep original Showdown Champions mod/Dex, existing validation and the site's translation/catalog; borrow no external move/base-stat/ability/item/translation database. This directive is stronger than earlier 'if unavoidable, modify shared helpers with tests' language: do not make unapproved changes affecting Legacy. The user has not yet instructed starting Stage 1 implementation or deployment.
