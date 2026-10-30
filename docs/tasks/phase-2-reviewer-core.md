# Phase 2: Reviewer core with offline tests

## Goal

Implement the reviewer pipeline (prepare, review, publish) and every offline-testable guardrail,
with a `fake-bob` stand-in, so the whole thing runs and is tested without Bob, IBM Cloud or GitHub.

## Prerequisites

- Phase 1 gate met; CONTRACTS.md frozen.
- Node.js 22.15 or later available locally (v26.3.1 was present).

## Inputs to read

[CONTRACTS.md](../CONTRACTS.md), [ARCHITECTURE.md](../ARCHITECTURE.md), the ADRs,
[PLAN.md](../PLAN.md) sections 3, 4 and 9, and `docs/results/spikes.md` for Bob behaviour that
`fake-bob` must imitate (output shape, exit codes, errors).

## Do

1. Create the layout from PLAN section 7 for `reviewer/`, `tests/`, `Makefile` and, as needed,
   `scripts/validation/`. Create `.gitignore` (node_modules, `.env*`, logs, `scripts/spikes/work/`,
   `docs/results/raw/`); the planning task could not create it because of a workspace ignore rule.
   Initialise git if the owner agrees.
2. Modules under `reviewer/src/`, one responsibility each: `config`, `input` (validation, G24),
   `github` (API client with the base URL from `REVIEW_API_BASE`, only the endpoints needed, G34),
   `gate` (G7 to G9, G14, G31 helpers, G32), `rules` (base-branch loading, G33), `redact` (G15),
   `prompt`, `scratch` (layout and forbidden paths, G28), `runBob` (scrubbed env G3, timeout G13,
   mockable binary), `parseOutput` and `validate` (G16, G36), `triage` (G36), `sanitise` (G17,
   G35), `render` (CONTRACTS section 5), `cost` (G37), `audit` (G20, G27), `publish` (G18, G34),
   `main` (stages, outcomes from CONTRACTS section 8).
3. `fake-bob`: an executable in `tests/fixtures/` that reads its prompt and replies according to a
   scenario file: valid, malformed JSON, extra text around JSON, huge, hanging, exits nonzero,
   hallucinated file and line, unknown rule IDs, duplicates, flood, fake approval text, fake
   header and marker, markdown images and HTML, @mentions, bidi characters, tries to print its
   environment (a canary variable must not appear), and a usage line if S7 showed one.
4. Mock GitHub API server in `tests/fixtures/` (local HTTP) that serves PRs, diffs, files and
   comments, and fails the test on any endpoint other than the allowed comment create and update
   and the read endpoints.
5. Tests, written together with the code, so that each guardrail from PLAN.md that is offline
   testable (G2, G3, G8, G9, G13 to G20, G24, G27, G28, G31 to G37 at gate level) has at least one
   test, and each test name carries the guardrail ID. Pipeline tests run `main` end to end against
   fake-bob and the mock API for every outcome in CONTRACTS section 8.
6. Mutation check: a script in `scripts/validation/` that disables each guardrail (by a documented
   switch or a patch applied to a temp copy) and confirms the matching tests fail. Record the
   result table in `docs/results/mutation-check.md`.
7. `make test` (offline, under one minute), `make lint` (eslint or equivalent with minimal
   dependencies; actionlint and shellcheck only if installed, otherwise noted).
8. `docs/TESTING.md` first version: how to run the offline suites and read results.

## Do not

- Do not call real Bob, GitHub or IBM Cloud. Tests must pass with no network.
- Do not add runtime dependencies without a written reason in the module header and the PR notes;
  prefer the Node standard library.
- Do not make the wrapper depend on how the comment looks to a human beyond CONTRACTS section 5.

## Budget

No live calls.

## Deliverables

`reviewer/`, `tests/`, `Makefile`, `scripts/validation/`, `docs/results/mutation-check.md`,
`docs/TESTING.md`, updated STATUS.md and INDEX.md.

## Acceptance (gate)

- `make test` and `make lint` pass offline, with the exact output pasted into the results file.
- Every offline guardrail has a named test; mutation check shows each test fails when its
  guardrail is disabled.
- A canary secret placed in every credential variable never appears in logs, scratch files,
  rendered comments or the fake-bob environment.
- The mock API proves the publisher only calls comment create and update.

## Report back

Test counts, guardrails covered and not covered (with reason), open design questions found.
