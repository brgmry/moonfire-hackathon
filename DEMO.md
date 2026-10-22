# The five-minute demo

Site: https://shipitornot.com. Pitch: `/pitch`. Projector: add `?stage=1` to any run URL. Demo fallback: `/run/demo` (no backend).

Before walking up: open `/pitch` on the laptop, a run URL with `?stage=1` in a second tab, and `/run/demo` in a third. Phone on 4G with the site open. Laptop volume off.

## 0:00 · 01 The goal (Bergen, 60s)
Screen: `/pitch`, window 01.
> Every README is a pitch deck. A VC gets a repo link and a README full of claims, and an associate spends two days working out what was actually shipped. In the AI age you can't tell good code from plausible code by reading it.
>
> We built a crew that reads the code, builds it, runs it, and scores it out of 100. Every point has a receipt: a file, a line, a quote. And a leaderboard of who wrote what.

Who benefits, one breath each: investors before the term sheet, anyone hiring engineers, the engineer who did the work.

Then the bottom window, the question every judge is holding:
> Why not just hand the repo to Claude? Three reasons. Comparable: one rubric computed by code, so repo A and repo B sit on the same scale. Verifiable: it built it and ran it, and every point is a file, a line and a quote you can check. Compounds: every run writes memory, so the thousandth repo scores faster, cheaper and against a percentile of everything scored before. A chat with an agent is an opinion. This is a measurement.

## 1:00 · 02 The crew (Allen, 60s)
Screen: `/pitch`, window 02. Point at the sprites, top to bottom.
> One Cloud Run job per repo. The orchestrator clones, installs, splits the repo into chunks and spawns up to 24 explorers on Haiku, one per chunk. They return findings only: file, line, verbatim quote. A compiler builds it, a runner runs the tests, a claims agent checks the README against the code, git blame says who wrote what, and a classifier drops any finding the quote doesn't support.
>
> No agent is ever asked for a number. The backend computes the score from the findings with a fixed rubric.

## 2:00 · 03 The result (Bergen drives, Akshay narrates, 2 min)
Screen: switch to the home page. Paste the pre-picked repo: `https://github.com/typicode/json-server` at the pinned sha in `infra/demo-repos.md` (README line 130 claims equality filters that match everything for a missing field). python-slugify is the safe one, vite-deploy the website. Press go. Put the run URL on screen with `?stage=1`; say the QR is on the sticky note.
> Open it on your phone. Everyone sees the same run.

While it runs, narrate what the Mac shows: boot, treemap drawing, explorers flying to chunks, speech bubbles. Dock: "builds in 41s", "tests 38 of 41", "claims 9 of 12".

Known good runs on Cloud Run to keep open as the fallback tab: r_7ace52 (slugify, 84.9), r_fc0e0a (json-server, 83.4, endpoints 4/4), r_bd84c4 (vite-deploy, 67.4).

When the score lands: tap one red-ish row, read one finding out loud (file, line, quote). Tap Claims: the missing feature, README line quoted. Then the Leaderboard: who wrote the best chunk, who wrote the dead code.

If the live run is slower than 90 seconds: switch to the tab with the completed run already open and say so. If the backend is down: `/run/demo` and say it is a recorded run.

## 4:00 · 04 The autonomy (Akshay, 45s)
Screen: the finished run.
> Everything after the URL ran on its own: clone, install, exploration, compile, run, claims, blame, scoring, the report. Nobody approved anything.
>
> Human touches, disclosed: someone pastes the URL, we chose the demo repos in advance, and "run the demo" replays a recorded run.

Close the laptop lid. Hold up the phone.
> The service keeps the run. The laptops are closed and your phones are still updating.

## 4:45 · Close (Bergen, 15s)
> A VC pays an associate two days for this. The crew did it in two minutes for under a pound. shipitornot.com.

## Fallbacks
| Problem | Do |
|---|---|
| Live run not done by 3:30 | switch to the completed run tab, say "here is the one from ten minutes ago" |
| Backend unreachable | `/run/demo`, say "recorded run" |
| Projector too small | `?stage=1`, close Evidence and Leaderboard windows, use the phone for evidence |
| Wi-Fi dies | phone hotspot, demo mode works offline once loaded |

## Likely questions
- **Why not just ask an agent?** The three reasons above. Add: an agent will tell you the README looks great, because it read the README.
- **Is the score real or made up?** The sandbox never emits a number. The backend computes it from findings with a rubric you can read in `specs/00-contract.md`. Rerun the same commit and you get the same score.
- **Does it scale?** Churn-ranked chunks, 24 cap, Haiku explorers, cached prompts. under a pound a repo. Memory makes repeat runs near free.
- **What is the network effect?** Every scored repo improves the install recipes and the percentile. The benchmark is the moat.
- **What did humans do?** Window 04. Paste the URL, pick the demo repos, that is it.

## Judging weights (from the sheet)
50% did it work, 30% was it useful, the rest is showing the work. The live run covers the first, window 01 the second, the Mac screen the third.
