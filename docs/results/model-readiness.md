# Model Run Readiness

Date: 2026-06-26

This report documents the env-gated model-run manifest. It proves TracePilot can report why a real model-driver run did or did not execute without leaking credentials or silently mixing dry runs with `model_api` evidence.

## Command

```bash
corepack pnpm@9.15.4 run eval -- --suite model-readiness
```

Observed default output:

```text
model-readiness provider=anthropic model=claude-sonnet-4-20250514 status=skipped_paid_runs_disabled source=dry_run paid_call=false manifest=... report=...
```

## What It Proves

- Paid model calls are disabled unless `TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1`.
- The manifest records whether the configured API-key env var is present without writing the secret.
- Missing credentials and missing decision-client wiring are reported as separate statuses.
- `model_api` cost ledgers are only attached when an executed paid run has usage and pricing metadata.

## Default Manifest Boundary

| Field | Value |
| --- | --- |
| Status | `skipped_paid_runs_disabled` |
| Source | `dry_run` |
| Paid call | `false` |
| Provider | `anthropic` |
| Model | `claude-sonnet-4-20250514` |
| API key env var | `ANTHROPIC_API_KEY` |

## OpenAI Readiness

Use the OpenAI provider without exposing a key value:

```bash
TRACEPILOT_MODEL_PROVIDER=openai \
TRACEPILOT_OPENAI_MODEL=gpt-5.4-nano \
TRACEPILOT_OPENAI_REASONING_EFFORT=low \
corepack pnpm@9.15.4 run eval -- --suite model-readiness
```

Expected OpenAI dry-run output:

```text
model-readiness provider=openai model=gpt-5.4-nano reasoning_effort=low status=skipped_paid_runs_disabled source=dry_run paid_call=false manifest=... report=...
```

The manifest uses `OPENAI_API_KEY` as the configured env var and records only whether it is present. `gpt-5.4-nano` is the default OpenAI readiness model for low-budget smoke tests, `TRACEPILOT_OPENAI_MODEL` can override it, and `TRACEPILOT_OPENAI_REASONING_EFFORT` defaults to `low`.

## Reporting Boundary

No paid model call was made.

Real model-driver results must be explicitly enabled, must use `source: model_api`, and must include provider, model, task outcome, usage, pricing, computed cost, and trace artifacts. Dry-run manifests are readiness evidence, not model-performance evidence.
