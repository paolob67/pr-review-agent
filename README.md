# PR Review Agent with IBM Bob Shell

Reference implementation and write-up for running IBM Bob Shell as an advisory pull request
reviewer on IBM Cloud Code Engine (Frankfurt, `eu-de`), triggered from GitHub Actions after the
team's CI has passed. Comments are marked "AI Assisted"; a human makes the final decision.

Status: Phase 3 complete (reviewer core runs against the real Bob locally). See [docs/STATUS.md](docs/STATUS.md).

Run the offline test suite:

```bash
make test    # 161 tests, 0 failures (unit + pipeline, no network)
make lint    # static checks
```

![Architecture overview](docs/diagrams/architecture-overview.png)

Editable source: [`docs/diagrams/architecture-overview.drawio`](docs/diagrams/architecture-overview.drawio).

## Working on this repository

Start with [AGENTS.md](AGENTS.md), then the current phase brief listed in
[docs/tasks/README.md](docs/tasks/README.md).

## Documentation

- [Documentation index](docs/INDEX.md)
- [Project status](docs/STATUS.md)
- [Project plan](docs/PLAN.md)
- [Contracts](docs/CONTRACTS.md)
- [Testing guide](docs/TESTING.md)
- [Task briefs per phase](docs/tasks/README.md)
- [ADR 0001: execution environment](docs/adr/0001-execution-environment.md)
