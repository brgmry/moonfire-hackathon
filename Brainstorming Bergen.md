# Brainstorming Bergen

## Decision: idea 1, thesis taken live from the room
- **Input:** a one-line thesis typed on stage, taken from the audience.
- **Crew:** scout, skeptic, researcher, writer, reviewer, sender, inbox; separate Sparkles sandboxes, always on.
- **UI:** one screen, visual, little text. Targets appear as cards and the skeptic visibly kills weak ones. Click a card to open its audit trail: each claim with a source link and a pass or fail mark.
- **Multiplayer first:** the run is a URL, not a window. See below.
- **Demo:** thesis in, the run URL goes on the screen and in the room's chat, cards stream in on every phone that opened it and get killed, a judge kills one from their phone, emails written and sent, a live reply comes back and a call is proposed. 2 to 3 minutes.
- **Models:** Claude throughout (Anthropic credits are the prize).
- **Check before Thursday:** Sparkles sandbox web access, rules on pre-built code and live data, and where the orchestrator runs: a Sparkles sandbox with a public URL, or our laptop behind a tunnel (the loop stays on our side either way).

Outcome is a finished work product, not code. Always-on: the crew keeps running and picks up new work without a human. Each idea has a splitter, workers in separate sandboxes, and a reviewer that can reject.

## Multiplayer first (decided 20 Oct)
The run is a shared object with a URL, not a chat one person watches. Aaron Epstein's RFS (Multiplayer AI) word for word: anyone on the team drops into the same live agent session, watches, redirects, hands off. Designed in from the start it costs under an hour; retrofitted it costs the demo.

- **One run, one URL:** `/run/<id>`. The thesis typed on stage creates it. The URL goes on the big screen and in the room's chat. Every phone that opens it sees the same cards.
- **Server holds the state, clients render it.** The orchestrator keeps the cards, the audit trails and the queue. Every client is one SSE stream of events (card added, card killed, email drafted, email sent, reply received, call proposed). No client-side state beyond what is on screen.
- **Actions are shared.** Kill a card, approve a send, un-kill a card: a POST that the server applies and broadcasts. A judge can kill a card from their phone and the room sees it die. Real sends are approve-only, from anyone with the link.
- **Presence:** a name chip per connected person, nothing more. No cursors.
- **The report is the card, and it is live.** Each card's audit trail (claim, source, pass or fail) is the research report on that target. Sharing the report is sharing the card URL. It keeps updating after the demo because the inbox agent keeps running.
- **Survives the stage:** close every laptop, the run continues. Reopen the URL in the morning and the overnight replies are on the cards. That is the always-on claim, shown rather than said.
- **Out of scope in three hours:** per-person permissions, conflict handling beyond last-write-wins, agent redirect mid-task (name it in the pitch, do not build it).

**Build order:** run id and SSE first, before any agent. A fake crew that emits events into a shared URL beats a real crew in one window. Then the scout, then the skeptic, then the rest.

## 1. Roll-up scout: thesis in, first conversation out
Finds targets, kills the weak ones, finds each owner's pain point, writes and sends the first email, then works the replies until a call is booked. The outbound half is my edge: it is what I built Throxy on.

**The story:** A London founder I know is rolling up UK staffing agencies: £6M committed, about 36,000 agencies to choose from. Finding targets was the easy part. The owners are 60+, read him as a competitor and won't take the call, so he now pays a broker on retainer just to get a first conversation.

**The crew:**
  1. **Scout:** finds targets that fit the thesis.
  2. **Skeptic:** kills the weak ones, with a reason on the card.
  3. **Researcher:** finds the owner and one specific pain point per company (succession, a key client, hiring, a bad review), each with a source.
  4. **Writer:** a short first email built on that pain point, as a successor not a competitor.
  5. **Reviewer:** rejects any email that is generic or makes an unsourced claim.
  6. **Sender:** sends it.
  7. **Always-on inbox:** watches for replies, classifies them, answers and proposes a time. This is the always-on part.

**On stage:** sends go to inboxes we control (teammates, a judge who volunteers), so a live reply comes back in the demo. Real owners only with an approve click.

**Close:** "this is what he pays a broker a retainer for, built in three hours." Name him only if he says yes, otherwise "a founder I know".

## 2. Investment committee in a box
Give it one company. Four agents argue it out.
- **Bull and bear:** build opposing cases in parallel.
- **Verifier:** checks every factual claim against filings and the web, flags the unsupported ones.
- **Chair (reviewer):** rejects the memo until each claim has a source.
- **Result:** an IC memo with a recommendation and the open questions.

## 3. Always-on briefing desk
A topic is watched all day; new developments are picked up and written up.
- **Watchers:** sources by region or type.
- **Fact-checker:** needs two sources per claim.
- **Editor (reviewer):** kills duplicates and hype.
- **Result:** a live briefing page that updates itself.

## Judges and what they will likely reward
No judging panel is named. The Venture Cafe page lists the featured people, and the full challenges are shared on the day. Showcase is 8:15 to 8:30pm, top teams on the main stage, hacking 5 to 8pm.
- **Mike Arpaia, Moonfire (co-created osquery, ex-CTO Kolide):** technical depth, infra, security. Wants real orchestration, not a prompt chain.
- **Adriaan Engelbrecht, Anthropic Applied AI:** agentic systems in regulated environments. Reviewer gates, audit trail, sourced claims.
- **Sagar Gupta, Anthropic VC Partnerships (ex-Stripe, EF):** product thinking, would a startup be built on this.
- **Kimoon Kim, Google Cloud (startup architect, ex-CTO):** production-minded architecture, can it scale past the demo.
- **Prizes:** Anthropic credits for the winner, so build visibly on Claude.

## Open questions
- Which idea.
- Whether Sparkles gives public web access from the sandbox.
- Rules on pre-built code and demo data.
