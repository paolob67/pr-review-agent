# Architecture

This document describes the system architecture, component breakdown, data flow, in-container
isolation model, failure behaviors, and GitHub trigger analysis for the IBM Bob PR Review Agent.

## 1. System Overview

The PR Review Agent is an automated, advisory code review assistant. It operates asynchronously
after continuous integration (CI) tests have passed on a pull request.

The system is split into two major environments:
1. **GitHub Actions (Trigger Plane)**: Runs purely on the repository default branch with minimal
   read-only permissions. It detects completed CI runs, validates author policy, and dispatches a
   job to IBM Cloud Code Engine using validated scalar parameters.
2. **IBM Cloud Code Engine (Review Execution Plane)**: Runs as an ephemeral batch job in Frankfurt
   (`eu-de`). It executes a three-stage pipeline (Prepare, Review, Publish) that fetches the diff
   via GitHub REST API, executes IBM Bob Shell in an isolated scratch workspace, validates model
   findings, and posts or updates a single markdown comment on the pull request.

![Trust Boundaries](diagrams/trust-boundaries.png)
*(Editable diagram source: [docs/diagrams/trust-boundaries.drawio](diagrams/trust-boundaries.drawio))*

## 2. Components and Responsibilities

### 2.1 Trigger Plane (GitHub Actions)
* **Event Listener**: Monitors `workflow_run` events corresponding to required CI workflows, as
  well as manual trigger labels (e.g., `bob-review`).
* **Gate Evaluator**: Evaluates gating rules (G7, G10, G12, G31):
  * Verifies `BOB_REVIEW_ENABLED == "true"`.
  * Verifies PR author association (`OWNER`, `MEMBER`, `COLLABORATOR`) or presence of maintainer label.
  * Verifies that all required CI workflows concluded with `success` for the exact head commit SHA.
* **Job Submitter**: Uses `ibmcloud ce jobrun submit` authenticated via a dedicated, scoped service
  ID (`IBM_CLOUD_API_KEY`). It passes exactly three parameters: `REVIEW_REPO`, `REVIEW_PR_NUMBER`,
  and `REVIEW_HEAD_SHA`. PR code is never checked out on the trigger runner.

### 2.2 Execution Plane (IBM Cloud Code Engine Job)
The container runs an unprivileged Node.js wrapper that executes three sequential stages:

#### Stage 1: Prepare
* Authenticates to GitHub REST API using `SCM_READ_TOKEN`.
* Checks head commit SHA pinning: verifies the PR is open and its current head matches `REVIEW_HEAD_SHA` (G32).
* Evaluates size and path gates (G8, G9): drops PRs exceeding file or byte limits, or PRs with only ignored paths (e.g. lockfiles, docs-only diffs).
* Loads team standards (`.bob-review/standards.md`), rules (`.bob-review/project-rules.md`), and optional configuration (`.bob-review/config.json`) strictly from the repository base branch (G33).
* Fetches the unified diff and file contents, and applies regex secret redaction to mask tokens and private keys before inference (G15).
* Sets up a temporary scratch directory containing prompt instructions, base rules, and custom mode configuration (`.bob/custom_modes.yaml`).

#### Stage 2: Review
* Spawns IBM Bob Shell (`bob run -f json`) in a scrubbed environment (`env -i`) where only `BOB_API_KEY` and necessary runtime variables are present (G2, G3, G23).
* Enforces read-only isolation: passes `--disable-tool-groups edit,execute --disable-mcp` on every run (G4, G30).
* Passes `--workspace <scratch>` pointing to the clean scratch directory, ensuring repository `AGENTS.md` and `.env` files are never loaded (G28, G29).
* Pipes task prompt and code diff directly via standard input (stdin) (S8).
* Enforces process execution timeout (G13) and budget checks (G14).

#### Stage 3: Publish
* Captures and parses the single JSON result line from Bob stdout (G16).
* Validates findings schema: ensures file paths and line numbers exist within the PR diff, rule IDs match supplied base-branch rules, and drops invalid or low-confidence entries (G36).
* Passes finding text through the markdown sanitizer to strip HTML tags, external images, `@mentions`, and bidirectional unicode control characters (G17).
* Attaches immutable AI-Assisted header and footer metadata, including commit SHA, Bob version, run ID, and estimated cost (G19, G35, G37).
* Authenticates to GitHub REST API using `SCM_COMMENT_TOKEN` and idempotently upserts the review comment using a hidden HTML marker (G18).
* Emits a structured audit log line to stdout and IBM Cloud Logs without code or secret content (G20, G27).

## 3. In-Container Privilege Separation and Isolation

The container security model prevents untrusted PR contents from compromising secrets or gaining
system access.

### 3.1 Stage Credential Separation
* The wrapper process receives `SCM_READ_TOKEN`, `SCM_COMMENT_TOKEN`, and `BOB_API_KEY` from Code
  Engine environment secrets (`--env-from-secret`).
* When invoking Bob Shell in Stage 2, the wrapper uses `child_process.spawn` with an explicit
  scrubbed environment allowlist (`env -i` semantics).
* SCM tokens are explicitly omitted from the Bob process environment. Even if prompt injection
  causes the model to attempt environment reflection, no GitHub credentials exist in its process space.

### 3.2 Tool and File Isolation
* Bob Shell v2 tools are categorized into groups. Passing `--disable-tool-groups edit,execute`
  completely removes `write_file`, `insert_content`, `apply_diff`, `execute_command`, and related
  tools from the model context.
* `--disable-mcp` ensures no local or remote MCP servers are started or queried.
* `--workspace` restricts file access tools to the scratch directory; attempts to access parent
  directories are rejected by Bob runtime checks.

## 4. GitHub Trigger and `workflow_run` Paper Analysis (S15)

Unknown S15 analyzes how `workflow_run` interacts with pull requests, fork PRs, and commit updates:

### 4.1 Trigger Mechanics
* `workflow_run` triggers when a target workflow (e.g. `CI`) completes on any branch or pull request.
* Crucially, workflows triggered by `workflow_run` always execute the workflow definition from the
  **default branch** (`main`), with access to repository secrets and read/write tokens.
* The event payload (`github.event.workflow_run`) contains metadata about the triggering workflow:
  * `event`: `"pull_request"`
  * `conclusion`: `"success"`, `"failure"`, or `"cancelled"`
  * `head_sha`: the commit SHA that was tested
  * `pull_requests`: an array of PR summary objects associated with that head SHA

### 4.2 Security and Integrity Properties
1. **Fork PR Safety**: Because the workflow definition is read from `main`, hostile code in a fork
   PR cannot modify the trigger logic or steal GitHub Actions secrets.
2. **Head Commit Verification**: The trigger checks `github.event.workflow_run.conclusion == 'success'`
   and extracts `head_sha`. If multiple PRs match, or if the PR head has already advanced, the job
   wrapper's head pinning (G32) ensures stale runs exit without action.
3. **Outside Contributor Handling**: The trigger checks PR author association or labels before
   dispatching the Code Engine job, preventing denial-of-wallet attacks from unauthorized forks (G7).

### 4.3 Open Points for Phase 5 Testing
* Race conditions when multiple CI workflows finish concurrently for the same PR.
* Behavior when a PR is updated while CI is running (canceling previous workflow runs via concurrency groups).
* Handling of PRs from private forks or internal branches with distinct permission levels.

## 5. Job Outcomes and Failure Behavior

The Code Engine job handles edge cases and operational failures deterministically. To avoid
unnecessary container retries, the job wrapper always exits with code 0 on handled outcomes and
records the event in the audit log (CONTRACTS section 8):

| Outcome Code | Condition | Action Taken | Comment Posted |
|---|---|---|---|
| `reviewed` | Review completed successfully with schema-valid output | Comment created or updated with findings | Yes |
| `skipped_disabled` | Kill switch active (`REVIEW_ENABLED != "true"`) | Exits immediately | No |
| `skipped_stale` | PR closed or head SHA moved since trigger | Exits immediately | No |
| `skipped_gate` | PR is draft, bot, docs-only, or exceeds size limits | Logs skip reason; posts note only if size gate hit | Note on size gate |
| `rejected_input` | Malformed parameters (regex failure on repo/PR/SHA) | Exits immediately, logs error | No |
| `bob_unavailable` | Bob API auth failure, quota exhaustion, or timeout | Logs error, posts short "Review unavailable" note | Short note |
| `bad_model_output`| Bob output fails JSON extraction or schema validation | Logs error, posts short "Review unavailable" note | Short note |
| `publish_failed` | GitHub API error when posting PR comment | Logs failure to IBM Cloud Logs | No |

## 6. Cost and Usage Tracking

Every execution generates a machine-readable cost record (G37) containing:
* Repository name, PR number, commit SHA, and job run ID.
* Input metrics: changed file count, diff bytes, prompt bytes.
* Output metrics: findings kept, findings dropped.
* Bob usage: reported usage in Bobcoins (`stats.session_costs` from Bob JSON output).
* Execution timing: total duration and Bob inference duration in seconds.

The cumulative cost and run count across all reviews of a given PR are preserved in a hidden HTML
comment marker (`<!-- bob-pr-review:v1 {...} -->`) and updated in place.
