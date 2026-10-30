# ADR 0011: Bob usage is recorded in Bobcoins, not currency

Status: Accepted (2026-10-30). Amends [ADR 0007](0007-cost-record-and-cap-semantics.md) and
CONTRACTS sections 5 and 6.

## Context

Phase 0 labelled Bob's `stats.session_costs` as USD. Bob's documentation describes Bobcoins as
the usage and billing metric, a standardised measure of token consumption, and gives no conversion
to any currency. The owner confirmed that no Bobcoin-to-currency correspondence is available.

## Decision

1. Bob usage is reported and stored in Bobcoins. No conversion to USD or any currency is made or shown.
2. `bob_usage.unit` is `"bobcoins"`. The hidden marker key is `cost_total.bobcoins`. The comment
   footer reads `Cost this run: 0.1200 Bobcoins (reported), PR total: 0.3600 Bobcoins over 3 runs.`
3. The documentation does not state that `session_costs` is in Bobcoins. It is recorded as
   "reported by Bob, unit unverified" until compared with the Bobcoin balance (owner reads the
   balance or Bobalytics before and after a measured batch; result goes to
   `docs/results/phase-3-runs.md`).
4. Live-run budgets are stated in Bobcoins. The Phase 3 budget is 30 Bobcoins; work stops at 80
   percent (24 Bobcoins) or at 60 Bob calls, whichever comes first.
5. `compute.estimated_cost_usd` (Code Engine compute) remains a currency figure and is separate.

## Consequences

- Cost figures cannot be added to compute cost in one number; the article reports them side by side.
- Old markers with `cost_total.usd` are not read; none exist outside tests.
