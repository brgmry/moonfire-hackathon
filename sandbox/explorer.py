"""Explorer: one Haiku agent per chunk, read-only tools, findings out as finding.added."""
import os
import re
import uuid

import events
import llm

MODEL = "claude-haiku-5-5"
MAX_FINDINGS = 12
DIMENSIONS = {"dead_code", "architecture", "quality", "tests", "security", "docs"}
SEVERITIES = {"good", "minor", "major"}
SYSTEM = llm.prompt("explorer")


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def locate(repo: str, file: str, quote: str) -> int | None:
    """Line number (1-based) where the quote's first non-empty line appears, None if absent."""
    first = next((_norm(q) for q in quote.splitlines() if q.strip()), "")
    if not first:
        return None
    try:
        with open(os.path.join(repo, file), encoding="utf-8", errors="replace") as f:
            lines = f.read().splitlines()
    except OSError:
        return None
    for i, line in enumerate(lines, 1):
        if first in _norm(line):
            return i
    return None


def clean(raw: dict, agent_id: str, chunk: dict, repo: str) -> dict | None:
    if not isinstance(raw, dict):
        return None
    dimension = str(raw.get("dimension", "")).strip().lower()
    severity = str(raw.get("severity", "")).strip().lower()
    quote = "\n".join(str(raw.get("quote") or "").rstrip().splitlines()[:3])
    if dimension not in DIMENSIONS or severity not in SEVERITIES or not quote.strip():
        return None
    try:
        line = int(raw.get("line") or 0)
    except (TypeError, ValueError):
        line = 0
    return {
        "id": f"f_{uuid.uuid4().hex[:6]}",
        "agentId": agent_id,
        "chunkId": chunk["id"],
        "dimension": dimension,
        "severity": severity,
        "file": llm.rel(str(raw.get("file") or ""), repo),
        "line": line,
        "quote": quote,
        "note": str(raw.get("note") or "").strip()[:300],
        "valid": True,
    }


async def run(agent_id: str, chunk: dict, repo: str, do_not: list[str]) -> list[dict]:
    tokens = llm.zero_tokens()
    in_chunk = set(chunk["files"])

    def on_read(path: str):
        events.emit("agent.working", agentId=agent_id, file=llm.rel(path, repo))

    user = (
        f"Chunk: {chunk['path']} ({len(chunk['files'])} files)\n"
        "Files to read, every one of them:\n" + "\n".join(chunk["files"]) + "\n"
    )
    if do_not:
        user += "\nPast reviewers were overruled for these, do not repeat them:\n" + "\n".join(f"- {d}" for d in do_not) + "\n"
    user += "\nReturn the JSON array of findings now."

    raw = await llm.ask_array(user, system=SYSTEM, model=MODEL, cwd=repo, tools=llm.READ_ONLY,
                              tokens=tokens, max_turns=25, timeout=240, on_read=on_read)
    findings = []
    for r in raw:
        f = clean(r, agent_id, chunk, repo)
        if not f:
            continue
        found_at = locate(repo, f["file"], f["quote"])
        if found_at:
            f["line"] = found_at
        events.emit("finding.added", finding=f)
        if found_at is None and os.path.isfile(os.path.join(repo, f["file"])):
            f["valid"] = False
            events.emit("finding.dropped", findingId=f["id"], reason="quote_not_found")
        findings.append(f)
        if len(findings) >= MAX_FINDINGS:
            break
    if not findings and chunk["files"]:
        print(f"explorer {agent_id}: no findings for {chunk['path']} (files in chunk: {len(in_chunk)})", flush=True)
    events.emit("agent.done", agentId=agent_id, **llm.done(tokens))
    return [f for f in findings if f["valid"]]
