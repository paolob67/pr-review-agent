# Phase 1: Threat model, ADRs, architecture freeze

## Goal

Turn the plan and the Phase 0 results into frozen design documents, so implementation phases do
not re-open design questions.

## Prerequisites

- Phase 0 gate met ([STATUS.md](../STATUS.md)).

## Inputs to read

[PLAN.md](../PLAN.md) in full, [CONTRACTS.md](../CONTRACTS.md), `docs/results/spikes.md`,
[ADR 0001](../adr/0001-execution-environment.md).

## Do

1. Write `docs/THREAT_MODEL.md`: assets (Bob key, SCM tokens, IBM key, source code, PR comment
   channel, budget), actors (maintainer, same-repo author, outside contributor, malicious fork,
   compromised dependency, leaked CI key), trust boundaries (diagram), abuse cases (at least:
   prompt injection via every PR field, rule tampering, stale head, fake approval text, markdown
   exfiltration, credential theft from the container, CI key abuse, cost exhaustion, config
   loading by Bob from the working directory), and a table mapping every abuse case to guardrail
   IDs. Every guardrail G1 to G37 must appear at least once.
2. Write `docs/ARCHITECTURE.md`: components, data flow, the three stages, the isolation mechanism
   chosen with reasons, failure behaviour per outcome in CONTRACTS section 8. Add a draw.io
   trust-boundary diagram in `docs/diagrams/` and export it.
3. Do the paper analysis of S15 (`workflow_run` behaviour) from GitHub docs and write the open
   points to be tested in Phase 5.
4. Write ADRs in `docs/adr/` (one file each, numbered from 0002): author and fork policy; trigger
   after CI and how required CI is defined; findings contract and comment format; rules location
   and base-branch loading; in-container isolation mechanism (with the fallbacks from the plan);
   cost record and cap semantics; SCM identity for comments.
5. Review CONTRACTS.md against the Phase 0 results and fix it. Mark the file "frozen" with the date.
6. Prepare the sign-off list below as a short document `docs/results/phase-1-signoff.md`.

## Do not

- Do not write implementation code.
- Do not change a plan decision silently; any change goes through an ADR and a PLAN.md edit.

## Budget

No live calls.

## Deliverables

`THREAT_MODEL.md`, `ARCHITECTURE.md`, ADR 0002 onward, trust-boundary diagram (source and PNG),
updated CONTRACTS.md, `docs/results/phase-1-signoff.md`, updated INDEX.md and STATUS.md.

## Acceptance (gate)

The owner has signed off, in the task conversation or in the sign-off file, on:

- Author policy (default: auto-review OWNER, MEMBER, COLLABORATOR; others by maintainer label).
- Data-egress stance and the statement of which Bob region receives the code (from S13).
- The review scope table and the findings contract.
- The default caps (runs per PR, runs per day, spend per day) with actual numbers.

and every guardrail appears in the threat model mapping.

## Report back

The sign-off list with the owner's answers, ADRs written, anything that changed from the plan.
