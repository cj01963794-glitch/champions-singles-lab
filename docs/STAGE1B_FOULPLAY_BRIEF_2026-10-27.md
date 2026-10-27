# Stage 1B from-scratch Foul Play / DUCT implementation briefing

Status: **proposed, awaiting user instruction to implement**. Created 2026-10-27 KST. No app code changed in this planning turn.

## Immutable constraints
1. `model:'legacy'` frozen absolutely until separate explicit user consent. Must preserve default UI selection, API behavior and any shared helpers/dependencies it uses.
2. Current `model:'experimental'` policy is rejected and must be replaced from scratch. Existing code/heuristics/plan generation not inherited. Retain the `model:'experimental'` route, Stage 1B UI selector and request/response contract to the extent compatible with new algorithm, without Legacy changes. Git history retains old code.
3. Site's own pinned Showdown `FORMAT='gen9championscustomgame'` and Dex are authoritative for Pokémon, moves, power, abilities, items, forms, SP rules, damage, accuracy, random outcomes; current site translation, e.g. `korean-forms.cjs`, and internal IDs are authoritative. External projects contribute search algorithms only. No foreign game DB or mechanics replacement.
4. **Present scope**: fully open-sheet 1v1; no switching, opposing-set mixture or 3v3 infrastructure yet. Ultimate target is strong real-battle AI.

## Verified technical basis
- `server.cjs` routes `/api/duel` on `model==='experimental'` to `engines/experimental.cjs` with `{battle,legal,strategicLegal,avoidImmuneChoice,estimatedDirectDamage,provablyImmuneAttack,Sim}` deps, otherwise to original Legacy `simulation`.
- `index.html` default option is Legacy and the other selection `experimental`. Stage 1B model renderer depends on result keys including `model,choices,log,decisionDetails[0].experimental` and potentially mode/action policy/payoff; preserve or specifically adapt only experimental visual copy and rendering, never legacy.
- `Dockerfile` pins Showdown git revision `d849b220082e113d8a17303509fb44d420c543d5`. In exactly that version `sim/battle.ts` has `toJSON(): State.serializeBattle(this)` and `static fromJSON(...): State.deserializeBattle(...)`; `sim/state.ts` supports restoring Pokémon/field/action queue/PRNG. **This proves an available mechanism, not runtime correctness/performance under Champions**. Test serialization fidelity for Mega timing/status/Encore/PP/RNG and speed first.
- `Dockerfile` currently runs many old experimental tests and `engines/strategic-plans.cjs`, `engines/adversarial-plan-search.cjs` and `engines/probability-planner.cjs` syntax checks. New Stage 1B requires replacing/updating **only old Experimental-specific** build/test gates; do not weaken/remove Legacy validation. Old `test/experimental*.test.cjs` assert historical `equilibrium`, `planning` and exact opening choices; these are not contracts for the rejected algorithm. Convert useful scenarios to general behavioral/mechanics checks, and add unseen holdouts; no test expected move must become hard-coded policy logic.
- External reference algorithm: `pmariglia/poke-engine/src/mcts.rs` selects `s1` and `s2` actions separately by per-side UCB1, generates stochastic instructions for action pairs, samples weighted outcomes, backpropagates `score` to side 1 and `1-score` to side 2, and reverses instructions. `pmariglia/foul-play/fp/search/main.py` root-parallel samples and merges visit ratios. For present **fully specified** matchups opponent-set sampling not needed.
- Direct source: https://github.com/pmariglia/poke-engine/blob/main/src/mcts.rs (MIT), https://github.com/pmariglia/foul-play/blob/main/fp/search/main.py (GPL-3.0); prefer reimplementing algorithm rather than copying GPL bot code.

## Proposed code boundaries (not yet created)
```text
engines/experimental.cjs        facade preserving existing API dispatcher
engines/stage1b/showdown-adapter.cjs   pinned Showdown state cloning, action validation
engines/stage1b/duct-search.cjs       separate side-action UCB, paired action child/chance state
engines/stage1b/rollout.cjs           capped continuation policy/simulator
engines/stage1b/evaluation.cjs        terminal outcomes vs truncated heuristic estimate
engines/stage1b/diagnostics.cjs       budgets, visits, unresolved, confidence diagnostics
test/stage1b-state.test.cjs           cloning/canonical format/mechanics/RNG parity
test/stage1b-search.test.cjs          matrix game (e.g. matching pennies), legal actions, seed stability
test/stage1b-matchups.test.cjs        prior user scenarios + held-out scenarios + both sides
```

No changes to `server.cjs` Legacy simulation or shared `battle/validate/legal` are expected; use dependency injection already present. Prefer not changing overall HTML; Stage 1B-only status text may be updated carefully when necessary without touching Legacy or its default. CI/Docker test list may be adjusted for new experimental tests, while preserving Legacy tests.

## Implementation & validation gates
A. Baseline capture: record current immutable Legacy input/output seeded fixture snapshots and existing test/build status; branch/version to preserve old Stage 1B history.
B. State adapter: exact snapshot/restore including activeRequest, boosts, Mega, PP, items, RNG; compare original & restored branch outcomes for same action pair/seed. Measure snapshot milliseconds + memory overhead. If fails, stop rather than silently approximating mechanics.
C. Search: per-node independent UCB1 for both sides; resolve paired simultaneous choices with official Showdown. Handle chance via controlled outcome samples, terminal win/draw, unchosen actions and uncertain root visit estimates; re-search each real turn rather than retaining a brittle fixed multi-turn plan. Search is approximate. Test known small zero-sum matrix games to catch naive best-response/asymmetric action bugs. Use reproducible independent RNG streams for fair comparisons, output uncertainty rather than certified optimality.
D. Rollouts: terminal utility primary; truncated states labeled unresolved or heuristic. Avoid assuming HP advantage implies victory where setup/heal is possible. Profile computational budget (especially Render CPU and request timeouts); improve runtime via verified caching/state restore. No claim DUCT solves all long-line tactics.
E. Evaluate old/hard cases as **held-out regressions**, incl. Mega Sceptile/Primarina, Floette/Charizard, Mimikyu/Corviknight, Dragonite/Focus Sash Garchomp, Indeedee/Mimikyu, Primarina/Salamence. Separate mechanics assertions from user strategic hypotheses (optimal lines not yet proved). Compare read-only Legacy and new Stage 1B under equal CPU budgets, different role orientations and RNG. Record terminal win rates, adversarial response, candidate coverage, runtime and unresolved fraction. Don't embed "correct opening" per Pokémon in AI code.
F. Deployment only if Stage 1B tests and Legacy unchanged-result tests pass, model output/UI remains compatible, and site load budget acceptable. Keep Legacy selected by default. If experimental results too poor, report blockers, don't misrepresent implementation as successful.

This is a briefing, **not a validated algorithm or deployment commitment**. A future user request will authorize implementation.


## Feasibility reassessment: the three technical risks

In response to user concern (2026-10-27): These are **not automatically solved by adopting DUCT**.

| Risk | Mitigation / future options | Non-negotiable honesty |
| --- | --- | --- |
| Slow state clone/turn evaluation | Profile pinned Showdown `toJSON()/fromJSON()` and mechanics parity; use valid transposition/memoization, shared immutable parsing, time budgets and profiling; optimize verified bottlenecks; consider incremental reversible transitions or optimized native implementation **only after full Champions parity tests**. | No throughput or deploy viability claim without measurement. |
| Long-range setup/heal/Encore strategies missed | Wider exploration; separate root-action coverage; targeted continuation probes, reversible search/loop recognition; later learned policy/value priors based on training/self-play (Metamon/RotomAI approaches) if costs justify. Benchmark Floette vs Charizard, Sceptile vs Primarina, Mimikyu vs Corviknight on held-out cases. | DUCT's leaf evaluation can itself bias against delayed rewards. Increasing search alone doesn't prove coverage. Foul Play source describes static hand-crafted leaf evaluation, not necessarily pure terminal rollouts. |
| Probability and decision miscalibration | For restricted tactical cases use exact Showdown chance branches as reference; otherwise independent seeds, confidence ranges with correctly defined opponent policies and repeated tournaments; fixed budget and held-out opponents; show missing/unresolved branches. | MCTS visit share != chance of winning. Increasing samples may reduce sampling variance but cannot correct missing strategy, weak opponent or inaccurate continuation model. Distinguish exact probabilities, sampled policy-vs-policy win rate, strategic heuristic and unresolved outcomes. |

**Before implementing full DUCT:** first prove (a) clone/replay results preserve exact mechanics/PRNG and (b) reasonable state throughput in deploy budget. If either fails, stop and revise feasibility instead of adding matchup-specific hacks. After implementation, report both wins **and** failures. Later external projects can replace evaluation or search if benchmarks demand, but cannot make first-stage shortcomings disappear by assumption.

No model code changed by this record.
