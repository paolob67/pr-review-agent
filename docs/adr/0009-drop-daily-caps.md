# ADR 0009: Drop the daily run and spend caps

Status: Accepted (2026-10-30). Amends [ADR 0007](0007-cost-record-and-cap-semantics.md) item 3.

## Context

ADR 0007 set a daily run cap per repository (30) and a daily spend cap (USD 10). The reviewer job is
stateless: each Code Engine job run starts empty and has no store shared between runs. A daily cap
would need new shared state (a counter file on a volume, or a sum over the log store), which adds a
component, a failure mode and a new trust surface.

The owner decided (Phase 2) not to enforce daily caps.

## Decision

1. Daily run cap and daily spend cap (G14) are removed from the contracts, configuration and code.
   `REVIEW_MAX_RUNS_PER_DAY` and `REVIEW_DAILY_SPEND_CAP` no longer exist.
2. G14 is the per-PR run cap only (default 3), read from the hidden marker on the existing comment.
3. Per-PR cumulative cost stays in the marker and the footer for reporting. It is not a cap.
4. Spend is bounded indirectly by: the per-PR run cap, the size gates (G8), the skip rules (G9), the
   process and job timeouts (G13, G21), concurrency cancellation (G11), and the budget set on the
   Bob key itself.
5. Phase 7 still reconciles the sum of cost records per day against Bobalytics (S16). That is a
   reporting check, not a cap.

## Consequences

- A burst of many different PRs is not throttled by this system. The only hard ceiling on total
  spend is the quota on the Bob Inference API key; the owner must set it before Phase 3.
- Adding a daily cap later needs a new ADR and a state store.
