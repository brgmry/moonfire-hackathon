"""K3 compile agent: does the repo build? Emits agent.working*, compile.done, agent.done."""
import asyncio
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # works as script dir or package
from k3common import (as_bool, as_int, context_block, dir_size, emit, final_tokens, parse_last_json,
                      read_json, run_agent, sh, tail)

TOTAL_CAP = 240      # whole agent, seconds
LLM_CAP = 170        # model phase; leaves room for the deterministic fallback
BUILD_TIMEOUT = 180
OUT_DIRS = ("dist", "build", ".next", "out", "target/release")


def _pm(profile: dict, wd: Path) -> str:
    pm = str(profile.get("packageManager") or "").lower()
    if "pnpm" in pm or (wd / "pnpm-lock.yaml").exists():
        return "pnpm"
    if "yarn" in pm or (wd / "yarn.lock").exists():
        return "yarn"
    return "npm"


def guess_build(profile: dict, workdir: str) -> str | None:
    wd = Path(workdir)
    pkg = read_json(wd / "package.json")
    scripts = pkg.get("scripts") if isinstance(pkg.get("scripts"), dict) else {}
    if scripts.get("build"):
        return f"{_pm(profile, wd)} run build"
    if (wd / "Cargo.toml").exists():
        return "cargo build --release"
    if (wd / "go.mod").exists():
        return "go build ./..."
    if (wd / "tsconfig.json").exists() and (wd / "node_modules" / ".bin").exists():
        return "npx --no-install tsc --noEmit"
    langs = profile.get("languages") or {}
    has_py = any(k in ("py", "python") for k in langs) or any(wd.glob("*.py")) or \
        (wd / "pyproject.toml").exists() or (wd / "setup.py").exists()
    if has_py:
        return 'python -m compileall -q -x "(\\.venv|node_modules|\\.git)" .'
    return None


def build_size(workdir: str) -> int:
    wd = Path(workdir)
    return sum(dir_size(wd / d) for d in OUT_DIRS if (wd / d).is_dir())


async def fallback(ctx: dict, workdir: str, note: str, budget: float) -> dict:
    cmd = guess_build(ctx.get("profile") or {}, workdir)
    if not cmd:
        return {"compiles": True, "command": "none", "durationMs": 0, "buildSizeBytes": 0,
                "warnings": 0, "errorsTail": tail(f"no build system found (fallback; {note})")}
    code, out, ms = await sh(cmd, workdir, max(10.0, min(BUILD_TIMEOUT, budget)))
    warnings = sum(1 for line in out.splitlines()
                   if re.search(r"\bwarn(ing)?s?\b", line, re.I)
                   and not re.search(r"\b(0|no) warnings?\b|warnings?:\s*(0|none)\b", line, re.I))
    ok = code == 0
    return {"compiles": ok, "command": cmd, "durationMs": ms,
            "buildSizeBytes": build_size(workdir) if ok else 0, "warnings": min(warnings, 999),
            "errorsTail": tail((("" if ok else out) + f"\n[fallback build, exit {code}; {note}]").strip())}


def normalise(r: dict) -> dict:
    return {
        "compiles": as_bool(r.get("compiles")),
        "command": str(r.get("command") or "unknown")[:200],
        "durationMs": as_int(r.get("durationMs")),
        "buildSizeBytes": as_int(r.get("buildSizeBytes")),
        "warnings": as_int(r.get("warnings")),
        "errorsTail": tail(r.get("errorsTail") or ""),
    }


async def _work(ctx: dict, agent_id: str, workdir: str, tokens: dict, state: dict) -> dict:
    deadline = time.monotonic() + TOTAL_CAP
    prompt = (context_block(ctx, workdir)
              + "\n\nFind and run the build for this repository, then report the JSON object.")
    note = ""
    try:
        text = await asyncio.wait_for(run_agent("compiler", prompt, workdir, agent_id, tokens),
                                      LLM_CAP)
        parsed = parse_last_json(text)
        if parsed and "compiles" in parsed:
            return normalise(parsed)
        note = "model output unparseable"
    except asyncio.TimeoutError:
        note = f"model timed out after {LLM_CAP}s"
    except Exception as e:  # noqa: BLE001
        note = f"model call failed: {e!r}"[:300]
    print(f"[compiler] falling back: {note}", file=sys.stderr)
    state["note"] = note
    return normalise(await fallback(ctx, workdir, note, deadline - time.monotonic() - 5))


async def run(ctx: dict) -> None:
    ctx = ctx if isinstance(ctx, dict) else {}
    agent_id = ctx.get("agent_id") or "a_compiler"
    workdir = ctx.get("workdir") or "/work"
    tokens: dict = {}
    state: dict = {}
    result = None
    try:
        result = await asyncio.wait_for(_work(ctx, agent_id, workdir, tokens, state), TOTAL_CAP)
    except asyncio.TimeoutError:
        result = normalise({"compiles": False, "command": "unknown", "errorsTail":
                            f"compile agent timed out after {TOTAL_CAP}s. {state.get('note', '')}"})
    except BaseException as e:  # noqa: BLE001 - never escape, incl. cancellation by the deadline
        result = normalise({"compiles": False, "command": "unknown",
                            "errorsTail": f"compile agent stopped: {e!r}. {state.get('note', '')}"})
    finally:
        if result is None:
            result = normalise({"compiles": False, "command": "unknown", "errorsTail": "no result"})
        await emit("compile.done", **result)
        await emit("agent.done", agentId=agent_id, tokens=final_tokens(tokens))
