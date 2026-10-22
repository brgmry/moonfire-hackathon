"""Planner: Opus 5.5 at medium effort looks at the repo and splits the review into chunks.

The model decides the split, what each explorer should look for, how important each chunk is,
what kind of project this is and, when the default would not work, how to install it.
Code keeps the plan honest: every reviewable file lands in exactly one chunk, chunks stay under
the explorers' size caps, the top chunks by priority get explorers, and any failure falls back
to the rule-based chunker so a run never stalls on planning.
"""
import json
import os
import re
from collections import Counter, defaultdict

import llm

MODEL = "claude-opus-5-5"
EFFORT = "medium"
TIMEOUT_S = 75
MAX_TURNS = 12
MAX_FILES, MAX_BYTES = 40, 150 * 1024
KINDS = ("cli", "api", "web", "lib")

SYSTEM = llm.prompt("planner")

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "kind": {"type": "string", "enum": list(KINDS)},
        "install": {"type": "string"},
        "chunks": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "paths": {"type": "array", "items": {"type": "string"}},
                    "focus": {"type": "string"},
                    "priority": {"type": "integer", "minimum": 1, "maximum": 5},
                },
                "required": ["name", "paths", "focus", "priority"],
            },
        },
        "skip": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "kind", "install", "chunks", "skip"],
}


def _dir_table(files: list[str], sizes: dict, churn: Counter, limit: int = 400) -> str:
    """Small repos: every file. Big ones: directories up to depth 3, with counts, KB and churn."""
    if len(files) <= 300:
        return "\n".join(f"{p}  {max(1, sizes[p] // 1024)}KB  churn {churn[p]}" for p in sorted(files))
    agg = defaultdict(lambda: [0, 0, 0])
    for p in files:
        parts = p.split("/")
        key = "/".join(parts[:min(3, len(parts) - 1)]) or "."
        a = agg[key]
        a[0] += 1
        a[1] += sizes[p]
        a[2] += churn[p]
    rows = sorted(agg.items(), key=lambda kv: kv[0])[:limit]
    note = "" if len(agg) <= limit else f"\n... {len(agg) - limit} more directories not shown"
    return "\n".join(f"{d}/  {n} files  {max(1, b // 1024)}KB  churn {c}" for d, (n, b, c) in rows) + note


def _readme_head(repo: str, lines: int = 60) -> str:
    import claims
    rel = claims.find_readme(repo)
    if not rel:
        return "(no README found)"
    try:
        with open(os.path.join(repo, rel), encoding="utf-8", errors="replace") as f:
            return "".join(f.readlines()[:lines])
    except OSError:
        return ""


def _norm(entry: str) -> str:
    e = entry.strip().strip("`").replace("\\", "/")
    e = re.sub(r"^\./", "", e)
    e = re.sub(r"/?\*\*?(/\*)?$", "", e)  # "src/api/**" -> "src/api"
    return e.strip("/")


def _owner(path: str, entries: list[tuple[str, int]]) -> int | None:
    """Index of the chunk whose path entry is the longest match for this file."""
    best, best_len = None, -1
    for e, i in entries:
        if e in ("", "."):
            if "/" not in path and best_len < 0:
                best, best_len = i, 0
        elif path == e or path.startswith(e + "/"):
            if len(e) > best_len:
                best, best_len = i, len(e)
    return best


def _split(name: str, fs: list[str], sizes: dict) -> list[tuple[str, list[str]]]:
    pieces, cur, cur_bytes = [], [], 0
    for p in sorted(fs):
        if cur and (len(cur) >= MAX_FILES or cur_bytes + sizes[p] > MAX_BYTES):
            pieces.append(cur)
            cur, cur_bytes = [], 0
        cur.append(p)
        cur_bytes += sizes[p]
    if cur:
        pieces.append(cur)
    if len(pieces) == 1:
        return [(name, pieces[0])]
    return [(f"{name} #{i + 1}", p) for i, p in enumerate(pieces)]


def build_chunks(plan: dict, files: list[str], sizes: dict, churn: Counter, max_chunks: int,
                 common_dir, slug) -> list[dict]:
    """Turn the model's plan into a partition of `files` that respects the caps."""
    planned = plan["chunks"]
    entries = [(_norm(e), i) for i, c in enumerate(planned) for e in c.get("paths") or []]
    skip = [_norm(s) for s in plan.get("skip") or [] if _norm(s)]
    groups: dict[int, list[str]] = defaultdict(list)
    leftovers: dict[str, list[str]] = defaultdict(list)
    skipped: dict[str, list[str]] = defaultdict(list)
    for p in files:
        i = _owner(p, entries)
        if i is not None:
            groups[i].append(p)
        elif any(p == s or p.startswith(s + "/") for s in skip):
            skipped[p.split("/", 1)[0] if "/" in p else "."].append(p)
        else:
            leftovers[p.split("/", 1)[0] if "/" in p else "."].append(p)

    raw = []  # (name, files, focus, priority, sampled_by_plan)
    for i, c in enumerate(planned):
        if groups.get(i):
            for name, fs in _split(str(c["name"]).strip()[:60] or f"chunk {i + 1}", groups[i], sizes):
                raw.append((name, fs, str(c.get("focus") or "").strip()[:400], int(c.get("priority") or 3), False))
    for key, fs in sorted(leftovers.items()):
        for name, part in _split(key if key != "." else "root files", fs, sizes):
            raw.append((name, part, "", 1, False))
    for key, fs in sorted(skipped.items()):
        for name, part in _split(f"{key} (skipped)", fs, sizes):
            raw.append((name, part, "", 0, True))

    chunks, seen = [], Counter()
    for name, fs, focus, priority, skipped_flag in raw:
        base = "c_" + slug(name)
        seen[base] += 1
        cid = base if seen[base] == 1 else f"{base}_{seen[base]}"
        chunks.append({
            "id": cid, "path": common_dir(fs) if len(fs) > 1 else fs[0], "name": name,
            "files": fs, "bytes": sum(sizes[f] for f in fs), "churn": sum(churn[f] for f in fs),
            "focus": focus, "priority": priority, "sampled": skipped_flag, "skipped": skipped_flag,
        })
    live = [c for c in chunks if not c["sampled"]]
    if len(live) > max_chunks:
        keep = {c["id"] for c in sorted(live, key=lambda c: (c["priority"], c["churn"], c["bytes"]), reverse=True)[:max_chunks]}
        for c in live:
            c["sampled"] = c["id"] not in keep
    for c in chunks:
        if not c["path"]:
            c["path"] = c["name"]
    return chunks


async def plan(repo: str, profile: dict, files: list[str], sizes: dict, churn: Counter,
               default_install: str | None, tokens: dict, on_step=None) -> dict | None:
    """Ask the model for a plan. Returns the validated plan dict, or None to fall back to rules."""
    user = (
        "Repository profile:\n"
        + json.dumps({k: profile.get(k) for k in ("name", "languages", "packageManager", "framework", "hasTests",
                                                  "hasBuild", "hasDockerfile", "fileCount")})
        + f"\n\nInstall command the sandbox will run by default: {default_install or '(none, no package manager found)'}"
        + "\n\nReviewable files (path, size, commits touching it in the last year):\n"
        + _dir_table(files, sizes, churn)
        + "\n\nREADME, first lines:\n" + _readme_head(repo)
        + "\n\nReturn the plan."
    )
    out: dict = {}
    text, _ = await llm.ask(user, system=SYSTEM, model=MODEL, cwd=repo, tools=llm.READ_ONLY, tokens=tokens,
                            max_turns=MAX_TURNS, timeout=TIMEOUT_S, on_read=on_step, out=out,
                            effort=EFFORT, output_format={"type": "json_schema", "schema": SCHEMA})
    result = out.get("structured")
    if not isinstance(result, dict):
        try:
            result = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", (text or "").strip(), flags=re.M))
        except (json.JSONDecodeError, TypeError):
            return None
    chunks = [c for c in result.get("chunks") or [] if isinstance(c, dict) and c.get("paths")]
    if not chunks:
        return None
    result["chunks"] = chunks
    if result.get("kind") not in KINDS:
        result["kind"] = None
    result["install"] = str(result.get("install") or "").strip()
    return result
