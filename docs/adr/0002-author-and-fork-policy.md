# ADR 0002: Author and Fork Policy

Status: Accepted (frozen Phase 1)

## Context

Pull requests submitted to open-source or team repositories originate from diverse authors:
internal repository owners, team members, recognized collaborators, and first-time or untrusted
fork contributors.

Running automated LLM code review on every incoming pull request introduces two primary risks:
1. **Denial-of-Wallet / Resource Exhaustion**: Malicious or automated fork accounts could open
   numerous pull requests to rapidly consume Bobcoin budgets and runner minutes.
2. **Adversarial Input Exposure**: Unvetted fork code and adversarial prompts could be used to probe
   the review system.

## Decision

Adopt a role-based authorization gate (Guardrail G7) enforced in the `prepare` job of the review
workflow, before the `review` job (which holds the Bob key) can start:
* **Auto-Review**: Pull requests authored by users with GitHub association `OWNER`, `MEMBER`, or
  `COLLABORATOR` are automatically reviewed once required CI passes.
* **First-Time / Outside Contributors**: Pull requests authored by `FIRST_TIME_CONTRIBUTOR`,
  `FIRST_TIMER`, `CONTRIBUTOR`, `NONE`, or empty association are ignored by default.
* **Explicit Maintainer Override**: A maintainer can trigger review on any PR by applying the label
  `bob-review` (or `safe-to-review`).

## Reasons

1. Protects the project budget from automated spam, Sybil attacks, and unauthorized fork floods.
2. Keeps the default workflow zero-touch for trusted team members.
3. Provides maintainers with a simple, safe mechanism to opt in trusted community contributions.

## Consequences

- Outside contributors do not receive automated feedback until a maintainer reviews and labels the PR.
- The trigger workflow must inspect `github.event.workflow_run.pull_requests[].author_association`
  or query the PR author association via GitHub API.
- Maintainer documentation must clearly state the label requirement for external PRs.
