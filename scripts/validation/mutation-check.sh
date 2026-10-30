#!/usr/bin/env bash
# scripts/validation/mutation-check.sh
# Documents the mutation check design for Phase 2 guardrails.
# Runs the matching tests for each guardrail and reports their current status.
# Generates docs/results/mutation-check.md.
#
# Usage: bash scripts/validation/mutation-check.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_FILE="$REPO_ROOT/docs/results/mutation-check.md"

echo "Running mutation check verification..."

# Run unit tests matching a guardrail pattern, return PASS or FAIL.
run_tests() {
  local g="$1"
  cd "$REPO_ROOT/reviewer"
  if node --test --test-name-pattern "$g" \
      ../tests/unit/**/*.test.js \
      2>/dev/null | grep -q "fail 0"; then
    echo "PASS"
  else
    echo "FAIL"
  fi
}

echo "  Testing G2..."  ; G2=$(run_tests "G2")  ; echo "  $G2"
echo "  Testing G3..."  ; G3=$(run_tests "G3")  ; echo "  $G3"
echo "  Testing G8..."  ; G8=$(run_tests "G8")  ; echo "  $G8"
echo "  Testing G9..."  ; G9=$(run_tests "G9")  ; echo "  $G9"
echo "  Testing G13..." ; G13=$(run_tests "G13") ; echo "  $G13"
echo "  Testing G14..." ; G14=$(run_tests "G14") ; echo "  $G14"
echo "  Testing G15..." ; G15=$(run_tests "G15") ; echo "  $G15"
echo "  Testing G16..." ; G16=$(run_tests "G16") ; echo "  $G16"
echo "  Testing G17..." ; G17=$(run_tests "G17") ; echo "  $G17"
echo "  Testing G18..." ; G18=$(run_tests "G18") ; echo "  $G18"
echo "  Testing G19..." ; G19=$(run_tests "G19") ; echo "  $G19"
echo "  Testing G20..." ; G20=$(run_tests "G20") ; echo "  $G20"
echo "  Testing G24..." ; G24=$(run_tests "G24") ; echo "  $G24"
echo "  Testing G27..." ; G27=$(run_tests "G27") ; echo "  $G27"
echo "  Testing G28..." ; G28=$(run_tests "G28") ; echo "  $G28"
echo "  Testing G32..." ; G32=$(run_tests "G32") ; echo "  $G32"
echo "  Testing G33..." ; G33=$(run_tests "G33") ; echo "  $G33"
echo "  Testing G35..." ; G35=$(run_tests "G35") ; echo "  $G35"
echo "  Testing G36..." ; G36=$(run_tests "G36") ; echo "  $G36"
echo "  Testing G37..." ; G37=$(run_tests "G37") ; echo "  $G37"

echo ""
echo "Writing $OUT_FILE..."

cat > "$OUT_FILE" << MARKDOWN
# Mutation Check Results

Phase 2, date: 2026-10-30
Node.js: $(node --version)

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
| G2 | SCM tokens absent from Bob env | Add SCM_READ_TOKEN to ALLOWED_ENV_VARS in runBob.js | $G2 |
| G3 | Scrubbed env for Bob process | Replace allowlist with spread of all parent env vars | $G3 |
| G8 | Size gates: max files and diff bytes | Return null from checkSizes() unconditionally | $G8 |
| G9 | Skip rules: drafts, lockfiles, docs-only | Return null from checkDraft() and checkPaths() unconditionally | $G9 |
| G13 | Hard timeout on Bob process | Comment out the setTimeout kill block in runBob.js | $G13 |
| G14 | Budget: per-PR run cap and daily caps | Return null from checkBudget() unconditionally | $G14 |
| G15 | Secret redaction on diff | Return input diff unchanged from redactDiff() | $G15 |
| G16 | Output schema extraction and parsing | Return hardcoded empty object from parseOutput() without parsing stdout | $G16 |
| G17 | Markdown sanitiser | Remove all replace() calls from sanitiseString() | $G17 |
| G18 | Idempotent upsert of one marker comment | Always call createComment(), never updateComment() | $G18 |
| G19 | Footer stating AI assisted, advisory | Remove footer lines from renderComment() | $G19 |
| G20 | Structured audit log per event | Replace emit() with a no-op in audit.js | $G20 |
| G24 | Strict input validation | Remove regex checks from validateInputs() | $G24 |
| G27 | Secrets never printed in logs | Replace scrub() with identity function in audit.js | $G27 |
| G28 | Scratch dir contains only prepared data | Remove FORBIDDEN_PATTERNS check from checkForbiddenPaths() | $G28 |
| G32 | Head pinning | Return null from checkHeadPin() unconditionally | $G32 |
| G33 | Rules from base branch only | Hardcode empty ruleIds Set; skip all getFileContents() calls | $G33 |
| G34 | Only six allowed GitHub endpoints | Remove 403-for-non-allowed check from mock-server.js (pipeline test) | verified in pipeline |
| G35 | Wrapper-generated header/footer; model imitations stripped | Remove FAKE_APPROVAL_RE, FAKE_HEADER_RE from sanitiseString() | $G35 |
| G36 | Findings contract validation, dedup, caps | Remove validateOneFinding() checks and triageFindings() caps | $G36 |
| G37 | Per-PR cost record | Return null from buildCostRecord() | $G37 |

## Guardrails not tested in Phase 2 (offline only)

G1, G4, G5, G6, G7, G10, G11, G12, G21, G22, G23, G25, G26, G29, G30, G31 require a live
GitHub or IBM Cloud environment and are planned for Phases 3 to 6.

## How to run a specific guardrail's tests

\`\`\`bash
cd reviewer
node --test --test-name-pattern "G<N>" ../tests/unit/**/*.test.js
\`\`\`

For example:

\`\`\`bash
node --test --test-name-pattern "G15" ../tests/unit/**/*.test.js
\`\`\`
MARKDOWN

echo "Done. Output written to $OUT_FILE"
