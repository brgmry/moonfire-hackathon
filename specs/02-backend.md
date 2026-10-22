# 02. Backend (Allen)

Node 22, TypeScript, Hono. One container on Cloud Run (`--max-instances 1`, `--min-instances 1`, `--no-cpu-throttling`). Akshay deploys it; this spec is the code. Three chunks of work, in order.

## A1. Run API, event log, SSE (5:00 to 5:45)
- `src/runs.ts`: in-memory `Map<runId, RunState>` plus `events: Event[]` per run. `appendEvent(runId, event)` assigns `seq`, applies the reducer, appends to the array, writes the line to `gs://$GCS_BUCKET/runs/<id>.jsonl` (fire and forget, `@google-cloud/storage`), and broadcasts to every open SSE connection for that run.
- `src/reducer.ts`: `apply(state, event) → state`. One function, one switch over the event types in `specs/00-contract.md`. The frontend's reducer mirrors it, so keep it boring.
- `src/sse.ts`: `GET /runs/:id/events` writes every stored event, then holds the connection in a `Set`, `: ping\n\n` every 30s, removes on close. `presence.join` on connect with `?name=`, `presence.leave` on close.
- `src/internal.ts`: `POST /internal/events` checks the bearer token, numbers and appends each event in order, returns the last `seq`.
- `POST /runs` creates the state, emits `run.created`, calls `runner.start(run)`. `POST /runs/:id/actions` emits the action as an event and, for `rerun_chunk`, calls `runner.rerunChunk`.
- `src/runner/index.ts`: interface `{ start(run), rerunChunk(run, chunkId) }`. `mock.ts` streams `frontend/fixtures/run.jsonl` through `appendEvent` with the fixture's timing. `cloudrun.ts` calls `JobsClient.runJob` (`@google-cloud/run`) with container overrides for `RUN_ID`, `REPO_URL`, emits `sandbox.started`. `local.ts` spawns `python sandbox/main.py` on the laptop with the same env. Pick with `RUNNER=mock|cloudrun|local`.
- On boot: list `runs/*.jsonl` in the bucket, replay each through the reducer, so a restart loses nothing.
- Done: `curl -N localhost:8080/runs/<id>/events` shows the fixture streaming. Bergen's UI renders it.

## A2. Scorer and writer (5:45 to 6:45)
- `src/validate.ts`: on `finding.added`, check `file` is in `profile.files`, check `quote` is non-empty and under 300 chars. Fail: emit `finding.dropped` with the reason and mark `valid: false`. Do not block the event; drop after.
- `src/score.ts`: pure function `score(state) → { total, dimensions: { name: { points, max, top: [findingId] } } }` implementing the rubric in `00-contract.md` exactly. Recompute on every `finding.added`, `finding.dropped`, `claim.added`, `compile.done`, `run.done`. Emit `score.updated` only for dimensions whose points changed. Unit test it against the fixture: the fixture's expected total is written in the fixture file header.
- `src/writer.ts`: on `run.finished` (or when every spawned agent is done), one Sonnet call with a static system prompt: eight sentences, one per dimension, each must cite a `file` from the findings; a sentence citing nothing is dropped. Then `report.ready` with the markdown and the token totals summed from every `agent.done` plus the writer's own usage. `costGbp` from the model price table, hard-coded tonight.
- `src/memory.ts`: `memory.json` in the bucket: `{ runsByRepoCommit: { "owner/repo@sha": { score, findings, claims } }, recipes: { pnpm: "corepack enable && pnpm i", poetry: "...", ... }, doNot: ["..."] }`. On `POST /runs`, if the repo's HEAD sha (one GitHub API call) matches a stored run, replay its findings as `memory.hit` per chunk and skip the sandbox. After `install.done` with `ok`, store the manager and command as a recipe. After `finding.dropped` with `classifier_disagreed`, store the note as a doNot line (keep three). The sandbox receives recipes and doNot lines in its env as `MEMORY_JSON`.
- Done: score from real findings on a local run by 6:45. Fixture test passes.

## A3. Glue and hardening (6:45 to 7:30)
- `run.finished` logic: `complete` when every agent is done and the writer ran; `partial` on sandbox timeout (10 min, a timer started at `sandbox.started`) with whatever landed; `failed` if `install.done.ok` is false and no explorer produced a finding.
- Rate limit guard: if the sandbox posts more than 50 events a second, buffer and flush every 250ms.
- `GET /runs/:id` returns the state; `lastSeq` included.
- Structured logs to stdout, one JSON line per event, so Cloud Logging shows the run.

## Keys (`src/keys.ts`)
Implements the key pool in `00-contract.md`. It loads `ANTHROPIC_API_KEYS` and `ANTHROPIC_KEY_BUDGETS` plus `keys.json` from the bucket. `ranked()` gives the healthy keys, most credit left first. `weights()` gives the sandbox its share string. `record()` runs on every `agent.done` except in mock runs, at the model's price, against `e.key` or the run's primary key. `markExhausted` and `coolDown` react to API errors, and `key.exhausted` events from the sandbox also mark a key exhausted. The local runner passes the whole pool to `sandbox/main.py`. The Cloud Run runner passes only the weights, since the job has the secret.

## Env
`PORT`, `INTERNAL_TOKEN`, `ANTHROPIC_API_KEYS` (or `ANTHROPIC_API_KEY`), `ANTHROPIC_KEY_BUDGETS`, `GCS_BUCKET`, `RUNNER`, `GCP_PROJECT`, `GCP_REGION=europe-west2`, `JOB_NAME=tester`, `CORS_ORIGIN`.

## Done means
Fixture streams by 5:45. Real score by 6:45. Replay after a restart works. `curl` from a phone on 4G reaches the Cloud Run URL and sees events.
