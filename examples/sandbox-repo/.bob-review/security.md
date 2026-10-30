# Security focus areas (sample)

Sample focus list based on common application-security guidance (OWASP Top 10 and ASVS themes).
These are areas to look at, not citable rule IDs.

- Injection: SQL, OS command, template, LDAP, and header injection.
- Path traversal and unsafe file handling (uploads, archive extraction, symlinks).
- Server-side request forgery and open redirects.
- Broken authentication and authorisation (missing checks, insecure direct object references).
- Hard-coded or logged secrets; secrets in URLs or error messages.
- Weak or misused cryptography; fixed algorithms; poor randomness; missing certificate checks.
- Insecure deserialisation and use of `eval`-style functions on untrusted input.
- Unsafe regular expressions (catastrophic backtracking) on untrusted input.
- Prototype pollution and mass assignment.
- Dependency risk: new or unpinned packages, install scripts.
