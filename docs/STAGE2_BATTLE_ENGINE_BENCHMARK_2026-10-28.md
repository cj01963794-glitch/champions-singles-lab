# 2순위 battle-engine 적용 검토 결과 — 2026-10-28 KST

## Source audit and selection
- Source: [eykzhang/battle-engine](https://github.com/eykzhang/battle-engine) (MIT, source inspected; no third-party runtime/data copied).
- Read actual repository `README.md`, `battle_engine/set_search.py`, `battle_engine/search.py`, `battle_engine/benchmark.py`, `battle_engine/win_prob.py`, `LICENSE`.
- **Relevant methodology, NOT a direct engine port:** independent search instances' root visit aggregation, confidence-interval benchmarks, explicit "negative gate" decisions, and accounting for nonterminal outcomes. This project's actual source aggregates sampled **hidden opponent sets**, whereas OUR current 1v1 context is fully open-sheet; we therefore used independently seeded complete-Showdown search trees of the **same known state**, serially under an identical wall-clock budget. This is an independent conceptual adaptation, not the author's implementation, and serial roots are NOT parallel threads.
- **Explicitly not transferred:** hidden-set sampling, separate poke-engine physics/data, stale 2-ply direct-damage policy, PPO neural checkpoint or C++ incomplete forward model. Author documents how incomplete simulations and deeper lookahead can underperform.
- Preserve `model:'legacy'`, pinned Showdown rules `gen9championscustomgame`, site data/translation, original `main`, and Stage 1B exact-DUCT production default.

## Candidate and evaluation code
- `engines/stage1b/root-ensemble.cjs`: experimental-only `independentRootEnsemble(B,deps,{roots:3,budgetMs,...})`. Three independent exact-state DUCT searches on the SAME live game state, with independent chance streams, no mutation of source state and visit-count-weighted aggregate root policies. Shares wall-clock and iteration budget; all policies are heuristics, never reported as win probability.
- `engines/stage1b/benchmark-metrics.cjs`: independent JS Wilson 95% score CI implementation plus honest bookkeeping for wins/losses/draws/**unresolved**; unresolved excluded from resolved-only Wilson CI but possible win-rate range is separately displayed. CI is descriptive only since paired matches are not necessarily independent observations.
- `test/stage2-battle-engine-methods.test.cjs`: mathematics/edge cases, nonmutation, legal actions and normalized root policy.
- `scripts/stage2-benchmark.cjs`: **eight predeclared matchups**, three previously used + five separated evaluation cases, both orientations and two actual battle seeds, both role assignments, with independent per-agent choices using pinned Showdown. 64 games, 120ms per agent per turn, capped at 10 turns. This is NOT a 1.8s production-policy study or a multi-seed proof of dominance.
- CI appends a new Stage 2 gate after preserving earlier Stage1B tests, diagnostics and head-to-head.

## Observed CI results, not projections
- [GitHub Actions run 40536717094](https://github.com/cj01963794-glitch/champions-singles-lab/actions/runs/40536717094), code revision `f8a57aba8f798f25fef66c3a37d0c05f8e0cd0f1`: **success**; 123 selected regressions passed, 0 failed, 1 TODO; 2 isolated Stage 2 tests passed; 34 replayable historical orientations checked; Legacy/shared-file immutability check passed. The selected suite still excludes old known 3 red mock/Legacy subtests and 4 retired previous Experimental API files: not unfiltered green.
- **Known cases** (3 pairs x 2 sides x 2 battle seeds x 2 assignments = 24 games): ensemble **9 wins**, control exact DUCT **13 wins**, **2 unresolved**.
- **Held-out cases** (5 pairs x 2 sides x 2 seeds x 2 assignments = 40 games): ensemble **19**, control **21**, **0 unresolved**.
- **Overall** 64 games: ensemble **28–34** exact control, with **2 unresolved**; on 62 terminated games ensemble **45.16%**, Wilson descriptive 95% CI **[33.42%,57.47%]**. These experiments lack statistical power to establish a stable difference; they do not support promotion of root aggregation as a strength improvement.
- Binary counts and outcome/agent choice recorded in CI log (`[STAGE2-GAME]`, `[STAGE2-COHORT]`, `[STAGE2-OVERALL]`). Ties and unfinished games were not silently counted as wins.
- No live website deployment, no modification to Stage 1B default or Legacy, and no imported external Pokémon rules/data.

## Decision and next phase
**Retain battle-engine's benchmark methodology and opt-in independent-root module, but DO NOT switch Stage1B runtime to it.** Under the tested limited computational budget it failed the improvement gate. The exact-state DUCT remains the conservative control for any future third-priority Metamon comparison. Worthwhile transfer here was reproducible, adversarial and uncertainty-aware evaluation rather than a stronger opening action policy. A successful upgrade still requires held-out strength evidence, analysis of long Calm Mind/recovery/delayed-Mega lines, and realistic wall-clock testing.
