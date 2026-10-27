# Architecture and process decision log

| Date (KST) | Decision | Rationale | Status |
| --- | --- | --- | --- |
| 2026-10-27 | GitHub repository becomes the persistent **development record**, separate from ChatGPT memory. | Chat context can omit prior plans even in a Project. | Accepted; documentation setup |
| 2026-10-27 | Use `ARCHITECTURE.md`, `DECISIONS.md`, `TEST_CASES.md`, `DEVELOPMENT_LOG.md` and `TRANSCRIPTS/` plus a recovery index. | New sessions can inspect assumptions, context and checkpoints. | Accepted |
| 2026-10-27 | Store the available **original dialogue** separately in this same public repository, not only paraphrased notes. | User wants exact wording retrievable even if the chat is inaccessible. | Accepted, scoped to accessible messages |
| 2026-10-27 | No claim of automatic real-time chat replication. | The assistant cannot detect and automatically push every future message without explicit tool execution. | Constraint |
| 2026-10-27 | Do not invent historical plan text. | Previous chat's exact 5-stage section was not retrievable verbatim in this session. | Accepted |
| 2026-10-27 | Win-plan discovery should rely on general state transitions and opponent counterplay, not matchup-specific hardcoded scripts. | Generalizable play against changing opponents. | Design direction, not certified finished |

| 2026-10-27 | Use an existing **single append-only transcript file** `docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md`; stop creating a new transcript per turn. Keep older files for link preservation. | User prefers one continually updated archive instead of proliferating backup files. | Accepted and implemented; GitHub update required for each backup, not automatic live sync |

## Recording future decisions
Append date, proposer, accepted/rejected/experimental status, exact issue, alternatives, justification, affected files, supporting test evidence, relevant transcript path and commit SHA. Preserve reversals rather than deleting the original decision.


| 2026-10-27 | External AI algorithms only; Stage 1B isolated, Legacy and current Champions data authoritative | User explicitly directs that Foul Play/Metamon/etc. are optional methodology references, not Pokémon/move/translation databases, and that deployment keeps original Legacy untouched and default while new work lands only in Stage 1B. Verified server and UI model separation; shared functions remain a regression hazard. | Binding architecture requirement; no source modifications in this turn |


| 2026-10-27 | Superseding decision: discard existing Experimental and replace Stage 1B from scratch; never modify Legacy without separate explicit approval. | User corrected preceding assumption: existing Experimental is rejected outright, not a starting point for incremental enhancement. Preserve the existing `experimental` API/UI slot, canonical Champions battle/translation data, and Legacy as unaltered default; historical old Experimental recoverable through Git. | Binding; replaces earlier 'improve existing Stage 1B' implication; no runtime code change requested yet |
