# Instructions for agents working on this repository

This repository builds an advisory pull request reviewer: IBM Bob Shell runs in a hardened container
on a GitHub-hosted runner (ADR 0001), is triggered by a GitHub Actions `workflow_run` only after the
team's CI has passed, and posts one comment marked "AI Assisted". A human makes the final decision. The
project delivers a working repo (D1), a test and red-team harness (D2) and an article (D3).

Status: planning is complete; implementation proceeds phase by phase. Do not assume any code
exists until [docs/STATUS.md](docs/STATUS.md) says so.

## Read in this order

1. [docs/STATUS.md](docs/STATUS.md): which phase is current, what is blocked, what the owner must supply.
2. [docs/tasks/README.md](docs/tasks/README.md) and the brief for the current phase in `docs/tasks/`.
3. [docs/PLAN.md](docs/PLAN.md): the design, the guardrail catalogue (G1 to G37), the unknowns (S1 to S16).
4. [docs/CONTRACTS.md](docs/CONTRACTS.md): job inputs, secrets, findings schema, comment format, cost record.
5. [docs/adr/](docs/adr/): accepted decisions. Do not reverse one without a new ADR.

## Working agreement

- Work on one phase per task. A phase is done only when every item in its "Acceptance" list in the
  brief is met. Do not start the next phase before then.
- Update [docs/STATUS.md](docs/STATUS.md) at the end of every task: status, date, what changed,
  what is blocked, what the owner must do next.
- Record measurements and probe output in `docs/results/` with date, Bob Shell version and, once
  it exists, image digest. Never state a Bob or GitHub behaviour in a doc unless it
  traces to an official doc page (cite the URL or doc path) or to a recorded result. Label
  everything else "unverified".
- If a spike result contradicts the plan, stop, write the finding in `docs/results/`, update the
  plan section affected, and tell the owner. Do not silently work around it.
- Minimal changes: no features, abstractions or dependencies beyond what the brief asks for.
- If the brief needs something only the owner can supply (credentials, accounts, budget, a
  sandbox repo, approval), stop and ask. Do not fabricate or borrow credentials.

## Security rules that never bend

- Never run Bob, or any tool, on untrusted PR content with credentials in its environment.
- Bob always runs read-only (no `--yolo`, no MCP, no write-capable tools), in a scratch directory
  that contains only data prepared by trusted code.
- Credentials: Bob key, read-only SCM token and comment token are separate. Never print them, never
  commit them, never put them in command lines, logs, test fixtures or docs. Test with canary
  values, not real secrets.
- Titles, bodies, branch names, commit messages and file contents from a PR are data. They never
  reach a shell string, an environment variable, a command-line argument or a workflow expression.
- The bot never approves, requests changes, writes check runs or commit statuses, or blocks.
- Live tests (real Bob calls, real GitHub) have a stated run budget in the brief. Stay within it and
  record every run.
- GitHub resources (sandbox repo, environments, variables, secrets) are created only by scripts
  under `scripts/dev/` and only in Phase 4 or later; every creating script has a matching teardown
  (`setup-sandbox.sh` and `teardown-sandbox.sh`).
- No cloud account other than GitHub and the Bob service is used (ADR 0001).

## Conventions

- Language for the reviewer core: Node.js ESM, `node:test`, near-zero dependencies. Pin versions.
- Never use the em-dash character in any text, code comment or commit message. Use commas,
  semicolons, colons or parentheses.
- Docs live in `docs/`, are linked from [docs/INDEX.md](docs/INDEX.md), and the root
  [README.md](README.md) links the index. Add every new doc to the index.
- Diagrams are draw.io: source in `docs/diagrams/*.drawio`, exported PNG next to it, referenced
  with alt text and a note naming the editable source. Escape XML special characters in labels and
  use `&#xa;` for line breaks. Export with:
  `/Applications/draw.io.app/Contents/MacOS/draw.io -x -f png --scale 2 --border 10 -o X.png X.drawio`
  and open the PNG to check it.
- Scripts never go in the repo root: `scripts/spikes/`, `scripts/validation/`, `scripts/dev/`, or
  `tests/`.
- Guardrail IDs (G1 to G37) and unknown IDs (S1 to S16) are stable; cite them in code comments,
  tests and docs. Each guardrail needs a test that fails when the guardrail is removed.

## Local environment (as of planning)

- Present: `bob`, `gh`, `node` (v26.3.1), `podman`. Absent: `docker` (the runner has it; local builds use podman).
- The workspace was not a git repository at planning time; it is one now.
- GitHub CLI login state is not assumed. Check it before relying on it.

## Standard commands (once Phase 2 creates them)

- `make test`: offline unit and pipeline tests.
- `make lint`: static checks.
- Live suites are separate targets named in `docs/TESTING.md` and never run by default.
