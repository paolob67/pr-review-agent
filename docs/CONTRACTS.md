# Contracts

Shared interfaces between the workflow, the container, the reviewer modules and the tests.
Status: Frozen (Phase 1 design freeze, 2026-10-30). Covers GitHub-hosted runners
([ADR 0001](adr/0001-execution-environment.md),
[ADR 0012](adr/0012-secrets-and-credentials-on-github.md)). Change these contracts only through an
ADR and update every consumer and test in the same task.

Contents:

1. [Job inputs and configuration](#1-job-inputs-and-configuration)
2. [Secrets](#2-secrets)
3. [Reviewer file inputs from the base branch](#3-reviewer-file-inputs-from-the-base-branch)
4. [Bob output (findings) schema](#4-bob-output-findings-schema)
5. [Published comment format](#5-published-comment-format)
6. [Cost record](#6-cost-record)
7. [Audit log line](#7-audit-log-line)
8. [Job outcomes and exit codes](#8-job-outcomes-and-exit-codes)
9. [Scratch directory layout](#9-scratch-directory-layout)

## 1. Job inputs and configuration

The `prepare` job derives three values from the `workflow_run` payload and the API and passes them
to the reviewer as environment variables (never through a shell string, workflow expression in
`run:`, or command line). Nothing else from the PR is passed.

| Name | Format | Validation (G24) |
|---|---|---|
| `REVIEW_REPO` | `owner/name` | `^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$` |
| `REVIEW_PR_NUMBER` | positive integer | `^[1-9][0-9]{0,8}$` |
| `REVIEW_HEAD_SHA` | 40 lowercase hex | `^[0-9a-f]{40}$` |

Job-level configuration, set in the workflow `env:` or from repository variables (not by the PR):

| Name | Meaning | Default |
|---|---|---|
| `REVIEW_ENABLED` | Kill switch (G10). Anything other than `true` means exit quietly | `true` |
| `REVIEW_MAX_FILES` | Size gate (G8) | `50` |
| `REVIEW_MAX_DIFF_BYTES` | Size gate (G8) | `102400` (100 KiB) |
| `REVIEW_MAX_PROMPT_BYTES` | Size gate (G8) | `204800` (200 KiB) |
| `REVIEW_BOB_TIMEOUT_SECONDS` | Hard timeout for the Bob process (G13) | `180` |
| `REVIEW_MAX_RUNS_PER_PR` | Cap (G14) | `3` |
| `REVIEW_API_BASE` | GitHub API base URL, so tests can point at a mock | `https://api.github.com` |
| `REVIEW_BOB_BIN` | Path of the Bob executable, so tests can use `fake-bob` | `bob` |

The PR author can only influence the three inputs. The wrapper rejects any value that fails
validation and exits with outcome `rejected_input` before any API call.

## 2. Secrets

The reviewer code reads three environment variable names. Each exists in exactly one job (G2, G23,
G25). Source and scoping are in [ADR 0012](adr/0012-secrets-and-credentials-on-github.md).

| Env var in the process | Source on GitHub | Present in job | Held by |
|---|---|---|---|
| `BOB_API_KEY` | Environment secret `BOB_API_KEY` in environment `bob-review` (default branch only) | `review` | Bob process only (G2) |
| `SCM_READ_TOKEN` | The `prepare` job's `GITHUB_TOKEN` (`contents: read`, `pull-requests: read`, `actions: read`) | `prepare` | Prepare stage |
| `SCM_COMMENT_TOKEN` | The `publish` job's `GITHUB_TOKEN` (`pull-requests: write`, [ADR 0014](adr/0014-publish-token-pull-requests-write.md)), or environment secret `BOB_COMMENT_TOKEN` if a dedicated bot is used (S17) | `publish` | Publish stage |

Rules: a secret is referenced only in the `env:` of the one step that needs it; never in `run:`,
`if:`, `with:`, matrix, outputs or artifacts; set with `gh secret set NAME --env bob-review < file`
(never `--body`); one secret per value. The container for `review` receives `BOB_API_KEY` by name
(`-e BOB_API_KEY`), not by value on the command line.

GitHub repository variables (set in the repository that is reviewed; no secrets):

| Name | Kind | Purpose |
|---|---|---|
| `BOB_REVIEW_ENABLED` | variable | Kill switch (G10) |
| `BOB_REVIEW_REQUIRED_WORKFLOWS` | variable | Comma-separated names of the CI workflows that must be green (G31) |

Artifacts exchanged between jobs (data only; `publish` treats `result` as untrusted):

| Artifact | Produced by | Consumed by | Content |
|---|---|---|---|
| `prompt` | `prepare` | `review` | Redacted prompt text and a small JSON of validated identifiers and prepare-stage measurements |
| `result` | `review` | `publish` | Raw Bob stdout, exit code, timed-out flag, duration, Bob version, image digest |
| `audit` | `publish` | humans | Audit log lines and the cost record |

All artifacts have a short `retention-days` (G26).

## 3. Reviewer file inputs from the base branch

Read through the API at the PR's base branch, never from the PR head (G33). Each file is optional;
missing files are noted in the comment ("no team rules found, built-in checklist only").

| Path | Content | Size cap |
|---|---|---|
| `.bob-review/standards.md` | Coding standards, one rule per line or heading, each with a stable ID such as `STD-012` | 32 KiB |
| `.bob-review/project-rules.md` | Team rules (architecture, naming, forbidden APIs, test expectations), IDs such as `TEAM-004` | 32 KiB |
| `.bob-review/security.md` | Optional extra security focus areas | 16 KiB |
| `.bob-review/config.json` | Optional per-repo overrides, only for values the reviewer allows (ignored paths, severity caps). Unknown keys are ignored | 4 KiB |

## 4. Bob output (findings) schema

Bob is asked to answer with a single JSON object and nothing else. The wrapper extracts, parses and
validates it (G16, G36). Anything that fails validation is dropped or, if the whole object is
unusable, the run ends with outcome `bad_model_output` and posts the short "review unavailable"
note.

```json
{
  "schema_version": 1,
  "summary": "string, at most 600 characters, plain text",
  "findings": [
    {
      "category": "standards | team_rule | security | other",
      "severity": "critical | high | medium | low | info",
      "confidence": "high | medium | low",
      "rule_id": "string or null (required for standards and team_rule, must exist in the supplied rules)",
      "file": "path as it appears in the diff",
      "line": 123,
      "title": "string, at most 120 characters",
      "evidence": "string, at most 400 characters, quotes or describes the code",
      "explanation": "string, at most 800 characters",
      "proposed_fix": "string or null, at most 1500 characters, text or a diff"
    }
  ],
  "needs_human_attention": [
    { "title": "string", "reason": "string", "file": "string or null", "line": "integer or null" }
  ]
}
```

Wrapper rules after parsing:

- `file` and `line` must refer to a line that exists in the supplied diff; otherwise the finding is dropped and counted.
- `rule_id` for standards and team-rule findings must exist in the supplied rule files; otherwise dropped and counted.
- Findings with `confidence: low` move to `needs_human_attention` (threshold configurable).
- De-duplicate on (file, line, rule_id or title). Cap per category (default 5) and in total (default 15), keeping the highest severity first.
- All string fields pass the sanitiser (G17) before rendering.
- Unknown fields are ignored and logged as a count.

## 5. Published comment format

One comment per PR, identified by a hidden marker, updated in place (G18). The wrapper builds all
of it except the text inside findings.

```
<!-- bob-pr-review:v1 {"head":"<sha>","runs":1,"cost_total":{...}} -->
> **AI Assisted review (advisory).** Generated by IBM Bob. It does not approve or block this pull
> request. A human reviewer makes the final evaluation.

### Summary
<summary text>

### Findings
#### Security (n)
- **[HIGH] <title>** `path/file.ext:123` (confidence: high)
  <explanation>
  Evidence: <evidence>
  Suggested fix (not applied):
  ```diff
  ...
  ```
#### Standards (n)  /  #### Team rules (n)  /  #### Other (n)
- **[MEDIUM] <title>** `path:line` Rule `STD-012`
  ...

### Needs human attention
- <title>: <reason>

---
Reviewed commit `<short sha>` | Bob Shell <version> | run <run id> | rules: standards <yes/no>, team <yes/no>
Cost this run: <value and unit> (<reported|estimated>), PR total: <value> over <n> runs. AI Assisted, advisory only.
```

Rules: the first line (marker) and the header and footer are wrapper-generated; the sanitiser
strips any look-alike marker, header or approval wording from model text (G35). When there are no
findings the comment says so explicitly and still carries header and footer. When the review is
unavailable the comment is a short note with the same header and footer and the outcome code.

## 6. Cost record

One JSON object per run, built by the wrapper (G37).

```json
{
  "schema_version": 1,
  "repo": "owner/name", "pr": 42, "head_sha": "<sha>", "run_id": "<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>",
  "bob_shell_version": "2.0.9", "image_digest": "sha256:...",
  "inputs": { "files": 7, "diff_bytes": 18234, "prompt_bytes": 61234 },
  "output": { "bytes": 5120, "findings_kept": 6, "findings_dropped": 2 },
  "bob_usage": { "source": "reported", "unit": "bobcoins", "input": null, "output": null, "total": 0.118 },
  "duration_seconds": { "total": 24.2, "bob": 18.4 },
  "compute": { "runner": "ubuntu-24.04", "runner_minutes": null },
  "outcome": "reviewed"
}
```

Bob usage is measured in Bobcoins, never converted to currency ([ADR 0011](adr/0011-bobcoins-as-usage-unit.md)).
`bob_usage.total` is `stats.session_costs` from Bob Shell v2 output, recorded with
`source = "reported"` and `unit = "bobcoins"`. Bob's documentation does not state the unit of
`session_costs`; treating it as Bobcoins is unverified until reconciled with the Bobcoin balance
(Phase 3 results). Runner compute is recorded as time, not currency ([ADR 0001](adr/0001-execution-environment.md)):
`compute.runner` is the pinned runner label and `compute.runner_minutes` is the sum of job
durations rounded up per job, `null` while the jobs are still running (the pipeline seconds in
`duration_seconds` are always set). The hidden marker keeps cumulative totals only (runs, summed
`bob_usage.total` as `cost_total.bobcoins`, summed seconds).

## 7. Audit log line

One JSON line on stdout per stage event and one summary line at the end. No PR content, no secrets.

```json
{"ts":"...","level":"info","event":"run_summary","repo":"owner/name","pr":42,"head_sha":"...","outcome":"reviewed","cost":{...cost record...}}
```

Events: `run_start`, `input_rejected`, `gate_skipped` (with `reason`), `prepare_done`,
`bob_started`, `bob_finished`, `publish_done`, `run_summary`. A log scrubber removes values that
match the configured secret patterns and the live secret values (G27). The `publish` job also
writes the lines to the job summary and the `audit` artifact (G20).

## 8. Job outcomes and exit codes

The reviewer always exits 0 after an expected outcome so the workflow does not show a failed run
for noise; nonzero is reserved for crashes of the wrapper itself. No retry is configured. A failed
step in `prepare` or `review` stops the dependent jobs; the workflow is never a required check.

| Outcome | Meaning | Comment posted |
|---|---|---|
| `reviewed` | Normal review published | Yes |
| `skipped_disabled` | Kill switch off | No |
| `skipped_stale` | Head moved or PR closed (G32) | No |
| `skipped_gate` | Draft, bot, size, path, budget or author policy (G7 to G9, G14) | Only for size or budget, as a short note |
| `rejected_input` | Input validation failed (G24) | No |
| `bob_unavailable` | Auth, quota, network or timeout failure | Short "review unavailable" note |
| `bad_model_output` | Output not usable after validation | Short "review unavailable" note |
| `publish_failed` | Could not post the comment | No (logged) |

## 9. Scratch directory layout

Created fresh per run by the wrapper, owned by the Bob user, marked untrusted (G28, G29). Contains
only data from trusted code ([ADR 0010](adr/0010-scratch-layout-stdin.md)):

```
scratch/
  .bob/
    custom_modes.yaml  wrapper-generated reviewer mode definition (G28, S3)
```

The task instructions, output contract, base-branch rules, redacted diff and PR metadata (data
only) are sent on stdin inside untrusted-data delimiters. Full changed files at the head SHA are
not sent in Phase 2.

No PR-supplied `.bob/`, `AGENTS.md`, `.env`, `.bobignore` or custom command files may exist
anywhere under `scratch/`; the wrapper drops any changed file whose path would create one and
notes it as "not shown to the reviewer".
