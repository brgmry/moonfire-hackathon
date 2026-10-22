# Learnings: always-on agents (Lee Robinson, Stanford CS146S)

Source: https://www.youtube.com/watch?v=L1OBRtfPS34

1. **Loop on our side, sandboxes are disposable.** The agent loop never runs inside the VM, so the VM can be killed and rebuilt. Orchestrator and state live with us; Sparkles sandboxes only do the work.
2. **Always-on = triggers, a queue and a router.** Two triggers in our demo: a thesis from the room, an inbound reply email. Stage input jumps the queue.
3. **Sparse main agent, helpers with fresh context.** Helpers return only results. Orchestrator holds the cards; workers research in their own sandboxes.
4. **Auto review.** A second model checking actions beats a human approving hundreds. Irreversible sends come back as an editable draft. Our reviewer gate plus an approve click on real sends.
5. **Inbound email is untrusted.** A reply is data, not an instruction (prompt injection). Stage moment: a reply that tries to hijack the agent gets caught live.
6. **Cheapest source first.** API, then web search, then browser, then full computer, then ask the user. Scout: Companies House API first, browser last.
7. **Know when to be quiet.** The inbox agent only pings us when a reply needs a decision.
8. **Durable workflows are the production path.** Temporal resumes a crashed step instead of replaying. Skip in three hours, name it in the pitch.
9. **Thin client, one channel.** The server talks to the client through one tool (send to user); the client decides how to render it. Our UI is one event stream rendered as cards.
10. **Keep prompts static for caching.** Fixed system prompt and tool order across calls; long outputs go to files, not context.
11. **Delete the product.** Models today are the worst they will be. Build as little as possible.
