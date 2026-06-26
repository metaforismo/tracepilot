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

## Verification Commands

```bash
corepack pnpm@9.15.4 run ci
corepack pnpm@9.15.4 run build
corepack pnpm@9.15.4 run eval -- --suite smoke
corepack pnpm@9.15.4 run eval -- --suite invoice
corepack pnpm@9.15.4 run eval -- --suite comparison
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

## Limitations

- This is a local deterministic suite, not an OSWorld-scale benchmark.
- The Anthropic computer-use adapter is intentionally env-gated and does not make paid API calls yet.
- The comparison report does not yet use a paid model driver.
- The invoice fixtures are HTML first; PDF and spreadsheet fixtures are planned after the browser workflow remains stable.

## Next Measurements

The next report should add:

- repeated runs per task;
- cost per successful task once model calls are enabled.
