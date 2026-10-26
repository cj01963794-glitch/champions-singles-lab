# Architecture and process decision log

| Date (KST) | Decision | Rationale | Status |
| --- | --- | --- | --- |
| 2026-10-27 | GitHub repository becomes the persistent **development record**, separate from ChatGPT memory. | Chat context can omit prior plans even in a Project. | Accepted; documentation setup |
| 2026-10-27 | Use `ARCHITECTURE.md`, `DECISIONS.md`, `TEST_CASES.md`, `DEVELOPMENT_LOG.md` and `TRANSCRIPTS/` plus a recovery index. | New sessions can inspect assumptions, context and checkpoints. | Accepted |
| 2026-10-27 | Store the available **original dialogue** separately in this same public repository, not only paraphrased notes. | User wants exact wording retrievable even if the chat is inaccessible. | Accepted, scoped to accessible messages |
| 2026-10-27 | No claim of automatic real-time chat replication. | The assistant cannot detect and automatically push every future message without explicit tool execution. | Constraint |
| 2026-10-27 | Do not invent historical plan text. | Previous chat's exact 5-stage section was not retrievable verbatim in this session. | Accepted |
| 2026-10-27 | Win-plan discovery should rely on general state transitions and opponent counterplay, not matchup-specific hardcoded scripts. | Generalizable play against changing opponents. | Design direction, not certified finished |

## Recording future decisions
Append date, proposer, accepted/rejected/experimental status, exact issue, alternatives, justification, affected files, supporting test evidence, relevant transcript path and commit SHA. Preserve reversals rather than deleting the original decision.
