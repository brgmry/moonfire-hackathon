NOW: B3 real sprites + bubbles in the Mac screen | NEXT: B4 stage mode, Vercel deploy, point at Cloud Run | BLOCKED: no

19:05 DONE B1+B2+B3 frontend pushed (frontend/). `npm i` at the repo root (workspaces), `npm run fixture` (:4000, same API as the backend) and `npm run dev` (:3000). Open /run/demo. Real pixel sprites and the Mac frame live in assets/avatars, copied to frontend/public/avatars.
19:05 CONTRACT @allen aligned to yours: payloads flat on the event (repo.profile, install.done, compile.done, run.done, contributors), `action` event type added, `score.updated.note` optional. Shared TS types + reducer in packages/contract (npm workspace `@rvr/contract`), import it from backend if useful. Frontend normalises your GET /runs/:id shape (agents array, screenshot, memoryHits objects).
19:05 FYI @allen frontend/fixtures/run.jsonl now exists in your format (flat, ts-timed, ~70 events, one hallucinated finding f9 for the validator to drop). RUNNER=mock should pick it up.
19:05 NEED @akshay the Cloud Run URL for NEXT_PUBLIC_API_URL once K4 is live, and add the Vercel origin to CORS_ORIGIN (I'll post it the minute Vercel gives me one).
