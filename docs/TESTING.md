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
cd reviewer
node --test ../tests/unit/**/*.test.js
```

Run tests for a specific guardrail:

```bash
cd reviewer
node --test --test-name-pattern "G15" ../tests/unit/**/*.test.js
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

### Pipeline tests (`tests/pipeline/`)

End-to-end tests using `fake-bob` (a Node.js shim in `tests/fixtures/fake-bob.js`) and a
local HTTP mock server (`tests/fixtures/mock-server.js`). These tests call `main()` directly
with a fake environment and verify the complete pipeline outcome.

No network calls are made. All tests run offline.

Run pipeline tests:

```bash
cd reviewer
node --test ../tests/pipeline/pipeline.test.js
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

See [`docs/results/mutation-check.md`](results/mutation-check.md) for the full mutation check
table. Each guardrail's tests are verified by:

```bash
bash scripts/validation/mutation-check.sh
```

## Live test suites (Phase 3+)

The following suites require real credentials and are not run by `make test`:

- `make test-live-bob`: Phase 3 - real Bob, real diffs, no GitHub.
- `make test-e2e`: Phase 5 - full end-to-end with a sandbox GitHub repository.
- `make test-redteam`: Phase 6 - red-team injection corpus.
- `make test-evals`: Phase 6 - precision evaluation against seeded-flaw PRs.

These are defined in separate Makefile targets and documented in `docs/TESTING.md` as they are
added.
