# Coding standards (sample)

Sample rules written for this project from widely used open-source practice. They are not
proprietary and not an official standard. Cite the ID exactly as shown.

## STD-001: Hard-coded secrets
No credentials, API keys, tokens, passwords or private keys in source, tests or config. Load them
from the environment or a secret store.

## STD-002: Parameterised queries
Never build SQL, shell commands or LDAP filters by concatenating or interpolating untrusted input.
Use parameterised queries and argument arrays.

## STD-003: Validate input at trust boundaries
Validate type, length, range and format of external input (HTTP, files, environment, CLI) before
use. Reject by default; allow-list rather than deny-list.

## STD-004: Safe file paths
Paths built from user input must be resolved and checked to stay inside an intended base
directory. No `..` traversal, no unchecked absolute paths.

## STD-005: Error handling
Do not swallow errors silently (empty `catch`, ignored return codes). Do not leak stack traces,
internal paths or secrets in messages shown to users.

## STD-006: Tests accompany behaviour changes
A change that adds or alters behaviour includes unit tests for it in the same pull request,
covering the new path and at least one failure case. A bug fix includes a test that fails without
the fix.

## STD-007: No dead or commented-out code
Remove unused code, debug prints and commented-out blocks instead of committing them. Version
control keeps the history.

## STD-008: Small, focused functions
Keep functions short and single-purpose. Flag deep nesting (more than 3 levels), long parameter
lists (more than 5) and duplicated logic that should be shared.

## STD-009: Clear naming and comments
Names describe intent. Comments explain why, not what. Public functions have a short doc comment
stating inputs, outputs and errors.

## STD-010: Dependencies
New dependencies are justified, pinned to an exact or locked version and from a maintained source.
Do not add a dependency for a few lines of code.

## STD-011: Logging
Log events, not secrets or personal data. Use levels consistently. Never log request bodies,
tokens or full headers.

## STD-012: Commit hygiene
One logical change per pull request. The description says what changed and why. No generated or
binary files unless required.
