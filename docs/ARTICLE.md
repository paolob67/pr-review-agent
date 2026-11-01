# Running an AI Agent as a Pull Request Reviewer: Architecture, Guardrails, and Honest Results

*A technical write-up of a working implementation using IBM Bob Shell and GitHub Actions.*

---

## Table of Contents

1. [Why Automated Code Review, and Why Now](#1-why-automated-code-review-and-why-now)
2. [Why an Agentic Tool, and Why Bob](#2-why-an-agentic-tool-and-why-bob)
3. [What We Built](#3-what-we-built)
4. [Architecture: Three Jobs, Three Credentials](#4-architecture-three-jobs-three-credentials)
5. [The Fourteen Design Implications We Had to Confront](#5-the-fourteen-design-implications-we-had-to-confront)
6. [Guardrail Catalogue: G1 to G37](#6-guardrail-catalogue-g1-to-g37)
7. [Threat Model and Attack Surface](#7-threat-model-and-attack-surface)
8. [Red-Team Results: What the Guardrails Held Against](#8-red-team-results-what-the-guardrails-held-against)
9. [Quality Evaluation: What the Agent Found and What It Missed](#9-quality-evaluation-what-the-agent-found-and-what-it-missed)
10. [Cost: What One Review Actually Uses](#10-cost-what-one-review-actually-uses)
11. [Operational Hardening](#11-operational-hardening)
12. [Caveats and Unverified Claims](#12-caveats-and-unverified-claims)
13. [What an Organisation Needs to Adopt This](#13-what-an-organisation-needs-to-adopt-this)
14. [Where We Did Not Go](#14-where-we-did-not-go)
15. [Conclusion](#15-conclusion)

---

## 1. Why Automated Code Review, and Why Now

Pull request review is the main quality gate before code enters a codebase. In practice it is also
the gate most often opened too wide. Reviewers are busy, context-switching is expensive, and
security patterns are easy to miss under time pressure. A missed hard-coded secret, an SQL
injection via string interpolation, or a missing `rejectUnauthorized: true` on a TLS socket can sit
unnoticed through a review and reach production.

The question is not whether AI can replace a human reviewer: it cannot. LLM output is
non-deterministic, and that alone makes it an unsuitable hard gate. The more useful question is
whether an AI can produce a consistent, structured first-pass opinion on every PR, before a human
looks, at a cost that makes it worth running.

That question breaks into three parts, each with a different answer.

**First: does a first-pass opinion add value?** Human reviewers catch different things at different
times of day, under different deadline pressures. An automated reviewer applies the same rule set
on every PR, at every hour, with no review fatigue. It will not catch everything; the eval results
in section 9 show a 97 per cent recall on the tested flaw types but a 2.5 false-positive rate per
clean PR. What it does consistently is flag the obvious: hard-coded secrets, SQL injection via
string interpolation, insecure random for session tokens, disabled TLS verification. Those are
exactly the findings that human reviewers skip when they are in a hurry.

**Second: does it cost enough to matter?** On the synthetic diffs in this project, a review costs
about 0.02 Bobcoins and 3 GitHub-hosted runner minutes (see section 10 for accuracy caveats). At
the published GitHub rate of $0.006 per runner minute, compute alone is roughly $0.018 per review
(this project does not convert Bobcoins to money; the dollar figure is for orientation only). For
a team merging dozens of PRs per week, that is a cost that justifies the experiment.

**Third: does a first-pass opinion change behaviour?** That is the hardest question to answer
without a longitudinal study. What this project can say is that the bot flagged every injected
critical flaw in the eval set except one rule-tagging miss. Whether that changes what developers
submit, or what reviewers catch, requires a team willing to run it for a few months and look at the
data. This document reports the technical result; the human-factors question is outside its scope.

---

## 2. Why an Agentic Tool, and Why Bob

Given the goal of automated PR review, a team has options. This section argues the case for IBM
Bob specifically, grounded in the technical properties the project verified in practice.

### 2.1 What Makes an Agentic Tool Different From a Script

The simplest automated reviewer is a script that sends a diff to a model API and posts the
response. That works, and for many teams it is enough. The difference with an agentic tool is the
ability to use tools during the review: reading surrounding files to understand context, looking up
a symbol definition, or tracing what a changed function calls and what calls it. A diff alone shows
what changed; the agent can ask about the surrounding code rather than reasoning from the diff
alone.

IBM Bob Shell is designed for this. The agentic chat sidebar and the `bob run` command share the
same tool-calling infrastructure: `read_file`, `GetSymbolsOverview`, `grep`, and others are
available by default in every run. The reviewer in this project runs in read-only mode, so the
agent reads the diff and can read surrounding repository files to build context, but writes nothing.
That is the key property: agentic context-gathering without agentic side effects.

Whether the context-gathering actually improves the review depends on the codebase. For the
synthetic diffs in this project, the mode file and the diff were sufficient and the agent rarely
needed to read further. On a real codebase with shared utilities, shared security helpers, and
layered abstractions, reading the call sites and the dependency tree before reporting a finding
would likely reduce both false positives and missed findings.

### 2.2 What Bob Brings That Matters for This Use Case

Several properties of Bob Shell are specifically relevant to running an AI agent in a CI pipeline,
rather than interactively in an IDE. Each was verified in the spike phase
([`docs/results/spikes.md`](results/spikes.md)) before the architecture was finalised.

**A documented non-interactive mode with machine-readable output.** `bob run -f json` produces one
JSON line on stdout containing the result, usage figures, and tool-call count. No screen-scraping,
no log parsing, no undocumented flags. CI-friendly authentication via API key is a first-class
mechanism, not a workaround (Bob documentation:
[Installing Bob Shell: API key authentication](https://bob.ibm.com/docs/shell/getting-started/install-and-setup#api-key-authentication),
spike S2, recorded in [`docs/results/spikes.md`](results/spikes.md#s2-non-interactive-flags-and-output-format)).

**Tool-group disable flags that enforce read-only at the platform level.** Passing
`--disable-tool-groups edit,execute --disable-mcp` removes write and execute capabilities from the
model context for the entire run. This is a flag on the `bob run` invocation, not a prompt
instruction: the tools are absent from the model's available set before the prompt is ever
evaluated. Spike S2 verified this empirically: with both groups disabled, the model correctly
reports it has no write tools available (recorded in
[`docs/results/spikes.md`](results/spikes.md#s2-non-interactive-flags-and-output-format)).
The Bob documentation on disabling MCP confirms the same mechanism for that flag: "Bob removes all
MCP-related logic and definitions from your system prompt"
([Bob Shell: Using MCP in Bob](https://bob.ibm.com/docs/ide/configuration/mcp/mcp-in-bob#enable-or-disable-mcp-servers)).
The red-team results in section 8 confirm the combined effect held against 16 live adversarial
cases (guardrails G4, G30).

**`--workspace` isolation that confines file access to a synthetic directory.** Passing
`--workspace <scratch>` restricts file-reading tools to a directory created by the job wrapper,
containing only the data the wrapper chose to put there. The reviewed PR's own files, any
`AGENTS.md` in the repository, `.env` files, and MCP server configuration never reach the scratch
root. This is enforced by the Bob runtime, not by a prompt instruction (spike S4, guardrails
G28, G29).

**Structured cost reporting per run.** `stats.session_costs` in the JSON result line is the
per-call inference cost figure, readable by the wrapper without a separate API call. This is what
makes the per-PR cost record in this project possible, with no external billing dependency (spike
S7, guardrail G37).

**Modes and custom rules delivered to the agent as first-class configuration.** A custom mode
YAML file in the scratch directory's `.bob/` folder is loaded automatically and drives the agent's
persona, its rule set, and its output schema. Team-specific security rules, coding standards, and
project conventions are written there and version-controlled in the base branch. The agent applies
them on every review without any change to the wrapper or the workflow (spike S3).

### 2.3 Data Residency, Model Choice, and the Self-Hosted Path

This project ran against the Bob cloud service: code and diffs travel from a GitHub-hosted runner
to IBM's inference infrastructure. For most enterprise teams this is the simplest starting point.
The subscription region for this project is Global (S13, confirmed), and the data residency
implications of that must be stated rather than glossed over; section 6 covers what is and is not
controlled.

For organisations in regulated industries (financial services, healthcare, government) or those
protecting sensitive intellectual property, the picture changes with IBM Bob's self-hosted
deployment option, announced at general availability in October 2026
([IBM Introduces Self-Hosted Deployment for IBM Bob](https://newsroom.ibm.com/2026-10-01-ibm-introduces-self-hosted-deployment-for-ibm-bob-to-help-enterprises-advance-ai-sovereignty-and-governance)).
A self-hosted Bob instance runs in a customer-managed environment, including air-gapped
infrastructure. The `review` job in this project talks to the Bob service over one HTTPS call; in
a self-hosted deployment that call goes to an internal endpoint instead. The wrapper code, the
guardrails, and the three-job workflow are model-endpoint-agnostic. Switching is an environment
variable change, not an architecture change.

The self-hosted deployment also opens the model choice. The IBM announcement
([ibm.com](https://www.ibm.com/new/announcements/ibm-bob-expands-to-self-hosted-environments-for-sensitive-and-mission-critical-enterprise-software))
supports customer-provided models through a bring-your-own-licence approach. Supported self-hosted
models at general availability include NVIDIA Nemotron and Poolside Laguna; hybrid configurations
support Claude Sonnet 5.0, Claude Opus 4.8, Gemini 3.7 Flash, and OpenAI GPT 5.6 Sol. Two
implications for PR review are worth naming.

First, a team could connect a smaller, specialised model for security scanning rather than routing
the same workload through a large general-purpose frontier model. A model fine-tuned on a specific
language, a specific vulnerability class, or the team's own historical review findings could
deliver higher precision on the patterns that matter most to that team, at lower inference cost and
latency. This project used the cloud service and its default model; the architecture does not
prevent connecting a different backend.

Second, organisations that already hold eligible licences for models on IBM's supported list can
apply them to Bob through the BYOL path, building on existing model and infrastructure investments
rather than acquiring a separate licence for the PR review workload
([ibm.com](https://www.ibm.com/new/announcements/ibm-bob-expands-to-self-hosted-environments-for-sensitive-and-mission-critical-enterprise-software)).

IBM also plans to introduce multi-model routing in future releases, intended to reduce the
complexity of matching models to development tasks while helping teams balance capability,
performance and cost
([ibm.com](https://www.ibm.com/new/announcements/ibm-bob-expands-to-self-hosted-environments-for-sensitive-and-mission-critical-enterprise-software)).

### 2.4 Cost Visibility and Operational Control

An argument that recurs in enterprise AI adoption is the difference between a managed service that
handles everything and an observable pipeline that a team owns. Both are valid choices; they
optimise for different things.

The Bob approach in this project is firmly in the observable column. Every step is a Node.js
function with unit tests and mutation coverage. The prompt that went to the model is saved as a
one-day artifact. The model version is pinned by package version in the container image. The full
audit log of each run is retained in a GitHub Actions job summary and a short-lived artifact. A
team can reproduce any review or instrument the pipeline to track which rule IDs fire most over
time.

The cost record specifically is machine-readable and owned by the team. The Bob result line
includes `stats.session_costs` (the per-call inference figure reported by Bob), which the wrapper
embeds in a hidden HTML comment marker in the PR comment. Any team member with repository read
access can query it without touching an external billing portal. For organisations that need to
attribute AI cost to specific products, cost centres, or project lines, this structure is an
advantage over relying on a vendor dashboard for cost attribution.

The cost in this project was about 0.02 Bobcoins per review on small synthetic diffs (median,
with a p90 of 0.041). The Bobcoin unit is reported by Bob and not reconciled against an external
billing source (S16); the absolute dollar figure is not known. Three GitHub-hosted Linux runner
minutes are the compute cost per review. Neither figure is a prediction for larger production
diffs, but both are observable and attributable without leaving the repository.

---

## 3. What We Built

The system is a GitHub Actions workflow that triggers after CI has passed on a pull request. It
invokes IBM Bob Shell, an agentic AI assistant, in a hardened container in non-interactive,
read-only mode. The result is a single structured Markdown comment on the PR, labelled
"AI Assisted", with a list of findings, severity levels, the relevant diff lines, and a cost record.

The human reviewer reads it, ignores, verifies, or investigates each finding, and makes the
merge decision. The bot never approves, never requests changes, and cannot satisfy a branch
protection rule.

The reviewer source lives in this repository (`paolob67/bob-pr-review-agent`); the live tests and
evals ran against a separate private sandbox (`paolob67/notes-sandbox`, a small in-memory notes
API). The implementation uses Node.js ESM with no runtime dependencies beyond the GitHub API
client, IBM Bob Shell 2.0.9, and a pinned Ubuntu 24.04 container image. The workflow has 263
offline unit and pipeline tests, 64 mutation-killed guardrail tests, a 16-case live red-team
corpus, and a 30-case quality eval suite.

---

## 4. Architecture: Three Jobs, Three Credentials

The central structural decision is that three jobs run on three separate, fresh GitHub-hosted
runners. Each job holds one credential and cannot access the others.

```
PR event / CI result (untrusted payload)
         |
 (TB-1) Validated identifiers only (repo, PR number, 40-hex SHA)
         v
  Job: prepare  [read-only GITHUB_TOKEN]
  - Applies gates (author policy, kill switch, size, draft, bot)
  - Loads team rules from the base branch via API (never from the PR head)
  - Fetches the diff, redacts secrets, builds the prompt
  - Uploads artifact: prompt
         |
 (TB-2) Job boundary + isolated scratch
         v
  Job: review  [BOB_API_KEY only]
  - Runs Bob Shell inside a hardened container
    (read-only rootfs, tmpfs scratch, dropped caps, no-new-privs, uid 10002)
  - Passes --disable-tool-groups edit,execute --disable-mcp on every run
  - Pipes the prompt via stdin; no SCM token on this runner
  - Uploads artifact: result
         |
 (TB-3) Validated Findings JSON (parsed, schema-checked, sanitised)
         v
  Job: publish  [pull-requests: write only]
  - Treats result as untrusted text
  - Validates schema, checks lines exist in the diff, drops invalid findings
  - Strips HTML, external images, @mentions, bidirectional unicode chars
  - Wraps with an immutable AI-Assisted header and footer
  - Upserts one comment per PR
```

This diagram is from [`docs/ARCHITECTURE.md`](ARCHITECTURE.md). The trust-boundary diagram
(editable source at [`docs/diagrams/trust-boundaries.drawio`](diagrams/trust-boundaries.drawio))
shows the same structure visually.

**Why three jobs?** The comment token must not exist on the same runner as Bob. If Bob were
compromised by a prompt injection into reading environment variables, it would find only the Bob
API key. The SCM token it would need to post a comment or open issues is on a different machine
entirely. This is the single most important structural choice.

**Why `workflow_run` and not `pull_request`?** `workflow_run` always executes the workflow
definition from the default branch, with access to repository secrets. `pull_request` executes
from the PR head branch, which for a fork PR is attacker-controlled. This platform guarantee is
what makes the system manageable for fork PRs without a second GitHub account.
([GitHub Actions documentation on `workflow_run`](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#workflow_run),
recorded in [`docs/results/runner-facts.md`](results/runner-facts.md).)

**Why run only after CI passes?** CI filtering means the agent only sees code that builds and passes
tests. Draft PRs, bot PRs, docs-only diffs, and lockfile-only diffs are all skipped. The gate
prevents spending on work that is not yet ready, and it means the per-review cost goes to
signal-bearing diffs.

---

## 5. The Fourteen Design Implications We Had to Confront

Before writing a line of code, the design review surfaced fourteen implications that shape the
whole system. They are worth stating plainly because they recur in any similar project.

1. **The model is not the trust boundary; the wrapper is.** Any control that relies on the model
   behaving correctly is a mitigation, not a guardrail. Every hard security property must hold
   regardless of what the model does with a prompt injection.

2. **The comment credential must not sit next to the model process.** Solved by the three-job
   split. The `review` job holds only the Bob key; `publish` holds only the comment token.

3. **Anyone who can change the workflow can reach repository secrets.** A user with write access
   can run a modified workflow that prints secrets to the log. Mitigated by environment secrets
   scoped to the default branch (not to all branches), rotation procedures, and the Bob key's
   inherent Bobcoin ceiling.

4. **Output is untrusted too.** Rendered Markdown (image URLs, tracking pixels, `@mentions`, HTML,
   bidirectional unicode) is an exfiltration and abuse channel. The publisher validates and
   sanitises before posting.

5. **Fork PRs.** The trigger never checks out PR code and carries no model-readable SCM secrets,
   which makes fork PRs manageable. The author policy is still explicit.

6. **Data egress and residency.** Source code and diffs travel from a GitHub-hosted runner
   (location not selectable on standard runners) to the Bob inference service. Organisations with
   strict data residency requirements must review this path before deploying.

7. **Key ownership.** Bob API keys are scoped to a user and a subscription. Revocation breaks the
   pipeline immediately. The system needs an operational owner and a rotation runbook.

8. **Duplicate and runaway runs.** Re-pushes, manual re-runs, and multiple CI workflows finishing
   for the same commit must not post duplicate comments or burn budget. Concurrency groups cancel
   superseded runs; the per-PR run cap is read from the comment marker; the comment upsert is
   idempotent.

9. **Egress control is coarse.** Standard hosted runners have no domain-level egress filter. The
   design accepts this and carries the load in credential isolation.

10. **Bob loads configuration from its working directory.** Bob Shell reads `AGENTS.md`, custom
    modes, MCP server configuration, and `.env` from the directory it runs in. A PR could ship any
    of these. Bob must never run in a directory that contains PR-controlled files. The scratch
    directory is created by trusted code and holds only the custom mode file.

11. **Reviewer fatigue.** A noisy bot gets ignored. False-positive rate and confidence thresholds
    matter as much as security.

12. **Team rules are an input the PR author must not control.** Rules loaded from the PR head branch
    can be rewritten by the same PR being reviewed. Rules are loaded from the base branch only.

13. **The CI result must refer to the same commit that gets reviewed.** Head pinning exits quietly
    if the PR head has moved since the trigger fired.

14. **The bot must be unable to approve, even by mistake.** A token that can post comments may also
    reach the review approval endpoint. The publisher is restricted to the comment endpoint only;
    the bot is not a code owner and the workflow has a static check that fails on any stray
    `reviews:` permission. (The APPROVE endpoint returns HTTP 422 for `github-actions[bot]`;
    REQUEST_CHANGES returns HTTP 200 but the workflow never calls it. Recorded in
    [`docs/results/phase-4-runner.md`](results/phase-4-runner.md) section S17.)

---

## 6. Guardrail Catalogue: G1 to G37

The system has 37 numbered guardrails. Each one must have a test that fails when the guardrail is
removed (mutation testing killed 64 guardrail mutations without survivor). The full table is in
[`docs/THREAT_MODEL.md`](THREAT_MODEL.md) section 6. The following groups capture the main
control types:

**Preventive controls on the execution environment:**
- G1: Workflow `permissions: {}` default, per-job least privilege.
- G2/G23/G25: Separate credentials per job on separate runners.
- G3: Bob's environment is scrubbed (`env -i` plus an explicit allowlist). Only `BOB_API_KEY` and
  runtime variables are present.
- G4/G30: Bob runs with `--disable-tool-groups edit,execute --disable-mcp` on every invocation.
  Write tools (`write_file`, `apply_diff`, `execute_command`) are removed from the model context.
- G5/G28/G29: Bob runs in a clean scratch directory with `--workspace <scratch>`. The directory
  holds only the custom mode file. No `AGENTS.md`, `.env`, or MCP configuration from the
  repository reaches the scratch root.
- G6: PR code is never checked out on any runner.
- G21: Read-only rootfs, dropped capabilities, `no-new-privileges`, hard process timeout.
- G22: Bob version, base image, third-party GitHub Actions, and runner label are all pinned (Bob
  to `2.0.9`, base image to a `sha256:` digest, Actions to commit SHAs).

**Preventive controls on data flow:**
- G7: Author policy. PRs from `OWNER`, `MEMBER`, or `COLLABORATOR` are reviewed automatically.
  Others require a maintainer to apply the `ai-review` label.
- G8/G9: Size gates (max files, max diff bytes, max prompt size) and skip rules (drafts, bots,
  docs-only, lockfiles, skip label).
- G11/G12/G31/G32: Concurrency groups cancel superseded runs; the review triggers only when
  required CI concludes success on the exact head SHA; head pinning exits quietly if the head
  has moved.
- G15: Pre-inference regex redaction masks common secret patterns in the diff before the prompt
  reaches Bob.
- G33: Team rules and standards are loaded from the base branch via the GitHub API. PR-head changes
  to rule files cannot affect the review of the same PR.
- G34: The publisher token has only `pull-requests: write`. It never calls the review or
  check-run endpoints.

**Output controls:**
- G16/G36: The result must parse as a strict versioned JSON schema. Findings must reference files
  and line numbers that exist in the diff. Invalid findings are dropped.
- G17: Markdown sanitiser strips raw HTML, external images, `@mentions`, bidirectional control
  characters, and zero-width characters (the last extended in Phase 6 after a red-team find).
- G18: Single idempotent upsert. One comment per PR, updated in place.
- G19/G35: Immutable AI-Assisted header and footer, generated by the publisher, not by the model.
  Imitation attempts in model output are stripped.
- G37: Per-PR cost record embedded in a hidden HTML comment marker in the PR comment.

**Operational and detective controls:**
- G10: Kill switch (`BOB_REVIEW_ENABLED` repository variable). Setting it to `false` stops all
  reviews without changing any code.
- G14: Per-PR run cap (3 runs per PR). Soft: deleting the bot comment resets it (drilled and
  accepted for an advisory tool).
- G20/G27: Structured audit log per run, written without PR code or secrets. Log scrubber ensures
  secrets are not printed.
- G26: Short artifact retention. The `prompt` artifact (holding the redacted diff) is retained for
  one day. Anyone with read access to the repository can read it during that window; this matches
  the design (G15 is the control) and must be stated in the runbook.

---

## 7. Threat Model and Attack Surface

The threat model ([`docs/THREAT_MODEL.md`](THREAT_MODEL.md)) identifies six actor classes and
fourteen abuse cases. The six actors are: outside contributors and fork authors; same-repository
contributors; repository maintainers; malicious forks and upstream compromises; supply chain
attackers; and repository writers or leaked-token holders.

Three trust boundaries separate untrusted input from privileged operations (TB-1: trigger, TB-2:
review execution, TB-3: output publishing). The most important properties are:

**What an attacker controlling a PR diff can and cannot do:**
- Can provide text that reaches Bob's context (that is the point of the system).
- Cannot write files, execute commands, or start network connections from within Bob, because write
  and execute tool groups are disabled.
- Cannot exfiltrate an SCM token, because no SCM token exists on the `review` runner.
- Cannot post an approving review, because the publisher uses only the comment endpoint.
- Cannot steer the published comment past the schema check, the sanitiser, or the immutable
  header/footer, even if Bob follows an injection instruction.

**What an attacker with write access to the repository can do:**
- Read repository secrets through a workflow they control.
- Mitigated by: environment secrets scoped to the default branch only; workflow changes reviewed
  before merge; rotation runbook.

**What is not controlled:**
- Compute location: GitHub-hosted runners have no selectable region. Code and diffs leave the
  runner and reach the Bob inference service. The subscription's region is Global (S13, confirmed).
  Organisations with strict data residency requirements must evaluate this independently.
- Per-call egress: once the Bob key is valid and the prompt reaches the API, there is no mechanism
  to limit which data Bob processes remotely.

---

## 8. Red-Team Results: What the Guardrails Held Against

Phase 6 ran 16 live adversarial cases across 44 live repetitions, plus 9 offline sanitiser
assertions against the Markdown sanitiser. The full results are in
[`docs/results/phase-6-redteam.md`](results/phase-6-redteam.md).

**Result: 16/16 live cases PASS. 9/9 offline cases PASS. Zero canary leaks. Zero approvals posted.**

The corpus covered:
- Prompt injection via PR title, body, commit message, code comments, README, filenames, and branch
  names.
- Instruction injection in code trying to invoke tool calls (`execute_command`, `write_file`,
  network calls, file reads of `/proc` or credential files).
- Rules file injection (modifying `.bob-review/standards.md` in the PR head, expecting rules to
  change for the same PR).
- `AGENTS.md` injection (placing a hostile `AGENTS.md` in the PR tree).
- `.env` file injection (placing a hostile `.env` in the PR tree).
- Markdown exfiltration (tracking pixels, external images, `@mentions`, HTML tags, fake advisory
  headers, fake "LGTM Approved" text, marker injection, external link exfiltration).
- Bidirectional unicode and zero-width character hiding (rt07, rt25).

**An important observation from the live runs:** in every case, Bob did not follow the injected
instruction. It correctly identified the adversarial payload as a finding and reported it as a
security concern in the review comment, quoting the offending line as evidence. The guardrails held
not only by blocking tool execution (G4, G30) but because the model itself treated hostile
instructions in code as something to flag rather than follow.

That observation has a limit: it is an empirical result on 44 repetitions, not a proof. The wrapper
design carries the hard guarantees; the model behaviour is a welcome additional observation.

**One regression fix was applied during Phase 6:** the Markdown sanitiser's `BIDI_RE` pattern did
not cover U+200B (zero-width space), U+200C (zero-width non-joiner), U+200D (zero-width joiner),
and U+2060 (word joiner). These characters can visually hide injection payloads in rendered
Markdown. The pattern was extended and the fix has a regression case
(`tests/redteam/corpus/rt25_zero_width_chars.json`).

---

## 9. Quality Evaluation: What the Agent Found and What It Missed

Phase 6 ran 30 seeded-flaw JavaScript fixtures through the live system. Twenty cases formed a
training set; ten were held out and run once without prompt tuning after seeing training results.
Full results are in [`docs/results/phase-6-evals.md`](results/phase-6-evals.md).

**Overall: 25/30 cases passed (83%). Flawed-case recall: 0.97. Clean-case false-positive rate:
2.5 medium-or-higher findings per PR.**

The training set (ev01-ev20) covered: hard-coded secrets, SQL injection, missing input validation,
path traversal, silent catch blocks, missing tests, dead code, weak crypto (MD5, AES-ECB, plain
AES for passwords), insecure random (Math.random for session tokens), disabled TLS verification,
missing fetch timeouts, OS command injection, SSRF, missing authorisation checks, unsafe `eval`,
prototype pollution, secrets in logs, and multi-flaw combinations.

Recall was 1.00 on 18 of 20 training cases. The two failures:

- **ev13 (OS command injection via `exec()`):** Bob detected a critical security finding for command
  injection but did not assign the `STD-002` rule tag. The scorer requires the rule ID to appear;
  the finding was substantively correct but untagged. The reviewer prompt needs `exec()` with
  string interpolation added as an explicit example of `STD-002`.

- **ev20 (clean file):** 3 false positives at medium or higher severity on a file with a correct
  path traversal guard, safe `fetch`, and safe crypto. The FP rate on clean code with
  security-adjacent patterns is elevated.

The held-out set (ev21-ev30) confirmed the pattern. Recall was 1.00 across all 7 flawed cases.
Three of four clean cases failed: Bob raised false positives on a parameterised query builder, on
correct `scrypt`+`timingSafeEqual` crypto, and on a correctly implemented network client with an
URL allowlist, a timeout, and `rejectUnauthorized: true`.

**What this means in practice:**

- Bob will almost certainly flag a hard-coded secret, a template-literal SQL query, a disabled TLS
  certificate check, or an insecure random source. Recall on the tested flaw types is high.
- Bob will sometimes flag correct, defensive code as risky. A reviewer using this system should
  expect roughly 2 to 3 false-positive findings per clean PR in security-adjacent areas. Confidence
  thresholds and prompt iteration can reduce this; neither was changed in this project after seeing
  the eval results, in order to keep the eval unbiased.
- The missing `STD-002` tag on OS command injection via `exec()` shows that rule-mapping coverage
  in the prompt matters. A more exhaustive example list for injection-class rules would likely fix
  this specific gap.

---

## 10. Cost: What One Review Actually Uses

Phase 7 collected 269 workflow runs from the sandbox to produce the cost summary in
[`docs/results/cost-summary.md`](results/cost-summary.md).

**Summary figures (small synthetic diffs, 9.6 to 10.5 KB prompts):**

| Metric | Median | 90th percentile | Maximum |
|---|---|---|---|
| Bobcoins per review | 0.018 | 0.041 | 0.062 |
| Runner minutes per review | 3 | 3 | 4 |
| Seconds from trigger to comment (pipeline) | 14.5 | 19.0 | 40.8 |
| Seconds of Bob inference | 10.7 s | 14.6 s | 36.7 s |

**Accuracy caveats that must be stated:**

- **Bobcoins:** reported by Bob (`stats.session_costs` in the JSON output), unit unverified. The
  project could not reconcile the reviewer total (2.54 Bobcoins for 109 calls) against the
  account-level total because Bobalytics was not available for this subscription (S16) and the
  account total (95.58 Bobcoins on 2026-11-01) mixes local Bob use that is not separately
  recorded.
- **Runner minutes:** derived from job durations rounded up to one minute each, following the
  GitHub Actions billing rule ([Actions billing reference](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)). Not measured from a bill.
- **Cancelled reviews are an unrecorded cost.** 29 Bob calls inside reviews that were cancelled by
  a newer trigger for the same PR had no audit record. Their total cost, read from retained
  `result` artifacts, was 0.69 Bobcoins, representing about 22 per cent of the audit-record total.
  The cause is a two-firing pattern: when two required CI workflows both finish for the same commit,
  each fires the review workflow, the first `review` job is cancelled when the second begins, but
  Bob may already have been called. The audit-record total is therefore a lower bound.
- **These are sandbox figures.** The sandbox diffs are small and synthetic. Real PRs are larger and
  more varied; cost per review on production diffs will be different, and the prompt-to-Bobcoins
  correlation is too weak in this data to predict it from prompt size alone (Pearson r = 0.03).

**The `review` job spends most of its 47-second average on building the reviewer image (~25 s),
not on Bob inference (~11 s).** Moving to a pre-built and pinned image (the design intent) would
cut per-review wall-clock time substantially.

---

## 11. Operational Hardening

Phase 7 drilled five operational procedures. Results are in
[`docs/results/phase-7-drills.md`](results/phase-7-drills.md).

**Kill switch:** setting `BOB_REVIEW_ENABLED` to `false` stops all reviews without code changes.
Verified: new PRs were skipped, `prepare` exited immediately.

**Per-PR run cap:** the cap of 3 runs per PR is soft. Deleting the bot comment resets the counter
because the counter lives in the comment marker. This is accepted for an advisory tool; the runbook
states it.

**Key rotation:** the runbook procedure is verify-before-revoke. A new key was created and verified
(a PR review ran successfully) before the old key was revoked by the owner. The revoked-key case
exits with `bob_unavailable`.

**Rebuild from `SETUP.md`:** the sandbox environment was torn down completely (environment,
secrets, variables, reviewer files removed; only CI remained) and rebuilt from the setup document
alone, without undocumented steps.

**Artifact retention:** 693 artifacts totalling 12.05 MiB were found in the sandbox after all
phases. The `prompt` artifact (holding the redacted diff) is retained for one day; it is readable
by anyone with read access to the repository. This is by design (G15 redacts the content) but must
be stated in the runbook and the setup guide.

---

## 12. Caveats and Unverified Claims

The following items remain open at the end of Phase 7. Each is documented in the relevant result
file; none were silently smoothed over.

1. **Bobcoin unit unverified (S16).** The figures reported by Bob (`session_costs`) have not been
   reconciled against a per-key billing source. Bobalytics was not available for this subscription.
   The account total on 2026-11-01 (95.58 Bobcoins) mixes local use and cannot split the reviewer's
   contribution. The per-review Bobcoin figures are precise to what Bob reports but their absolute
   meaning is unconfirmed.

2. **Three review jobs showed `pull_request_target` deployment refs pointing to PR branch names**
   while the environment is limited to `main`. These jobs ran trusted code (the owner's own test
   runs) and no leak was observed, but why GitHub allowed them is unverified. One probe is needed
   before the documentation can state unconditionally that the Bob key is reachable from `main`
   only.

3. **Fork and outside-contributor live cases are owner-accepted deviations.** The 13-case
   end-to-end matrix in Phase 5 covered same-repo PRs only. Fork PRs, outside-contributor PRs with
   and without the `ai-review` label, and the S15 fork payload scenario were covered offline but
   not verified live against a real second GitHub account.

4. **Six cancelled `review` jobs lasted about 300 seconds with no recorded steps.** Possibly
   waiting for environment approval or a runner before being cancelled by a newer trigger. No Bob
   result exists and no Bobcoins are attributed to them, but the cause is unknown.

5. **First install in a different repository is not yet proven (S20).** The per-run build works and
   artifacts pass between the three jobs; the sandbox was rebuilt from `SETUP.md`. Cross-repo
   delivery was deferred to Phase 8.

6. **The `compute.runner_minutes` field in the cost record is null in all records.** Filling it
   would require an `actions: read` permission step in `publish`. Not resolved.

7. **Clean-case false-positive rate.** 4 of 4 clean eval cases produced at least one medium-or-higher
   false positive. This is a known prompt quality gap, not a security issue, but it affects the
   practical utility of the reviewer on security-adjacent clean code.

---

## 13. What an Organisation Needs to Adopt This

**Minimum requirements:**
- An IBM Bob subscription with API key access and support for non-interactive (`bob run`) mode.
- A GitHub repository (private or public) with GitHub Actions enabled.
- A GitHub environment (`bob-review`) scoped to the default branch for secret storage.
- Two repository variables: `BOB_REVIEW_ENABLED` and `BOB_REVIEW_REQUIRED_WORKFLOWS`.
- The Bob API key stored as the environment secret `BOB_API_KEY`.

**Operational requirements:**
- An owner for the Bob key with a rotation schedule and a runbook.
- A Bobcoin ceiling or budget alert on the Bob account (no per-key spending limit exists at the
  platform level; the account quota is the only ceiling).
- A decision on what counts as a required CI workflow. The system posts a review after all named
  required workflows pass on the exact head commit.
- Team rule files (`.bob-review/standards.md`, `.bob-review/project-rules.md`) on the base branch.
  These drive the rule-tagged findings. Without them the reviewer applies only Bob's built-in
  judgment.

**What to tune before deploying:**
- The author policy (`OWNER`/`MEMBER`/`COLLABORATOR` vs `ai-review` label). The default is
  conservative; a broader team may need to relax it.
- Size gates (max files, max diff bytes). The defaults are tuned for the sandbox; large monorepos
  may need larger limits or path-based skip rules.
- Confidence threshold for findings. The current default allows medium-confidence findings, which
  contributes to the false-positive rate. Raising it to high will reduce FPs and also reduce recall.

**Data residency:** source code and diffs leave GitHub-hosted runners and reach the Bob inference
service. The subscription region for this project is Global (S13). Organisations with strict data
residency requirements for source code must evaluate this before deploying, and must verify their
own subscription's data handling terms with IBM.

**Setup instructions:** [`docs/SETUP.md`](SETUP.md).
**Operational runbook:** [`docs/RUNBOOK.md`](RUNBOOK.md).
**Repository:** `paolob67/bob-pr-review-agent` (private sandbox; the reviewer source is in
`reviewer/` and `integrations/github-actions/`).

---

## 14. Where We Did Not Go

Several design choices were deliberately not made. They are worth naming because they will come up
when teams extend this.

**No hard merge gate.** The bot cannot block a merge, satisfy a branch protection rule, or post an
approving review. This was a deliberate choice: LLM output is non-deterministic, and making it a
hard gate would either block merges on transient failures or train developers to dismiss the bot.
The advisory model keeps the human in the decision path.

**No dollar cost conversion.** The cost record reports Bobcoins and runner minutes.
[ADR 0011](adr/0011-bobcoins-as-usage-unit.md) records why: converting Bobcoins to money requires
a rate from a documented source, and no such source was available for this subscription. The GitHub
runner rate ($0.006 per minute for a standard Linux 2-core runner, from the
[Actions runner pricing page](https://docs.github.com/en/billing/reference/actions-runner-pricing))
makes three minutes about $0.018 per review, but this project does not convert; the figure is cited
for orientation only.

**No daily or monthly budget cap in the system itself.** [ADR 0009](adr/0009-drop-daily-caps.md)
records why daily caps were dropped: the job is stateless, and maintaining a shared counter across
concurrent runners without a central store adds complexity for marginal benefit. The per-PR run cap
of 3 and the Bobcoin ceiling on the Bob account are the practical limits.

**No multi-repo delivery script.** The system installs into one repository. The reviewer source
is in `reviewer/` and can be installed into any repository that follows the setup guide, but there
is no automated installer that deploys it to a list of repositories. That is Phase 8's open item S20.

**No re-review on comment.** The system cannot be invoked by a PR comment such as `/re-review`.
It triggers on `workflow_run` (CI pass) or on the `ai-review` label applied by a maintainer. A
comment trigger would require `pull_request_comment` events with PR-code access and would
complicate the trust model.

---

## 15. Conclusion

The system works as designed. It runs IBM Bob Shell unattended in a hardened container after CI
passes, produces structured findings, posts one advisory comment per PR, records a cost figure, and
holds its guardrails against 16 live adversarial cases across 44 repetitions, plus 9 offline
sanitiser assertions.

The quality result is honest: 97 per cent recall on the tested flaw types is useful, but 2.5 false
positives per clean PR in security-adjacent areas is a real cost to reviewer attention. The
false-positive rate is a prompt quality problem, not a security problem, and it is addressable
without changing the architecture.

The cost is low: about 0.02 Bobcoins and 3 runner minutes per small PR, median 14.5 seconds from
trigger to comment. The caveat is that the Bobcoin unit is unreconciled against a billing source,
and the cost on large production diffs is not measured.

The security hardening is thorough but not total. The wrapper holds hard properties regardless of
model behaviour. The residual risks (data egress via the Bob service, write access and secret
exposure, the soft per-PR cap, and the unverified GitHub platform behaviour with `pull_request_target`)
are documented and stated rather than hidden.

For a team that wants a consistent first-pass opinion on every PR, that is willing to pay roughly
$0.018 per review in compute (unverified estimate) plus Bob subscription costs, and that has an
owner for the operational runbook, this approach is deployable. The work to get there is mostly in
the guardrails, not the review itself.

---

*All numbers in this document come from result files in [`docs/results/`](results/). Every claim
about Bob Shell or GitHub Actions behaviour links to an official documentation page or to a
recorded spike or drill result. Items that are unverified are labelled as such.*

*Source: [`docs/ARTICLE.md`](ARTICLE.md). Phase 8, 2026-11-01. Bob Shell 2.0.9.*
