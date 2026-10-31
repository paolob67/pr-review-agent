# Runbook (draft)

Draft from Phase 4 Part B. Covers the kill switch, key rotation and teardown. Incident steps are
completed in Phase 7 and 8.

## Kill switch

Stops all reviews at once without touching the secret (ADR 0012 item 9):

```bash
gh variable set BOB_REVIEW_ENABLED -R OWNER/REPO --body false
```

Check: `gh variable list -R OWNER/REPO`. The `prepare` job's `if:` requires exactly `true`.

## Rotate the Bob key

1. Create a new key in Bob; note its expiry.
2. Switch the kill switch off.
3. `gh secret set BOB_API_KEY --env bob-review -R OWNER/REPO` and enter the new value.
4. Revoke the old key in Bob.
5. Switch the kill switch on and start one manual review to confirm.

Rotate after any suspected exposure. The key used in Phase 4 expires 2026-12-30.

## Teardown

In the sandbox, one script removes everything Part B created and then lists what remains:

```bash
scripts/dev/teardown-sandbox.sh OWNER/REPO
```

It deletes the `bob-review` environment (which removes the `BOB_API_KEY` environment secret), the two
repo variables, and the reviewer files and workflow from the default branch. It does not delete the
repo, the PR or the sandbox app. Expected listing at the end: no environments, no repo secrets, no
variables, and only the `CI` workflow.

Manual equivalents:

```bash
gh api -X DELETE repos/OWNER/REPO/environments/bob-review
gh variable delete BOB_REVIEW_ENABLED -R OWNER/REPO
gh variable delete BOB_REVIEW_REQUIRED_WORKFLOWS -R OWNER/REPO
git rm -r .github/workflows/bob-review.yml reviewer integrations tests/container   # then commit and push to main
```

Remove the bot comment from a PR (replace N):

```bash
gh api repos/OWNER/REPO/issues/N/comments --jq '.[]|select(.user.login=="github-actions[bot]")|.id' \
  | xargs -I{} gh api -X DELETE repos/OWNER/REPO/issues/comments/{}
```

Also revoke the Bob key in Bob if the project is finished.

### The teardown deletes the Bob key secret

Deleting the `bob-review` environment deletes `BOB_API_KEY` with it. Every rebuild therefore needs the
key entered again. In the sandbox, `scripts/dev/setup-sandbox.sh OWNER/REPO` does this: it reads the
`apikey` field of the git-ignored `pr-review-agent.json` and pipes it to `gh secret set` on stdin, so
nobody retypes it and the value never appears on screen, in a command line or in a log. Without that
file, run the manual `gh secret set` command from [SETUP.md](SETUP.md) step 3. The recreated sandbox has
the kill switch off; switch it on deliberately.

Status: teardown and recreate were run on 2026-10-31 and the listing is in
[results/phase-4-runner.md](results/phase-4-runner.md#teardown-and-recreate-2026-10-31-after-the-10-runs).
