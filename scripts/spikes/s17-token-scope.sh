#!/usr/bin/env bash
# S17 probe: which GITHUB_TOKEN permission sets can list PR comments, and which are refused on the
# reviews, check-runs and statuses endpoints (G25, G34). Uses only the job's built-in token; no Bob,
# no secret, no comment is posted. The refusal checks send deliberately invalid bodies: HTTP 422 means
# "allowed but invalid", HTTP 403 means "refused", so nothing is ever created.
# Usage: scripts/spikes/s17-token-scope.sh <owner>/<repo> <pr-number>
# Installs a temporary workflow on main, dispatches it, prints the result, then removes the workflow.
set -euo pipefail

target="${1:?usage: s17-token-scope.sh <owner>/<repo> <pr-number>}"
pr="${2:?pr number}"
[[ "$pr" =~ ^[1-9][0-9]{0,8}$ ]] || { echo "bad PR number" >&2; exit 1; }
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

gh auth status >/dev/null
gh repo clone "$target" "$work/repo" -- --quiet
cd "$work/repo"
mkdir -p .github/workflows
wf=.github/workflows/s17-probe.yml

probe_steps() {
  cat <<'EOF'
    steps:
      - name: Probe
        env:
          GH_TOKEN: ${{ github.token }}
          R: ${{ github.repository }}
          PR: ${{ inputs.pr_number }}
        run: |
          show() { grep -iE '^(HTTP/|x-accepted-github-permissions)' | tr '\r\n' '  '; echo; }
          zero=0000000000000000000000000000000000000000
          printf 'LIST comments   : '; gh api -i "repos/$R/issues/$PR/comments" 2>&1 | show
          printf 'GET pull        : '; gh api -i "repos/$R/pulls/$PR" 2>&1 | show
          printf 'POST comment    : '; gh api -i -X POST "repos/$R/issues/$PR/comments" -f body= 2>&1 | show
          printf 'POST review     : '; gh api -i -X POST "repos/$R/pulls/$PR/reviews" -f event=COMMENT -f commit_id=$zero 2>&1 | show
          printf 'POST check-run  : '; gh api -i -X POST "repos/$R/check-runs" -f name=probe 2>&1 | show
          printf 'POST status     : '; gh api -i -X POST "repos/$R/statuses/$zero" -f state=bogus 2>&1 | show
EOF
}

{
  cat <<'EOF'
name: S17 probe
on:
  workflow_dispatch:
    inputs:
      pr_number:
        required: true
        type: string
permissions: {}
jobs:
EOF
  for set in "issues-write:issues: write" \
             "issues-write-pr-read:issues: write|pull-requests: read" \
             "issues-write-contents-read:issues: write|contents: read" \
             "pr-write:pull-requests: write" \
             "issues-write-pr-write:issues: write|pull-requests: write"; do
    name="${set%%:*}"; perms="${set#*:}"
    echo "  $name:"
    echo "    runs-on: ubuntu-24.04"
    echo "    timeout-minutes: 3"
    echo "    permissions:"
    IFS='|' read -ra ps <<<"$perms"
    for p in "${ps[@]}"; do echo "      $p"; done
    probe_steps
  done
} > "$wf"

git add -A && git commit -q -m "Temporary S17 token scope probe (sandbox)" && git push -q origin HEAD:main
sleep 5
gh workflow run s17-probe.yml -R "$target" --ref main -f pr_number="$pr"
sleep 8
id="$(gh run list -R "$target" --workflow s17-probe.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$id" -R "$target" --exit-status >/dev/null 2>&1 || true
for job in issues-write issues-write-pr-read issues-write-contents-read pr-write issues-write-pr-write; do
  echo "=== permissions set: $job"
  jid="$(gh run view "$id" -R "$target" --json jobs --jq ".jobs[]|select(.name==\"$job\")|.databaseId")"
  gh run view "$id" -R "$target" --log --job "$jid" 2>&1 | grep -E '^(LIST|GET|POST)|[a-z -]*: HTTP' | sed -E 's/^[^\t]*\t[^\t]*\t[^ ]* //' || true
done

git rm -q "$wf" && git commit -q -m "Remove the S17 probe workflow" && git push -q origin HEAD:main
echo "probe workflow removed from main"
