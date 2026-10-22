#!/usr/bin/env bash
# K2: build the sandbox image and create/update the job. Re-run after any sandbox/ change.
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/env.sh
gcloud builds submit --region="$REGION" --config infra/sandbox/cloudbuild.yaml --substitutions _IMAGE="$IMAGE" .
API=${API_URL:-http://placeholder}
if gcloud run jobs describe "$JOB_NAME" --region "$REGION" >/dev/null 2>&1; then
  gcloud run jobs update "$JOB_NAME" --image "$IMAGE" --region "$REGION"
else
  gcloud run jobs create "$JOB_NAME" --image "$IMAGE" --region "$REGION" \
    --task-timeout 600 --cpu 2 --memory 4Gi --max-retries 0 --tasks 1 \
    --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest,INTERNAL_TOKEN=internal-token:latest \
    --set-env-vars "API_URL=$API,MAX_CHUNKS=24,MAX_PARALLEL=8,GCS_BUCKET=$GCS_BUCKET"
fi
