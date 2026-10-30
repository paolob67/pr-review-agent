#!/usr/bin/env bash
# Publish examples/sandbox-repo as its own GitHub repository and open one PR with seeded flaws.
# Usage: scripts/dev/publish-sandbox.sh <owner>/<repo>
# Needs: gh logged in (gh auth status). Uses no other credentials. Creates a PRIVATE repo.
# The PR content is synthetic; the flaws map to STD-001, TEAM-003 and TEAM-001/STD-006 in .bob-review/.
set -euo pipefail

target="${1:?usage: publish-sandbox.sh <owner>/<repo>}"
src="$(cd "$(dirname "$0")/../../examples/sandbox-repo" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

gh auth status >/dev/null

cp -R "$src"/. "$work"/
cd "$work"
git init -q -b main
git add -A
git commit -q -m "Initial notes sandbox app"

gh repo create "$target" --private --source . --remote origin --push \
  --description "Sandbox target for the AI Assisted PR reviewer (synthetic code)"

git checkout -q -b feature/share-links
cat > src/share.js <<'EOF'
// Share links for notes.
const API_TOKEN = 'tok-demo-0000-not-a-real-token';

export function makeShareId() {
  return Math.random().toString(36).slice(2, 10);
}

export function shareUrl(noteId) {
  return `https://notes.example.test/s/${makeShareId()}?note=${noteId}&auth=${API_TOKEN}`;
}
EOF
git add -A
git commit -q -m "Add share links for notes"
git push -q -u origin feature/share-links

gh pr create --repo "$target" --base main --head feature/share-links \
  --title "Add share links for notes" \
  --body "Adds a helper that builds shareable URLs. Synthetic change with seeded flaws for reviewer testing."
