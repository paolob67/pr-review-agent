# ADR 0013: Bob license acceptance in non-interactive runs

Status: Accepted (owner decision, 2026-10-31).

## Context

The first live run on a GitHub-hosted runner (Phase 4 Part B, run 41190195150) showed that
`bob run` in a fresh container stops with: "A license agreement is required. Please accept the
license terms before proceeding." Bob's documentation says the license must be accepted before the
first non-interactive session, either by running `bob --accept-license -p ...` once or by starting an
interactive session first (search result `docs/shell/getting-started/start-bobshell-non-interactive`).
`bob --show-license` lists the license files; `bob run --accept-license` accepts it.

The container is fresh on every run and its home is a tmpfs, so no earlier acceptance can persist.
Phase 0 spikes passed the flag on the owner's machine, where the license had been accepted
interactively.

## Decision

1. The project owner has read and accepted the IBM Bob license terms for this project and authorises
   automated acceptance. The reviewer passes `--accept-license` on every `bob run`.
2. The flag is the only acceptance mechanism. No acceptance state is baked into the image or stored in
   a secret.
3. `--yolo` and `--trust` stay forbidden; the unit test for the Bob argument list asserts both.

## Reasons

1. A fresh container cannot accept the license interactively.
2. The flag is the documented non-interactive route.

## Consequences

- Anyone who forks this project and runs the workflow is accepting the license through the flag, so the
  README and SETUP must say that the operator must read and accept the Bob license first.
- If IBM changes the license, the acceptance in this ADR does not carry over; the owner reviews it with
  each Bob version bump.
