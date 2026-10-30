# ADR 0003: Trigger After CI and Definition of Required CI

Status: Accepted (frozen Phase 1)

## Context

Running an LLM code review on broken, uncompilable, or failing code wastes inference budget and
developer attention. Syntactic defects and unit test failures are caught faster, cheaper, and more
reliably by deterministic CI workflows (linters, typecheckers, test suites).

Furthermore, triggering directly on `pull_request` events exposes secrets if PR code is executed,
and runs the risk of analyzing code before CI has passed.

## Decision

1. **Trigger Event**: The review agent triggers exclusively on `workflow_run` events (Guardrail G12)
   and explicit labeling events, running from the repository default branch (`main`).
2. **Definition of Required CI**:
   * A repository variable `BOB_REVIEW_REQUIRED_WORKFLOWS` defines a comma-separated list of workflow
     names (e.g. `CI,Unit Tests,Lint`) that must conclude successfully (Guardrail G31).
   * If `BOB_REVIEW_REQUIRED_WORKFLOWS` is not set or empty, the trigger defaults to requiring the
     triggering workflow itself to have concluded with `conclusion == "success"`.
3. **Head Commit Verification**:
   * The trigger verifies that the workflow run corresponds to the exact head commit SHA of an open PR.
   * If any required workflow fails, is cancelled, or is pending, no review job is submitted.
   * If a newer commit is pushed to the PR while CI is running, concurrency groups cancel older runs (G11),
     and the job wrapper re-verifies the head SHA before running (G32).

## Reasons

1. **Cost Efficiency**: Eliminates LLM reviews on code that fails basic compilation, linting, or tests.
2. **Security**: `workflow_run` workflows run in the context of the default branch with read-only
   access to the PR, preventing fork code from accessing trigger secrets.
3. **Determinism**: Reviewers and authors see AI feedback only on code that has already met the
   project's automated baseline.

## Consequences

- Review feedback arrives slightly later than immediate PR open events, as it must wait for CI to complete.
- Repositories must configure `BOB_REVIEW_REQUIRED_WORKFLOWS` if they have multiple independent CI workflows.
