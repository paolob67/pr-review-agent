# Phase 4 Part B: runner results

Date: 2026-10-31. Bob Shell 2.0.9. Sandbox: `paolob67/notes-sandbox` (private, GitHub plan not
exposed by the API). Runner: GitHub-hosted `ubuntu-24.04`. Status: Part B complete, teardown proved and the sandbox
recreated; the 10-run budget is spent (see ledger); remaining items are listed at the end.

## Run ledger

Budget: at most 10 workflow runs, each with one Bob call. All 10 `bob-review` dispatches are used (7 made a
Bob call, 3 were gated before Bob). The budget is now spent and any further run needs the owner's
approval. Probe runs p1 to p3 use no Bob and are not counted.
Kill switch `BOB_REVIEW_ENABLED` is `false` again.

| # | Run id | What | Result | Bob call |
|---|---|---|---|---|
| 1 | 41189824151 | First `workflow_dispatch` on PR 1 | Pipeline ran end to end; Bob exit 1 after 1.1 s | Failed, no usage reported |
| 2 | 41190195150 | After adding the Bob stderr log line | Bob stderr: `EROFS: read-only file system, open '/home/bobrun/.bob/settings/settings.json'` | Failed |
| 3 | 41190877666 | After tmpfs home and `--accept-license` | Bob exit 0 in 11.4 s, 6 findings kept, 0.021952 Bobcoins reported; publish failed: LIST comments HTTP 403 | Yes |
| 4 | 41191200869 | After adding the GitHub error detail to the message | Same Bob result; 403 shows `accepted-permissions="issues=read; pull_requests=read"` | Yes |
| 5 | 41191515221 | After adding `pull-requests: read` to `publish` | LIST now allowed; POST comment HTTP 403 (`issues=write; pull_requests=write`) | Yes |
| 6 | 41194345332 | After ADR 0014 (`pull-requests: write` on `publish`) | One comment posted by `github-actions[bot]`, 6 findings, cites STD-001, STD-003, STD-006, TEAM-001, TEAM-003 | Yes (0.022152) |
| 7 | 41194487157 | Same SHA again | Same comment id updated in place (`runs: 2`, PR total 0.044338); still one comment | Yes |
| 8 | 41194943561 | Stale head SHA (`aaaa...`) | `skipped_stale`, `review` skipped, no comment, no Bob call | No |
| 9 | 41195024332 | PR number `1;id` | Rejected (`input_rejected`), nothing ran as a command; but `prepare` went red (artifact upload failed with no handoff) | No |
| 10 | 41196213271 | Same bad input after the fix | `prepare` green, `review` and `publish` skipped, no comment | No |
| p1 | 41191395923 | S17 probe workflow (no Bob) | See S17 | No |
| p2 | 41193375330 | S17 probe, extended with POST comment | See S17 | No |

Two `workflow_run` triggers also fired from the push that installs the workflow: one skipped (kill
switch off), one failed in `prepare` because a CI run on a push has no PR number (41190208123).
Runner time per bob-review run, summed over the three jobs: 55 to 78 seconds, 5 runs, about 5.5
minutes in total (billed minutes round up per job, so the billed figure is higher; not read from the
billing API).

## Findings

### Defects found and fixed (all became tests or workflow rules)

1. **Bob requires the license on first use** (run 2 onward, `bob run` in a fresh container). Fixed with
   `--accept-license` on every run, owner decision recorded in
   [ADR 0013](../adr/0013-bob-license-acceptance.md).
2. **Bob writes under `~/.bob`; the container rootfs is read-only** (run 2). Fixed: `/home/bobrun` is a
   tmpfs, and `seedBobHome` copies the root-owned default settings (auto-update off, AGENTS.md loading
   off, G30) into it at start. The Part A canary never saw this because it does not run a real Bob.
3. **A CI run on a push triggers `workflow_run` with no PR number** (run 41190208123). The gate now
   requires `github.event.workflow_run.event == 'pull_request'`.
4. **The review result carried no reason for a Bob failure**. `bob_failed` now logs the first 300
   characters of Bob's stderr, scrubbed and with control characters removed (G27).
5. **Publish errors hid the cause**. The GitHub client now reports the response `message` and the
   `x-accepted-github-permissions` header.
6. **Rejected input turned the run red** (run 9). `prepare` stops before writing a handoff, so the prompt
   upload failed. The upload now tolerates a missing file and `publish` runs only when a handoff exists.

### S19: runner reaches Bob, variable name

Answered. The hosted runner reached Bob and `BOB_API_KEY` authenticated (runs 3 to 5: exit 0, usage
reported). The variable name is `BOB_API_KEY`. `BOBSHELL_API_KEY` was not needed or set.

### S18: environment secrets on the owner's plan

Answered. `gh api` created environment `bob-review` on the private repo with a custom deployment
branch policy (`main`), and `BOB_API_KEY` was set as an environment secret. No fallback needed. Branch
protection on `main` is not available on this plan (HTTP 403, "Upgrade to GitHub Pro or make this
repository public"); the project does not depend on it.

### S20: delivery route

Partly answered. The per-run build from the trusted default-branch checkout works: `prepare` checks
out `main`, uploads `source` as an artifact, `review` and `publish` download it, `review` builds the
image with Docker on the runner (about 25 s of the review job). Artifacts pass cleanly between the
three jobs (`source`, `prompt`, `result`, `audit`; digests match). Not yet tested: a reviewed repo that
is different from the one holding the reviewer (reusable workflow or GHCR image), which is Phase 5.
The sandbox holds a copy of the reviewer, installed by `scripts/dev/install-sandbox-reviewer.sh`.

### S17: comment identity and token scope (CONTRADICTS THE PLAN)

Probe: [`scripts/spikes/s17-token-scope.sh`](../../scripts/spikes/s17-token-scope.sh), run twice
(41191395923, 41193375330) against PR 1 with five permission sets for the job `GITHUB_TOKEN`. The
refusal checks send invalid bodies, so a 422 means allowed and nothing is created.

| Permission set | LIST comments | GET pull | POST comment | POST review | POST check-run | POST status |
|---|---|---|---|---|---|---|
| `issues: write` | 403 | 403 | 403 | 403 | 403 | 403 |
| `issues: write` + `pull-requests: read` | 200 | 200 | 403 | 403 | 403 | 403 |
| `issues: write` + `contents: read` | 403 | 403 | 403 | 403 | 403 | 403 |
| `pull-requests: write` | 200 | 200 | 422 (allowed) | 422 (allowed) | 403 | 403 |
| `issues: write` + `pull-requests: write` | 200 | not shown | 422 (allowed) | not shown | not shown | not shown |

Observed: on a pull request, `issues: write` alone cannot list or post comments with the job
`GITHUB_TOKEN`, even though the response header lists `issues=write; pull_requests=write` as accepted.
Posting needs `pull-requests: write`, and that same scope allows the reviews endpoint. Check runs and
commit statuses are refused for every set tried (G34 holds for those two).

Consequence: the plan's claim that the publish token can have no pull-request scope (PLAN G25, G34,
ADR 0012 item 3) does not hold for the default identity. With `pull-requests: write` the token can
submit a review; whether it can submit an APPROVE is unverified (the repository setting
`can_approve_pull_request_reviews` reads `false` here, which GitHub documents as stopping Actions from
approving; not yet tested live).

Owner decision 2026-10-31: accept `pull-requests: write` on `publish`
([ADR 0014](../adr/0014-publish-token-pull-requests-write.md)). Live follow-up (probe p3,
`scripts/spikes/s17-approve-check.sh`, run 41196664772) with that scope:

| Attempt | Result |
|---|---|
| APPROVE | HTTP 422 "GitHub Actions is not permitted to approve pull requests" (repo setting `can_approve_pull_request_reviews` is `false`) |
| REQUEST_CHANGES | HTTP 200, review created with state CHANGES_REQUESTED (dismissed afterwards) |

So the bot cannot approve, but nothing at the platform level stops it submitting a blocking review. The
guarantee "never requests changes" rests on the client allowlist and tests, not on the token. Recorded
in ADR 0014 as a measured gap.

### Secret placement (G25, G27), from run 41194345332

- `BOB_API_KEY` appears in the `review` job log once, as a masked env entry (`BOB_API_KEY: ***`), and in
  no other job log (0 mentions in `prepare` and `publish`). The environment name `bob-review` does not
  appear in the other jobs.
- The masked values in `prepare` and `publish` are the job tokens (`SCM_READ_TOKEN`, `SCM_COMMENT_TOKEN`,
  the checkout token), not the Bob key.
- The four artifacts (`prompt`, `result`, `audit`, `source`; 32 source files) contain no token pattern
  (`ghs_`, `ghp_`, `github_pat_`, `Bearer ...`, `BOB_API_KEY=value`). Not done: a canary-value test on the
  runner; the offline G27 tests cover scrubbing with canary values.
- The job summary holds the audit record only.

## Teardown and recreate (2026-10-31, after the 10 runs)

`scripts/dev/teardown-sandbox.sh paolob67/notes-sandbox`, listing printed by the script afterwards:

```
deleted environment bob-review
deleted variable BOB_REVIEW_ENABLED
deleted variable BOB_REVIEW_REQUIRED_WORKFLOWS
removed reviewer files from main
environments:            (none)
repo secrets:            (none)
repo variables:          (none)
workflows:               CI   (only)
```

Extra checks: the environment secrets endpoint returns HTTP 404 (the environment is gone, so the
`BOB_API_KEY` environment secret went with it); `main` holds `.bob-review`, `.github`, `README.md`,
`package.json`, `src`, `test` and none of `reviewer/`, `integrations/`, `tests/container/` or the
`bob-review.yml` workflow. The PR and its bot comment were left in place.

Recreate with `scripts/dev/setup-sandbox.sh paolob67/notes-sandbox` (new script, the matching
creator for the teardown). Output, names only:

```
environment bob-review / branch policy main
variables set (kill switch is false)
installed on paolob67/notes-sandbox main: 7e891b9
environments: bob-review
environment secrets: BOB_API_KEY  2026-10-31T11:49:42Z
repo variables: BOB_REVIEW_ENABLED false, BOB_REVIEW_REQUIRED_WORKFLOWS CI
workflows: Bob review, CI
```

The Bob key was re-entered by the script: node reads the `apikey` field of the git-ignored
`pr-review-agent.json` and pipes it to `gh secret set` on stdin. The key was never printed, put on a
command line or written elsewhere; the agent saw only field names and a length.

Not verified: that the recreated secret authenticates. Proving it needs a Bob call, which is a workflow
run beyond the 10-run budget. The first run of Phase 5 will show it; if it fails with an invalid key
the cause is the key, not the setup.

## Not done yet

- A canary-secret run on the runner (needs a run beyond the spent budget).
- SETUP.md (GitHub part) and RUNBOOK.md teardown steps are drafted: [SETUP.md](../SETUP.md), [RUNBOOK.md](../RUNBOOK.md).
- The sandbox plan has no branch protection, so a blocking review's merge effect is untested.
