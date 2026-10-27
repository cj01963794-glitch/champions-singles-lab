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


---

## 2026-10-27 KST: direct code inspection notes (second pass)

Code review performed via connected GitHub repository file contents. **No clone/install, tests, timing benchmarks, trained model execution or battle simulation was run.** Interpret model and ladder scores as maintainers' published claims, not independently reproduced performance.

### 1. UT-Austin-RPL/metamon
- [metamon/rl/finetune.py](https://github.com/UT-Austin-RPL/metamon/blob/main/metamon/rl/finetune.py): actual example iterative pipeline: pretrained HuggingFace checkpoint -> collect self-play -> write pile -> dataset YAML with replay_weight/prev_dataset/custom_replays -> load prior checkpoint into next finetuning iteration. Not code-rule mutation.
- [metamon/rl/metamon_to_amago.py](https://github.com/UT-Austin-RPL/metamon/blob/main/metamon/rl/metamon_to_amago.py): MetamonAMAGOWrapper moves legal_actions mask into observation; temperature-scaled categorical action distribution. Core AMAGO dependency.
- [metamon/il/model.py](https://github.com/UT-Austin-RPL/metamon/blob/main/metamon/il/model.py): token + numerical input, multimodal and Perceiver/GRU embeddings, action logits.
- [metamon/rl/pretrained.py](https://github.com/UT-Austin-RPL/metamon/blob/main/metamon/rl/pretrained.py): pre-trained model registration/loading from HF with strict PyTorch checkpoint match.
- [metamon/env/metamon_battle.py](https://github.com/UT-Austin-RPL/metamon/blob/main/metamon/env/metamon_battle.py): showdown request/event -> battle state.
- Supports Gen 1-4 and Gen 9 OU per README; no confirmation of Champions 1v1 samples or ready compatibility; 6v6 team preview expectation in `metamon_player.py` can reject teams other than 6.
- 5M+ reconstructed human trajectories, 20M+ self-play trajectories and 40+ checkpoints described in README; independently verifying dataset bytes and model performance not attempted.

### 2. pmariglia/foul-play + separate MIT Rust pmariglia/poke-engine
- [fp/search/main.py](https://github.com/pmariglia/foul-play/blob/main/fp/search/main.py): deep-copy battle, prepare sampled opponent sets, convert to poke-engine state, run root-parallel MCTS using ProcessPoolExecutor, aggregate per-action visit ratios weighted by sample probability, retain actions >= 75% of top visit ratio, weighted-random final choice.
- [poke-engine/src/mcts.rs](https://github.com/pmariglia/poke-engine/blob/main/src/mcts.rs): each side selects separate UCB1 action, calls generate_instructions_from_move_pair for stochastic successor states; probability-weighted outcome selection, backpropagate side1 score and 1-score to side2, apply/reverse state instructions, rollout/evaluation. [mcts_threaded.rs](https://github.com/pmariglia/poke-engine/blob/main/src/mcts_threaded.rs): multithreaded variant with virtual loss.
- [tests/test_champions.py](https://github.com/pmariglia/foul-play/blob/main/tests/test_champions.py) confirms code branches for 'gen9champions', max stat point 32, Champions PP formula, 11 SP = 84 EV example, Champions Regenerator no switch healing, no contamination of gen9 standard battle. Tests not executed here; **does not prove parity for Mega, current Champions mod, all special effects**.
- License distinction: Python bot GPL-3.0; separate Rust poke-engine MIT. Risk when reusing code commercially/publishing integrated work.
- Our 1v1 **fully specified** matchup does not need opponent hidden-set sampling, so the most relevant component is actual paired action MCTS with reversible transitions and CPU budget, not the opponent set predictor.

### 3. sethkarten/pokechamp
- [pokechamp/llm_player.py](https://github.com/sethkarten/pokechamp/blob/main/pokechamp/llm_player.py) `tree_search` explicitly: local SimNode, damage calculator suggestion, LLM tool choice ('damage calculator' vs 'minimax'), LLM-generated move and switch candidates, opponent candidate generation (damage, heuristic switch, LLM), expand candidate pairs, local simulation, leaf LLM 1–100 outcome score, fallback hp_diff on LLM error, recursive minimax selection. This is **not exhaustive** and lacks certified optimal long paths.
- [pokechamp/minimax_optimizer.py](https://github.com/sethkarten/pokechamp/blob/main/pokechamp/minimax_optimizer.py) has simulation pool/cache and `fast_battle_evaluation` with HP advantage, team count and turn-penalty heuristic. LLM cognitive abilities are external pretraining not a built-in exact algorithm.
- Custom `LICENSE` file includes additional no-use/no-distribution stipulation in Japan despite MIT heading; do not treat as unqualified MIT permission. External runtime LLM costs and variable correctness.

### 4. BhaveshThapar/RotomAI
- [rotomai/train/ppo.py](https://github.com/BhaveshThapar/RotomAI/blob/main/rotomai/train/ppo.py): warmstart, PPO clipped policy update, GAE, frozen past opponents in a league.
- [rotomai/search/expectimax.py](https://github.com/BhaveshThapar/RotomAI/blob/main/rotomai/search/expectimax.py): `choose_order` root all moves, K hidden opponent determinizations, joint move pair state transitions, opponent aggregation mean/min/model, deepen only top-k by policy prior, learned leaf value or shaped value, optional blend with policy prior. Defaults depth 1; deeper plans remain heuristic/approximate.
- README honestly reports bot win rates 73% vs simpleheuristics in 9000 gen9ou games but public real rated ladder Elo ~1004, GXE 30% ('WEAK'), demonstrating bot-bot self-play overfitting. GitHub author's metrics, not reproduced.
- Applicable: evaluation gates, support of opponent models, root-all-actions/deeper-top-k; less suitable for fully revealed 1v1 where hidden team sampling is unnecessary.

### 5. Blueshadow0107/showdown-brain
- [src/sb/agent.py](https://github.com/Blueshadow0107/showdown-brain/blob/main/src/sb/agent.py): LightGBM V(state), optional pi2 damaging-response probabilities, simulate each move/switch one-ply with `transitions` handcrafted model, add urgency/setup/unmodelled penalties, choose highest EV. Explicitly mixes learned value with handcrafted tactical corrections.
- [src/sb/transitions.py](https://github.com/Blueshadow0107/showdown-brain/blob/main/src/sb/transitions.py): simplified damage, boosts, state changes; not Showdown full-fidelity.
- Code comment says 'no move-sequencing awareness'; README admits status/protect under-modelled and one-ply long-term limitations. Useful low-cost V(s) baseline, but high likelihood of repeating our setup/heal failure modes.

### 6. cameronangliss/vgc-bench
- [vgc_bench/train.py](https://github.com/cameronangliss/vgc-bench/blob/main/vgc_bench/train.py): Stable-Baselines3 PPO; self-play, exploiter, fictitious play, double oracle CLI switches; can initialize from behavior cloning.
- [vgc_bench/src/policy.py](https://github.com/cameronangliss/vgc-bench/blob/main/vgc_bench/src/policy.py): attention actor critic with legal-action masks.
- [vgc_bench/eval.py](https://github.com/cameronangliss/vgc-bench/blob/main/vgc_bench/eval.py): cross evaluation, computational cost and held-out team generalization; README describes 72 unseen evaluation teams. Doubles VGC, not singles 1v1; transplant evaluation and diverse opponent sampling methods, not battle policy verbatim.

### 7. eykzhang/battle-engine
- [battle_engine/set_search.py](https://github.com/eykzhang/battle-engine/blob/main/battle_engine/set_search.py): K sampled hidden opponent teams, one real-engine converted state per sample, budgeted Rust MCTS, root visits aggregated; no ML in final action policy.
- [battle_engine/search.py](https://github.com/eykzhang/battle-engine/blob/main/battle_engine/search.py): deliberately approximate 2-ply best known damaging response, biases due to sequential reaction; documented incompleteness.
- [battle_engine/win_prob.py](https://github.com/eykzhang/battle-engine/blob/main/battle_engine/win_prob.py): MLP logistic P(win), training and calibration.
- [battle_engine/benchmark.py](https://github.com/eykzhang/battle-engine/blob/main/battle_engine/benchmark.py): cross-play with Wilson confidence intervals.
- README explicitly reports: learned 2-ply value lost to baseline 35.6%; PPO 69.6% vs historical baseline but only GXE 26.3% public ladder; pure Python deeper search 26.7% vs shallow baseline; PPO-guided PUCT 60.4% vs plain MCTS but only 35.8% vs raw PPO; full forward model via poke-engine plus opponent-set sampling final 68.2% GXE, 34/50 games. Historical state-encoder mutation invalidated old learned checkpoints and RL gate was not reproduced. Critically demonstrates incomplete state transition model worsens with search depth.
- Crucial for Champions: preserve pinned Showdown fidelity and verify simulation outcomes against it before any extra search.

### 8. hsahovic/poke-env
- [src/poke_env/player/player.py](https://github.com/hsahovic/poke-env/blob/master/src/poke_env/player/player.py): Player interface choose_move, battle_against, accept_challenges, ladder; generic battle environment infrastructure not an optimal strategy algorithm.
- Useful when running automated agent-vs-agent experiments, less useful if user's existing Node Showdown battle harness already offers required evaluation.

### Revisit project priority after code inspection
1. Absolute prerequisite: existing pinned Showdown Champions mechanics regression/parity and robust benchmark execution, with unchanged current `main`.
2. First algorithm comparator: **poke-engine's Rust DUCT MCTS** vs current 1v1 planner, but only on precisely supported sets/roles and equal CPU budgets. **No commitment to engine replacement** and **no claim of superior performance** before runtime tests.
3. Separate measurement-only path: battle-engine/RotomAI experiment-gating and holdout design (uncertainty/confidence and anti-overfitting).
4. Later if learning resources permit: Metamon fine-tune/imitative bootstrap, with Champions 1v1 observation/action and Mega handling adaptation.
5. Caution/low immediate priority: PokéChamp expensive/uncertified LLM candidate selection; showdown-brain one-ply that replicates missing long-term paths; VGC-Bench doubles policies.
