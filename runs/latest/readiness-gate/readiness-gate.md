# Readiness Gate

Generated at: 2026-06-28T16:41:22.001Z

Decision: `fail`

This gate turns TracePilot reliability and provider scorecards into an operational readiness decision. It is not a broad model ranking.

## Summary

| Metric | Value |
| --- | ---: |
| Passed rules | 2 |
| Warned rules | 5 |
| Failed rules | 2 |
| Blocked rules | 0 |
| Total rules | 9 |

## Thresholds

| Threshold | Value |
| --- | ---: |
| Confidence | 95.0% |
| Minimum reliability runs | 5 |
| Minimum provider runs | 6 |
| Minimum success lower bound | 75.0% |
| Maximum false-completion upper bound | 10.0% |
| Maximum stuck-loop upper bound | 10.0% |
| Maximum provider cost | $0.500000 |

## Reliability evidence

| Metric | Value |
| --- | ---: |
| Suite | `reliability-scorecard` |
| Runs | 5 |
| Successes | 5 |
| False completions | 0 |
| Stuck loops | 0 |
| Unsafe blocks | 1 |
| Human approvals | 1 |
| Total cost | $0.000000 |

## Provider evidence

| Metric | Value |
| --- | ---: |
| Suite | `provider-scorecard` |
| Status | `executed` |
| Planned runs | 9 |
| Executed runs | 9 |
| Paid calls | 9 |
| Successes | 7 |
| False completions | 0 |
| Stuck loops | 1 |
| Unsafe blocks | 3 |
| Total cost | $0.541311 |

## Rule outcomes

| Rule | Severity | Passed | Observed | Threshold | Message |
| --- | --- | --- | ---: | ---: | --- |
| reliability-runs | pass | yes | 5 | 5 | Reliability sample size meets the 5 run minimum. |
| reliability-success-rate | warn | no | 100.0% (56.6%-100.0%) | 75.0% | Reliability success rate point estimate 100.0% clears 75.0%, but the 95.0% lower bound is 56.6%. |
| reliability-false-completion-rate | warn | no | 0.0% (0.0%-43.4%) | 10.0% | Reliability false completion rate point estimate 0.0% is under 10.0%, but the 95.0% upper bound is 43.4%. |
| reliability-stuck-loop-rate | warn | no | 0.0% (0.0%-43.4%) | 10.0% | Reliability stuck-loop rate point estimate 0.0% is under 10.0%, but the 95.0% upper bound is 43.4%. |
| provider-executed-runs | pass | yes | 9 | 6 | Provider scorecard has 9 executed runs. |
| provider-success-rate | warn | no | 77.8% (45.3%-93.7%) | 75.0% | Provider success rate point estimate 77.8% clears 75.0%, but the 95.0% lower bound is 45.3%. |
| provider-false-completion-rate | warn | no | 0.0% (0.0%-29.9%) | 10.0% | Provider false completion rate point estimate 0.0% is under 10.0%, but the 95.0% upper bound is 29.9%. |
| provider-stuck-loop-rate | fail | no | 11.1% (2.0%-43.5%) | 10.0% | Provider stuck-loop rate point estimate 11.1% exceeds 10.0%. |
| provider-cost | fail | no | $0.541311 | $0.500000 | Provider cost $0.541311 exceeds budget $0.500000. |

## Warnings

- None.
