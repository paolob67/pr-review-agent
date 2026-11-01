# Bobalytics export (S16)

Date: 2026-11-01. Source: the owner's Bobalytics export `bobalytics_user_2026-10-03_2026-11-01.zip`, two CSV files,
stored unchanged in [`bobalytics/`](bobalytics/). Scope: one user (the owner), 2026-10-03 to 2026-11-01. The files
contain no identity, only daily figures. Meaning of the columns is taken from the headers; the Bob documentation
page `docs/ide/features/bobalytics` (retrieved 2026-11-01 through the Bob docs search) describes team-level KPIs
(adoption, Bob factor, Bobcoin spend, daily spend) and does not describe this export, so any reading beyond the
headers is labelled unverified.

Outcome for S16: **partly available, does not reconcile the reviewer.** A per-user daily spend exists. It does not
cover the days the reviewer ran live, and it cannot be split by API key or by project.

## What the files hold

| File | Columns | Content |
|---|---|---|
| [`user_Days_active.csv`](bobalytics/user_Days_active.csv) | Active days, Total days, Active day rate (%) | 9 active days of 20, 45 per cent |
| [`user_Activity_pattern.csv`](bobalytics/user_Activity_pattern.csv) | Date, Is active, Tasks completed, Spend | 20 rows, one per weekday |

Totals over the 20 rows (computed from the file): spend 359.84, tasks completed 55, active days 9.

## Daily rows from the project period

| Date | Weekday | Is active | Tasks completed | Spend | Project activity on that date |
|---|---|---|---|---|---|
| 2026-10-29 | Thu | 1 | 1 | 24.39 | Before the first commit (git history starts 2026-10-30) |
| 2026-10-30 | Fri | 1 | 36 | 187.49 | Phases 0 to 3 (spikes about 28 Bob calls; Phase 3 ledger 0.9428 Bobcoins, 21 calls) |
| 2026-10-31 | Sat | no row | no row | no row | Phases 4 and 5 live runs; audit records 0.4516 Bobcoins |
| 2026-11-01 | Sun | no row | no row | no row | Phases 6 and 7; owner read 95.58 from the portal; reviewer 2.54 |

## Findings

1. **Weekends are absent.** All 20 dates are Monday to Friday, 10-05 to 10-30 (the Saturdays and Sundays 10-03,
   10-04, 10-10, 10-11, 10-17, 10-18, 10-24, 10-25, 10-31 and 11-01 have no row). The file name range ends
   2026-11-01, but the last row is 2026-10-30. Whether the
   export drops weekends by design or because the owner's weekend use was not captured is unverified. Either way,
   the two days with live reviewer runs (10-31 and 11-01) cannot be read from this export. The 95.58 for 11-01
   from the portal therefore has no counterpart here.
2. **The only project day in the file is 2026-10-30.** Spend 187.49 over 36 completed tasks. The Phase 3 reviewer
   ledger for the same day is 0.9428 Bobcoins, 0.5 per cent of the day; the rest is other Bob use (spikes and
   development sessions, not recorded in this repository). As in the 11-01 comparison, the check is too loose to
   detect an error in the reviewer figures. The unit (Bobcoins) is still not confirmed by an independent figure
   for the reviewer alone.
3. **Spend can occur on an inactive day.** 2026-10-20 shows Is active 0, Tasks completed 0 and Spend 29.3.
   What "active" means in the export is unverified, so it is not used as a measure of reviewer activity.
4. **No attribution by key or tool.** The export has no column for API key, mode, repository or Bob Shell versus
   IDE. Whether Bob Shell calls made with the project Inference key are included in a user's Spend is unverified.
5. **Order of magnitude is consistent.** Daily spend values of 0.84 to 187.49 Bobcoins sit in the same unit scale as
   the portal total of 95.58, and far above the reviewer's per-review figure of about 0.02. This supports "the
   reviewer is a small part of the account's use" (already stated in
   [cost-summary.md section 6](cost-summary.md#6-reconciliation-with-the-account-total-s16)) and nothing more.

## What would close S16

- Re-export after the weekend days are included (or confirm the export never includes them), then compare 10-31
  and 11-01 with the reviewer totals (0.45 and 2.54).
- Run the reviewer from a dedicated Bob user or team so that the user-level daily spend equals the reviewer's
  daily total (PLAN section 10). With one reviewer-only user, even this weekday-only export would be usable.
- Ask whether the team-level view of Bobalytics can filter by Bob Shell API key; the export here cannot.
