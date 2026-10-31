# Setup (GitHub part, draft)

Draft from Phase 4 Part B. Everything here was done once, in a private sandbox repo, and the commands
are the ones that worked. Only GitHub and the Bob service are needed (ADR 0001). Phase 8
completes this document.

## Before you start

1. **Read and accept the IBM Bob license.** The reviewer passes `--accept-license` on every run
   ([ADR 0013](adr/0013-bob-license-acceptance.md)); by running it you are accepting those terms. Review
   them first with `bob --show-license`.
2. A Bob API key (non-interactive use). Keep it in a file you control, never in the repo. The Bobcoin
   budget on that key is the only hard spending ceiling ([ADR 0009](adr/0009-drop-daily-caps.md)).
3. `gh` logged in with the `repo` and `workflow` scopes: `gh auth status`.
4. A GitHub plan where environment secrets are available for your repo's visibility. On the sandbox
   (private repo, owner's plan) they were; if `gh api` refuses the environment, use a public sandbox or
   the weaker fallback in ADR 0012 item 8.

## Steps

Replace `OWNER/REPO` with the repo being reviewed.

1. **Environment limited to the default branch**

   ```bash
   echo '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' \
     | gh api -X PUT repos/OWNER/REPO/environments/bob-review --input -
   echo '{"name":"main","type":"branch"}' \
     | gh api -X POST repos/OWNER/REPO/environments/bob-review/deployment-branch-policies --input -
   ```

2. **Variables** (kill switch off until the secret is set, then on)

   ```bash
   gh variable set BOB_REVIEW_ENABLED -R OWNER/REPO --body false
   gh variable set BOB_REVIEW_REQUIRED_WORKFLOWS -R OWNER/REPO --body CI
   ```

3. **The Bob key.** In the sandbox, `scripts/dev/setup-sandbox.sh OWNER/REPO` does steps 1 to 4 in one go
   and enters the key from the git-ignored `pr-review-agent.json` (its `apikey` field) through a pipe, so
   it is never shown. For any other repo, enter it yourself: this prompts for the value, or reads it from a file you control.
   Never put the value on the command line, in shell history, in a doc or in a test.

   ```bash
   gh secret set BOB_API_KEY --env bob-review -R OWNER/REPO
   # or: gh secret set BOB_API_KEY --env bob-review -R OWNER/REPO < /path/to/keyfile
   ```

4. **Install the workflow and reviewer** on the default branch. In the sandbox this is
   `scripts/dev/install-sandbox-reviewer.sh OWNER/REPO` (copies `reviewer/`, `integrations/`,
   `tests/container/` and the workflow to `.github/workflows/bob-review.yml`). Delivery to a repo other
   than the sandbox (reusable workflow or GHCR image) is not decided yet (S20, Phase 5).

5. **Repository setting.** Keep "Allow GitHub Actions to create and approve pull requests" off
   (`can_approve_pull_request_reviews: false`). It stops the bot approving. It does not stop a
   REQUEST_CHANGES review ([ADR 0014](adr/0014-publish-token-pull-requests-write.md)).

6. **Switch on and start a manual review**

   ```bash
   gh variable set BOB_REVIEW_ENABLED -R OWNER/REPO --body true
   gh workflow run bob-review.yml -R OWNER/REPO --ref main -f pr_number=N -f head_sha=<40 hex head SHA of PR N>
   ```

   Expect three green jobs (`prepare`, `review`, `publish`) in about 1 to 1.5 minutes and one comment
   from `github-actions[bot]` marked "AI Assisted". Running it again on the same SHA updates that comment.

## What to expect

- A push-triggered CI run starts the workflow and is skipped quietly (only CI runs from pull requests
  review).
- A stale or malformed SHA or PR number ends in a quiet skip or a rejected input; no Bob call is made.
- Each review job builds the reviewer image on the runner (about 25 s of runner time).

## Teardown

See [RUNBOOK.md](RUNBOOK.md#teardown). A teardown deletes the Bob key secret; the setup script re-enters it
from the key file, otherwise run step 3 again by hand.
