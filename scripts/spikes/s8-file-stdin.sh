#!/usr/bin/env bash
# S8: File access outside --workspace and large stdin (v2).
# Re-runnable. Requires BOB_API_KEY in environment.
# Usage: BOB_API_KEY=<key> bash s8-file-stdin.sh

set -euo pipefail

: "${BOB_API_KEY:?BOB_API_KEY must be set}"

SCRATCH=$(mktemp -d)
OUTSIDE=$(mktemp -d)
trap 'rm -rf "$SCRATCH" "$OUTSIDE"' EXIT

echo "=== S8: File references outside --workspace and large stdin (v2) ==="
echo "Bob version: $(bob --version)"
echo ""

echo "OUTSIDE-MARKER-DATA" > "$OUTSIDE/outside.txt"

echo "--- S8a: Read a file outside --workspace (denied at tool level) ---"
env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$SCRATCH" \
  "Read the file $OUTSIDE/outside.txt and tell me its content." \
  -f json 2>&1
echo "Exit code: $?"
echo "(expected: exit 0, tool error, model reports file is outside workspace)"
echo ""

echo "--- S8b: stdin piping (content prepended to prompt) ---"
echo "The secret word is BANANA42" | \
  env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$SCRATCH" \
  "What is the secret word in the text I sent you?" \
  -f json 2>&1
echo "Exit code: $?"
echo "(expected: BANANA42 in last_message)"
echo ""

echo "--- S8c: Large stdin (~200KB) ---"
BIG=$(python3 -c "print('A' * 200000)")
echo "stdin size: $(echo "$BIG" | wc -c) bytes"
echo "$BIG" | \
  env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$SCRATCH" \
  "How many A characters approximately? Just give the number." \
  -f json 2>&1
echo "Exit code: $?"
echo "(expected: approximate count, session_costs ~0.18 USD)"
echo ""

echo "=== S8 complete ==="
