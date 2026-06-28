# Enterprise Evidence Pack

Generated at: 2026-06-28T16:41:22.643Z

Pack ID: `tracepilot-enterprise-evidence-pack`

Purpose: `enterprise_review`

This pack is a redacted, tamper-evident evidence bundle for TracePilot reliability review. It is not a model leaderboard or a broad benchmark claim.

## Integrity

| Field | Value |
| --- | --- |
| Hash algorithm | sha256 |
| Manifest SHA-256 | `636b9ad8c8178582053434bba58f36f489dfe7371d985768b018e5f30979c3e6` |
| Hash boundary | Redacted artifact content only |
| Manifest content policy | Artifact contents are excluded |

## Summary

| Metric | Value |
| --- | ---: |
| Total artifacts | 14 |
| Required artifacts | 14 |
| Redacted artifacts | 0 |
| Total redacted bytes | 46952 |
| Warnings | 2 |

## Categories

| Category | Artifacts |
| --- | ---: |
| cost_ledger | 1 |
| diagnosis | 2 |
| model_trace | 2 |
| provider_scorecard | 2 |
| readiness_gate | 2 |
| reliability_scorecard | 2 |
| report | 2 |
| run_metrics | 1 |

## Source Suites

| Source suite | Artifacts |
| --- | ---: |
| cost-ledger | 2 |
| model-browser | 3 |
| provider-scorecard | 3 |
| readiness-gate | 3 |
| reliability-scorecard | 3 |

## Artifacts

| ID | Category | Source suite | Required | Redacted | Bytes | SHA-256 | Path |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| model-cost-ledger | cost_ledger | cost-ledger | yes | no | 1560 | 710da4ef0a32a0801f0a66a39e493b15a2bdc0f54df817bb6890593f4ce72409 | cost/model-cost-ledger.json |
| model-cost-report | report | cost-ledger | yes | no | 1096 | fb793ff7e54a51b326d8c9d7ef8505b06cc64fe6181dcd7168e77510a5d564f7 | cost/model-cost-report.md |
| provider-diagnosis | diagnosis | provider-scorecard | yes | no | 8552 | 6c2f439eb17fab8736843f6cc6e31f3b82cde0c77eebc17cbf0ceae9f4f56e1a | diagnostics/provider-diagnosis.json |
| reliability-diagnosis | diagnosis | reliability-scorecard | yes | no | 4844 | e9840e46b0cec0cb338d3ce80a6497952d56fe7cbc6146fd76634bf6ae640a85 | diagnostics/reliability-diagnosis.json |
| readiness-gate | readiness_gate | readiness-gate | yes | no | 4678 | 484f839a2d0eb371965f4b0302fa6bff0b565b1d386d90dad068bd5a995c46b4 | readiness/readiness-gate.json |
| readiness-report | report | readiness-gate | yes | no | 2648 | bf4b4ba7a797632b0add527303df39d401318cba2b148bba266d24730b9bf08e | readiness/readiness-gate.md |
| readiness-inputs | readiness_gate | readiness-gate | yes | no | 816 | fdd56ef2d675968880b442008fb3a66427fa78428f3ab79b3ef721cdcd226085 | readiness/readiness-inputs.json |
| provider-results | provider_scorecard | provider-scorecard | yes | no | 6095 | f74aad169aa4b3f3b912dbcdb3fe141696fc6cf8a237ea808fb344598dcd2adb | scorecards/provider-results.json |
| provider-scorecard | provider_scorecard | provider-scorecard | yes | no | 2518 | 89b22a9c1a17c9803f7ab9b8d244dd0cf41101efdb1492619ccda4d4155f21f7 | scorecards/provider-scorecard.json |
| reliability-results | reliability_scorecard | reliability-scorecard | yes | no | 2697 | 335e1047ec6285d8b90af7ad8a79862700c2be2d3fc88b52e856978d2563a21e | scorecards/reliability-results.json |
| reliability-scorecard | reliability_scorecard | reliability-scorecard | yes | no | 2940 | 9c4e0ebb542a60e5b91d2613e3d9d1e64ed7240927ccfdf86767390dc4db4dca | scorecards/reliability-scorecard.json |
| model-browser-negative-metrics | run_metrics | model-browser | yes | no | 278 | 040eaca4bd1263dd82cf3ad52fcd71f52da708e308e6a87af8cfd81d3b123b79 | traces/model-browser-negative/metrics.json |
| model-browser-negative-screenshot | model_trace | model-browser | yes | no | 3558 | 9c75d0c748c46d0276070b3bbcfa95b10a0ef669207ef851ee41ca3d1ef837ec | traces/model-browser-negative/screenshot.svg |
| model-browser-negative-trace | model_trace | model-browser | yes | no | 4672 | 849767845b89ab256227db879c743f38f71cdb3d9964ee1bffda395fba763b89 | traces/model-browser-negative/trace.jsonl |

## Warnings

- Artifact hashes cover redacted evidence-pack bytes, not unredacted source files.
- Evidence pack readiness uses existing runs/latest scorecard summaries; it does not re-run paid provider calls.
