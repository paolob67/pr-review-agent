# Phase 7: Operational hardening and cost reconciliation

## Goal

Prove the system can be operated: keys rotated, kill switch used, caps enforced, costs reconciled
and the whole thing torn down and rebuilt from the documentation alone.

## Prerequisites

- Phase 6 gate met.
- Optional, for S16: someone who can open Bobalytics (the IBM Bob analytics dashboard, enterprise
  plans) for the workspace the Bob key belongs to. See the plain explanation in
  [STATUS.md](../STATUS.md#about-bobalytics-s16-in-plain-terms). Without it, step 4 is skipped
  and the article reports unreconciled estimates.

## Inputs to read

[PLAN.md](../PLAN.md) G10, G14, G20, G25, G26, G37, S16; [CONTRACTS.md](../CONTRACTS.md)
sections 2, 6, 7; draft `SETUP.md` and `RUNBOOK.md`; all earlier results.

## Do

1. Drills, each with the exact commands used, the time taken and what broke, recorded in
   `docs/results/phase-7-drills.md` and folded into `docs/RUNBOOK.md`:
   - Rotate the Bob key (create new, update the `bob-review` environment secret, verify, revoke old).
   - Rotate the comment token if a dedicated bot is used (not needed with `GITHUB_TOKEN`).
   - Kill switch: set `BOB_REVIEW_ENABLED` to false; show no review and no cost.
   - Cap drill: exceed the per-PR cap; show the quiet or short-note behaviour.
   - Incident drill: a leaked Bob key; revoke it, check the Bob usage and the workflow run history for abuse.
2. Cost: aggregate all cost records from earlier phases (audit logs plus comments) into
   `docs/results/cost-summary.md`: per run and per PR distributions, runner minutes per run
   (from the workflow run timing), Bob usage reported or estimated.
3. Verify the estimator against reported usage if S7 allowed any reported figure.
4. If Bobalytics access exists: ask the person with access to read, for the days of the live runs,
   the Bobcoin spend for the workspace, and whether the Bob key's usage is visible or separable;
   record the answer (S16). Compare the daily totals with the sum of the cost records and state the
   gap. Mention the privacy trade-off in the doc (telemetry must be enabled for enterprise users to
   appear in Bobalytics; team views anonymise users).
5. Rebuild test: run the teardown steps from `RUNBOOK.md`, then follow only `SETUP.md` to recreate, then run one
   end-to-end review. Fix every doc gap found.
6. Check artifact retention and cleanup (G26) with real numbers.

## Do not

- Do not skip the rebuild-from-docs test; it is the main check of the docs.
- Do not keep old keys active after a rotation drill.

## Budget

At most 20 workflow runs for the drills. Cost summary uses existing records.

## Deliverables

`docs/results/phase-7-drills.md`, `docs/results/cost-summary.md`, updated `RUNBOOK.md` and
`SETUP.md`, `reviewer/config/` rates, STATUS.md (S16 answered or marked not available), INDEX.md.

## Acceptance (gate)

- Each drill recorded and the runbook matches what was done.
- A per-PR cost statement with its stated accuracy exists.
- Rebuild from docs succeeded with no undocumented step.

## Report back

Drill findings, cost figures and their reliability, doc fixes.
