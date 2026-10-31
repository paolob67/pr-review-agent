# Phase 4 Part A: container image, S11 canary, stage split

Date: 2026-10-31. Bob Shell 2.0.9. Host: macOS 27.0.1 (arm64), podman 6.0.0 (libkrun/applehv VM,
Fedora CoreOS 44, rootless). Brief: [phase-4-runner-foundation.md](../tasks/phase-4-runner-foundation.md).
Decision context: [ADR 0012](../adr/0012-github-hosted-runner-execution.md).

No Bob calls were made in Part A. The canary uses made-up credential values and a probe process that
stands in for Bob, so 0 of the 5 allowed short calls were used. No GitHub or IBM Cloud resources were
created.

## 1. Podman health (step 1)

Initial state: the machine showed "Currently starting" and `podman info` could not connect.

Actions and findings, in order:

1. `podman machine stop` then `start` brought it up, but the VM stopped again whenever the tool call
   that started it ended. Starting it detached from the calling session (`perl -MPOSIX -e
   'POSIX::setsid(); exec @ARGV' podman machine start`) keeps it running. This is specific to how the
   agent's shell runs commands, not to podman.
2. Owner request: prune all podman state and rebuild from scratch. Before pruning there were 25 images
   (3.6 GB), 0 containers and 1 volume (`voting-app_app_...`, 59.7 MB, unrelated to this project and
   removed at the owner's instruction).
3. `podman system prune --all --force --volumes` removed the images but left stale overlay temp
   directories it could not delete (`permission denied` under `.../home/bobrun`, `.../home/ubuntu`),
   which made every later podman command fail with `configure storage`. `podman system reset` has no
   `--force` flag in 6.0.0 and failed for the same reason.
4. Fix: inside the VM, `sudo rm -rf ~/.local/share/containers/storage`, then
   `systemctl --user restart podman.socket`. Result: 0 images, 0 containers, 0 volumes; VM disk
   `/var` went from 5.4 GB to 4.0 GB used.
5. The first pull then failed with `potentially insufficient UIDs or GIDs available in user namespace
   (requested 0:42 for /etc/gshadow)`. `/etc/subuid` and `/etc/subgid` in the VM were empty (0
   bytes). Fix: write `core:100000:65536` to both and run `podman system migrate`. After that
   `podman info` shows the mappings `{0 1000 1} {1 100000 65536}`.

The earlier "storage error (`readlink .../overlay/diff`)" noted in the old Code Engine results is not
reproduced after the reset. The cause of the original corruption is not established (unverified).

Housekeeping for the owner: images accumulate on every build. `integrations/container/build.sh` uses
`--layers=false` and `--pull=always`, so each rebuild leaves the previous image as `<none>`. Run
`podman image prune` (or the full reset above) when disk use grows.

## 2. Image (steps 2 and 3)

Built with `integrations/container/build.sh` (a staged build context holding only the Dockerfile,
`reviewer/` and `tests/container/`), on a clean podman store.

| Item | Value |
|---|---|
| Base | `ubuntu:24.04` pinned by index digest `sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852`; resolved to Ubuntu 24.04.5 LTS |
| Platform | `linux/arm64` (local build); the `linux/amd64` Node checksum is also in the Dockerfile for the runner |
| Node.js | v22.23.4 from the official tarball, SHA-256 verified in the build (values from [runner-facts.md](runner-facts.md)) |
| Bob Shell | `@ibm/bob@2.0.9` from npm (`bob --version` prints 2.0.9, commit 9690f20b0) |
| Users | wrapper runs as root; Bob runs as `bobrun`, uid/gid 10002, shell `nologin` |
| Settings | `/home/bobrun/.bob/settings/settings.json`: auto-update off, `"bob-cline.useAgentRules": false` (G30) |
| Image id | `b7b1fd430c139d7ed71e11994d97b9a33f115ef2347123063b3cbe276deaa40a` |
| Manifest digest | `sha256:0d0a9f449f7ea89b3b99c072b1aa443983f150bdbd09fe9bb431ba2a487d6adb` |
| Size | 443 MB |
| Secrets in layers | None: `podman history --no-trunc` has no match for `api_key`, `token` or `secret`, and `env` in the container shows no variable with those words |

The digest is a local, unpushed build. It is not expected to be reproducible across builds; the
digest that matters for the workflow is the one of the image published in Part B (S20).

## 3. S11: UID split under the hardened flags

Command (`make canary`):

```bash
podman run --rm --read-only --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID \
  --cap-add=DAC_OVERRIDE --security-opt no-new-privileges \
  --tmpfs /tmp:rw,exec,nosuid,size=256m --pids-limit 512 \
  --entrypoint node pr-reviewer:local /app/tests/container/canary.mjs
```

Result: `pass: true`, 13 of 13 checks.

| Check | Result |
|---|---|
| Wrapper starts as root so it can drop to the Bob uid | pass (uid 0) |
| Probe ran and reported | pass |
| Probe runs as the Bob uid, not root | pass (uid 10002) |
| Probe has no effective capabilities | pass (`CapEff 0000000000000000`) |
| Probe env has `BOB_API_KEY` as its only secret, and none of the wrapper's variables | pass |
| Probe cannot read `/proc/<ppid>/environ` | pass (`EACCES`) |
| Probe cannot read `/proc/<ppid>/mem` | pass |
| No readable process environ contains SCM variable names | pass (0 readable) |
| Probe cannot list `/root` | pass |
| Probe cannot write `/app` (reviewer code) or `/etc` | pass |
| Probe can read its scratch workspace | pass |

Observation: `parent_cmdline_readable` is `true`. The parent command line is visible to the Bob uid.
This is acceptable only because no credential is ever placed on a command line (AGENTS.md); the
canary does not test that, the argv tests in `tests/unit/runBob.test.js` do.

`probe-bob.mjs` is not run separately: `canary.mjs` starts it through the same `runBob` path the
reviewer uses, which is the point of the test.

Scope of this result: it covers podman 6.0.0 on arm64 only. The same canary on the Docker 28.0.4 runner
(amd64) is Part B and S11 stays "local pass, runner open" until then. The UID-split fallback from PLAN
section 3 was not needed, so no new ADR.

Capability set: the four added capabilities are the ones the existing `run.sh` documents as needed
(CHOWN to hand the scratch directory to the Bob uid, SETUID and SETGID to start Bob under that uid,
DAC_OVERRIDE so the root wrapper can read and delete the scratch afterwards). They were not
re-derived by removal in this session.

## 4. Stage subcommands, cost record, workflow, policy check (steps 4 to 7)

These were already in the working tree at the start of this session. This session verified them by
running the checks; it did not change them.

| Step | Artifact | Verified by |
|---|---|---|
| 4 | `prepare`, `review`, `publish` in `reviewer/bin/reviewer.js`, `reviewer/src/stages.js` | `tests/pipeline/stages.test.js` (fake Bob, artifacts exchanged as files) in `make test` |
| 5 | `run_id` = `<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>`, `compute: { runner, runner_minutes: null }`, vcpu/memory/cost fields removed, `reviewer/config/cost-rates.json` deleted | `tests/unit/cost.test.js` |
| 6 | `integrations/github-actions/bob-review.yml`: `permissions: {}`, per-job permissions, `timeout-minutes` 5/8/5, `runs-on: ubuntu-24.04`, concurrency, `workflow_run` conclusion check, `secrets.BOB_API_KEY` in one step env | `make lint` (workflow policy) |
| 7 | `scripts/validation/workflow-policy.js`, `tests/unit/workflowPolicy.test.js`, mutation entries | `make test`, `make mutation` |

Not reviewed line by line in this session: the workflow file and `integrations/github-actions/run-review.sh`
beyond the grep of their key fields. They are first exercised live in Part B.

## 5. Validation

| Command | Result |
|---|---|
| `make test` | 227 tests, 227 pass, 0 fail |
| `make lint` | 39 files, 0 errors; workflow policy: 1 workflow file, 0 violations |
| `make mutation` | 52 of 52 mutations killed; wrote [mutation-check.md](mutation-check.md) |
| `make canary` | pass, 13 of 13 |

## 6. Part A acceptance

- Image builds with podman on an Ubuntu 24.04 base, digest recorded: met.
- Canary passes inside the hardened container (S11, local): met.
- `prepare`, `review`, `publish` work with a fake Bob and exchange artifacts: met.
- Static workflow check, its test and its mutation pass; test, lint and mutation green: met.

Part B has not been started and needs the owner (see [STATUS.md](../STATUS.md)).
