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

The optional-Mega sampler applies a limited **near-tie** safeguard when
two direct attacks' pessimistic sampled win rates differ by at most two
observed outcomes. Only then, if their observed first-turn damage
meaningfully differs, it uses direct damage as a tie-breaker. This is
explicitly marked as a heuristic and does not imply mathematical proof of
higher win probability.


Follow-up tactic fix: the optional-Mega paired rollouts no longer force
arbitrary repeated attack boosts when the strongest legal attack is already
in plausible finishing range. This corrects the former Leaf Blade -> Swords
Dance and Swords Dance -> Swords Dance continuations that systematically
undervalued direct 2HKO/setup->KO lines. The rough projected-damage gate is
an *action-selection heuristic only*; battle outcomes still come from
Showdown and are not certified optimal win rates. The Sceptile / Bold
Sitrus Primarina matchup is a regression case.


Production CPU-bound Mega timing fix: a paired Showdown rollout is eligible
as a **provisional** opening decision after 4 *complete* rounds for every
action pair, rather than throwing out 5-14 rounds because it did not reach
24. Samples below 24 carry `lowSampleWarning` in the response and UI. They
are not exact probabilities, cannot certify optimality, and have high
sampling uncertainty. In controlled regression scenarios, the optional
`MEGA_TIMING_MAX_SAMPLES=5` setting verifies decisions under the CPU-like
sampling limit on both A/B orientations. This does not hardcode Sceptile
or a move as the chosen action.


## Server-side permanent sample vault

The `sample-library` branch is a separate GitHub storage branch that
does not deploy as the website's `main` branch changes. Each update writes
`data/samples.enc.json` using GitHub's contents API and a SHA check. All
names, species/forms, items, moves, EV/SP investments, nature and both Mega
abilities are saved together. There are no storage files on Render's
ephemeral local filesystem. Saved samples can be loaded from other devices.

The main repository is **public**. The dedicated storage file contains only
AES-256-GCM encrypted JSON (scrypt-derived key with fresh salt and nonce)
and should not be committed as plaintext. Source commits and web deployment
don't reset this data. The GitHub repository's commit history can be used
for recovery if a sample is deleted accidentally.

**Required one-time Render environment variables** in the existing
`champions-singles-lab` web service:

- `SAMPLES_GITHUB_TOKEN`: a **fine-grained GitHub personal access token**
  with **Contents: Read and write** on
  `cj01963794-glitch/champions-singles-lab` only. Generate the token in
  GitHub settings and paste it **directly into Render → Environment**,
  not in chat or any source file.
- `SAMPLES_ACCESS_KEY`: a strong, memorable random password at least
  16 characters long. Keep it private and stable. This both authorizes
  vault access and derives the encryption key. **Changing or losing the
  password prevents decrypting previously stored samples.**

Optional variables (not needed for the default branch):
`SAMPLES_GITHUB_REPO` and `SAMPLES_GITHUB_BRANCH`.

Restart/redeploy the Render service after adding environment variables,
then visit the site, unlock **내 영구 샘플 보관함**, and save A or B.
The password is held only in memory and browser `sessionStorage`, never
`localStorage`. Sample contents are fetched from GitHub through the
server and not stored in the browser-specific draft cache unless loaded
into an editor.

The vault's authenticated endpoints are
`GET /api/sample-library` and `POST /api/sample-library`; both require
`X-Samples-Key`. The public status endpoint
`GET /api/sample-library/status` only reveals whether setup is done.
Save and delete use GitHub's file SHA for concurrent modification
protection, with up to three retry attempts.

This approach avoids paying for an expiring Render Free Postgres instance
or a nonpersistent Render Free Key Value instance. The availability of the
vault still depends on GitHub, the token's validity and the lifetime of
the GitHub repository. No database can guarantee literal perpetuity; make
separate backups of valuable sets when appropriate.
