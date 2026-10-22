"""Classifier: a second Haiku re-labels every finding; disagreement drops it."""
import asyncio
import json

import events
import llm

MODEL = "claude-haiku-5-5"
BATCH = 20
# The spec drops on any severity disagreement. Two Haikus often split minor vs major on the
# same evidence, so by default only a flip between good and not-good counts.
STRICT_SEVERITY = False
SYSTEM = llm.prompt("classifier")


def disagrees(f: dict, v: dict) -> bool:
    if v.get("valid") is False:
        return True
    if v.get("dimension") and v["dimension"] != f["dimension"]:
        return True
    sev = v.get("severity")
    if not sev:
        return False
    if STRICT_SEVERITY:
        return sev != f["severity"]
    return (sev == "good") != (f["severity"] == "good")


async def run(agent_id: str, findings: list[dict]) -> None:
    tokens = llm.zero_tokens()
    sem = asyncio.Semaphore(3)

    async def batch(items: list[dict]):
        async with sem:
            events.emit("agent.working", agentId=agent_id, file=items[0]["file"])
            payload = [{"id": f["id"], "file": f["file"], "quote": f["quote"], "note": f["note"],
                        "dimension": f["dimension"], "severity": f["severity"]} for f in items]
            user = "Findings to check:\n" + json.dumps(payload, indent=1) + "\n\nReturn the JSON array now."
            verdicts = await llm.ask_array(user, system=SYSTEM, model=MODEL, cwd=None, tools=[],
                                           tokens=tokens, max_turns=1, timeout=120)
            by_id = {v.get("id"): v for v in verdicts if isinstance(v, dict)}
            for f in items:
                v = by_id.get(f["id"])
                if v and disagrees(f, v):
                    events.emit("finding.dropped", findingId=f["id"], reason="classifier_disagreed",
                                note=str(v.get("note") or "")[:200])

    await asyncio.gather(*(batch(findings[i:i + BATCH]) for i in range(0, len(findings), BATCH)))
    events.emit("agent.done", agentId=agent_id, **llm.done(tokens))
