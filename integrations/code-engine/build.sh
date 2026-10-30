#!/usr/bin/env bash
# Build the reviewer image remotely on Code Engine and push it to Container Registry.
# The build context is staged in a temp directory holding only the Dockerfile and reviewer/, so
# nothing else from the repository (key files, docs, tests) is uploaded.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
# shellcheck source=config.sh
. "$here/config.sh"
require_login; target_group; select_project

stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
cp "$here/Dockerfile" "$stage/Dockerfile"
cp -R "$root/reviewer" "$stage/reviewer"
rm -rf "$stage/reviewer/node_modules"
mkdir -p "$stage/tests" && cp -R "$root/tests/container" "$stage/tests/container"
echo "staged build context:"; (cd "$stage" && find . -type f | sort | head -60)

name="build-$(date -u +%Y%m%d-%H%M%S)"
ibmcloud ce buildrun submit --name "$name" --source "$stage" --strategy dockerfile --size medium \
  --image "$CR_DOMAIN/$CR_NAMESPACE/$IMAGE_NAME:latest" --registry-secret "$REGISTRY_SECRET" \
  --timeout 900 --wait --wait-timeout 900
ibmcloud ce buildrun get --name "$name" --output jsonpath='{.status.outputDigest}' || true
echo
echo "build run: $name"
