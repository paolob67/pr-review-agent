# Testing Guide

Phase 2 introduced a full offline test suite. This document explains how to run each suite,
what it covers, and how to read the results.

## Quick start

```bash
make test    # Run all offline tests (unit + pipeline)
make lint    # Run static checks
```

Both commands must pass with zero failures before merging any change to `reviewer/src/` or
`tests/`.

## Test suites

### Unit tests (`tests/unit/`)

One file per module. Each test name carries one or more guardrail IDs (G1-G37) so the
coverage map is readable directly from the test output.

Run all unit tests:

```bash
node --test tests/unit/*.test.js
```

Run tests for a specific guardrail:

```bash
node --test --test-name-pattern "G15" tests/unit/*.test.js tests/pipeline/*.test.js
```

#### Files and guardrails covered

| Test file | Guardrails |
|---|---|
| `tests/unit/input.test.js` | G24 |
| `tests/unit/gate.test.js` | G7, G8, G9, G14, G32 |
| `tests/unit/redact.test.js` | G15 |
| `tests/unit/sanitise.test.js` | G17, G35 |
| `tests/unit/validate.test.js` | G16, G36 |
| `tests/unit/triage.test.js` | G36 |
| `tests/unit/audit.test.js` | G20, G27 |
| `tests/unit/cost.test.js` | G37 |
| `tests/unit/render.test.js` | G18, G19, G35 |
| `tests/unit/runBob.test.js` | G2, G3, G13 |
| `tests/unit/scratch.test.js` | G28, G29 |
| `tests/unit/rules.test.js` | G33 |
| `tests/unit/parseOutput.test.js` | G16 |
| `tests/unit/github.test.js` | G34 |

### Pipeline tests (`tests/pipeline/`)

End-to-end tests using `fake-bob` (a Node.js shim in `tests/fixtures/fake-bob.js`) and a
local HTTP mock server (`tests/fixtures/mock-server.js`). These tests call `main()` directly
with a fake environment and verify the complete pipeline outcome.

No network calls are made. All tests run offline.

Run pipeline tests:

```bash
node --test tests/pipeline/pipeline.test.js
```

#### Scenarios covered

Each scenario name corresponds to an outcome from CONTRACTS section 8:

| Scenario | Outcome | What is verified |
|---|---|---|
| `outcome:reviewed` | reviewed | Comment posted with advisory header, marker, findings |
| `outcome:reviewed idempotent` | reviewed | Second run PATCHes existing comment, no new POST |
| `outcome:reviewed no findings` | reviewed | Comment says "no findings" |
| `outcome:skipped_stale` | skipped_stale | No comment posted when head SHA differs |
| `outcome:skipped_gate draft` | skipped_gate | No comment posted for draft PR |
| `outcome:skipped_gate size_exceeded` | skipped_gate | Short note posted; fake-bob not called |
| `outcome:skipped_gate all_lockfiles` | skipped_gate | No comment for lockfile-only diff |
| `outcome:skipped_gate pr_run_limit_reached` | skipped_gate | No review when prior runs = cap |
| `outcome:rejected_input` | rejected_input | No API calls made; exits 0 |
| `outcome:bob_unavailable timeout` | bob_unavailable | Short unavailable note posted on timeout |
| `outcome:bob_unavailable nonzero` | bob_unavailable | Short note posted on Bob exit 1 |
| `outcome:bad_model_output malformed` | bad_model_output | Short note posted for malformed JSON |
| `outcome:bad_model_output all_hallucinated` | bad_model_output | Short note when all findings dropped |
| `canary:scm_token_not_in_bob_env` | reviewed | SCM tokens absent from Bob env (G3, G23) |
| `canary:no_extra_github_endpoints` | reviewed | No non-allowed endpoint calls (G34) |
| `canary:fake_approval_stripped` | reviewed | Fake approval text stripped from comment (G35) |
| `canary:bidi_stripped` | reviewed | Bidi control chars stripped from comment (G17) |
| `canary:marker_no_spam` | reviewed | Two runs produce one updated comment (G18) |
| `G10 outcome:skipped_disabled` | skipped_disabled | Kill switch off: no API call at all |
| `outcome:publish_failed` | publish_failed | Comment API failing: exit 0, outcome logged |
| `G33` (3 tests) | reviewed | Rules fetched at the base ref only; footer shows rules loaded; rule-less run drops rule-citing findings |
| `G14 G37` cumulative cost | reviewed | Marker `cost_total` adds this run to prior spend |
| `G14` cap keeps review | skipped_gate | At the run cap the existing review comment is not overwritten |
| `G13` pipeline | bob_unavailable | Hung Bob is killed; outcome is exactly `bob_unavailable` |
| `G3 G23` env dump | n/a | fake-bob's own environment dump contains no SCM token or canary value |

## Test fixtures

### `tests/fixtures/fake-bob.js`

An executable Node.js script that replaces the real `bob` binary. It reads the `FAKE_BOB_SCENARIO`
env var to select a scenario file from `tests/fixtures/scenarios/`. Scenario files are JSON and
control what output fake-bob emits, whether it sleeps, and whether it exits nonzero.

Available scenarios: `valid`, `empty`, `malformed`, `extra_text`, `huge`, `nonzero`, `timeout`,
`hallucinated_location`, `unknown_rule_ids`, `duplicates`, `flood`, `fake_approval`,
`fake_header`, `images_html`, `mentions`, `bidi`, `env_print`.

### `tests/fixtures/mock-server.js`

A local HTTP server (port 3999 for pipeline tests) that serves mock GitHub API responses.
It records all requests and rejects any endpoint not in the allowed set of six (G34).

Configure the mock via `world` exports before each test:

```js
import { start, stop, world } from '../fixtures/mock-server.js';
world.setPR({ ...prData });
world.setDiff('...unified diff...');
world.setRules({ '.bob-review/standards.md': '...content...' });
world.setComments([...existingComments]);
const requests = world.capturedRequests();
```

### `tests/fixtures/sample.diff`

A small unified diff used by pipeline tests as the default PR diff. Contains two changed files
(`src/utils.js` and `src/auth.js`) with several added lines. Scenarios must use file paths and
line numbers from this diff to pass validation.

## Mutation check

```bash
make mutation          # runs node scripts/validation/mutation-check.js --write
node scripts/validation/mutation-check.js --only G17   # a subset, does not write the report
```

The script copies `reviewer/` and `tests/` to a temp directory, applies one patch that disables a
guardrail, runs the covering test files, and requires them to fail. The working tree is never
changed. A patch whose search text no longer occurs exactly once is reported INVALID, so a
refactor cannot silently turn a mutation into a no-op. Exit code is nonzero if any mutation
survives or is invalid. The result table is in
[`results/mutation-check.md`](results/mutation-check.md). Update the patch list in
`scripts/validation/mutation-check.js` when you change a guarded line.

## Live test suites (Phase 3+)

The following suites require real credentials and are not run by `make test`:

- `make test-live-bob`: Phase 3 - real Bob, real diffs, no GitHub.
- `make test-e2e`: Phase 5 - full end-to-end with a sandbox GitHub repository.
- `make test-redteam`: Phase 6 - red-team injection corpus.
- `make test-evals`: Phase 6 - precision evaluation against seeded-flaw PRs.

These are defined in separate Makefile targets and documented in `docs/TESTING.md` as they are
added.

## Live local runs (Phase 3, not part of `make test`)

These call the real Bob and spend Bobcoins. They are never run by default and a ledger refuses calls
past 60 calls or 24 Bobcoins (80 percent of 30).

```bash
node scripts/dev/review-local.js --status         # ledger: calls and Bobcoins used
node scripts/dev/review-local.js 04               # one fixture through the full pipeline, real Bob
node scripts/dev/review-local.js 11 --hostile     # hostile-parent-directory check
node scripts/dev/review-local.js 04 --fake valid  # same driver, fake-bob, no cost
```

The key is read from the git-ignored `pr-review-agent.json` or `BOB_API_KEY`. Results:
[results/phase-3-runs.md](results/phase-3-runs.md).
