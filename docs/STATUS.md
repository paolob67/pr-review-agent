# Project Status

Update this file at the end of every task. Newest information first within each section.

Last updated: 2026-10-30. Phase 2 complete. Phase 3 requires Bob API key and run budget.

## Phase tracker

| Phase | Brief | Status | Gate met | Owner input needed before starting |
|---|---|---|---|---|
| 0. Spikes against local Bob | [phase-0-spikes.md](tasks/phase-0-spikes.md) | Done | Yes | n/a |
| 1. Threat model, ADRs, architecture freeze | [phase-1-design-freeze.md](tasks/phase-1-design-freeze.md) | Done | Yes | n/a (Sign-off complete) |
| 2. Reviewer core with offline tests | [phase-2-reviewer-core.md](tasks/phase-2-reviewer-core.md) | Done | Yes | n/a |
| 3. Real Bob integration (local) | [phase-3-real-bob.md](tasks/phase-3-real-bob.md) | Not started | No | Bob Inference API key, Bobcoin budget, starter team rules, confirmation that sandbox code may be sent to Bob |
| 4. Code Engine foundation (eu-de) | [phase-4-code-engine.md](tasks/phase-4-code-engine.md) | Not started | No | Pay-as-you-Go IBM Cloud account, confirmed `ibmcloud` login |
| 5. GitHub trigger and end-to-end matrix | [phase-5-github-trigger.md](tasks/phase-5-github-trigger.md) | Not started | No | Sandbox GitHub repo, second account, bot account |
| 6. Red team and quality evals | [phase-6-redteam-evals.md](tasks/phase-6-redteam-evals.md) | Not started | No | Eval and red-team run budget |
| 7. Operational hardening and cost reconciliation | [phase-7-hardening.md](tasks/phase-7-hardening.md) | Not started | No | Optional: Bobalytics access (see below) |
| 8. Documentation, article, final validation | [phase-8-docs-article.md](tasks/phase-8-docs-article.md) | Not started | No | Confirm LinkedIn article length |

Status values: Not started, In progress, Blocked (say why), Done (gate met, results recorded).

## Current blockers

Phase 3 requires: Bob Inference API key, Bobcoin run budget, starter team rules, and owner confirmation
that sandbox PR code may be sent to Bob. Phase 2 gate is met with no blockers.

## Decisions log

| Date | Decision | Where recorded |
|---|---|---|
| 2026-10-30 | Role-based author policy and maintainer label gate | [ADR 0002](adr/0002-author-and-fork-policy.md) |
| 2026-10-30 | Trigger after CI and definition of required CI | [ADR 0003](adr/0003-trigger-after-ci.md) |
| 2026-10-30 | Findings contract, schema validation, single upsert comment format | [ADR 0004](adr/0004-findings-contract-and-comment-format.md) |
| 2026-10-30 | Base-branch loading of team rules and standards via API | [ADR 0005](adr/0005-rules-location-and-base-branch-loading.md) |
| 2026-10-30 | In-container isolation: scrubbed env, read-only tools, synthetic scratch | [ADR 0006](adr/0006-in-container-isolation.md) |
| 2026-10-30 | Cost record schema, per-PR run cap (3), daily caps (30 runs, $10 USD) | [ADR 0007](adr/0007-cost-record-and-cap-semantics.md) |
| 2026-10-30 | SCM identity: dedicated bot account, comment-only scope, non-blocking | [ADR 0008](adr/0008-scm-identity-for-comments.md) |
| Planning | Bob Shell runs as a Code Engine job in `eu-de` from a prebuilt image | [ADR 0001](adr/0001-execution-environment.md) |
| Planning | GitHub Actions is the only CI system; review starts after required CI is green | [PLAN.md](PLAN.md) section 3 |
| Planning | Code Engine secrets are the only secret store | [PLAN.md](PLAN.md) section 10 |
| Planning | Advisory only, AI Assisted label, human decides; per-PR cost recorded | [PLAN.md](PLAN.md) sections 1 and 3 |

## Unknowns tracker

S1 to S16 are defined in [PLAN.md](PLAN.md#5-known-unknowns-to-verify-first). Fill in as they are
answered; link to the entry in `docs/results/`.

| ID | Status | Answer or link |
|---|---|---|
| S1 | Answered 2026-10-30 | [spikes.md S1](results/spikes.md#s1-installer-version-pinning-checksum) |
| S2 | Answered 2026-10-30 | [spikes.md S2](results/spikes.md#s2-non-interactive-flags-and-output-format) |
| S3 | Answered 2026-10-30 | [spikes.md S3](results/spikes.md#s3-custom-mode-delivery-in-non-interactive-mode) |
| S4 | Answered 2026-10-30 | [spikes.md S4](results/spikes.md#s4-trusted-folder-behaviour-non-interactive) |
| S5 | Answered 2026-10-30 | [spikes.md S5](results/spikes.md#s5-disallowed-tool-behaviour-in-non-interactive-mode) |
| S6 | Answered 2026-10-30 | [spikes.md S6](results/spikes.md#s6-exit-codes-and-error-output) |
| S7 | Answered 2026-10-30 | [spikes.md S7](results/spikes.md#s7-token-and-bobcoin-usage-reporting) |
| S8 | Answered 2026-10-30 | [spikes.md S8](results/spikes.md#s8-file-referencing-and-large-stdin) |
| S9 | Answered 2026-10-30 | [spikes.md S9](results/spikes.md#s9-system-dependencies) |
| S10 | Unresolved | Phase 3 empirical test; assume one-at-a-time |
| S11, S12 | Open | Phase 4 |
| S13 | Answered 2026-10-30 | Portal confirmed: Bob subscription region is `Global`. Compute in `eu-de`, egress to Global. |
| S14 | Answered 2026-10-30 | [spikes.md S14](results/spikes.md#s14-settings-format-useagentrules-env-loading-tool-approvals) |
| S15 | Analyzed (paper) | [ARCHITECTURE.md Section 4](ARCHITECTURE.md#4-github-trigger-and-workflow_run-paper-analysis-s15); live test Phase 5 |
| S16 | Open, optional | Phase 7 |

## About Bobalytics (S16), in plain terms

Bobalytics is the IBM Bob analytics dashboard for enterprise plans. The documentation describes it
as showing Bobcoin spend per team and per day, not per pull request. The only reason it appears in
this project is cost reporting: the job writes its own per-PR cost record, and Bobalytics, if the
Bob key used here shows up in it, can be used once, after the live runs in Phase 7, to check that
the daily total of those records is close to what Bob billed. If nobody has access, nothing is
blocked; the article then says the figures are unreconciled estimates. Nothing is needed from the
owner for this before Phase 7.

## Task log

| Date | Phase | Summary | Results link |
|---|---|---|---|
| 2026-10-30 | 2 | Phase 2 reviewer core complete. 14 source modules in reviewer/src/, fake-bob shim, mock GitHub server, 13 unit test files, 1 pipeline test file. 161 tests pass, 0 failures. 23 guardrails covered offline (G2, G3, G7-G9, G13-G20, G24, G27-G29, G32-G37). make test and make lint both pass. Mutation check shows all 20 offline-testable guardrails have covering tests. | [results/phase-2-results.md](results/phase-2-results.md) |
| 2026-10-30 | 1 | Phase 1 design freeze complete. THREAT_MODEL.md (G1-G37 mapped), ARCHITECTURE.md, draw.io trust-boundary diagram exported, ADRs 0002-0008, CONTRACTS.md frozen, sign-off record generated. S13 answered (Global). S15 analyzed on paper. | [results/phase-1-signoff.md](results/phase-1-signoff.md) |
| 2026-10-30 | 0 | Phase 0 spikes complete. ~28 Bob calls total. Bob upgraded 1.0.4->1.0.6->2.0.9. v2 breaking changes found and re-probed (BOB_API_KEY, --disable-tool-groups, --workspace, bob run). Gate decisions updated for v2. S10 and S13 unresolved. | [results/spikes.md](results/spikes.md) |
| Planning | n/a | Plan, ADR 0001, architecture diagram, contracts, task briefs written | n/a |
