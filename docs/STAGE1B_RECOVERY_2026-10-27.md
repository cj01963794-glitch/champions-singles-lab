# Stage 1B / Foul Play recovery checkpoint — 2026-10-27 KST

## Repository state and constraints
- Repository: https://github.com/cj01963794-glitch/champions-singles-lab
- Interrupted original: branch `stage1b-foulplay-duct-20261027`, commit `445ce0d5940e24aff74dee288518b0969757a8ee`.
- Resumed in `stage1b-recovery-20261027`; original branch and `main` (`6418db6225252f2df9910c02905eabca79693578` at recovery) are preserved.
- **NEVER edit `model:'legacy'` or shared battle rules/data/translation/UI/default without separate user consent.** Only Stage 1B `model:'experimental'` can be replaced. This is a candidate branch, **not deployed**.
- Champions pinned Showdown `d849b220082e113d8a17303509fb44d420c543d5`, `gen9championscustomgame`, and site-local data are authoritative. External Foul Play/poke-engine provides search-method ideas only.

## Implementation
- `engines/experimental.cjs`: from-scratch simultaneous DUCT facade; fixed production API, bounded per-turn computation; optional sixth parameter for test budgets.
- `engines/stage1b/duct-search.cjs`: independent UCB on both sides' legal actions, real Showdown simultaneous outcomes, state signatures, trial RNG reseeding, random rollouts and root visit policies.
- `engines/stage1b/showdown-adapter.cjs`: snapshot and restore via pinned Showdown with isolated log and independently seeded future RNG.
- `test/stage1b-duct.test.cjs`, `test/stage1b-showdown.test.cjs`, `test/stage1b-matchups.test.cjs`: synthetic simultaneous-game tests, real open-sheet mechanics/seed parity, both orientations, no mutation, RNG/clone profiling.
- `Dockerfile`, `package.json`, `scripts/run-stage1b-tests.cjs`, `.github/workflows/stage1b-validation.yml`: candidate-only build gates, explicit legacy unchanged check, pinned Showdown CI.

## Crash root cause and fix
Pinned Showdown's `sim/state.ts` sets `state.log = battle.log` during serialization and `battle.log = state.log` when deserializing. The first DUCT implementation unknowingly reused this array for many restored trials, appending to original and triggering `Battle.singleEvent`'s 1,000-line `Infinite loop` guard. Copying the log array at snapshot and at each restore resolves that exception without changing Showdown, Legacy, or shared modules. An explicit no-shared-log regression accompanies this checkpoint.

## Verification evidence
- Before fix: Stage1B real Champions tests failed with `Infinite loop` (while synthetic matrix DUCT tests passed).
- After fix: GitHub Actions run [40523311832](https://github.com/cj01963794-glitch/champions-singles-lab/actions/runs/40523311832) passed 118/122 selected tests; 3 failures in unchanged legacy/mock tests; 1 TODO.
- After explicit filtering of existing red cases: GitHub Actions run [40523704908](https://github.com/cj01963794-glitch/champions-singles-lab/actions/runs/40523704908) at `e4a9955` **passed**: 118 passed, 0 failed, 1 TODO in selected suite; model-selector and shared-file immutability checks passed.
- Excluded pre-existing test names: `bounded free-host samples still choose the Mega Draco -> priority plan on either side` (4-sample Legacy expected-action mismatch); `sampled fallback tests all opposing actions, all setups, and complete paired rounds`; `unresolved sampled continuations stay unknown and never count as wins` (last two mock state lacks `getSide`).
- Four archived file-level tests test the rejected old Experimental API and hand-selected opening moves: `experimental.test.cjs`, `experimental-historical.test.cjs`, `experimental-counterfactual.test.cjs`, `strategic-plan-regression.test.cjs`. Retained mechanics cases continue to run; exclusions are printed during test startup. Thus **do not claim the unfiltered whole suite is green**.
- 130ms per-search smoke tests: approx. 8–38 trials across five matchup pairs and both side orientations. One CI runner measurement of 30 clones averaged approx. 0.28ms each; neither number demonstrates search strength at production CPU budgets.

## Outstanding acceptance gaps, before merge or site deployment
1. Check latest GitHub Actions after this documentation/Dockerfile/extra regression update; success on older commit does not validate a new head.
2. Measure real 1.8s/turn search on diverse held-out matchups with multiple independent RNG seeds; compare both sides, actual terminal outcomes and opponent best counterplay against read-only Legacy at equal compute budgets.
3. Report unresolved percentage, latency and strategic failures. Uniform random rollouts and truncated HP tiebreak can miss Calm Mind/Synthesis, Encore, delayed Mega, rare wins. Root visits are **not winning probabilities**. No neural training/permanent sample bank yet.
4. Verify Stage 1B-only UI explanation compatibility without changing Legacy rendering. Deploy only after adequate performance evidence; do not label this a proven strong AI.

## Chat continuity rules
Read `docs/PROJECT_MEMORY.md`, this checkpoint, `docs/DEVELOPMENT_LOG.md`, and `docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md` in future sessions. The latter is the user's required **single append-only** transcript file; only explicitly committed original excerpts are recoverable as verbatim. No automatic chat-to-GitHub synchronization exists; cannot prevent all future interface interruptions, but GitHub commits preserve the work completed there.

## Measured production-sized first-turn audit (GitHub Actions `40526359384`)
- [Passed action log](https://github.com/cj01963794-glitch/champions-singles-lab/actions/runs/40526359384) at code commit `e5a6ca9a9dce609164379070bb4702d1fe339be2`: **119 selected tests passed, 0 failed, 1 TODO**, and pin/Legacy file immutability checks passed. This still excludes the three named unrelated red old subtests and four rejected old Experimental test files.
- `scripts/stage1b-first-turn-audit.cjs` exercised **5 held-out historical cases, each in both side orientations** at **1,800ms per root** on GitHub runner, pinned Champions Showdown, deterministic seed and no opponent-set uncertainty. These are fixed-seed diagnostics, NOT gameplay win-rate evaluations and NOT Render measurements.
- Total **5,204 trials over 10 roots**, per-root **222–907**; logged lower-median **536** trials. Only **7/5,204** random continuations remained unresolved, but this does **not** prove the optimal continuation was explored, since random rollouts terminate without strong counterplay. Tree exploration reached only **2–4 turns** within the constructed search tree, while continuation to 24 turns used uniform random rollouts.
- Floette vs Charizard first turn: 222 trials/1.8s, Calm Mind `move 4 mega` leading but with **18.5% root visit share** and ordinary `move 4` 16.2%. Reverse-side example Charizard/Floette: Floette `move 4 mega` 20.4% of visits. The algorithm does not have a reliable/established long Calm Mind + Synthesis proof. This shows immediate strategy-selection uncertainty.
- Mimikyu vs Corviknight: `move 3` (Swords Dance) root share 77.4% when Mimikyu is left; 76.1% when on right. This is promising smoke evidence, not a calibrated win chance.
- Critically: **search nodes often nearly equal trials** (Floette 223 nodes for 222 trials, Corviknight/Mimikyu 395 nodes for 394), showing shallow outcome reuse under stochastic branches. Limited deep tree reuse and random leaf policy are concrete candidates for future general improvements; never repair with matchup-specific move patches.
- Next acceptance work: quantitatively measure convergence/coverage under increased budgets; improve stochastic chance state grouping/rollout evaluation generally, then compare actual outcome win rates against adaptive adversaries and read-only Legacy. A neural policy/value model may later retain learned generalizable knowledge, but no learning system has been implemented.
