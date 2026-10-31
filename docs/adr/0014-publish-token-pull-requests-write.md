# ADR 0014: The publish token has pull-requests: write

Status: Accepted (owner decision, 2026-10-31). Amends [ADR 0012](0012-secrets-and-credentials-on-github.md)
item 3 and PLAN guardrails G25 and G34.

## Context

ADR 0012 assumed the `publish` job's `GITHUB_TOKEN` could post and update PR comments with only
`issues: write`, and that this token would then be refused on the reviews endpoint. The S17 probe
(2026-10-31, [phase-4-runner.md](../results/phase-4-runner.md)) shows otherwise, with five permission
sets tried on a pull request:

- `issues: write` alone: listing and posting comments return 403, although the response header lists
  `issues=write; pull_requests=write` as accepted.
- `issues: write` plus `pull-requests: read`: listing works, posting returns 403.
- `pull-requests: write`: listing works, and a comment post and a review post are both accepted (a 422
  on the deliberately invalid body).
- Check runs and commit statuses are refused for every set.

So commenting on a PR needs `pull-requests: write`, and that scope can also reach the reviews endpoint.

## Decision

1. The `publish` job declares `permissions: pull-requests: write` and nothing else. `issues: write` is
   dropped (it adds nothing).
2. "The bot never approves, requests changes or blocks" (G34) is no longer held by token scope. It is
   held by, in order:
   1. the client in `reviewer/src/github.js`, which exposes only six operations and posts only to the
      issue-comment create and update endpoints (unit test, mutations G34a and G34b);
   2. the static workflow check, which allows `pull-requests: write` on `publish` only, and forbids
      `checks`, `statuses`, `contents` and every other write scope on every job (tests and mutation
      G34w);
   3. the repository setting that stops Actions approving reviews
      (`can_approve_pull_request_reviews` is `false` on the sandbox). Live check 2026-10-31 (run
      41196664772): an APPROVE attempt was refused (HTTP 422, "GitHub Actions is not permitted to
      approve pull requests"), but a REQUEST_CHANGES attempt SUCCEEDED (HTTP 200, state
      CHANGES_REQUESTED). The setting therefore stops approval only, not a blocking review. The probe
      review was dismissed;
   4. the reviewer never being a required check or a required reviewer.
3. The dedicated bot account (ADR 0008) stays the documented upgrade if a named identity or a token
   that cannot reach reviews is wanted. Not built.

## Reasons

1. It is the only configuration of the built-in token that was observed to work.
2. It needs no second account and no stored comment token.

## Consequences

- **Measured gap:** with `pull-requests: write` the job token can submit a REQUEST_CHANGES review. On a
  repository whose branch protection requires approving reviews, that could block a merge until the
  review is dismissed. Branch protection is not available on the sandbox plan, so the blocking effect
  itself is untested. The workflow never calls the reviews endpoint (client allowlist, unit tests,
  mutation G34a and G34b), so this needs a bug or a compromised `publish` step to occur. A dedicated
  comment-only identity (ADR 0008) would close it and remains the upgrade path.

- The guarantee is weaker than planned: a bug or a compromised `publish` step could in principle submit
  a review comment. It cannot create check runs or statuses (refused for every set tried) and cannot
  push code (`contents` is read-only by default and forbidden by the check).
- `publish` handles the untrusted `result` artifact, so G15 to G19 (validation and sanitising) and the
  endpoint allowlist carry more weight; they are the controls to keep tested.
- `prepare` keeps `pull-requests: read`. The `review` job still has no token scopes.
- The article should state this plainly: the plan said "no pull-request scope" and the platform did not
  allow it.
