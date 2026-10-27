# Architecture and reasoning principles

## Core philosophy
- **Discover plans, don't memorize them.** Setup + healing + finisher, delayed Mega evolution, priority, Encore, accuracy routes and direct knockouts must emerge from general analysis, not one-off matchup instructions.
- **All starting positions:** overwhelming favorite, underdog, even matchup, counter-choice and long-game situations use the same general decision machinery.
- **Both players think.** Account for adaptive opponent replies and potentially mixed or state-contingent policies rather than scripted enemies.
- **Eventual win rate matters more than current damage.** Risk branches, fainting, boosts, recovering, status, turn order and resources affect future chances.
- **Explain and verify.** Present conditional lines and branches, make uncertainty visible, and treat user-proposed lines as hypotheses to test.

## Evidence from repository at documentation setup
`README.md` describes a pinned Pokémon Showdown Champions mod and Node application, with an experimental bounded exact probability model for limited attack races; two-turn tactical probability bounds; a sampled policy fallback for unsupported mechanics and optional Mega timing; and a separate encrypted sample vault on a storage branch. These are claims in README; actual current behavior requires code inspection.

Recent commits through `82f97bc` refer to multi-turn strategy choice, recovery planning, opponent counterplans and constrained Monte Carlo budget. A commit message is not proof the algorithm is correct.

README lists 17 passing regressions historically, but **this documentation setup did not run tests**.

## Intended reasoning pipeline — not a claim of completed implementation
1. Capture the full battle state: HP, stats, boosts, form, abilities, held items, status, volatile effects, PP, field, previous action and resources.
2. Enumerate each side's legal move and Mega/non-Mega alternatives; handle the simultaneous choice.
3. Advance battle states using reliable mechanics; represent damage, hit/miss, crit and relevant stochastic outcomes.
4. Explore conditional continuations against counterplans, allowing long setup/healing sequences, with sound reuse/pruning.
5. Evaluate terminal outcomes rigorously where feasible and otherwise compute honestly labeled bounds or empirical estimates.
6. Surface likely strategic decisions, their sensitivity to opponent actions, and modeling/calculate-budget limitations.

## Engineering risks
Branching factor, long horizons, unknown tails, truncated rollout bias, imperfect turn mechanics, sample noise, server time limits, mixed-equilibrium approximation, reproducibility. Never equate heuristic tie-break with optimality proof.

## Validation discipline
Regression scenarios should assert both legal behavior and meaningful strategic outcomes. Do not hardcode expected moves directly into the policy logic to pass tests.


## Updated long-term product objective (2026-10-27)

- **Ultimate objective**: a strong **in-battle Pokémon decision-making AI**, not merely an offline fixed-matchup win-percentage calculator.
- **Phase A, current**: rigorous open-sheet 1v1, with both fully specified Pokémon sets; identify sensible multi-turn conditional strategies, opponent reactions, and probability limits under the pinned Champions simulator. Build evaluation harness with held-out matchups and latency measures before claiming improved decisions.
- **Phase B, defer**: team-size 2v2 and 3v3 **singles** with switching/prediction, bench HP preservation, trading and conditioned counterplay.
- **Phase C, defer**: user-entered library of multiple frequently used opponent samples and uncertainty-weighted search across candidate sets.
- **Phase D, defer until justified**: scalable self-play learning / more general battle policies. Not a current implementation decision.
- Revisit research priorities: Foul Play, battle-engine, Metamon, RotomAI, VGC-Bench, PokéChamp, showdown-brain, poke-env. Rank denotes relevance to staged goals; later milestones may change ordering.

**Do not implement future mechanics now** at the expense of establishing Phase A performance.

## Data authority and dual-model deployment invariant (2026-10-27)

**Data authority**: the existing website's pinned Pokémon Showdown `gen9championscustomgame` mod/dex + existing Korean localization and input validation; never fork foreign move powers, data tables, translated names, rules, or new independent simulation truth from other AI repositories. Map external AI method inputs/outputs to canonical internal Pokémon/move IDs. Retain current SP points/maximum, form/Mega and move availability semantics.

**Model separation**: HTTP `POST /api/duel` currently dispatches `model:'legacy'` to original `simulation`; `model:'experimental'` to `engines/experimental.cjs` (Stage 1B) with `battle/validate/legal` dependencies and pinned game data. The HTML model selector defaults to Legacy. Develop the benchmarked AI only as Stage 1B/experimental modules; keep the Legacy simulation behavior and default selection unchanged on deployment. Source-code separation alone does not ensure parity if modifying `server.cjs` shared helpers / common dependencies; explicitly regression-test shared changes before acceptance and preferably avoid them. Do not change format mechanics because another project uses its own simulator. Only borrow algorithm structures, and comply with relevant licenses.

**Current scope**: fully open-sheet 1v1. Later expanding to 2v2/3v3 singles (switching/prediction), then representative unknown opponent sets is deferred. All changes must be measured against holdout states, both-side counterplay, error bars/compute budget, Legacy parity.


## Superseding scope correction: Experimental replacement, not refactoring (2026-10-27)
**Two distinct obligations:**
1. **Legacy (`model:'legacy'`)**: untouchable, including effective behavior via shared code; only a separate explicit user authorization could change it. Keep the site's selector default to Legacy.
2. **Experimental / Stage 1B (`model:'experimental'`)**: existing AI/search planner is rejected, to be **replaced from scratch** inside the existing experiment route and site selector, not gradually repaired. Current `engines/experimental.cjs` and old strategic helper modules are not required architectural dependencies for the new model, though Git history retains them. Keep compatible input, game data, output wiring and UI slot where possible without affecting Legacy. Borrow only external algorithms; use the site's authoritative Champions Showdown mechanics, move data and Korean localization.

The prior direction to improve current Stage 1B incrementally, or to treat its present behavior as the reference benchmark, is explicitly withdrawn. New Stage 1B should be validated independently on known and unseen open-sheet 1v1 cases. Legacy can serve as read-only comparison but must not be changed. Future expansion to multi-Pokémon singles and uncertain opponent sets is deferred.

## Stage 1B candidate architecture and observed limitations — 2026-10-27 recovery
- Original Experimental strategy planner was detached. The candidate `engines/experimental.cjs` independently selects p1/p2 actions using `engines/stage1b/duct-search.cjs` (UCB1, simultaneous joint moves, stochastic Showdown branches) on pinned `gen9championscustomgame` rules.
- Serializer in pinned Showdown directly aliases `battle.log` on both save/restore; `engines/stage1b/showdown-adapter.cjs` MUST copy it on each snapshot and restoration. Without this, DUCT trials corrupt live state and Showdown throws `Infinite loop`.
- Tree root action visit share is a **policy sampling ratio**, not a statistical chance to win; nonterminal random rollouts use weak HP-based scores and are reported as unresolved. No general guarantee that long setup/heal or delayed-Mega tactics will be found.
- New candidate CI/pinned Docker build regression tests validate rules, log isolation and Legacy source unchanged, but **do not certify competitive strength**. Three old pre-existing unrelated subtest failures and four obsolete Experimental-specific file tests are explicitly excluded (runner prints names). See `docs/STAGE1B_RECOVERY_2026-10-27.md`.
- Deployment blocked pending stronger held-out benchmark against read-only Legacy and robust confidence/unresolved/latency reporting. No additional Pokémon data or simulator imports, no changes to Legacy, no premature team-switching infrastructure.
