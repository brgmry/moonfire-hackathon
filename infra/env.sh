# Source me: `source infra/env.sh`. No secrets here; INTERNAL_TOKEN and the Anthropic key live in Secret Manager.
export PROJECT_ID=moonfire26lon-423
export PROJECT_NUMBER=1047822996598
export REGION=europe-west2
export GCS_BUCKET=moonfire26lon-423-crew
export AR_REPO=europe-west2-docker.pkg.dev/moonfire26lon-423/crew
export IMAGE=$AR_REPO/tester:latest
export JOB_NAME=tester
# Windows laptops: gcloud from the winget install
if [ -d "$HOME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin" ]; then
  export PATH="$HOME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"
fi
SECRETS="ANTHROPIC_API_KEY=anthropic-key:latest,INTERNAL_TOKEN=internal-token:latest"
# The pooled team keys from infra/add-keys.sh, once they exist; the single key stays as the fallback.
if gcloud secrets describe anthropic-keys --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRETS="$SECRETS,ANTHROPIC_API_KEYS=anthropic-keys:latest"
fi
export SECRETS
# USD each key may spend; the pool splits calls by each key's share of what is left.
export KEY_BUDGETS="akshay:70,allen:70,bergen:70,default:70"
