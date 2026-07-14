#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-easy-way-consultoria-aduaneira}"
ACCOUNT="easyway-app"

if [[ "${1:-}" != "--apply" ]]; then
  echo "Dry run only. No remote resources were changed."
  echo "Target project: ${PROJECT_ID}"
  echo "Planned APIs: Secret Manager, IAM Credentials, Logging, Storage, Document AI"
  echo "Planned service account: ${ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"
  echo "Review the project and run: $0 --apply"
  exit 0
fi

ACTIVE_PROJECT="$(gcloud config get-value project 2>/dev/null)"
if [[ "${ACTIVE_PROJECT}" != "${PROJECT_ID}" ]]; then
  echo "Refusing to apply: active gcloud project is '${ACTIVE_PROJECT}', expected '${PROJECT_ID}'." >&2
  exit 1
fi

gcloud services enable \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  logging.googleapis.com \
  storage.googleapis.com \
  documentai.googleapis.com \
  --project="${PROJECT_ID}"

if ! gcloud iam service-accounts describe "${ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${ACCOUNT}" --display-name="EasyWay application integrations" --project="${PROJECT_ID}"
fi

echo "Service account ready: ${ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"
echo "No IAM roles were granted. Add only resource-scoped roles after review."
