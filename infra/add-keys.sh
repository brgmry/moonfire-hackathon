#!/usr/bin/env bash
# Pools the team's Anthropic keys into one secret (anthropic-keys) that the backend and the job share.
# Keys come from infra/keys.local (gitignored, name=key per line, deleted after upload) or a hidden
# prompt, and are piped straight into Secret Manager: never the repo, a log or a chat.
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/env.sh

FILE=infra/keys.local
pairs=""
for name in akshay allen bergen; do
  if [ -f "$FILE" ]; then
    k=$(grep -E "^$name=" "$FILE" | head -1 | cut -d= -f2- || true)
  else
    hint="Enter to skip"
    [ "$name" = akshay ] && hint="Enter to reuse the current key"
    read -rsp "$name's Anthropic key ($hint): " k; echo
  fi
  k=$(printf '%s' "$k" | tr -d "\r\n \"'")
  if [ -z "$k" ] && [ "$name" = akshay ]; then
    k=$(gcloud secrets versions access latest --secret anthropic-key --project "$PROJECT_ID" | tr -d '\r\n ')
  fi
  [ -n "$k" ] && pairs="${pairs:+$pairs,}$name:$k"
done
[ -n "$pairs" ] || { echo "no keys entered"; exit 1; }

gcloud secrets describe anthropic-keys --project "$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud secrets create anthropic-keys --project "$PROJECT_ID" --replication-policy automatic
printf '%s' "$pairs" | gcloud secrets versions add anthropic-keys --project "$PROJECT_ID" --data-file=-
gcloud secrets add-iam-policy-binding anthropic-keys --project "$PROJECT_ID" \
  --member "serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role roles/secretmanager.secretAccessor >/dev/null
echo "stored: $(printf '%s' "$pairs" | tr ',' '\n' | cut -d: -f1 | paste -sd' ')"
if [ -f "$FILE" ]; then rm -f "$FILE"; echo "deleted $FILE"; fi

# New revision / job config picks the pool up; the single key stays as the fallback.
gcloud run services update api --region "$REGION" --project "$PROJECT_ID" \
  --update-secrets ANTHROPIC_API_KEYS=anthropic-keys:latest --update-env-vars "^@^ANTHROPIC_KEY_BUDGETS=$KEY_BUDGETS"
gcloud run jobs update "$JOB_NAME" --region "$REGION" --project "$PROJECT_ID" \
  --update-secrets ANTHROPIC_API_KEYS=anthropic-keys:latest
curl -s "https://api-$PROJECT_NUMBER.$REGION.run.app/keys"; echo
