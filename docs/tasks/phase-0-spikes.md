# Phase 0: Spikes against the local Bob CLI

## Goal

Replace assumptions about Bob Shell with recorded facts, before any design is frozen. Answer
unknowns S1 to S10, S13 and S14 from [PLAN.md](../PLAN.md#5-known-unknowns-to-verify-first).

## Prerequisites

- `bob` installed and logged in on this machine (it was present at planning time at
  `/usr/local/bin/bob`). Check with `bob --version`.
- A small Bobcoin allowance. The owner has accepted real calls under their own session for this
  phase; they are tiny and use only synthetic content.
- No GitHub or API key needed. If an API-key test is wanted (S6 auth failure), use a
  deliberately invalid key; do not ask for the real one yet.

## Inputs to read

- [PLAN.md](../PLAN.md) sections 4 (G3 to G5, G28 to G30), 5 (S1 to S10, S13, S14) and the decision
  gate after the table.
- Bob docs through `search_ibm_docs` with library `bob`: non-interactive sessions, configuring,
  trusted folders, custom modes for Bob Shell, sandboxing, install and setup, API keys.

## Do

1. Create `scripts/spikes/` with one script per question group (shell or Node), each printing
   what it ran and what came back. Each script works in a fresh temporary directory created with
   `mktemp -d` outside the repo, containing only synthetic files, and removes it afterwards.
2. Answer each unknown, one `## S<n>` section each in `docs/results/spikes.md`: the question,
   the exact command, the observed output (trimmed, no secrets), the conclusion, and the
   consequence for the plan. Use "unresolved, assume worst case" where a probe cannot decide.
   - S1: read the installer script (`curl -fsSL https://bob.ibm.com/download/bobshell.sh`, view it,
     do not pipe to a shell) and the releases page; record install location, version pinning, and
     any checksum. The container install itself is tested in Phase 4 with podman because `docker` is absent.
   - S2: `bob --help` and the non-interactive docs: read-only flags, `--allowed-tools`,
     `--approval-mode`, any output format option. Try `-p` with a trivial prompt and a JSON-only
     instruction; record whether the output is clean enough to parse.
   - S3: create a custom mode (YAML) in a temp project and in an image-style location
     (`/etc/bobshell` or `~/.bob`); try to select it non-interactively; record how.
   - S4 and S14: create a temp folder; record `~/.bob/trustedFolders.json` format by reading it,
     marking the temp folder untrusted, and observing that a project `.bob/settings.json`, an
     `AGENTS.md` and a `.env` in it are ignored or not. Use a harmless marker instruction
     (for example "answer with the word CANARY-7") to prove an `AGENTS.md` took effect.
     Back up and restore the owner's `trustedFolders.json` and `~/.bob/settings.json`; never leave
     them changed.
   - S5: ask Bob to write a file in read-only mode and to run a shell command; record denial
     behaviour and exit code.
   - S6: invalid API key, empty prompt, a timeout via an external `timeout` wrapper; record exit
     codes and stderr.
   - S7: look for usage information in stdout, stderr, `--debug`, local state files under `~/.bob`,
     and exit summaries after a run. Record exactly what is available, with a sample. If nothing,
     measure how well an estimate from prompt and output size would work on five runs.
   - S8: `@file` for a file outside the start directory; stdin prompt of about 200 KB.
   - S9: the installer's dependency needs (Node version, any native packages); from the docs.
   - S10: documented limits only; no load testing.
   - S13: determine which Bob region this instance uses from docs, settings or the portal
     information the owner can see; record what can be said about residency. Do not guess.
3. Write the decisions the gate needs at the top of `docs/results/spikes.md`:
   - Is read-only enforcement reliable (S2, S5)? If not, state the stricter sandbox required.
   - Reported usage or estimate (S7)?
   - How the reviewer mode and rules will be delivered (S3, S14).
   - How the scratch directory will be marked untrusted (S4).
4. Update [PLAN.md](../PLAN.md) wherever a result changes it, and the unknowns table in
   [STATUS.md](../STATUS.md).

## Do not

- Do not run Bob with this repo as the working directory.
- Do not send real code, real secrets or anything from the owner's other projects to Bob.
- Do not modify the owner's Bob configuration permanently.
- Do not install anything globally.

## Budget

At most 30 Bob calls, each with a prompt under 2 KB except the one 200 KB stdin test. Count them
in `docs/results/spikes.md`.

## Deliverables

- `scripts/spikes/*`, re-runnable.
- `docs/results/spikes.md` with a decisions summary at the top and one section per unknown.
- Updated PLAN.md, STATUS.md and INDEX.md.

## Acceptance (gate)

- Every one of S1 to S10, S13 and S14 has a recorded answer or an explicit "unresolved, assume
  worst case" note.
- The four gate decisions above are written down.
- The owner's Bob settings are verified unchanged (diff before and after).
- No secret appears in any file under `docs/` or `scripts/`.

## Report back

A short list: what is now known, what contradicted the plan, what is still unresolved, calls used.
