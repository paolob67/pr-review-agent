.PHONY: test lint mutation

test:
	node --test tests/unit/*.test.js tests/pipeline/*.test.js

lint:
	node scripts/validation/lint.js

# Real mutation check: disables each guardrail in a temp copy and requires the tests to fail.
mutation:
	node scripts/validation/mutation-check.js --write
