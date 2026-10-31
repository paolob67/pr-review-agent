# Project Status

Update this file at the end of every task. Newest information first within each section.

Last updated: 2026-10-31. Phases 0 to 3 complete. Phase 4 (runner foundation) Part A is DONE; Part B is
waiting for the owner (see Current blockers). Execution environment: GitHub-hosted runners
([ADR 0001](adr/0001-execution-environment.md)).

## Phase tracker

| Phase | Brief | Status | Gate met | Owner input needed before starting |
|---|---|---|---|---|
| 0. Spikes against local Bob | [phase-0-spikes.md](tasks/phase-0-spikes.md) | Done | Yes | n/a |
| 1. Threat model, ADRs, architecture freeze | [phase-1-design-freeze.md](tasks/phase-1-design-freeze.md) | Done | Yes | n/a (Sign-off complete) |
| 2. Reviewer core with offline tests | [phase-2-reviewer-core.md](tasks/phase-2-reviewer-core.md) | Done | Yes | n/a |
| 3. Real Bob integration (local) | [phase-3-real-bob.md](tasks/phase-3-real-bob.md) | Done | Yes | n/a (key, 30 Bobcoin budget, rules direction and data consent supplied) |
| 4. Runner foundation (container, stage split, secrets wiring) | [phase-4-runner-foundation.md](tasks/phase-4-runner-foundation.md) | Part A done, Part B waiting for owner | No (Part B open) | GitHub plan and visibility of the sandbox repo, permission to create environment/secret/variables, Bob key entered by the owner, S20 and S17 decisions; see Current blockers |
| 5. GitHub trigger and end-to-end matrix | [phase-5-github-trigger.md](tasks/phase-5-github-trigger.md) | Not started | No | Sandbox GitHub repo, second account, bot account |
| 6. Red team and quality evals | [phase-6-redteam-evals.md](tasks/phase-6-redteam-evals.md) | Not started | No | Eval and red-team run budget |
| 7. Operational hardening and cost reconciliation | [phase-7-hardening.md](tasks/phase-7-hardening.md) | Not started | No | Optional: Bobalytics access (see below) |
| 8. Documentation, article, final validation | [phase-8-docs-article.md](tasks/phase-8-docs-article.md) | Not started | No | Confirm LinkedIn article length |

Status values: Not started, In progress, Blocked (say why), Done (gate met, results recorded).

## Current blockers

**Phase 4 Part B needs the owner (2026-10-31).** Part A is complete and recorded in
[results/phase-4-container.md](results/phase-4-container.md): image built on a clean podman store, S11 canary
13 of 13 under the hardened flags, `make test` (227), `make lint` and `make mutation` (52 of 52) green.
Part B creates GitHub resources and uses Bob, so it does not start until the owner supplies:

1. The sandbox repo and its GitHub plan and visibility (decides S18: environment secrets need a paid plan
   on private repos).
2. Permission to create the `bob-review` environment, one secret and the repo variables there.
3. The Bob key, entered by the owner with `gh secret set BOB_API_KEY --env bob-review` (the agent never
   reads, prints or stores it).
4. Decisions on S20 (how reviewer code and image reach the jobs) and S17 (comment identity; default is
   `github-actions[bot]`).
5. Confirmation that `gh` is logged in with rights on the sandbox repo (login state not yet checked).

Local tooling note: podman needed a reset on 2026-10-31 (empty `/etc/subuid` in the VM, stale overlay temp
dirs). Details and the fix are in [results/phase-4-container.md](results/phase-4-container.md) section 1.
When run from the agent's shell the podman VM must be started detached or it stops when the command ends.
`podman image prune` clears the `<none>` images each rebuild leaves behind.

Open follow-ups for the owner (none block Part B beyond the above):

1. **Verify the usage unit.** Compare the Bobcoin balance (or Bobalytics) with the Phase 3 ledger total
   of 0.9428 (21 calls). Until then `session_costs` is "reported by Bob, unit unverified" (ADR 0011).
2. **The Bob key has no spending limit set by this project.** With no daily cap (ADR 0009), the Bobcoin
   budget on the account is the only ceiling. Confirm who watches it.
3. The key in `pr-review-agent.json` expires 2026-12-30. Part B puts it into a GitHub environment secret;
   do not paste it anywhere else.

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
| S11 | Local pass 2026-10-31, runner open | Podman 6.0.0 arm64: canary 13 of 13 ([results](results/phase-4-container.md#3-s11-uid-split-under-the-hardened-flags)); Docker on the runner is Part B |
| S12 | Withdrawn | Not applicable to the GitHub-hosted runner design. |
| S13 | Answered 2026-10-30 | Portal confirmed: Bob subscription region is `Global`. Compute on GitHub-hosted runners (location not selectable); egress to Global. |
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
| 2026-10-31 | 4 (Part A) | Part A complete. Podman pruned and reset at the owner's request (25 images and 1 unrelated volume removed; two VM faults fixed: stale overlay temp dirs, empty `/etc/subuid`). Image rebuilt from scratch on `ubuntu:24.04` (pinned digest), Node 22.23.4, Bob 2.0.9, uid 10002 for Bob; manifest digest `sha256:0d0a9f44...d6adb`, 443 MB. S11 canary passes 13 of 13 under read-only rootfs, caps dropped, no-new-privileges. Verified existing stage subcommands, cost record change, workflow and policy check: 227 tests, lint, 52 of 52 mutations. No Bob calls (0 of 5), no GitHub resources. | [results/phase-4-container.md](results/phase-4-container.md) |
| 2026-10-30 | 4 (prep) | Sandbox app written in `examples/sandbox-repo/` (in-memory notes API, 3 passing tests, CI workflow, sample `.bob-review/` rules). `scripts/dev/publish-sandbox.sh <owner>/<repo>` publishes it as a private repo and opens one PR with seeded flaws. Not run: `gh` and `ibmcloud` are not logged in. Phase 4 itself not started. | n/a |
| 2026-10-30 | 3 | Phase 3 real Bob integration complete. Real Bob 2.0.9 through the full pipeline against a mock GitHub: 20 pipeline runs over 9 fixtures plus 2 gate-skipped, all schema-valid first time, expected rules and lines cited; 21 Bob calls, 0.9428 Bobcoins reported (unit unverified). One prompt change (proposed_fix is code only: prose blocks 12 of 31 to 0 of 29). Hostile-parent check passed with a positive control. 187 offline tests, lint, 39 of 39 mutations killed. | [results/phase-3-runs.md](results/phase-3-runs.md) |
| 2026-10-30 | 2 | Phase 2 reviewer core complete. 18 modules in reviewer/src/, fake-bob shim, mock GitHub server, 14 unit test files, 1 pipeline test file. 180 tests pass, 0 failures; make lint passes. Real mutation check: 39 of 39 guardrail mutations killed (an earlier placeholder table that only re-ran the tests was replaced; the first real run found 6 test gaps and 3 bugs, all fixed). Daily caps dropped (ADR 0009); scratch layout aligned (ADR 0010). No live calls made. | [results/phase-2-results.md](results/phase-2-results.md) |
| 2026-10-30 | 1 | Phase 1 design freeze complete. THREAT_MODEL.md (G1-G37 mapped), ARCHITECTURE.md, draw.io trust-boundary diagram exported, ADRs 0002-0008, CONTRACTS.md frozen, sign-off record generated. S13 answered (Global). S15 analyzed on paper. | [results/phase-1-signoff.md](results/phase-1-signoff.md) |
| 2026-10-30 | 0 | Phase 0 spikes complete. ~28 Bob calls total. Bob upgraded 1.0.4->1.0.6->2.0.9. v2 breaking changes found and re-probed (BOB_API_KEY, --disable-tool-groups, --workspace, bob run). Gate decisions updated for v2. S10 and S13 unresolved. | [results/spikes.md](results/spikes.md) |
| Planning | n/a | Plan, ADR 0001, architecture diagram, contracts, task briefs written | n/a |
