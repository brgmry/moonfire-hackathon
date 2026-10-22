#!/usr/bin/env bash
# K1: project plumbing. Run once after `gcloud auth login`. Idempotent enough to re-run.
set -uo pipefail
source "$(dirname "$0")/env.sh"
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com storage.googleapis.com aiplatform.googleapis.com iam.googleapis.com
gcloud artifacts repositories create crew --repository-format=docker --location="$REGION" || true
gcloud storage buckets create "gs://$GCS_BUCKET" --location="$REGION" --uniform-bucket-level-access || true
# internal-token is generated here; anthropic-key is created by hand: printf '%s' "$KEY" | gcloud secrets create anthropic-key --data-file=-
gcloud secrets describe internal-token >/dev/null 2>&1 || openssl rand -hex 24 | tr -d '\n' | gcloud secrets create internal-token --data-file=-
# Default compute SA runs both the job and the service: it needs the secrets, the bucket and to launch job executions.
PN=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA="$PN-compute@developer.gserviceaccount.com"
for role in roles/secretmanager.secretAccessor roles/run.developer roles/iam.serviceAccountUser roles/storage.objectAdmin roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$role" --condition=None -q >/dev/null && echo "granted $role"
done
# Cloud Build in new projects builds as the compute SA too.
for role in roles/artifactregistry.writer roles/storage.admin roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$role" --condition=None -q >/dev/null && echo "granted $role"
done
