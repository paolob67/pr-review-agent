#!/usr/bin/env bash
# Build the reviewer image with podman (default, local) or docker (CONTAINER_TOOL=docker, on the
# GitHub-hosted runner). The build context is staged in a temp directory
# holding only the Dockerfile, reviewer/ and tests/container/, so nothing else from the repository
# (key files, docs, other tests) enters the image.
# Usage: build.sh [tag]   (default tag: pr-reviewer:local). Prints the image id.
set -euo pipefail
tool="${CONTAINER_TOOL:-podman}"
case "$tool" in podman|docker) ;; *) echo "CONTAINER_TOOL must be podman or docker" >&2; exit 1 ;; esac
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
tag="${1:-pr-reviewer:local}"

stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
cp "$here/Dockerfile" "$stage/Dockerfile"
cp -R "$root/reviewer" "$stage/reviewer"
rm -rf "$stage/reviewer/node_modules"
mkdir -p "$stage/tests" && cp -R "$root/tests/container" "$stage/tests/container"
echo "staged build context:"; (cd "$stage" && find . -type f | sort | head -60)

# Build for the host architecture explicitly: the base is pinned by multi-arch index digest, and
# without --platform the VM may resolve a foreign architecture (seen 2026-10-30: exec format error).
case "$(uname -m)" in
  arm64|aarch64) platform=linux/arm64 ;;
  x86_64|amd64)  platform=linux/amd64 ;;
  *) echo "unsupported host architecture: $(uname -m)" >&2; exit 1 ;;
esac
if [ "$tool" = podman ]; then
  # --layers=false avoids a podman VM overlay storage error seen on 2026-10-30.
  podman build --platform "$platform" --pull=always --layers=false --tag "$tag" "$stage"
else
  docker build --platform "$platform" --pull --tag "$tag" "$stage"
fi
"$tool" image inspect "$tag" --format 'image id: {{.Id}}'
