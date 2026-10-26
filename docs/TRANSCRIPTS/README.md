# Conversation archive / 대화 원문 보관

This directory stores **verbatim excerpts** and development conversation records that were visible to the assistant and deliberately committed. The user explicitly chose to allow project-related dialogue text in this **public** repository on 2026-10-27.

## Recording requirements
- Preserve words, typos, punctuation and original speaker labels. Do not silently "correct" a transcript.
- State an archive's scope: full supplied transcript, full saved message, or selected verbatim excerpts. Label **omitted** messages plainly; never call a partial record a complete transcript.
- Retain timestamps only when independently known; otherwise use the session date, and say exact message times are unknown.
- Keep development summaries in `docs/DECISIONS.md` or `docs/DEVELOPMENT_LOG.md` rather than merging a paraphrase into a quoted transcript.
- Do not commit secrets, passwords, tokens or unrelated sensitive/third-party personal data even though the user accepts the public nature of this repository.
- Backup is performed by actual Git commits on a per-session basis, NOT automatically for every incoming message.
- If a user provides exported full chat files, save exact contents only after checking for unsafe or sensitive data and labeling their true provenance; do not infer missing chat replies from memory.

## Recover
Open this directory, consult the relevant transcript, then `docs/PROJECT_MEMORY.md` and the Git commit history. A preserved excerpt does not imply that all ChatGPT messages from the day are available.
