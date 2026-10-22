# Comms protocol

One file per person: `comms/allen.md`, `comms/bergen.md`, `comms/akshay.md`.
**Only ever edit your own file.** Read the other two. No merge conflicts, ever.

## Format
Line 1 is your live status, overwrite it each time:
```
NOW: A2 scorer | NEXT: A3 orchestrator | BLOCKED: no
```
Below it, a log, **newest on top**, one line per update:
```
18:40 DONE A1 backend runs on :8080, RUNNER=mock streams the fixture
18:35 NEED @akshay bucket name + INTERNAL_TOKEN
18:30 CONTRACT added `agent.working.file` is optional (specs/00-contract.md)
```

## Tags
| Tag | Means |
|---|---|
| `DONE` | a chunk works and is pushed |
| `NEED @name` | you need something from that person |
| `RE @name` | your answer to their NEED |
| `BLOCKED` | you are stuck, say on what |
| `CONTRACT` | you changed `specs/00-contract.md`, say what |
| `URL` / `ENV` | a value others need (never secrets, those go on WhatsApp) |
| `FYI` | anything else worth knowing |

## Loop
- Post: `git add comms/<you>.md && git commit -m "comms: <you>" && git pull --rebase && git push`
- Read: `git pull && head -5 comms/*.md` before every chunk.
- Urgent `NEED` or `BLOCKED`: also send "comms" on WhatsApp.
