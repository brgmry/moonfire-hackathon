#!/usr/bin/env bash
# K2 round-trip: run the stub script on the job against a backend URL. Usage: infra/stub-test.sh <API_URL> [runId]
set -euo pipefail
source "$(dirname "$0")/env.sh"
RID=${2:-stub$(date +%H%M%S)}
date +"execute at %T"
gcloud run jobs execute "$JOB_NAME" --region "$REGION" --args /app/sandbox/stub.py \
  --update-env-vars "RUN_ID=$RID,REPO_URL=https://github.com/octocat/Hello-World,API_URL=$1" --wait
date +"finished at %T"
