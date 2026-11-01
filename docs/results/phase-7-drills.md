# Phase 7 results: operational drills

Date: 2026-11-01. Bob Shell 2.0.9. Sandbox: `paolob67/notes-sandbox` (private), PR 1 (head `7b1a3bf`).
Workflow: `bob-review.yml` as installed from this repo. Runner: `ubuntu-24.04`. Raw data:
[`cost-data.json`](cost-data.json). Commands are the ones that were run, with `OWNER/REPO` for the sandbox.
No secret value appears anywhere in this file; key files are git-ignored and were read through a pipe.

## Summary

| Drill | Result | Time | Runs used |
|---|---|---|---|
| Kill switch | PASS: run `skipped`, no job ran, no artifact, comment untouched | 15 s | 1 |
| Per-PR cap (G14) | PASS: fourth review stopped at `pr_run_limit_reached`, comment untouched; cap reset by deleting the marker comment | 90 s | 3 |
| Bob key rotation | PASS: new key verified before the old one was revoked | 89 s (excluding the revoke in the Bob portal) | 1 |
| Revoked key / incident | PASS: the revoked key fails with `bob_unavailable`, short note, green run, key not in logs | 84 s | 1 |
| Rebuild from SETUP.md | PASS after teardown, no undocumented command; two doc gaps fixed (see below) | 9 s teardown, 15 s rebuild, 82 s first review | 1 |
| Artifact retention (G26) | PASS: 693 artifacts, 12.05 MiB, retention as configured, none past `expires_at` | n/a | 0 |

Workflow runs used by the drills: 8 `bob-review` runs (budget 20): 7 manual dispatches (kill switch, review 3,
cap, reset, rotation check, revoked key, rebuild) and one `workflow_run` firing that the kill switch skipped
(caused by the CI run on the reinstall push). Five runs called Bob (the kill switch and cap runs did not). Reported usage:
0.0976 Bobcoins (0.0416 + 0.0165 + 0.0223 + 0.0172; the revoked-key run reported none).

## 1. Kill switch (G10)

State before: `BOB_REVIEW_ENABLED=false` (left that way after Phase 6).

```bash
gh workflow run bob-review.yml -R OWNER/REPO --ref main -f pr_number=1 -f head_sha=<40 hex>
gh api repos/OWNER/REPO/actions/runs/<id>/jobs --jq '.jobs[]|[.name,.conclusion]|@tsv'
gh api repos/OWNER/REPO/actions/runs/<id>/artifacts --jq '.total_count'
```

Observed (run `41302422227`): conclusion `skipped` within 2 s of creation. `prepare`, `review` and `publish`
all `skipped`; the jobs show a start and end time one second apart. 0 artifacts. The PR comment's
`updated_at` did not change. No Bob call, so no Bobcoins. Runner minutes for skipped jobs are counted as 0 in
this project's tables; that is an assumption (a job skipped by `if:` never gets a runner), not a figure GitHub
reported.

What broke: nothing. Note for the operator: GitHub still creates a run and lists three skipped jobs; "no
review and no cost" is shown by the job conclusions, not by the absence of a run.

## 2. Per-PR cap (G14)

PR 1 already had `runs:2` in its marker comment.

1. Review 3 (run `41302486248`, dispatch): `reviewed`, 79 s, 0.0416 Bobcoins, marker `runs:3`.
2. Trigger 4 (run `41302608735`): `prepare` logged
   `{"event":"gate_skipped","reason":"skipped_gate","detail":"pr_run_limit_reached"}`. `review` skipped, `publish` ran
   (success, 13 s), audit record `{"outcome":"skipped_gate","cost":null}`. Because a marker comment already
   existed, no note was posted and the comment's `updated_at` did not change. The run is green. The cap stops
   quietly when a review already exists, and posts a short note only when no review comment exists
   (`stages.js`, budget gate).
3. Reset: deleting the bot's comment resets the counter, because the count lives only in the marker.
   Run `41302696124` then reviewed normally, marker `runs:1`.

```bash
gh api repos/OWNER/REPO/issues/N/comments --jq '.[]|select(.user.login=="github-actions[bot]")|.id' \
  | xargs -I{} gh api -X DELETE repos/OWNER/REPO/issues/comments/{}
```

Finding: the cap is a soft limit. Anyone who can delete the bot comment resets it. The data shows the
effect: PR 1 had 9 reviews in the cost data after these drills. This is acceptable for an advisory tool with a
human maintainer, and is stated in the runbook, but a hard cap would need state outside the comment (not built;
ADR 0009 dropped daily caps for the same reason). The cost of one extra review is about 0.02 Bobcoins.

Finding: the `ai-review` label counts towards the cap (Phase 5, c09), so a maintainer re-requesting a review of
a capped PR is refused too. The runbook says to delete the comment first.

## 3. Bob key rotation

The owner created a new key and saved it to a git-ignored file. The first attempt used a file name that
`.gitignore` did not cover; it was renamed before anything was committed, and `git status` never listed it.

Order used (differs from the Phase 4 draft, which revoked before verifying):

| Step | Command | Time |
|---|---|---|
| 1 | kill switch off: `gh variable set BOB_REVIEW_ENABLED -R OWNER/REPO --body false` | <1 s |
| 2 | replace the secret from a file, through a pipe: `node -e '...' \| gh secret set BOB_API_KEY --env bob-review -R OWNER/REPO` | 1 s |
| 3 | kill switch on | 1 s |
| 4 | verification review (run `41303348517`): `reviewed`, 82 s, 0.0223 Bobcoins | 82 s |
| 5 | owner revoked the old key in the Bob portal | not timed |

`gh secret list --env bob-review` shows the secret name and its update time (`2026-10-31T16:47:36Z` before,
`2026-11-01T11:46:09Z` after), which is how to confirm the replacement landed. The secret value is never
readable back.

What broke: nothing in the sequence. Verifying before revoking is the safer order: if the new key were wrong,
the old one still works and reviews can resume at once. Revoking first risks an outage with no fallback.

## 4. Revoked key and leaked-key incident

Revocation check. After the owner revoked the old key, the old key was put into the secret on purpose (kill
switch off while changing it) and a review was run (run `41303511196`):

- `review` job: `bob_finished` exit code 1 after 6.5 s; `bob_failed` with stderr head
  `Error: Request Failed. Invalid or expired API key.`
- Outcome `bob_unavailable`; one short "Review unavailable" note posted with the AI Assisted banner and
  `Details: Bob exited with code 1`; no Bobcoins; the run is green.
- The new key was then restored the same way and the kill switch turned on.

This proves two things: revocation takes effect for the next call immediately, and a dead key degrades to a
visible note rather than a silent failure or a red run. Phase 5 case c13 showed the same with a made-up key;
this run used a real, revoked one.

Abuse check (what an operator looks at after a suspected leak), all read-only:

| Question | Command | Answer for this project |
|---|---|---|
| Who ran the workflow? | `gh api --paginate "repos/OWNER/REPO/actions/runs?per_page=100&created=>=DATE" --jq '.workflow_runs[]\|[.name,.event,.actor.login]\|@tsv'` | 516 runs since 2026-10-30, one actor (`paolob67`); events `workflow_run` 246, `pull_request` 225, `push` 20, `workflow_dispatch` 16, `pull_request_target` 5 |
| Did anything run outside `main`? | same listing, check `head_branch` of dispatch runs | every `workflow_dispatch` run is on `main`; none elsewhere |
| Which jobs used the secret? | `gh api --paginate "repos/OWNER/REPO/deployments?environment=bob-review"` | 212 deployments, 209 on `main`; three on hostile-named PR branches from Phase 5 (`e2e/$(id);echo-pwned...`, `e2e/c10-...`), all created by the owner's own matrix driver at 16:17 to 16:35 on 2026-10-31 and all succeeded with a `pull_request_target` run that checks out the base branch |
| Is the key reachable from a log? | grep the run logs for the live value (done in memory, the value was removed afterwards) | 0 lines in the six drill runs |
| What did Bob bill? | Bob portal / Bobalytics | Bobalytics not available (S16). The owner reported 95.58 Bobcoins spent on 2026-11-01 across the reviewer and local Bob use |

The three non-`main` deployments are accounted for. Each matches exactly one successful `pull_request_target`
review job from the Phase 5 matrix (runs `41218911486` at 16:16:53, `41219458484` at 16:23:30 and
`41220381010` at 16:35:01 on 2026-10-31); the sibling runs that were skipped created no deployment. The
creator is the owner, and the workflow checks out no PR code. So they are not an abuse signal. What is
unexplained is why a deployment recorded against a PR head branch passed an environment limited to `main`:
the deployments exist and succeeded, but no recorded result shows which ref GitHub checked the branch policy
against for `pull_request_target`. Unverified; worth one probe before the article claims "the key is
reachable from `main` only".

Incident procedure derived from the drill (written into the runbook): revoke the key in Bob first, set the kill
switch, then investigate; rotation follows once the cause is known.

## 5. Rebuild from the documents

Teardown, then recreate by following SETUP.md only, then one review.

| Phase | Command | Time |
|---|---|---|
| Teardown | `scripts/dev/teardown-sandbox.sh OWNER/REPO` | 9 s |
| Listing after | no environments, no secrets, no variables, only `CI` | n/a |
| SETUP steps 1 to 3 | the exact `gh` commands in SETUP.md; step 3 by the manual `gh secret set` route with the key piped from a file | 4 s |
| SETUP step 4 | `scripts/dev/install-sandbox-reviewer.sh OWNER/REPO` (installed at `0a78ba5`) | 11 s |
| SETUP step 5 | `gh api repos/OWNER/REPO/actions/permissions/workflow` gave `can_approve_pull_request_reviews=false` | 1 s |
| SETUP step 6 | kill switch on, manual dispatch (run `41303825382`): three green jobs, one comment by `github-actions[bot]`, 0.0172 Bobcoins | 82 s |

Result: the sandbox was rebuilt to a working state with no step outside SETUP.md. Doc gaps found and fixed:

1. SETUP.md step 6 said "40 hex head SHA of PR N" without saying how to get it. Added the `gh pr view` command.
2. The rebuild proves the GitHub configuration only. It does not prove a cold start in a different repository,
   because step 4 depends on a sandbox-only script and delivery is undecided (S20, Phase 8). SETUP.md now
   says so at the point of use instead of leaving it to the end.

Still not proven: recreation in a second, empty repository. That needs the S20 delivery decision and is carried
to Phase 8.

## 6. Artifact retention (G26)

Listed on 2026-11-01 with `gh api --paginate repos/OWNER/REPO/artifacts`:

| Artifact | Count | Total bytes | Mean bytes | Retention set | Observed `expires_at - created_at` |
|---|---|---|---|---|---|
| `source` | 216 | 11,343,456 | 52,516 | 1 day | 1.00 day |
| `prompt` | 216 | 1,014,773 | 4,698 | 1 day | 1.00 day |
| `result` | 136 | 218,159 | 1,604 | 1 day | 1.00 day |
| `audit` | 125 | 61,280 | 490 | 14 days | 14.00 days |
| Total | 693 | 12,637,668 (12.05 MiB) | | | |

None is flagged expired or past `expires_at` at listing time. `source` is the trusted reviewer code, 90 per cent
of the bytes, and expires in a day. `audit` holds only the cost record and outcome: the largest audit file seen
is 644 bytes and its keys are `outcome` and the cost record fields, with no PR content and no secrets (G26,
CONTRACTS section 7).

Finding that matters for G26: the `prompt` artifact is `handoff.json`, and it contains the `prompt` and
`redactedDiff` strings (keys: `prompt`, `redactedDiff`, `ruleIds`, `inputs`, and others). G26 and CONTRACTS section 2
describe it as "redacted prompt text", and that is what it is; it does include the redacted diff of the PR for one
day. In a private repository this is readable only by people with read access to the repository, but anyone with
that access can download it for a day. This matches the documented design and is now stated in the runbook; it is
a point for the article. Redaction (G15) is the control, not access.

Cost of storage: 12 MiB is far below any plan's included artifact storage; GitHub's billing page says current
storage drops when artifacts are deleted but accrued GB-hours stay on the bill
([GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)).
Default retention is 90 days and can be set per artifact in the workflow
([Removing workflow artifacts](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/remove-workflow-artifacts)).

## Findings that change something

1. Cap and rotation order: runbook updated (see below).
2. Cap is soft (comment deletion resets it): documented.
3. 29 reviews were paid for but never published (section 7 of [cost-summary.md](cost-summary.md)): Bob finished,
   then a newer trigger cancelled the job. This is the biggest cost finding of the phase.
4. The cost record never carries runner minutes (`compute.runner_minutes` is null in all 114 audit records
   with a cost). Runner minutes are therefore derived from the workflow API; see cost-summary.md.

## Not done in this phase

- S16 (Bobalytics): not available in the portal at this time (owner, 2026-11-01). No reconciliation by dashboard.
- Rotation of a dedicated comment token: not applicable, the workflow uses `GITHUB_TOKEN` (ADR 0014).
- Cold start in a second repository: needs S20.
