"""One helper around claude_agent_sdk.query: stream, report Read calls, sum usage, parse a JSON array."""
import asyncio
import json
import os
import re

from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, ResultMessage, TextBlock, ToolUseBlock, query

PROMPTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompts")
READ_ONLY = ["Read", "Grep", "Glob"]


def prompt(name: str) -> str:
    with open(os.path.join(PROMPTS, f"{name}.md"), encoding="utf-8") as f:
        return f.read()


def zero_tokens() -> dict:
    return {"in": 0, "out": 0, "cacheRead": 0}


def add_usage(tokens: dict, usage: dict | None) -> None:
    if not usage:
        return
    tokens["in"] += int(usage.get("input_tokens") or 0) + int(usage.get("cache_creation_input_tokens") or 0)
    tokens["out"] += int(usage.get("output_tokens") or 0)
    tokens["cacheRead"] += int(usage.get("cache_read_input_tokens") or 0)


async def ask(user: str, *, system: str, model: str, cwd: str | None, tools: list[str], tokens: dict,
              max_turns: int = 25, timeout: float = 240, on_read=None, resume: str | None = None) -> tuple[str, str | None]:
    """Run one agent turn. Returns (final_text, session_id). On timeout returns the last text seen."""
    options = ClaudeAgentOptions(
        model=model, system_prompt=system, cwd=cwd, tools=tools, allowed_tools=tools,
        permission_mode="bypassPermissions", max_turns=max_turns, setting_sources=[], resume=resume,
    )
    state = {"text": "", "session": resume}

    async def consume():
        async for m in query(prompt=user, options=options):
            if isinstance(m, AssistantMessage):
                for b in m.content:
                    if isinstance(b, TextBlock) and b.text.strip():
                        state["text"] = b.text
                    elif isinstance(b, ToolUseBlock) and b.name == "Read" and on_read:
                        path = (b.input or {}).get("file_path") or ""
                        on_read(path)
            elif isinstance(m, ResultMessage):
                add_usage(tokens, m.usage)
                state["session"] = m.session_id
                if m.result:
                    state["text"] = m.result

    try:
        await asyncio.wait_for(consume(), timeout=timeout)
    except asyncio.TimeoutError:
        print(f"llm: timed out after {timeout}s, using the last text", flush=True)
    return state["text"], state["session"]


def parse_array(text: str) -> list | None:
    if not text:
        return None
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.M)
    for candidate in (t, t[t.find("["): t.rfind("]") + 1] if "[" in t else ""):
        if not candidate:
            continue
        try:
            v = json.loads(candidate)
            if isinstance(v, list):
                return v
        except json.JSONDecodeError:
            continue
    return None


async def ask_array(user: str, **kw) -> list:
    """ask(), parse a JSON array, retry once on the same session with 'output JSON only'."""
    text, session = await ask(user, **kw)
    arr = parse_array(text)
    if arr is None and session:
        retry_kw = {**kw, "max_turns": 2, "timeout": 60, "on_read": None}
        text, _ = await ask("Output the JSON array only. No prose, no code fences.", resume=session, **retry_kw)
        arr = parse_array(text)
    return arr or []


def rel(path: str, repo: str) -> str:
    p = (path or "").strip()
    repo_abs = os.path.realpath(repo)
    if os.path.isabs(p):
        rp = os.path.realpath(p)
        if rp.startswith(repo_abs + os.sep):
            p = rp[len(repo_abs) + 1:]
        elif p.startswith(repo.rstrip("/") + "/"):
            p = p[len(repo.rstrip("/")) + 1:]
    return p[2:] if p.startswith("./") else p
