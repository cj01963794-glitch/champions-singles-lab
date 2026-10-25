# Pokémon Champions Singles Matchup Lab

Experimental 1v1 singles Pokémon Champions simulator using the pinned Pokémon Showdown Champions mod. See `/api/health` for engine and policy version.

Policy 0.7 adds a bounded exact solver for supported direct attack races. It obtains each 16-way damage distribution and accuracy/critical probabilities from Showdown, then evaluates all simultaneous action pairs and subsequent state-dependent choices. The model includes priority, speed ties, recharge, Sitrus Berry, Focus Sash, low-HP damage abilities, and entry stat changes already applied by Showdown. A small matrix-game solver handles mixed continuations.

Unfinished branches remain lower/upper victory-probability bounds. Only a pure opening equilibrium that remains valid under those bounds overrides the tactical planner. The exact model explicitly rejects unmodeled items, abilities, move callbacks, meaningful secondaries, status, field effects, and insufficient PP. It is not an exhaustive solver for all Pokémon mechanics or a competitive ranking tool.

For unsupported high-variance positions, the sampled fallback evaluates **every** legal opening pair, including setup choices, with equal completed paired samples. Continuations are heuristic. Sample estimates and unresolved mass are displayed separately from exact bounds; neither is mislabeled as a statistical confidence interval.

## Local validation

Build the Showdown revision in `Dockerfile`, then run:

```sh
SHOWDOWN_PACKAGE_PATH=/absolute/path/to/pokemon-showdown npm test
SHOWDOWN_PACKAGE_PATH=/absolute/path/to/pokemon-showdown npm start
```

Regression coverage includes the specified Salamence/Primarina spreads, side and move-order swaps, independent full-engine weighted outcome enumeration, seeded replay, unsupported mechanics, and joint-action sampling. The two-move regression uses Salamence's Giga Impact/Earthquake and Primarina's Moonblast/Aqua Jet; adding other moves can require the fallback.

Pokémon Showdown is licensed under MIT. Public deployment on Render (free tier) uses a pinned source revision.
