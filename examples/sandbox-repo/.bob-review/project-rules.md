# Team rules (sample)

Invented sample team rules for the sandbox repository. Cite the ID exactly as shown.

## TEAM-001: Tests live next to the change
Every source file under `src/` that changes has its test file under `test/` changed in the same
pull request. If no test changes, the description must say why.

## TEAM-002: Crypto agility
Cryptographic algorithms, key sizes and modes are chosen through one configuration point or
wrapper, never hard-coded at call sites. Do not use MD5, SHA-1, DES, 3DES, RC4 or ECB mode.
Prefer algorithms that can be swapped (for example by name from configuration) so a weak one can
be replaced without code changes across the code base. Plan for post-quantum migration by not
assuming fixed key or signature sizes.

## TEAM-003: Approved randomness
Security-relevant random values (tokens, IDs, salts, nonces) come from a cryptographically secure
generator, never from `Math.random()` or a time-seeded generator.

## TEAM-004: Password and secret storage
Passwords are hashed with a slow, salted, maintained algorithm (argon2id, scrypt or bcrypt), never
stored reversibly or hashed with a fast general-purpose hash.

## TEAM-005: Transport security
Outbound connections use TLS with certificate verification on. Never disable verification, even
in tests, except through an explicit local-only test setting.

## TEAM-006: Public API changes are documented
A change to a public function, endpoint or configuration key updates the README or the docs in the
same pull request.

## TEAM-007: Timeouts on external calls
Every network or process call sets an explicit timeout and handles failure.
