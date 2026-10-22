#!/usr/bin/env bash
# Start a real run on the deployed backend and follow its events. Usage: infra/run-repo.sh <repoUrl> [apiUrl]
set -euo pipefail
source "$(dirname "$0")/env.sh"
API=${2:-$(gcloud run services describe api --region "$REGION" --format='value(status.url)')}
ID=$(curl -s -X POST "$API/runs" -H 'Content-Type: application/json' \
  -d "{\"repoUrl\":\"$1\",\"by\":\"akshay\",\"fresh\":true}" | python -c 'import json,sys; print(json.load(sys.stdin)["id"])')
echo "run $ID  ->  $API/runs/$ID/events"
date +"started %T"
curl -sN "$API/runs/$ID/events?name=akshay-cli" | python -u -c '
import json, sys
for line in sys.stdin:
    if not line.startswith("data:"): continue
    e = json.loads(line[5:])
    t = e.get("type"); skip = {"seq","ts","runId","type","files"}
    print(e.get("seq"), (e.get("ts") or "")[11:19], t, json.dumps({k: v for k, v in e.items() if k not in skip})[:220], flush=True)
    if t == "run.finished": break
'
date +"finished %T"
