#!/usr/bin/env bash
# S1: Inspect the Bob Shell installer script and release information.
# Does NOT pipe to a shell; reads and summarises only.
# Re-runnable, no side effects.

set -euo pipefail

echo "=== S1: Bob Shell installer inspection ==="
echo ""

echo "--- Installed version ---"
bob --version

echo ""
echo "--- Install location (symlink chain) ---"
which bob
ls -la "$(which bob)"

echo ""
echo "--- Package name and version via package.json ---"
node -e "
  const p = require('/usr/local/lib/node_modules/bobshell/package.json');
  console.log('name:', p.name);
  console.log('version:', p.version);
" 2>/dev/null || echo "(package.json not at expected path)"

echo ""
echo "--- Installer script: key lines (version resolution, checksum, pinning) ---"
curl -fsSL https://bob.ibm.com/download/bobshell.sh 2>/dev/null \
  | grep -E "(version|LATEST|checksum|sha|hash|pin|@ibm/bob|package_spec|registry\.npmjs\.org)" \
  | head -30

echo ""
echo "--- Installer supports --version flag for pinning ---"
curl -fsSL https://bob.ibm.com/download/bobshell.sh 2>/dev/null \
  | grep -A3 "version\|-v)" \
  | head -15

echo ""
echo "=== S1 complete ==="
