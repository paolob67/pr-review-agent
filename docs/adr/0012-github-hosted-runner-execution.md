# ADR 0012: Run Bob Shell on GitHub-hosted runners

Status: Accepted (owner decision, 2026-10-30). Supersedes [ADR 0001](0001-execution-environment.md).

## Context

ADR 0001 placed Bob Shell in a managed container job on a separate cloud platform, submitted from
GitHub Actions. The owner's environment cannot grant the permissions that platform needs, and the
account that was used has been deleted. The execution environment has to be decided again, with no
dependency on any cloud account other than GitHub and the Bob service.

Facts used here (official docs, fetched 2026-10-30; see [results/runner-facts.md](results/runner-facts.md)):

- Secrets are not passed to the runner for workflows triggered from a forked repository (only
  `GITHUB_TOKEN`), and not to Dependabot-triggered workflows.
- A `workflow_run` workflow runs from the default branch, can use secrets even if the triggering
  workflow could not, and fires whatever the triggering conclusion was.
- Each job in a workflow gets a fresh GitHub-hosted runner VM. Linux runners have passwordless
  `sudo`. `ubuntu-24.04` ships Node 22, Docker 28 and Podman 4.9.
- Job-level `permissions:` limit what the job's `GITHUB_TOKEN` can do; unspecified scopes are `none`.

## Decision

1. Bob Shell runs in a **GitHub Actions job on a GitHub-hosted runner** (`ubuntu-24.04`, pinned
   label, not `ubuntu-latest`).
2. The workflow trigger is `workflow_run` from the default branch, with no checkout of PR code
   (unchanged from [ADR 0003](0003-trigger-after-ci.md)), plus the label re-request trigger.
3. The workflow has **three jobs, each on its own fresh runner, each with different credentials**
   (the three stages of PLAN section 3 become three jobs):

   | Job | Holds | `permissions:` | Does |
   |---|---|---|---|
   | `prepare` | read-only `GITHUB_TOKEN` | `contents: read`, `pull-requests: read`, `actions: read` | Validates identifiers, CI result for the SHA, author policy, kill switch, head pinning, size and skip gates; fetches diff and base-branch rules through the API; redacts; builds the prompt; uploads it as an artifact (data only) |
   | `review` | `BOB_API_KEY` only | `contents: read` (to fetch trusted reviewer code) | Downloads the prompt artifact, runs Bob read-only in a hardened container with a scrubbed environment, uploads the raw result as an artifact |
   | `publish` | comment token only (ADR 0013) | `issues: write` | Treats the result artifact as untrusted, validates and sanitises it, upserts one marker comment, writes the audit log and cost record |

4. `review` runs Bob in a container on the runner (Docker is preinstalled) with a read-only root
   filesystem, all capabilities dropped, `no-new-privileges`, a non-root user, and the UID
   separation already built (ADR 0006). Container hardening is defence in depth; the job boundary
   is the main isolation.
5. Local development builds the same image with **podman** on an Ubuntu 24.04 base, so local runs
   match the runner OS. The runner uses Docker; the Dockerfile is plain OCI and builds with both.
6. No IBM Cloud service, account, CLI or credential is used anywhere. The only external services are
   GitHub and the Bob service.

## Reasons

1. Removes every cloud-account dependency; only GitHub and Bob remain.
2. Job-level separation is stronger than the in-container UID split alone: the comment token never
   exists on the machine that runs Bob, and the Bob key never exists on the machine that holds the
   comment token.
3. Fresh VM per job: no state, no cleanup job, no run-count limits.
4. Fork and Dependabot PRs get no secrets by platform design, and `workflow_run` from the default
   branch is the only path that has them.
5. Runners are documented to ship the tools the review needs.

## Consequences

- Compute location is a GitHub runner location that is **not selectable** on standard runners. The
  data-residency statement from Phase 1 no longer holds. See [PLAN.md](../PLAN.md) S13 and the
  owner action in [STATUS.md](../STATUS.md).
- Egress cannot be restricted by domain on standard hosted runners. Accepted residual risk,
  unchanged in substance.
- The Bob key is a GitHub secret. Anyone with write access to the repository can read repository
  secrets through a workflow they can run; environment secrets limited to the default branch
  reduce this (ADR 0013).
- Private-repo runner minutes count against the plan. Reviews are short; per-run minutes are
  recorded in the cost record.
- Job summaries, logs and artifacts are the audit store. Retention is a repository setting plus
  `retention-days` on artifacts.
- The runner image can change under a fixed label. The review runs inside a container pinned by
  digest, so only the host varies.
- Reusable-workflow and environment-secret behaviour across private repos is unverified (PLAN S18,
  S20).
