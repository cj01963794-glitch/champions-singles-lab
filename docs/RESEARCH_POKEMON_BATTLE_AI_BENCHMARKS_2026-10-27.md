# Pokémon battle AI: external approaches to benchmark (2026-10-27 KST)

Research-only comparison. No source engine changes and no benchmark executions.

## Project context
Current `champions-singles-lab` uses pinned Pokémon Showdown Champions mod, bounded exact probability solver for supported direct attacks, optional-Mega handling, joint-action sampling, and heuristic continuations. Its objective is a **specific fully specified 1v1 matchup** with conditional win plans and honestly labeled exact/bounded/sampled outcomes. Not equivalent to 6v6 Showdown ladder strength.

## Primary references and applicability

| Reference | Source | Technique | What to inspect | Limitation |
| --- | --- | --- | --- | --- |
| Foul Play | https://pmariglia.github.io/posts/foul-play/ ; https://github.com/pmariglia/foul-play | Simultaneous-action DUCT MCTS, Rust poke-engine, probability outcomes, damage-roll grouping, opponent set sampling | Joint-action tree selection; root-parallel search; outcome grouping and state undo | Engine is a different implementation/generation; grouping non-KO rolls can hide threshold-dependent 1v1 tactics. Search is approximate, not certified optimal. GPL-3.0 license. |
| PokéChamp (ICML 2025) | https://proceedings.mlr.press/v267/karten25a.html ; https://github.com/sethkarten/pokechamp | LLM-based candidate-action sampling, opponent modeling, leaf value estimation with minimax search | Reduce search space with reusable semantic priors; inspect code and data evaluation | LLM inference time/cost; Gen 9 OU rather than Champions; missing candidates remain missing. |
| MIT Jett Wang (2024) | https://dspace.mit.edu/entities/publication/89cd31d6-872c-47f9-8050-e2878e0fc666 | PPO self-play actor-critic + MCTS; reported peak 8th gen4 random battles ladder | How policy/value and search combine; baseline metrics | Different format; paper does not prove optimal play in 1v1. |
| Jaxcalibur (2026) | https://jaxcalibur.github.io/ | JAX GPU-parallel simulator, 8.5M parameter transformer, PPO self-play, pUCT with regret-style simultaneous-action selection; developer reports almost 100M games in ~1 week on H100 | Preserve rare moves via entropy/zero-avoiding regularization; policy & opponent-action prediction; search only at evaluation | Model and code not yet released at time of writing per author; H100-scale compute and major simulator implementation effort. |
| battle-engine | https://github.com/eykzhang/battle-engine | Multiple staged baselines, PPO self-play, C++ search, final fast forward model + opponent set prediction | Negative-result gates and confidence-interval benchmarks; never search deeply with incomplete transitions | Self-reported results; Gen9 OU not Champions. Final RL model abandoned. |
| RotomAI | https://github.com/BhaveshThapar/RotomAI | BC→offline RL→PPO self-play; preregistered evaluation | Opponent pools, baseline comparisons, held-out vs training distinction, confidence intervals | Bot wins vs heuristic not equal to human strength: README itself labels live GXE 30% weak. |
| showdown-brain | https://github.com/Blueshadow0107/showdown-brain | Replay-trained LightGBM V(s) + policy prior, 1-ply expectimax | CPU-friendly learned value baseline vs current heuristic continuation | One-ply and incomplete model miss long setups/recovery. Author reports approx 50% vs simple heuristic in short batches. |
| VGC-Bench | https://github.com/cameronangliss/vgc-bench | Multi-agent PSRO, BC/LLM/heuristic baselines | Diversity of training opponents and measurable evaluation harness | VGC doubles format, weak match to 1v1. |
| Metamon | https://github.com/UT-Austin-RPL/metamon | Offline RL transformer, large human/self-play replay datasets and strong base policies | Ready datasets/baselines for future learning | Gen-specific, 6v6 datasets differ from Champions 1v1; adaptation costs. |
| poke-env | https://github.com/hsahovic/poke-env | Showdown client, self-play and evaluation tooling | Automated benchmarks, baseline runners | Infrastructure, not a winning decision policy in itself. |

## Most actionable transfer

1. **Foul Play**: evaluate DUCT as replacement/comparator to current heuristic *continuation chooser*, first on restricted already-supported engine states (do not replace pinned Showdown rules). Preserve full 16-roll distributions for exact branches; lossily group only in explicitly approximate variants.
2. **PokéChamp**: only if candidate omission remains primary measured blocker, compare an external proposer as an optional nonauthoritative hint. Never promote suggested plans to proven optima.
3. **battle-engine / RotomAI**: import testing discipline, not match-specific heuristics. Fix workloads, RNG seeds, common opponent sets, CPU budget, confidence intervals and unseen holdouts before tuning.
4. **showdown-brain**: optional inexpensive experiment comparing a learned continuation value to hand-coded continuation. Need appropriate Champions 1v1 data and a separate evaluation holdout.
5. **Jaxcalibur**: long-run option only; author-reported 100M games on H100 is a poor fit to current resource limits.

## Proposed benchmark protocol (NOT YET RUN)
- Freeze current `main` baseline; operate only in isolated prototype/branch after approval.
- Separate verified **mechanics** tests from **strategic** outcomes; no matchup-specific programmed answer.
- Fixed user scenarios: Focus Sash Garchomp/Dragonite, Indeedee/Mimikyu, Floette/Charizard, Mega Sceptile/Primarina with Encore, Salamence/Primarina Giga Impact gamble, Mimikyu/Corviknight, Garchomp/Metagross, Primarina/Aegislash.
- Multiple samples/roles/orientations and varied unseen matches. Report terminal-win frequency and uncertainty, unresolved fractions, worst-opponent-response and mixed policy when meaningful, candidate-coverage and first-action changes, CPU wall-time and number of engine evaluations.
- Compare with equal legal actions and equal time budgets: existing baseline vs simultaneous DUCT vs (optional) learned value or LLM-guided shortlist. No correctness or performance claim unless observed.
- Do **not** adapt `poke-engine` Gen 9 mechanics into pinned Champions without a side-by-side rules parity test; Mega timing is especially important.
- Evaluate one candidate method independently before accepting; stop if it cannot improve on unseen cases under time limits.

## Research limitations
Sources include papers and authors' own GitHub README claims, not independently reproduced performance. Showdown ladder ranks and win rates are format/opponent/time-specific; cannot be transferred to Pokémon Champions 1v1 calculator. There is no currently demonstrated finite-cost fully general exact optimal policy across arbitrary Champions matchups.
