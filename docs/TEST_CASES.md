# Matchup regression and research catalogue

**Meaning of status:** "Reported" = user discussed behavior or expected strategy; it does NOT establish a validated optimal action. Check actual source tests and battle mechanics before promoting to Verified.

| Scenario | Reported problem / hypothesis | Initial status |
| --- | --- | --- |
| Focus Sash Garchomp vs Dragonite | Dragonite frequently chose Flamethrower instead of expected Draco Meteor; Mega activation issues discussed | Reported; code regression status not checked |
| Indeedee vs Mimikyu | Indeedee attempted Encore on a Mimikyu that had not used a move | Reported; regression status not checked |
| Floette vs Charizard | Long Calm Mind + Synthesis may win but planner used Moonblast and/or wrong Mega timing | Reported; precise set to be verified |
| Mega Sceptile vs Bold Primarina | Delay Mega to preserve pre-Mega typing, then boost and finish with Leaf Blade rather than premature Mega + Rock Slide | User strategy hypothesis; current source must be checked |
| Primarina vs Mega Salamence | Determine if Giga Impact's immediate KO lottery is superior in total match win probability | Reported; full set details in earlier chat |
| Mimikyu vs Corviknight | Repeated Swords Dance and critical-hit Shadow Claw could be the only route without Corviknight's Iron Head | User scenario, conditions need review |
| Garchomp vs Metagross | Ice Punch + Bullet Punch / Iron Defense + Body Press variants change favorable line | Reported |
| Primarina vs Aegislash | Encore, speed investment, and Swords Dance changes action order/value | Reported |
| Dragonite vs Garchomp; opponent's responses | Need reasonable counterplay and match-specific probabilities, not just a first-move damage ranking | General regression objective |

## Template for a verified case
- Case ID and source transcript / issue / commit
- Both complete sets (form, nature, stats/SP, item, ability, moves, HP and field)
- Engine revision, RNG seed / samples, orientation and mechanics assumptions
- Expected line **and its rationale**, alternate counterlines
- Observed outputs, exact/sampled/bounded classification
- Test command, result, confidence / uncertainty, regression commit

Keep user hypotheses separate from test-validated optimal policies.
