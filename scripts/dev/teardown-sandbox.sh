#!/usr/bin/env bash
# Remove everything Phase 4 Part B created in the sandbox repo, then list what remains.
# Usage: scripts/dev/teardown-sandbox.sh <owner>/<repo>
# Removes: environment bob-review (and with it the BOB_API_KEY environment secret), the repo
# variables BOB_REVIEW_ENABLED and BOB_REVIEW_REQUIRED_WORKFLOWS, and the installed reviewer files
# (workflow, reviewer/, integrations/, tests/container/) from main. Does not delete the repo, the
# PR or the sandbox app. Bot comments stay on the PR unless removed with the printed command.
set -euo pipefail

target="${1:?usage: teardown-sandbox.sh <owner>/<repo>}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

gh auth status >/dev/null

gh api -X DELETE "repos/$target/environments/bob-review" 2>/dev/null && echo "deleted environment bob-review" || echo "environment bob-review already absent"
for v in BOB_REVIEW_ENABLED BOB_REVIEW_REQUIRED_WORKFLOWS BOB_REVIEW_BOB_TIMEOUT_SECONDS; do
  gh variable delete "$v" -R "$target" 2>/dev/null && echo "deleted variable $v" || echo "variable $v already absent"
done

gh label delete ai-review -R "$target" --yes 2>/dev/null && echo "deleted label ai-review" || echo "label ai-review already absent"

gh repo clone "$target" "$work/repo" -- --quiet
cd "$work/repo"
git rm -rq --ignore-unmatch .github/workflows/bob-review.yml .github/workflows/lint.yml reviewer integrations tests/container
if git diff --cached --quiet; then
  echo "no reviewer files on main"
else
  git commit -q -m "Remove the AI Assisted PR reviewer (sandbox teardown)"
  git push -q origin HEAD:main
  echo "removed reviewer files from main"
fi

echo "--- remaining (expect no environments, secrets or variables; only the CI workflow)"
echo "environments:"; gh api "repos/$target/environments" --jq '.environments[]?.name'
echo "repo secrets:"; gh secret list -R "$target"
echo "repo variables:"; gh variable list -R "$target"
echo "workflows:"; gh workflow list -R "$target"
echo "To remove bot comments from PR <n>: gh api repos/$target/issues/<n>/comments --jq '.[]|select(.user.login==\"github-actions[bot]\")|.id' | xargs -I{} gh api -X DELETE repos/$target/issues/comments/{}"
