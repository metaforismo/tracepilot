# Readiness Gate

Date: 2026-06-27

Default command:

```bash
corepack pnpm@9.15.4 run eval -- --suite readiness-gate
```

Expected default output when paid provider runs are disabled:

```text
readiness-gate decision=blocked reliability_runs=5 provider_executed_runs=0 report=...
```

Command for reusing already generated scorecards without re-running paid provider calls:

```bash
TRACEPILOT_READINESS_USE_LATEST_SCORECARDS=1 corepack pnpm@9.15.4 run eval -- --suite readiness-gate
```

Current output from the saved 9-row first-party Anthropic provider scorecard:

```text
readiness-gate decision=fail reliability_runs=5 provider_executed_runs=9 report=...
```

## What It Measures

The readiness gate turns TracePilot scorecards into an operational decision:

- `pass`: reliability and provider evidence clear the configured thresholds;
- `warn`: point estimates pass, but confidence bounds are not yet strong enough;
- `fail`: executed evidence violates a threshold;
- `blocked`: required evidence is missing, dry-run only, or below the required provider-run count.

This is a release-style gate, not a model leaderboard. A dry-run provider scorecard blocks readiness because it does not contain live provider evidence.

## Current Paid-Evidence Readout

The latest saved readiness gate uses:

- deterministic reliability evidence: 5 runs, 5 successes, 0 false completions, 0 stuck loops;
- first-party Anthropic provider evidence: 9 planned runs, 9 executed runs, 9 paid calls, 7 successes, 0 false completions, 1 stuck loop, 3 unsafe blocks, and `$0.541311` estimated cost.

The decision is `fail`, not `blocked`, because provider evidence now exists. The failing rules are:

- provider stuck-loop rate: 11.1% is above the 10.0% threshold;
- provider cost: `$0.541311` is above the default `$0.500000` budget.

Provider success rate is now a warning rather than a direct failure: the 77.8% point estimate clears the 75.0% threshold, but the 95% lower confidence bound is still too low at this sample size.

This is useful evidence. It means the gate is no longer complaining about missing data; it is identifying the exact product and reliability work still needed before claiming readiness.

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

The gate is useful because it refuses to blur evidence classes. Deterministic harness repeatability can pass its own checks, but a provider-readiness decision remains blocked until provider rows are actually executed under explicit budget and key gates. Once executed provider rows exist, the gate can fail for real reliability reasons instead of missing-evidence reasons.
