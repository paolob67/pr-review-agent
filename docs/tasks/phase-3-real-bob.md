# Phase 3: Real Bob integration (local)

## Goal

Replace `fake-bob` with the real `bob` locally, make the reviewer mode, prompt and output contract
work on real model output, and record cost and latency per run.

## Prerequisites

- Phase 2 gate met.
- From the owner: a Bob Inference-scope API key in the environment variable `BOBSHELL_API_KEY` (not
  in any file), an agreed Bobcoin budget, starter coding standards and team rules (or permission to
  use invented ones), and written confirmation that the sandbox or synthetic code used here may be
  sent to Bob.

## Inputs to read

[CONTRACTS.md](../CONTRACTS.md), `docs/results/spikes.md` (flags, mode delivery, usage reporting),
[PLAN.md](../PLAN.md) section 3 ("What the review does") and G4, G16, G28 to G30, G36, G37.

## Do

1. Reviewer mode file under `reviewer/modes/` implementing the persona, the read-only posture and
   the JSON-only output rule, delivered the way S3 and S14 found workable.
2. Prompt templates in `reviewer/prompts/` with explicit untrusted-data delimiters, the task list
   (standards, team rules, security, triage, remediation as text), the schema from CONTRACTS
   section 4 and instructions to cite rule IDs and real lines only.
3. Wire `runBob` to the real binary with the exact flags decided in Phase 0, scrubbed
   environment, untrusted scratch directory and timeout. Keep `fake-bob` working for offline tests.
4. Sample rule files in `examples/sandbox-repo/.bob-review/` (`standards.md`, `project-rules.md`,
   `security.md`) with stable IDs, from the owner's material or invented and labelled as such.
5. A local driver in `scripts/dev/` that runs the pipeline on a diff fixture without GitHub
   (reading the diff and files from a local directory instead of the API) and prints the rendered
   comment and cost record.
6. Create ten varied diff fixtures in `tests/fixtures/diffs/` (clean change, standards violation,
   team-rule violation, SQL injection, hard-coded secret, path traversal, large refactor, docs
   only, generated file, mixed) and run each through the real Bob. Iterate prompt and schema until
   output validates; record failures honestly.
7. Record per run: duration, input and output sizes, usage as reported or estimated (S7), findings
   kept and dropped. Summarise in `docs/results/phase-3-runs.md`, including cost per run and the
   accuracy of the estimator if one is used.
8. Check that the real Bob respects the scratch-directory controls: put a hostile `.bob/settings.json`,
   `AGENTS.md` and `.env` next to (not inside) the scratch directory and inside the fixture
   content, and show nothing takes effect (G28 to G30). Record it.

## Do not

- Do not put the API key in any file, command line, log or doc.
- Do not use real or proprietary code.
- Do not run Bob with the repo root as working directory.
- Do not exceed the budget.

## Budget

At most 60 Bob calls (ten fixtures, several iterations each). Agree the Bobcoin ceiling with the
owner before starting and stop at 80 percent of it.

## Deliverables

Reviewer mode, prompts, driver script, fixtures, sample rules, `docs/results/phase-3-runs.md`,
updated CONTRACTS.md if the output shape had to change (through an ADR), STATUS.md, INDEX.md.

## Acceptance (gate)

- Ten fixtures reviewed with schema-valid output after at most one automatic retry rule (if the
  design allows retries; otherwise first time) and rule IDs cited correctly.
- A recorded cost record per run with `bob_usage.source` set truthfully.
- The hostile-config check passes, with evidence.
- `make test` still passes offline.

## Report back

Pass rate per fixture, typical latency and cost, prompt changes that mattered, remaining weaknesses.
