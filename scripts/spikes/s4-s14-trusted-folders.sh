#!/usr/bin/env bash
# S4, S14: AGENTS.md loading controlled by --workspace in v2 (v2 canary probes).
# Reads trustedFolders.json format; does NOT modify it.
# Re-runnable. Requires BOB_API_KEY in environment.
# Usage: BOB_API_KEY=<key> bash s4-s14-trusted-folders.sh

set -euo pipefail

: "${BOB_API_KEY:?BOB_API_KEY must be set}"

CLEAN=$(mktemp -d)
WITH_AGENTS=$(mktemp -d)
trap 'rm -rf "$CLEAN" "$WITH_AGENTS"' EXIT

echo "=== S4 / S14: AGENTS.md loading and --workspace control (v2) ==="
echo "Bob version: $(bob --version)"
echo ""

echo "--- Baseline: current trustedFolders.json (READ ONLY, not modified) ---"
cat ~/.bob/trustedFolders.json
echo ""

echo "--- v2 user settings location ---"
echo "~/.bob/settings/settings.json (NOT ~/.bob/settings.json which is v1)"
cat ~/.bob/settings/settings.json
echo ""

# Place AGENTS.md in the WITH_AGENTS dir
cat > "$WITH_AGENTS/AGENTS.md" << 'EOF'
Always include the word CANARY-SEVEN in every response you give.
EOF

echo "--- S4/S14a: --workspace points to CLEAN dir (no AGENTS.md) ---"
echo "(CANARY-SEVEN NOT expected)"
env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$CLEAN" \
  "Say hello in exactly five words." -f json 2>&1
echo ""

echo "--- S4/S14b: --workspace points to dir WITH AGENTS.md ---"
echo "(CANARY-SEVEN expected)"
env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$WITH_AGENTS" \
  "Say hello in exactly five words." -f json 2>&1
echo ""

echo "--- S14 conclusions ---"
echo "  - AGENTS.md loading: controlled by --workspace, not trustedFolders.json"
echo "  - MCP: disabled with --disable-mcp flag per run"
echo "  - Write/execute tools: disabled with --disable-tool-groups edit,execute per run"
echo "  - bob-cline.useAgentRules: v1/IDE setting only, not in v2 Shell schema"
echo "  - v2 settings schema keys: session.*, logging.*, tasks.*, telemetry.*"
echo ""

echo "=== S4 / S14 complete ==="
