# Phase 5: GitHub trigger and end-to-end matrix

## Goal

Trigger the three-job review workflow only after the team's CI is green, with all
trigger-side guardrails, and prove the whole path with a scripted end-to-end matrix.

## Prerequisites

- Phase 4 gate met.
- From the owner: the sandbox repository with admin rights for the agent's `gh` session (or the
  owner performs the settings steps listed), a second GitHub account to open fork and
  outside-contributor PRs, optionally a bot account (not a code owner) with a fine-grained token limited to
  the sandbox repo (issues and pull requests comment permission only), needed only if S17 fails
  or the owner wants a named identity, and approval to set environment secrets and variables.
- `gh auth status` works.

## Inputs to read

[PLAN.md](../PLAN.md) section 3 (trigger path), G1, G6 to G12, G24, G25, G31 to G35, S15;
[CONTRACTS.md](../CONTRACTS.md) sections 1 and 2; the ADRs for author policy and trigger;
GitHub docs on `workflow_run`, `pull_request_target`, `concurrency`, permissions, and fork
behaviour; the Phase 4 results.

## Do

1. In `examples/sandbox-repo/` build the sample app (small, any language), its CI workflow
   (build and unit tests, on `pull_request`, no secrets) and the `.bob-review/` rules. Push it to
   the sandbox repository's default branch.
2. In `integrations/github-actions/` extend the review workflow from Phase 4 with the `workflow_run`
   trigger (completed, for the required CI workflows), default-branch definition, no PR checkout,
   per-job permissions as in ADR 0012, concurrency group per PR. Steps: validate inputs
   (G24), resolve the PR from the head SHA through the API, check kill switch (G10), draft, author
   policy (G7), all required workflows green for that SHA (G31), head unchanged, then hand over to the
   `review` job. Put the logic in a script under
   `integrations/github-actions/scripts/` with unit tests under `tests/unit/` so the workflow YAML
   stays thin. Pass values only through `env:` to script arguments, never into shell strings.
3. A second small trigger on `pull_request_target` (`labeled`, label `ai-review`) that runs the
   same prepare logic, no checkout.
4. Pin every action by commit SHA (G22). Lint with actionlint and zizmor if installable; record
   findings and fix them.
5. Configure the sandbox repository: environment, secrets and variables from CONTRACTS section 2,
   the bot account (if any) as a collaborator with minimum rights, branch protection requiring a
   human approval, labels.
6. Resolve S15 with real runs: fork PR payloads, PR resolution from the SHA, behaviour with
   several required workflows and with re-runs, secret availability, hostile branch names and
   artifacts. Record in `docs/results/phase-5-github.md`; if fork PRs cannot work, implement the
   fallback (maintainer label triggers the review) and write the ADR.
7. Scripted end-to-end matrix under `tests/e2e/` (using `gh` against the sandbox) covering: green CI
   same-repo PR; red CI (no review); cancelled CI; two required workflows with one red; fork PR;
   outside contributor without label then with label; draft; oversized diff; push between CI and
   review (stale); two rapid pushes; PR that edits its own `.bob-review/` (old rules used);
   kill switch off; Bob unavailable (invalid key in a test environment secret); timeout (very low limit); the
   bot identity cannot approve and does not satisfy the required-approval rule; markdown from the
   model cannot @mention anyone. Each case records expected and observed result and links to the
   PR.
8. Finish `docs/SETUP.md` (GitHub part) and `docs/TESTING.md` (e2e section).

## Do not

- Do not use `pull_request_target` or `workflow_run` to check out or run PR code, ever.
- Do not give the trigger workflows write permissions.
- Do not make the comment token available to the `review` job, or the Bob key to `prepare` or
  `publish` (ADR 0012).
- Do not leave test PRs open or any token with wider rights than needed.

## Budget

About 40 workflow runs across the matrix. Record cost records for all of them.

## Deliverables

Workflows, scripts, sample repo, `tests/e2e/`, `docs/results/phase-5-github.md` with the matrix
table, SETUP.md and TESTING.md updates, ADRs as needed, STATUS.md, INDEX.md.

## Acceptance (gate)

Every case in the matrix passes or has a documented, owner-accepted deviation. S15 answered. Lint
clean. No workflow checks out PR code. The bot identity has no approval path (shown by the test).

## Report back

Matrix table, S15 answers, fixes made, remaining risks.
