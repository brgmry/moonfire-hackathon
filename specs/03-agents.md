# 03. Agents inside the sandbox (Allen)

Python 3.12, `claude-agent-sdk`, one process per run, started by the container entrypoint as `python sandbox/main.py`. Everything the agents learn leaves the container as events through `POST /internal/events`; nothing is written to the backend any other way. Three chunks of work.

## Shared: `sandbox/events.py`
`emit(type, **payload)`: appends to an in-memory list and flushes to the backend in batches of 20 or every 500ms, whichever first, with the bearer token. Retries 3 times, then logs and drops. Every agent imports this and nothing else from the backend.

## A3. Orchestrator, planner and chunking
`sandbox/orchestrator.py` runs the steps in plain Python. The split is decided by `sandbox/planner.py`: Opus 5.5 (`claude-opus-5-5`) at medium effort, with Read, Grep and Glob, 12 turns, a 120s cap and a JSON schema for its output (`prompts/planner.md`).
1. Clone `--depth 50`. A ref pinned in the URL (`/tree/<ref>`, `#<sha>`, `@<ref>`) is fetched exactly. Emit `repo.profile` (file list after ignores, languages, package manager, framework, tests, build).
2. Start the default install in the background (a memory recipe if one exists, else the default for the package manager), and start the claims agent. Neither needs the plan.
3. Plan. The planner sees the profile, the default install command, the file list with sizes and one-year churn (directories to depth 3 for repos over 300 files) and the README head, and may peek at files. It returns:
   - `chunks`: each with `name`, `paths` (directory prefixes or files), `focus` (what its explorer must check) and `priority` (1 to 5);
   - `skip`: vendored, generated, fixture and docs paths;
   - `kind`: `cli`, `api`, `web` or `lib`;
   - `install`: a command, empty when the default is right;
   - `summary`: one sentence on what the repo is.
4. Code turns the plan into a partition. Each file goes to the chunk with the longest matching path. Unmatched files form per-folder chunks at priority 1. Skipped paths become `sampled` chunks, so the treemap stays complete. Any chunk over 40 files or 150KB is split by sorted path. If more than `MAX_CHUNKS` remain, the highest priority (then churn) get explorers and the rest are `sampled`. `chunk.created` carries `name`, `focus` and `priority` besides the contract fields. If the planner fails, times out or returns nothing usable, the rule-based chunker runs instead (first path segment or monorepo package, split by size, top 24 by churn).
5. Install fallback: if the default install failed, or there was none, and the plan has an `install` command, run that once.
6. Dispatch with `asyncio.Semaphore(MAX_PARALLEL)`:
   - one explorer per non-sampled chunk, with its `focus` in the user turn;
   - git stats;
   - after the install, the compiler, and the runner with `ctx["plan"]["kind"]` as its kind;
   - after the explorers, the classifier.
   Every agent is supervised: a crash or hang still emits `agent.done`.
7. The 540s overall deadline still applies. The orchestrator's `agent.done` carries the planner's tokens and key.

`RERUN_CHUNK` plus `RERUN_CHUNK_JSON` (the chunk from the backend's state) re-explore one chunk.

Done: python-slugify, json-server and flask plan in about 15s for about 5 cents each, with every file in exactly one chunk.

## A4. Explorer and claims agent (6:00 to 6:45)
`sandbox/explorer.py`, Haiku 5.5, one `query()` per chunk with a static system prompt and tools `Read`, `Grep`, `Glob` only (no Bash, no Write). The prompt carries the rubric dimensions, the finding JSON shape, the chunk's file list and the doNot lines from memory. Instruction: read every file in the list, emit a finding for anything notable, up to 12 per chunk, at least one `good` if the code deserves it, quotes verbatim, no prose. Output is parsed as a JSON array; a parse failure retries once with "output JSON only". Each finding gets an `id`, `agentId`, `chunkId` and goes out as `finding.added`. Emit `agent.working` on every file read (hook on the `Read` tool), `agent.done` with usage at the end.

`sandbox/claims.py`, Haiku 5.5. Reads `README.md` (first 400 lines plus any section whose heading matches install, usage, features, quick start, benchmark). Lists feature claims as single lines with their README line number. Then, with `Grep` and `Glob` over the whole repo, decides `delivered | partial | missing` and `quality` 1..5 with an `evidenceFile`. Emits `claim.added` per claim, at most 20. No README: emits nothing; the backend scores `claims` 0 with a note.

Done: real findings and claims from a real repo in the score by 6:45.

## A5. Classifier (stretch, 7:00 to 7:20)
`sandbox/classifier.py`, Haiku 5.5, structured output. Runs after every explorer finishes, over all findings in batches of 20. Input per finding: `quote`, `note`, `file`. Output per finding: `{ id, dimension, severity, valid }` from the enums only, `valid: false` when the quote does not support the note. Disagreement on `dimension` or `severity` with the explorer, or `valid: false`, emits `finding.dropped` with `classifier_disagreed`. Emit `agent.spawned` / `agent.done` so the judge avatar shows on screen.

## Keys (`sandbox/keys.py`)
`keys.load()` runs first in `main.py`. Each `llm.ask` picks a key by `ANTHROPIC_KEY_WEIGHTS` and passes it to `query()` through `ClaudeAgentOptions(env=...)`. If the message stream reports `billing_error`, `authentication_failed` or `rate_limit`, the query moves to the next key. A dead key is reported as `key.exhausted`. `agent.done` carries the name of the key that paid.

## Prompts
`sandbox/prompts/*.md`, one file per role, static. The only variable content goes in the user turn. Keep tool order identical across calls. This is what makes the cache ratio on screen real.

## Done means
A tiny repo (one of Akshay's three) produces a profile, chunks, 10 or more valid findings, claims, and a score, end to end from the Cloud Run job, by 7:00.
