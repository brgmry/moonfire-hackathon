# Source me: `source infra/env.sh`. No secrets here; INTERNAL_TOKEN and the Anthropic key live in Secret Manager.
export PROJECT_ID=moonfire26lon-423
export PROJECT_NUMBER=1047822996598
export REGION=europe-west2
export GCS_BUCKET=moonfire26lon-423-crew
export AR_REPO=europe-west2-docker.pkg.dev/moonfire26lon-423/crew
export IMAGE=$AR_REPO/tester:latest
export JOB_NAME=tester
# Windows laptops: gcloud from the winget install
[ -d "$HOME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin" ] && export PATH="$HOME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"
