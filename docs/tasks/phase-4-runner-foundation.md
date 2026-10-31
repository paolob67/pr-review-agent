# Phase 4: Runner foundation (container, stage split, secrets wiring)

## Goal

Run the reviewer as three GitHub Actions jobs on GitHub-hosted `ubuntu-24.04` runners, with the
Bob key present only in the `review` job and the comment token only in `publish`, started by hand
against a sandbox PR. Governed by [ADR 0001](../adr/0001-execution-environment.md).

The phase has two parts. Part A is local and needs nothing from the owner. Part B needs the owner.
Do Part A completely first, then stop and ask before starting Part B.

## Prerequisites

- Phase 3 gate met.
- Part A: `podman` working locally (see Do, step 1), `node`, `gh` logged in (read-only use).
- Part B, from the owner:
  - The GitHub plan and visibility of the sandbox repo (S18).
  - Permission to create an environment, a secret and variables in the sandbox repo.
  - The Bob key entered by the owner with `gh secret set` (from a prompt or a file the owner
    controls). The agent never reads, prints or stores it.
  - A decision on S20 (how the reviewer code and image reach the jobs) and on the comment
    identity (S17; default is `github-actions[bot]`).

## Inputs to read

[PLAN.md](../PLAN.md) sections 3 (the three jobs), 6, and G1, G10, G13, G20 to G27, G34;
[CONTRACTS.md](../CONTRACTS.md) sections 1, 2, 7, 8; [ADR 0001](../adr/0001-execution-environment.md);
[ADR 0013](../adr/0013-secrets-and-credentials-on-github.md);
[runner-facts.md](../results/runner-facts.md).

## Do

### Part A (local, no GitHub resources)

1. Check `podman info`. If the machine is unreliable, `podman machine stop` then `start`, or
   `rm` and `init`. Record the result. Stop and report if it cannot be made to work.
2. `integrations/container/Dockerfile`: base `ubuntu:24.04` pinned by digest (record the digest),
   Node 22.23.4 installed from the official tarball and verified by SHA-256 (values in
   `runner-facts.md`), `@ibm/bob@2.0.9` from npm, `git`, user `bobrun` (uid/gid 10002) for Bob and
   a separate wrapper user, user-level settings with `"bob-cline.useAgentRules": false` (G30),
   no secrets in layers. Entrypoint `reviewer/bin/reviewer.js`. Local `build.sh` and `run.sh`
   next to it, using podman.
3. Run `tests/container/canary.mjs` and `probe-bob.mjs` inside the container with the hardened
   flags (read-only rootfs, `--cap-drop=ALL`, `--security-opt no-new-privileges`, tmpfs scratch).
   Resolve S11 locally and record the result in `docs/results/phase-4-container.md` (date, Bob
   version, image digest). If the UID split fails, implement the fallback from PLAN section 3 and
   write an ADR.
4. Add stage subcommands `prepare`, `review` and `publish` to `reviewer/bin/reviewer.js` and
   `reviewer/src/main.js`. They exchange the two artifacts (`prompt`, `result`) as files. The
   single-process mode stays for local runs and all existing tests.
5. Update the cost record for GitHub: `run_id` is `<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>`,
   `compute` is `{ "runner": "ubuntu-24.04", "runner_minutes": null }`, and the vcpu, memory,
   estimated cost and rates fields are removed ([CONTRACTS.md](../CONTRACTS.md) section 8).
6. `integrations/github-actions/bob-review.yml`: workflow `permissions: {}`, per-job permissions,
   `timeout-minutes`, pinned runner label, concurrency per PR, `workflow_run` conclusion check,
   the Bob key referenced in one step `env:` of the `review` job only, no PR checkout, no PR
   data in `run:` strings or expressions.
7. `scripts/validation/` static workflow check that fails on: missing `permissions`, a `secrets.`
   reference outside the allowed step, a missing `timeout-minutes`, an unpinned runner label, a
   PR-controlled expression in `run:`. A unit test for it and a mutation entry in
   `scripts/validation/mutation-check.js`.
8. `make test`, `make lint` and `make mutation` pass.

### Part B (needs the owner)

9. With `gh`, in the sandbox repo: create environment `bob-review` limited to the default branch,
   create the `BOB_API_KEY` environment secret (owner enters the value), set the repo variables.
   Answer S18 (plan limits) and record it.
10. Run the workflow by hand (`workflow_dispatch` against a sandbox PR). Confirm: one comment, a
    second run updates it; stale SHA is a quiet skip; invalid input is rejected.
11. Resolve S17 (does an `issues: write` token post and is it refused on reviews, check-runs and
    statuses), S19 (runner reaches Bob, variable name) and S20 (delivery route, artifacts pass
    between jobs). Record in `docs/results/phase-4-runner.md`.
12. Check from the logs and the workflow file that the Bob key appears only in `review` and the
    comment token only in `publish`, and that no secret value appears in logs, summary or
    artifacts (canary values first).
13. Draft `docs/SETUP.md` (GitHub part) and the teardown steps for `docs/RUNBOOK.md`.

## Do not

- Do not run Bob, or any tool, on untrusted PR content with credentials in its environment.
- Do not print, log or commit credentials; do not put them on command lines.
- Do not use the owner's production repositories.
- Do not create GitHub resources in Part A. In Part B create them only with documented `gh`
  commands, and record a matching teardown.
- Do not enable `--yolo`, MCP or write-capable tools.

## Budget

Part A: no live Bob calls beyond the canary and probe (at most 5 short calls). Part B: at most 10
workflow runs, each with one Bob call. Record every run. Stop and ask before exceeding.

## Deliverables

`integrations/container/*`, `integrations/github-actions/bob-review.yml`, stage subcommands,
updated cost record, the static workflow check with test and mutation, `tests/container/*`,
`docs/results/phase-4-container.md` (Part A) and `docs/results/phase-4-runner.md` (Part B),
draft SETUP.md and RUNBOOK.md steps, ADRs as needed, STATUS.md, INDEX.md.

## Acceptance (gate)

Part A:

- The image builds with podman on an Ubuntu 24.04 base and its digest is recorded.
- The canary and probe pass inside the hardened container (S11), or the fallback is implemented.
- `prepare`, `review` and `publish` subcommands work with a fake Bob and exchange artifacts.
- The static workflow check, its test and its mutation pass; `make test`, `make lint` and
  `make mutation` are green.

Part B:

- A manually started workflow run reviews a sandbox PR and posts exactly one comment; a second run
  updates it.
- The Bob key is present only in `review` and the comment token only in `publish`; logs, summary
  and artifacts contain no secret.
- Artifacts, job summary and audit record exist.
- The teardown commands remove the environment, secrets, variables and workflow, proved by a
  listing.
- S11 (runner), S17, S18, S19, S20 answered in the results file.

## Report back

What was created and what it cost in runner minutes, the answers to S11 and S17 to S20, anything
that deviates from the plan, and the exact `gh` commands the owner needs to know.
