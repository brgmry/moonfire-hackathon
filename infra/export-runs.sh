#!/usr/bin/env bash
# Copy finished runs from the bucket into frontend/public/runs, so the public site can show them with no backend.
# Read-only on Google Cloud. Usage: infra/export-runs.sh r_a650c3 r_7465c6 r_bd84c4
set -euo pipefail
source "$(dirname "$0")/env.sh"
OUT="$(dirname "$0")/../frontend/public/runs"
mkdir -p "$OUT"
for id in "$@"; do
  [[ "$id" =~ ^r_[a-z0-9]+$ ]] || { echo "bad run id: $id" >&2; exit 1; }
  # Viewer names and actions are not part of the result: drop them, and blank who started the run.
  gcloud storage cat "gs://$GCS_BUCKET/runs/$id.jsonl" | python3 -c '
import json, sys
for line in sys.stdin:
    if not line.strip(): continue
    e = json.loads(line)
    if e.get("type") in ("presence.join", "presence.leave", "action"): continue
    if "by" in e: e["by"] = ""
    # Third-party email addresses from git blame stay off the public site.
    e.get("finding", {}).pop("authorEmail", None)
    for a in (e.get("contributors") or e).get("authors") or []: a.pop("email", None)
    print(json.dumps(e, separators=(",", ":")))
' > "$OUT/$id.jsonl"
  echo "$id: $(wc -l < "$OUT/$id.jsonl") events"
done
# The index lists every finished run in the folder, newest first.
python3 - "$OUT" <<'PY'
import json, os, sys
out = sys.argv[1]; runs = []
for f in os.listdir(out):
    if not f.endswith(".jsonl"): continue
    ev = [json.loads(l) for l in open(os.path.join(out, f)) if l.strip()]
    created = next((e for e in ev if e["type"] == "run.created"), None)
    if created and any(e["type"] == "run.finished" for e in ev):
        runs.append({"id": f[:-6], "repoUrl": created["repoUrl"], "ts": created["ts"]})
runs.sort(key=lambda r: r["ts"], reverse=True)
json.dump([{"id": r["id"], "repoUrl": r["repoUrl"]} for r in runs], open(os.path.join(out, "index.json"), "w"), indent=1)
print(f"index.json: {len(runs)} runs")
PY
