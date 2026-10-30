# ADR 0010: Prompt, rules and diff go on stdin; scratch holds only the mode file

Status: Accepted (2026-10-30). Amends [ADR 0006](0006-in-container-isolation.md) item 3 and
CONTRACTS section 9.

## Context

CONTRACTS section 9 and ADR 0006 listed `PROMPT.md`, `rules/`, `pr/diff.patch`, `pr/files/<path>`
and `pr/meta.json` in the scratch directory. Spike S8 recommended passing the prompt on stdin, and
ADR 0006 allows "piped via stdin or written to dedicated subpaths". The Phase 2 implementation pipes
the prompt (instructions, rules, redacted diff, metadata) on stdin and writes only
`.bob/custom_modes.yaml` to scratch.

## Decision

1. Task instructions, base-branch rules, the redacted diff and PR metadata are sent on stdin,
   inside untrusted-data delimiters.
2. Scratch contains only `.bob/custom_modes.yaml` (G28, G29).
3. No PR-controlled path is ever created under scratch, which removes a class of path-based attacks.
4. Full changed files at the head SHA (`pr/files/`) are not fetched in Phase 2. The model sees the
   diff only. Whether to add file context is a review-quality question to measure in Phase 3; if it
   is added it goes on stdin, size-capped and redacted, under a new ADR.

## Consequences

- Prompt size is bounded by the stdin prompt cap, not by files on disk.
- Findings that need surrounding code outside the diff hunks may be weaker.
