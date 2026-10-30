# ADR 0005: Rules Location and Base-Branch Loading

Status: Accepted (frozen Phase 1)

## Context

A pull request review agent should evaluate code against team-specific coding standards, architecture
conventions, and security expectations.

However, if rule files are loaded from the pull request head commit or working tree, an author could
modify or disable rule files within their PR (e.g. deleting security rules or adding an override) to
force a clean review report.

## Decision

1. **Rule File Locations**:
   * Team rules and standards are organized under the `.bob-review/` directory in the repository:
     * `.bob-review/standards.md`: general coding standards, rule IDs such as `STD-001`.
     * `.bob-review/project-rules.md`: architecture, naming, forbidden APIs, rule IDs such as `TEAM-001`.
     * `.bob-review/security.md`: optional domain-specific security checklists.
     * `.bob-review/config.json`: optional per-repo overrides (ignored paths, severity caps).
2. **Base-Branch Loading (Guardrail G33)**:
   * Stage 1 (Prepare) fetches rule files exclusively from the target base branch (e.g. `main`) via
     the GitHub Contents API (`GET /repos/{owner}/{repo}/contents/.bob-review/{file}?ref={base_branch}`).
   * The PR head commit is never queried for rule definitions.
   * Changes to `.bob-review/` within a PR are treated as code changes to be reviewed, but only take
     effect as authoritative rules once merged into the base branch.
3. **Size Limits**:
   * Standard and project rules are capped at 32 KiB each, security rules at 16 KiB, and config at 4 KiB.

## Reasons

1. **Tamper Resistance**: Prevents PR authors from bypassing or weakening review rules within their own diffs.
2. **Maintainer Authority**: Ensures governance changes follow standard code review and merge procedures.
3. **Graceful Fallbacks**: If rule files are absent, the reviewer falls back to a clean built-in checklist and indicates so in the comment footer.

## Consequences

- Teams must commit their rules to their main/default branch before they apply to new PRs.
- Rule file loading requires an additional GitHub API call during Stage 1.
