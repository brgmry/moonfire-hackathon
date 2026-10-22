"""K2 stub: proves egress, secrets, timing and the event path without any agents.

Clones REPO_URL, lists it, and posts repo.profile, agent.spawned, agent.done to API_URL.
Run it on the job with: gcloud run jobs execute tester --args /app/sandbox/stub.py ...
"""
import json
import os
import subprocess
import time
import urllib.request

T0 = time.time()
RUN_ID = os.environ.get("RUN_ID", "stub")
REPO_URL = os.environ.get("REPO_URL", "https://github.com/octocat/Hello-World")
API_URL = os.environ.get("API_URL", "http://localhost:8080").rstrip("/")
TOKEN = os.environ.get("INTERNAL_TOKEN", "dev")
WORK = "/work/repo" if os.path.isdir("/work") else os.path.abspath("stub-repo")


def log(msg):
    print(f"[stub +{time.time() - T0:.1f}s] {msg}", flush=True)


def post(events):
    body = json.dumps({"runId": RUN_ID, "events": events}).encode()
    req = urllib.request.Request(
        f"{API_URL}/internal/events", data=body, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req, timeout=15) as r:
        log(f"POST {len(events)} events -> {r.status} {r.read()[:200]!r}")


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())


def main():
    log(f"start run={RUN_ID} repo={REPO_URL} api={API_URL} key={'set' if os.environ.get('ANTHROPIC_API_KEY') else 'MISSING'}")
    subprocess.run(["git", "clone", "--depth", "50", REPO_URL, WORK], check=True)
    files = subprocess.run(["git", "ls-files"], cwd=WORK, capture_output=True, text=True).stdout.split()
    log(f"cloned, {len(files)} files: {files[:10]}")
    commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=WORK, capture_output=True, text=True).stdout.strip()
    name = REPO_URL.rstrip("/").removesuffix(".git").split("github.com/")[-1]
    post([
        {"ts": now(), "type": "repo.profile", "name": name, "defaultBranch": "main", "commit": commit,
         "stars": 0, "languages": {}, "packageManager": None, "framework": None, "hasTests": False,
         "hasBuild": False, "hasDockerfile": False, "fileCount": len(files), "files": files[:500]},
        {"ts": now(), "type": "agent.spawned", "agentId": "a_stub_01", "role": "orchestrator",
         "model": "claude-sonnet-5-5"},
    ])
    time.sleep(2)
    post([{"ts": now(), "type": "agent.done", "agentId": "a_stub_01",
           "tokens": {"in": 0, "out": 0, "cacheRead": 0}}])
    log("done")


if __name__ == "__main__":
    main()
