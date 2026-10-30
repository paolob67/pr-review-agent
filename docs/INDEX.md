# Documentation Index

| Document | Purpose | Status |
|---|---|---|
| [../AGENTS.md](../AGENTS.md) | Instructions for any agent session working on this repo | Current |
| [STATUS.md](STATUS.md) | Phase tracker, blockers, unknowns tracker, decisions log | Current |
| [PLAN.md](PLAN.md) | Design review, guardrail catalogue, phased plan, test strategy, future change cases | Working draft, for review |
| [CONTRACTS.md](CONTRACTS.md) | Shared interfaces: job inputs, secrets, findings schema, comment format, cost record | Frozen (Phase 1, 2026-10-30) |
| [THREAT_MODEL.md](THREAT_MODEL.md) | Assets, actors, abuse cases, control mapping (G1 to G37) | Current (Phase 1) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, components, data flow, S15 analysis | Current (Phase 1) |
| [tasks/README.md](tasks/README.md) | Index of the self-contained phase briefs | Current |
| [tasks/phase-0-spikes.md](tasks/phase-0-spikes.md) | Brief: spikes against the local Bob CLI | Done |
| [tasks/phase-1-design-freeze.md](tasks/phase-1-design-freeze.md) | Brief: threat model, ADRs, architecture freeze | Done |
| [tasks/phase-2-reviewer-core.md](tasks/phase-2-reviewer-core.md) | Brief: reviewer core with offline tests | Ready |
| [tasks/phase-3-real-bob.md](tasks/phase-3-real-bob.md) | Brief: real Bob integration, local | Ready |
| [tasks/phase-4-code-engine.md](tasks/phase-4-code-engine.md) | Brief: Code Engine foundation in eu-de | Ready |
| [tasks/phase-5-github-trigger.md](tasks/phase-5-github-trigger.md) | Brief: GitHub trigger and end-to-end matrix | Ready |
| [tasks/phase-6-redteam-evals.md](tasks/phase-6-redteam-evals.md) | Brief: red team and quality evals | Ready |
| [tasks/phase-7-hardening.md](tasks/phase-7-hardening.md) | Brief: operational hardening and cost reconciliation | Ready |
| [tasks/phase-8-docs-article.md](tasks/phase-8-docs-article.md) | Brief: documentation, article, final validation | Ready |
| [adr/0001-execution-environment.md](adr/0001-execution-environment.md) | Decision to run Bob Shell on IBM Cloud Code Engine (eu-de) | Accepted |
| [adr/0002-author-and-fork-policy.md](adr/0002-author-and-fork-policy.md) | Role-based author policy and maintainer label gate | Accepted |
| [adr/0003-trigger-after-ci.md](adr/0003-trigger-after-ci.md) | Trigger after CI and definition of required CI | Accepted |
| [adr/0004-findings-contract-and-comment-format.md](adr/0004-findings-contract-and-comment-format.md) | Findings schema, line mapping, comment structure | Accepted |
| [adr/0005-rules-location-and-base-branch-loading.md](adr/0005-rules-location-and-base-branch-loading.md) | Base-branch loading of rules and standards | Accepted |
| [adr/0006-in-container-isolation.md](adr/0006-in-container-isolation.md) | In-container isolation and privilege separation | Accepted |
| [adr/0007-cost-record-and-cap-semantics.md](adr/0007-cost-record-and-cap-semantics.md) | Cost record schema, per-PR and daily caps | Accepted |
| [adr/0008-scm-identity-for-comments.md](adr/0008-scm-identity-for-comments.md) | Dedicated bot account, comment-only scope | Accepted |
| [diagrams/architecture-overview.drawio](diagrams/architecture-overview.drawio) | Architecture overview (source; PNG alongside) | Current |
| [diagrams/trust-boundaries.drawio](diagrams/trust-boundaries.drawio) | Trust boundaries diagram (source; PNG alongside) | Current |
| [TESTING.md](TESTING.md) | How to run each test suite and read results | Phase 2 done 2026-10-30 |
| SETUP.md | IBM Cloud, GitHub, secrets, first run | Planned (Phase 4, completed Phase 8) |
| RUNBOOK.md | Key rotation, kill switch, incident steps, teardown | Planned (Phase 4, completed Phase 8) |
| ARTICLE.md | Narrative write-up | Planned (Phase 8) |
| [results/spikes.md](results/spikes.md) | Phase 0 spike findings: S1-S10, S13, S14; gate decisions | Phase 0 done 2026-10-30 |
| [results/phase-1-signoff.md](results/phase-1-signoff.md) | Phase 1 sign-off record and policy decisions | Phase 1 done 2026-10-30 |
| [results/phase-2-results.md](results/phase-2-results.md) | Phase 2 test counts, guardrails covered, design notes | Phase 2 done 2026-10-30 |
| [results/mutation-check.md](results/mutation-check.md) | Mutation check results (real patch-and-run, 39 mutations) | Phase 2 done 2026-10-30 |
| [scripts/spikes/s1-installer.sh](../scripts/spikes/s1-installer.sh) | S1: installer inspection script | Phase 0 |
| [scripts/spikes/s2-s5-readonly.sh](../scripts/spikes/s2-s5-readonly.sh) | S2/S5: non-interactive flags and read-only enforcement | Phase 0 |
| [scripts/spikes/s3-custom-mode.sh](../scripts/spikes/s3-custom-mode.sh) | S3: custom mode YAML and --chat-mode | Phase 0 |
| [scripts/spikes/s4-s14-trusted-folders.sh](../scripts/spikes/s4-s14-trusted-folders.sh) | S4/S14: trusted folders, AGENTS.md canary, .env | Phase 0 |
| [scripts/spikes/s6-s7-errors-usage.sh](../scripts/spikes/s6-s7-errors-usage.sh) | S6/S7: error exit codes and usage/cost reporting | Phase 0 |
| [scripts/spikes/s8-file-stdin.sh](../scripts/spikes/s8-file-stdin.sh) | S8: file references outside workspace and large stdin | Phase 0 |
| results/ | Recorded spike, test, eval, drill and cost outputs | Ongoing |
