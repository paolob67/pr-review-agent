# Phase 8: Documentation, article, final validation

## Goal

Finish the documentation set, write the article from recorded results, and validate the repository
end to end.

## Prerequisites

- Phase 7 gate met.
- Article brief (fixed by the owner): a LinkedIn article shared with the owner's network and
  clients. Short (target 900 to 1300 words, confirm with the owner), readable by a technical
  leader who is not a Bob or Code Engine expert.

## Inputs to read

Everything: [PLAN.md](../PLAN.md), [CONTRACTS.md](../CONTRACTS.md), [THREAT_MODEL.md](../THREAT_MODEL.md),
[ARCHITECTURE.md](../ARCHITECTURE.md), all ADRs, all files in `docs/results/`.

## Do

1. Finish `SETUP.md` (IBM Cloud, GitHub, secrets, first run), `TESTING.md` (every suite, how to
   run, what it costs), `RUNBOOK.md` (rotation, kill switch, incidents, cap changes, teardown,
   upgrading Bob Shell and the base image).
2. Update diagrams so they match the final system; export PNGs; check them visually.
3. Write `docs/ARTICLE.md` as the short LinkedIn article (the long material stays in the other
   docs and is linked from a closing "Go deeper" line). Structure:
   - Hook: the question, can an AI agent review pull requests safely, and was it worth it.
   - The shape of the solution in a few sentences, with one simple diagram (PNG, readable at
     LinkedIn width).
   - The technical problems that had to be solved (3 to 5, each a short paragraph): for example
     running a CLI agent unattended in a container, trigger only after CI is green, keeping the
     agent away from secrets, getting structured and bounded output, knowing what each review
     costs.
   - Security implications, in plain language: the main risks (untrusted PR content steering the
     agent, secret exposure, data leaving the organization, runaway cost) and the guardrails that
     answer each; what remains a residual risk.
   - Benefits, honestly stated: what the review caught in the tests, what it missed, cost per PR
     with stated accuracy, where the human stays in charge.
   - Caveats and what is unverified.
   - Closing: what an organization needs to do to adopt it, and a pointer to the repo.
   Tone: first person, plain, no hype, no em-dashes. Every number comes from a results file and
   every claim about Bob, IBM Cloud or GitHub links to an official doc page or a results file.
   Also provide a 3 to 4 line post teaser for sharing the article.
4. Update README: current status, quick start, Documentation section linking the index; keep the
   Documentation index complete.
5. Final validation, recorded in `docs/results/final-validation.md`:
   - `make test`, `make lint` pass from a clean checkout.
   - Link check over all Markdown files.
   - Grep for em-dashes, secrets patterns, "TODO", "unverified" items that should now be resolved.
   - Every guardrail G1 to G37 appears in a test or a documented drill; list any exceptions.
   - Every S1 to S16 has an answer or a stated "unresolved".
   - A fresh reader walk-through of SETUP.md on a clean machine description, noting gaps.

## Do not

- Do not add features or change behaviour; fix only documentation defects and real bugs found,
  with tests.
- Do not state numbers in the article that are not in a results file.

## Budget

No live calls except a last smoke run if code changed.

## Deliverables

Complete `docs/`, `docs/ARTICLE.md`, `docs/results/final-validation.md`, README, INDEX, STATUS.md
marked complete.

## Acceptance (gate)

- A reader can reproduce setup from the docs alone.
- All article claims link to a source or a result.
- Final validation passes with exceptions listed and accepted by the owner.

## Report back

Summary of what exists, where the article is, open items.
