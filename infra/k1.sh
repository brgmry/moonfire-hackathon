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
# Lab account cannot edit project IAM. The default compute SA already has roles/editor (run jobs, storage, actAs),
# so it only needs per-secret access, which secretmanager.admin can grant.
SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
gcloud secrets describe anthropic-key >/dev/null 2>&1 || printf 'placeholder' | gcloud secrets create anthropic-key --data-file=-
for s in anthropic-key internal-token; do
  gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --condition=None -q >/dev/null && echo "granted $s"
done
