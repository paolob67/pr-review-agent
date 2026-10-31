#!/usr/bin/env bash
# S17 follow-up (ADR 0014): with pull-requests: write on the job token, can Actions submit an APPROVE
# or a REQUEST_CHANGES review? Sandbox only. Installs a temporary workflow, dispatches it, prints the
# status and GitHub's message for each attempt, dismisses any review that was created, removes the
# workflow. Uses only the job's built-in token; no Bob, no secret.
# Usage: scripts/spikes/s17-approve-check.sh <owner>/<repo> <pr-number>
set -euo pipefail

target="${1:?usage: s17-approve-check.sh <owner>/<repo> <pr-number>}"
pr="${2:?pr number}"
[[ "$pr" =~ ^[1-9][0-9]{0,8}$ ]] || { echo "bad PR number" >&2; exit 1; }
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

gh auth status >/dev/null
gh repo clone "$target" "$work/repo" -- --quiet
cd "$work/repo"
mkdir -p .github/workflows
wf=.github/workflows/s17-approve-check.yml
cat > "$wf" <<'EOF'
name: S17 approve check
on:
  workflow_dispatch:
    inputs:
      pr_number:
        required: true
        type: string
permissions: {}
jobs:
  attempt:
    runs-on: ubuntu-24.04
    timeout-minutes: 3
    permissions:
      pull-requests: write
    steps:
      - name: Attempt reviews
        env:
          GH_TOKEN: ${{ github.token }}
          R: ${{ github.repository }}
          PR: ${{ inputs.pr_number }}
        run: |
          for ev in APPROVE REQUEST_CHANGES; do
            printf '%s: ' "$ev"
            gh api -i -X POST "repos/$R/pulls/$PR/reviews" -f event="$ev" -f body="S17 probe (sandbox): $ev attempt" 2>&1 \
              | grep -iE '^(HTTP/|\{)' | tr '\r\n' '  '
            echo
          done
EOF
git add -A && git commit -q -m "Temporary S17 approve check (sandbox)" && git push -q origin HEAD:main
sleep 5
gh workflow run s17-approve-check.yml -R "$target" --ref main -f pr_number="$pr"
sleep 8
id="$(gh run list -R "$target" --workflow s17-approve-check.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$id" -R "$target" --exit-status >/dev/null 2>&1 || true
jid="$(gh run view "$id" -R "$target" --json jobs --jq '.jobs[0].databaseId')"
gh run view "$id" -R "$target" --log --job "$jid" 2>&1 | grep -E '^attempt.*(APPROVE|REQUEST_CHANGES):' | sed -E 's/^[^\t]*\t[^\t]*\t[^ ]* //'

echo "--- reviews now on the PR (any created by the bot are dismissed below)"
gh api "repos/$target/pulls/$pr/reviews" --jq '.[]|"\(.id) \(.user.login) \(.state)"'
for rid in $(gh api "repos/$target/pulls/$pr/reviews" --jq '.[]|select(.user.login=="github-actions[bot]" and (.state=="APPROVED" or .state=="CHANGES_REQUESTED"))|.id'); do
  gh api -X PUT "repos/$target/pulls/$pr/reviews/$rid/dismissals" -f message="S17 sandbox probe, dismissed" -f event=DISMISS --jq '"dismissed \(.id) -> \(.state)"'
done

git rm -q "$wf" && git commit -q -m "Remove the S17 approve check workflow" && git push -q origin HEAD:main
echo "probe workflow removed from main"
