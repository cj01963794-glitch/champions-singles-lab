# Pokémon Champions Singles Matchup Lab

Experimental 1v1 singles Pokémon Champions simulator using the pinned Pokémon Showdown Champions mod. See `/api/health` for engine and policy version.

Policy 0.7 adds a bounded exact solver for supported direct attack races. It obtains each 16-way damage distribution and accuracy/critical probabilities from Showdown, then evaluates all simultaneous action pairs and subsequent state-dependent choices. The model includes priority, speed ties, recharge, Sitrus Berry, Focus Sash, low-HP damage abilities, and entry stat changes already applied by Showdown. A small matrix-game solver handles mixed continuations.

Mega timing update: while a Mega Stone remains usable, the legal-action list
contains both the ordinary and Mega version of every move. The Showdown-backed
two-turn fallback evaluates the different timings and preserves both variants
on the follow-up turn. Until Mega evolution is no longer optional, the bounded
exact probability models decline to certify outcomes rather than silently
pretending that evolution was compulsory. Direct diagnostic callers may opt
into `assumeImmediateMega:true` for a **conditional** immediate-evolution
analysis; that is not an unrestricted optimal policy. Timing decisions use
limited real-engine lookahead, not certified exact long-term win rates.

Policy 0.7.1 also handles supported positive self boosts, Encore's forced action and duration, recoil, and Sparkling Aria when burns cannot occur. Its two-turn probability game retains unknown suffixes as bounds, chooses strategies that secure the corresponding lower bounds, and displays strictly dominated opening actions. These bounds do not claim a solved unlimited-horizon equilibrium. A supported tactical calculation that cannot complete two turns is reported as incomplete rather than silently applying its provisional HP-based action.

Unfinished branches remain lower/upper victory-probability bounds. Only a pure opening equilibrium that remains valid under those bounds overrides the tactical planner. The exact model explicitly rejects unmodeled items, abilities, move callbacks, meaningful secondaries, status, field effects, and insufficient PP. It is not an exhaustive solver for all Pokémon mechanics or a competitive ranking tool.

For unsupported high-variance positions, the sampled fallback evaluates **every** legal opening pair, including setup choices, with equal completed paired samples. Continuations are heuristic. Sample estimates and unresolved mass are displayed separately from exact bounds; neither is mislabeled as a statistical confidence interval.

## Local validation

Build the Showdown revision in `Dockerfile`, then run:

```sh
SHOWDOWN_PACKAGE_PATH=/absolute/path/to/pokemon-showdown npm test
SHOWDOWN_PACKAGE_PATH=/absolute/path/to/pokemon-showdown npm start
```

Regression coverage includes the specified Salamence/Primarina spreads, side and move-order swaps, independent full-engine weighted outcome enumeration, seeded replay, unsupported mechanics, and joint-action sampling. The full four-move regression uses Primarina's Moonblast/Sparkling Aria/Encore/Aqua Jet and Salamence's Double-Edge/Giga Impact/Earthquake/Dragon Dance, including the engine's simultaneous recoil-KO winner rule. All 17 tests pass against the pinned engine revision.

Pokémon Showdown is licensed under MIT. Public deployment on Render (free tier) uses a pinned source revision.

The Mega-timing fallback also ranks candidate attacks using the attacker's **actual
ability on that action**. This preserves Scrappy/Mind's Eye Normal/Fighting
attacks against Ghost while they remain in the base form, and stops treating
them as legal bypasses after evolving. Real damage and effects are still
resolved by Showdown. Entry abilities such as Intimidate are applied by Showdown
before turn one, and those pre-turn events now appear in the UI battle log.
The added test cases cover Mega Kangaskhan's Scrappy and Mega Salamence /
Mega Gyarados Intimidate.

Optional-Mega openings now also attempt an all-actions paired Showdown battle
audit rather than immediately preferring a two-turn HP score. The 10-second
sampling cap and 24-paired-round minimum make this a **sample estimate** with
unresolved-mass bounds, not an exact win-probability certification. If the
sample is insufficient, the older limited tactical fallback remains.
