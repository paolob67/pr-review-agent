# ADR 0001: Execution environment

Status: Accepted (Planning)

## Context

Bob Shell runs non-interactively with API-key authentication, which means it can review pull
requests from any CI pipeline that can pass environment variables and read API responses. The
question is where the container that runs Bob should live and how it should be invoked.

The requirements are:

- Bob Shell needs Node.js 22.15 or later, 4 GB RAM minimum (8 GB recommended), 500 MB disk and
  outbound internet access to the Bob service.
- Three credentials must be kept strictly apart: the Bob API key, the read-only SCM token and the
  comment token (AGENTS.md). They must never coexist on the same machine.
- The trigger must never check out PR code with secrets in scope (guardrails G6, G24).
- The review is advisory only; the system never approves, blocks, or sets commit statuses.
- The implementation adds no dependency on any cloud account other than GitHub and the Bob service.

Facts used here (official GitHub docs, fetched 2026-10-30; see
[results/runner-facts.md](../results/runner-facts.md)):

- Secrets are not passed to the runner for workflows triggered from a forked repository (only
  `GITHUB_TOKEN`), and not to Dependabot-triggered workflows.
- A `workflow_run` workflow runs from the default branch, can use secrets even if the triggering
  workflow could not, and fires whatever the triggering conclusion was.
- Each job in a workflow gets a fresh GitHub-hosted runner VM. Linux runners have passwordless
  `sudo`. `ubuntu-24.04` ships Node 22, Docker 28 and Podman 4.9.
- Job-level `permissions:` limit what the job's `GITHUB_TOKEN` can do; unspecified scopes are
  `none`.

## Decision

1. Bob Shell runs in a **GitHub Actions job on a GitHub-hosted runner** (`ubuntu-24.04`, pinned
   label, not `ubuntu-latest`).
2. The workflow trigger is `workflow_run` from the default branch, with no checkout of PR code
   (see [ADR 0003](0003-trigger-after-ci.md)), plus the label re-request trigger.
3. The workflow has **three jobs, each on its own fresh runner, each with different credentials**:

   | Job | Holds | `permissions:` | Does |
   |---|---|---|---|
   | `prepare` | read-only `GITHUB_TOKEN` | `contents: read`, `pull-requests: read`, `actions: read` | Validates identifiers, CI result for the SHA, author policy, kill switch, head pinning, size and skip gates; fetches diff and base-branch rules through the API; redacts; builds the prompt; uploads it as an artifact (data only) |
   | `review` | `BOB_API_KEY` only | `contents: read` (to fetch trusted reviewer code) | Downloads the prompt artifact, runs Bob read-only in a hardened container with a scrubbed environment, uploads the raw result as an artifact |
   | `publish` | comment token only ([ADR 0012](0012-secrets-and-credentials-on-github.md)) | `issues: write` | Treats the result artifact as untrusted, validates and sanitises it, upserts one marker comment, writes the audit log and cost record |

4. `review` runs Bob in a container on the runner (Docker is preinstalled) with a read-only root
   filesystem, all capabilities dropped, `no-new-privileges`, a non-root user, and the UID
   separation built in ([ADR 0006](0006-in-container-isolation.md)). Container hardening is
   defence in depth; the job boundary is the main isolation.
5. Local development builds the same image with **podman** on an Ubuntu 24.04 base, so local runs
   match the runner OS. The runner uses Docker; the Dockerfile is plain OCI and builds with both.
6. No IBM Cloud service, account, CLI or credential is used anywhere. The only external services
   are GitHub and the Bob service.

## Reasons

1. GitHub Actions is where the team's CI already runs; adding the review as a `workflow_run` job
   adds no dependency on an external environment.
2. Job-level separation is stronger than an in-container UID split alone: the comment token never
   exists on the machine that runs Bob, and the Bob key never exists on the machine that holds the
   comment token.
3. Fresh VM per job: no state, no cleanup job, no run-count limits.
4. Fork and Dependabot PRs get no secrets by platform design, and `workflow_run` from the default
   branch is the only path that has them.
5. Runners are documented to ship the tools the review needs (Node 22, Docker, standard utilities).

## Consequences

- Compute location is a GitHub runner location that is **not selectable** on standard runners. The
  data-residency statement must reflect this; the owner confirms the stance (S13).
- Egress cannot be restricted by domain on standard hosted runners. Accepted residual risk.
- The Bob key is a GitHub secret. Anyone with write access to the repository can read repository
  secrets through a workflow they can run; environment secrets limited to the default branch
  reduce this ([ADR 0012](0012-secrets-and-credentials-on-github.md)).
- Private-repo runner minutes count against the plan. Reviews are short; per-run minutes are
  recorded in the cost record.
- Job summaries, logs and artifacts are the audit store. Retention is a repository setting plus
  `retention-days` on artifacts.
- The runner image can change under a fixed label. The review runs inside a container pinned by
  digest, so only the host varies.
- Reusable-workflow and environment-secret behaviour across private repos is unverified (PLAN S18,
  S20).
