#!/usr/bin/env bash
# S3: Custom mode via --mode flag with .bob/custom_modes.yaml in --workspace directory (v2).
# Re-runnable. Requires BOB_API_KEY in environment.
# Usage: BOB_API_KEY=<key> bash s3-custom-mode.sh

set -euo pipefail

: "${BOB_API_KEY:?BOB_API_KEY must be set}"

SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

echo "=== S3: Custom mode YAML and --mode flag (v2) ==="
echo "Bob version: $(bob --version)"
echo ""

MODE_YAML='customModes:
  - slug: spike-reviewer
    name: Spike Reviewer
    roleDefinition: >-
      You are a code reviewer. Always begin every single response with the
      exact string SPIKE-MODE-ACTIVE before anything else.
    whenToUse: Use for PR review spikes.
    groups:
      - read'

mkdir -p "$SCRATCH/.bob"
echo "$MODE_YAML" > "$SCRATCH/.bob/custom_modes.yaml"

echo "--- S3a: --mode spike-reviewer with .bob/custom_modes.yaml in --workspace ---"
echo "(SPIKE-MODE-ACTIVE expected at start of response)"
env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$SCRATCH" --mode spike-reviewer \
  "What is 2+2?" -f json 2>&1
echo ""

echo "--- S3b: run WITHOUT --mode (default agent mode, no canary expected) ---"
env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$SCRATCH" \
  "What is 2+2?" -f json 2>&1
echo ""

echo "--- Mode precedence (v2) ---"
echo "  1. --mode flag selects the slug"
echo "  2. <workspace>/.bob/custom_modes.yaml"
echo "  3. ~/.bob/settings/custom_modes.yaml"
echo "  4. Default modes (agent, plan, ask, ...)"
echo ""

echo "=== S3 complete ==="
