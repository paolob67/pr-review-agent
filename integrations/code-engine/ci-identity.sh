#!/usr/bin/env bash
# Create the CI submitter identity (G25, S12) and print where its API key was written.
# Usage: ci-identity.sh <role> [key-file]
#   role: the Code Engine service access role to try (default Writer). Used by the S12 experiment
#         to find the smallest role that can submit job runs.
# The API key is written to a 0600 file outside the repository (default ~/.config/bob-pr-reviewer/ci-key.json)
# and never printed. Platform role Viewer is granted on the resource group only so the CLI can
# resolve the project; the Code Engine policy is scoped to the one project instance.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=config.sh
. "$here/config.sh"
role="${1:-Writer}"
keyfile="${2:-$HOME/.config/bob-pr-reviewer/ci-key.json}"
require_login; target_group; select_project

guid="$(ibmcloud ce project get --name "$CE_PROJECT" --output json | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); console.log(d.guid ?? d.id ?? d.metadata?.uid ?? "")')"
[ -n "$guid" ] || { echo "could not read project GUID" >&2; exit 1; }

ibmcloud iam service-id "$CI_SERVICE_ID" >/dev/null 2>&1 \
  || ibmcloud iam service-id-create "$CI_SERVICE_ID" -d "Submits job runs for bob-pr-reviewer (G25)"

# Replace any earlier policies for this service ID so the experiment is repeatable.
ibmcloud iam service-policies "$CI_SERVICE_ID" --output json 2>/dev/null \
  | node -e 'for (const p of JSON.parse(require("fs").readFileSync(0,"utf8"))) console.log(p.id)' \
  | while read -r pid; do [ -n "$pid" ] && ibmcloud iam service-policy-delete "$CI_SERVICE_ID" "$pid" -f >/dev/null; done

ibmcloud iam service-policy-create "$CI_SERVICE_ID" --roles "$role" \
  --service-name codeengine --service-instance "$guid" >/dev/null
ibmcloud iam service-policy-create "$CI_SERVICE_ID" --roles Viewer \
  --resource-type resource-group --resource "$(ibmcloud resource group "$CE_RESOURCE_GROUP" --output json | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8"))[0].id)')" >/dev/null

mkdir -p "$(dirname "$keyfile")"; chmod 700 "$(dirname "$keyfile")"
ibmcloud iam service-api-key-list "$CI_SERVICE_ID" >/dev/null 2>&1 || true
ibmcloud iam service-api-key-create "${CI_SERVICE_ID}-key-$(date -u +%H%M%S)" "$CI_SERVICE_ID" --file "$keyfile" >/dev/null
chmod 600 "$keyfile"
echo "service ID $CI_SERVICE_ID has Code Engine role $role on project $CE_PROJECT ($guid)"
echo "API key file: $keyfile"
