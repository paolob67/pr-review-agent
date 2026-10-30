# Phase 2 Results

Date: 2026-10-30
Node.js: 26.3.1
Platform: macOS arm64, Darwin 27.0.0
Bob Shell version: not used (offline phase; no live calls)

## make test

```
ℹ tests 180
ℹ suites 24
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~6000
```

## make lint

```
Checked 35 files. Errors: 0
Lint passed.
```

`make lint` checks for the em-dash character and for a guardrail ID in every `reviewer/src/`
file. actionlint, shellcheck and eslint are not installed on this machine, so no other static
analysis ran. There are no workflows or shell scripts under Phase 2 yet.

## make mutation

39 of 39 mutations killed (see [mutation-check.md](mutation-check.md)). This is a real
patch-and-run check: each mutation disables one guardrail in a temp copy and the covering tests
must fail.

An earlier version of this phase shipped a mutation "table" in which every row said PASS because
it only ran the tests against unmodified code. That proved nothing, and it was replaced. The first
real run killed 30 of 36; the 6 survivors exposed real gaps, fixed in this phase:

| Survivor | What it showed | Fix |
|---|---|---|
| G10 kill switch | No test for `REVIEW_ENABLED=false` | Pipeline test: no API call at all |
| G13 timeout | The timeout test passed even if the process was never killed | Test now asserts `timedOut` and a short duration against a fake-bob that sleeps 30 s |
| G14 cumulative cost | The marker recorded only this run's cost, so the per-PR spend cap could never accumulate | Bug fixed in `render.js` and `main.js`; unit and pipeline tests added |
| G17 images | Test did not detect leftover alt text | Assertions tightened |
| G33 base branch | No test checked which ref rules were fetched at | Mock serves rules only at the base ref; unit and pipeline tests assert the ref |
| G33/G36 rule IDs | Rule-ID check was skipped when the rule set was empty, so a run with no rules accepted any cited ID | Bug fixed in `validate.js`; tests added |

Other defects found and fixed while doing this:

- Timeout and nonzero Bob exit were reported as `bad_model_output`; CONTRACTS section 8 says
  `bob_unavailable`. Fixed in `parseOutput.js`; pipeline tests now assert the exact outcome.
- At the per-PR run cap the wrapper overwrote the last real review with a "unavailable" note. It
  now leaves the existing review in place.

## Test breakdown

| Suite | Files | Tests |
|---|---|---|
| Unit | 14 | 152 |
| Pipeline | 1 | 28 |
| Total | 15 | 180 pass, 0 fail |

## Guardrails

Covered by a named test and a killed mutation: G2, G3, G4 and G30 (argument list only), G7, G8, G9, G10, G13, G14, G15, G16, G17,
G18, G19, G20, G24, G27, G28, G32, G33, G34, G35, G36, G37.

Not covered offline, and why:

| Guardrails | Reason |
|---|---|
| G1, G6, G11, G12, G31 | GitHub Actions workflow and trigger behaviour; Phase 5 |
| G5, G29 (live part) | Need real Bob; Phase 3 |
| G4, G30 (live part) | The offline test asserts the argument list (`--disable-tool-groups edit,execute`, `--disable-mcp`, `--workspace`, `--mode reviewer`, `-f json`, no `--yolo`/`--trust`). That the flags actually remove the tools is recorded for Bob 2.0.9 in spikes.md S5 and S14; the live test is Phase 3 |
| G21, G22, G25, G26 | Code Engine job config, image pinning, IAM, cleanup; Phase 4 |
| G23 | Needs the in-container user separation; Phase 4. Env scrubbing (G2, G3) is covered |

G29 is partly covered: the scratch tests show no `AGENTS.md`, `.env` or `.bob/settings.json` is
written. Whether `--workspace` makes Bob ignore a repo `AGENTS.md` is already recorded for the
local case in spikes.md S14.

## Canary secrets

Tested with distinct canary values for `SCM_READ_TOKEN`, `SCM_COMMENT_TOKEN` and
`CANARY_SCM_TEST`:

- Bob process environment: fake-bob dumps its own environment; the test asserts none of the
  three values is present and that `BOB_API_KEY` is the only credential (`G3 G23` pipeline test).
- Audit log: scrubber test (`audit.test.js`) and pipeline assertion on captured audit lines.
- Rendered comments: pipeline assertion on every posted body.
- Scratch files: not asserted for canary content; scratch holds only the mode file in Phase 2.

## Mock API

`mock-server.js` returns 403 for any endpoint other than the six allowed. `github.test.js` also
proves the client exposes exactly six operations and never builds a reviews, check-runs or
statuses path. The pipeline `canary:no_extra_github_endpoints` test inspects every captured request.

## Known limitations and open design questions

1. **Daily caps were dropped by owner decision** ([ADR 0009](../adr/0009-drop-daily-caps.md)). G14 is
   the per-PR run cap (3). Per-PR spend is tracked in the marker for reporting only.
2. **Files at the head SHA are not fetched, and the prompt goes on stdin.** Decided in
   [ADR 0010](../adr/0010-scratch-layout-stdin.md): scratch holds only `.bob/custom_modes.yaml`;
   CONTRACTS section 9 is updated to match. Whether the model needs full files is a Phase 3
   quality question.
3. **Bob Shell version and image digest are `null` in the cost record and footer** until Phase 3
   (version, from `bob --version`) and Phase 4 (digest).
4. **Line validation is added-lines only.** A finding on an unchanged context line is dropped. This
   follows ADR 0004 ("added or modified line") but may drop useful findings; measure in Phase 3.
5. `main.js` calls `process.exit()`; tests intercept it. Returning an outcome object and exiting in
   `bin/reviewer.js` would be cleaner.
6. `runBob.js` forwards `FAKE_BOB_*` variables to the child for the test shim. Harmless in
   production because nothing sets them, but it is an exception to the allowlist; remove it for the
   red-team phase by giving the shim its own channel.
7. Prompt-injection resistance of the real model is untested; that is Phase 3 and 6.
8. The redaction patterns are conservative (credential keyword plus 32 or more characters, AWS key
   IDs, GitHub tokens, PEM headers). Other secret formats pass through to Bob.
