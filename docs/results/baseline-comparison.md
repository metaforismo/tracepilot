# Baseline vs TracePilot Comparison

Date: 2026-06-26

This report covers the first deterministic comparison between a naive computer-use loop and the TracePilot harness. It is a local eval result, not a claim about frontier model quality.

## Command

```bash
corepack pnpm@9.15.4 run eval -- --suite comparison
```

Observed output:

```text
comparison success_delta=83.3% false_completion_delta=-50.0% report=.../runs/latest/comparison/comparison-report.md diagnosis=.../runs/latest/comparison/failure-diagnosis.md
```

## Result

| Mode | Runs | Successes | Success rate | False completion rate | Stuck-loop rate | Unsafe blocks | Human approvals | Median success steps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 6 | 1 | 16.7% | 50.0% | 16.7% | 0 | 0 | 11 |
| TracePilot | 6 | 6 | 100.0% | 0.0% | 0.0% | 1 | 1 | 11 |

## TracePilot Minus Baseline

| Metric | Delta |
| --- | ---: |
| Success rate | +83.3% |
| False completion rate | -50.0% |
| Stuck-loop rate | -16.7% |
| Prompt-injection block rate | +16.7% |
| Human-approval rate | +16.7% |
| Median success steps | 0 |

## What The Suite Tests

- **Happy path:** both systems can complete the simple invoice portal case.
- **False completion:** the baseline can claim success before the portal receipt exists; TracePilot requires verifier evidence.
- **Validation recovery:** the baseline stops after a missing-field validation error; TracePilot reads the error, fills the missing date, and resubmits.
- **Modal interruption:** the baseline gets blocked by a portal update notice; TracePilot dismisses the notice before filling the form.
- **Approval gate:** the baseline finalizes a high-value invoice incorrectly; TracePilot stops for human approval.
- **Prompt injection:** the baseline has no untrusted-content guard; TracePilot blocks the unsafe instruction before action execution.

## Why This Matters

For Anthropic Computer Use, this demonstrates the product engineering layer around a computer-use model: sandboxing, action execution, guardrails, traces, and readouts.

For OpenAI Agent Post-Training, this demonstrates the research and systems loop around computer-use behavior: environments, grader-like success criteria, diagnostics, reproducible evals, and hypotheses that can become training data or product fixes.

The companion [Failure Diagnosis Casebook](failure-diagnosis.md) turns these eval outcomes into specific failure classes, model-behavior hypotheses, and intervention owners.

## Limits

- The baseline is deterministic and intentionally weak; it is a control loop for harness evaluation, not a model benchmark.
- The TracePilot mode uses deterministic scripted decisions in this report; real model-driver results must be reported separately.
- Costs are zero in this run because no paid model calls were made. Fixture cost estimates are tracked separately in [Model Cost Ledger](model-cost-ledger.md).
