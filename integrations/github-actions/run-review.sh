#!/usr/bin/env bash
# Run the reviewer's review stage in the hardened container on the GitHub-hosted runner (ADR 0012).
# Called from the review job. BOB_API_KEY comes from the step env and is passed into the container by
# NAME (-e BOB_API_KEY), never as a value on a command line (ADR 0013). The other REVIEW_* values are
# validated by the reviewer (G24) and also passed by name.
#
# Hardening (G3, G23, G28): read-only rootfs, all capabilities dropped except the four the UID drop
# needs (CHOWN, SETUID, SETGID, DAC_OVERRIDE; see docs/results/phase-4-container.md),
# no-new-privileges, tmpfs for /tmp, the exchange directory as the only writable mount.
# Usage: run-review.sh <image-tag>
set -euo pipefail

image="${1:?usage: run-review.sh <image-tag>}"
: "${BOB_API_KEY:?BOB_API_KEY must be set by the step env}"
: "${REVIEW_EXCHANGE_DIR:?REVIEW_EXCHANGE_DIR must be set}"
for v in REVIEW_REPO REVIEW_PR_NUMBER REVIEW_HEAD_SHA; do
  : "${!v?$v must be set}"
done

# The image id is the digest recorded in the cost record (G22).
REVIEW_IMAGE_DIGEST="$(docker image inspect "$image" --format '{{.Id}}')"
export REVIEW_IMAGE_DIGEST

status=0
docker run --rm \
  --read-only \
  --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE \
  --security-opt no-new-privileges \
  --tmpfs /tmp:rw,exec,nosuid,size=256m \
  --pids-limit 512 \
  -v "$REVIEW_EXCHANGE_DIR:/exchange" \
  -e REVIEW_EXCHANGE_DIR=/exchange \
  -e BOB_API_KEY \
  -e REVIEW_REPO -e REVIEW_PR_NUMBER -e REVIEW_HEAD_SHA -e REVIEW_ENABLED \
  -e REVIEW_IMAGE_DIGEST \
  "$image" review || status=$?

# The container wrote result.json as root; give it back to the runner user so it can be uploaded.
# (Passwordless sudo on GitHub-hosted Linux runners: docs/results/runner-facts.md.)
sudo chown -R "$(id -u):$(id -g)" "$REVIEW_EXCHANGE_DIR"
exit "$status"
