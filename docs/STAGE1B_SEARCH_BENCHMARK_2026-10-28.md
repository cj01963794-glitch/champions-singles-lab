# Stage 1B first-priority Foul Play DUCT search benchmark — 2026-10-28 KST

## Decision
**Keep the exact-state DUCT as the conservative Stage 1B default**. Open-loop and non-root joint progressive widening are useful *research options* only, NOT verified playing-strength upgrades. Do not deploy or merge candidate branch into main. Do not touch `model:'legacy'`. The first-priority benchmark now has a reproducible negative finding and an explicit control candidate for any second-priority research.

## Code changes
- `engines/stage1b/duct-search.cjs`: selectable `treeMode:'exact'|'open-loop'` and opt-in `jointWidening:true`. Open-loop merges stochastic outcomes by the joint action history; the current state's legal options are always recomputed and intersected with cached action statistics. Progressive widening at non-root nodes limits fresh joint action-pair expansion under low visit counts, delaying some counterplay and possibly biasing estimates.
- `engines/experimental.cjs`: explicit conservative `treeMode:'exact'`, `jointWidening:false` default. Does not modify the 5-argument production API.
- `test/stage1b-duct.test.cjs`: synthetic stochastic long-horizon case with state-dependent legal moves tests improved depth, no illegal actions, and original battle non-mutation. Optional widening tested against open-loop.
- `scripts/stage1b-first-turn-audit.cjs`: same-budget ablations `exact`, `open-loop`, `open-loop+widen` and 1.8s deeper diagnostic.
- `scripts/stage1b-coverage-audit.cjs`: runs all 17 reproducible entries from a 21-entry archive in both orientations; the other four are missing historical sets.
- `scripts/stage1b-policy-match.cjs`: pairs independent search agents, opposite orientations and two seeds in real pinned Showdown to measure head-to-head terminal results rather than root visits.
- No species-specific move scripts, imported species data, change to Legacy/shared rules/data/UI, or new neural training.

## Reproducible GitHub evidence
- [First open-loop CI, run 40530759587](https://github.com/cj01963794-glitch/champions-singles-lab/actions/runs/40530759587): selected 120 passed, 0 failed, 1 TODO. Ten 450ms historical roots: open-loop deeper in 4, shallower in 0; 1.8s root searches 3–4 tree turns. Archived 17 matchups, 34 orientations checked.
- [Optional widening CI, run 40531782804](https://github.com/cj01963794-glitch/champions-singles-lab/actions/runs/40531782804): selected 121 passed, 0 failed, 1 TODO. At 450ms, widening deeper than plain open-loop in **10/10 roots**, 0 shallower. At 1.8s, widest reached tree depth **5–7** turns (plain open-loop originally 3–4); Floette/Charizard depth **6** versus 3. These maxima do not prove opponent coverage, actual policy quality, or an optimal calm-mind/synthesis line.
- [72-policy-game run 40533377668](https://github.com/cj01963794-glitch/champions-singles-lab/actions/runs/40533377668): selected 121 passed, 0 failed, 1 TODO; shared/Legacy file diff guard passed. Independent policies played fully open-sheet Showdown against each other at **120ms per agent per turn**, max 10 turns, 3 matchups (Floette/Charizard, Mimikyu/Corviknight, Dragonite/Sash Garchomp), two orientations, two seeds, both assignments. **24 matches per pairing**, 72 total:
  - `open` vs `widen`: **open 10, widen 12, unresolved 2**
  - `exact` vs `widen`: **exact 14, widen 8, unresolved 2**
  - `exact` vs `open`: **exact 14, open 7, unresolved 3**
  - Draws: zero across all three pairings. These counts are small and at a much lower budget than production first-turn 1.8s; do not claim statistical superiority, 1.8s win rates, or causal proof of optimality. But they are **negative evidence against unconditionally promoting either exploratory tree mode**.
- Three pre-existing failing old Legacy/mock test names and four obsolete rejected Experimental contract test files remain explicitly excluded in the existing runner. “Selected tests passed” is not the same as unfiltered green.
- 21 historical entries are **not 21 distinct species pairings**. 17 are replayable with archived sets and 4 are not yet reconstructible (Primarina/Aegislash, Mega Sceptile/Primarina, Primarina/Mega Baxcalibur, Mega Delphox/Aegislash).
- No Render host benchmark, no proof that realistic multi-turn adversarial Calm Mind/Synthesis or deferred Mega lines are reliably optimal, and no deployment.

## Interpretation and next benchmark gate
- The initial structural bottlenecks were real: chance-event state explosion and joint-action branching. Open-loop and widening can spend more of a fixed search budget on deep continuations.
- However deep action-history aggregation mixes strategically distinct chance states, and progressive widening postpones some opponent counteractions. Random rollout outcomes can systematically overvalue weak long lines. This explains why more tree depth does **not** imply stronger decisions.
- **Next technical hypotheses** for any future first-priority work: compare real held-out policy strength at 1.8s and later-turn budgets across more seeds; use opponent-aware rollout/value estimates with unbiased controls and response checks; investigate maintaining chance-state distinctions while using deeper statistical sharing; evaluate deep plan reliability and low-probability counterplay.
- **Second-priority readiness**: benchmark harness and conservative `exact` control exist; algorithmic superiority is **not** established. Study battle-engine methods only against this retained control, not by assuming an open-loop upgrade passed. Merge/deploy only with meaningful playing-strength evidence.
