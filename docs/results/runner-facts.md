# Runner and secrets facts (GitHub documentation)

Fetched 2026-10-30 from the official GitHub documentation. These are documentation statements, not
measurements; behaviour that matters to this project is re-checked live in Phases 4 and 5 and
recorded in this directory.

## Secrets

Source: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets

- Secrets are not passed to the runner when a workflow is triggered from a forked repository (only
  `GITHUB_TOKEN`).
- Secrets are not available to Dependabot-triggered workflows.
- Secrets are not automatically passed to reusable workflows.

Source: https://docs.github.com/en/actions/reference/security/secure-use

- Secrets cannot be referenced directly in `if:` conditionals.
- An unset secret evaluates to an empty string.
- Avoid passing secrets on the command line; use environment variables or stdin.
- `::add-mask::` masks non-secret sensitive values. Redaction is not guaranteed under transformation.
- Do not use structured data (JSON, YAML) as one secret.
- Any user with write access to the repository can read all repository secrets.
- Rotate secrets periodically.

## Environments

Source: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments

- Environment secrets are available only to jobs that reference the environment, and only after
  required-reviewer approval when configured.
- Deployment branch and tag rules limit which refs can use an environment.
- On GitHub Free, environment secrets for private repositories need Pro, Team or Enterprise.
- Required reviewers and wait timers on Free, Pro and Team are for public repositories only.
- Self-hosted runners are not isolated even with environments (not used here).

## workflow_run

Source: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

- Activity types: `completed`, `requested`, `in_progress`.
- The workflow file must be on the default branch.
- The started workflow can access secrets and write tokens even if the triggering workflow could not.
- It runs whatever the triggering conclusion was, so the job must check
  `github.event.workflow_run.conclusion`.
- Running untrusted code in it is dangerous; do not check out untrusted PR code. Artifacts from
  other workflows need caution.

## GITHUB_TOKEN

Sources: https://docs.github.com/en/actions/tutorials/authenticate-with-github_token and the
workflow syntax and secure-use pages.

- Permissions are set with `permissions:` at workflow or job level. `permissions: {}` disables
  all; unspecified scopes are `none`.
- `issues: write` permits adding a comment to an issue.
- Forks normally cannot get write permissions.

## REST API permissions

Source: https://docs.github.com/en/rest/issues/comments (create an issue comment) and
https://docs.github.com/en/rest/pulls/reviews (create a review)

- Create an issue comment: fine-grained permission Issues (write) or Pull requests (write).
- Create a review for a pull request: Pull requests (write).
- Whether a token with only `issues: write` can list comments and is refused by the reviews
  endpoint is unverified (S17).

## Hosted runners

Source: https://github.com/actions/runner-images (`Ubuntu2404-Readme.md`, image 20261026.354.1) and
https://docs.github.com/en/actions/reference/runners/github-hosted-runners

- `ubuntu-24.04`: Node 22.23.4, Docker client and server 28.0.4, Podman 4.9.3, Buildah 1.33.7,
  Skopeo 1.13.3, Git 2.56.0, jq 1.7, GitHub CLI 2.103.2.
- Linux runners have passwordless `sudo`.
- Standard `ubuntu-24.04` is 4 CPU / 16 GB for public repositories and 2 CPU / 8 GB for private.
- Standard runners are free for public repositories; private repositories use plan minutes.
- Runners need egress to the GitHub endpoints listed in the docs. Larger runners can have static IPs.
- The runner location is not selectable on standard runners (no per-region statement found).

## Node.js checksums used by the container build

Source: https://nodejs.org/dist/v22.23.4/SHASUMS256.txt

- linux-arm64: `6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b`
- linux-x64: `1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce`
