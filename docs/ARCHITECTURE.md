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
