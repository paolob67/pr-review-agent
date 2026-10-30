#!/usr/bin/env bash
# Delete job runs older than N days (default 7). Guardrail G26: a project is limited to 100 job runs.
# Usage: cleanup-runs.sh [days]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=config.sh
. "$here/config.sh"
days="${1:-7}"
[[ "$days" =~ ^[0-9]{1,3}$ ]] || { echo "days must be a number" >&2; exit 2; }
require_login; target_group; select_project

cutoff="$(node -e 'console.log(new Date(Date.now()-Number(process.argv[1])*864e5).toISOString())' "$days")"
ibmcloud ce jobrun list --job "$CE_JOB" --output json \
  | node -e '
      const cutoff = process.argv[1];
      const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
      for (const r of (d.items ?? [])) {
        if (r.metadata?.creationTimestamp < cutoff) console.log(r.metadata.name);
      }' "$cutoff" \
  | while read -r run; do
      [ -n "$run" ] || continue
      echo "deleting $run"
      ibmcloud ce jobrun delete --name "$run" --force >/dev/null
    done
echo "cleanup done (cutoff $cutoff)"
