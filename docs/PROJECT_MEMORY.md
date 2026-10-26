# Project recovery entry point

Established: **2026-10-27 (Asia/Seoul)**  
Repository: `cj01963794-glitch/champions-singles-lab` (public)  
Initial source-code checkpoint observed: `82f97bc033394421679f9d2ff7b9bf98dfac2907` (last checked during documentation setup).

## When a conversation becomes too long or a new chat starts
1. Read this entry point and the four companion files under `docs/`.
2. Read the **single ongoing development-dialogue log** `docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md` for new preserved dialogue. Older separate files in `docs/TRANSCRIPTS/` remain for historical links; not every ChatGPT message is automatically retrievable.
3. Verify the repository state with `README.md`, actual source/test files, and Git history.
4. Continue development from actual code, not the assistant's recollection.
5. Make a new explicit backup commit of development documentation and any available transcript after substantive sessions.


## Transcript storage rule (updated 2026-10-27)
**Do not create one backup transcript file per message/chat.** Always append further available development dialogue to existing `docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md`, with ordered dated speaker sections and clear exact-quote vs summary labeling. Use a new GitHub commit updating the same file. Previously created separate historical files remain for existing links. Not automatic live sync.

## Long-term purpose
Create a Pokémon Champions single-battle 1v1 matchup engine that tests plausible moves and multi-turn policies with correct mechanics; discovers win plans without hardcoded matchup scripts; considers the opponent's optimal or strategically rational counterplay; exposes probabilities, limitations, conditions, and reproducible sequences.

## Previously raised trouble spots
Dragonite choosing Flamethrower instead of Draco Meteor into Focus Sash Garchomp; optional Mega evolution ignored or mistimed; Indeedee using Encore before Mimikyu has acted; Floette missing long Calm Mind + Synthesis against Charizard; Mega Sceptile opting into changed typing and wrong move against Primarina; Salamence/Primarina Giga Impact lottery comparison; short-sighted boosts, moves and probabilistic planning.

## Provenance warning
A prior chat contained a numbered section titled **"5. 이걸 실제 코드로 만들 계획"**, but the full original wording was *not available to this session*. Do not reconstruct it as a verbatim quote. Preserve it if the original is provided later.

## Storage expectation
GitHub commits persist development documents and exact conversation excerpts copied there. **Not automatic live sync** and not a guaranteed full ChatGPT history export. User explicitly chose to store development-related conversation originals in this public repository, acknowledging visibility.

## Latest design status after new-chat discussion (2026-10-27)
The previously proposed small **strategy analyzer** (state-change analysis → important issue discovery → strategy generation → counterplay) was **explicitly withdrawn** after the user challenged its implementability. Only the state-difference calculations were judged straightforward; there is no substantiated general algorithm for selecting strategically important differences without falling back on costly search or hand-built heuristics. **Do not present the strategy-analyzer experiment as an agreed next implementation step.** The user strongly rejects speculative architectures and repeated case-by-case patches. Before recommending coding, provide an executable, falsifiable core algorithm and clear reasons to believe it addresses the circularity. No implementation was made. Transcript recovery: `docs/TRANSCRIPTS/2026-10-27-direction-discussion-01.md`.
