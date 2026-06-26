# Model Cost Ledger

Date: 2026-06-26

This report documents TracePilot's first model-run cost accounting layer. It is a fixture-based accounting run, not a paid model-driver result.

## Command

```bash
corepack pnpm@9.15.4 run eval -- --suite cost-ledger
```

Observed output:

```text
cost-ledger model_runs=1 scripted_controls=1 total_cost_usd=0.30975 source=model_fixture ledger=... report=...
```

## What It Proves

- Model runs cannot be reported without provider, model, token usage, pricing, and source metadata.
- Scripted controls are recorded separately from model runs.
- Fixture and dry-run costs produce an explicit warning so they are not confused with paid API calls.
- The suite writes both machine-readable JSON and a human-readable Markdown readout.

## Current Ledger

| Run | Driver | Source | Provider | Model | Computed cost |
| --- | --- | --- | --- | --- | ---: |
| Scripted control | scripted | scripted_control | n/a | n/a | $0.000000 |
| Model fixture | model | model_fixture | anthropic | claude-sonnet-4-20250514 | $0.309750 |

## Token Assumptions

| Field | Value |
| --- | ---: |
| Input tokens | 50,000 |
| Output tokens | 10,000 |
| Cache-read input tokens | 20,000 |
| Cache-creation input tokens | 1,000 |
| Input price | $3.00 / 1M tokens |
| Output price | $15.00 / 1M tokens |
| Cache-read input price | $0.30 / 1M tokens |
| Cache-creation input price | $3.75 / 1M tokens |
| Total estimated model cost | $0.309750 |

## Reporting Boundary

No paid model call was made.

This is intentionally a fixture/dry-run estimate. Real `model_api` results must be run, logged, and reported separately with exact provider, model, usage, pricing, cost, and task outcome metadata.

Use [Model Run Readiness](model-readiness.md) to verify the env gate before attempting a paid run.
