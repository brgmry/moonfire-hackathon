#!/usr/bin/env bash
# K4: deploy the backend service, then point the job at it. Usage: infra/deploy.sh [vercel-origin]
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/env.sh
CORS=${1:-${CORS_ORIGIN:-*}}
gcloud run deploy api --source ./backend --region "$REGION" --min-instances 1 --max-instances 1 \
  --no-cpu-throttling --timeout 3600 --allow-unauthenticated --port 8080 \
  --set-secrets "$SECRETS" \
  --set-env-vars "^@^GCS_BUCKET=$GCS_BUCKET@RUNNER=cloudrun@GCP_PROJECT=$PROJECT_ID@GCP_REGION=$REGION@JOB_NAME=$JOB_NAME@CORS_ORIGIN=$CORS@PUBLIC_API_URL=https://api-$PROJECT_NUMBER.$REGION.run.app@ANTHROPIC_KEY_BUDGETS=$KEY_BUDGETS"
URL=$(gcloud run services describe api --region "$REGION" --format='value(status.url)')
gcloud run jobs update "$JOB_NAME" --region "$REGION" --update-env-vars "API_URL=$URL"
echo "API_URL=$URL"
curl -s "$URL/runs" | head -c 200; echo   # /healthz is reserved by Cloud Run's front end, use /runs
