#!/usr/bin/env bash
# Create everything Phase 4 Part B needs in the sandbox repo; the matching teardown is
# scripts/dev/teardown-sandbox.sh. Steps: environment bob-review limited to the default branch, the two
# repo variables (kill switch OFF), the BOB_API_KEY environment secret, then the reviewer install.
# Usage: scripts/dev/setup-sandbox.sh <owner>/<repo> [key-file]
#   key-file: JSON file with an "apikey" field (default: pr-review-agent.json in the repo root, which is
#   git-ignored). The key is read by node and piped to `gh secret set` on stdin: it is never printed, never
#   placed on a command line and never written anywhere else.
# Does not enable the kill switch. Enable it deliberately with:
#   gh variable set BOB_REVIEW_ENABLED -R <owner>/<repo> --body true
set -euo pipefail

target="${1:?usage: setup-sandbox.sh <owner>/<repo> [key-file]}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
keyfile="${2:-$root/pr-review-agent.json}"

gh auth status >/dev/null
[ -f "$keyfile" ] || { echo "key file not found: $keyfile" >&2; exit 1; }

echo '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' \
  | gh api -X PUT "repos/$target/environments/bob-review" --input - --jq '"environment " + .name' 
echo '{"name":"main","type":"branch"}' \
  | gh api -X POST "repos/$target/environments/bob-review/deployment-branch-policies" --input - --jq '"branch policy " + .name' 

gh variable set BOB_REVIEW_ENABLED -R "$target" --body false
gh variable set BOB_REVIEW_REQUIRED_WORKFLOWS -R "$target" --body "CI,Lint"
echo "variables set (kill switch is false)"

# The label that re-requests a review or opts in an outside contributor (ADR 0015).
gh label create ai-review -R "$target" --color 0e8a16 --description "Maintainer: run the AI Assisted review" --force >/dev/null
echo "label ai-review"

# The value travels node -> pipe -> gh stdin only. A missing or empty field fails before gh runs.
node -e '
const fs = require("fs");
const key = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).apikey;
if (typeof key !== "string" || key.length === 0) { console.error("no apikey field in key file"); process.exit(1); }
process.stdout.write(key);
' "$keyfile" | gh secret set BOB_API_KEY --env bob-review -R "$target"

"$root/scripts/dev/install-sandbox-reviewer.sh" "$target"

echo "--- created (names only)"
echo "environments:"; gh api "repos/$target/environments" --jq '.environments[]?.name'
echo "environment secrets:"; gh secret list --env bob-review -R "$target"
echo "repo variables:"; gh variable list -R "$target"
echo "labels:"; gh label list -R "$target" --json name --jq '.[].name'
echo "workflows:"; gh workflow list -R "$target"
