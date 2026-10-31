# Project Plan: Bob as a Pull Request Review Agent

Status: revised 2026-10-30. Phases 0 to 3 are done; Phase 4 is in progress. See [STATUS.md](STATUS.md).

## Table of contents

1. [Goal and deliverables](#1-goal-and-deliverables)
2. [Design review: pros, cons, implications](#2-design-review-pros-cons-implications)
3. [Architecture](#3-architecture)
4. [Guardrail and harness catalogue](#4-guardrail-and-harness-catalogue)
5. [Known unknowns to verify first](#5-known-unknowns-to-verify-first)
6. [GitHub Actions target](#6-github-actions-target)
7. [Target repository layout](#7-target-repository-layout)
8. [Phased work plan](#8-phased-work-plan)
9. [Test strategy](#9-test-strategy)
10. [Decisions](#10-decisions)
11. [Risks to the project itself](#11-risks-to-the-project-itself)
12. [Possible change cases for future developments](#12-possible-change-cases-for-future-developments)

## 1. Goal and deliverables

Produce a reference implementation and a written account of running IBM Bob Shell as an
advisory pull request reviewer on GitHub-hosted runners. The review starts from GitHub Actions
only after the team's own CI (build, unit tests, other required checks) has passed. Bob checks
coding standards, team-specific rules and security, triages what it finds, proposes remediations,
and adds comments clearly marked as AI assisted. It never approves or blocks; a human makes the
final evaluation. The cost of each review is recorded per PR.

| Deliverable | Description | Done when |
|---|---|---|
| D1. Working repository | Reviewer core, container image, GitHub Actions review workflow, sample target repo with CI and team rules | CI is green and the end-to-end test passes in a sandbox repo through the review workflow |
| D2. Test and red-team harness | Unit tests, fake-Bob pipeline tests, prompt-injection corpus, review-quality eval set | `make test` passes offline; live suites documented and run at least once with results recorded |
| D3. Article | Short LinkedIn article for the owner's network and clients: technical problems, security implications, benefits, honest limitations | Every claim is traceable to a doc source or a recorded test result |

Out of scope: applying fixes to code, approving or blocking merges, CI systems other than GitHub
Actions, SCMs other than GitHub, a hosted multi-tenant service. Possible extensions are listed in
[section 12](#12-possible-change-cases-for-future-developments).

## 2. Design review: pros, cons, implications

### Pros

- Consistent first-pass review on every PR, applying the team's standards and rules.
- Agentic: can read surrounding files, not only the diff (the main gain over a diff-to-LLM script).
- Runs only on PRs that already build and pass tests, so spend and reviewer attention go to code
  that is worth reviewing.
- Bob Shell has a documented non-interactive mode, API-key auth for CI, and read-only tool defaults.
- The three credentials are split across three jobs on separate fresh VMs (section 3), so the
  comment token never exists where Bob runs.
- Prebuilt image pinned by digest: no per-run install.
- No cloud account to operate: GitHub and the Bob service are the only dependencies.
- Fork and Dependabot runs receive no secrets by platform design (see
  [runner facts](results/runner-facts.md)).

### Cons

- Non-deterministic output: cannot be a hard merge gate.
- Cost scales with PR size and push frequency (Bobcoins plus runner minutes for private repos).
- Per-PR spend is not available from a documented source: Bobalytics reports team-level Bobcoin
  spend (section 3, cost visibility), so the job has to produce its own per-PR record.
- Adds an attack surface: the model reads attacker-controlled text.
- The Bob key is a GitHub secret; anyone with write access can read repository secrets through a
  workflow, so environment scoping matters (ADR 0012).
- Compute location is a GitHub runner location that cannot be chosen (S13).
- Logs and artifacts have GitHub's retention; the audit record is written to the job summary and
  a retained artifact.
- Review quality is unproven until measured on our own data.

### Implications to confront

1. **The model is not the trust boundary; the wrapper is.** Any control that relies on the model
   behaving is a mitigation, not a guardrail.
2. **The comment credential must not sit next to the model process.** Solved by job separation:
   `review` holds only the Bob key; `publish` holds only the comment token and reads the result
   as untrusted data (section 3, [ADR 0001](adr/0001-execution-environment.md)). A container UID split inside `review` is defence in
   depth.
3. **Anyone who can change workflows can reach repository secrets.** A user with write access can
   run a workflow that reads them. Mitigated by environment secrets limited to the default
   branch, rotation, a Bobcoin ceiling on the key itself, and by documenting the weaker fallback
   when the plan lacks environment secrets (ADR 0012, S18).
4. **Output is untrusted too.** Rendered markdown (image URLs, links, @mentions, HTML) is an
   exfiltration and abuse channel. Validate and sanitise before posting.
5. **Fork PRs.** The trigger workflows never check out PR code and carry no model-readable
   secrets, which makes them manageable. Policy is still explicit (G7).
6. **Data egress and residency.** Source and diffs go from a GitHub-hosted runner, whose location
   cannot be chosen on standard runners, to the Bob service. Which Bob service endpoint applies
   to our Bob instance and what residency it guarantees must be confirmed (S13), then stated in
   the article. The earlier region stance no longer applies.
7. **Key ownership.** Bob API keys are scoped to a user and a subscription instance; revocation
   breaks the pipeline. Needs an operational owner and a rotation procedure.
8. **Duplicate and runaway runs.** Re-pushes, manual re-runs of a workflow, and several CI
   workflows finishing for the same commit must not post duplicate comments or burn budget.
   Concurrency groups, the per-PR run cap read from the marker, and the idempotent comment cover
   this. No retry is configured; manual re-runs are bounded by the run cap and the idempotent
   comment.
9. **Egress control is coarse.** Standard hosted runners have no domain-level egress control.
   Egress stays open and other controls carry the load; this is recorded as an accepted residual
   risk.
10. **Bob loads configuration from its working directory.** Bob Shell reads project settings
    (`.bob/settings.json`), rules, custom commands and `AGENTS.md` from the project directory, and
    a folder with no recorded trust decision is treated as trusted in non-interactive mode. A PR
    could ship a settings file that defines an MCP server, or an `AGENTS.md` that competes with
    our prompt. Bob must never run in a directory that contains PR-controlled files. Per the Bob
    docs, an untrusted folder ignores project settings, does not connect MCP servers, does not load
    custom commands, and overrides `--yolo`. The design runs Bob in a scratch directory that is
    explicitly marked untrusted and holds only data prepared by trusted code (G28 to G30).
11. **Reviewer fatigue.** A noisy bot gets ignored. Triage, caps on findings, and a confidence
    threshold matter as much as security.
12. **Team rules are an input the PR author must not control.** If the rules are read from the PR
    branch, a PR can rewrite the rules it is judged by. Rules are read from the base branch only
    (G33), so changing them is itself a reviewed and merged change.
13. **The CI result must refer to the same commit that gets reviewed.** A push after CI started
    changes the head; the review must be pinned to the commit CI validated, and skipped if the PR
    has moved on (G31, G32).
14. **The bot must be unable to approve, even by mistake.** A token that can post comments may also
    be able to submit approving reviews through another endpoint. The publisher is restricted to
    one endpoint and the bot is a dedicated account that is not a code owner (G34).

## 3. Architecture

![Architecture overview](diagrams/architecture-overview.png)

Editable source: [`diagrams/architecture-overview.drawio`](diagrams/architecture-overview.drawio).

### Trigger path: review only after CI has passed

```
Team CI on the pull request (build, unit tests, other required checks; defined by the team)
  -> every required CI workflow concludes success for the PR head commit
Review workflow (workflow_run, default-branch definition, NO checkout of PR code)
  job prepare  -> resolves the PR for the head SHA through the API and validates: workflow_run
                  conclusion is success, required CI green for this SHA, PR open and head
                  unchanged, not draft, repo name, PR number (integer), author_association,
                  labels, kill switch; builds the prompt; uploads it as an artifact
  job review   -> (needs prepare) Bob key only; runs Bob read-only; uploads the raw result
  job publish  -> (needs review) comment token only; validates the result as untrusted data;
                  upserts one comment
```

- If CI fails or is cancelled, no review is started and nothing is posted; the author already has
  the CI failure.
- Why `workflow_run`: the team's CI keeps running on `pull_request` without any secret. GitHub
  documents that a `workflow_run` workflow can access secrets and write tokens even when the
  triggering workflow could not, which suits a privileged follow-up step. It only runs if its
  workflow file is on the default branch, and the documentation warns against running untrusted
  code in it. The trigger therefore never checks out PR code and takes nothing from the
  triggering run except the head SHA (G6, G24).
- The event fires once per completed workflow. When several workflows are required, each
  completion re-evaluates the same check ("all required CI green for this SHA"), and the
  concurrency group plus idempotent job (G11, G18, G31) make the repeats harmless.
- Explicit re-request: a second small trigger on `pull_request_target` (`labeled`, label
  `ai-review`, no checkout) runs the same validation script, including the CI-green check.
- How `workflow_run` behaves for fork PRs (PR lookup from the head SHA, payload contents) is not
  confirmed; spike S15.
- Dependabot PRs are treated like fork PRs by GitHub.

### What the review does

| Task | Trusted input | Output |
|---|---|---|
| Coding standards | `.bob-review/standards.md`: numbered rules, read from the base branch | Findings that cite the rule ID |
| Team-specific rules | `.bob-review/project-rules.md`: architecture, naming, forbidden APIs, test expectations, read from the base branch | Findings that cite the rule ID |
| Security review | Built-in checklist in the reviewer mode, plus optional `.bob-review/security.md` focus list | Findings with severity, confidence, evidence (file and line) |
| Signal triage | Confidence threshold, per-category caps, de-duplication, severity ranking | Low-confidence items dropped or moved to "needs human attention" |
| Remediation | The finding and the surrounding code | A proposed fix as text or a diff in a code block; never applied |

Rules and standards are passed to Bob as data inside the prepared prompt, not as Bob rule files
or `AGENTS.md`, so they cannot be confused with configuration and are always the base-branch
version. Missing rule files mean the review runs with the built-in checklist only and says so.

### Human decision

- The comment states that it is AI assisted, advisory, and that the final evaluation belongs to a
  human reviewer. The header and footer are produced by the wrapper, not by the model (G35).
- The bot posts a plain PR comment only. It does not submit approving or change-requesting
  reviews, does not write check runs or commit statuses, and is never a required check (G34).
- Merge rules stay with the team: branch protection with required human approval is recommended
  and documented in the setup guide, not enforced by this project.
- The comment ends with a "needs human attention" section for items the model was unsure about.

### The three jobs (three stages, different privileges, different machines)

```
Job prepare  (fresh runner; read-only GITHUB_TOKEN; no other secret)
  fetch PR metadata + diff for HEAD_SHA through the API, never execute PR code
  verify HEAD_SHA is still the PR head (else exit quietly)
  fetch .bob-review/ rules from the base branch
  gate: draft/bot/size/path/budget/kill-switch
  redact obvious secrets, build prompt with explicit untrusted-data delimiters
  upload artifact "prompt" (data only)
        |
Job review   (fresh runner; ONLY BOB_API_KEY, from the bob-review environment)
  download "prompt"; run the pinned image: scrubbed environment, read-only tools, no MCP,
  timeout, bounded input, scratch directory holds only prepared data; UID drop inside
  upload artifact "result" (raw Bob output plus stats; untrusted)
        |
Job publish  (fresh runner; ONLY the comment token, issues: write)
  download "result"; validate output schema and finding locations, apply triage rules,
  sanitise markdown, add AI assisted header and footer (with cost record), upsert a single
  marker comment (idempotent), write audit log to the job summary and a retained artifact
```

Isolation requirement: the comment token must not be readable by the Bob process or anything the
model can make it run. Mechanisms, strongest first ([ADR 0001](adr/0001-execution-environment.md)):

1. Job boundary (the design): the comment token is never present on the machine that runs Bob.
   Jobs share only artifacts, which `publish` treats as untrusted.
2. Inside `review`: container with read-only rootfs, dropped capabilities, `no-new-privileges`,
   non-root user, and Bob started under a different UID from the wrapper (S11). Defence in depth.
3. Fallback if a job cannot hold its credentials alone (for example a plan limit on environment
   secrets, S18): repository secrets with job-level scoping, weaker, documented as such.

Today `reviewer/bin/reviewer.js` runs the three stages in one process (used by local runs and all
offline tests). Splitting it into stage subcommands (`prepare`, `review`, `publish`) that exchange
the two artifacts is Phase 4 work; the single-process mode stays for local runs and tests.

### Cost visibility per PR

What the documentation says: Bobalytics shows Bobcoin spend as a team-level KPI (total over a
period, daily spend, team trends), and team-level views anonymise user identities. The documented
Bobalytics material does not describe per-PR or per-run spend, and the IDE page notes that
enterprise users must keep telemetry enabled to appear in it. Whether Bob Shell runs show up in
Bobalytics, and whether a dedicated API key or user can be filtered, is unverified (S16).

The job therefore produces its own record for every run:

| Field | Source |
|---|---|
| Repo, PR number, head SHA, run id and attempt (`GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`), Bob Shell version | Job inputs and the image |
| Input size (files, diff bytes, prompt bytes) and output size | Wrapper |
| Bob usage (tokens or Bobcoins) | First choice: figures reported by Bob Shell if any (S7). Fallback: estimate from prompt and output size, labelled as an estimate |
| Wall-clock seconds of the Bob run and of the whole pipeline, runner label | Wrapper and workflow |
| Runner minutes | Sum of job durations from the Actions API, rounded up per job as GitHub bills; recorded as time, not converted to currency |
| Cumulative per-PR totals | Counter in the hidden metadata of the marker comment |

The record goes to three places: a one-line cost footer in the PR comment (visible to the team and
auditable in the PR history), a hidden machine-readable block in the same comment (feeds the
per-PR cap in G14), and the structured audit log written to the job summary and a retained
artifact (G20).
Reconciliation: daily sums of the records are compared with Bobalytics daily spend when it is
available, and the article states how close the estimates are.

### Principles

- Advisory only. Never a required check; failure to review must never block a merge.
- Fail closed on the review, fail open on the pipeline: any error produces at most a short
  "review unavailable" note, never a red build on someone else's PR.
- The reviewer core takes a repository, a PR number and a head SHA and produces one comment. The
  GitHub Actions workflows are thin launchers around it.
- Everything pinned: action SHAs, Bob Shell version, Node version, container base image.

## 4. Guardrail and harness catalogue

Each item names the control, its type, and the test that proves it.

| ID | Control | Type | Proven by |
|---|---|---|---|
| G1 | Workflow `permissions:` least privilege: workflow-level `permissions: {}`, then per job only what it needs (`issues: write` in `publish` only; no other write scope anywhere) | Preventive | actionlint, zizmor |
| G2 | Separate credentials per stage: read-only SCM token (prepare), comment-only (publish), Bob key only (review) | Preventive | Unit test on env construction |
| G3 | Scrubbed environment for the Bob process (`env -i` plus allowlist) | Preventive | Canary env var test |
| G4 | Bob read-only: `--disable-tool-groups edit,execute --disable-mcp` on every `bob run` invocation; no overridable flags | Preventive | Live test: injected "write file" attempt leaves tree unchanged; assert stats.tool_calls==0 |
| G5 | Trusted-folders pre-seeding for the working directory | Preventive | Spike S4 and live test |
| G6 | PR code is never checked out or executed; trigger workflows use default-branch definitions only and take nothing from the triggering run except the head SHA | Preventive | Workflow lint, job graph review, hostile-artifact test in the sandbox |
| G7 | Author policy: auto-review only for OWNER, MEMBER, COLLABORATOR; others need a maintainer-applied label | Preventive | Sandbox e2e with a fork and an outside account |
| G8 | Size gates: max files, max diff bytes, max prompt size estimate | Preventive | Unit tests with boundary fixtures |
| G9 | Skip rules: drafts, bots, docs-only, generated and lock files, `skip-bob-review` label | Preventive | Unit tests |
| G10 | Kill switch: repo variable `BOB_REVIEW_ENABLED` checked in the `prepare` job and re-checked in `publish` (read through `vars`, not a secret) | Preventive | Workflow e2e |
| G11 | Concurrency group per PR, cancel superseded runs | Preventive | Sandbox e2e with two quick pushes |
| G12 | Triggers limited to completion of the required CI workflows, plus explicit re-request by label | Preventive | Sandbox e2e |
| G13 | Hard timeout on the Bob process (in wrapper) and on each job (`timeout-minutes`) | Preventive | Fake-Bob "hangs" test and workflow lint |
| G14 | Budget: per-PR run cap, enforced from the marker (no daily caps, ADR 0009) | Detective + preventive | Unit tests |
| G15 | Secret redaction on the diff before it is sent | Preventive | Unit tests with seeded fake secrets |
| G16 | Output schema validation with a strict, versioned format | Preventive | Fake-Bob malformed output tests |
| G17 | Markdown sanitiser: strip images, raw HTML, @mentions, non-allowlisted links, control and bidi characters; cap length; code fences allowed for proposed fixes | Preventive | Unit tests and injection corpus |
| G18 | Idempotent upsert of one marker comment (never spam) | Preventive | Unit test and sandbox e2e |
| G19 | Footer stating AI assisted, advisory, with Bob version, head SHA and run id (see also G35) | Transparency | Snapshot test |
| G20 | Structured audit log per run to stdout, the job summary and a retained artifact (PR, sizes, duration, decision, cost record, no content) | Detective | Unit test on log schema; live check that the summary and artifact exist |
| G21 | Job config: short `timeout-minutes` on every job, no retry or re-run action, secrets only in the `env:` of the one step that needs them (ADR 0012), container non-root, read-only rootfs, caps dropped | Preventive | Workflow lint plus a test that scans workflows for stray `secrets.` references; live e2e |
| G22 | Supply chain: pin Bob Shell version (checksum if published), pin the container base image and the published image by digest, pin third-party actions by SHA, pin the runner label (`ubuntu-24.04`) | Preventive | zizmor, CI check |
| G23 | Credential separation: the Bob process cannot reach the comment token (job boundary, ADR 0001) and, inside `review`, cannot read the wrapper's credentials (UID drop, S11) | Preventive | Workflow test that no step in `review` references a comment token; canary test: model-influenced command tries to read parent environ and credential files |
| G24 | Triggers pass only validated identifiers (repo `owner/name` pattern, integer PR number, 40-hex head SHA); the PR is resolved through the API; titles, bodies, branch names are never put in env, args, or shell strings | Preventive | Unit tests with hostile values; workflow lint |
| G25 | Least-privilege credentials per job: per-job `permissions:` (`prepare` read-only, `review` none beyond `contents: read`, `publish` `pull-requests: write` only, ADR 0014), `BOB_API_KEY` in an environment restricted to the default branch, rotation procedure (S17, S18) | Preventive | Workflow lint on `permissions:`; live negative test (the `publish` token is refused on the reviews endpoint) |
| G26 | Artifact hygiene: `retention-days` set on the prompt and result artifacts (short) and on the audit artifact; no secret or full diff in a retained artifact beyond the redacted prompt | Operational | Workflow lint; artifact content test |
| G27 | Secrets never printed: log scrubber, `::add-mask::` for derived values, plus a test that greps captured logs for canary secrets | Detective | Unit test and live log check |
| G28 | Bob runs in a scratch directory that contains only prepared data (diff, changed files, rules, prompt); no PR-controlled `.bob/`, `AGENTS.md`, rules, commands or `.env` can be present | Preventive | Fixture PR that ships hostile `.bob/settings.json`, `AGENTS.md` and `.env`; assert none take effect |
| G29 | `--workspace <scratch>` on every `bob run` points to a clean directory containing no `AGENTS.md`; trusted-folders mechanism does not control tool availability in v2 (S4) | Preventive | Spike S4/S14 and live test that AGENTS.md in cwd is ignored when --workspace is clean dir |
| G30 | MCP disabled via `--disable-mcp`; write/execute tools disabled via `--disable-tool-groups edit,execute`; no image settings manipulation needed in v2 (S14) | Preventive | Spike S14 and live test |
| G31 | Review starts only when every required CI workflow has concluded success for the exact head SHA; failed, cancelled or missing CI means no review and no comment | Preventive | Sandbox e2e (red CI, green CI, one of two workflows green); unit tests on the gate |
| G32 | Head pinning: the job reviews the SHA it was given and exits quietly if the PR head has moved or the PR is closed | Preventive | Sandbox e2e with a push between CI and review; unit test |
| G33 | Team rules and standards are read from the base branch through the API, never from the PR head; size cap; changes to `.bob-review/` take effect only after merge | Preventive | Fixture PR that edits its own rules; assert the old rules are used |
| G34 | Never approves or blocks: publisher calls only the PR comment create and update endpoints; no reviews, check runs or commit statuses; the `publish` token has `pull-requests: write` (S17 showed comments need it; ADR 0014), so this is held by the endpoint allowlist, the workflow check and the repo setting that stops Actions approving, not by token scope (identity `github-actions[bot]`); never a required check | Preventive | Unit test with a mocked API that fails on any other endpoint; live check that the real token is refused on the reviews endpoint (S17); sandbox check that the bot cannot satisfy a required-approval rule |
| G35 | Wrapper-generated "AI Assisted" header and footer stating advisory status and that a human makes the final decision; model text cannot alter or imitate them (imitations are stripped) | Transparency | Snapshot test; injection test where the model emits a fake approval or fake header |
| G36 | Findings contract: category (standards, team rule, security, other), severity, confidence, rule ID for standards findings, file and line that exist in the diff, evidence, proposed fix text; low-confidence items dropped or moved to "needs human attention"; per-category cap; de-duplication | Preventive | Fake-Bob outputs with hallucinated locations, duplicates and floods; eval set for precision |
| G37 | Per-PR cost record produced for every run (fields in section 3), shown in the comment footer, stored in hidden metadata and the audit log | Detective | Unit tests on the record schema and cumulative counter; live reconciliation against Bobalytics daily spend where available |

Prompt-injection stance: assume it will sometimes work on the model. Controls G2, G3, G4, G16,
G17, G23, G34, G35 make a successful injection low impact (no secrets reachable, no write path, no
approval path, output constrained and visibly labelled).

## 5. Known unknowns to verify first

Phase 0 resolved S1 to S10, S13 (partly, see below) and S14 on 2026-10-30.
Answers are in [docs/results/spikes.md](results/spikes.md).
S11 is checked in Phase 4 (local podman, then the runner). S17 to S20 need the sandbox repo and
workflow (Phase 4 and 5). S15 needs a sandbox GitHub repo (Phase 5); it is analysed on paper in
Phase 1. S16 is answered in Phase 7 by someone with Bobalytics access looking at the dashboard
after the first live runs; it is optional and blocks nothing, because the job writes its own cost
record regardless. IDs are stable: S12 belonged to the withdrawn cloud design and is not reused.

| ID | Question | Why it matters | Status |
|---|---|---|---|
| S1 | Does `curl bob.ibm.com/download/bobshell.sh \| bash` work non-interactively in a Linux container, where does it install, how is it pinned to a version, is a checksum published? | Dockerfile and G22 | Answered: installer supports `--version X.Y.Z --pm npm`; no checksum file; npm registry integrity is the safeguard. Container install tested in Phase 4. |
| S2 | Exact flags for read-only operation, tool allow/deny, and is there a machine-readable output option? | Output contract (G16) | Answered (v2): `bob run -f json`; `--disable-tool-groups edit,execute --disable-mcp`; stats.session_costs per run. |
| S3 | Can a custom mode be selected non-interactively, and from a repo-local or image-baked file? | Reviewer prompt packaging | Answered (v2): `--mode <slug>`; project `.bob/custom_modes.yaml` in `--workspace` dir loaded; no image-baking needed. |
| S4 | How do trusted folders behave non-interactively? | G29 | Answered (v2): trusted folders do NOT control tool availability in v2; `--disable-tool-groups` is the mechanism; `--workspace` controls project config scope. |
| S5 | What happens when the model tries a disallowed tool? | G4 test oracle | Answered (v2): with `--disable-tool-groups edit,execute`, write tools absent; stats.tool_calls=0; exit code 0. |
| S6 | Exit codes and error output for auth failure, quota exhaustion, timeout | Failure handling | Answered (v2): auth failure exit 1 + plain text to stderr; empty prompt exit 1; budget overrun exit 0; API key env var is BOB_API_KEY. |
| S7 | Does a non-interactive run report token or Bobcoin usage anywhere? | G14, G37, cost section of the article | Answered (v2): stats.session_costs in `-f json` result, recorded as Bobcoins (ADR 0011; unit unverified). No token breakdown. |
| S8 | Can Bob read files outside the workspace, and can stdin carry a large prompt? | Prompt delivery design | Answered (v2): outside-workspace file access denied; stdin works for large prompts (200KB tested); deliver diff via stdin. |
| S9 | Which system packages does Bob need beyond Node? | Dockerfile | Answered (v2): Node 22+ (24+ preferred); npm; package is @ibm/bob. Verify in Phase 4. |
| S10 | Rate and concurrency limits on one API key | Parallel PR handling | Unresolved: no documentation found. Assume one-at-a-time; verify empirically in Phase 3. |
| S11 | Does the container entrypoint start Bob as a different unprivileged UID, with a read-only rootfs and dropped capabilities, under podman locally (Ubuntu 24.04 base) and under Docker on the `ubuntu-24.04` runner? | G23 | Open: Phase 4. |
| S12 | Withdrawn (not applicable to the GitHub-hosted runner design). | none | Withdrawn. |
| S13 | Which Bob service region applies to our instance, and what data-residency statement can we make now that the compute location is a GitHub-hosted runner that cannot be selected? | Implication 6, article | Unresolved: no region documentation found for Bob or for standard hosted runners. Owner should check the Bob portal. The Phase 1 stance is withdrawn; the article states "unverified". |
| S14 | Format of trustedFolders.json; which settings keys pin approval mode and disable MCP and AGENTS.md loading? | G28 to G30, egress risk | Answered: trustedFolders.json format confirmed; project settings ignored when untrusted; AGENTS.md loads regardless of trust (disable via `"bob-cline.useAgentRules": false` in user-level settings.json); .env not loaded; MCP blocked per docs. |
| S15 | `workflow_run` behaviour in practice for fork PRs | G6, G24, G31, G32 | Open: Phase 5 (live), analysed on paper in Phase 1. |
| S16 | Does Bobalytics show Bob Shell API-key usage? | G37, reconciliation | Open: Phase 7, optional. |
| S17 | Can a `GITHUB_TOKEN` with only `issues: write` create, update and list comments on a PR, and is it refused on the reviews, check-runs and statuses endpoints? | G25, G34, ADR 0012 | Answered 2026-10-31, contradicts the plan: `issues: write` alone is refused (403) on list and post; posting needs `pull-requests: write`, which also reaches the reviews endpoint. Check runs and statuses are refused. Owner decision 2026-10-31: accept `pull-requests: write` (ADR 0014). [phase-4-runner.md](results/phase-4-runner.md#s17-comment-identity-and-token-scope-contradicts-the-plan) |
| S18 | Are environment secrets with a deployment-branch restriction available for the owner's plan and repository visibility (private or public)? If not, what is the fallback? | G25, ADR 0012 | Answered 2026-10-31: available on the private repo; environment `bob-review` limited to `main` created. [phase-4-runner.md](results/phase-4-runner.md#s18-environment-secrets-on-the-owners-plan) |
| S19 | Does a hosted runner reach the Bob service, and does `BOB_API_KEY` authenticate there (the docs search showed `BOBSHELL_API_KEY`; Phase 0 used `BOB_API_KEY`)? | D1, ADR 0001 | Answered 2026-10-31: yes; `BOB_API_KEY` authenticates from a hosted runner. [phase-4-runner.md](results/phase-4-runner.md#s19-runner-reaches-bob-variable-name) |
| S20 | How are the reviewer code and image delivered to the jobs when the reviewed repo differs from this repo: reusable workflow from a private repo, image from GHCR by digest, or per-run build? Do artifacts pass cleanly between the three jobs? | Layout, G22 | Partly answered 2026-10-31: per-run build from the default-branch checkout works and artifacts pass cleanly; cross-repo delivery is Phase 5. [phase-4-runner.md](results/phase-4-runner.md#s20-delivery-route) |

Decision gate after Phase 0 (recorded 2026-10-30):

- **Read-only enforcement** (S2, S5): Reliable for file writes and shell execution when running
  from an untrusted directory. Write tools are absent from the tool set; files.totalLinesAdded=0
  is the test oracle. The Dockerfile must not pre-trust the scratch directory. No additional OS
  sandbox is strictly required to prevent file writes, but the planned read-only rootfs mount is
  kept for defense-in-depth.
- **AGENTS.md gap**: AGENTS.md is loaded even from untrusted folders. Mitigation: bake
  `"bob-cline.useAgentRules": false` into the image's user-level settings.json, and assert the
  scratch directory contains no AGENTS.md before each run. This replaces the G30 assumption that
  `/etc/bobshell/settings.json` is the control (that path was not confirmed to exist; user-level
  `~/.bob/settings.json` is the verified key location).
- **Usage reporting** (S7): stats.sessionCost is available in -o json output on every successful
  run. Per-PR cost is a labelled estimate; the article says so.
- **Reviewer mode delivery** (S3, S14): mode YAML baked at `~/.bob/settings/custom_modes.yaml`;
  selected via `--chat-mode`; project-level file not used.
- **Scratch directory trust** (S4): Leave trustedFolders.json absent or with no entry for the
  scratch path; this is sufficient for tool restriction. Add an explicit untrust entry for defense-
  in-depth if the trustedFolders.json ownership allows it.

## 6. GitHub Actions target

Everything runs on GitHub. No cloud account is needed. The names below are placeholders.

| Item | Value |
|---|---|
| Runner | GitHub-hosted `ubuntu-24.04` (label pinned, not `ubuntu-latest`); standard size |
| Workflow | `.github/workflows/bob-review.yml` in the reviewed repo (or a reusable workflow it calls, S20); trigger `workflow_run` plus label re-request; jobs `prepare`, `review`, `publish` |
| Environment | `bob-review`, deployment branches limited to the default branch; holds `BOB_API_KEY` (and `BOB_COMMENT_TOKEN` only if a dedicated bot is chosen) |
| Repository variables | `BOB_REVIEW_ENABLED`, `BOB_REVIEW_REQUIRED_WORKFLOWS` (names only, no secrets) |
| Image | `pr-reviewer`, built from `integrations/container/Dockerfile` on `ubuntu:24.04`, pinned by digest; delivery route decided in S20 (GHCR by digest, or built per run from the trusted default-branch checkout) |
| Artifacts | `prompt` (redacted prompt, from `prepare`), `result` (raw Bob output, from `review`), `audit` (cost record and audit log, from `publish`); short `retention-days` |
| Secrets | See [ADR 0012](adr/0012-secrets-and-credentials-on-github.md) and [CONTRACTS.md](CONTRACTS.md) section 2 |

Local tooling on this machine: `gh`, `node` (v26.3.1), `bob` and `podman` 6.0.0. `docker` is
absent. The image is built and the canary run locally with **podman** on an Ubuntu 24.04 base so
the local OS matches the runner OS. The runner itself uses Docker (preinstalled; the Dockerfile
is plain OCI and builds with either). Workflow behaviour is tested in the sandbox repo, not with
`act`.

Setup is performed with `gh` commands documented in `docs/SETUP.md` (Phase 8) and a teardown
section in the runbook that removes the environment, secrets, variables and workflow.

## 7. Target repository layout

```
.
├── README.md
├── AGENTS.md                     # instructions for any Bob/agent session working on this repo
├── Makefile                      # test, lint, build targets
├── docs/
│   ├── INDEX.md
│   ├── PLAN.md                   # this file
│   ├── STATUS.md                 # phase tracker, updated by every task
│   ├── CONTRACTS.md              # shared interfaces: job inputs, findings schema, comment format, cost record
│   ├── tasks/                    # one self-contained brief per phase
│   ├── ARCHITECTURE.md
│   ├── THREAT_MODEL.md
│   ├── SETUP.md                  # GitHub environment, secrets, variables, first run
│   ├── TESTING.md                # how to run every suite and read results
│   ├── RUNBOOK.md                # key rotation, kill switch, incident steps, teardown
│   ├── ARTICLE.md                # the narrative deliverable
│   ├── adr/                      # architecture decision records
│   ├── results/                  # recorded spike, red-team, eval, cost outputs
│   └── diagrams/                 # .drawio sources and exported .png
├── reviewer/                     # core that runs inside the job
│   ├── src/                      # prepare, gate, rules, redact, prompt, run-bob, validate, triage, sanitise, cost, publish
│   ├── prompts/                  # reviewer prompt templates and output schema
│   ├── modes/                    # Bob custom mode definition for the reviewer
│   ├── config/                   # cost rates, caps, thresholds
│   └── package.json
├── integrations/
│   ├── container/                # Dockerfile (ubuntu:24.04 base), local podman build and run scripts
│   └── github-actions/           # review workflow (workflow_run, label re-request; prepare, review, publish), no PR checkout
├── examples/
│   └── sandbox-repo/             # small app, its CI workflow (build + tests), .bob-review/ sample rules, seeded-flaw branches
├── tests/
│   ├── unit/
│   ├── pipeline/                 # fake-bob shim driven tests
│   ├── fixtures/                 # sample diffs, malicious outputs, secrets
│   ├── redteam/                  # injection corpus and canary harness (live)
│   └── evals/                    # seeded-bug PRs and scoring script (live)
├── scripts/
│   ├── spikes/                   # Phase 0 probes
│   └── validation/               # lint and policy checks
└── .github/workflows/            # this repo's own CI (lint, unit, pipeline tests)
```

Language choice for `reviewer/`: Node.js (Bob Shell already requires Node 22.15 or later, so no
extra runtime), plain ESM with `node:test`, minimal or zero dependencies to keep the supply chain
small.

## 8. Phased work plan

Each phase ends with a gate. Do not start the next phase until the gate passes. Each phase has a
self-contained brief in [docs/tasks/](tasks/README.md); progress is tracked in
[STATUS.md](STATUS.md).

### Phase 0: Spikes against the real Bob CLI (local, cheap)

Work: scripts under `scripts/spikes/` answering S1 to S10, S13 and S14 (S7 covers what usage
information a run exposes); capture outputs in `docs/results/spikes.md`. Needs no cloud or GitHub
resources.
Gate: every unknown has a recorded answer or an explicit "unresolved, assume worst case" note;
read-only enforcement decision made (see decision gate in section 5); cost reporting approach
chosen (reported, or estimated).

### Phase 1: Threat model, ADRs, architecture freeze

Work: `THREAT_MODEL.md` (assets, actors, trust boundaries, abuse cases, per-control mapping to
G-IDs), `ARCHITECTURE.md` with draw.io diagrams, ADRs for execution environment (written),
author and fork policy, trigger after CI, output format and findings contract, rules location,
in-container isolation mechanism, cost record format. Paper analysis of S15.
Gate: owner sign-off on author policy, data-egress stance, the review scope table and the
findings contract.

### Phase 2: Reviewer core with offline tests

Work: implement stages 1 to 3 as modules, including head pinning, base-branch rules loading,
findings validation and triage, the AI Assisted header and footer, and the cost record; a
`fake-bob` shim for deterministic runs; unit and pipeline tests covering G2, G3, G8, G9, G13 to
G20, G24, G27, G32 to G37.
Gate: `make test` green offline; mutation check done for each covered guardrail.

### Phase 3: Real Bob integration (local)

Work: swap the shim for real `bob`; reviewer mode file; sample rules in
`examples/sandbox-repo/.bob-review/`; prompt and schema iteration against hand-picked diffs;
record cost and latency per run.
Gate: ten varied diffs reviewed with schema-valid output, rule IDs cited correctly, and a recorded
cost record per run.

### Phase 4: Runner foundation (container, stage split, secrets wiring)

Work, in two parts. Part A is local and needs no GitHub resources: Dockerfile on `ubuntu:24.04`
(base pinned by digest, Node 22.23.4 verified by SHA-256, `@ibm/bob` pinned, git, non-root, UID
split) built and run with podman; canary and probe pass inside the container (S11, G23);
`reviewer/bin/reviewer.js` gains `prepare`, `review` and `publish` subcommands that exchange the
two artifacts (the single-process mode stays); cost record updated for GitHub run ids and runner
minutes; workflow skeleton under `integrations/github-actions/` with per-job `permissions:`,
`timeout-minutes` and the secret-reference rules of ADR 0012; static checks that enforce them.
Part B needs the owner (GitHub plan, environment, secrets, sandbox repo): create the `bob-review`
environment and secrets with `gh`, run the three-job workflow by hand (`workflow_dispatch` against
a sandbox PR), resolve S17 to S20, S11 on the runner.
Gate: a manually started workflow run reviews a sandbox PR and posts one comment; the Bob key is
present only in the `review` job and the comment token only in `publish` (checked from the
logs and the workflow); artifacts, summary and audit record exist; teardown commands leave
nothing behind.

### Phase 5: GitHub trigger and end-to-end matrix

Work: sandbox repo with a real CI workflow (build and tests); review workflow on `workflow_run`
(conclusion check, required workflows), label re-request trigger, concurrency, kill switch, author
policy; lint with actionlint and zizmor; resolve S15; sandbox repo e2e. A dedicated bot account
only if S17 fails or the owner wants a named identity.
Gate: e2e matrix passes: same-repo PR with green CI, red CI (no review), cancelled CI, two required
workflows with one red, fork PR, outside-contributor PR without label, draft, oversized, push
between CI and review (stale), two rapid pushes, PR that edits its own rules (old rules used),
kill switch off, Bob unavailable, bad key, timeout, bot cannot approve or satisfy a required
approval.

### Phase 6: Red team and quality evals (live, budgeted, run in the container)

Work: injection corpus with canaries (PR title, body, commit messages, code comments, README,
filenames, unicode and bidi tricks, markdown image exfiltration, fake "approved" text and fake
AI Assisted headers in model output, instructions to call tools or read parent environ);
seeded-flaw eval set scored per task (standards violations with rule IDs, team-rule violations,
security flaws with remediation quality, clean PRs for false positives), precision and recall of
findings, share of findings a human would keep, each case run several times.
Gate: zero canary leaks, zero write effects, zero approvals across the corpus; eval results
recorded honestly, including failures and variance.

### Phase 7: Operational hardening and cost reconciliation

Work: key rotation drill (Bob key, comment token if a bot account is used), kill-switch drill, cost
records aggregated over all e2e and eval runs and compared with Bobalytics daily spend where S16
allows, cost-cap drill, teardown and re-create from scratch using only the docs.
Gate: each drill is recorded in `docs/results/` and the runbook matches what was actually done;
the article can state per-PR cost with its accuracy.

### Phase 8: Documentation, article, final validation

Work: `SETUP.md`, `TESTING.md`, `RUNBOOK.md`, diagrams (draw.io exported to PNG), `ARTICLE.md`
built from recorded results, README documentation section, index file.
Gate: a fresh reader can reproduce setup from the docs; all article claims linked to a source or
result; full validation run recorded.

## 9. Test strategy

| Layer | What | Needs Bob? | Needs GitHub? | Cost | Runs where |
|---|---|---|---|---|---|
| Static | actionlint, zizmor, shellcheck, eslint or equivalent, secret scan of the repo itself, workflow policy checks (permissions, secret references, timeouts, pins) | No | No | Free | Every push |
| Unit | CI gate, head pinning, rules loading, gating, redaction, findings validation and triage, sanitiser, header and footer, schema validation, env scrubbing, identifier validation, budget counters, cost record | No | No | Free | Every push |
| Pipeline | full prepare-review-publish run with `fake-bob` (valid, malformed, huge, hanging, hostile outputs, hallucinated locations) and a mocked SCM API that rejects every endpoint except comment create and update | No | No | Free | Every push |
| Container | image builds with podman on the Ubuntu 24.04 base, runs as non-root, canary credential isolation test, no secrets in image layers | Optional | No | Low | On image change |
| Live smoke | one trivial prompt through the real workflow | Yes | Yes | Tiny | Manual |
| Red team | injection corpus with canaries, assertions on leaks, tool attempts, approvals, output sanity | Yes | Yes | Moderate | Manual, budget-capped |
| Quality eval | seeded-flaw PRs per review task, repeated runs, precision, recall, false-positive rate, variance | Yes | Yes | Moderate | Manual before releases |
| E2E | sandbox repo with real CI, real PRs, real comments, through the review workflow | Yes | Yes | Moderate | Manual, scripted |

Principles:

- Every guardrail in section 4 has at least one test that fails when the guardrail is removed
  (mutation check: temporarily disable the control and confirm the test goes red).
- Live suites have an explicit run budget and a stop-on-failure switch; the cost records of live
  runs are themselves a test output.
- Results are written to `docs/results/` with date, Bob Shell version, image digest, and run
  counts, so the article cites measurements rather than impressions.
- Local constraint: `docker` is not installed on this machine, so container builds and the canary
  use podman; workflow testing uses the sandbox repo instead of `act`.

## 10. Decisions

### Fixed

| # | Decision | Value |
|---|---|---|
| 1 | Execution environment | GitHub-hosted runners, three jobs with separate credentials, Bob in a hardened container ([ADR 0001](adr/0001-execution-environment.md)) |
| 2 | CI system | GitHub Actions |
| 3 | Secret store | GitHub environment secrets, default branch only ([ADR 0012](adr/0012-secrets-and-credentials-on-github.md)) |
| 4 | Resource names | Placeholders in section 6; the environment, secrets and variables are created in Phase 4 Part B with `gh` |
| 5 | Primary deliverable | Repository and article together, article written from repo results |
| 6 | Language for the core | Node.js ESM, near-zero dependencies |
| 7 | Review moment | Only after the required CI workflows (build, tests) have passed on the PR head commit |
| 8 | Review tasks | Coding standards, team-specific rules, security review with triage and proposed remediations |
| 9 | Authority | Advisory comments marked AI Assisted; no approvals, no blocking; a human decides |
| 10 | Context Bob sees | The diff plus the full text of changed files, plus the team rules, in a scratch directory |
| 11 | Per-PR cost | Recorded for every run, shown in the comment footer and the audit log |

### Defaults, open to change

| # | Decision | Default |
|---|---|---|
| 12 | SCM identity for comments | The `publish` job's `GITHUB_TOKEN` with `issues: write` only (`github-actions[bot]`), pending S17; a dedicated bot account with a fine-grained token, or a GitHub App, is the alternative |
| 13 | Author policy | Auto-review OWNER, MEMBER, COLLABORATOR; others by maintainer label |
| 14 | Team rules location | `.bob-review/` on the base branch of the reviewed repo (`standards.md`, `project-rules.md`, optional `security.md`) |
| 15 | Required CI definition | Repo variable listing the workflow names that must be green |
| 16 | Findings presentation | One summary comment with findings grouped by category and severity, each citing file and line; inline comments are a change case |
| 17 | Data egress and residency stance | Document it; add redaction; owner confirms repos in scope may be sent to Bob from a GitHub-hosted runner whose location is not selectable (S13) |
| 18 | Article | Short LinkedIn article for the owner's network and clients (target 900 to 1300 words): technical problems solved, security implications and benefits; drafted as `docs/ARTICLE.md`; exact length confirmed with the owner in Phase 8 |
| 19 | Reviewer code and image delivery | Open (S20): reusable workflow plus a GHCR image pinned by digest, or a per-run build from the trusted default-branch checkout |

### Inputs needed from the owner

| When | Input |
|---|---|
| Phase 7 (optional) | Someone with Bobalytics access looks at the dashboard after the live runs and reports what it shows for the Bob key used (S16) |
| Phase 3 | Bob Inference API key and a small Bobcoin budget for live tests |
| Phase 3 | Starter coding standards and a few real team rules, or permission to use invented ones |
| Phase 4 Part B | GitHub plan and repository visibility for the sandbox (decides environment secrets, S18); permission to create the `bob-review` environment and secrets in the sandbox repo; the Bob key set by the owner with `gh secret set` from a file or prompt |
| Phase 4 Part B | Confirmation of the data-residency stance for compute on a GitHub-hosted runner (S13) |
| Phase 5 | Sandbox GitHub repo, a second account for outside-contributor and fork tests, and a bot account only if S17 fails or a named identity is wanted |
| Phase 3 onward | Confirmation that the code sent to Bob is acceptable (sandbox or synthetic code assumed) |

## 11. Risks to the project itself

| Risk | Mitigation |
|---|---|
| Bob Shell flags or behaviour differ from the documentation | Phase 0 spikes before design freeze; pin version; record version in results |
| Read-only enforcement is weaker than assumed | Decision gate after Phase 0; stricter sandbox |
| Container cannot drop to a second UID on the runner or under podman (S11) | The job boundary already isolates the comment token (ADR 0001); the UID split is defence in depth, so record the result and rely on the other container hardening |
| Anyone with write access can read repository secrets through a workflow, or the plan lacks environment secrets (S18) | Environment scoped to the default branch; Bobcoin ceiling on the key; rotation in the runbook; documented weaker fallback; sandbox may need to be public |
| `GITHUB_TOKEN` with `issues: write` cannot list or update comments, or is not refused on reviews (S17) | Use a dedicated bot token held only by `publish` (ADR 0012) |
| Hosted runner cannot reach the Bob service, or the key variable differs (S19) | Live smoke early in Phase 4 Part B; record exact egress needs |
| Compute location cannot be chosen, so the earlier residency stance fails (S13) | Owner decision; state in the article; larger runners with static IPs or a self-hosted runner are change cases |
| `workflow_run` does not behave as assumed for forks (S15) | Spike in Phase 5 with a real fork; fall back to maintainer-triggered review for fork PRs |
| No usable per-run usage figure from Bob (S7, S16) | Labelled estimates plus daily reconciliation; article states the accuracy |
| Review is too noisy or too shallow to be useful | Triage and caps (G36); precision and recall evals; tune before enabling beyond the sandbox |
| Live tests burn Bobcoins or runner minutes | Budget caps, small corpora, cost records on every run, teardown commands |
| Non-determinism makes tests flaky | Assert on properties (schema, no leaks, no writes, no approvals), not on exact wording; repeat runs for evals |
| Scope creep into a product | Section 1 out-of-scope list; gates between phases |
| Article overclaims | Claims must link to a doc source or a recorded result |

## 12. Possible change cases for future developments

Each case lists what would change and which guardrails or components it touches. None is planned
work; each would need its own risk review.

| Change case | What changes | Touches |
|---|---|---|
| Keyless secret delivery | Fetch the Bob key at run time from an external secret manager using GitHub's OIDC token, so no long-lived Bob key is stored in GitHub. Needs a secret manager that trusts GitHub OIDC claims and a Bob key that can be minted or rotated by API (unverified) | G2, G21, G25, ADR 0012 |
| GitHub App instead of PAT | Short-lived, installation-scoped comment tokens with per-repository permissions and a bot identity, removing the personal token | G2, G7, G34, credential handling in publish stage |
| Other CI systems | Any CI that can run the same three stages on separate machines with separate credentials could host the reviewer. Needs equivalent controls (no PR code execution with secrets, identifier validation, CI-green check, kill switch, concurrency) | G1, G6, G7, G10, G11, G12, G24, G31, new `integrations/` entry |
| Other SCMs | GitLab, Bitbucket or Gitea need a different fetch and publish adapter and their own comment-upsert semantics | Prepare and publish stages, G17, G18, G34 |
| Scanner results as input | Feed results of the team's SAST, dependency or secret scanners (for example SARIF files) to Bob so it triages and explains them. Artifacts are produced by PR code, so they are untrusted and need the same data-only handling | G6, G28, G36, prompt design |
| Base-branch checkout as extra context | Give Bob the surrounding repository at the base commit (trusted code only) so it can follow imports and conventions. Increases data sent and prompt size; the checkout must never include PR-controlled configuration | G8, G15, G28, G29, implications 1 and 10 |
| Inline review comments | Post findings as line comments in a single PR review of type comment, instead of one summary comment. Needs diff-line mapping and a per-finding upsert strategy | G17, G18, G34, G36 |
| Applying fixes or blocking merges | Let Bob open fix PRs or turn findings into a required check. Requires a measured false-positive rate, write-capable tooling and a separate trust model; contradicts the advisory principle | Principles, G4, G16, G34, whole threat model |
| Self-hosted or larger runners | Run the `review` job on a self-hosted runner or a larger runner with static IPs and a chosen region, for residency or egress control. Environments do not isolate self-hosted runners (documented), so each run needs an ephemeral runner | Section 6, S13, G23, implication 9 |
| Other data residency tiers | Pair with a different Bob service region to meet residency rules | Section 6, S13 |
| Domain-level egress control | Add a proxy or firewall that restricts outbound traffic to Bob and GitHub endpoints only, which needs a runner type that supports it | Implication 9, G4 |
| Richer reviewer behaviour | Per-language modes, feedback loop from resolved or dismissed comments, tuning of thresholds from human reactions | G16, G36, prompts, evals |
| Cost controls and reporting | Per-team budgets, dashboards built from the cost records, model or mode selection by PR size, a dedicated Bob user or team so Bobalytics can attribute spend | G14, G20, G37, S16 |
