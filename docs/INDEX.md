# Documentation Index

| Document | Purpose | Status |
|---|---|---|
| [../AGENTS.md](../AGENTS.md) | Instructions for any agent session working on this repo | Current |
| [STATUS.md](STATUS.md) | Phase tracker, blockers, unknowns tracker, decisions log | Current |
| [PLAN.md](PLAN.md) | Design review, guardrail catalogue, phased plan, test strategy, future change cases | Working draft, for review |
| [CONTRACTS.md](CONTRACTS.md) | Shared interfaces: job inputs, secrets, findings schema, comment format, cost record | Frozen (Phase 1, 2026-10-30) |
| [THREAT_MODEL.md](THREAT_MODEL.md) | Assets, actors, abuse cases, control mapping (G1 to G37) | Current (Phase 1) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, components, data flow, S15 analysis | Current (Phase 1) |
| [tasks/README.md](tasks/README.md) | Index of the self-contained phase briefs | Current |
| [tasks/phase-0-spikes.md](tasks/phase-0-spikes.md) | Brief: spikes against the local Bob CLI | Done |
| [tasks/phase-1-design-freeze.md](tasks/phase-1-design-freeze.md) | Brief: threat model, ADRs, architecture freeze | Done |
| [tasks/phase-2-reviewer-core.md](tasks/phase-2-reviewer-core.md) | Brief: reviewer core with offline tests | Done 2026-10-30 |
| [tasks/phase-3-real-bob.md](tasks/phase-3-real-bob.md) | Brief: real Bob integration, local | Done 2026-10-30 |
| [tasks/phase-4-runner-foundation.md](tasks/phase-4-runner-foundation.md) | Brief: runner foundation (container, stage split, secrets wiring) | Done 2026-10-31 |
| [tasks/phase-5-github-trigger.md](tasks/phase-5-github-trigger.md) | Brief: GitHub trigger and end-to-end matrix | Done 2026-10-31 |
| [tasks/phase-6-redteam-evals.md](tasks/phase-6-redteam-evals.md) | Brief: red team and quality evals | Done 2026-11-01 |
| [tasks/phase-7-hardening.md](tasks/phase-7-hardening.md) | Brief: operational hardening and cost reconciliation | Done 2026-11-01 (S16 not available) |
| [tasks/phase-8-docs-article.md](tasks/phase-8-docs-article.md) | Brief: documentation, article, final validation | Ready |
| [adr/0001-execution-environment.md](adr/0001-execution-environment.md) | Decision to run Bob Shell on GitHub-hosted runners, three jobs with separate credentials | Accepted |
| [adr/0002-author-and-fork-policy.md](adr/0002-author-and-fork-policy.md) | Role-based author policy and maintainer label gate | Accepted |
| [adr/0003-trigger-after-ci.md](adr/0003-trigger-after-ci.md) | Trigger after CI and definition of required CI | Accepted |
| [adr/0004-findings-contract-and-comment-format.md](adr/0004-findings-contract-and-comment-format.md) | Findings schema, line mapping, comment structure | Accepted |
| [adr/0005-rules-location-and-base-branch-loading.md](adr/0005-rules-location-and-base-branch-loading.md) | Base-branch loading of rules and standards | Accepted |
| [adr/0006-in-container-isolation.md](adr/0006-in-container-isolation.md) | In-container isolation and privilege separation | Accepted |
| [adr/0007-cost-record-and-cap-semantics.md](adr/0007-cost-record-and-cap-semantics.md) | Cost record schema, per-PR cap (daily caps superseded by 0009) | Accepted |
| [adr/0009-drop-daily-caps.md](adr/0009-drop-daily-caps.md) | Daily run and spend caps dropped | Accepted |
| [adr/0010-scratch-layout-stdin.md](adr/0010-scratch-layout-stdin.md) | Prompt on stdin; scratch holds only the mode file | Accepted |
| [adr/0011-bobcoins-as-usage-unit.md](adr/0011-bobcoins-as-usage-unit.md) | Bob usage recorded in Bobcoins, no currency conversion | Accepted |
| [adr/0008-scm-identity-for-comments.md](adr/0008-scm-identity-for-comments.md) | Dedicated bot account, comment-only scope | Accepted (amended by 0013) |
| [adr/0012-secrets-and-credentials-on-github.md](adr/0012-secrets-and-credentials-on-github.md) | Secrets and credentials on GitHub | Accepted (item 3 amended by 0014) |
| [adr/0014-publish-token-pull-requests-write.md](adr/0014-publish-token-pull-requests-write.md) | The publish token has `pull-requests: write` (S17); G34 held by allowlist, check and repo setting | Accepted 2026-10-31 |
| [adr/0015-trigger-design.md](adr/0015-trigger-design.md) | Trigger design: resolve the PR from the SHA, required workflows (G31), `ai-review` label, per-job concurrency | Accepted 2026-10-31 |
| [adr/0013-bob-license-acceptance.md](adr/0013-bob-license-acceptance.md) | `--accept-license` on every non-interactive Bob run | Accepted 2026-10-31 |
| [diagrams/architecture-overview.drawio](diagrams/architecture-overview.drawio) | Architecture overview (source; PNG alongside) | Current |
| [diagrams/trust-boundaries.drawio](diagrams/trust-boundaries.drawio) | Trust boundaries diagram (source; PNG alongside) | Current |
| [TESTING.md](TESTING.md) | How to run each test suite and read results | Current (updated Phase 5, 2026-10-31) |
| [SETUP.md](SETUP.md) | GitHub part: environment, variables, secret, first run | Rebuilt from the document in Phase 7; other-repo install completed in Phase 8 |
| [RUNBOOK.md](RUNBOOK.md) | First five minutes, kill switch, missing review, cap, key rotation, leaked key, cost, artifacts, teardown | Drilled in Phase 7 (gaps listed in the file) |
| [ARTICLE.md](ARTICLE.md) | Full technical paper: motivation, architecture, guardrails, red-team results, quality evals, cost, caveats, adoption | Phase 8, 2026-11-01 |
| [results/spikes.md](results/spikes.md) | Phase 0 spike findings: S1-S10, S13, S14; gate decisions | Phase 0 done 2026-10-30 |
| [results/phase-1-signoff.md](results/phase-1-signoff.md) | Phase 1 sign-off record and policy decisions | Phase 1 done 2026-10-30 |
| [results/phase-2-results.md](results/phase-2-results.md) | Phase 2 test counts, guardrails covered, design notes | Phase 2 done 2026-10-30 |
| [results/phase-3-runs.md](results/phase-3-runs.md) | Phase 3 real-Bob runs: pass rate, usage, latency, hostile-config check | Phase 3 done 2026-10-30 |
| [results/phase-3-evidence/](results/phase-3-evidence/) | Saved comment, result and argv per run, plus the budget ledger | Phase 3 done 2026-10-30 |
| [results/mutation-check.md](results/mutation-check.md) | Mutation check results (real patch-and-run, 39 mutations) | Phase 2 done 2026-10-30 |
| [results/runner-facts.md](results/runner-facts.md) | GitHub runner, secrets and workflow_run documentation facts | 2026-10-30 |
| [results/phase-4-container.md](results/phase-4-container.md) | Phase 4 Part A: podman reset, image digest, S11 canary, validation | Part A done 2026-10-31 |
| [results/phase-4-runner.md](results/phase-4-runner.md) | Phase 4 Part B: run ledger, defects found, S17 to S20 | Part B done 2026-10-31, teardown proved |
| [results/phase-5-github.md](results/phase-5-github.md) | Phase 5: end-to-end matrix (13 cases), S15 answers, defects, run ledger, owner-pending cases | Phase 5 done 2026-10-31 (fork cases pending) |
| [results/phase-6-redteam.md](results/phase-6-redteam.md) | Phase 6: red-team results (offline 9/9, live 16/16 PASS, 44 reps, zero leaks) | Phase 6 done 2026-11-01 |
| [results/phase-6-evals.md](results/phase-6-evals.md) | Phase 6: quality eval results (25/30 PASS, recall 0.97, FP rate 2.5/clean PR) | Phase 6 done 2026-11-01 |
| [results/phase-7-drills.md](results/phase-7-drills.md) | Phase 7: kill switch, cap, key rotation, revoked key, rebuild from docs, artifact retention | Phase 7 done 2026-11-01 |
| [results/cost-summary.md](results/cost-summary.md) | Phase 7: per-PR cost statement with accuracy, runner minutes, cancelled-review cost, S16 | Phase 7 done 2026-11-01 |
| [results/cost-data.json](results/cost-data.json) | Phase 7: per-run job timings and audit records for 269 runs (data only) | Phase 7 |
| [results/cost-data-cancelled.json](results/cost-data-cancelled.json) | Phase 7: Bob calls found inside cancelled review jobs (29) | Phase 7 |
| [results/phase-5-evidence/](results/phase-5-evidence/) | Matrix data (`matrix.json`) and the first bot comment of each case | Phase 5 |
| [tests/e2e/matrix.mjs](../tests/e2e/matrix.mjs) | End-to-end matrix driver against the sandbox (`make test-e2e`) | Phase 5 |
| [tests/redteam/harness.mjs](../tests/redteam/harness.mjs) | Red-team harness: offline sanitiser assertions + live corpus runner (`make redteam-offline`, `make redteam-live`) | Phase 6 |
| [tests/redteam/open-all-prs.mjs](../tests/redteam/open-all-prs.mjs) | Batch PR opener: creates all live PRs instantly without waiting (`make redteam-open`) | Phase 6 |
| [tests/redteam/check-comments.mjs](../tests/redteam/check-comments.mjs) | Comment assertion checker: reads tracking.json, asserts all review comments, closes PRs (`make redteam-check`) | Phase 6 |
| [tests/redteam/corpus/](../tests/redteam/corpus/) | 25 injection corpus cases (rt01-rt25), one JSON per attack vector | Phase 6 |
| [tests/evals/open-all-evals.mjs](../tests/evals/open-all-evals.mjs) | Batch eval PR opener: creates all 30 eval PRs without waiting (`make evals-open`) | Phase 6 |
| [tests/evals/score-evals.mjs](../tests/evals/score-evals.mjs) | Eval scorer: fetches comments, scores recall/FP/variance, closes PRs (`make evals-score`) | Phase 6 |
| [tests/evals/runner.mjs](../tests/evals/runner.mjs) | Legacy sequential eval runner (`make evals-train`, `make evals-heldout`) | Phase 6 |
| [tests/evals/cases/](../tests/evals/cases/) | 30 seeded-flaw JS fixtures (ev01-ev20 train, ev21-ev30 held-out) | Phase 6 |
| [tests/evals/expected.json](../tests/evals/expected.json) | Expected findings manifest for the eval set | Phase 6 |
| [results/phase-6-redteam-offline.json](results/phase-6-redteam-offline.json) | Red-team offline results (9/9 PASS) | Phase 6 done |
| [results/phase-6-redteam-live.json](results/phase-6-redteam-live.json) | Red-team live results (16/16 PASS) | Phase 6 done |
| [results/phase-6-evals-all.json](results/phase-6-evals-all.json) | Eval results all 30 cases (25/30 PASS) | Phase 6 done |
| [integrations/github-actions/scripts/resolve-trigger.mjs](../integrations/github-actions/scripts/resolve-trigger.mjs) | `prepare` trigger script: PR from SHA, required workflows, quiet stops | Phase 5 |
| [scripts/dev/install-sandbox-reviewer.sh](../scripts/dev/install-sandbox-reviewer.sh) | Install the reviewer into the sandbox repo (S20 per-run build) | Phase 4 |
| [scripts/dev/teardown-sandbox.sh](../scripts/dev/teardown-sandbox.sh) | Remove the Part B environment, variables and files, then list what remains | Phase 4 |
| [scripts/dev/setup-sandbox.sh](../scripts/dev/setup-sandbox.sh) | Recreate environment, variables and secret (key piped from the key file) after a teardown | Phase 4 |
| [scripts/dev/collect-cost-data.mjs](../scripts/dev/collect-cost-data.mjs) | Read-only: collect run timings and audit records from a repo into `cost-data.json` | Phase 7 |
| [scripts/dev/summarise-cost.mjs](../scripts/dev/summarise-cost.mjs) | Offline: aggregate `cost-data.json` into distributions and totals | Phase 7 |
| [scripts/spikes/s17-approve-check.sh](../scripts/spikes/s17-approve-check.sh) | S17: can the job token APPROVE or REQUEST_CHANGES (sandbox) | Phase 4 |
| [scripts/spikes/s17-token-scope.sh](../scripts/spikes/s17-token-scope.sh) | S17: job token permission sets against comments, reviews, checks, statuses | Phase 4 |
| [scripts/spikes/s1-installer.sh](../scripts/spikes/s1-installer.sh) | S1: installer inspection script | Phase 0 |
| [scripts/spikes/s2-s5-readonly.sh](../scripts/spikes/s2-s5-readonly.sh) | S2/S5: non-interactive flags and read-only enforcement | Phase 0 |
| [scripts/spikes/s3-custom-mode.sh](../scripts/spikes/s3-custom-mode.sh) | S3: custom mode YAML and --chat-mode | Phase 0 |
| [scripts/spikes/s4-s14-trusted-folders.sh](../scripts/spikes/s4-s14-trusted-folders.sh) | S4/S14: trusted folders, AGENTS.md canary, .env | Phase 0 |
| [scripts/spikes/s6-s7-errors-usage.sh](../scripts/spikes/s6-s7-errors-usage.sh) | S6/S7: error exit codes and usage/cost reporting | Phase 0 |
| [scripts/spikes/s8-file-stdin.sh](../scripts/spikes/s8-file-stdin.sh) | S8: file references outside workspace and large stdin | Phase 0 |
| results/ | Recorded spike, test, eval, drill and cost outputs | Ongoing |
