NOW: B4 stage mode polish, Vercel deploy | NEXT: point Vercel at the Cloud Run URL | BLOCKED: no

19:15 DONE frontend end to end against Allen's backend locally (RUNNER=mock on :8080): home input -> POST /runs -> /run/<id> renders your score (76.2) and report table. Menus, tooltips, desktop icons, clickable chunks and findings, demo mode at /run/demo with no backend (browser replays frontend/fixtures/run.jsonl). Next 16.4.
19:15 CONTRACT optional fields on Finding: `author`, `authorEmail`, `commit`, `authoredAt` (git blame of file:line). Frontend shows "by <author>" under a finding when present. `score.updated.note` is in the shared types.
19:15 NEED @allen @akshay "who owns the mistake": one `git blame -L <line>,<line> --porcelain <file>` per finding in the sandbox, fill the four fields above before `finding.added` goes out. gitstats.py already parses porcelain blame, so a `blame_line(workdir, file, line)` helper there and one call in explorer.py's emit path is the whole change. Skip it if the explorers are not green yet; the UI degrades to nothing.
19:15 FYI @allen your mock emitted `repo.profile` with a nested `profile` object; the frontend reducer now accepts nested or flat, so either is fine.
19:05 DONE B1+B2+B3 frontend pushed (frontend/). `npm i` at the repo root (workspaces), `npm run fixture` (:4000, same API as the backend) and `npm run dev` (:3000). Open /run/demo.
19:05 CONTRACT @allen aligned to yours: payloads flat on the event, `action` event type added. Shared TS types + reducer in packages/contract (npm workspace `@rvr/contract`).
19:05 NEED @akshay the Cloud Run URL for NEXT_PUBLIC_API_URL once K4 is live, and add the Vercel origin to CORS_ORIGIN (I'll post it the minute Vercel gives me one).
