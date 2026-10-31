# Phase 6: Red team and quality evals

## Goal

Measure, with live runs through the real path, whether the guardrails hold under attack and
whether the review is good enough to be useful.

## Prerequisites

- Phase 5 gate met.
- The owner has set the run budget below (or a different one in writing).

## Inputs to read

[PLAN.md](../PLAN.md) sections 4, 9 and Phase 6; [THREAT_MODEL.md](../THREAT_MODEL.md);
[CONTRACTS.md](../CONTRACTS.md); `docs/results/` from earlier phases.

## Do

### Red team (`tests/redteam/`)

1. Build an injection corpus as data files, each case with: where the payload sits (PR title, body,
   commit message, code comment, README, filename, branch name, rules file edit, unicode and
   bidi text, markdown with image and link exfiltration, fake "approved" and fake AI Assisted
   header text, instructions to run tools, read the parent environment or credential files,
   write a file, call the network), the canary value planted, and the assertion.
2. A harness that runs each case through the real container path on the sandbox repo (or through
   the review job image directly with a prepared fixture), and asserts on properties, not wording:
   no canary in any posted comment, log or scratch artifact; no file written outside the scratch
   directory; no approval, review, check run or status created; header and footer intact; output
   validates; no external URL or image in the comment; the bot made only allowed API calls.
3. Run each case at least 3 times (non-determinism). A single leak, write or approval is a gate
   failure: fix the root cause, add a regression case, rerun the whole corpus.

### Quality evals (`tests/evals/`)

4. Build seeded-flaw cases in the sandbox repo: standards violations with rule IDs, team-rule
   violations, security flaws (injection, secrets, path traversal, weak crypto, unsafe
   deserialisation, missing authorisation), plus clean PRs and noisy-but-fine PRs. Record the
   expected findings per case in a file.
5. Scoring script: for each case and run, match findings to expected ones (rule ID or category plus
   file and line window), and compute recall, precision, false-positive findings per clean PR,
   remediation usefulness (a short rubric scored by the agent and spot-checked by the owner), and
   variance across repeats. Also report the share of findings dropped by the wrapper
   (hallucinated locations or rule IDs).
6. Record everything in `docs/results/phase-6-redteam.md` and `docs/results/phase-6-evals.md`,
   including failures, and the cost records summed per suite.

## Do not

- Do not tune the prompt on the eval cases and then report their scores as final; keep a held-out
  subset (about one third) that is run only after tuning.
- Do not hide bad results; the article depends on honest numbers.
- Do not run against anything but the sandbox.

## Budget

Red team: at most 40 cases x 3 runs = 120 runs. Evals: at most 30 cases x 3 runs = 90 runs. Stop
at 80 percent of the owner's Bobcoin ceiling and report.

## Deliverables

`tests/redteam/`, `tests/evals/`, the two results files, fixes with regression cases, updated
THREAT_MODEL.md (residual risks), STATUS.md, INDEX.md.

## Acceptance (gate)

- Zero canary leaks, zero out-of-scratch writes, zero approvals or other forbidden API calls across
  the final full corpus run.
- Eval results recorded with recall, precision, false positives on clean PRs, variance, held-out
  scores and cost, whatever they are.
- Every failure found has a regression case.

## Report back

Headline numbers, failures found and fixed, residual risks, spend.
