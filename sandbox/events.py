"""Every event leaves the container through emit(). Batches of 20 or every 500ms."""
import json
import os
import sys
import threading
import time
from datetime import datetime, timezone

import httpx

# Read once and removed from os.environ: repo code (installs, tests, Bash agents) inherits the env.
# RUN_TOKEN only opens this run's event log; INTERNAL_TOKEN is the fallback for older backends.
_TOKEN = (os.environ.pop("RUN_TOKEN", "") or os.environ.get("INTERNAL_TOKEN", "")).strip()
os.environ.pop("INTERNAL_TOKEN", None)

BATCH = 20
INTERVAL = 0.5

_buf: list[dict] = []
_lock = threading.Lock()
_wake = threading.Event()
_stop = threading.Event()
_thread: threading.Thread | None = None
done_agents: set[str] = set()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def emit(type: str, **payload) -> None:
    event = {"type": type, "ts": _now(), **payload}
    if type == "agent.done":
        done_agents.add(payload.get("agentId"))
    print(json.dumps({"event": event}, default=str), flush=True)
    with _lock:
        _buf.append(event)
        if len(_buf) >= BATCH:
            _wake.set()
    _ensure_thread()


def _post(events: list[dict]) -> None:
    api = os.environ.get("API_URL")
    if not api or api == "http://placeholder":
        return
    body = {"runId": os.environ.get("RUN_ID", "local"), "events": events}
    headers = {"Authorization": f"Bearer {_TOKEN}"}
    for attempt in range(3):
        try:
            r = httpx.post(api.rstrip("/") + "/internal/events", json=body, headers=headers, timeout=10)
            if r.status_code < 300:
                return
            print(f"events: POST {r.status_code} {r.text[:200]}", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"events: POST failed ({attempt + 1}/3): {e}", file=sys.stderr, flush=True)
        time.sleep(0.5 * (attempt + 1))
    print(f"events: dropped {len(events)} events", file=sys.stderr, flush=True)


def _drain() -> None:
    while True:
        with _lock:
            batch = _buf[:BATCH]
            del _buf[:BATCH]
        if not batch:
            return
        _post(batch)


def _loop() -> None:
    while not _stop.is_set():
        _wake.wait(INTERVAL)
        _wake.clear()
        _drain()
    _drain()


def _ensure_thread() -> None:
    global _thread
    if _thread is None:
        _thread = threading.Thread(target=_loop, name="events", daemon=True)
        _thread.start()


def flush() -> None:
    """Send everything buffered now, from the calling thread's point of view."""
    _wake.set()
    deadline = time.time() + 30
    while time.time() < deadline:
        with _lock:
            if not _buf:
                break
        time.sleep(0.05)


def close() -> None:
    _stop.set()
    _wake.set()
    if _thread is not None:
        _thread.join(timeout=45)
    else:
        _drain()
