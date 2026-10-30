#!/usr/bin/env bash
# Delete everything setup.sh and the other scripts created, then list to prove it is gone.
# Usage: teardown.sh [--yes]   (without --yes it asks once)
# Deletes only the named resources in config.sh. The resource group is shared and is never deleted.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=config.sh
. "$here/config.sh"
require_login

if [ "${1:-}" != "--yes" ]; then
  echo "This deletes project $CE_PROJECT, registry namespace $CR_NAMESPACE, service IDs $CI_SERVICE_ID and"
  echo "$REGISTRY_SERVICE_ID (in $CE_REGION). Resource group $CE_RESOURCE_GROUP is left alone."
  read -r -p "Type 'delete' to continue: " a
  [ "$a" = "delete" ] || { echo "aborted"; exit 1; }
fi

ibmcloud target -r "$CE_REGION" -g "$CE_RESOURCE_GROUP" >/dev/null
ibmcloud cr region-set "$CR_REGION" >/dev/null

echo "== code engine project (hard delete, removes jobs, job runs, builds, secrets)"
if ibmcloud ce project get --name "$CE_PROJECT" >/dev/null 2>&1; then
  ibmcloud ce project delete --name "$CE_PROJECT" --hard --force --wait
fi

echo "== registry namespace (removes images)"
ibmcloud cr namespace-list 2>/dev/null | awk '{print $1}' | grep -qx "$CR_NAMESPACE" \
  && ibmcloud cr namespace-rm "$CR_NAMESPACE" -f

echo "== service IDs (their API keys and policies go with them)"
for id in "$CI_SERVICE_ID" "$REGISTRY_SERVICE_ID"; do
  ibmcloud iam service-id "$id" >/dev/null 2>&1 && ibmcloud iam service-id-delete "$id" -f
done

echo "== verification listing (every line below should say none)"
left=0
ibmcloud ce project list 2>/dev/null | awk 'NR>3{print $1}' | grep -qx "$CE_PROJECT" && { echo "project: STILL PRESENT"; left=1; } || echo "project: none"
ibmcloud ce project list 2>/dev/null | grep -i "$CE_PROJECT" | grep -qi "pending_reclamation\|soft" && echo "project: soft-deleted entry may linger (hard delete requested)"
ibmcloud cr namespace-list 2>/dev/null | awk '{print $1}' | grep -qx "$CR_NAMESPACE" && { echo "namespace: STILL PRESENT"; left=1; } || echo "namespace: none"
for id in "$CI_SERVICE_ID" "$REGISTRY_SERVICE_ID"; do
  ibmcloud iam service-id "$id" >/dev/null 2>&1 && { echo "service ID $id: STILL PRESENT"; left=1; } || echo "service ID $id: none"
done
exit $left
