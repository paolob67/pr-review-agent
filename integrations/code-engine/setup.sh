#!/usr/bin/env bash
# Create the Code Engine foundation in eu-de. Idempotent: existing resources are reused.
# Secrets come from the environment only (never from files or arguments):
#   BOB_API_KEY, SCM_READ_TOKEN, SCM_COMMENT_TOKEN
# Optional: SKIP_SECRETS=1 creates everything except the two secrets (no credentials needed).
# Requires: ibmcloud logged in with rights to create a project, registry namespace, service IDs and
# policies inside the existing resource group CE_RESOURCE_GROUP. The job is created once an image
# exists (run build.sh, then run setup.sh again).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=config.sh
. "$here/config.sh"
require_login

echo "== resource group $CE_RESOURCE_GROUP (must already exist; never created here)"
ibmcloud resource group "$CE_RESOURCE_GROUP" >/dev/null 2>&1 || { echo "resource group $CE_RESOURCE_GROUP not found" >&2; exit 1; }
target_group

echo "== container registry namespace $CR_NAMESPACE ($CR_DOMAIN)"
if ibmcloud cr namespace-list 2>/dev/null | awk '{print $1}' | grep -qx "$CR_NAMESPACE"; then
  echo "exists"
else
  ibmcloud cr namespace-add "$CR_NAMESPACE" -g "$CE_RESOURCE_GROUP"
fi

echo "== code engine project $CE_PROJECT"
if ibmcloud ce project get --name "$CE_PROJECT" >/dev/null 2>&1; then
  echo "exists"
else
  ibmcloud ce project create --name "$CE_PROJECT" --wait
fi
select_project

echo "== registry access (service ID $REGISTRY_SERVICE_ID, Reader+Writer on namespace)"
if ! ibmcloud iam service-id "$REGISTRY_SERVICE_ID" >/dev/null 2>&1; then
  ibmcloud iam service-id-create "$REGISTRY_SERVICE_ID" -d "Registry push/pull for bob-pr-reviewer builds and job pulls"
  ibmcloud iam service-policy-create "$REGISTRY_SERVICE_ID" --roles Reader,Writer \
    --service-name container-registry --resource-type namespace --resource "$CR_NAMESPACE" >/dev/null
fi
if ! ibmcloud ce secret get --name "$REGISTRY_SECRET" >/dev/null 2>&1; then
  keyfile="$(mktemp)"; trap 'rm -f "$keyfile"' EXIT; chmod 600 "$keyfile"
  ibmcloud iam service-api-key-create "${REGISTRY_SERVICE_ID}-key" "$REGISTRY_SERVICE_ID" --file "$keyfile" >/dev/null
  ibmcloud ce secret create --name "$REGISTRY_SECRET" --format registry --server "$CR_DOMAIN" \
    --username iamapikey --password-from-json-file "$keyfile" >/dev/null
  rm -f "$keyfile"
fi

if [ "${SKIP_SECRETS:-0}" != "1" ]; then
  : "${BOB_API_KEY:?set BOB_API_KEY in the environment}"
  : "${SCM_READ_TOKEN:?set SCM_READ_TOKEN in the environment}"
  : "${SCM_COMMENT_TOKEN:?set SCM_COMMENT_TOKEN in the environment}"
  # --from-literal puts the value on this process command line for a moment; the values are passed
  # through a private env file instead so they never appear in the process list.
  envfile="$(mktemp)"; chmod 600 "$envfile"; trap 'rm -f "$envfile"' EXIT
  printf 'BOB_API_KEY=%s\n' "$BOB_API_KEY" > "$envfile"
  if ibmcloud ce secret get --name "$BOB_SECRET" >/dev/null 2>&1; then
    ibmcloud ce secret update --name "$BOB_SECRET" --from-env-file "$envfile" >/dev/null
  else
    ibmcloud ce secret create --name "$BOB_SECRET" --format generic --from-env-file "$envfile" >/dev/null
  fi
  printf 'SCM_READ_TOKEN=%s\nSCM_COMMENT_TOKEN=%s\n' "$SCM_READ_TOKEN" "$SCM_COMMENT_TOKEN" > "$envfile"
  if ibmcloud ce secret get --name "$SCM_SECRET" >/dev/null 2>&1; then
    ibmcloud ce secret update --name "$SCM_SECRET" --from-env-file "$envfile" >/dev/null
  else
    ibmcloud ce secret create --name "$SCM_SECRET" --format generic --from-env-file "$envfile" >/dev/null
  fi
  rm -f "$envfile"
  echo "secrets $BOB_SECRET and $SCM_SECRET set"
else
  echo "SKIP_SECRETS=1: secrets not created"
fi

echo "== job $CE_JOB"
image="$CR_DOMAIN/$CR_NAMESPACE/$IMAGE_NAME:latest"
if ibmcloud cr image-list --restrict "$CR_NAMESPACE/$IMAGE_NAME" 2>/dev/null | grep -q "$IMAGE_NAME"; then
  secrets=()
  for s in "$BOB_SECRET" "$SCM_SECRET"; do
    ibmcloud ce secret get --name "$s" >/dev/null 2>&1 && secrets+=(--env-from-secret "$s")
  done
  digest="$(ibmcloud cr image-digests --restrict "$CR_NAMESPACE/$IMAGE_NAME" --format '{{ .Digest }}' 2>/dev/null | head -1)"
  if ibmcloud ce job get --name "$CE_JOB" >/dev/null 2>&1; then verb=update; else verb=create; fi
  ibmcloud ce job "$verb" --name "$CE_JOB" --image "$image" --registry-secret "$REGISTRY_SECRET" \
    --cpu "$JOB_CPU" --memory "$JOB_MEMORY" --retrylimit "$JOB_RETRY_LIMIT" \
    --maxexecutiontime "$JOB_MAX_EXECUTION_SECONDS" "${secrets[@]}" \
    ${digest:+--env "REVIEW_IMAGE_DIGEST=$digest"} >/dev/null
  echo "job $CE_JOB ready (image digest: ${digest:-unknown})"
else
  echo "no image yet in $CR_NAMESPACE/$IMAGE_NAME; run build.sh, then run setup.sh again to create the job"
fi
echo "done"
