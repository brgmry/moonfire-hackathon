# 03. Agents inside the sandbox (Allen)

Python 3.12, `claude-agent-sdk`, one process per run, started by the container entrypoint as `python sandbox/main.py`. Everything the agents learn leaves the container as events through `POST /internal/events`; nothing is written to the backend any other way. Three chunks of work.

## Shared: `sandbox/events.py`
`emit(type, **payload)`: appends to an in-memory list and flushes to the backend in batches of 20 or every 500ms, whichever first, with the bearer token. Retries 3 times, then logs and drops. Every agent imports this and nothing else from the backend.

## A3. Orchestrator and chunking (5:00 to 6:00)
`sandbox/orchestrator.py`, Sonnet 5.5, but most of it is plain Python; the model is only asked to choose the install and build commands when the profile is ambiguous.
1. `git clone --depth 50 $REPO_URL /work`. Emit `sandbox.started` is the backend's; the orchestrator's first event is `repo.profile`:
   - `files`: `git ls-files` minus ignores: `node_modules/`, `vendor/`, `dist/`, `build/`, `.next/`, `target/`, `__pycache__/`, `*.min.*`, `*.lock`, `*-lock.json`, `*.generated.*`, `*.snap`, `*.map`, images, fonts, binaries, anything over 200KB.
   - `languages` by extension share of bytes. `packageManager` from lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `uv.lock`, `poetry.lock`, `requirements.txt`, `Cargo.lock`, `go.sum`). `framework` from markers (`next.config.*`, `vite.config.*`, `manage.py`, `pyproject.toml [tool.poetry]`, `Cargo.toml`, `go.mod`). `hasTests` from `test`, `tests`, `__tests__`, `*_test.go`, `*.test.*`, `*.spec.*`. `hasBuild` from a build script or compiler manifest. `stars` from one GitHub API call (unauthenticated is fine).
2. Install: recipe from `MEMORY_JSON` if the manager matches, else the default per manager. `subprocess` with a 180s timeout. Emit `install.done`. Failure is a finding later, not a crash.
3. Chunk: group files by first path segment (and by package in a monorepo: any dir with its own `package.json` or `pyproject.toml`). Split any group over 40 files or 150KB into pieces by sorted path. Compute `churn` per chunk: `git log --since=1.year --name-only --pretty=format:` counted per path. If more than `MAX_CHUNKS`, keep the top by churn, mark the rest `sampled: true` and still emit them so the treemap is complete. Emit `chunk.created` per chunk.
4. Dispatch: `asyncio.Semaphore(MAX_PARALLEL)`. Spawn explorers (one per non-sampled chunk), the claims agent, the compile agent, the run agent and git stats, all as asyncio tasks. Emit `agent.spawned` for each with its `agentId`, `role`, `chunkId`, `model`.
5. Wait for all, with a 540s overall deadline (the job's timeout is 600). Emit `agent.done` for the orchestrator with total tokens. Exit 0.

Done: a local run against a tiny repo emits profile, install, chunks and spawns, visible in Bergen's UI by 6:00.

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
