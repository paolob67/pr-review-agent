#!/usr/bin/env bash
# S6: Exit codes for auth failure, empty prompt, budget exceeded (v2).
# S7: Usage / cost information in -f json output (v2).
# Re-runnable. Requires BOB_API_KEY in environment.
# Usage: BOB_API_KEY=<key> bash s6-s7-errors-usage.sh

set -euo pipefail

: "${BOB_API_KEY:?BOB_API_KEY must be set}"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "=== S6: Error exit codes (v2) ==="
echo "Bob version: $(bob --version)"
echo ""

echo "--- S6a: Invalid API key (exit 1, error to stderr) ---"
env -u BOBSHELL_API_KEY BOB_API_KEY="invalid-key-12345" \
  bob run --accept-license --workspace "$TMPDIR" \
  "Say hello." -f json 2>&1 || true
echo "Exit code: $?"
echo ""

echo "--- S6b: Empty / no prompt (exit 1) ---"
env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$TMPDIR" -f json 2>&1 || true
echo "Exit code: $?"
echo ""

echo "--- S6c: --max-cost exceeded (exit 0, status still success) ---"
env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$TMPDIR" --max-cost 0.00001 \
  "What is 2+2?" -f json 2>&1
echo "Exit code: $?"
echo "(note: exit 0 even when max_cost < session_costs)"
echo ""

echo "=== S7: Cost reporting in -f json output (v2) ==="
echo ""

echo "--- S7a: Minimal run, inspect stats object ---"
result=$(env -u BOBSHELL_API_KEY BOB_API_KEY="$BOB_API_KEY" \
  bob run --accept-license --workspace "$TMPDIR" \
  "What is 1+1? Answer with only the number." -f json 2>&1)
echo "$result"
echo ""
echo "--- S7b: Key fields ---"
echo "$result" | node -e "
  let s=''; process.stdin.on('data',c=>s+=c).on('end',()=>{
    try {
      const j=JSON.parse(s.trim());
      console.log('status:', j.status);
      console.log('session_costs (USD):', j.stats?.session_costs);
      console.log('max_cost:', j.stats?.max_cost);
      console.log('tool_calls:', j.stats?.tool_calls);
      console.log('duration_ms:', j.stats?.duration_ms);
      console.log('task_id:', j.stats?.task_id);
    } catch(e) { console.log('parse error:', e.message); }
  });
" 2>/dev/null || echo "(node extraction failed - inspect raw output above)"
echo ""

echo "CONCLUSIONS:"
echo "  - exit 1: auth failure, config error, empty prompt (error to stderr, not stdout)"
echo "  - exit 0: success OR budget overrun (check status field)"
echo "  - stats.session_costs: per-run USD cost (use for per-PR cost record)"
echo "  - BOB_API_KEY: canonical v2 env var (BOBSHELL_API_KEY works but deprecated)"
echo ""

echo "=== S6 / S7 complete ==="
