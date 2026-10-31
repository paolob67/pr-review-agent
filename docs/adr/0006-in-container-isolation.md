# ADR 0006: Isolation Mechanism and Privilege Separation

Status: Accepted (frozen Phase 1). The main isolation boundary is the job boundary on
GitHub-hosted runners ([ADR 0001](0001-execution-environment.md)); the in-container controls
below are defence in depth.

## Context

The review processes untrusted pull request diffs and metadata. Three credentials exist in the
system:
* `BOB_API_KEY`: for IBM Bob inference.
* the read-only SCM token: for fetching diffs and rules.
* the comment token: for publishing review comments.

If an attacker achieves prompt injection or triggers unexpected tool execution in Bob Shell, they
must not be able to steal SCM credentials, modify the filesystem, or execute arbitrary system
commands.

## Decision

Isolation has two layers.

**Layer 0, job boundary (Guardrails G2, G23).** The Bob key exists only on the `review` job runner.
The read-only token exists only on the `prepare` runner and the comment token only on the `publish`
runner. Jobs are separate fresh VMs and exchange only artifacts (data). Artifacts coming back from
`review` are treated as untrusted input by `publish`.

**Layer 1, inside the `review` job**, Bob runs in a hardened container:

1. **Scrubbed Environment (`env -i`) (Guardrails G2, G3, G23)**:
   * The wrapper runs as an unprivileged container user.
   * When spawning `bob run`, the wrapper creates a scrubbed environment allowlist containing only
     `BOB_API_KEY`, `PATH`, `HOME`, and essential runtime variables (e.g. `NODE_ENV`).
   * No SCM token is present in the `review` job at all; the allowlist is a second line.
2. **Read-Only Tool Enforcement (Guardrails G4, G30)**:
   * Every invocation of `bob run` explicitly passes `--disable-tool-groups edit,execute --disable-mcp`.
   * Probes in Phase 0 confirmed that in Bob Shell v2, this flag removes file creation,
     modification, and shell command tools from the model context.
3. **Synthetic Scratch Workspace (Guardrails G28, G29)**:
   * Bob is invoked with `--workspace <scratch>` pointing to an ephemeral, clean directory.
   * Amended by [ADR 0010](0010-scratch-layout-stdin.md): instructions, rules, diff and metadata go
     on stdin.
   * PR-supplied `.bob/`, `AGENTS.md`, and `.env` files are never copied into the scratch root.
4. **Container hardening (defence in depth, S11)**:
   * The wrapper hands the scratch directory to a distinct UID and starts Bob under it.
   * The container runs with a read-only root filesystem, a tmpfs scratch, `--cap-drop ALL`,
     `--security-opt no-new-privileges` and a pids limit.
   * Whether the UID drop works under Docker on the runner and under podman locally is checked in
     Phase 4 (S11).

## Reasons

1. **Deterministic Containment**: Prevents credential theft from `/proc` or environment reflection;
   with job separation the credential is not on the machine at all.
2. **No Side Effects**: Bob cannot write files or execute commands even if instructed by adversarial input.
3. **No Workspace Infection**: Isolating the workspace eliminates AGENTS.md and configuration hijacking.

## Consequences

- Bob cannot run linters, formatters, or compilers directly; all review analysis is static inference over diff and rule text.
- The workflow must pass data between jobs by artifact only, and `publish` must re-validate it.
