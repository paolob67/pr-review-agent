# ADR 0001: Run Bob Shell in IBM Cloud Code Engine (Frankfurt)

Status: Accepted (owner decision, to be re-confirmed after the Phase 0 spikes)

## Context

Bob Shell can run non-interactively with API-key authentication, so it can review pull requests
from CI. The documented requirements (Node.js 22.15 or later, 4 GB RAM minimum with 8 GB
recommended, 500 MB disk, internet access) are met by a standard Linux container.

The CI system (GitHub Actions) should only signal that a review is wanted. The model, its
credentials and the review logic should run elsewhere, with their own isolation.

## Decision

Build a container image with Bob Shell, Node.js and the reviewer core. Run it as an IBM Cloud
Code Engine job in region `eu-de` (Frankfurt). The GitHub Actions workflow submits a job run with
only the repository name and the PR number. Secrets (Bob API key, comment token) are Code Engine
secrets, referenced by the job through `--env-from-secret`.

## Reasons

1. The Bob API key is stored in Code Engine and never reaches the CI system.
2. Fork and outside-contributor PRs can be handled without giving PR code access to secrets: the
   trigger never checks out PR code, and the job fetches the diff through the API.
3. The image is prebuilt and pinned, which removes install-time uncertainty from every run.
4. Resources are selectable per job (documented maximums: 12 vCPU, 48 GB memory).
5. Frankfurt is a documented Code Engine region and Bob publishes `eu-de` service endpoints.

## Consequences

- More components to operate: IBM Cloud project, container registry, IAM.
- Job logs are not retrievable with `jobrun logs` after completion; logs must be shipped to IBM
  Cloud Logs or recorded by the job.
- The job posts the PR comment itself, so an SCM comment credential exists inside the container;
  in-container privilege separation is required (guardrail G23).
- The identity used to submit job runs can, per the documented `jobrun submit` options, override
  command, arguments, and secret references of a run, so a leaked key is more than a compute-cost
  risk. It is scoped to one project (G25) and verified in spike S12.
- Outbound egress cannot be restricted by domain; IP-range restrictions are brittle for this use
  and context-based restrictions are not supported for jobs.
- Billing includes image pull time; the default of 3 retries must be set to 0.
- A project is limited to 100 job runs, so a cleanup job is required (G26).

## Not yet verified

See spikes S11 to S13 in [PLAN.md](../PLAN.md#5-known-unknowns-to-verify-first).
