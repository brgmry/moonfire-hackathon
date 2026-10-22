# 01. Frontend (Bergen)

Next.js 15, App Router, TypeScript, Tailwind. Deployed on Vercel. The browser talks straight to the Cloud Run backend; Vercel serves static pages only. Env: `NEXT_PUBLIC_API_URL`.

## Look
A 1984 Macintosh desktop, the way https://www.allenbrd.xyz/ does it: sky wallpaper, a menu bar with File Edit Special and a clock, pixel font for labels (Chicago look: use "Pixelify Sans" or "Silkscreen" from Google Fonts for labels, "IBM Plex Mono" for text), black-and-white icons with labels under them, windows with the striped title bar and the close box top-left, a sticky note.

Our twist: in the centre of the desktop stands an actual compact Macintosh (`assets/avatars/mac.svg`). Its screen is the sandbox. Everything the crew does happens inside that little screen. Desktop windows around it hold the score, the evidence and the leaderboard.

## Pages
- `/`: the desktop with only the Mac, screen dark, and one window: "Paste a GitHub repo". Enter creates the run and routes to `/run/<id>`.
- `/run/<id>`: the full desktop. `?stage=1` hides window chrome you cannot read from the back, enlarges the Mac and shows a QR of the URL on the sticky note.

## The Mac screen (the world)
Positioned exactly over the `screen` rect of `mac.svg` (coordinates in `assets/avatars/README.md`). Dark background, 1px phosphor-green or white grid.
1. **Boot**: on `run.created`, a blinking cursor and "cloning <repo>". On `repo.profile`, the repo name and language bar.
2. **Treemap**: on each `chunk.created`, a tile appears, sized by `bytes`, labelled by `path`, placed by a squarified treemap (write it by hand, 40 lines, or `d3-hierarchy` treemap). Sampled chunks hatched.
3. **Avatars**: on `agent.spawned`, the role's `idle` sprite appears at the orchestrator's position and flies (CSS transform, 600ms) to its chunk tile. On `agent.working`, the sprite switches to `working` and nudges within the tile. On `finding.added`, the sprite switches to `found` for 1.5s and a speech bubble (`bubble.svg`, 9-slice) shows `file:line` and the first line of `quote`, red border for `major`, green for `good`. On `agent.done`, the sprite fades to 50% and parks at the tile corner.
4. **Non-chunk agents** (`compiler`, `runner`, `claims`, `git`, `classifier`, `writer`) sit along the bottom of the screen in a row of slots and animate the same way.
5. **Screenshot world (cherry)**: on `app.screenshot`, the treemap cross-fades to the image and avatars keep their positions.
6. Cap visible bubbles at 6 at once, oldest fades. Cap avatars at 24 plus the row.

## Desktop windows
- **Score** (top right): a dial that fills as `score.updated` lands, the total in big pixel digits, nine rows (dimension, points/max, a bar). Click a row: the Evidence window focuses on that dimension.
- **Evidence** (bottom left): list of findings for the selected dimension, newest first: `file:line`, the quote in mono, the note, the agent's avatar at 16px. Click one: the chunk tile pulses in the Mac.
- **Claims** (inside Evidence as the first tab): "9 of 12 delivered", each claim with status, README line, evidence file.
- **Leaderboard** (right, stretch): from `contributors`, rows of author, commits, surviving lines, the chunks they own with that chunk's major count. Sorted by lines. Shows "history truncated" or "fork" when flagged.
- **Report**: appears on `report.ready` as a window with the markdown and the token line: "412k in, 38k out, 71% cache hits, 38p".
- **Menu bar**: repo name left, presence chips (names from `presence.*`) and token counter right, clock. The sticky note holds the run URL and, on stage, the QR.

## Data layer
One `EventSource` on `/runs/:id/events`. A reducer turns events into the run state (same shape as `GET /runs/:id`). On `visibilitychange` to visible, fetch `GET /runs/:id` and replace state. On `EventSource` error, reconnect with backoff, the replay handles gaps via `seq`. No other client state.

## Fixture
`frontend/fixtures/run.jsonl`: a full fake run, 120 events, 1 to 2 seconds apart, covering every event type, including one `finding.dropped`, one `major` security finding, a `partial` claim, `contributors` with a fork flag, and `report.ready`. `npm run fixture` serves it as SSE on `localhost:4000` so the UI is built with the backend absent. The fixture is also the stage fallback.

## Build order
1. 5:00 Next.js scaffold, Vercel project, env var, `EventSource` reducer against the fixture. Desktop shell: wallpaper, menu bar, one window.
2. 5:45 Mac in the middle, treemap drawing from `chunk.created`. First integration with Allen's local backend.
3. 6:15 Avatars spawn, fly, bubble. Score dial. Evidence window.
4. 6:45 Claims tab, report window, presence, token counter. Stage mode and QR.
5. 7:00 Leaderboard (stretch). Screenshot world (cherry).
6. 7:30 Freeze. Pitch.

## Done means
Fixture run animates end to end on a phone and the projector by 6:15. Real run from Cloud Run by 7:00. Nothing on screen that is not from an event.
