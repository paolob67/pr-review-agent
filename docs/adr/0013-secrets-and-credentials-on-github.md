# ADR 0013: Secrets and credentials on GitHub

Status: Accepted (owner decision on the approach, 2026-10-30; defaults open to change per PLAN
section 10). Amends [ADR 0008](0008-scm-identity-for-comments.md).

## Context

With [ADR 0012](0012-github-hosted-runner-execution.md) the Bob API key lives in GitHub. Three
credentials must stay separate (AGENTS.md): the Bob key, the read-only SCM token and the comment
token. GitHub documents (see [results/runner-facts.md](results/runner-facts.md)):

- Secrets are never passed to runners for fork-triggered workflows or Dependabot runs, and are not
  automatically passed to reusable workflows.
- Environment secrets are available only to jobs that reference the environment; deployment
  branch rules can restrict which refs may use it. On GitHub Free, environments with secrets are
  unavailable for private repositories (Pro, Team or Enterprise needed).
- Secrets cannot be used in `if:`; an unset secret is an empty string. Redaction is not guaranteed
  under transformation. Secrets must not be passed on command lines. Structured data must not be
  stored as one secret. Any user with write access can read repository secrets through a workflow.
- `GITHUB_TOKEN` is per job and limited by `permissions:`.

## Decision

1. **Bob key**: GitHub environment secret `BOB_API_KEY` in environment `bob-review`, restricted to
   the default branch. It is referenced only in the `env:` of the one step in the `review` job
   that starts the container, and passed into the container by name (`-e BOB_API_KEY`), never as a
   value on a command line. No other job references the environment.
2. **Read-only SCM token**: the `prepare` job's `GITHUB_TOKEN` with `contents: read`,
   `pull-requests: read`, `actions: read`. No stored secret.
3. **Comment token**: default is the `publish` job's `GITHUB_TOKEN` with `issues: write` only (no
   `pull-requests` scope), so comments are posted as `github-actions[bot]`. Whether this scope
   alone can create, update and list comments, and whether the reviews endpoint is refused, is
   unverified (S17). A dedicated bot account with a fine-grained token stored as environment
   secret `BOB_COMMENT_TOKEN` is the documented alternative if S17 fails or the owner wants a
   named bot; it is referenced only in the `publish` job.
4. **Setting secrets**: `gh secret set NAME --env bob-review < file` or an interactive prompt.
   Never `--body` with the value, never in shell history, logs, docs or fixtures. One secret per
   value.
5. **Reference rules**: a secret appears only in a step `env:` block. Never in `run:` text, `if:`,
   `with:` of third-party actions, matrix values, job outputs or artifacts. Derived sensitive
   values are masked with `::add-mask::` before use. A test greps the workflow files for any
   `secrets.` reference outside the allowed places.
6. **Forks and Dependabot**: they receive no secrets (platform behaviour). The reviewer therefore
   runs only from `workflow_run` on the default branch, which does not execute PR code.
7. **Reusable workflow**: if the review logic is a reusable workflow, secrets are passed explicitly
   by name from the caller; `secrets: inherit` is not used.
8. **Fallback if environment secrets are unavailable** (plan limit): repository secrets with
   job-level scoping and a deployment-branch check in `prepare`. This is weaker: every workflow
   in the repository could request the secret, and write-access users can read it. It is
   documented as such and not the default.
9. **Rotation and revocation**: the Bob key and any comment token are rotated on a schedule and
   after any suspected exposure; the runbook states the steps. The kill switch (repo variable
   `BOB_REVIEW_ENABLED`) stops use without touching the secret.
10. **Bobcoin ceiling**: the budget on the Bob key itself remains the only hard ceiling on spend
    (ADR 0009).

## Reasons

1. Environment scoping plus default-branch restriction is the strongest control GitHub documents
   for secrets short of self-hosted infrastructure.
2. Per-job `GITHUB_TOKEN` scoping avoids storing two of the three credentials.
3. The bot "cannot approve" property is easier to hold when the token has no pull-request scope.

## Consequences

- If the owner's plan lacks environment secrets for private repos, the weaker fallback applies or
  the sandbox must be public. Decision needed (S18).
- `github-actions[bot]` is not a dedicated reviewer identity. ADR 0008 item 1 (dedicated account)
  becomes optional; G34 is held by token scope, endpoint allowlist and tests instead.
- Secrets cannot be used for gating logic in `if:`; gating reads repository variables.
