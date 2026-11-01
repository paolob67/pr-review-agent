# Cost summary

Date: 2026-11-01. Bob Shell 2.0.9. Source: every `bob-review.yml` run in the sandbox (`paolob67/notes-sandbox`)
from 2026-10-31 to 2026-11-01, 269 workflow runs, collected by
[`scripts/dev/collect-cost-data.mjs`](../../scripts/dev/collect-cost-data.mjs) into
[`cost-data.json`](cost-data.json) and summarised by
[`scripts/dev/summarise-cost.mjs`](../../scripts/dev/summarise-cost.mjs) (both read-only, offline after the
collection). The cost records come from the `audit` artifact of each run (126 retained at collection time,
14 days) and from the `result` artifacts of cancelled runs
([`cost-data-cancelled.json`](cost-data-cancelled.json)). Units: Bobcoins as reported by Bob
(`stats.session_costs`), never converted to currency ([ADR 0011](../adr/0011-bobcoins-as-usage-unit.md)).

## Accuracy statement (the per-PR cost statement)

A review of a pull request costs **about 0.02 Bobcoins** (median 0.018, 90th percentile 0.041, maximum 0.061 per
review) and **3 runner minutes** of GitHub-hosted Linux time, taking about 80 seconds from start to comment.
This is a sandbox figure from small synthetic diffs (prompts of 9.6 to 10.5 KB), not a prediction for real
pull requests.

How far to trust it:

| Figure | Accuracy | Why |
|---|---|---|
| Bobcoins per review | **Reported by Bob, unit not verified.** Precise to the digits Bob returns, but not reconciled against any Bob dashboard or invoice | Bobalytics is not available in the portal (S16). The account total the owner read on 2026-11-01 (95.58 Bobcoins) mixes local use and the reviewer and cannot be split, so it neither confirms nor contradicts the per-review figures |
| Runner minutes | **Derived, an estimate of billed minutes.** Job durations from the workflow API, each job rounded up to a whole minute | The cost record's `compute.runner_minutes` is null in all 114 records with a cost; the per-job rounding rule is quoted from [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing) ("rounds the minutes and partial minutes each job uses up to the nearest whole minute"), not measured on a bill |
| Cost of cancelled work | **Measured, a lower bound** | 29 Bob calls inside cancelled `review` jobs have no audit record; their cost was read from the retained `result` artifacts. Calls killed mid-flight leave nothing to read |
| Dollar cost | **Not computed** | The project reports Bobcoins and minutes only (ADR 0011, ADR 0001); the GitHub rate for a standard Linux 2-core runner is $0.006 per minute on the same pricing page, which would make 3 minutes about $0.018, but this project does not convert |

## 1. Run population

| Conclusion of the workflow run | Count | What it is |
|---|---|---|
| success | 134 | 126 with an audit record (106 reviewed, 11 `skipped_gate`, 5 `bob_unavailable`, 3 `publish_failed`, 1 `skipped_stale`) and 8 without |
| cancelled | 99 | `prepare` passed, then the `review` job was cancelled by a newer trigger for the same PR (per-job concurrency, G11) |
| skipped | 34 | kill switch off or trigger not eligible; no job ran |
| failure | 2 | Phase 4 defects, fixed then (silent Bob failure, push-triggered run) |

`bob_unavailable` (5): the designed timeout and invalid-key cases (c12, c13), two Phase 4 runs, and the revoked-key
drill. `publish_failed` (3): the three Phase 4 runs before the publish fix. The Phase 6 red-team and eval runs make
up most of the 106 reviews.

## 2. Bobcoins

| Measure | n | min | p50 | p90 | max | mean | sum |
|---|---|---|---|---|---|---|---|
| Per reviewed run | 106 | 0.0144 | 0.0183 | 0.0413 | 0.0615 | 0.0223 | 2.3582 |
| Per PR (all reviews of one PR) | 97 | 0.0144 | 0.0178 | 0.0422 | 0.2043 | 0.0250 | 2.4206 |

Reported by Bob across audit records: 2.4206 Bobcoins over 109 calls (106 reviewed plus 3 whose outcome was not
`reviewed` but still reported a figure). By day: 2026-10-31 0.4516 (20 calls), 2026-11-01 1.9690 (89 calls).

Per PR, 94 of 97 PRs had one review, 2 had three (the cap) and PR 1 (the Phase 4 PR, reused as the drill PR) had
9 reviews and 0.2043 Bobcoins, the per-PR maximum. The per-PR cap of 3 (G14) is a soft limit; see the drills file.

## 3. Time

| Measure (reviewed runs, n = 106) | min | p50 | p90 | max | mean |
|---|---|---|---|---|---|
| Pipeline seconds (`duration_seconds.total`) | 8.1 | 14.5 | 19.0 | 40.8 | 15.4 |
| Of which Bob (`duration_seconds.bob`) | 4.3 | 10.7 | 14.6 | 36.7 | 11.3 |

| Job (successful) | n | min s | p50 s | p90 s | max s | mean s |
|---|---|---|---|---|---|---|
| prepare | 233 | 7 | 11 | 12 | 24 | 10.6 |
| review | 114 | 35 | 46 | 55 | 72 | 47.1 |
| publish | 126 | 6 | 10 | 12 | 21 | 9.9 |

The `review` job is 47 s on average, but Bob itself is 11 s of that. The rest is the per-run image build
(about 25 s, S20) and container start, so the job cost is dominated by building the reviewer, not by Bob.

## 4. Runner minutes

Each job rounded up to a whole minute, summed per workflow run (skipped jobs counted as 0, an assumption).

| Population | Runs | Billed minutes | Per run |
|---|---|---|---|
| Reviewed runs | 106 | 322 | 3 (min 3, max 4) |
| All 269 runs | 269 | 604 | mean 2.25 (p50 2, p90 3, max 7) |
| Cancelled runs | 99 | 223 | 2.25 |
| Runs with an audit record, not reviewed | 20 | 49 | about 2.5 |

**Rounding dominates.** A reviewed run uses about 68 seconds of job time (means: prepare 10.6 + review 47.1 +
publish 9.9) in three jobs, but is billed as three jobs of at least one minute each: 3 minutes. Cancelled runs
account for 223 of the 604 minutes (37 per cent): the work is thrown away but the minutes are counted here, on
the strength of GitHub's example that a run failing after 5 minutes costs 5 minutes
([GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)).
That page covers a failed run; it does not say how a cancelled job is billed, so billing cancelled jobs for the
time they ran is an inference, not a documented statement.

Public repositories: standard hosted runners are free; private repositories draw on the included compute usage,
which is expressed in money, not minutes (same page). The sandbox is private.

## 5. Estimator check (item 3 of the brief)

S7 allowed a reported figure, so there is no estimator to verify: Bob reports `session_costs` directly. The test
possible is whether the reported figure is predictable from the inputs the cost record already holds.

| Pair | n | Pearson r |
|---|---|---|
| prompt bytes vs Bobcoins | 106 | 0.03 |
| output bytes vs Bobcoins | 106 | 0.14 |

Neither correlates. Prompt size has almost no spread in this data (9.6 to 10.5 KB, because the base prompt and
rules are most of it), so the test cannot say whether large diffs cost more. This is a limit of the sandbox data,
not evidence that cost is independent of size. A model of cost from sizes should not be built from it; the
reported figure is the cost record.

## 6. Reconciliation with the account total (S16)

Bobalytics is not available in the portal (owner, 2026-11-01). The owner read an account total instead:
**95.58 Bobcoins spent on 2026-11-01**, covering both the reviewer's calls and the owner's local Bob use for this
project.

| Source | 2026-11-01 |
|---|---|
| Reviewer, audit records (89 calls) | 1.97 |
| Reviewer, cancelled runs not in audit (24 calls) | 0.57 |
| Reviewer total | **2.54** |
| Account total (owner) | 95.58 |
| Difference | 93.04, not attributable |

The reviewer is 2.7 per cent of the account's day. The remaining 97 per cent is local use of Bob in this
workspace (planning and coding sessions) that is not recorded anywhere in this repository. So the figures
cannot be reconciled: the two numbers are consistent (the reviewer total is far below the account total) but
the check is too loose to detect an error of even several times in the reviewer figures. S16 is therefore
**not available**: no per-key or per-day split exists. The article must say "reported by Bob, unreconciled".

What would close it: a dedicated Bob account or workspace used only by the reviewer (the "dedicated Bob user or
team" in PLAN section 10), so that the account total equals the reviewer total for a day.

## 7. Cost that no record shows: cancelled reviews

Phase 5 recorded that a cancelled review "may already have called Bob; its cost has no record (unverified)".
Measured now:

| | Count | Bobcoins |
|---|---|---|
| Review jobs cancelled by a newer trigger | 99 | |
| of which the Bob step had finished and a `result` artifact exists | 31 | |
| of those, with a reported cost | 29 | 0.6857 (mean 0.0236) |
| of those, with no cost (Bob failed or no figure; one is the invalid-key case c13) | 2 | none |
| of which no `result` artifact exists (cancelled before the Bob step finished) | 68 | none readable |
| Total reviewer spend including cancelled Bob calls | | **3.106** (2.4206 + 0.6857) |

Limit of this count: the `result` artifact lives one day, so it was readable for every cancelled run still
retained on 2026-11-01. A cancelled job that was killed mid-Bob-call may have been billed by Bob without leaving
a result; that cost cannot be seen and the 3.106 is a lower bound.

So the audit-record total understated spend by 22 per cent (0.69 of 3.11). Two causes: the second firing of two
required workflows cancels the first review job (ADR 0015), and the Phase 6 batch drivers opened many PRs at
once, some of which were re-triggered. Six of the 99 cancelled review jobs ran about 300 seconds with no step
recorded; their cause is not known (see the open question below).

Why it matters: the cost record is written only by `publish`, and `publish` does not run for a cancelled
review (`needs.review.result != 'cancelled'`), so the cost of a Bob call that finished inside a cancelled job is
never recorded. The fix is not obvious: recording from `review` would put a write path into the job that holds
the Bob key (against G2 and G25). Cheaper alternatives are to reduce the cause (require one workflow, or wait
in `prepare`) or to accept the gap and state it. Not changed in this phase.

## 8. Open questions

1. **Six cancelled `review` jobs lasted about 300 s** (runs `41295243003`, `41296659318`, `41296732235`,
   `41297594939`, `41297708275`, `41299807396`) and show no steps. They are not explained by the per-PR
   concurrency (a cancelled job that had not started would be near 0 s). Possible but unverified: the jobs waited for
   environment approval or a runner and were cancelled by a newer trigger. They have no Bob result and cost no
   Bobcoins that can be read.
2. **Three review jobs from `pull_request_target` carry a deployment ref that is a PR branch**, while the
   environment is limited to `main` (see [phase-7-drills.md](phase-7-drills.md) section 4). Unverified; needs a probe.
3. **`compute.runner_minutes` is never filled.** Either fill it from the workflow API after the run (a fourth
   step needing `actions: read`) or drop the field and say minutes come from the run timing. Not decided.

## 9. Rates

Task brief item "`reviewer/config/` rates": none added. [ADR 0011](../adr/0011-bobcoins-as-usage-unit.md) records
usage in Bobcoins with no currency conversion, and ADR 0001 records compute as runner minutes. A rate table
would reintroduce a conversion that the ADRs rejected, and the only price available (GitHub, $0.006 per minute) is
quoted above for orientation only. Recorded as a deliberate deviation from the brief.
