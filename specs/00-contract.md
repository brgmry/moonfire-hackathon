# 00. Contract: the shapes every part agrees on

Change this file and tell the other two. Nothing else is shared.

## Run API (backend, Cloud Run service)
| Method | Path | Body | Returns | Caller |
|---|---|---|---|---|
| `POST` | `/runs` | `{ repoUrl, by }` | `{ id }` | frontend |
| `GET` | `/runs/:id` | | full state (below) | frontend, on focus |
| `GET` | `/runs/:id/events` | | SSE: replay of every event, then live. `: ping` comment every 30s | frontend |
| `POST` | `/runs/:id/actions` | `{ type: "rerun_chunk" \| "pin", chunkId?, findingId?, by }` | `{ ok }` | frontend |
| `POST` | `/internal/events` | `{ runId, events: [event, ...] }` with `Authorization: Bearer <INTERNAL_TOKEN>` | `{ ok, seq }` | sandbox |
| `GET` | `/healthz` | | `ok` | Cloud Run |

CORS: allow the Vercel origin and `http://localhost:3000`. SSE sets `Cache-Control: no-cache`, `X-Accel-Buffering: no`.

Wire shape note: the sandbox may send `repo.profile`, `compile.done`, `run.done` and `contributors` with their fields flat, as listed below. The backend broadcasts them nested, as `packages/contract` types them: `{ profile }`, `{ result }`, `{ result }`, `{ contributors }`. `GET /runs/:id` returns the backend state plus `events`, so a client can rebuild state with the shared reducer.

## Event envelope
```json
{ "seq": 41, "ts": "2026-10-22T18:12:03.120Z", "runId": "r_8f3k", "type": "finding.added", "...": "payload" }
```
`seq` is assigned by the backend, monotonic per run. The sandbox sends events without `seq`; the backend numbers them. Clients drop any `seq` they have seen.

## Event types
| type | payload | from |
|---|---|---|
| `run.created` | `repoUrl, by` | backend |
| `presence.join` / `presence.leave` | `name` | backend |
| `sandbox.started` | `executionId, runner: "cloudrun" \| "local" \| "mock"` | backend |
| `repo.profile` | `name, defaultBranch, commit, stars, languages: {ts: 61, py: 39}, packageManager, framework, hasTests, hasBuild, hasDockerfile, fileCount, files: [paths]` | orchestrator |
| `install.done` | `ok, manager, durationMs, errorsTail` | orchestrator |
| `chunk.created` | `chunk: { id, path, files: [paths], bytes, churn, sampled: bool }` | orchestrator |
| `agent.spawned` | `agentId, role, chunkId?, model` | orchestrator |
| `agent.working` | `agentId, file` | any agent |
| `agent.done` | `agentId, tokens: { in, out, cacheRead }, key?` (key name that paid) | any agent |
| `key.exhausted` | `key, error: "billing_error" \| "authentication_failed"` | sandbox (the UI may ignore it) |
| `finding.added` | `finding` (shape below) | explorer, classifier |
| `finding.dropped` | `findingId, reason: "file_not_in_repo" \| "classifier_disagreed" \| "quote_not_found"` | backend, classifier |
| `claim.added` | `claim` (shape below) | claims agent |
| `compile.done` | `compiles, command, durationMs, buildSizeBytes, warnings, errorsTail` | compile agent |
| `run.done` | `runs, kind: "cli" \| "api" \| "web" \| "lib", testsPassed, testsFailed, endpointsOk, endpointsTotal, errorsTail` | run agent |
| `app.screenshot` | `url` (public GCS URL) | run agent |
| `contributors` | `authors: [{ name, email, commits, lines, chunks: { chunkId: lines } }], truncated: bool, fork: bool` | git stats |
| `score.updated` | `dimension, points, max, top: [findingId x3]` | backend |
| `report.ready` | `score, dimensions: {...}, markdown, tokens: { in, out, cacheRead, costGbp }` | backend writer |
| `memory.hit` | `chunkId, source: "run <id>"` | backend |
| `run.finished` | `status: "complete" \| "partial" \| "failed", reason?` | backend |

Roles: `orchestrator`, `explorer`, `claims`, `compiler`, `runner`, `classifier`, `git`, `writer`.

## Finding
```json
{ "id": "f_0192", "agentId": "a_explorer_03", "chunkId": "c_src_api",
  "dimension": "dead_code | architecture | quality | tests | security | docs",
  "severity": "good | minor | major",
  "file": "src/api/auth.ts", "line": 42,
  "quote": "export function legacyToken() {", "note": "exported, never imported anywhere in the repo",
  "valid": true }
```
Rules: `quote` is at most 3 lines copied verbatim. `file` must appear in `repo.profile.files` or the backend drops it. `severity: good` is a positive finding and counts for architecture and quality.

## Claim
```json
{ "id": "k_04", "text": "Supports OAuth login with Google and GitHub", "readmeLine": 31,
  "status": "delivered | partial | missing", "evidenceFile": "src/auth/oauth.ts", "quality": 3,
  "note": "Google works, GitHub provider is a stub returning 501" }
```

## Rubric (backend computes, sandbox never sends a score)
| Dimension | Max | Formula |
|---|---|---|
| `claims` | 25 | `15 × delivered/total + 10 × meanQuality/5`. No README: 0 with note. |
| `runs` | 15 | starts: 5. Tests: `10 × passed/(passed+failed)`; no tests: 3. API: `10 × endpointsOk/endpointsTotal`. |
| `compiles` | 10 | compiles: 7. Zero warnings: 3. No build system: 5 with note. |
| `quality` | 15 | `15 - 2 × major - 0.5 × minor + 0.5 × good`, clamp 0..15 |
| `architecture` | 10 | `10 - 2 × major - 0.5 × minor + 0.5 × good`, clamp 0..10 |
| `tests` | 10 | test files present: 4. Pass rate × 6. |
| `dead_code` | 5 | `5 - 1 × major - 0.25 × minor`, clamp |
| `security` | 5 | `5 - 2 × major - 0.5 × minor`, clamp |
| `docs` | 5 | `5 - 1 × major - 0.25 × minor`, clamp |

Findings with `valid: false` are excluded. Sampled chunks scale `quality`, `architecture`, `dead_code` by covered bytes / total bytes and the report says "sampled 24 of 61 chunks".

## Run state (`GET /runs/:id`)
```json
{ "id": "r_8f3k", "repoUrl": "...", "status": "created | running | complete | partial | failed",
  "profile": {}, "chunks": [], "agents": [], "findings": [], "claims": [], "compile": {}, "run": {},
  "contributors": {}, "score": { "total": 67, "dimensions": {} }, "report": "", "tokens": {},
  "presence": ["Bergen", "judge-7"], "lastSeq": 412 }
```

## Sandbox environment variables
`RUN_ID`, `REPO_URL`, `API_URL`, `INTERNAL_TOKEN`, `ANTHROPIC_API_KEYS`, `ANTHROPIC_KEY_WEIGHTS`, `MAX_CHUNKS=24`, `MAX_PARALLEL=8`, `GCS_BUCKET`, `MEMORY_JSON`, optional `RERUN_CHUNK`. `ANTHROPIC_API_KEY` still works as a pool of one.

## API key pool (three keys, balanced by credit left)
We each bring a key and run on all three.
- Secret `anthropic-keys` holds `allen:sk-ant-...,bergen:sk-ant-...,akshay:sk-ant-...`. It is mounted as `ANTHROPIC_API_KEYS` on the service and on the job.
- `ANTHROPIC_KEY_BUDGETS=allen:25,bergen:25,akshay:10` on the service is the USD credit each key had at the start. No API reports a key's balance, so the backend tracks spend per key from token usage × the price table and keeps it in `gs://$GCS_BUCKET/keys.json`.
- The backend writer uses the key with the most credit left. On a 429 it cools that key for 30s and tries the next. On 401, 403, 402 or "credit balance too low" it marks the key exhausted for an hour and tries the next.
- Per execution the backend passes `ANTHROPIC_KEY_WEIGHTS=allen:0.52,bergen:0.31,akshay:0.17`: names and each key's share of the credit left, never the keys themselves. Every sandbox query picks a key by weight, so load and rate limits spread across the three accounts. On `billing_error` or `authentication_failed` the sandbox drops that key for the run and emits `key.exhausted`. On `rate_limit` it cools the key for 30s. Agents that do not pick per query get the highest-weight key as `ANTHROPIC_API_KEY`.
- `agent.done` carries `key` (the key's name) so spend lands on the right person; without it the run's primary key pays.
- `GET /keys` returns `[{ name, budgetUsd, spentUsd, remainingUsd, status: "ok" | "cooling" | "exhausted" | "spent" }]`, no secrets.

## Models
`claude-sonnet-5-5`: orchestrator, compiler, runner, writer. `claude-haiku-5-5`: explorer, claims, classifier. Static system prompts, same tool order every call, so prompt caching hits.
