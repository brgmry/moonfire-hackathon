#!/usr/bin/env bash
# Stores the site's API token (SITE_TOKEN, the same value Vercel has) as secret site-token.
# Reads infra/site-token.local (gitignored, one line SITE_TOKEN=...) and deletes it after upload;
# the value goes straight into Secret Manager, never the repo, a log or a chat.
# Then run infra/deploy.sh: env.sh adds SITE_TOKEN=site-token:latest once the secret exists.
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/env.sh

FILE=infra/site-token.local
[ -f "$FILE" ] || { echo "missing $FILE"; exit 1; }
t=$(grep -E "^SITE_TOKEN=" "$FILE" | head -1 | cut -d= -f2- | tr -d "\r\n \"'" || true)
[ -n "$t" ] || { echo "no SITE_TOKEN= value in $FILE"; exit 1; }

gcloud secrets describe site-token --project "$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud secrets create site-token --project "$PROJECT_ID" --replication-policy automatic
printf '%s' "$t" | gcloud secrets versions add site-token --project "$PROJECT_ID" --data-file=-
gcloud secrets add-iam-policy-binding site-token --project "$PROJECT_ID" \
  --member "serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role roles/secretmanager.secretAccessor >/dev/null
echo "stored site-token (${#t} chars)"
rm -f "$FILE"; echo "deleted $FILE"
