# Brainstorming Allen

## Filter
The track says agents in cloud sandboxes. An idea scores when the sandbox does real work (installs, runs and measures code), not just search and writing. Mike Arpaia will spot a prompt chain.
- Input comes live from the room.
- A reviewer visibly rejects work.
- A finished result inside a 2 to 3 minute demo.

The shared run URL from Bergen's doc works for any idea below.

## Sparkles: what we found (22 Oct)
- Probably sparkles.dev (YC W26). Not confirmed as the sponsor, so check on arrival.
- Each sandbox is a Claude Code session on a GitHub repo. Every run ends as a draft PR.
- REST API with one bearer key (sandboxes scope). Create: `POST /api/public/v1/sandboxes` with `{repos, prompt}`. Events over SSE (`/events/stream`). Follow-ups: `POST /messages`. Approve or deny: `POST /approvals/{id}`. Files are read-only (`GET /files/download`).
- A run takes minutes. No public URLs. Outbound web, idle timeout and the concurrency cap are not documented.
- A sandbox is only visible to the key that created it. Use one shared key, on the server only.
- Free tier: 100 credits, about $10. Ask about event credits.
- The event page says 6 to 9pm, showcase 8:15 to 8:30. Confirm the hacking window.

**Rule that follows:** start crew runs before the demo. The live part on stage runs on our own server.

## A. README vs reality
Someone in the room names a public GitHub repo. The crew checks what the README claims against what the code actually does.

**The crew:**
  1. **Splitter:** reads the README and lists every claim that can be tested (installs in one command, X times faster than Y, supports Z, tests pass).
  2. **Testers:** one sandbox per claim. Clone, install, run, benchmark. Each returns a verdict with the commands it ran and the log.
  3. **Reviewer:** rejects any verdict without a run log and sends it back for a rerun.
  4. **Writer:** turns the accepted verdicts into a technical due-diligence report.

**Result:** a report card on the repo. Each claim is marked pass or fail, with the log behind it.

**Why it fits the judges:**
- Moonfire is a VC and this is technical diligence.
- The sandbox is required, because we run a stranger's code.
- Every line has an audit trail (Adriaan).
- A startup could sell this to VCs (Sagar).

**Risks:** install times can blow past the demo. Pre-pick a backup repo that installs fast. Big repos and GPU code are out.

## B. Roll-up scout, with filings
Bergen's idea 1, with the sandbox doing data work.
- Same crew as Bergen's doc: scout, skeptic, researcher, writer, reviewer, sender, inbox.
- **Change:** the scout pulls Companies House filings for each target and runs code on them in its sandbox: balance sheet trend, years trading, director birth years, succession signals. The skeptic kills targets on those numbers, not on a hunch.
- Keeps Bergen's outbound edge and the live reply on stage.

**Risks:**
- Many moving parts for three hours (7 agents, sending, live replies).
- Small companies often file accounts without a profit and loss, so revenue is often missing.
- The Companies House API needs a key (free).

## C. The Mole
Top pick from the idea search (17 ideas, 5 judge lenses, red team). One analyst in an AI due-diligence crew is secretly turned liar, and the crew has to catch it.

**Setup:** a fake SaaS company (Acme) with a Stripe-style revenue export we generate, so we know the true numbers. Three metrics: MRR growth Jun to Sep, logo churn, NRR. Definitions pinned in plain words, 1% tolerance. The data lives in the repo, so no web access needed.

**The crew:**
  1. **Analysts x3:** one Sparkles sandbox each, one metric each, Python standard library only. One is the mole and gets a hidden instruction to make one flattering error.
  2. **Replicators x3:** fresh sandboxes. They get only the metric definition, never the analyst's code or number, and rebuild it from scratch. Re-running the mole's script would just reproduce the bug.
  3. **Arbiter (Opus, API call):** on a mismatch, reads both scripts and names the line and the reason.
  4. **Editor (Opus, API call):** writes the memo using only numbers that replicated.

**The lock:** before the run, someone picks the mole on a phone. The screen shows `sha256(slot + error type + nonce)`. On stage we reveal the nonce and the browser checks the hash. That proves the pick came before the run, so running it ahead of the demo is honest.

**Mole errors:** keep only the ones caught 5 out of 5 in rehearsal. Candidates: annual plans booked as one month of MRR (inflates growth), and NRR computed over surviving customers only (inflates NRR).

**Demo (2:30):**
- 0:00 Hook: "Every VC here has seen a deck claim 18% monthly growth that fell apart in diligence. We hid a liar in an AI diligence crew." QR on screen.
- 0:15 Point at the hash banner: the pick was locked before the run.
- 0:25 Three numbers on every phone. The room votes for the mole.
- 0:55 The replicators rebuilt each number blind. Cards flip: green, green, red.
- 1:15 Red card: "Claims 17.9% a month. Blind rebuild: 6.1%. Line 14 books annual plans as one month."
- 1:35 Reveal: nonce shown, hash matches, mole named. Room vote against the crew.
- 1:55 Memo on screen with only replicated numbers. Laptop closes, phones keep streaming.

**Who builds what:**
- **Allen:** Sparkles setup, then the server (Railway or Fly). `POST /run` creates the sandboxes, reads their events, fetches `result.json` and the script, calls the arbiter and editor, and streams SSE to phones. Vote and reveal endpoints. Mock runner first, Sparkles runner by 6:15, local `claude -p` runner as fallback behind the same interface.
- **Bergen:** generate the Acme CSVs with known truths. Write the metric definitions, the mole errors and all prompts. Test locally until honest agents match the truth 5 out of 5 and the mole is always caught.
- **Akshay:** one page with `/stage` (projector) and `/p` (phone): hash banner, 3 analyst cards, vote buttons, reveal screen with the hash check in the browser, memo, audit drawer (sandbox ids, models, scripts), QR, and a hidden `/pick` page.

**Timeline** (shift it if hacking starts at 6):
- 5:00 Sparkles test: one key, GitHub App on an empty repo, one test sandbox, time it, fire 4 at once to find the cap. Lock the event format.
- 5:15 to 6:30 build in parallel.
- 6:30 first full run on Sparkles. 6:45 decision: if a run takes over about 20 minutes or the API is blocked, switch to the local runner and say so in the pitch.
- 7:00 three rehearsal runs. Record the cleanest as a backup video. Keep 2 runs unrevealed as backups.
- 7:30 code freeze, rehearse the pitch.
- 7:45 showcase run starts, someone picks the mole, laptops close.

**Risks:**
- Honest analysts flagged because a definition is loose. Tighten definitions until there are zero false positives.
- The mole gives itself away (a comment like "intentional error") or refuses. Strip comments, and only send `result.json` and the script to the screen, never the transcript.
- Credits run out during rehearsal.
- Run not done by the showcase: reveal one of the unrevealed rehearsal runs and say so.

**Pitch line:** "We hid a liar in an AI due-diligence crew and the crew caught it, because no agent's number counts until another agent has rebuilt it blind in a clean sandbox."

## Open questions
- What Akshay is strongest at.
- Whether the sponsor is sparkles.dev, the concurrency cap, and event credits.
- Whether Sparkles sandboxes have web access. A and B need it, The Mole does not.
- Whether we can pick the demo repo or targets in advance.
