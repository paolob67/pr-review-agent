# Mutation Check Results

Phase 2, date: 2026-10-30
Node.js: v26.3.1

## Purpose

Each guardrail listed here has at least one named test (carrying the guardrail ID in its name)
that would fail if the guard were removed. This table documents the design of each mutation
check: which guard, what a disabling patch would look like, and which test(s) cover it.

The "Current test status" column shows whether the matching tests pass today.
A production mutation check would apply the patch, run the tests, confirm they fail,
then revert the patch.

## Table

| Guardrail | Control | Disabling patch description | Current test status |
|---|---|---|---|
| G2 | SCM tokens absent from Bob env | Add SCM_READ_TOKEN to ALLOWED_ENV_VARS in runBob.js | PASS |
| G3 | Scrubbed env for Bob process | Replace allowlist with spread of all parent env vars | PASS |
| G8 | Size gates: max files and diff bytes | Return null from checkSizes() unconditionally | PASS |
| G9 | Skip rules: drafts, lockfiles, docs-only | Return null from checkDraft() and checkPaths() unconditionally | PASS |
| G13 | Hard timeout on Bob process | Comment out the setTimeout kill block in runBob.js | PASS |
| G14 | Budget: per-PR run cap and daily caps | Return null from checkBudget() unconditionally | PASS |
| G15 | Secret redaction on diff | Return input diff unchanged from redactDiff() | PASS |
| G16 | Output schema extraction and parsing | Return hardcoded empty object from parseOutput() without parsing stdout | PASS |
| G17 | Markdown sanitiser | Remove all replace() calls from sanitiseString() | PASS |
| G18 | Idempotent upsert of one marker comment | Always call createComment(), never updateComment() | PASS |
| G19 | Footer stating AI assisted, advisory | Remove footer lines from renderComment() | PASS |
| G20 | Structured audit log per event | Replace emit() with a no-op in audit.js | PASS |
| G24 | Strict input validation | Remove regex checks from validateInputs() | PASS |
| G27 | Secrets never printed in logs | Replace scrub() with identity function in audit.js | PASS |
| G28 | Scratch dir contains only prepared data | Remove FORBIDDEN_PATTERNS check from checkForbiddenPaths() | PASS |
| G32 | Head pinning | Return null from checkHeadPin() unconditionally | PASS |
| G33 | Rules from base branch only | Hardcode empty ruleIds Set; skip all getFileContents() calls | PASS |
| G34 | Only six allowed GitHub endpoints | Remove 403-for-non-allowed check from mock-server.js (pipeline test) | verified in pipeline |
| G35 | Wrapper-generated header/footer; model imitations stripped | Remove FAKE_APPROVAL_RE, FAKE_HEADER_RE from sanitiseString() | PASS |
| G36 | Findings contract validation, dedup, caps | Remove validateOneFinding() checks and triageFindings() caps | PASS |
| G37 | Per-PR cost record | Return null from buildCostRecord() | PASS |

## Guardrails not tested in Phase 2 (offline only)

G1, G4, G5, G6, G7, G10, G11, G12, G21, G22, G23, G25, G26, G29, G30, G31 require a live
GitHub or IBM Cloud environment and are planned for Phases 3 to 6.

## How to run a specific guardrail's tests

```bash
cd reviewer
node --test --test-name-pattern "G<N>" ../tests/unit/**/*.test.js
```

For example:

```bash
node --test --test-name-pattern "G15" ../tests/unit/**/*.test.js
```
