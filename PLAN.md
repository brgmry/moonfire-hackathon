# README vs Reality

Moonfire Build Night, Thu 22 Oct 2026. Sparkles Cloud Crew track. Team: Bergen, Allen, Akshay.

Someone in the room names a public GitHub repo. A crew reads the README, turns every claim into a test, runs each test in its own sandbox, rejects any verdict that has no run log, and ships a report card: claim by claim, pass or fail, with the commands and the log behind it. The run is a URL. Everyone's phone shows the same cards.

**Pitch line:** "Every README is a pitch deck. We put each claim in a clean sandbox and ran it."

## Why this one
- The sandbox is doing the thing it was built for: running a stranger's code. Not search and writing.
- Moonfire is a VC. This is technical diligence, and a startup could sell it to VCs (Sagar).
- Every line on screen has a log behind it and a reviewer that rejected the ones that didn't (Adriaan, Mike).
- No outbound web needed beyond cloning the repo. Allen's idea 1 needs the open web; nobody can confirm the sandbox has it.

## The crew
1. **Splitter** (Claude call, orchestrator): reads the README, returns up to 6 testable claims. Each claim: the README line it came from, the test to run, pass criteria.
2. **Testers** (one Sparkles sandbox per claim): clone, install, run, measure. Return `result.json`: verdict, commands, exit codes, log excerpt, evidence.
3. **Reviewer** (Claude call, orchestrator): rejects a verdict if the log is missing, the commands don't test the claim, or the pass criteria weren't met by what the log shows. One rerun per claim, then marked "unverified".
4. **Writer** (Claude call, orchestrator): a short due-diligence report from accepted verdicts only.

Claims the splitter is allowed to make testable: installs in one command, tests pass, CLI runs with the documented flags, documented example works, "X times faster than Y" (benchmark both), supports language or runtime version Z, builds from source. Anything that needs a GPU, Docker-in-Docker, a paid API key or more than 3 minutes is tagged `untestable` and shown as such, not skipped.

## Architecture
Loop on our side, sandboxes disposable. One Node process on Allen's laptop behind a Cloudflare tunnel. State is an in-memory event log per run, written to `runs/<id>.jsonl` on every event so a crash replays.

```
phone / projector  --SSE-->  orchestrator (Node)  --REST-->  Sparkles sandboxes
                   <-POST--        |                            (one per claim)
                                   +-- Claude: splitter, reviewer, writer
                                   +-- memory store (runs/memory.json)
```

Runner is an interface, three implementations, same shape:
- `mock`: emits canned results from a fixture. Built first. Demo fallback.
- `sparkles`: `POST /api/public/v1/sandboxes` with the target repo and the tester prompt, follow `/events/stream`, fetch `result.json` via `/files/download`.
- `local`: `claude -p` in a temp dir on the laptop. Fallback if Sparkles is slow or blocked.

Decision at 6:45pm: if a Sparkles run takes over 20 minutes or the API is blocked, switch to `local` and say so in the pitch.

### Run API
- `POST /runs` `{ repoUrl, by }` → `{ id }`
- `GET /runs/:id/events` → SSE, full replay then live, heartbeat comment every 30s
- `GET /runs/:id` → current state, clients call it on tab focus
- `POST /runs/:id/actions` `{ type, claimId, by }` → applied, broadcast. Types: `rerun`, `mark_unverified`, `pin`

### Events
Every event `{ seq, ts, runId, type, ...payload }`. `seq` monotonic per run.

| type | payload | from |
|---|---|---|
| `run.created` | `repoUrl, by` | orchestrator |
| `presence.join` / `presence.leave` | `name` | orchestrator |
| `readme.loaded` | `lines, stars, language` | orchestrator |
| `claim.added` | `claim: { id, text, readmeLine, test, criteria, testable }` | splitter |
| `claim.testing` | `claimId, sandboxId, runner` | orchestrator |
| `claim.result` | `claimId, verdict: pass \| fail, commands[], exitCodes[], logTail, evidence, durationMs` | tester |
| `claim.rejected` | `claimId, reason, attempt` | reviewer |
| `claim.accepted` | `claimId` | reviewer |
| `claim.unverified` | `claimId, reason` | reviewer |
| `memory.hit` | `claimId, source: "previous run <id>" \| "install recipe"` | orchestrator |
| `report.ready` | `markdown, score: { pass, fail, unverified }` | writer |

### Claim card
```json
{
  "id": "k_01",
  "text": "Installs with a single pip install",
  "readmeLine": 12,
  "test": "pip install . in a fresh venv, import the package",
  "criteria": "exit 0 and import succeeds",
  "testable": true,
  "status": "queued | testing | rejected | accepted | unverified",
  "verdict": null,
  "commands": [],
  "logTail": "",
  "attempts": 0,
  "memory": null
}
```

### Tester prompt (fixed text, cached)
Static system prompt, static tool order, the claim JSON is the only variable. The tester writes `result.json` and `run.log` to the repo root and ends. It returns nothing else. Logs stay in files; the orchestrator reads the last 60 lines plus any line matching `error|fail|traceback|exception` and that is all the reviewer ever sees.

## Token optimisation and memory (Bergen)
Named in the pitch as "why this runs all night for the cost of a coffee".

**Tokens**
- Fixed prefixes on splitter, reviewer, writer and tester prompts so prompt caching hits on every call. Measure cache read vs write tokens from the API response and show the ratio on the report.
- README trimmed to the first 400 lines plus any heading that contains install, usage, benchmark, test, quick start.
- Splitter capped at 6 claims. Reviewer sees `logTail` only, never the full log.
- Model split: Sonnet for splitter and tester, Opus only for the reviewer. Writer on Sonnet.
- A token counter on the run: total in, total out, cache hits. One number on screen at the end.

**Memory** (`runs/memory.json`, loaded into a short block in the orchestrator prompts)
- Claim verdicts by `repo@commit + claim text`. Same repo named twice in the room: the second run shows `memory.hit` cards instantly and only re-tests what changed. This is the always-on story: the crew remembers.
- Install recipes by ecosystem, learned from accepted runs: "pnpm repos need corepack enable", "poetry repos: poetry install --no-root". The tester gets the matching recipes in its prompt.
- Rejection patterns from the reviewer, fed back to the tester prompt as "do not" lines. Three max, most recent.

## Frontend (Bergen)
Next.js, one page at `/run/<id>`, `next dev` behind the tunnel, no Vercel. One `EventSource`, resync on focus. Dark, large type, readable from the back of the room on a projector and on a phone.
- Top: repo name, stars, a live score strip (pass / fail / unverified / testing).
- Claim cards stream in. Testing cards pulse. A rejected card shakes and shows the reviewer's reason, then re-tests. Accepted cards go green or red.
- Tap a card: the README line, the commands run, exit codes, the log tail, the reviewer's note. That is the audit trail and the report.
- Presence chips. Token counter in the corner. QR for the run URL on the projector view (`/run/<id>?stage=1` hides the drawer, enlarges cards).
- `/` is a single input: paste a GitHub URL, press go.

## Sandboxes (Akshay)
- 5:00 sharp: one key, GitHub App installed on our org, one empty repo, one test sandbox. Time create → first event → done. Fire 4 at once to find the concurrency cap.
- Find out how a sandbox gets the target repo: pass it in `repos` if the App can see public repos, else fork it into our org first and pass the fork. Test both. Whether the sandbox has outbound network for `pip install` and `npm install` is the single biggest unknown; test it in the first sandbox.
- Build `runner/sparkles.ts` behind the runner interface. Then `runner/local.ts` behind the same interface.
- Pre-pick 3 demo repos and 1 backup, all tested end to end by 7:00: installs under 60s, tests under 2 min, README with at least 4 concrete claims, no GPU, no Docker. One of them should have a claim that actually fails.

## Orchestrator (Allen)
- `POST /runs`, SSE replay and stream, jsonl log. 30 min, before any agent.
- Mock runner and a fixture run so Bergen has events to render by 5:45.
- Splitter, then reviewer, then writer, each a Claude call with a fixed system prompt. Reviewer gate must actually reject something in the fixture.
- Queue: claims dispatched up to the concurrency cap, a rerun jumps the queue.
- Wire the runner interface to Akshay's implementations.

## Responsibilities
| | Owns | Done means |
|---|---|---|
| **Bergen** | Next.js client, token optimisation, memory store, pitch and story, demo repo choice with Akshay | Phones and projector render the full fixture run by 6:15. Cache ratio and token count on screen. Second run of the same repo shows memory hits. Pitch rehearsed twice. |
| **Allen** | Orchestrator, event log, splitter, reviewer, writer, queue, tunnel | Fixture run streams end to end by 5:45. Real claims from a real README by 6:30. Reviewer rejects a bad verdict live. |
| **Akshay** | Sparkles key and GitHub App, runner interface and both implementations, demo repos, 6:45 Sparkles-or-local call | One real sandbox returning `result.json` by 6:00. Four in parallel by 6:30. Three demo repos pass end to end by 7:00. |

Shared: this file is the contract. Change it by editing it and telling the other two.

## Timeline (shift by one hour if hacking starts at 6)
- 5:00 Akshay Sparkles test. Allen run API. Bergen Next.js skeleton against a hand-written event file.
- 5:45 Fixture run streams to phones. First integration point.
- 6:00 First real sandbox result.
- 6:30 First real README end to end. Memory and token counter in.
- 6:45 Sparkles or local decision.
- 7:00 Three demo repos pass. Record the cleanest run as a backup video.
- 7:30 Code freeze. Rehearse the pitch twice, once with the backup video.
- 7:45 Start the showcase run on the chosen repo so it is live on phones by 8:15.

## Demo (2:30)
- 0:00 "Every README is a pitch deck." Ask the room for a repo, or take the pre-picked one. URL and QR on screen.
- 0:20 Claims appear on every phone. Six cards, two already queued in sandboxes.
- 0:45 First results. One card goes red: "README says tests pass. 3 of 41 failed. Log line 212."
- 1:10 Reviewer rejects a verdict live: "no run log, rerun". Card shakes, re-tests, comes back green with a log.
- 1:40 Report on screen: score strip, token count, cache ratio. "Ran for 11p."
- 2:00 Paste the same repo again. Memory hits: cards fill instantly, only the changed claim re-tests. Close the laptop. Phones keep streaming.
- 2:20 "This is technical diligence a VC pays an associate a day for. It runs itself."

## Risks
- Sandbox has no outbound network: the tester cannot install. Test first. Fallback is the local runner and a vendored repo.
- Install blows the demo window: pre-picked repos only, 3 minute cap per claim, `unverified` on timeout.
- Every claim passes and the demo is flat: pick a repo with one honestly false claim.
- Reviewer never rejects: seed the fixture with a logless verdict so the gate fires on stage.
- Credits run out in rehearsal: ask about event credits at 5:00, keep 2 runs unrevealed as backups.
- Rules on pre-built code: everything written tonight, fixture data excepted. Confirm at 5:00.

## Judges
- Mike Arpaia (Moonfire, osquery): real orchestration, sandboxes running untrusted code, a queue, a gate.
- Adriaan Engelbrecht (Anthropic): audit trail per claim, reviewer rejection, untrusted repo treated as data.
- Sagar Gupta (Anthropic VC): a VC tool a startup could ship.
- Kimoon Kim (Google Cloud): runner interface, event log replay, durable workflow named on the slide as the production path.
