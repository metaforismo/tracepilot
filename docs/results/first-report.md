# First TracePilot Report

Date: 2026-06-26

This report covers the first executable TracePilot foundation. It is a local, deterministic suite, not a broad benchmark claim.

## What Works

- TypeScript monorepo with strict typechecking.
- Core trace/action/task/metric schema.
- JSONL trace store and screenshot artifact directories.
- Deterministic verifier, safety policy, and stuck-loop detector.
- Playwright browser sandbox and typed action executor.
- Agent driver interface with deterministic `ScriptedDriver`.
- Orchestrator loop: observe, decide, safety-check, act, verify, trace, measure.
- Local target app with smoke form, invoice fixtures, legacy portal, approval gate, and prompt-injection fixture.
- Next.js Studio with run launcher, metrics strip, screenshot panel, timeline, and inspector.
- Model cost ledger with explicit source labels for scripted controls, model fixtures, dry runs, and future paid API calls.
- Model run readiness manifest with env gates for paid execution and credential-safe reporting.

## Verification Commands

```bash
corepack pnpm@9.15.4 run ci
corepack pnpm@9.15.4 run build
corepack pnpm@9.15.4 run eval -- --suite smoke
corepack pnpm@9.15.4 run eval -- --suite invoice
corepack pnpm@9.15.4 run eval -- --suite comparison
corepack pnpm@9.15.4 run eval -- --suite cost-ledger
corepack pnpm@9.15.4 run eval -- --suite model-readiness
```

## Current Results

| Check | Result |
| --- | --- |
| Typecheck | Pass across 6 workspace projects |
| Unit/integration tests | Pass, 32 tests |
| Build | Pass across 6 workspace projects |
| Smoke eval | `smoke-form success=true steps=2` |
| Invoice eval | `invoice success=true portal=true approval=true injection=true` |
| Comparison eval | `comparison success_delta=75.0% false_completion_delta=-50.0% report=... diagnosis=...` |
| Cost-ledger eval | `cost-ledger model_runs=1 scripted_controls=1 total_cost_usd=0.30975 source=model_fixture ledger=... report=...` |
| Model-readiness eval | `model-readiness status=skipped_paid_runs_disabled source=dry_run paid_call=false manifest=... report=...` |

## Eval Coverage

### Smoke Suite

The smoke suite starts the local target server, submits a vendor invoice form, writes metrics to `runs/latest/metrics.json`, and writes a two-step JSONL trace.

Success means:

- the local form accepted `Acme Labs` and `1200`;
- the success page contained expected evidence;
- the trace and metrics artifacts were written.

### Invoice Suite

The invoice suite runs three deterministic harness cases:

- **Portal submission:** scripted browser actions enter Acme Labs invoice data into the legacy portal and finish only after the receipt page appears.
- **Approval gate:** a 7500 invoice stops with `requestHumanApproval` before submission.
- **Prompt injection:** a malicious invoice containing untrusted instructions is blocked before action execution.

### Comparison Suite

The comparison suite runs four deterministic cases against a naive baseline and the TracePilot harness:

- happy-path portal entry;
- false completion before receipt evidence;
- high-value invoice approval gate;
- prompt-injection block in untrusted invoice content.

The current deterministic result is documented in [Baseline vs TracePilot Comparison](baseline-comparison.md), with diagnosis details in [Failure Diagnosis Casebook](failure-diagnosis.md).

### Cost-Ledger Suite

The cost-ledger suite writes `runs/latest/cost-ledger/model-cost-ledger.json` and `runs/latest/cost-ledger/model-cost-report.md`.

It currently uses fixture token usage only and does not make a paid model call. The purpose is to enforce the accounting boundary before real model-driver runs:

- model runs require provider, model, usage, pricing, and source metadata;
- scripted controls are counted separately from model runs;
- fixture/dry-run estimates emit an explicit warning;
- future paid runs must use `source: model_api` and be reported separately.

### Model-Readiness Suite

The model-readiness suite writes `runs/latest/model-readiness/model-run-manifest.json` and `runs/latest/model-readiness/model-run-readiness.md`.

It currently defaults to `status: skipped_paid_runs_disabled`, `source: dry_run`, and `paidCall: false`. It records whether the configured API-key env var is present, but it never writes the secret value. A real paid run must be explicitly enabled and must provide a configured model decision client before the manifest can attach a `model_api` ledger.

## Limitations

- This is a local deterministic suite, not an OSWorld-scale benchmark.
- The Anthropic computer-use adapter is intentionally env-gated and does not make paid API calls yet.
- The comparison report does not yet use a paid model driver.
- The cost-ledger result is a fixture estimate, not a paid API measurement.
- The model-readiness result is a dry-run manifest, not model-performance evidence.
- The invoice fixtures are HTML first; PDF and spreadsheet fixtures are planned after the browser workflow remains stable.

## Next Measurements

The next report should add:

- repeated runs per task;
- paid `model_api` cost per successful task once real model calls are enabled.
