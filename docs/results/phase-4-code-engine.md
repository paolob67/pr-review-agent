# Phase 4 results: Code Engine foundation (eu-de)

Status: **In progress, blocked on IAM rights** (2026-10-30). Brief: [phase-4-code-engine.md](../tasks/phase-4-code-engine.md).
Bob Shell version in the image: 2.0.9 (pinned). No image digest yet (no successful build).

This file is the resume point. Read "Resume checklist" first.

## Resume checklist (do these in order when work restarts)

### Owner actions

1. **Resolve the IAM blocker** (see "Blocker" below). Pick one:
   - A. Ask the account owner (`dtead02@us.ibm.com`) to grant the owner's user the right to create
     access policies, in practice `Administrator` on the Container Registry and IAM Identity services
     (or membership in an access group that has them). Then nothing else changes: `setup.sh` works as is.
   - B. An administrator pre-creates the access and hands over keys through environment variables:
     (i) a registry service ID or API key with `Reader` and `Writer` on namespace `bob-pr-reviewer`
     (domain `de.icr.io`), (ii) a CI service ID with a Code Engine policy scoped to project
     `bob-pr-reviewer` (project ID `19d4625b-967e-4e29-acb5-6cd04905dde0`). Then `setup.sh` must be adapted
     to use the supplied key instead of creating service IDs; S12 can only be tested with what was granted.
   - C. Local only: fix the Podman VM (`podman machine rm`, `podman machine init`, `podman machine start`)
     to build and run the canary test locally. This answers S11 but not the registry push.
2. **Create the SCM tokens** and export them in the shell that runs `setup.sh` (never in files):
   - `SCM_READ_TOKEN`: fine-grained PAT on `paolob67/notes-sandbox`, read-only (Contents, Pull requests).
   - `SCM_COMMENT_TOKEN`: fine-grained PAT on `paolob67/notes-sandbox`, comment scope only (Pull requests
     and Issues write, nothing else). Owner agreed on 2026-10-30 to use a PAT on the personal account as a
     stand-in; the dedicated bot account of ADR 0008 is a Phase 5 item.
   - `BOB_API_KEY`: from the existing `pr-review-agent.json` (expires 2026-12-30). Export it from that file
     in the shell; do not paste it anywhere.
3. Confirm the Bobcoin budget for the live runs (Phase 4 budget: at most 10 job runs).

### Agent actions after the blocker is cleared

1. `ibmcloud target` (expect `eu-de`), then `cd integrations/code-engine && ./setup.sh` (it reuses the
   namespace and project that already exist; with the three tokens exported it also creates the secrets).
2. `./build.sh`. If the remote build still fails, see "Build notes".
3. `./setup.sh` again: with an image present it creates job `pr-reviewer` (1 vCPU, 4G, `--retrylimit 0`,
   `--maxexecutiontime 600`, `--env-from-secret` for both secrets, `REVIEW_IMAGE_DIGEST`).
4. S11: submit a job run whose command is `node /app/tests/container/canary.mjs` (command override on a
   run; use `ibmcloud ce jobrun submit --job pr-reviewer --command node --argument /app/tests/container/canary.mjs`).
   Record the verdict JSON. If it fails, implement the PLAN section 3 fallback and write an ADR.
5. S12: `./ci-identity.sh Writer`, then with the generated key (file outside the repo) test: submit a run,
   try to touch another project and another resource, and record whether a submitter can override
   `--command`, `--argument` and `--env-from-secret`. Try smaller roles (`Reader`, a custom role) and record
   the smallest one that can submit. Update G25 and the runbook.
6. Logging (step 6 of the brief): `ibmcloud ce jobrun logs` while the run exists; for after completion an
   IBM Cloud Logs instance in `eu-de` is required (Standard plan, billed per GB ingested, documented at
   $0.48 to $3.25 per GB depending on tier). Ask the owner before creating one. Record how logs are
   retrieved and confirm no secrets appear (G20, G27).
7. Manual e2e against `paolob67/notes-sandbox` PR #1 ("Add share links for notes", head branch
   `feature/share-links`): get the head SHA with `gh pr view 1 -R paolob67/notes-sandbox --json headRefOid`,
   then `./run.sh paolob67/notes-sandbox 1 <sha> --wait`. Required cases: one comment appears; a second run
   updates it; a stale SHA is a quiet skip; an invalid input is rejected (`RUN_SKIP_LOCAL_VALIDATION=1` to
   bypass the local check so the job's own check is exercised).
8. `./teardown.sh --yes`, confirm the listing, then `./setup.sh` again to prove recreation.
9. Write the rest of this file, `docs/SETUP.md` (IBM Cloud part), the teardown steps in `docs/RUNBOOK.md`,
   ADRs if needed, then STATUS.md and INDEX.md.

## What has been done (2026-10-30)

### Code and tests (all offline checks pass: 191 tests, lint, 2 new mutations killed)

- `integrations/code-engine/`: `config.sh`, `Dockerfile`, `setup.sh`, `build.sh`, `run.sh`,
  `cleanup-runs.sh`, `teardown.sh`, `ci-identity.sh`. All pass `bash -n`. **None has completed a full run**;
  only the early steps of `setup.sh` and a `buildrun submit` were exercised live.
- Dockerfile: base `node:24-slim` pinned by index digest
  `sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c` (looked up 2026-10-30 from the Docker Hub
  registry API), Bob Shell `@ibm/bob@2.0.9` installed with npm (integrity from the npm registry is the only checksum, S1),
  user `bobrun` (uid/gid 10002), auto-update disabled for that user (`general.disableAutoUpdate`, documented in the
  Bob configuration docs), reviewer code root-owned and not writable by others, canary test copied to `/app/tests/container`.
  The wrapper starts as root and spawns Bob as uid 10002 (the S11 mechanism under test).
- Reviewer change for S11: `reviewer/src/runBob.js` (`bobUserFromEnv`, Bob gets its own HOME and uid/gid, never uid 0),
  `reviewer/src/scratch.js` (`handOverScratch`), `reviewer/src/main.js` (uses both, and passes `REVIEW_IMAGE_DIGEST`
  into the cost record). 4 new unit tests in `tests/unit/runBob.test.js`; mutations G23a and G23b in
  `scripts/validation/mutation-check.js` (both killed).
- `tests/container/canary.mjs` and `probe-bob.mjs`: the S11 / G23 canary. The wrapper holds canary SCM tokens, starts a
  probe the way it starts Bob, and the probe reports uid, capabilities, readable `/proc` entries and writable paths (names
  and booleans only, never values). **Not yet run anywhere.**

### Live IBM Cloud state (exists now)

| Resource | Name / ID | Notes |
|---|---|---|
| Resource group | `eid-6ae4f3be2e6256f0f91842aa` | Pre-existing, shared; scripts never create or delete it |
| Registry namespace | `bob-pr-reviewer` on `de.icr.io` | Created by `setup.sh`; empty |
| Code Engine project | `bob-pr-reviewer`, ID `19d4625b-967e-4e29-acb5-6cd04905dde0` | Created by `setup.sh`; no jobs, builds, secrets |
| Pre-existing project | `ce-50e8v73tt8` | Not ours; untouched |

Cost so far: effectively none (no build completed, no job run, no secrets, no logging instance). Leftovers cleaned:
the half-created service ID `bob-pr-reviewer-registry` was deleted; the temporary build context was removed.
`teardown.sh` has not been run; to remove the two resources above now, run `./teardown.sh --yes`.

## Blocker

The owner's user can create service IDs but cannot create IAM access policies, and cannot create a resource group.
`ibmcloud iam user-policies` returns "No policy found" (access probably comes through an access group). Observed failures:

| Attempt | Error |
|---|---|
| `ibmcloud resource group-create bob-pr-reviewer-rg` | "The token does not have permission to perform this action." |
| `ibmcloud iam service-policy-create` (Reader, Writer on the registry namespace) | `insufficent_permissions: You are not allowed to create the requested policy.` |
| `ibmcloud ce buildrun submit` with image `de.icr.io/...` | "The image points to an IBM Container Registry that is not private." |
| same with `private.de.icr.io/...` (Code Engine managed registry access) | "The permission to assign required policies to the service ID ... is insufficient." |

Consequences: no image can be pushed, a job cannot pull one, the scoped CI service ID (G25) cannot get a policy, and S12
cannot be run as designed.

## Build notes

- Image path must use the private registry domain when Code Engine manages access, or a registry secret with a service ID
  key when it does not. `setup.sh` and `build.sh` currently use `de.icr.io` with the user-managed secret `icr-access`
  (created by `setup.sh` from the registry service ID). If option A is chosen, test whether `private.de.icr.io` plus
  the automatic `ce-auto-icr-private-eu-de` secret is simpler and drop the service ID.
- Local Podman build failed twice at `RUN chmod -R go-w /app ...` with a VM storage error
  (`readlink /var/home/core/.local/share/containers/storage/overlay/diff: no such file or directory`, Podman 6.0.0,
  machine `podman-machine-default`). Earlier steps (npm install of Bob, user creation, `bob --version` printed 2.0.9)
  succeeded, so the Dockerfile content is likely fine. The machine is stopped.
- The `Dockerfile` is built from a staged context (Dockerfile, `reviewer/`, `tests/container/`) so keys, docs and tests
  other than the canary are never uploaded.

## Unknowns status

| ID | Status | Note |
|---|---|---|
| S1 (container install) | Partly answered | `npm install -g @ibm/bob@2.0.9` works on `node:24-slim` (local build, step 3, `bob --version` = 2.0.9). Remote build not yet confirmed. |
| S11 | Open | Mechanism implemented (root wrapper, uid 10002 Bob); canary written; not run |
| S12 | Open | Blocked on IAM policy creation |
| Logging | Open | Needs an IBM Cloud Logs instance for post-completion logs (CLI logs only work while the run instance exists, per Code Engine docs) |

Documentation used (Code Engine docs via `search_ibm_docs`): job run logs after completion require IBM Cloud Logs; local
builds can only target IBM Cloud Container Registry; managed registry secret is named `ce-auto-icr-private-<region>`;
Container Registry domain for `eu-de` is `de.icr.io` (confirmed with `ibmcloud cr region-set eu-central`).
