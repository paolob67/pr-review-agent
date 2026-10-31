# Phase 5 results: GitHub trigger and end-to-end matrix

Date: 2026-10-31. Bob Shell 2.0.9. Sandbox: `paolob67/notes-sandbox` (private). Workflow: `bob-review.yml`
at sandbox commit `6948bdb` (this repo commit "Phase 5: e2e matrix driver"). Design: [ADR 0015](../adr/0015-trigger-design.md).
Driver: [`tests/e2e/matrix.mjs`](../../tests/e2e/matrix.mjs). Raw evidence: [`phase-5-evidence/`](phase-5-evidence/)
(`matrix.json` holds every check with its detail; the first bot comment of each case is saved next to it).

Image digest: the image is built on the runner for every run (S20, per-run build), so the digest is
recorded in each run's cost record and changes with each build (17 distinct digests over the 57 runs).
Every review ran Bob Shell 2.0.9.

## Gate status

| Gate item | Result |
|---|---|
| Every matrix case passes or has an owner-accepted deviation | 13 of 13 same-repo cases pass. Five cases need a second GitHub account and are recorded as owner-accepted deviations (see "Owner-pending cases") |
| S15 answered | Answered for same-repo PRs by live runs; the fork payload part is not live-verified (needs the second account) |
| Lint clean | `make lint`, actionlint, zizmor (three ignored by design, `.github/zizmor.yml`) |
| No workflow checks out PR code | Checked by `workflow-policy.js` (every workflow) and by the live runs; the only checkout is the default branch |
| Bot identity has no approval path, shown by a test | Partly. APPROVE is refused (HTTP 422, probe repeated below). REQUEST_CHANGES is not refused (measured G34 gap, ADR 0014, unchanged). The "does not satisfy a required-approval rule" half cannot be tested: branch protection is unavailable on the owner's plan (HTTP 403) |

## Matrix

Every case opens its own PR, waits for the workflows to settle, reads the audit lines from the job logs
and the bot comments through the API, closes the PR and deletes the branch. All checks are in
`matrix.json`. PR links are to the (closed) PRs.

| Case | Guardrails | Expected | Observed | Result | PR |
|---|---|---|---|---|---|
| c01 green same-repo PR | G12 G31 G18 G34 | One review, one comment for the head SHA, posted by `github-actions[bot]` | Both required workflows green; two firings, one reviewed, one comment; recreated Bob key authenticates | PASS (9/9) | [3](https://github.com/paolob67/notes-sandbox/pull/3) |
| c02 red CI | G31 G12 | No review, no comment | Firing for the red workflow skipped; the other stops `ci_not_green`; 0 Bob calls, 0 comments | PASS (6/6) | [4](https://github.com/paolob67/notes-sandbox/pull/4) |
| c03 cancelled CI | G31 | No review, no comment | Stops `ci_pending`; 0 Bob calls | PASS (5/5) | [5](https://github.com/paolob67/notes-sandbox/pull/5) |
| c04 two required workflows, one red, then fixed | G31 | Red: nothing. After the fix: one review | Phase 1 `ci_not_green`, 0 calls; phase 2 reviewed, 1 comment for the new head | PASS (13/13) | [6](https://github.com/paolob67/notes-sandbox/pull/6) |
| c05 draft | G9 | Skipped, no comment | `skipped_gate` reason `draft` on both firings; 0 calls | PASS (5/5) | [9](https://github.com/paolob67/notes-sandbox/pull/9) |
| c06 oversized diff | G8 | No Bob call, short note | 260180 byte diff; `skipped_gate` reason `size_exceeded`; one note; 0 calls | PASS (10/10) | [10](https://github.com/paolob67/notes-sandbox/pull/10) |
| c07 stale and two rapid pushes | G11 G32 | Only the last SHA reviewed | Firings for the two earlier SHAs stop `no_open_pr`; one review, one comment for the last head | PASS (10/10) | [11](https://github.com/paolob67/notes-sandbox/pull/11) |
| c08 PR edits its own rules | G33 | Base-branch rules used | `rules: standards yes`; no finding under the PR-added `STD-099`; Bob named it under "Needs human attention" as an attempted rule injection | PASS (9/9) | [21](https://github.com/paolob67/notes-sandbox/pull/21) |
| c09 hostile names, label, re-run, cap | G6 G24 G7 G12 G14 G18 | Names inert; `documentation` label does nothing; `ai-review` re-reviews and updates the same comment; third run reviewed; fourth hits the cap | All as expected: runs 1, 2, 3 in one comment; fourth trigger `skipped_gate` reason `pr_run_limit_reached`; no command output in any prepare log | PASS (30/30) | [17](https://github.com/paolob67/notes-sandbox/pull/17) |
| c10 label during a review | G11 | Newer trigger cancels the running review; one comment | Two review jobs cancelled by the per-PR group; one review finished; one comment | PASS (10/10) | [15](https://github.com/paolob67/notes-sandbox/pull/15) |
| c11 kill switch off | G10 | Nothing runs | Both firings skipped; 0 calls | PASS (5/5) | [18](https://github.com/paolob67/notes-sandbox/pull/18) |
| c12 Bob timeout (1 s) | G13 | Short note, green run | `bob_unavailable`, one note, run green | PASS (8/8) | [19](https://github.com/paolob67/notes-sandbox/pull/19) |
| c13 invalid Bob key | G16 G25 | Short note, green run, key not echoed | Bob stderr "Invalid or expired API key"; `bob_unavailable`; note posted; real key restored afterwards (the c08 rerun reviewed normally) | PASS (9/9) | [20](https://github.com/paolob67/notes-sandbox/pull/20) |

Checks applied to every case: no `@mention` in a comment (G17), the "AI Assisted" banner is present (G35),
no token pattern in a comment (G27), the author is `github-actions[bot]`, no red bob-review run, no command
output from a hostile value in a prepare log (G24).

### Owner-pending cases (owner-accepted deviation, 2026-10-31)

The owner has no second GitHub account for now (answer to the Phase 5 question). These planned cases
are therefore not run. None changes the guardrail design; each is covered offline, as stated.

| Case | Why it cannot run | Offline cover |
|---|---|---|
| Fork PR | A private repo cannot be forked by its owner | `resolve-trigger` unit tests (PR resolved from the SHA, `pull_requests` ignored) |
| Outside contributor without the label | Needs a second account | `gate.test.js` author policy (G7) |
| Outside contributor, then the label | Same | `gate.test.js` G7b and G7c, live label path proven on a same-repo PR in c09 |
| Bot does not satisfy a required-approval rule | No branch protection on the owner's plan (HTTP 403) | None; the approval refusal below is the closest proof |
| Fork payload for S15 | Needs a fork | ADR 0015 argument from the GitHub docs, unverified live |

## Bot identity and approval (S17 re-check)

`scripts/spikes/s17-approve-check.sh paolob67/notes-sandbox 1`, 2026-10-31, job token with
`pull-requests: write`, repo setting `can_approve_pull_request_reviews=false`:

- APPROVE: HTTP 422, "GitHub Actions is not permitted to approve pull requests."
- REQUEST_CHANGES: HTTP 200, review created as `github-actions[bot]`, dismissed by the script afterwards.

This repeats the Phase 4 result: the bot has no approval path; the REQUEST_CHANGES gap of G34 remains
and is held only by code (unit tests, mutations G34a, G34b, G34w) as ADR 0014 records. No matrix case
exercises the reviews endpoint, because the workflow never calls it.

## S15 answers

| Question | Answer | Evidence |
|---|---|---|
| Does `workflow_run` fire once per required workflow? | Yes. With CI and Lint required, every PR head produced two firings (one per workflow). Both ran `prepare`; G31 makes the one that sees the other workflow still running stop quietly (`ci_pending`) and lets a later firing review | c01, c04 |
| How is the PR resolved? | From the head SHA through `GET /commits/{sha}/pulls`, keeping only an open PR of this repo whose head is that SHA. A SHA that is no longer a PR head resolves to `no_open_pr` and ends quietly | c07 (four `no_open_pr` stops), unit tests |
| Several required workflows, one red? | No review while any required workflow is red, pending or missing; the review happens after the fix | c02, c03, c04 |
| Re-runs? | A re-run of CI fires `workflow_run` again and produces a new review (counted by the per-PR cap); at the cap the existing comment stays and no Bob call is made | c09 |
| Rapid pushes / push during CI? | Firings for superseded SHAs end `no_open_pr`; only the latest SHA is reviewed | c07 |
| Concurrency | Per-job groups cancel an in-flight review when a newer trigger arrives; the quiet-stop runs cannot cancel a real review because the group lives on the jobs, not the workflow | c10, c01 |
| Is the Bob key reachable by PR code? | No PR code runs in any trigger workflow; the key is in the `review` job only. The invalid-key case shows the environment secret is the one used | c13, Phase 4 |
| Hostile branch name, title, body, commit message | Inert: no command output in any prepare log, nothing echoed into a shell, no live mention in the comment | c09 |
| `workflow_run` payload for a fork PR (`pull_requests` empty?) | Not verified live. The design does not depend on the field (the PR comes from the SHA). Unverified until the second account exists | Owner-pending |
| Fork PRs and secrets | Not verified live. The fork would still be reviewed by a default-branch workflow run; the key stays in the trusted `review` job. Unverified | Owner-pending |

S15 is therefore answered for same-repo PRs and for the design (fork behaviour does not change any
decision); the fork payload and the fork review remain to be observed when a second account exists.

## Defects found and fixed

Matrix driver (none reached the guardrails):

1. `gh api` refuses job logs that contain terminal escape sequences, so the first c01 attempt read empty
   logs. Fixed with `--allow-escape-sequences` and colour stripping.
2. The gate check used the wrong audit field (`reason` versus `detail`). The audit line is
   `gate_skipped` with `reason` holding the outcome code and `detail` the specific cause (stages.js passes
   outcome and reason). Fixed to read `detail`.
3. `--only` took one value only; it now repeats.
4. c08 first failed because Bob wrote the injected rule's name in the summary and under "Needs human
   attention" (correct behaviour). The check now looks for a finding labelled `Rule STD-099` inside the
   Findings section.
5. c09 first failed on a check that expected the hostile title to be echoed or absent. The reviewer never
   prints the title; the check was replaced by a live-mention check (`@octocat`).
6. Two driver runs started in the same shell command as a driver edit used the old code; those results were
   discarded and the cases rerun.

Workflow and trigger: no defect found by the matrix. Changes made earlier in the phase (head SHA logged by the
trigger script, per-job concurrency, `ai-review` label override) are in ADR 0015.

## Findings worth knowing

- Two required workflows double the firings. When both are green, both firings can be ready within
  seconds and the second cancels the first review job (14 cancelled review jobs over the 57 runs). A
  cancelled review may already have called Bob; its cost has no record (unverified). Required workflows that finish
  close together therefore cost some wasted starts. Mitigation if it matters: require one workflow, or add
  a short wait in `prepare`. Not changed.
- Bob named the injected rule in c08 under "Needs human attention", which is the behaviour wanted.
- Cost: the 15 reviews that completed (outcome `reviewed`) report 0.3448 Bobcoins in total (about 0.023
  each) and 295 s of run time; two more runs were `bob_unavailable` by design (c12, c13).

## Run ledger

Budget in the brief: about 40 workflow runs. Used: 57 `bob-review` runs since the matrix started (the
sandbox also ran CI and Lint on every PR commit, plus the S17 probe). Over budget by 17 (the count includes the firings that ended in a quiet stop).

| Runs | Count | Notes |
|---|---|---|
| Review finished with outcome `reviewed` | 15 | One Bob call each |
| Review ended `bob_unavailable` | 2 | c12, c13 (designed failures) |
| Gated before Bob (`skipped_gate`) | 10 | c05, c06, c09 cap and the second firing of each |
| Quiet stop in `prepare` (`no_open_pr` 4, `ci_not_green` 2, `ci_pending` 1) | 7 | No Bob call |
| Skipped by job conditions (kill switch off in c11, firings of a failed or cancelled CI run, labels other than `ai-review`) | 9 | No job ran |
| `prepare` ready, `review` cancelled by a newer trigger | 14 | See findings |
| Total | 57 | |

Causes of the overrun: two required workflows give two firings per head; the driver was corrected and
rerun for c01, c05, c06, c08 and c09; c09 and c10 trigger several deliberate re-reviews. The owner should
accept the overrun or ask for a one-workflow configuration to halve the firings.

Sandbox state at the end: kill switch `false`, `BOB_REVIEW_REQUIRED_WORKFLOWS=CI,Lint`, no timeout variable,
Bob key restored, label `ai-review` present, no open test PRs (PR 1 from Phase 4 stays open), the S17 probe
workflow removed.

## Remaining risks

1. Fork and outside-contributor behaviour is unverified live (second account needed).
2. The required-approval rule cannot be tested on this plan; G34 depends on code, not on token scope.
3. Firing duplication and cancelled reviews (above).
4. Delivery to repos other than the sandbox is still a per-run build from a copy installed in the repo
   (S20, decided in Phase 8).
