# ADR 0007: Cost Record and Operational Cap Semantics

Status: Accepted (frozen Phase 1). Item 3 daily caps superseded by [ADR 0009](0009-drop-daily-caps.md).

## Context

Running automated LLM evaluations consumes compute and API inference budgets. Without hard caps
and clear observability, automated reviews could lead to unexpected costs or denial-of-wallet incidents.

Furthermore, teams require visibility into the financial and operational cost of AI assistance on
their pull requests.

## Decision

1. **Per-Run Cost Record (Guardrail G37)**:
   * Every execution builds a machine-readable JSON cost record with schema version 1.
   * Tracks changed files count, diff byte size, prompt bytes, findings count (kept vs dropped),
     Bob inference duration, total runtime duration, and reported Bob usage in Bobcoins (see ADR 0011).
   * In Bob Shell v2, `stats.session_costs` (a float; Bobcoins per ADR 0011) is reported directly in the `-f json` output
     and recorded with `bob_usage.source = "reported"` and `bob_usage.unit = "bobcoins"`.
2. **Cumulative PR Tracking**:
   * The wrapper embeds the cumulative run count and total Bobcoins across all reviews of a PR into
     the hidden HTML marker: `<!-- bob-pr-review:v1 {"head":"...","runs":N,"cost_total":{"bobcoins":0.45}} -->`.
   * The published comment footer displays: `Cost this run: 0.1200 Bobcoins (reported), PR total: 0.3600 Bobcoins over 3 runs.`
3. **Operational Caps (Guardrail G14)**:
   * **Per-PR Run Cap**: Default maximum 3 runs per PR. Subsequent triggers on the same PR exit with
     outcome `skipped_gate` (reason: `pr_run_limit_reached`).
   * ~~Daily run cap and daily spend cap~~: dropped, see ADR 0009.
   * **Timeouts (Guardrail G13)**: Hard process timeout on `bob run` (default 180 seconds) and the
     Actions `timeout-minutes` on the `review` job (default 5 minutes), set in Phase 4
     ([ADR 0001](0001-execution-environment.md)).

## Reasons

1. **Budget Predictability**: Enforces hard boundaries against runaway loops, automated re-pushes, and large batch diffs.
2. **Transparency**: Developers and maintainers see exact per-PR and aggregate costs directly in review comments and audit logs.
3. **Auditability**: Structured cost records go to the job summary and a retained artifact for
   historical analysis and reconciliation.

## Consequences

- Authors pushing more than 3 iterations to a single PR will stop receiving automated reviews unless
  a maintainer overrides or resets the cap via explicit label.
- The wrapper must parse previous comment markers to track cumulative spend per PR.
