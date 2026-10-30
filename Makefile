.PHONY: test lint

test:
	cd reviewer && node --test ../tests/unit/**/*.test.js ../tests/pipeline/**/*.test.js

lint:
	node scripts/validation/lint.js
