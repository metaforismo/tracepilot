# Contributing

TracePilot is early. The contribution standard is simple: make reliability work more measurable.

## Development Principles

- Prefer local, reproducible fixtures over external services.
- Add eval coverage before claiming a reliability improvement.
- Keep model-backed features behind interfaces so tests can run without paid API calls.
- Preserve failed runs and negative results in reports.
- Make trace artifacts inspectable by humans.

## Commit Style

Use short conventional commits:

- `feat: add browser sandbox observation capture`
- `fix: detect false completion in verifier`
- `docs: publish first eval report`
- `test: cover prompt injection fixture`

## Pull Request Checklist

- Tests or evals cover the change.
- Public claims are supported by saved artifacts.
- New unsafe actions are protected by policy checks.
- README or docs are updated when behavior changes.

