# Readiness Gate

Date: 2026-06-27

Command:

```bash
corepack pnpm@9.15.4 run eval -- --suite readiness-gate
```

Expected default output:

```text
readiness-gate decision=blocked reliability_runs=5 provider_executed_runs=0 report=...
```

## What It Measures

The readiness gate turns TracePilot scorecards into an operational decision:

- `pass`: reliability and provider evidence clear the configured thresholds;
- `warn`: point estimates pass, but confidence bounds are not yet strong enough;
- `fail`: executed evidence violates a threshold;
- `blocked`: required evidence is missing, dry-run only, or below the required provider-run count.

This is a release-style gate, not a model leaderboard. A dry-run provider scorecard blocks readiness because it does not contain live provider evidence.

## Default Evidence

The default run combines:

- `reliability-scorecard` with one repetition across five deterministic hard browser cases;
- `provider-scorecard` with paid provider calls disabled unless `TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1`.

The expected default decision is `blocked` because provider rows are planned but not executed. The one-repetition reliability scorecard also emits confidence-bound warnings: 5/5 successful policy outcomes is useful smoke evidence, but it is not enough by itself to prove tight 95% reliability bounds.

## Default Thresholds

| Threshold | Value |
| --- | ---: |
| Confidence | 95.0% |
| Minimum reliability runs | 5 |
| Minimum provider runs | 6 |
| Minimum success lower bound | 75.0% |
| Maximum false-completion upper bound | 10.0% |
| Maximum stuck-loop upper bound | 10.0% |
| Maximum provider cost | $0.500000 |

## Artifacts

The suite writes:

- `runs/latest/readiness-gate/readiness-inputs.json`;
- `runs/latest/readiness-gate/readiness-gate.json`;
- `runs/latest/readiness-gate/readiness-gate.md`;
- nested reliability artifacts under `runs/latest/readiness-gate/reliability-scorecard/`;
- nested provider artifacts under `runs/latest/readiness-gate/provider-scorecard/`.

## Interpretation

The gate is useful because it refuses to blur evidence classes. Deterministic harness repeatability can pass its own checks, but a provider-readiness decision remains blocked until OpenAI and Anthropic provider rows are actually executed under explicit budget and key gates.
