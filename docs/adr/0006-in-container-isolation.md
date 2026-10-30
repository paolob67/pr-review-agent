# ADR 0006: In-Container Isolation Mechanism and Privilege Separation

Status: Accepted (frozen Phase 1)

## Context

The review container executes in IBM Cloud Code Engine and processes untrusted pull request diffs
and metadata. The container runtime holds sensitive credentials:
* `BOB_API_KEY`: for IBM Bob inference.
* `SCM_READ_TOKEN`: for fetching diffs and rules.
* `SCM_COMMENT_TOKEN`: for publishing review comments.

If an attacker achieves prompt injection or triggers unexpected tool execution in Bob Shell, they
must not be able to steal SCM credentials, modify the container filesystem, or execute arbitrary
system commands.

## Decision

Implement multi-layer privilege separation and environment isolation inside the Code Engine container:

1. **Scrubbed Environment (`env -i`) (Guardrails G2, G3, G23)**:
   * The wrapper runs as an unprivileged container user.
   * When spawning `bob run` for Stage 2, the wrapper creates a scrubbed environment allowlist
     containing only `BOB_API_KEY`, `PATH`, `HOME`, and essential runtime variables (e.g. `NODE_ENV`).
   * `SCM_READ_TOKEN` and `SCM_COMMENT_TOKEN` are completely excluded from the Bob child process environment.
2. **Read-Only Tool Enforcement (Guardrails G4, G30)**:
   * Every invocation of `bob run` explicitly passes `--disable-tool-groups edit,execute --disable-mcp`.
   * Probes in Phase 0 confirmed that in Bob Shell v2, this flag completely removes file creation,
     modification, and shell command tools from the model context.
3. **Synthetic Scratch Workspace (Guardrails G28, G29)**:
   * Bob is invoked with `--workspace <scratch>` pointing to an ephemeral, clean directory created by Stage 1.
   * The scratch directory contains only:
     * `.bob/custom_modes.yaml`: reviewer mode definition.
     * `PROMPT.md`: task instructions and output contract.
     * `rules/`: copies of base-branch rules.
   * PR diff and changed content are piped via stdin or written to dedicated subpaths.
   * PR-supplied `.bob/`, `AGENTS.md`, and `.env` files are never copied into the scratch root.
4. **Fallback / Defense-in-Depth**:
   * If container-level sub-user switching is supported in Phase 4 (S11), Bob will run under a distinct UID.
   * If read-only rootfs mount is supported by Code Engine, the container filesystem is mounted read-only with a tmpfs scratch.

## Reasons

1. **Deterministic Containment**: Prevents credential theft from `/proc` or environment reflection.
2. **No Side Effects**: Bob cannot write files or execute commands even if instructed by adversarial input.
3. **No Workspace Infection**: Isolating the workspace eliminates AGENTS.md and configuration hijacking.

## Consequences

- Bob cannot run linters, formatters, or compilers directly; all review analysis is static inference over diff and rule text.
- The wrapper must orchestrate file preparation and process execution explicitly across stages.
