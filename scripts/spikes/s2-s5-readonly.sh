#!/usr/bin/env bash
# S2, S5: Non-interactive flags (v2), read-only enforcement via --disable-tool-groups.
# Creates fresh temp dirs, runs probes, removes them.
# Re-runnable. Requires BOB_API_KEY in environment.
# Usage: BOB_API_KEY=<key> bash s2-s5-readonly.sh

set -euo pipefail

: "${BOB_API_KEY:?BOB_API_KEY must be set}"

echo "=== S2 / S5: bob run flags and read-only enforcement (v2) ==="
echo "Bob version: $(bob --version)"
echo ""

echo "--- S2a: bob run --help ---"
bob run --help 2>&1
echo ""

TMPDIR_BASE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_BASE"' EXIT

echo "--- S2b: basic run with -f json ---"
T1=$(mktemp -d -p "$TMPDIR_BASE")
env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$T1" \
  "What is 2+2? Answer with only the number." -f json 2>&1
echo ""

echo "--- S5a: write attempt WITHOUT --disable-tool-groups (writes succeed) ---"
T2=$(mktemp -d -p "$TMPDIR_BASE")
env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$T2" \
  "Create a file named s5test.txt containing WRITTEN." -f json 2>&1
echo "-- files in workspace --"
ls -la "$T2"
echo "(stats.tool_calls > 0 and file exists = write succeeded)"
echo ""

echo "--- S5b: write attempt WITH --disable-tool-groups edit,execute (blocked) ---"
T3=$(mktemp -d -p "$TMPDIR_BASE")
env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$T3" \
  --disable-tool-groups "edit,execute" \
  "Create a file named s5b.txt containing WRITTEN." -f json 2>&1
echo "-- files in workspace --"
ls -la "$T3"
echo "(stats.tool_calls == 0 and no file = write blocked)"
echo ""

echo "=== S2 / S5 complete ==="
