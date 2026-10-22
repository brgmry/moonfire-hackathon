"""Shared helpers for the compile and run agents (K3). Stdlib + claude-agent-sdk only."""
import asyncio
import inspect
import json
import os
import signal
import sys
import time
from pathlib import Path

PROMPTS = Path(__file__).resolve().parent / "prompts"
MODEL = "claude-sonnet-5-5"
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next", "target"}


async def emit(type_: str, **payload) -> None:
    """Call events.emit, awaiting it if it is async. Never raises."""
    try:
        from events import emit as _emit
        res = _emit(type_, **payload)
        if inspect.isawaitable(res):
            await res
    except Exception as e:  # noqa: BLE001
        print(f"[k3] emit {type_} failed: {e!r}", file=sys.stderr)


def tail(s, n: int = 1500) -> str:
    s = "" if s is None else str(s)
    return s[-n:]


def load_prompt(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text(encoding="utf-8")


def parse_last_json(text) -> dict | None:
    """Return the last top-level {...} in text that json-parses to a dict."""
    if not text:
        return None
    dec = json.JSONDecoder()
    best, i = None, 0
    while True:
        i = text.find("{", i)
        if i < 0:
            return best
        try:
            obj, end = dec.raw_decode(text, i)
            if isinstance(obj, dict):
                best = obj
            i = end if isinstance(obj, dict) else i + 1
        except ValueError:
            i += 1


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def readme_excerpt(workdir: str, n: int = 4000) -> str:
    for name in ("README.md", "readme.md", "README.rst", "README.txt", "README"):
        p = Path(workdir) / name
        if p.is_file():
            try:
                return p.read_text(encoding="utf-8", errors="replace")[:n]
            except Exception:  # noqa: BLE001
                return ""
    return ""


def context_block(ctx: dict, workdir: str) -> str:
    """Variable content for the user prompt: profile summary, install result, README excerpt."""
    profile = ctx.get("profile") or {}
    install = ctx.get("install") or {}
    files = profile.get("files") or []
    top = sorted({f.split("/")[0] for f in files if isinstance(f, str)})[:40]
    try:
        if not top:
            top = sorted(os.listdir(workdir))[:40]
    except Exception:  # noqa: BLE001
        pass
    summary = {k: profile.get(k) for k in ("name", "languages", "packageManager", "framework",
                                           "hasTests", "hasBuild", "hasDockerfile", "fileCount")}
    pkg = read_json(Path(workdir) / "package.json")
    scripts = pkg.get("scripts") if isinstance(pkg.get("scripts"), dict) else {}
    memory = ctx.get("memory") or {}
    parts = [
        f"Working directory: {workdir}",
        "Repo profile: " + json.dumps(summary),
        "Top-level entries: " + ", ".join(top),
        "package.json scripts: " + json.dumps(scripts) if scripts else "package.json scripts: (none)",
        "Install result: " + json.dumps({k: install.get(k) for k in ("ok", "manager", "durationMs")})
        + ("\nInstall errors tail:\n" + tail(install.get("errorsTail"), 800) if install.get("errorsTail") else ""),
    ]
    if memory:
        parts.append("Notes from previous runs: " + tail(json.dumps(memory), 800))
    rd = readme_excerpt(workdir)
    parts.append("README excerpt:\n" + (rd if rd else "(no README)"))
    return "\n".join(parts)


def sub_env() -> dict:
    env = dict(os.environ)
    env.update({"CI": "1", "NO_COLOR": "1", "FORCE_COLOR": "0", "npm_config_yes": "true"})
    return env


async def sh(cmd: str, cwd: str, timeout: float) -> tuple[int, str, int]:
    """Run a shell command; returns (exit code, combined output, duration ms). 124 on timeout."""
    t0 = time.monotonic()
    posix = os.name == "posix"
    proc = await asyncio.create_subprocess_shell(
        cmd, cwd=cwd, env=sub_env(), stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        start_new_session=posix)
    buf = bytearray()  # read incrementally so a timeout keeps what was printed before the hang

    async def pump() -> None:
        while chunk := await proc.stdout.read(65536):
            buf.extend(chunk)

    try:
        await asyncio.wait_for(asyncio.gather(pump(), proc.wait()), timeout)
        code = proc.returncode or 0
    except (asyncio.TimeoutError, asyncio.CancelledError) as e:
        try:
            if posix:
                os.killpg(proc.pid, signal.SIGKILL)
            else:
                proc.kill()
            await asyncio.wait_for(proc.wait(), 5)
        except BaseException:  # noqa: BLE001
            pass
        if isinstance(e, asyncio.CancelledError):
            raise
        buf.extend(f"\n[timed out after {timeout}s]".encode())
        code = 124
    return code, buf.decode("utf-8", "replace"), int((time.monotonic() - t0) * 1000)


def dir_size(path: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


async def run_agent(name: str, user_prompt: str, workdir: str, agent_id: str,
                    tokens: dict, max_turns: int = 20) -> str:
    """Run one claude-agent-sdk query with Bash only. Emits agent.working per Bash call,
    accumulates usage into `tokens` (mutated, so it survives a timeout). Returns final text."""
    from claude_agent_sdk import (AssistantMessage, ClaudeAgentOptions, ResultMessage,
                                  TextBlock, ToolUseBlock, query)
    options = ClaudeAgentOptions(
        system_prompt=load_prompt(name), tools=["Bash"], allowed_tools=["Bash"], model=MODEL,
        cwd=workdir, permission_mode="bypassPermissions", max_turns=max_turns,
        env={"CI": "1", "NO_COLOR": "1"})
    last_text, result_text = "", None
    async for msg in query(prompt=user_prompt, options=options):
        if isinstance(msg, AssistantMessage):
            for block in msg.content or []:
                if isinstance(block, ToolUseBlock) and block.name == "Bash":
                    cmd = str((block.input or {}).get("command", ""))
                    cmd = " ".join(cmd.split())
                    await emit("agent.working", agentId=agent_id,
                               file=cmd if len(cmd) <= 80 else cmd[:77] + "...")
                elif isinstance(block, TextBlock) and block.text:
                    last_text = block.text
            u = msg.usage or {}
            # Same accounting as llm.add_usage: cache writes are billed input.
            tokens["_in"] = tokens.get("_in", 0) + int(u.get("input_tokens") or 0) \
                + int(u.get("cache_creation_input_tokens") or 0)
            tokens["_out"] = tokens.get("_out", 0) + int(u.get("output_tokens") or 0)
            tokens["_cr"] = tokens.get("_cr", 0) + int(u.get("cache_read_input_tokens") or 0)
        elif isinstance(msg, ResultMessage):
            u = msg.usage or {}
            tokens["in"] = int(u.get("input_tokens") or 0) + int(u.get("cache_creation_input_tokens") or 0)
            tokens["out"] = int(u.get("output_tokens") or 0)
            tokens["cacheRead"] = int(u.get("cache_read_input_tokens") or 0)
            tokens["_final"] = True
            result_text = msg.result
    return result_text or last_text


def final_tokens(tokens: dict) -> dict:
    if tokens.get("_final"):
        return {"in": tokens.get("in", 0), "out": tokens.get("out", 0), "cacheRead": tokens.get("cacheRead", 0)}
    return {"in": tokens.get("_in", 0), "out": tokens.get("_out", 0), "cacheRead": tokens.get("_cr", 0)}


def as_bool(v) -> bool:
    """Model JSON may say "false"/"no" as strings; bool() would call those True."""
    if isinstance(v, str):
        return v.strip().lower() in ("true", "yes", "1", "ok", "pass", "passed")
    return bool(v)


def as_int(v, default: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default
