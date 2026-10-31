# Task briefs

One self-contained brief per phase of [PLAN.md](../PLAN.md#8-phased-work-plan). Each brief can be
given to a fresh agent session as the whole task. Read [AGENTS.md](../../AGENTS.md) first.

| Phase | Brief | Needs from the owner | Live services |
|---|---|---|---|
| 0 | [phase-0-spikes.md](phase-0-spikes.md) | Nothing new | Local Bob only, about 30 short calls |
| 1 | [phase-1-design-freeze.md](phase-1-design-freeze.md) | Sign-off | None |
| 2 | [phase-2-reviewer-core.md](phase-2-reviewer-core.md) | Nothing | None |
| 3 | [phase-3-real-bob.md](phase-3-real-bob.md) | Bob Inference API key, budget, sample rules | Local Bob, about 60 calls |
| 4 | [phase-4-runner-foundation.md](phase-4-runner-foundation.md) | Part A nothing; Part B GitHub plan, sandbox repo, Bob key entered by the owner | Part A local podman; Part B GitHub, Bob, a few runs |
| 5 | [phase-5-github-trigger.md](phase-5-github-trigger.md) | Sandbox repo, second account, bot account | GitHub, Bob |
| 6 | [phase-6-redteam-evals.md](phase-6-redteam-evals.md) | Run budget | Bob, GitHub |
| 7 | [phase-7-hardening.md](phase-7-hardening.md) | Optional Bobalytics look | GitHub, Bob |
| 8 | [phase-8-docs-article.md](phase-8-docs-article.md) | Confirm LinkedIn article length | None |

## Brief structure

Every brief has the same sections: Goal, Prerequisites, Inputs to read, Do, Do not, Budget,
Deliverables, Acceptance (the gate), Report back. A task is finished only when every Acceptance
item is true and [STATUS.md](../STATUS.md) is updated.

## Rules shared by all briefs

- Stop and ask the owner when a prerequisite is missing; never invent credentials or accounts.
- Anything learned about Bob or GitHub goes into `docs/results/` with the date and
  versions, and the affected plan section is corrected if the result contradicts it.
- Do not run Bob with the repository root as its working directory: the repo's `AGENTS.md` would
  be loaded as instructions. Always use a temporary directory outside the repo for probes.
- Add every new document to [INDEX.md](../INDEX.md).
