# ADR 0015: Trigger design, label override and per-job concurrency

Status: Accepted 2026-10-31 (Phase 5). Refines [ADR 0002](0002-author-and-fork-policy.md) and
[ADR 0003](0003-trigger-after-ci.md). Closes the design part of S15 (live results in
[phase-5-github.md](../results/phase-5-github.md)).

## Context

Phase 5 adds the real triggers. Three facts shaped the design:

1. For a fork pull request the `workflow_run` payload field `pull_requests` is empty (GitHub
   documents this; confirmed live, see the results). The PR must be found from the head SHA through
   the API.
2. A `workflow_run` workflow fires for every completed run of every listed workflow, and each firing
   starts a run. With two required workflows there are two firings per push, and most of them will
   find the other workflow not finished yet.
3. A workflow-level `concurrency` group with `cancel-in-progress: true` lets a run that stops quietly
   (stale SHA, CI still pending) cancel a run that is in the middle of a real review.

## Decision

1. **One trigger script.** `integrations/github-actions/scripts/resolve-trigger.mjs` runs first in
   `prepare` with the read-only token. It validates the event inputs (G24), resolves the PR from the
   head SHA with `GET /commits/{sha}/pulls` (only an open PR of this repository whose head is exactly
   that SHA; none or more than one means no review), and checks every workflow named in
   `BOB_REVIEW_REQUIRED_WORKFLOWS` (G31): the newest `pull_request` run of each must be completed
   and successful for that SHA. An invalid list entry fails closed. When the variable is empty the
   triggering workflow alone is required (ADR 0003).
2. **Not ready is a quiet, green stop.** Pending, red, cancelled or missing CI, a moved head, no open
   PR, an ambiguous PR: the script reports a reason, `prepare` writes no handoff, and nothing else
   runs. The author already sees the CI result.
3. **Label trigger.** `pull_request_target` with `types: [labeled]` and the label `ai-review`
   (the policy check allows nothing else). It runs the same script; the head SHA comes from the API,
   never from the event. It checks out only the base branch (no `ref:`), so no PR code is present.
4. **The label is the maintainer override (G7).** `checkAuthor` passes any pull request that carries
   the `ai-review` label, whatever the author association. Only users with triage rights or above can
   apply a label, so this is the "maintainer applies a label" path of ADR 0002. ADR 0002 named the
   labels `bob-review` and `safe-to-review`; one label, `ai-review`, is used instead (the Phase 5 brief
   and PLAN already used it). The label is not required for team members.
5. **Concurrency per pull request on the jobs that matter (G11).** The `review` job has
   `group: bob-review-run-<pr>` with `cancel-in-progress: true`; the `publish` job has
   `group: bob-review-publish-<pr>` with `cancel-in-progress: false`, so publishes run one after the
   other and an older one cannot overwrite a newer comment. `publish` is skipped when its `review`
   was cancelled. The PR number comes from the trigger script, so fork PRs are covered. There is no
   workflow-level group.
6. **Manual dispatch stays** for operations and tests. It skips the CI check (dispatching needs write
   access) but still passes the reviewer's validation, head pin and gates.
7. **Fork pull requests** run only through this default-branch workflow. They receive no secrets from
   the platform for their own CI; the review job gets the Bob key because the workflow is
   `workflow_run`, started from the default branch, and the fork's code is never checked out or run.
   Whether the author gate lets them in is the label rule above.

## Reasons

1. Resolving the PR from the SHA works for same-repo and fork PRs alike and uses no value that the PR
   author controls except the SHA, which is validated and matched against the API.
2. Counting a quiet stop as success avoids red runs that train people to ignore the workflow.
3. Concurrency on the expensive and the writing jobs gives the properties G11 needs without the
   cancel-the-wrong-run failure.

## Consequences

- Every required CI completion starts a run, so most pushes produce several short runs that stop in
  `prepare` (about 15 seconds each). They cost runner minutes, not Bobcoins.
- `zizmor` reports `dangerous-triggers` and `concurrency-limits` for this workflow; both are accepted
  here with the reasons above in `.github/zizmor.yml`.
- The workflow lists the required workflows twice (the `workflows:` filter and the repository variable);
  adding a required workflow means changing both. Documented in SETUP.md.
- A PR author with write access can still re-run CI, so "green for the SHA" means the newest run at the
  moment of the check.
