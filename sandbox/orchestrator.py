"""Orchestrator: clone, profile, install, plan, dispatch. The split is Opus 5.5's call (planner.py); rules are the fallback.

Interface for the non-explorer agents (compiler.py, runner.py, gitstats.py, Akshay):

    async def run(ctx: dict) -> None

    ctx = {
      "agent_id": "a_compiler_01",       # the orchestrator already emitted agent.spawned for it
      "workdir":  "/work/repo",          # the cloned repo, install already finished
      "profile":  {...},                 # the repo.profile payload (plus "fork": bool)
      "install":  {...},                 # the install.done payload (plus "command")
      "chunks":   [{id, path, files, bytes, churn, sampled}, ...],
      "memory":   {...},                 # parsed MEMORY_JSON, {} when absent
    }

The module emits agent.working, its result event (compile.done / run.done / contributors)
and agent.done via events.emit. If it raises or hangs past the deadline, the orchestrator
emits agent.done with zero tokens so the avatar still parks. Python deps of the target repo
are installed into <workdir>/.venv, never into the agents' own interpreter.
"""
import asyncio
import importlib
import json
import os
import re
import subprocess
import time
from collections import Counter, defaultdict

import httpx

import events
import llm

SONNET = "claude-sonnet-5-5"
HAIKU = "claude-haiku-5-5"
DEADLINE_S = 540
INSTALL_TIMEOUT_S = 180

IGNORE_DIRS = ("node_modules/", "vendor/", "dist/", "build/", ".next/", "target/", "__pycache__/",
               ".git/", ".venv/", "venv/", "coverage/", ".turbo/", ".cache/")
IGNORE_RE = re.compile(r"(\.min\.|\.lock$|-lock\.json$|\.generated\.|\.snap$|\.map$|\.lockb$)")
BINARY_EXT = {
    "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff", "svg", "psd", "avif",
    "woff", "woff2", "ttf", "otf", "eot",
    "zip", "gz", "tgz", "tar", "bz2", "xz", "7z", "rar", "jar", "war",
    "exe", "dll", "so", "dylib", "a", "o", "bin", "class", "pyc", "wasm", "node",
    "pdf", "mp3", "mp4", "mov", "avi", "wav", "ogg", "webm", "flac",
    "db", "sqlite", "sqlite3", "pkl", "pt", "onnx", "npy", "npz", "parquet", "h5",
}
MAX_FILE_BYTES = 200 * 1024
LANG_BY_EXT = {
    "ts": "ts", "tsx": "ts", "mts": "ts", "cts": "ts",
    "js": "js", "jsx": "js", "mjs": "js", "cjs": "js",
    "py": "py", "go": "go", "rs": "rs", "java": "java", "kt": "kt", "kts": "kt",
    "rb": "rb", "php": "php", "c": "c", "h": "c", "cc": "cpp", "cpp": "cpp", "cxx": "cpp",
    "hpp": "cpp", "cs": "cs", "swift": "swift", "scala": "scala", "sh": "sh", "bash": "sh",
    "css": "css", "scss": "css", "sass": "css", "less": "css", "html": "html", "vue": "vue",
    "svelte": "svelte", "ex": "ex", "exs": "ex", "dart": "dart", "lua": "lua", "zig": "zig",
    "sql": "sql",
}
LOCKFILES = [
    ("pnpm-lock.yaml", "pnpm"), ("yarn.lock", "yarn"), ("package-lock.json", "npm"),
    ("bun.lockb", "bun"), ("bun.lock", "bun"), ("uv.lock", "uv"), ("poetry.lock", "poetry"),
    ("requirements.txt", "pip"), ("Cargo.lock", "cargo"), ("go.sum", "go"),
    ("package.json", "npm"), ("pyproject.toml", "pip"), ("setup.py", "pip"),
    ("Cargo.toml", "cargo"), ("go.mod", "go"),
]
DEFAULT_INSTALL = {
    "pnpm": "corepack enable >/dev/null 2>&1; pnpm install --no-frozen-lockfile",
    "yarn": "corepack enable >/dev/null 2>&1; yarn install",
    "npm": "npm install --no-audit --no-fund",
    "bun": "npx --yes bun install",
    "uv": "uv sync",
    "poetry": "uv venv -q .venv && uv pip install -q -p .venv poetry && .venv/bin/poetry install --no-interaction",
    "pip": "uv venv -q .venv && (if [ -f requirements.txt ]; then uv pip install -q -p .venv -r requirements.txt; fi)"
           " && (if [ -f pyproject.toml ] || [ -f setup.py ]; then uv pip install -q -p .venv -e .; fi)",
    "cargo": "cargo fetch",
    "go": "go mod download",
}
TEST_RE = re.compile(r"(^|/)(tests?|__tests__|spec|specs)/|[._]tests?/|_test\.(go|py|exs?)$|(^|/)test_[^/]+\.py$"
                     r"|[.-](test|spec)(-d)?\.[a-z]+$|(^|/)tests?\.[a-z]+$|Tests?\.(php|cs|java|kt|swift)$", re.I)


def _cfg() -> dict:
    try:
        memory = json.loads(os.environ.get("MEMORY_JSON") or "{}")
    except json.JSONDecodeError:
        memory = {}
    return {
        "run_id": os.environ.get("RUN_ID", "local"),
        **dict(zip(("repo_url", "ref"), split_ref(os.environ.get("REPO_URL", "")))),
        "workdir": os.environ.get("WORKDIR", "/work"),
        "max_chunks": int(os.environ.get("MAX_CHUNKS", "24")),
        "max_parallel": int(os.environ.get("MAX_PARALLEL", "8")),
        "memory": memory if isinstance(memory, dict) else {},
        "rerun_chunk": os.environ.get("RERUN_CHUNK") or None,
        "rerun_chunk_json": os.environ.get("RERUN_CHUNK_JSON") or None,
    }


def split_ref(url: str) -> tuple[str, str | None]:
    """https://github.com/o/r/tree/<ref>, .../r#<ref> or .../r@<ref> -> (https://github.com/o/r, ref). Pins demo repos."""
    url = url.strip()
    m = re.match(r"^(https?://github\.com/[^/]+/[^/#@?]+?)(?:\.git)?(?:/tree/([^?#]+)|[#@]([^/?#]+))?/?$", url)
    if not m:
        return url, None
    return m.group(1), m.group(2) or m.group(3)


SECRET_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_API_KEYS", "ANTHROPIC_AUTH_TOKEN", "INTERNAL_TOKEN")


def sh(cmd, cwd=None, timeout=60) -> subprocess.CompletedProcess:
    # Install scripts and git hooks are the repo's code: they get no API keys.
    env = {k: v for k, v in os.environ.items() if k not in SECRET_ENV}
    return subprocess.run(cmd, cwd=cwd, timeout=timeout, capture_output=True, text=True,
                          shell=isinstance(cmd, str), errors="replace", env=env)


# ---------- 1. clone and profile ----------

class CloneFailed(Exception):
    pass


def clone(repo_url: str, workdir: str, ref: str | None = None) -> str:
    os.makedirs(workdir, exist_ok=True)
    dest = workdir if not os.listdir(workdir) else os.path.join(workdir, "repo")
    if not ref:
        try:
            r = sh(["git", "clone", "--depth", "50", "--no-tags", repo_url, dest], timeout=180)
        except subprocess.TimeoutExpired:
            raise CloneFailed("git clone took longer than 180s; the repository is too large for a live run")
        if r.returncode != 0:
            why = " ".join(l for l in r.stderr.strip().splitlines() if not l.startswith("Cloning into"))
            raise CloneFailed(f"git clone failed: {why[-300:]}")
        return dest
    # A sha, tag or branch: fetch just that history so the demo repos stay pinned.
    os.makedirs(dest, exist_ok=True)
    for cmd in (["git", "init", "-q"], ["git", "remote", "add", "origin", repo_url],
                ["git", "fetch", "-q", "--depth", "50", "--no-tags", "origin", "--", ref], ["git", "checkout", "-q", "FETCH_HEAD"]):
        try:
            r = sh(cmd, cwd=dest, timeout=180)
        except subprocess.TimeoutExpired:
            raise CloneFailed("fetching the pinned ref took longer than 180s")
        if r.returncode != 0:
            raise CloneFailed(f"{' '.join(cmd[:2])} failed for ref {ref}: {r.stderr.strip()[-300:]}")
    return dest


def list_files(repo: str) -> list[str]:
    out = sh(["git", "ls-files", "-z"], cwd=repo).stdout
    keep = []
    for p in out.split("\0"):
        if not p:
            continue
        if any(p.startswith(d) or f"/{d}" in p for d in IGNORE_DIRS):
            continue
        if IGNORE_RE.search(p):
            continue
        ext = p.rsplit(".", 1)[-1].lower() if "." in os.path.basename(p) else ""
        if ext in BINARY_EXT:
            continue
        full = os.path.join(repo, p)
        try:
            if os.path.islink(full) or not os.path.isfile(full) or os.path.getsize(full) > MAX_FILE_BYTES:
                continue
        except OSError:
            continue
        keep.append(p)
    return sorted(keep)


def github_meta(repo_url: str) -> dict:
    m = re.search(r"github\.com[:/]([^/]+)/([^/#?]+?)(?:\.git)?/?$", repo_url)
    if not m:
        return {}
    try:
        r = httpx.get(f"https://api.github.com/repos/{m.group(1)}/{m.group(2)}", timeout=5,
                      headers={"Accept": "application/vnd.github+json"})
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return {}


def _read(repo: str, path: str) -> str:
    try:
        with open(os.path.join(repo, path), encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def profile_repo(repo: str, repo_url: str, files: list[str]) -> dict:
    sizes = {p: os.path.getsize(os.path.join(repo, p)) for p in files}
    lang_bytes = Counter()
    for p, n in sizes.items():
        ext = p.rsplit(".", 1)[-1].lower() if "." in os.path.basename(p) else ""
        if ext in LANG_BY_EXT:
            lang_bytes[LANG_BY_EXT[ext]] += n
    total = sum(lang_bytes.values()) or 1
    languages = {k: round(100 * v / total) for k, v in lang_bytes.most_common() if 100 * v / total >= 1}

    exists = lambda name: os.path.exists(os.path.join(repo, name))  # noqa: E731
    manager = next((m for name, m in LOCKFILES if exists(name)), None)

    pkg = {}
    if exists("package.json"):
        try:
            pkg = json.loads(_read(repo, "package.json"))
        except json.JSONDecodeError:
            pkg = {}
    deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
    pyproject = _read(repo, "pyproject.toml")
    pyreqs = (pyproject + _read(repo, "requirements.txt")).lower()
    root_names = set(os.listdir(repo))

    framework = None
    if any(n.startswith("next.config.") for n in root_names) or "next" in deps:
        framework = "next"
    elif any(n.startswith("vite.config.") for n in root_names) or "vite" in deps:
        framework = "vite"
    elif exists("manage.py"):
        framework = "django"
    elif "fastapi" in pyreqs:
        framework = "fastapi"
    elif "flask" in pyreqs:
        framework = "flask"
    elif "express" in deps or "fastify" in deps or "hono" in deps:
        framework = next(k for k in ("express", "fastify", "hono") if k in deps)
    elif "[tool.poetry]" in pyproject:
        framework = "poetry"
    elif exists("Cargo.toml"):
        framework = "cargo"
    elif exists("go.mod"):
        framework = "go"

    scripts = pkg.get("scripts") or {}
    has_build = bool(scripts.get("build")) or any(exists(n) for n in (
        "Cargo.toml", "go.mod", "tsconfig.json", "setup.py", "Makefile", "CMakeLists.txt", "build.gradle", "pom.xml",
    )) or "[build-system]" in pyproject

    head = sh(["git", "rev-parse", "HEAD"], cwd=repo).stdout.strip()
    branch = sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo).stdout.strip()
    meta = github_meta(repo_url)
    name = meta.get("full_name") or re.sub(r"(\.git)?/?$", "", repo_url).split("github.com/")[-1]
    return {
        "name": name,
        "defaultBranch": meta.get("default_branch") or branch,
        "commit": head,
        "stars": meta.get("stargazers_count", 0),
        "languages": languages,
        "packageManager": manager,
        "framework": framework,
        "hasTests": any(TEST_RE.search(p) for p in files)
                    or "no test specified" not in str(scripts.get("test", "no test specified")),
        "hasBuild": has_build,
        "hasDockerfile": any(os.path.basename(p) == "Dockerfile" or p.endswith(".dockerfile") for p in files),
        "fileCount": len(files),
        "files": files,
        "fork": bool(meta.get("fork", False)),
    }, sizes


# ---------- 2. install ----------

def default_install(manager: str | None, memory: dict) -> str | None:
    if not manager:
        return None
    # Learned recipes came from earlier sandboxes, which ran untrusted code: only the fixed defaults run here.
    return DEFAULT_INSTALL.get(manager)


def install(repo: str, manager: str | None, memory: dict, command: str | None = None) -> dict:
    command = command or default_install(manager, memory)
    if not command:
        return {"ok": True, "manager": manager, "durationMs": 0, "errorsTail": "", "command": None}
    t0 = time.time()
    try:
        r = sh(command, cwd=repo, timeout=INSTALL_TIMEOUT_S)
        ok, out = r.returncode == 0, (r.stdout + "\n" + r.stderr)
    except subprocess.TimeoutExpired as e:
        ok, out = False, f"{e.stdout or ''}\n{e.stderr or ''}\ninstall timed out after {INSTALL_TIMEOUT_S}s"
    out = out if isinstance(out, str) else out.decode(errors="replace")
    return {"ok": ok, "manager": manager, "durationMs": int(1000 * (time.time() - t0)),
            "errorsTail": "" if ok else out.strip()[-1500:], "command": command}


# ---------- 3. chunk ----------

def _slug(path: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", path.lower()).strip("_")
    return s[:40] or "root"


def _common_dir(paths: list[str]) -> str:
    parts = [p.split("/")[:-1] for p in paths]
    common = []
    for segs in zip(*parts):
        if len(set(segs)) != 1:
            break
        common.append(segs[0])
    return "/".join(common)


def churn_counts(repo: str) -> Counter:
    log = sh(["git", "log", "--since=1.year", "--name-only", "--pretty=format:"], cwd=repo).stdout
    return Counter(line.strip() for line in log.splitlines() if line.strip())


def make_chunks(repo: str, files: list[str], sizes: dict, max_chunks: int,
                max_files: int = 40, max_bytes: int = 150 * 1024) -> list[dict]:
    pkg_dirs = sorted({os.path.dirname(p) for p in files
                       if os.path.basename(p) in ("package.json", "pyproject.toml") and "/" in p},
                      key=len, reverse=True)
    groups = defaultdict(list)
    for p in files:
        key = next((d for d in pkg_dirs if p.startswith(d + "/")), None)
        if key is None:
            key = p.split("/", 1)[0] if "/" in p else "."
        groups[key].append(p)

    pieces = []
    for key in sorted(groups):
        cur, cur_bytes = [], 0
        for p in sorted(groups[key]):
            if cur and (len(cur) >= max_files or cur_bytes + sizes[p] > max_bytes):
                pieces.append((key, cur))
                cur, cur_bytes = [], 0
            cur.append(p)
            cur_bytes += sizes[p]
        if cur:
            pieces.append((key, cur))

    churn_by_path = churn_counts(repo)

    chunks, seen_ids, seen_paths = [], Counter(), Counter()
    for key, fs in pieces:
        path = key if key == "." else (_common_dir(fs) if len(fs) > 1 else key) or key
        if not path.startswith(key) and key != ".":
            path = key
        seen_paths[path] += 1
        label = path if seen_paths[path] == 1 else f"{path} #{seen_paths[path]}"
        base = "c_" + _slug(path if path != "." else "root")
        seen_ids[base] += 1
        cid = base if seen_ids[base] == 1 else f"{base}_{seen_ids[base]}"
        chunks.append({"id": cid, "path": label, "files": fs, "bytes": sum(sizes[f] for f in fs),
                       "churn": sum(churn_by_path[f] for f in fs), "sampled": False})

    if len(chunks) > max_chunks:
        ranked = sorted(chunks, key=lambda c: (c["churn"], c["bytes"]), reverse=True)
        keep = {c["id"] for c in ranked[:max_chunks]}
        for c in chunks:
            c["sampled"] = c["id"] not in keep
    return chunks


# ---------- 4/5. dispatch ----------

def _optional(name: str):
    try:
        return importlib.import_module(name)
    except ImportError:
        return None
    except Exception as e:  # a broken module must not kill the run
        print(f"orchestrator: could not import {name}: {e}", flush=True)
        return None


class Crew:
    def __init__(self):
        self.counts = Counter()

    def new_id(self, role: str) -> str:
        self.counts[role] += 1
        return f"a_{role}_{self.counts[role]:02d}"

    async def supervise(self, agent_id: str, role: str, model: str | None, coro_fn, chunk_id=None):
        payload = {"agentId": agent_id, "role": role, "model": model}
        if chunk_id:
            payload["chunkId"] = chunk_id
        events.emit("agent.spawned", **payload)
        try:
            return await coro_fn()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"orchestrator: {agent_id} crashed: {type(e).__name__}: {e}", flush=True)
            return None
        finally:
            if agent_id not in events.done_agents:
                events.emit("agent.done", agentId=agent_id, tokens={"in": 0, "out": 0, "cacheRead": 0})


async def run() -> None:
    cfg = _cfg()
    t0 = time.time()
    crew = Crew()
    orch_id = crew.new_id("orchestrator")
    planner = _optional("planner")
    events.emit("agent.spawned", agentId=orch_id, role="orchestrator", model=planner.MODEL if planner else None)
    cfg["planner"] = planner
    cfg["orch_tokens"] = llm.zero_tokens()
    try:
        await asyncio.wait_for(_run(cfg, crew, orch_id, t0), timeout=DEADLINE_S)
    except asyncio.TimeoutError:
        print(f"orchestrator: deadline {DEADLINE_S}s hit, exiting with what landed", flush=True)
        events.emit("sandbox.failed", fatal=False, reason=f"the crew hit its {DEADLINE_S}s deadline; scored what landed")
    except CloneFailed as e:
        print(f"orchestrator: {e}", flush=True)
        events.emit("sandbox.failed", fatal=True, reason=str(e)[:400])
    finally:
        # Own tokens only (the planner call): the backend sums every agent.done.
        events.emit("agent.done", agentId=orch_id, **llm.done(cfg["orch_tokens"]))


async def _run(cfg: dict, crew: Crew, orch_id: str, t0: float) -> None:
    events.emit("agent.working", agentId=orch_id, file="git clone")
    repo = await asyncio.to_thread(clone, cfg["repo_url"], cfg["workdir"], cfg.get("ref"))
    files = await asyncio.to_thread(list_files, repo)
    profile, sizes = await asyncio.to_thread(profile_repo, repo, cfg["repo_url"], files)
    if cfg["rerun_chunk"]:
        return await _rerun(cfg, crew, repo, files, sizes)
    events.emit("repo.profile", **{k: v for k, v in profile.items() if k != "fork"})

    # Install runs while the lead plans and explorers read: they need only the source.
    events.emit("agent.working", agentId=orch_id, file=f"install ({profile['packageManager'] or 'none'})")
    default_cmd = default_install(profile["packageManager"], cfg["memory"])
    install_task = asyncio.create_task(asyncio.to_thread(install, repo, profile["packageManager"], cfg["memory"]))

    claims = _optional("claims")
    tasks = []
    if claims:
        aid = crew.new_id("claims")
        tasks.append(asyncio.create_task(crew.supervise(aid, "claims", HAIKU, lambda: claims.run(aid, repo))))

    churn = await asyncio.to_thread(churn_counts, repo)
    plan = None
    planner = cfg.get("planner")
    if planner:
        events.emit("agent.working", agentId=orch_id, file="planning the review")
        try:
            plan = await planner.plan(repo, profile, files, sizes, churn, default_cmd, cfg["orch_tokens"],
                                      on_step=lambda p: events.emit("agent.working", agentId=orch_id, file=llm.rel(p, repo)))
        except Exception as e:  # planning must never stop the run
            print(f"orchestrator: planner failed: {type(e).__name__}: {e}", flush=True)
            plan = None
    chunks = None
    if plan:
        try:
            chunks = planner.build_chunks(plan, files, sizes, churn, cfg["max_chunks"], _common_dir, _slug)
        except Exception as e:  # a malformed plan falls back to the rules
            print(f"orchestrator: plan unusable ({type(e).__name__}: {e}), splitting by rules", flush=True)
            plan = None
    if plan and chunks:
        print(f"orchestrator: plan from {planner.MODEL}: {len(plan['chunks'])} planned, {len(chunks)} chunks, "
              f"kind={plan.get('kind')}, install={'custom' if plan.get('install') else 'default'}", flush=True)
    else:
        events.emit("agent.working", agentId=orch_id, file="planner unavailable, splitting by rules")
        plan = None
        chunks = await asyncio.to_thread(make_chunks, repo, files, sizes, cfg["max_chunks"])
    for c in chunks:
        events.emit("chunk.created", chunk=c)
    plan_ctx = {"kind": (plan or {}).get("kind"), "install": (plan or {}).get("install") or None,
                "summary": (plan or {}).get("summary")}

    memory = cfg["memory"]
    do_not = [str(x) for x in (memory.get("doNot") or [])][:3]
    sem = asyncio.Semaphore(cfg["max_parallel"])
    explorer = _optional("explorer")

    async def explore(chunk):
        async with sem:
            aid = crew.new_id("explorer")
            return await crew.supervise(aid, "explorer", HAIKU,
                                        lambda: explorer.run(aid, chunk, repo, do_not), chunk_id=chunk["id"])

    explorer_tasks = [asyncio.create_task(explore(c)) for c in chunks if not c["sampled"]] if explorer else []
    async def after_install():
        result = await install_task
        # The lead's install command is the second try when the default failed or there was none.
        custom = plan_ctx["install"]
        if custom and custom != result.get("command") and (not result["ok"] or not result.get("command")):
            events.emit("agent.working", agentId=orch_id, file="install (plan)")
            retry = await asyncio.to_thread(install, repo, profile["packageManager"], cfg["memory"], custom)
            if retry["ok"] or not result["ok"]:
                result = retry
        events.emit("install.done", **result)
        return result

    install_done = asyncio.create_task(after_install())
    tasks.append(install_done)

    def ctx_for(agent_id: str, install_result: dict) -> dict:
        return {"agent_id": agent_id, "workdir": repo, "profile": profile, "install": install_result,
                "chunks": chunks, "memory": memory, "plan": plan_ctx}

    for mod_name, role, model, needs_install in (("gitstats", "git", None, False),
                                                 ("compiler", "compiler", SONNET, True),
                                                 ("runner", "runner", SONNET, True)):
        mod = _optional(mod_name)
        if not mod or not hasattr(mod, "run"):
            continue

        async def go(mod=mod, role=role, model=model, needs_install=needs_install):
            inst = await install_done if needs_install else {}
            aid = crew.new_id(role)
            return await crew.supervise(aid, role, model, lambda: mod.run(ctx_for(aid, inst)))

        tasks.append(asyncio.create_task(go()))

    async def classify_after_explorers():
        results = await asyncio.gather(*explorer_tasks, return_exceptions=True)
        findings = [f for r in results if isinstance(r, list) for f in r]
        classifier = _optional("classifier")
        if classifier and findings:
            aid = crew.new_id("classifier")
            await crew.supervise(aid, "classifier", HAIKU, lambda: classifier.run(aid, findings))

    tasks.append(asyncio.create_task(classify_after_explorers()))
    try:
        await asyncio.gather(*tasks, return_exceptions=True)
    finally:
        for t in tasks + explorer_tasks:
            t.cancel()


async def _rerun(cfg: dict, crew: Crew, repo: str, files: list[str], sizes: dict) -> None:
    """RERUN_CHUNK=<id>: the backend already has the profile and chunks, explore that one chunk again."""
    chunk = None
    if cfg.get("rerun_chunk_json"):
        try:
            chunk = json.loads(cfg["rerun_chunk_json"])
        except json.JSONDecodeError:
            chunk = None
    if not chunk:
        chunks = await asyncio.to_thread(make_chunks, repo, files, sizes, cfg["max_chunks"])
        chunk = next((c for c in chunks if c["id"] == cfg["rerun_chunk"]), None)
    explorer = _optional("explorer")
    if not chunk or not explorer:
        print(f"orchestrator: rerun chunk {cfg['rerun_chunk']} not found", flush=True)
        return
    do_not = [str(x) for x in (cfg["memory"].get("doNot") or [])][:3]
    aid = crew.new_id("explorer")
    findings = await crew.supervise(aid, "explorer", HAIKU, lambda: explorer.run(aid, chunk, repo, do_not),
                                    chunk_id=chunk["id"])
    classifier = _optional("classifier")
    if classifier and findings:
        cid = crew.new_id("classifier")
        await crew.supervise(cid, "classifier", HAIKU, lambda: classifier.run(cid, findings))
