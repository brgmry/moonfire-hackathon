# Contract: the three pieces meet here

Agreed before anyone writes code. Change it only by editing this file and telling the other two.

## Split
- **Bergen:** Next.js client (`/run/<id>`), pitch and story.
- **Allen:** orchestrator, agent loop, queue, event log. One Node process on a laptop behind a Cloudflare tunnel.
- **Akshay:** Sparkles sandboxes, the worker interface, web and email access from inside them.

## Run API (orchestrator, Node)
- `POST /runs` `{ thesis }` → `{ id }`. Creates the run, starts the crew.
- `GET /runs/:id/events` → SSE. Replays the full log, then streams. Heartbeat comment every 30s.
- `GET /runs/:id` → current state (cards, queue, presence). Clients call it on tab focus to resync.
- `POST /runs/:id/actions` `{ type, cardId, by }` → applied, then broadcast as an event. Last write wins.

## Events (one JSON object per SSE `data:` line)
Every event: `{ seq, ts, type, runId, ...payload }`. `seq` is monotonic per run; the client ignores anything it has seen.

| type | payload | emitted by |
|---|---|---|
| `run.created` | `thesis` | orchestrator |
| `presence.join` / `presence.leave` | `name` | orchestrator |
| `card.added` | `card` | scout |
| `card.killed` | `cardId, reason, by` (`by` = `skeptic` or a person's name) | skeptic, any client |
| `card.revived` | `cardId, by` | any client |
| `claim.added` | `cardId, claim: { id, text, sourceUrl, status: pending }` | researcher |
| `claim.checked` | `cardId, claimId, status: pass \| fail, note` | reviewer |
| `email.drafted` | `cardId, draft: { to, subject, body }` | writer |
| `email.rejected` | `cardId, reason` | reviewer |
| `email.approved` | `cardId, by` | any client |
| `email.sent` | `cardId, messageId` | sender |
| `reply.received` | `cardId, from, excerpt, flagged: bool` (`flagged` = injection attempt caught) | inbox |
| `call.proposed` | `cardId, slots[]` | inbox |

## Card shape
```json
{
  "id": "c_01",
  "company": "Acme Staffing Ltd",
  "owner": "Jane Doe",
  "location": "Leeds",
  "fit": "one line on why it matches the thesis",
  "status": "scouting | researched | drafted | approved | sent | replied | killed",
  "killReason": null,
  "claims": [],
  "email": null,
  "replies": []
}
```

## Client actions
`kill`, `revive`, `approve_send`. Nothing else. Any name with the link can do all three.

## Worker interface (Sparkles)
Orchestrator calls a worker with `{ role, input }` and gets `{ output, sources[] }` back. Workers hold no state. If a sandbox dies the orchestrator re-dispatches. Roles: `scout`, `researcher`, `writer`. Skeptic, reviewer, sender and inbox run in the orchestrator process (no sandbox needed, they are Claude calls plus an SMTP/IMAP client).

## Fake crew
`scripts/fake-crew.ts` creates a run and emits the full event sequence above with 1 to 2 second gaps. Bergen builds the whole UI against this. Allen replaces it role by role. The demo falls back to it if a real agent breaks on stage.

## Build order
1. Allen: `POST /runs`, SSE replay and stream, in-memory log. 30 min.
2. Bergen: client renders cards from the fake crew. Kill animation first, audit trail second.
3. Akshay: one sandbox that takes `{ role: "scout", input: thesis }` and returns five companies with sources.
4. Allen: scout, then skeptic, then the rest, each swapped in for its fake.
5. 7:15pm: freeze. Everything after is pitch and fallback rehearsal.
