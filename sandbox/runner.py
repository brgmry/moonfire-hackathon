"""K3 run agent: does the repo actually run? Emits agent.working*, run.done, agent.done."""
import asyncio
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # works as script dir or package
from k3common import (as_bool, as_int, context_block, emit, final_tokens, parse_last_json, read_json,
                      run_agent, sh, tail)

TOTAL_CAP = 300      # whole agent, seconds
LLM_CAP = 220        # model phase; the rest is for the deterministic fallback
TEST_TIMEOUT = 180
KINDS = ("cli", "api", "web", "lib")
WEB_MARKERS = ("next", "vite", "nuxt", "svelte", "astro", "gatsby", "remix", "react-scripts", "angular")
API_MARKERS = ("express", "fastify", "koa", "hono", "@nestjs/core", "fastapi", "flask", "django",
               "uvicorn", "starlette", "gin-gonic", "labstack/echo", "actix-web", "axum")
NO_TEST = "no test specified"
README_API = re.compile(r"^\s*(?:GET|POST|PUT|PATCH|DELETE)\s+/\S*"
                        r"|curl\s+(?:-\S+\s+)*['\"]?https?://(?:localhost|127\.0\.0\.1)", re.M)


def _readme(wd: Path) -> str:
    for name in ("README.md", "readme.md", "README.rst", "README"):
        if (wd / name).is_file():
            return _read(wd / name)
    return ""


def _read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")[:20000] if p.is_file() else ""
    except Exception:  # noqa: BLE001
        return ""


def guess_kind(profile: dict, workdir: str) -> str:
    wd = Path(workdir)
    pkg = read_json(wd / "package.json")
    deps = " ".join(list((pkg.get("dependencies") or {}).keys())
                    + list((pkg.get("devDependencies") or {}).keys())).lower()
    fw = str(profile.get("framework") or "").lower()
    if any(m in fw for m in WEB_MARKERS) or any(m in deps.split() for m in WEB_MARKERS):
        return "web"
    manifests = " ".join(_read(wd / f) for f in ("pyproject.toml", "requirements.txt", "go.mod",
                                                 "Cargo.toml")).lower()
    if any(m in fw for m in API_MARKERS) or any(m in deps.split() or m in manifests for m in API_MARKERS):
        return "api"
    if README_API.search(_readme(wd)):  # README documents HTTP routes (json-server: "GET /posts")
        return "api"
    if pkg.get("bin") or "[project.scripts]" in manifests or "[[bin]]" in manifests \
            or (wd / "src" / "main.rs").exists() or (wd / "main.go").exists():
        return "cli"
    return "lib"


def _pm(profile: dict, wd: Path) -> str:
    pm = str(profile.get("packageManager") or "").lower()
    if "pnpm" in pm or (wd / "pnpm-lock.yaml").exists():
        return "pnpm"
    if "yarn" in pm or (wd / "yarn.lock").exists():
        return "yarn"
    return "npm"


def guess_test(profile: dict, workdir: str) -> str | None:
    wd = Path(workdir)
    pkg = read_json(wd / "package.json")
    test = str((pkg.get("scripts") or {}).get("test") or "") if isinstance(pkg.get("scripts"), dict) else ""
    if test and NO_TEST not in test:
        return f"{_pm(profile, wd)} test"
    if (wd / "Cargo.toml").exists():
        return "cargo test"
    if (wd / "go.mod").exists():
        return "go test -v ./..."
    py_tests = any((wd / d).is_dir() for d in ("tests", "test")) or any(wd.glob("test_*.py")) \
        or any(wd.glob("*/test_*.py")) or (profile.get("hasTests") and any(wd.glob("**/*.py")))
    if py_tests:
        venv = wd / ".venv" / "bin" / "python"
        if venv.exists():  # orchestrator installs repo deps into .venv, which usually lacks pytest
            return f"({venv} -m pytest --version >/dev/null 2>&1 || uv pip install -q -p .venv pytest) && {venv} -m pytest -q"
        # Install failed or made no .venv: build a throwaway one so the tests can import the repo.
        reqs = " -r requirements.txt" if (wd / "requirements.txt").exists() else ""
        pkg = " -e ." if (wd / "pyproject.toml").exists() or (wd / "setup.py").exists() else ""
        return (f"uv venv -q /tmp/k3venv && uv pip install -q -p /tmp/k3venv pytest{reqs}{pkg}"
                " && /tmp/k3venv/bin/python -m pytest -q")
    return None


def parse_counts(out: str) -> tuple[int, int]:
    """Best-effort passed/failed counts from common test runners."""
    cargo = re.findall(r"test result: \w+\. (\d+) passed; (\d+) failed", out)
    if cargo:
        return sum(int(p) for p, _ in cargo), sum(int(f) for _, f in cargo)
    tap_p = re.findall(r"^\s*(?:#|ℹ)\s*pass (\d+)", out, re.M)
    if tap_p:
        tap_f = re.findall(r"^\s*(?:#|ℹ)\s*fail (\d+)", out, re.M)
        return int(tap_p[-1]), int(tap_f[-1]) if tap_f else 0
    go_p = len(re.findall(r"^\s*--- PASS", out, re.M))
    go_f = len(re.findall(r"^\s*--- FAIL", out, re.M))
    if go_p or go_f:
        return go_p, go_f
    jest = re.findall(r"^\s*Tests:?\s+(.*)$", out, re.M)  # jest "Tests: 1 failed, 2 passed"; vitest
    lines = [jest[-1]] if jest else out.splitlines()[-30:]
    passed = failed = 0
    for line in lines:
        m = re.search(r"(\d+) passed", line)
        if m:
            passed = int(m.group(1))
            f = re.search(r"(\d+) failed", line)
            e = re.search(r"(\d+) errors?\b", line)
            failed = (int(f.group(1)) if f else 0) + (int(e.group(1)) if e else 0)
        elif re.search(r"(\d+) failed", line) and not passed:
            failed = int(re.search(r"(\d+) failed", line).group(1))
    return passed, failed


async def fallback(ctx: dict, workdir: str, kind: str, note: str, budget: float) -> dict:
    base = {"runs": False, "kind": kind, "testsPassed": 0, "testsFailed": 0,
            "endpointsOk": 0, "endpointsTotal": 0}
    cmd = guess_test(ctx.get("profile") or {}, workdir)
    if not cmd:
        return {**base, "errorsTail": f"no tests found; nothing run (fallback; {note})"}
    code, out, ms = await sh(cmd, workdir, max(10.0, min(TEST_TIMEOUT, budget)))
    passed, failed = parse_counts(out)
    runs = code == 0 or (passed > 0 and passed >= failed)
    return {**base, "runs": runs, "testsPassed": passed, "testsFailed": failed,
            "errorsTail": tail((("" if code == 0 else out)
                                + f"\n[fallback: `{cmd}` exit {code} in {ms}ms; {note}]").strip())}


def normalise(r: dict, kind: str) -> dict:
    k = str(r.get("kind") or kind).lower()
    return {
        "runs": as_bool(r.get("runs")),
        "kind": k if k in KINDS else kind,
        "testsPassed": as_int(r.get("testsPassed")),
        "testsFailed": as_int(r.get("testsFailed")),
        "endpointsOk": as_int(r.get("endpointsOk")),
        "endpointsTotal": as_int(r.get("endpointsTotal")),
        "errorsTail": tail(r.get("errorsTail") or ""),
    }


async def _work(ctx: dict, agent_id: str, workdir: str, tokens: dict, state: dict) -> dict:
    deadline = time.monotonic() + TOTAL_CAP
    kind = guess_kind(ctx.get("profile") or {}, workdir)
    state["kind"] = kind
    prompt = (context_block(ctx, workdir)
              + f"\nKind hint (from heuristics): {kind}"
              + "\n\nFind out whether this project runs, following your instructions for its kind,"
                " kill anything you started, then report the JSON object.")
    note = ""
    try:
        text = await asyncio.wait_for(run_agent("runner", prompt, workdir, agent_id, tokens),
                                      LLM_CAP)
        parsed = parse_last_json(text)
        if parsed and "runs" in parsed:
            return normalise(parsed, kind)
        note = "model output unparseable"
    except asyncio.TimeoutError:
        note = f"model timed out after {LLM_CAP}s"
    except Exception as e:  # noqa: BLE001
        note = f"model call failed: {e!r}"[:300]
    print(f"[runner] falling back: {note}", file=sys.stderr)
    state["note"] = note
    budget = deadline - time.monotonic() - 5
    return normalise(await fallback(ctx, workdir, kind, note, budget), kind)


async def run(ctx: dict) -> None:
    ctx = ctx if isinstance(ctx, dict) else {}
    agent_id = ctx.get("agent_id") or "a_runner"
    workdir = ctx.get("workdir") or "/work"
    tokens: dict = {}
    state: dict = {}
    result = None
    try:
        result = await asyncio.wait_for(_work(ctx, agent_id, workdir, tokens, state), TOTAL_CAP)
    except asyncio.TimeoutError:
        result = {"runs": False, "errorsTail": f"run agent timed out after {TOTAL_CAP}s. "
                                               f"{state.get('note', '')}"}
    except BaseException as e:  # noqa: BLE001 - never escape, incl. cancellation by the deadline
        result = {"runs": False, "errorsTail": f"run agent stopped: {e!r}. {state.get('note', '')}"}
    finally:
        result = normalise(result or {"runs": False, "errorsTail": "no result"},
                           state.get("kind", "lib"))
        await emit("run.done", **result)
        await emit("agent.done", agentId=agent_id, tokens=final_tokens(tokens))
