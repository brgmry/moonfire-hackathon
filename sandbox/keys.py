"""The key pool inside the sandbox.

ANTHROPIC_API_KEYS="allen:sk-ant-...,bergen:...,akshay:..."  (the job's secret)
ANTHROPIC_KEY_WEIGHTS="allen:0.52,bergen:0.31,akshay:0.17"  (from the backend, share of credit left)

Each query picks a key by weight, so the load and the rate limits spread over the three accounts.
A billing or auth error kills the key for this run and tells the backend; a rate limit cools it for 30s.
"""
import os
import random
import time

import events

_keys: dict[str, str] = {}
_weights: dict[str, float] = {}
_dead: set[str] = set()
_cool: dict[str, float] = {}


def _pairs(s: str) -> list[tuple[str, str]]:
    out = []
    for part in (s or "").split(","):
        name, _, value = part.strip().partition(":")
        if name.strip() and value.strip():
            out.append((name.strip(), value.strip()))
    return out


def load() -> None:
    _keys.update(_pairs(os.environ.get("ANTHROPIC_API_KEYS", "")))
    if not _keys and os.environ.get("ANTHROPIC_API_KEY"):
        _keys["default"] = os.environ["ANTHROPIC_API_KEY"]
    for name, w in _pairs(os.environ.get("ANTHROPIC_KEY_WEIGHTS", "")):
        try:
            _weights[name] = float(w)
        except ValueError:
            pass
    primary = max(_keys, key=lambda n: _weights.get(n, 0.0)) if _keys else None
    # Agents that do not pick per query (compiler, runner) use the process env: give them the best key.
    if primary:
        os.environ["ANTHROPIC_API_KEY"] = _keys[primary]


def pick(exclude: set[str] | frozenset = frozenset()) -> tuple[str | None, str | None]:
    now = time.time()
    names = [n for n in _keys if n not in _dead and n not in exclude and _cool.get(n, 0) <= now]
    if not names:
        names = [n for n in _keys if n not in exclude]
    if not names:
        return None, None
    weights = [max(_weights.get(n, 1.0 if not _weights else 0.0), 0.0) for n in names]
    if sum(weights) <= 0:
        weights = [1.0] * len(names)
    name = random.choices(names, weights=weights, k=1)[0]
    return name, _keys[name]


def count() -> int:
    return len(_keys)


def failed(name: str | None, error: str) -> None:
    if not name:
        return
    if error == "rate_limit":
        _cool[name] = time.time() + 30
    elif error in ("billing_error", "authentication_failed"):
        if name not in _dead:
            _dead.add(name)
            events.emit("key.exhausted", key=name, error=error)
