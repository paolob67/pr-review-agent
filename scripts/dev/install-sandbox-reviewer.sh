#!/usr/bin/env bash
# Install the reviewer into the sandbox repo's default branch (S20 default: per-run build from the
# trusted default-branch checkout, ADR 0001 and ADR 0012). Copies reviewer/, tests/container/,
# integrations/ and the workflow to .github/workflows/bob-review.yml (plus the sandbox CI and Lint workflows), commits and pushes to main.
# Usage: scripts/dev/install-sandbox-reviewer.sh <owner>/<repo>
# Needs: gh logged in with repo and workflow scopes. Uses no other credentials and touches no secret.
# Teardown: scripts/dev/teardown-sandbox.sh <owner>/<repo>
set -euo pipefail

target="${1:?usage: install-sandbox-reviewer.sh <owner>/<repo>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

gh auth status >/dev/null
gh repo clone "$target" "$work/repo" -- --quiet
cd "$work/repo"

rm -rf reviewer tests/container integrations
mkdir -p tests .github/workflows
cp -R "$root/reviewer" reviewer
rm -rf reviewer/node_modules
cp -R "$root/tests/container" tests/container
mkdir -p integrations
cp -R "$root/integrations/container" integrations/container
cp -R "$root/integrations/github-actions" integrations/github-actions
cp "$root/integrations/github-actions/bob-review.yml" .github/workflows/bob-review.yml
# The sandbox app's own CI (with the Phase 5 test hooks) and the second required workflow.
cp "$root/examples/sandbox-repo/.github/workflows/ci.yml" .github/workflows/ci.yml
cp "$root/examples/sandbox-repo/.github/workflows/lint.yml" .github/workflows/lint.yml

git add -A
if git diff --cached --quiet; then
  echo "nothing to install, sandbox is already current"
  exit 0
fi
git commit -q -m "Install the AI Assisted PR reviewer (sandbox, synthetic)"
git push -q origin HEAD:main
echo "installed on $target main: $(git rev-parse --short HEAD)"
