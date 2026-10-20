# Brainstorming Bergen

## Decision: idea 1, thesis taken live from the room
- **Input:** a one-line thesis typed on stage, taken from the audience.
- **Crew:** scout, skeptic, researcher, writer, reviewer, sender, inbox; separate Sparkles sandboxes, always on.
- **UI:** one screen, visual, little text. Targets appear as cards and the skeptic visibly kills weak ones. Click a card to open its audit trail: each claim with a source link and a pass or fail mark.
- **Demo:** thesis in, cards stream in and get killed, emails written and sent, a live reply comes back and a call is proposed. 2 to 3 minutes.
- **Models:** Claude throughout (Anthropic credits are the prize).
- **Check before Thursday:** Sparkles sandbox web access, rules on pre-built code and live data.

Outcome is a finished work product, not code. Always-on: the crew keeps running and picks up new work without a human. Each idea has a splitter, workers in separate sandboxes, and a reviewer that can reject.

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
