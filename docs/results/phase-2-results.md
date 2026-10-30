# Phase 2 Results

Date: 2026-10-30
Node.js: 26.3.1
Platform: macOS arm64, Darwin 27.0.0
Bob Shell version: not used (offline phase)

## make test output

```
ℹ tests 161
ℹ suites 23
ℹ pass 161
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~3800
```

All 161 tests pass. 0 failures.

## make lint output

```
Checking reviewer/src/ files...
Checking tests/ files...

Checked 34 files. Errors: 0
Lint passed.
```

## Test breakdown

| Suite | Files | Tests | Pass | Fail |
|---|---|---|---|---|
| Unit | 13 | 143 | 143 | 0 |
| Pipeline | 1 | 18 | 18 | 0 |
| Total | 14 | 161 | 161 | 0 |

## Guardrails covered

The following guardrails have named tests in Phase 2:

G2, G3, G7, G8, G9, G13, G14, G15, G16, G17, G18, G19, G20, G24, G27, G28, G29, G32, G33, G34, G35, G36, G37

Total: 23 guardrails covered out of 37.

## Guardrails NOT covered in Phase 2 (require live env)

G1, G4, G5, G6, G10, G11, G12, G21, G22, G23, G25, G26, G29, G30, G31

(G29 is partially covered: scratch tests verify no AGENTS.md or .env; the full live test
confirming `--workspace` prevents AGENTS.md loading is in Phase 3.)

## Mutation check

All 20 offline-testable guardrails show PASS in `docs/results/mutation-check.md`.

See: [mutation-check.md](mutation-check.md)

## Canary secret verification

The canary value `xxxxxxxxxcanaryxxxxxxxxx` does NOT appear in:
- Any test log output (verified by `audit.test.js` G27 tests)
- Any rendered comment body (verified by pipeline `canary:fake_approval_stripped`)
- The fake-bob child environment (verified by pipeline `canary:scm_token_not_in_bob_env`)

## Open design questions found during Phase 2

1. `main.js` uses `process.exit()` calls that must be intercepted in tests. This works but is
   fragile if Node.js changes how unhandled exits propagate through test runners. A future
   refactor could return an outcome object from `main()` and have the bin entry point call
   `process.exit()`. Tracked as a future task; no blocker for Phase 3.

2. The `runBob.js` module passes `FAKE_BOB_*` env vars to the Bob process to support the
   test shim. In production these vars are never set; they are harmless. This is noted here
   for the red-team phase.

3. The `validate.js` all-invalid-findings check throws `bad_model_output` when every finding
   is dropped. If the model returns an empty findings array (no findings, zero dropped), this
   is treated as a valid empty review. This is intentional per CONTRACTS.
