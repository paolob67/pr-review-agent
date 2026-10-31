# Mutation Check Results

Date: 2026-10-31
Node.js: v26.3.1

Produced by `node scripts/validation/mutation-check.js --write`. For each row the script copies
`reviewer/` and `tests/` to a temp directory, applies one patch that disables the guardrail,
runs the covering test files and requires them to fail. The working tree is not modified.
KILLED means a test failed when the guardrail was disabled (the desired outcome).
SURVIVED means no test noticed (a gap).

| ID | File | Disabling patch | Tests run | Result |
|---|---|---|---|---|
| G2 | runBob.js | Allow SCM tokens into the Bob env allowlist | unit/runBob | KILLED |
| G3 | runBob.js | Pass the whole parent env instead of the allowlist | unit/runBob, pipeline/pipeline | KILLED |
| G4 | runBob.js | Edit and execute tool groups no longer disabled | unit/runBob | KILLED |
| G23a | runBob.js | Bob keeps the wrapper HOME instead of its own | unit/runBob | KILLED |
| G23b | runBob.js | Bob identity may be root | unit/runBob | KILLED |
| G30 | runBob.js | MCP no longer disabled | unit/runBob | KILLED |
| G7 | gate.js | Disable the author association check | unit/gate | KILLED |
| G8 | gate.js | Size gate always passes | unit/gate, pipeline/pipeline | KILLED |
| G9a | gate.js | Draft PRs are reviewed | unit/gate, pipeline/pipeline | KILLED |
| G9b | gate.js | Lockfile or docs-only PRs are reviewed | unit/gate, pipeline/pipeline | KILLED |
| G10 | main.js | Kill switch ignored | pipeline/pipeline | KILLED |
| G13 | runBob.js | Timeout no longer kills the Bob process | unit/runBob | KILLED |
| G14a | gate.js | Budget gate always passes | unit/gate, pipeline/pipeline | KILLED |
| G14b | render.js | Cumulative spend is not carried into the marker | unit/render, pipeline/pipeline | KILLED |
| G15 | redact.js | Diff is not redacted | unit/redact, pipeline/pipeline | KILLED |
| G16a | validate.js | schema_version not checked | unit/validate | KILLED |
| G16b | parseOutput.js | Missing result line yields an empty review | unit/parseOutput, pipeline/pipeline | KILLED |
| G17a | sanitise.js | HTML not stripped | unit/sanitise | KILLED |
| G17b | sanitise.js | Bidi characters not stripped | unit/sanitise, pipeline/pipeline | KILLED |
| G17c | sanitise.js | @mentions not stripped | unit/sanitise | KILLED |
| G17d | sanitise.js | Markdown images not stripped | unit/sanitise | KILLED |
| G18 | publish.js | Always create a new comment | unit/render, pipeline/pipeline | KILLED |
| G19 | render.js | Footer no longer states advisory status | unit/render, pipeline/pipeline | KILLED |
| G20 | audit.js | Audit log is silent | unit/audit, pipeline/pipeline | KILLED |
| G24a | input.js | Head SHA not validated | unit/input | KILLED |
| G24b | input.js | Repo name not validated | unit/input, pipeline/pipeline | KILLED |
| G27 | audit.js | Log scrubber disabled | unit/audit | KILLED |
| G28 | scratch.js | Forbidden path check disabled | unit/scratch | KILLED |
| G32 | gate.js | Head pinning disabled | unit/gate, pipeline/pipeline | KILLED |
| G33a | stages.js | Rules read from the PR head branch | pipeline/pipeline | KILLED |
| G33b | rules.js | Standards read from a fixed ref instead of the base branch | unit/rules | KILLED |
| G34a | github.js | Publisher posts to the pull request reviews endpoint | unit/github, pipeline/pipeline | KILLED |
| G34b | github.js | Client exposes an extra (review) operation | unit/github | KILLED |
| G35a | render.js | Advisory header omitted | unit/render, pipeline/pipeline | KILLED |
| G35b | sanitise.js | Fake advisory header not stripped | unit/sanitise, pipeline/pipeline | KILLED |
| G36a | validate.js | Hallucinated line numbers accepted | unit/validate, pipeline/pipeline | KILLED |
| G36b | triage.js | Per-category cap removed | unit/triage | KILLED |
| G36c | triage.js | De-duplication removed | unit/triage | KILLED |
| G36d | validate.js | Unknown rule IDs accepted | unit/validate | KILLED |
| G14c | stages.js | Prior spend ignored when counting the per-PR total | pipeline/pipeline | KILLED |
| G25a | stages.js | Publish stage uses the read token instead of the comment token | pipeline/stages | KILLED |
| G25b | stages.js | Prepare stage uses the comment token instead of the read token | pipeline/stages | KILLED |
| G16d | stages.js | Untrusted result: stdout type not checked | pipeline/stages | KILLED |
| G16e | stages.js | Untrusted result: size not limited | pipeline/stages | KILLED |
| G24c | main.js | Handoff for other inputs is accepted | pipeline/stages | KILLED |
| G1 | scripts/validation/workflow-policy.js | Policy no longer requires top-level permissions | unit/workflowPolicy | KILLED |
| G13w | scripts/validation/workflow-policy.js | Policy no longer requires job timeouts | unit/workflowPolicy | KILLED |
| G22w | scripts/validation/workflow-policy.js | Policy no longer requires SHA-pinned actions | unit/workflowPolicy | KILLED |
| G24w | scripts/validation/workflow-policy.js | Policy allows expressions inside run: | unit/workflowPolicy | KILLED |
| G25w | scripts/validation/workflow-policy.js | Policy allows a GitHub token in the review job | unit/workflowPolicy | KILLED |
| G34w | scripts/validation/workflow-policy.js | Policy allows forbidden write scopes | unit/workflowPolicy | KILLED |
| G37 | cost.js | Reported Bob cost dropped from the record | unit/cost, pipeline/pipeline | KILLED |

Summary: 52 of 52 mutations killed.
