.PHONY: test lint mutation workflow-policy image canary test-e2e

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
