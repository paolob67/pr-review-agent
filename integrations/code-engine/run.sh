#!/usr/bin/env bash
# Submit one job run for a pull request. Prints the job run name.
# Usage: run.sh <owner/repo> <pr-number> <head-sha> [--wait]
# Only the three contract inputs are passed (CONTRACTS section 1). Values are validated here with
# the same patterns as the job so a typo fails fast; the job validates again (G24).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=config.sh
. "$here/config.sh"

repo="${1:?usage: run.sh <owner/repo> <pr-number> <head-sha> [--wait]}"
pr="${2:?missing pr number}"
sha="${3:?missing head sha}"
wait_flag="${4:---no-wait}"
[ "$wait_flag" = "--wait" ] || wait_flag="--no-wait"

if [ "${RUN_SKIP_LOCAL_VALIDATION:-0}" != "1" ]; then
  [[ "$repo" =~ ^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$ ]] || { echo "bad repo" >&2; exit 2; }
  [[ "$pr" =~ ^[1-9][0-9]{0,8}$ ]] || { echo "bad pr number" >&2; exit 2; }
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "bad head sha" >&2; exit 2; }
fi

require_login; target_group; select_project
name="review-$(date -u +%Y%m%d-%H%M%S)-$RANDOM"
ibmcloud ce jobrun submit --job "$CE_JOB" --name "$name" \
  --env "REVIEW_REPO=$repo" --env "REVIEW_PR_NUMBER=$pr" --env "REVIEW_HEAD_SHA=$sha" \
  "$wait_flag" --wait-timeout "$JOB_MAX_EXECUTION_SECONDS" >/dev/null
echo "$name"
