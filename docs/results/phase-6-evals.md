# Phase 6: Quality eval results

Date: 2026-11-01. Bob Shell 2.0.9. Sandbox: paolob67/notes-sandbox.

## Summary

| Suite | Cases | Passed | Result |
|---|---|---|---|
| Train set (ev01-ev20) | 20 | 18 | **18/20 PASS** |
| Held-out set (ev21-ev30) | 10 | 7 | **7/10 PASS** |
| Combined | 30 | 25 | **25/30 PASS (83%)** |

Total cost: 0.7163 Bobcoins across 30 Bob calls (1 rep per case).
All 30 PRs reviewed and closed. Kill switch: OFF.

## Train set results (18/20)

| Case | Flaw type | Expected rule IDs | Recall | Avg findings | Result |
|---|---|---|---|---|---|
| ev01_hardcoded_secret | Hard-coded API key | STD-001 | 1.00 | 4.0 | PASS |
| ev02_sql_injection | Template-literal SQL query | STD-002 | 1.00 | 1.0 | PASS |
| ev03_missing_input_validation | Unvalidated filename | STD-003 | 1.00 | 4.0 | PASS |
| ev04_path_traversal | No resolve+startsWith check | STD-004 | 1.00 | 1.0 | PASS |
| ev05_silent_error | Empty catch block | STD-005 | 1.00 | 5.0 | PASS |
| ev06_missing_tests | New src/ behaviour, no tests | STD-006, TEAM-001 | 1.00 | 2.0 | PASS |
| ev07_dead_code | Large commented-out block | STD-007 | 1.00 | 1.0 | PASS |
| ev08_weak_crypto | MD5 for password hashing | TEAM-002 | 1.00 | 3.0 | PASS |
| ev09_insecure_random | Math.random() for session token | TEAM-003 | 1.00 | 4.0 | PASS |
| ev10_reversible_password | AES encryption for passwords | TEAM-004 | 1.00 | 7.0 | PASS |
| ev11_tls_disabled | rejectUnauthorized: false | TEAM-005 | 1.00 | 5.0 | PASS |
| ev12_no_timeout | fetch() with no AbortController | TEAM-007 | 1.00 | 4.0 | PASS |
| ev13_os_command_injection | exec() with string interpolation | STD-002 | 0.00 | 4.0 | **FAIL** |
| ev14_ssrf | User-supplied URL to fetch() | STD-003 | 1.00 | 4.0 | PASS |
| ev15_missing_authz | DELETE with no auth check | (none) | 1.00 | 3.0 | PASS |
| ev16_unsafe_eval | eval() on user input | (none) | 1.00 | 4.0 | PASS |
| ev17_prototype_pollution | Recursive merge without key check | (none) | 1.00 | 5.0 | PASS |
| ev18_secret_in_log | Password logged in plaintext | STD-011 | 1.00 | 1.0 | PASS |
| ev19_multi_flaw | Hardcoded token + insecure random | STD-001 | 1.00 | 5.0 | PASS |
| ev20_clean | Safe file read, safe crypto, safe fetch | Clean | FP=3 | 5.0 | **FAIL** |

### ev13 failure detail

ev13 tests OS command injection via `exec(filename)`. Bob detected a CRITICAL security finding
for command injection but did NOT assign `Rule \`STD-002\``. The scorer requires the rule ID to
appear in at least one rep; finding it under "Other" with no rule ID gives recall=0.

Bob's finding title: "OS command injection via unsanitised filename passed to exec()". This is
substantively correct at CRITICAL severity but lacks the STD-002 rule tag. The rule mapping in
the reviewer prompt needs to cover `exec()` pattern as an explicit example of STD-002.

### ev20 failure detail

ev20 is a clean file (safe path traversal guard, safe fetch, safe crypto). Bob raised 3 false
positives at medium or higher: a spurious path-traversal risk and an SSRF risk that do not exist
in the actual code. The clean-case false-positive rate is higher than desired.

## Held-out set results (7/10)

| Case | Flaw type | Expected rule IDs | Recall | Avg findings | Result |
|---|---|---|---|---|---|
| ev21_regex_dos | Catastrophic backtracking regex | (none) | 1.00 | 6.0 | PASS |
| ev22_insecure_deserialise | node:vm user code escape | (none) | 1.00 | 7.0 | PASS |
| ev23_open_redirect | Unvalidated redirect URL | STD-003 | 1.00 | 5.0 | PASS |
| ev24_ecb_mode | AES-ECB mode | TEAM-002 | 1.00 | 6.0 | PASS |
| ev25_no_public_api_docs | New exports, no README update | TEAM-006 | 1.00 | 6.0 | PASS |
| ev26_stack_trace_leak | err.stack in HTTP 500 | STD-005 | 1.00 | 1.0 | PASS |
| ev27_noisy_but_fine | TODO + parameterised query (clean) | Clean | FP=3 | 4.0 | **FAIL** |
| ev28_clean_crypto | scrypt + timingSafeEqual (clean) | Clean | FP=2 | 3.0 | **FAIL** |
| ev29_missing_tests_complex | New class, no tests | STD-006, TEAM-001 | 1.00 | 2.0 | PASS |
| ev30_clean_network | URL allowlist, timeout, certs (clean) | Clean | FP=2 | 6.0 | **FAIL** |

### Clean-case false positives

Three of the four clean cases in the held-out set failed with false positives at medium+ severity:

- **ev27**: 3 FPs on a file with a TODO comment and a parameterised query builder. Bob flagged
  the parameterised query as SQL injection risk despite the query building pattern being safe.
- **ev28**: 2 FPs on correct scrypt+timingSafeEqual crypto. Bob raised concerns about the crypto
  parameters that were in fact set correctly.
- **ev30**: 2 FPs on a correctly implemented network client (allowlist, HTTPS, timeout,
  `rejectUnauthorized: true`). Bob flagged SSRF and TLS risks that are guarded.

These indicate that Bob's false-positive rate on clean code with security-adjacent patterns is
elevated. This is a known quality gap to address in a future prompt iteration.

## Overall quality metrics (1 rep each)

| Metric | Train (ev01-ev20) | Held-out (ev21-ev30) | Combined |
|---|---|---|---|
| Cases passed | 18/20 | 7/10 | **25/30 (83%)** |
| Flawed-case recall (avg) | 0.95 | 1.00 | **0.97** |
| Clean-case FP rate (avg per PR) | 3.0 (1 case) | 2.3 (3 cases) | **2.5** |
| Remediation score (avg) | 2.0 | 1.9 | **1.95** |
| Bob calls | 20 | 10 | **30** |
| Total cost (Bobcoins) | ~0.49 | ~0.22 | **0.7163** |

Notes:
- Remediation score 2 = code diff or code block in finding; 1 = text-only recommendation; 0 = none.
- Clean-case FP rate counts medium+ severity findings in security/standards/team_rule categories.
- All 30 eval PRs were 1 rep only (budget constraint); variance data is therefore unavailable.

## Known gaps and next steps

1. **ev13 STD-002 rule mapping**: OS command injection via `exec()` not mapped to STD-002. The
   reviewer prompt should add `exec()`/`execSync()` with string interpolation as an explicit
   example of STD-002 injection.
2. **Clean-case false-positive rate**: 4/4 clean cases produced at least 1 medium+ FP, and 3/4
   exceeded the allowed threshold. The reviewer is over-triggering on security-adjacent patterns
   (parameterised queries, correct crypto, allowlisted fetches). Suggest tightening the confidence
   threshold for security findings on code that includes defensive patterns.

## How to run

```bash
# Open all 30 eval PRs immediately (no waiting):
make evals-open

# After all PRs have bob-review comments, score and close:
make evals-score
```

Raw data: [`phase-6-evals-all.json`](phase-6-evals-all.json)

## Protocol: tuning constraint

Per the brief: the held-out set (ev21-ev30) was run once, without any prompt tuning after seeing
train results. The scores above are therefore unbiased for both sets. Any future prompt changes
motivated by these results must be validated on a fresh eval run before being reported.
