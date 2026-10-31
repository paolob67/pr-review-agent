# ADR 0001: Execution environment (superseded)

Status: Superseded by [ADR 0012](0012-github-hosted-runner-execution.md) on 2026-10-30.

The first decision placed Bob Shell in a managed container job on a separate cloud platform,
triggered from GitHub Actions. The owner's environment could not grant the permissions that
platform requires, so the decision was reversed before any review ran on it.

What stays valid from the original reasoning:

- Bob Shell runs non-interactively with API-key authentication, so it can review PRs from CI.
- The documented requirements are Node.js 22.15 or later, 4 GB RAM minimum (8 GB recommended),
  500 MB disk and internet access.
- The trigger never checks out PR code; the diff is fetched through the API.
- The model, its credentials and the comment credential must be isolated from each other
  (guardrails G2, G23).

Everything about where and how the job runs, and how it is triggered, is now in
[ADR 0012](0012-github-hosted-runner-execution.md). Credentials are in
[ADR 0013](0013-secrets-and-credentials-on-github.md).
