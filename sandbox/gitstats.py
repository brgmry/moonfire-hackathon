"""Git stats agent: contributors per chunk from shortlog + blame. No LLM.

Emits agent.working (throttled), exactly one `contributors`, then exactly one `agent.done`.
"""
import asyncio
import inspect
import json
import os
import re
import subprocess
import time
import urllib.request

from events import emit

BOT_RE = re.compile(r"bot|dependabot|renovate|actions", re.I)
BLAME_TIMEOUT = 2.0
CHUNK_BUDGET = 20.0
TOTAL_BUDGET = 120.0
PARALLEL = 6
MAX_AUTHORS = 25
MAX_FILE_BYTES = 2_000_000


async def _emit(event: str, **payload) -> None:
    try:
        res = emit(event, **payload)
        if inspect.isawaitable(res):
            await res
    except Exception:
        pass


async def _git(cwd: str, *args: str, timeout: float = 10.0) -> str | None:
    """Run git, return stdout text or None on failure/timeout."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", *args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    except Exception:
        return None
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        try:
            proc.kill()
            await proc.wait()
        except Exception:
            pass
        return None
    if proc.returncode != 0:
        return None
    return out.decode("utf-8", "replace")


def _is_bot(name: str, email: str) -> bool:
    return bool(BOT_RE.search(name or "") or BOT_RE.search(email or ""))


async def _shortlog(cwd: str) -> dict:
    out = await _git(cwd, "shortlog", "-sne", "--no-merges", "HEAD", timeout=20)
    authors: dict = {}
    for line in (out or "").splitlines():
        m = re.match(r"\s*(\d+)\s+(.*?)\s*<([^>]*)>\s*$", line)
        if not m or _is_bot(m.group(2), m.group(3)):
            continue
        key = m.group(3).strip().lower()
        a = authors.setdefault(key, {"name": m.group(2), "email": m.group(3).strip(),
                                     "commits": 0, "lines": 0, "chunks": {}})
        a["commits"] += int(m.group(1))
    return authors


def _parse_blame(text: str) -> dict:
    # Lines from a shallow clone's boundary commit are skipped: they would credit
    # all pre-depth history to whoever authored the oldest fetched commit.
    counts: dict = {}  # email_lower -> [name, email, lines]
    name = email = ""
    boundary = False
    for line in text.splitlines():
        if line.startswith("\t"):
            key = email.lower()
            if boundary or not key or key == "not.committed.yet" or _is_bot(name, email):
                continue
            counts.setdefault(key, [name, email, 0])[2] += 1
        elif line.startswith("author "):
            name, boundary = line[7:], False
        elif line.startswith("author-mail "):
            email = line[12:].strip().strip("<>").strip()
        elif line == "boundary":
            boundary = True
    return counts


async def _truncated(cwd: str) -> bool:
    try:
        depth = int(os.environ.get("CLONE_DEPTH", "50") or 50)
    except ValueError:
        depth = 50
    count = (await _git(cwd, "rev-list", "--count", "HEAD") or "").strip()
    shallow = (await _git(cwd, "rev-parse", "--is-shallow-repository") or "").strip() == "true"
    if not count.isdigit():
        return False
    n = int(count)
    return n == depth or (shallow and n >= depth)


def _fetch_fork(owner: str, repo: str) -> bool:
    req = urllib.request.Request(f"https://api.github.com/repos/{owner}/{repo}",
                                 headers={"Accept": "application/vnd.github+json",
                                          "User-Agent": "moonfire-gitstats"})
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return bool(json.loads(resp.read().decode("utf-8")).get("fork", False))


async def _fork(cwd: str) -> bool:
    try:
        url = os.environ.get("REPO_URL") or (await _git(cwd, "remote", "get-url", "origin") or "")
        m = re.search(r"github\.com[:/]+([^/\s]+)/([^/\s]+?)(?:\.git)?/?$", url.strip())
        if not m:
            return False
        return await asyncio.wait_for(asyncio.to_thread(_fetch_fork, m.group(1), m.group(2)), 7)
    except Exception:
        return False


async def _blame_all(ctx: dict, cwd: str, authors: dict) -> None:
    agent_id = ctx.get("agent_id") or "a_git"
    chunks = [c for c in (ctx.get("chunks") or []) if isinstance(c, dict)]
    chunks.sort(key=lambda c: bool(c.get("sampled")))  # non-sampled first
    start = time.monotonic()
    sem = asyncio.Semaphore(PARALLEL)
    chunk_start: dict = {}
    done = [0]

    async def blame(cid: str, path: str) -> None:
        async with sem:
            now = time.monotonic()
            if now - start > TOTAL_BUDGET:
                return
            if now - chunk_start.setdefault(cid, now) > CHUNK_BUDGET:
                return
            full = os.path.join(cwd, path)
            try:
                if not os.path.isfile(full) or os.path.getsize(full) > MAX_FILE_BYTES:
                    return
            except OSError:
                return
            if done[0] % 10 == 0:
                await _emit("agent.working", agentId=agent_id, file=path)
            done[0] += 1
            out = await _git(cwd, "blame", "--line-porcelain", "--", path, timeout=BLAME_TIMEOUT)
        if not out:
            return
        for key, (name, email, n) in _parse_blame(out).items():
            a = authors.setdefault(key, {"name": name, "email": email,
                                         "commits": 0, "lines": 0, "chunks": {}})
            a["lines"] += n
            a["chunks"][cid] = a["chunks"].get(cid, 0) + n

    tasks = [blame(str(c.get("id") or c.get("path") or i), f)
             for i, c in enumerate(chunks) for f in (c.get("files") or []) if isinstance(f, str)]
    if tasks:
        await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), TOTAL_BUDGET + 10)


async def run(ctx: dict) -> None:
    ctx = ctx if isinstance(ctx, dict) else {}
    agent_id = ctx.get("agent_id") or "a_git"
    cwd = ctx.get("workdir") or os.getcwd()
    authors: dict = {}
    truncated = fork = False
    try:
        fork_task = asyncio.ensure_future(_fork(cwd))
        authors = await _shortlog(cwd)
        truncated = await _truncated(cwd)
        try:
            await _blame_all(ctx, cwd, authors)
        except Exception:
            pass  # partial blame results are still useful
        fork = await fork_task
    except Exception:
        pass
    finally:
        try:
            ranked = sorted(authors.values(), key=lambda a: (-a["lines"], -a["commits"]))[:MAX_AUTHORS]
        except Exception:
            ranked = []
        await _emit("contributors", authors=ranked, truncated=bool(truncated), fork=bool(fork))
        await _emit("agent.done", agentId=agent_id, tokens={"in": 0, "out": 0, "cacheRead": 0})
