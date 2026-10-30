# Phase 4: Code Engine foundation (eu-de)

## Goal

Run the reviewer in a container on IBM Cloud Code Engine in Frankfurt, submitted by hand against a
sandbox PR, with logs retrievable after completion and a one-command teardown.

## Prerequisites

- Phase 3 gate met.
- From the owner: a Pay-as-you-Go IBM Cloud account, `ibmcloud login` done on this machine with
  rights to create a resource group, Code Engine project, Container Registry namespace and
  service ID; a sandbox GitHub repository with at least one open PR (can be a minimal one);
  the Bob key and SCM tokens ready to be created as Code Engine secrets (the agent never writes
  them to files; they are provided to the setup script through environment variables or a
  prompt).
- Confirm cost expectations with the owner before creating anything.

## Inputs to read

[PLAN.md](../PLAN.md) sections 2 (implications 2, 3, 8, 9), 6 and G13, G21, G22, G23, G25, G26,
G27; [CONTRACTS.md](../CONTRACTS.md) sections 1, 2, 8; the Code Engine docs via `search_ibm_docs`
(job runs, secrets, registry, builds, logging, IAM roles, users and UIDs in containers).

## Do

1. Check `ibmcloud target`, plugins (`code-engine`, `container-registry`, `logs` as needed), and
   region `eu-de`. Stop and report if login is missing.
2. Scripts in `integrations/code-engine/`: `setup.sh` (resource group, project, registry
   namespace, secrets from environment variables, service ID and its scoped policy, build, job
   with `--retrylimit 0`, `--maxexecutiontime`, `--env-from-secret`, CPU and memory), `build.sh`
   (remote build with `ibmcloud ce buildrun submit`), `run.sh` (submit a job run with the three
   inputs and print its name), `cleanup-runs.sh` (delete job runs older than N days, G26),
   `teardown.sh` (delete everything created, verified by a listing). Idempotent where possible,
   all names from one config file with the placeholders from PLAN section 6.
3. Dockerfile: pinned base image digest, Node and Bob Shell pinned (method from S1), `git` only if
   needed, non-root, wrapper and Bob users if S11 allows, system settings in
   `/etc/bobshell/settings.json` (G30), trusted-folder pre-seeding (G29), no secrets in layers.
   Build remotely; record the image digest.
4. Resolve S11 on the platform: can the entrypoint start Bob as a different UID, and can the Bob
   process read the wrapper's environment (G23)? Write the canary test as a script under
   `tests/container/` and record the result. If it fails, implement the fallback from PLAN section
   3 and write the ADR.
5. Resolve S12: the smallest IAM role that can submit job runs, limited to the project; test with
   the service ID key that it cannot touch other resources, and record whether a submitter can
   override command, arguments or secret references. Update G25 and the runbook notes accordingly.
6. Logging: confirm job logs are retrievable after completion, through IBM Cloud Logs or the
   mechanism that works; record how, and that the audit lines from CONTRACTS section 7 appear
   without secrets (G20, G27).
7. Manual end-to-end: submit a job run against the sandbox PR; confirm one comment appears,
   re-submit and confirm it is updated, not duplicated; submit with a stale SHA and confirm a
   quiet skip; submit with an invalid input and confirm rejection.
8. Draft `docs/SETUP.md` (IBM Cloud part) and the teardown steps for `docs/RUNBOOK.md`.

## Do not

- Do not create resources outside the named resource group and project.
- Do not print, log or commit credentials; if a script needs one, read it from the environment.
- Do not enable retries; do not leave runs or builds that bill after the task ends.
- Do not use the owner's production repositories.

## Budget

At most 10 job runs for verification, each with the smallest realistic resources. Report the
IBM Cloud usage afterwards. Stop and ask before exceeding.

## Deliverables

`integrations/code-engine/*`, `tests/container/*`, `docs/results/phase-4-code-engine.md` (S11,
S12, S1 container install, logging, runs with durations), draft SETUP.md and RUNBOOK.md,
ADRs for isolation and IAM as needed, STATUS.md, INDEX.md.

## Acceptance (gate)

- A manually submitted job run reviews a sandbox PR and posts exactly one comment; a second run
  updates it.
- Logs are retrievable after completion and contain no secrets.
- The canary isolation test result for G23 is recorded (pass, or fallback implemented).
- `teardown.sh` removes everything and a listing proves it; `setup.sh` recreates it.
- S1, S11, S12 answered in the results file.

## Report back

Resources created and their cost so far, the answers to S11 and S12, anything that deviates from
the plan, the exact commands the owner needs to know.
