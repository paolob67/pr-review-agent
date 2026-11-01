# Runbook

For the person who operates the AI Assisted PR reviewer. Every command below was run in the sandbox during
Phase 7 unless marked **not drilled**; the record, with timings and run ids, is in
[results/phase-7-drills.md](results/phase-7-drills.md). Setup is in [SETUP.md](SETUP.md). Replace `OWNER/REPO`.

## First five minutes

If something looks wrong (a bad comment, unexpected cost, a suspected leaked key), stop first and investigate
after:

1. **Switch reviews off** (about 1 second, covers every trigger):

   ```bash
   gh variable set BOB_REVIEW_ENABLED -R OWNER/REPO --body false
   ```

2. If the Bob key may be exposed, **revoke it in Bob now** (see [Leaked key](#leaked-key-incident)).
3. Note the time and what you saw. Then go to the section that matches.

| Symptom | Section |
|---|---|
| No comment appeared on a PR | [A review did not appear](#a-review-did-not-appear) |
| Comment says "Review unavailable" | [A review did not appear](#a-review-did-not-appear), step 4 |
| Bobcoin spend is higher than expected | [Unexpected cost](#unexpected-cost) |
| Key leaked, or about to expire | [Leaked key](#leaked-key-incident), [Rotate the Bob key](#rotate-the-bob-key) |
| Rebuilding or retiring the setup | [Teardown and rebuild](#teardown-and-rebuild) |

## Kill switch

```bash
gh variable set BOB_REVIEW_ENABLED -R OWNER/REPO --body false   # off
gh variable set BOB_REVIEW_ENABLED -R OWNER/REPO --body true    # on
gh variable list -R OWNER/REPO                                   # check
```

The `prepare` job's `if:` requires exactly `true`, so anything else (false, empty, deleted) is off. It covers
the `workflow_run` after CI, the `ai-review` label and a manual `workflow_dispatch`.

Drilled (2026-11-01, run `41302422227`): with the switch off, a dispatch ended `skipped` in 2 seconds, all three
jobs `skipped`, no artifact, no comment change, no Bob call. GitHub still creates a run, so a list of
`skipped` runs is expected while the switch is off, not a fault. A review already running when you switch off
finishes; to stop it, cancel the run: `gh run cancel RUN_ID -R OWNER/REPO` (**not drilled**).

## A review did not appear

Work down this list; the first match is the cause. Each check is read-only.

1. **Kill switch.** `gh variable get BOB_REVIEW_ENABLED -R OWNER/REPO` must print `true`.
2. **Is there a run?** `gh run list -R OWNER/REPO -w bob-review.yml -L 10`. No run at all: the trigger did not fire
   (CI did not run on a `pull_request`; a push-triggered CI run never reviews).
3. **What did `prepare` decide?** Open the run, or:

   ```bash
   gh run view RUN_ID -R OWNER/REPO --log | grep -E '"event":"(trigger|gate_skipped)"'
   ```

   | Log reason | Meaning | What to do |
   |---|---|---|
   | `ci_pending`, `ci_not_green`, `ci_missing` | A required workflow is not green on this head SHA | Fix CI; the review follows the green run. `BOB_REVIEW_REQUIRED_WORKFLOWS` must match the workflow names exactly |
   | `no_open_pr` | The SHA is no longer a PR head, or the PR is closed | Normal after a push |
   | `pr_run_limit_reached` | This PR has had 3 reviews | [Per-PR cap](#per-pr-cap) |
   | `author_policy` | The author is an outside contributor | A maintainer adds the `ai-review` label |
   | `draft` | Draft PR | Mark ready for review |
   | `size_exceeded` | Diff over the size gate; a short note is posted | Split the PR |
   | `ignored_paths` | Only lockfiles, generated files or docs changed | Normal |
   | `head_moved`, `pr_closed` | Stale run | Normal |

4. **Bob failed.** The comment says "Review unavailable" with the outcome `bob_unavailable` and `Details: Bob
   exited with code 1`. The reason is in the `review` job log, events `bob_finished` and `bob_failed`, field
   `stderr_head`:

   ```bash
   gh run view RUN_ID -R OWNER/REPO --log | grep -E '"event":"bob_(finished|failed)"'
   ```

   `Invalid or expired API key` means the key is revoked or expired: [rotate it](#rotate-the-bob-key). Drilled with
   a revoked key (run `41303511196`): `bob_finished` exit code 1 after 6.5 seconds, one short note, a green run, no
   cost. A timeout gives the same note (Phase 5, c12).
5. **Cancelled review job.** A newer trigger for the same PR cancels an older review (G11). With two required
   workflows the second firing usually cancels the first. This is normal and the newer run publishes. It is also
   the largest source of unrecorded cost: see [Unexpected cost](#unexpected-cost).

## Per-PR cap

Each PR is reviewed at most 3 times (G14). The count lives only in the hidden marker of the bot comment.

- At the cap the run is green and stops with `pr_run_limit_reached`. If a review comment already exists, nothing
  is posted and the comment is left as it was; if none exists, a short note is posted. Drilled: run `41302608735`,
  comment `updated_at` unchanged.
- The `ai-review` label counts towards the cap, so it does not help at the cap.
- **To allow more reviews of one PR**, delete the bot comment, then trigger again (drilled, run `41302696124`
  reviewed normally with the counter back at 1):

  ```bash
  gh api repos/OWNER/REPO/issues/N/comments --jq '.[]|select(.user.login=="github-actions[bot]")|.id' \
    | xargs -I{} gh api -X DELETE repos/OWNER/REPO/issues/comments/{}
  ```

- **The cap is soft.** Anyone who can delete the comment resets it, so a loop of delete and re-run can
  exceed it. Watch for a PR with many reviews: PR 1 reached 9 reviews during the drills at about 0.02 Bobcoins each.
- To change the limit for the whole repository, set `REVIEW_MAX_RUNS_PER_PR` in the workflow `env:` (**not
  drilled**), or edit `maxRunsPerPR` in `reviewer/config/caps.json`.

## Rotate the Bob key

The order matters: **verify the new key before revoking the old one.** If the new key is wrong, the old one still
works and you can undo the change. Drilled 2026-11-01: 89 seconds without the portal steps.

1. Create a new key in Bob. Note its expiry. Save it to a file that git ignores. Check the name first with
   `git check-ignore -v FILE`: a name that no `.gitignore` pattern covers shows up in `git status` as untracked and
   can be committed by mistake (`*apikey*.json` is covered; a plain `*-new.json` is not).
2. Kill switch off.
3. Replace the secret from the file through a pipe (never on the command line):

   ```bash
   node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("KEYFILE","utf8")).apikey)' \
     | gh secret set BOB_API_KEY --env bob-review -R OWNER/REPO
   gh secret list --env bob-review -R OWNER/REPO     # the update time must be now
   ```

4. Kill switch on, then run one review (PR number N, and the 40 character head SHA of PR N):

   ```bash
   SHA=$(gh pr view N -R OWNER/REPO --json headRefOid --jq .headRefOid)
   gh workflow run bob-review.yml -R OWNER/REPO --ref main -f pr_number=N -f head_sha=$SHA
   ```

   The run must be green with a review comment. A "Review unavailable" note means the new key does not work: put
   the old one back and do not revoke it yet.
5. **Only now revoke the old key in Bob.** Optionally prove it: put the old key into the secret (switch off while
   you do), run one review, expect "Review unavailable" and `Invalid or expired API key`, then put the new key
   back (drilled, run `41303511196`).
6. Delete the old key file, or move it out of the repository folder.

The key in use expires on the date in its Bob record (**2026-12-30** at the time of writing). Put a reminder in
your calendar a week before: an expired key degrades every review to "Review unavailable" and raises no alert.

## Leaked key (incident)

Revoke first, then investigate. A leaked key can spend your Bobcoins from anywhere; the investigation can wait a
minute, the spend cannot.

1. Kill switch off.
2. Revoke the key in Bob. From this moment the old key fails with `Invalid or expired API key` (drilled).
3. Investigate what the key could have done (all read-only, drilled in
   [phase-7-drills.md](results/phase-7-drills.md) section 4):

   ```bash
   # who triggered what, since the key was created
   gh api --paginate "repos/OWNER/REPO/actions/runs?per_page=100&created=>=YYYY-MM-DD" \
     --jq '.workflow_runs[]|[.name,.event,.actor.login,.head_branch]|@tsv' | sort | uniq -c | sort -rn
   # every job that was given the key
   gh api --paginate "repos/OWNER/REPO/deployments?environment=bob-review&per_page=100" \
     --jq '.[]|[.ref,.creator.login,.created_at]|@tsv'
   ```

   Look for an actor you do not know, a dispatch run on a branch other than `main`, or a burst of runs. In the
   drill all dispatch runs were on `main` and one actor appeared. Three deployments were recorded against PR branch
   names (Phase 5 matrix runs by the owner); why GitHub allowed them under a `main`-only environment is
   unexplained, so do not treat a non-`main` deployment as proof of abuse, and do not treat its absence as proof
   of safety.
4. Check Bob usage for the key's workspace in the Bob portal. Bobalytics was **not available** during Phase 7, so
   the reviewer's share of the account's spend cannot be separated from other use; see
   [results/cost-summary.md](results/cost-summary.md) section 6. For an accurate answer, use a Bob account or
   workspace dedicated to the reviewer.
5. Rotate as above (new key, verify, switch on). Record what happened.

A leaked **GitHub** token is a smaller incident: the workflow uses the per-job `GITHUB_TOKEN`, which expires with
the job, so there is nothing long-lived to rotate (ADR 0014). Rotating a dedicated comment token is **not
applicable** unless a dedicated bot account was chosen (ADR 0008).

## Unexpected cost

What is recorded, per review: Bobcoins reported by Bob, seconds, sizes and outcome, in the `audit` artifact (14
days) and in the comment footer. Typical values (Phase 7, small PRs, n = 106): median 0.018 Bobcoins, 90th
percentile 0.041, maximum 0.061 per review; 3 billed runner minutes. See
[results/cost-summary.md](results/cost-summary.md). The Bobcoin unit itself is unverified.

Where unrecorded cost comes from:

- **Cancelled reviews.** A review job cancelled by a newer trigger writes no cost record even when Bob had
  already finished. In Phase 7 this was 29 calls and 0.69 Bobcoins, 22 per cent of the total. Reduce it by requiring
  one workflow in `BOB_REVIEW_REQUIRED_WORKFLOWS`, which halves the firings.
- **Runner minutes** are not in the cost record (`compute.runner_minutes` is empty). Each job is billed rounded
  up to a whole minute, so a review is 3 minutes however fast it is.
- **Loops.** Delete-and-re-run resets the cap (see above).

To find the biggest spenders, collect the run data and summarise it (read-only, no Bob calls):

```bash
node scripts/dev/collect-cost-data.mjs OWNER/REPO --out docs/results/cost-data.json
node scripts/dev/summarise-cost.mjs docs/results/cost-data.json
```

The collection only sees what is still retained: audit artifacts for 14 days, result artifacts for 1 day.

## Artifacts and what they hold (G26)

| Artifact | Kept | Holds |
|---|---|---|
| `source` | 1 day | The trusted reviewer code, about 52 KB |
| `prompt` | 1 day | The prompt and the **redacted diff** of the PR, about 5 KB |
| `result` | 1 day | Raw Bob output |
| `audit` | 14 days | Outcome and cost record, under 700 bytes, no PR content |

The `prompt` and `result` artifacts do contain PR content (after redaction, G15) for one day, readable by anyone
with read access to the repository. Redaction is the control, not access. Measured 2026-11-01: 693 artifacts,
12.05 MiB, none past its expiry. To delete one early: `gh api -X DELETE repos/OWNER/REPO/actions/artifacts/ID`
(**not drilled**).

## Teardown and rebuild

One script removes what setup created and then lists what remains. Drilled: 9 seconds.

```bash
scripts/dev/teardown-sandbox.sh OWNER/REPO
```

It deletes the `bob-review` environment (and the `BOB_API_KEY` secret with it), the three repo variables, the
`ai-review` label, and the reviewer files and workflows from the default branch. It does not delete the repo,
the PRs or the sandbox app. Expected listing: no environments, no secrets, no variables, only `CI`.

Manual equivalents:

```bash
gh api -X DELETE repos/OWNER/REPO/environments/bob-review
gh variable delete BOB_REVIEW_ENABLED -R OWNER/REPO
gh variable delete BOB_REVIEW_REQUIRED_WORKFLOWS -R OWNER/REPO
gh variable delete BOB_REVIEW_BOB_TIMEOUT_SECONDS -R OWNER/REPO
gh label delete ai-review -R OWNER/REPO --yes
git rm -r .github/workflows/bob-review.yml .github/workflows/lint.yml reviewer integrations tests/container   # then commit and push to main
```

**The teardown deletes the Bob key secret**, so every rebuild needs the key again. In the sandbox,
`scripts/dev/setup-sandbox.sh OWNER/REPO` reads the `apikey` field of the git-ignored `pr-review-agent.json` and
pipes it to `gh secret set`. Elsewhere use the manual command in [SETUP.md](SETUP.md) step 3. The rebuilt setup
has the kill switch off; switch it on deliberately.

Rebuild from SETUP.md was drilled on 2026-11-01: teardown 9 s, steps 1 to 5 about 15 s, first review 82 s,
no step outside the document. This proves the GitHub configuration. It does **not** prove a first install in a
different repository, because step 4 uses a sandbox-only script (S20, decided in Phase 8).

When the project is finished, also revoke the Bob key in Bob and delete the key file.

## Not drilled

- Cancelling a running review with `gh run cancel`.
- Changing `REVIEW_MAX_RUNS_PER_PR` in the workflow.
- Deleting an artifact early.
- Behaviour when GitHub itself is degraded (runs queued or lost).
- Fork pull requests and outside contributors (carried from Phase 5).
