.PHONY: test lint mutation workflow-policy image canary test-e2e redteam-offline redteam-live redteam-open redteam-check evals-open evals-score evals-train evals-heldout

test:
	node --test tests/unit/*.test.js tests/pipeline/*.test.js

lint:
	node scripts/validation/lint.js
	node scripts/validation/workflow-policy.js

workflow-policy:
	node scripts/validation/workflow-policy.js

# Real mutation check: disables each guardrail in a temp copy and requires the tests to fail.
mutation:
	node scripts/validation/mutation-check.js --write

# Phase 5 end-to-end matrix against the sandbox repo. Live: spends Bobcoins and runner minutes.
test-e2e:
	node tests/e2e/matrix.mjs --all

# Local container build and canary with podman (see docs/results/phase-4-container.md). Needs a
# running podman machine; not part of `make test`.
image:
	integrations/container/build.sh

canary:
	podman run --rm --read-only --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE \
	  --security-opt no-new-privileges --tmpfs /tmp:rw,exec,nosuid,size=256m --pids-limit 512 \
	  --entrypoint node pr-reviewer:local /app/tests/container/canary.mjs

# Phase 6 red-team (offline sanitiser assertions, no Bob calls).
redteam-offline:
	node tests/redteam/harness.mjs --offline

# Phase 6 red-team (live, needs sandbox repo and kill switch on). Spends Bobcoins.
redteam-live:
	node tests/redteam/harness.mjs --all

# Phase 6 red-team: step 1 - open all PRs immediately (no waiting), print tracking table.
redteam-open:
	node tests/redteam/open-all-prs.mjs

# Phase 6 red-team: step 2 - assert comments once all PRs are reviewed, close PRs.
redteam-check:
	node tests/redteam/check-comments.mjs --close

# Phase 6 quality evals - step 1: open all 30 eval PRs immediately (no waiting).
evals-open:
	node tests/evals/open-all-evals.mjs

# Phase 6 quality evals - step 2: score comments + close PRs once all are reviewed.
evals-score:
	node tests/evals/score-evals.mjs --close

# Legacy sequential runner (train set only). Use evals-open + evals-score for batch workflow.
evals-train:
	node tests/evals/runner.mjs --set train

# Legacy sequential runner (held-out set only).
evals-heldout:
	node tests/evals/runner.mjs --set held-out
