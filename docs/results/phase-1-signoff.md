# Phase 1 Sign-Off Record

Date: 2026-10-30  
Status: Signed Off (Phase 1 Gate Met)

## 1. Author and Fork Policy
* **Decision**: Auto-review pull requests from `OWNER`, `MEMBER`, and `COLLABORATOR`. First-time and outside contributors require a maintainer label (`bob-review` or `safe-to-review`).
* **Recorded in**: [ADR 0002](../adr/0002-author-and-fork-policy.md) and [THREAT_MODEL.md](../THREAT_MODEL.md).
* **Sign-off**: Confirmed.

## 2. Data-Egress Stance and Bob Service Region (S13)
* **Decision**:
  * Inference egress: IBM Bob service with Global subscription region (`https://bob.ibm.com`).
  * Compute runs on GitHub-hosted runners, whose location is not selectable, so no compute-region
    statement can be made ([ADR 0001](../adr/0001-execution-environment.md)). The Bob service
    region statement stands; the combined residency statement is withdrawn and S13 is open. The
    owner is asked to confirm the new stance.
* **Recorded in**: [spikes.md](spikes.md#s13-service-region-and-data-residency), [ARCHITECTURE.md](../ARCHITECTURE.md), and [THREAT_MODEL.md](../THREAT_MODEL.md).
* **Sign-off**: Bob service region confirmed via Bob subscription portal verification on 2026-10-30; compute-location part withdrawn the same day, awaiting owner confirmation.

## 3. Review Scope and Findings Contract
* **Decision**:
  * Scope: Exclude lockfiles, minified files, binary assets, and documentation-only diffs.
  * Categories: `standards`, `team_rule`, `security`, `other`.
  * Severities: `critical`, `high`, `medium`, `low`, `info`.
  * Caps: Max 15 total findings (max 5 per category).
  * Line and rule validation: Discard findings that do not map to lines present in the PR diff or rule IDs present in base-branch rules.
* **Recorded in**: [ADR 0004](../adr/0004-findings-contract-and-comment-format.md) and [CONTRACTS.md](../CONTRACTS.md).
* **Sign-off**: Confirmed.

## 4. Default Operational Caps
* **Decision**:
  * Max runs per PR: `3` (subsequent triggers skip with `pr_run_limit_reached`).
  * Daily run and spend caps: dropped in Phase 2 ([ADR 0009](../adr/0009-drop-daily-caps.md)).
  * Process timeout: `180 seconds`.
  * Job `timeout-minutes` (outer limit, G13): set in Phase 4 as a few minutes above the process timeout ([ADR 0001](../adr/0001-execution-environment.md)).
* **Recorded in**: [ADR 0007](../adr/0007-cost-record-and-cap-semantics.md) and [CONTRACTS.md](../CONTRACTS.md).
* **Sign-off**: Confirmed.

## 5. Guardrail Coverage Verification
* **Verification**: All 37 guardrails (G1 through G37) are mapped to abuse scenarios and mitigations in [THREAT_MODEL.md](../THREAT_MODEL.md).
* **Sign-off**: Complete.
