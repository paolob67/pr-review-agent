# Project Status

Update this file at the end of every task. Newest information first within each section.

Last updated: 2026-10-31. Phases 0 to 5 complete (Phase 5: 13 of 13 same-repo matrix cases pass; the fork,
outside-contributor and required-approval cases are owner-accepted deviations, see Current blockers). Execution environment: GitHub-hosted runners
([ADR 0001](adr/0001-execution-environment.md)).

## Phase tracker

| Phase | Brief | Status | Gate met | Owner input needed before starting |
|---|---|---|---|---|
| 0. Spikes against local Bob | [phase-0-spikes.md](tasks/phase-0-spikes.md) | Done | Yes | n/a |
| 1. Threat model, ADRs, architecture freeze | [phase-1-design-freeze.md](tasks/phase-1-design-freeze.md) | Done | Yes | n/a (Sign-off complete) |
| 2. Reviewer core with offline tests | [phase-2-reviewer-core.md](tasks/phase-2-reviewer-core.md) | Done | Yes | n/a |
| 3. Real Bob integration (local) | [phase-3-real-bob.md](tasks/phase-3-real-bob.md) | Done | Yes | n/a (key, 30 Bobcoin budget, rules direction and data consent supplied) |
| 4. Runner foundation (container, stage split, secrets wiring) | [phase-4-runner-foundation.md](tasks/phase-4-runner-foundation.md) | Done | Yes (teardown proved by listing, then recreated) | n/a |
| 5. GitHub trigger and end-to-end matrix | [phase-5-github-trigger.md](tasks/phase-5-github-trigger.md) | Done | Yes, with owner-accepted deviations | Second GitHub account (fork and outside-contributor cases, S15 fork payload); optional |
| 6. Red team and quality evals | [phase-6-redteam-evals.md](tasks/phase-6-redteam-evals.md) | Not started | No | Eval and red-team run budget |
| 7. Operational hardening and cost reconciliation | [phase-7-hardening.md](tasks/phase-7-hardening.md) | Not started | No | Optional: Bobalytics access (see below) |
| 8. Documentation, article, final validation | [phase-8-docs-article.md](tasks/phase-8-docs-article.md) | Not started | No | Confirm LinkedIn article length |

Status values: Not started, In progress, Blocked (say why), Done (gate met, results recorded).

## Current blockers

**Phase 5 is complete (2026-10-31).** The `workflow_run` and `ai-review` label triggers work end to end:
13 of 13 same-repo matrix cases pass ([results/phase-5-github.md](results/phase-5-github.md)), lint, actionlint,
zizmor (3 accepted findings) and 64 of 64 mutations are clean, 263 offline tests pass, no workflow checks out
PR code. The recreated Bob key authenticates (proven by c01 and by the c13 restore). The sandbox is left with
the kill switch `false`, no open test PRs (PR 1 from Phase 4 stays), and the Bob key restored.

Owner decisions needed:

1. **Fork and outside-contributor cases (owner-accepted deviation, 2026-10-31).** No second GitHub account
   yet, so the fork PR, outside-contributor with and without the label, and the S15 fork payload were not run.
   They are covered offline only. Provide a second account (and a public sandbox or an invited collaborator
   with no write rights) to close them; the driver would gain the cases then.
2. **Run budget exceeded.** The brief allowed about 40 workflow runs; 57 `bob-review` runs were used
   (two required workflows give two firings per head, and the driver was corrected and rerun). Accept, or
   reduce `BOB_REVIEW_REQUIRED_WORKFLOWS` to one workflow to halve firings. 15 reviews cost 0.3448 Bobcoins.
3. **Accept the measured gap in G34 (informational, unchanged).** With `pull-requests: write` (ADR 0014)
   APPROVE is refused (HTTP 422, repeated in Phase 5) but REQUEST_CHANGES succeeds. The workflow never calls
   that endpoint. "Does not satisfy a required approval rule" could not be tested: branch protection is
   unavailable on the owner's plan (HTTP 403). A dedicated comment-only bot (ADR 0008) would close the gap.
4. **Verify the usage unit.** Compare the Bobcoin balance (or Bobalytics) with the Phase 3 ledger total of
   0.9428 (21 calls) plus Phase 4 and 5 runs. Until then `session_costs` is "reported by Bob, unit unverified" (ADR 0011).
5. **The Bob key has no spending limit set by this project** (ADR 0009); the account Bobcoin budget is the only
   ceiling. Confirm who watches it.
6. **Bob key expiry.** The key in `pr-review-agent.json` expires 2026-12-30. It is stored as the GitHub
   environment secret `BOB_API_KEY` (re-entered by `setup-sandbox.sh`); do not paste it anywhere else.


Local tooling note: podman needed a reset on 2026-10-31 (empty `/etc/subuid` in the VM, stale overlay temp
dirs). Details and the fix are in [results/phase-4-container.md](results/phase-4-container.md) section 1.
When run from the agent's shell the podman VM must be started detached or it stops when the command ends.
`podman image prune` clears the `<none>` images each rebuild leaves behind.

Open follow-ups for the owner (none block Phase 5 beyond the above):

1. **Verify the usage unit.** Compare the Bobcoin balance (or Bobalytics) with the Phase 3 ledger total
   of 0.9428 (21 calls). Until then `session_costs` is "reported by Bob, unit unverified" (ADR 0011).
2. **The Bob key has no spending limit set by this project.** With no daily cap (ADR 0009), the Bobcoin
   budget on the account is the only ceiling. Confirm who watches it.
3. **Bob key expiry.** The key in `pr-review-agent.json` expires 2026-12-30. It is stored as the
   GitHub environment secret `BOB_API_KEY` (re-entered by `setup-sandbox.sh`); do not paste it anywhere else.

## Decisions log

| Date | Decision | Where recorded |
|---|---|---|
| 2026-10-30 | Role-based author policy and maintainer label gate | [ADR 0002](adr/0002-author-and-fork-policy.md) |
| 2026-10-30 | Trigger after CI and definition of required CI | [ADR 0003](adr/0003-trigger-after-ci.md) |
| 2026-10-30 | Findings contract, schema validation, single upsert comment format | [ADR 0004](adr/0004-findings-contract-and-comment-format.md) |
| 2026-10-30 | Base-branch loading of team rules and standards via API | [ADR 0005](adr/0005-rules-location-and-base-branch-loading.md) |
| 2026-10-30 | In-container isolation: scrubbed env, read-only tools, synthetic scratch | [ADR 0006](adr/0006-in-container-isolation.md) |
| 2026-10-30 | Cost record schema, per-PR run cap (3) | [ADR 0007](adr/0007-cost-record-and-cap-semantics.md) |
| 2026-10-30 | Daily run and spend caps dropped (stateless job) | [ADR 0009](adr/0009-drop-daily-caps.md) |
| 2026-10-30 | Prompt, rules and diff on stdin; scratch holds only the mode file | [ADR 0010](adr/0010-scratch-layout-stdin.md) |
| 2026-10-30 | Usage recorded in Bobcoins, no currency conversion; Phase 3 budget 30 Bobcoins | [ADR 0011](adr/0011-bobcoins-as-usage-unit.md) |
| 2026-10-31 | Trigger design: PR resolved from the head SHA, required workflows (G31), `ai-review` label overrides the author policy, per-job concurrency | [ADR 0015](adr/0015-trigger-design.md) |
| 2026-10-31 | The publish token has `pull-requests: write`; G34 held by allowlist, check and repo setting | [ADR 0014](adr/0014-publish-token-pull-requests-write.md) |
| 2026-10-31 | Pass `--accept-license` on every non-interactive Bob run | [ADR 0013](adr/0013-bob-license-acceptance.md) |
| 2026-10-30 | SCM identity: dedicated bot account, comment-only scope, non-blocking | [ADR 0008](adr/0008-scm-identity-for-comments.md) |
| Planning | Bob Shell runs on GitHub-hosted runners, three jobs with separate credentials | [ADR 0001](adr/0001-execution-environment.md) |
| Planning | GitHub Actions is the only CI system; review starts after required CI is green | [PLAN.md](PLAN.md) section 3 |
| Planning | GitHub environment secrets, default branch only | [PLAN.md](PLAN.md) section 10 |
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
| S11 | Local pass 2026-10-31; runner: Bob ran as uid 10002 on the runner (exit 0) | Podman 6.0.0 arm64: canary 13 of 13 ([results](results/phase-4-container.md#3-s11-uid-split-under-the-hardened-flags)); the runner canary itself not yet run |
| S12 | Withdrawn | Not applicable to the GitHub-hosted runner design. |
| S13 | Answered 2026-10-30 | Portal confirmed: Bob subscription region is `Global`. Compute on GitHub-hosted runners (location not selectable); egress to Global. |
| S14 | Answered 2026-10-30 | [spikes.md S14](results/spikes.md#s14-settings-format-useagentrules-env-loading-tool-approvals) |
| S15 | Answered 2026-10-31 for same-repo PRs; fork payload unverified | [phase-5-github.md](results/phase-5-github.md#s15-answers) |
| S16 | Open, optional | Phase 7 |
| S17 | Answered 2026-10-31, contradicts the plan; owner accepted `pull-requests: write` (ADR 0014) | [phase-4-runner.md](results/phase-4-runner.md#s17-comment-identity-and-token-scope-contradicts-the-plan) |
| S18 | Answered 2026-10-31 | Environment secrets available on the private repo ([phase-4-runner.md](results/phase-4-runner.md#s18-environment-secrets-on-the-owners-plan)) |
| S19 | Answered 2026-10-31 | Runner reaches Bob; `BOB_API_KEY` ([phase-4-runner.md](results/phase-4-runner.md#s19-runner-reaches-bob-variable-name)) |
| S20 | Partly answered 2026-10-31 | Per-run build works; artifacts pass between the three jobs (Phase 5 runs); cross-repo delivery decided in Phase 8 ([phase-4-runner.md](results/phase-4-runner.md#s20-delivery-route)) |

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
| 2026-10-31 | 5 | Trigger script `resolve-trigger.mjs`, `workflow_run` (CI, Lint) and `ai-review` label triggers, per-job concurrency, ADR 0015; e2e matrix driver `tests/e2e/matrix.mjs` with 13 cases, all passing; S17 re-checked (APPROVE 422, REQUEST_CHANGES 200); S15 answered for same-repo PRs; 57 runs (budget about 40), 0.3448 Bobcoins for 15 reviews. Fork, outside-contributor and required-approval cases are owner-accepted deviations. Offline: 263 tests, 64 of 64 mutations killed, lint, actionlint, zizmor clean | [phase-5-github.md](results/phase-5-github.md) |
| 2026-10-31 | 4 (close) | Teardown run and proved by listing (environment, secret, variables, reviewer files gone; only CI remains). `scripts/dev/setup-sandbox.sh` recreated the environment, variables and secret (key piped from `pr-review-agent.json` on stdin) and reinstalled the reviewer at sandbox commit `7e891b9`. The recreated secret is not yet proven to authenticate (needs a Bob call, budget spent). Phase 5 and 7 briefs, RUNBOOK and SETUP now say the key is re-entered after teardown. Phase 4 closed. | [results/phase-4-runner.md](results/phase-4-runner.md) |
| 2026-10-31 | 4 (Part B) | Environment `bob-review` (main only), two variables, owner-set secret, reviewer installed in the sandbox. 10 of 10 runs used. Six defects found by live runs and fixed with tests (license flag, read-only `~/.bob`, push-triggered `workflow_run`, silent Bob failure, opaque 403, rejected input turning the run red). S17: the job token needs `pull-requests: write` to comment (owner accepted, ADR 0014); APPROVE refused, REQUEST_CHANGES accepted in a probe. One comment posted, second run updated it, stale SHA and bad input are quiet, no secret in logs or artifacts. SETUP.md and RUNBOOK.md drafted. 235 tests, lint, 52 of 52 mutations. Open: teardown proof, runner canary run. | [results/phase-4-runner.md](results/phase-4-runner.md) |
| 2026-10-31 | 4 (Part A) | Part A complete. Podman pruned and reset at the owner's request (25 images and 1 unrelated volume removed; two VM faults fixed: stale overlay temp dirs, empty `/etc/subuid`). Image rebuilt from scratch on `ubuntu:24.04` (pinned digest), Node 22.23.4, Bob 2.0.9, uid 10002 for Bob; manifest digest `sha256:0d0a9f44...d6adb`, 443 MB. S11 canary passes 13 of 13 under read-only rootfs, caps dropped, no-new-privileges. Verified existing stage subcommands, cost record change, workflow and policy check: 227 tests, lint, 52 of 52 mutations. No Bob calls (0 of 5), no GitHub resources. | [results/phase-4-container.md](results/phase-4-container.md) |
| 2026-10-30 | 4 (prep) | Sandbox app written in `examples/sandbox-repo/` (in-memory notes API, 3 passing tests, CI workflow, sample `.bob-review/` rules). `scripts/dev/publish-sandbox.sh <owner>/<repo>` publishes it as a private repo and opens one PR with seeded flaws. Not run: `gh` was not logged in. Phase 4 itself not started. | n/a |
| 2026-10-30 | 3 | Phase 3 real Bob integration complete. Real Bob 2.0.9 through the full pipeline against a mock GitHub: 20 pipeline runs over 9 fixtures plus 2 gate-skipped, all schema-valid first time, expected rules and lines cited; 21 Bob calls, 0.9428 Bobcoins reported (unit unverified). One prompt change (proposed_fix is code only: prose blocks 12 of 31 to 0 of 29). Hostile-parent check passed with a positive control. 187 offline tests, lint, 39 of 39 mutations killed. | [results/phase-3-runs.md](results/phase-3-runs.md) |
| 2026-10-30 | 2 | Phase 2 reviewer core complete. 18 modules in reviewer/src/, fake-bob shim, mock GitHub server, 14 unit test files, 1 pipeline test file. 180 tests pass, 0 failures; make lint passes. Real mutation check: 39 of 39 guardrail mutations killed (an earlier placeholder table that only re-ran the tests was replaced; the first real run found 6 test gaps and 3 bugs, all fixed). Daily caps dropped (ADR 0009); scratch layout aligned (ADR 0010). No live calls made. | [results/phase-2-results.md](results/phase-2-results.md) |
| 2026-10-30 | 1 | Phase 1 design freeze complete. THREAT_MODEL.md (G1-G37 mapped), ARCHITECTURE.md, draw.io trust-boundary diagram exported, ADRs 0002-0008, CONTRACTS.md frozen, sign-off record generated. S13 answered (Global). S15 analyzed on paper. | [results/phase-1-signoff.md](results/phase-1-signoff.md) |
| 2026-10-30 | 0 | Phase 0 spikes complete. ~28 Bob calls total. Bob upgraded 1.0.4->1.0.6->2.0.9. v2 breaking changes found and re-probed (BOB_API_KEY, --disable-tool-groups, --workspace, bob run). Gate decisions updated for v2. S10 and S13 unresolved. | [results/spikes.md](results/spikes.md) |
| Planning | n/a | Plan, ADR 0001, architecture diagram, contracts, task briefs written | n/a |
