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
- OpenAI Responses API benchmark with dry-run default, paid-run budget gate, task validators, reasoning-token capture, and sanitized runtime artifacts.
- OpenAI Responses decision client that drives the browser from screenshots and page context using strict structured output.
- Model-browser eval suite with step-level model cost metadata, per-run budget stops, driver-error trace failures, and sanitized reports.
- Anthropic Computer Use decision client that sends the `computer_20251124` tool definition, parses `tool_use` blocks, and attaches usage/cost metadata.
- Anthropic computer-use eval suite with dry-run gates, mocked browser integration coverage, and sanitized reports.

## Verification Commands

```bash
corepack pnpm@9.15.4 run ci
corepack pnpm@9.15.4 run build
corepack pnpm@9.15.4 run eval -- --suite smoke
corepack pnpm@9.15.4 run eval -- --suite invoice
corepack pnpm@9.15.4 run eval -- --suite comparison
corepack pnpm@9.15.4 run eval -- --suite cost-ledger
corepack pnpm@9.15.4 run eval -- --suite model-readiness
corepack pnpm@9.15.4 run eval -- --suite openai-benchmark
corepack pnpm@9.15.4 run eval -- --suite model-browser
corepack pnpm@9.15.4 run eval -- --suite anthropic-computer-use
```

## Current Results

| Check | Result |
| --- | --- |
| Typecheck | Pass across 6 workspace projects |
| Unit/integration tests | Pass, 92 tests |
| Build | Pass across 6 workspace projects |
| Smoke eval | `smoke-form success=true steps=2` |
| Invoice eval | `invoice success=true portal=true validation=true approval=true injection=true` |
| Comparison eval | `comparison success_delta=83.3% false_completion_delta=-50.0% report=... diagnosis=...` |
| Cost-ledger eval | `cost-ledger model_runs=1 scripted_controls=1 total_cost_usd=0.30975 source=model_fixture ledger=... report=...` |
| Model-readiness eval | `model-readiness provider=anthropic model=claude-sonnet-4-20250514 status=skipped_paid_runs_disabled source=dry_run paid_call=false manifest=... report=...` |
| OpenAI benchmark dry run | `openai-benchmark status=skipped_paid_runs_disabled paid_calls=0 passed=0 failed=0 total_cost_usd=0 report=...` |
| OpenAI paid benchmark evidence | `15` paid calls, `15/15` validations passed, `$0.037686` estimated cost with `TRACEPILOT_OPENAI_REASONING_EFFORT=low` |
| Model-browser dry run | `model-browser status=skipped_paid_runs_disabled paid_call=false success=false steps=0 total_cost_usd=0 report=...` |
| Model-browser mocked modal integration | Mocked OpenAI Responses actions dismissed a blocking portal notice, completed the real browser workflow in `11` steps, and wrote `model_api` trace metadata |
| Model-browser paid evidence | `gpt-5.4` completed the legacy portal workflow in `11` steps for `$0.068422`; `gpt-5.4-nano` failed in `18` steps for `$0.010408` with a visual grounding and focus-recovery loop |
| Anthropic computer-use dry run | `anthropic-computer-use status=skipped_paid_runs_disabled paid_call=false success=false steps=0 total_cost_usd=0 report=...` |
| Anthropic computer-use mocked integration | Mocked Anthropic `tool_use` responses completed the real browser legacy portal workflow in `11` steps with `model_api` trace metadata |
| Anthropic computer-use mocked modal integration | Mocked Anthropic `tool_use` responses dismissed a blocking portal notice and completed the same interrupted browser workflow in `11` steps |

## Eval Coverage

### Smoke Suite

The smoke suite starts the local target server, submits a vendor invoice form, writes metrics to `runs/latest/metrics.json`, and writes a two-step JSONL trace.

Success means:

- the local form accepted `Acme Labs` and `1200`;
- the success page contained expected evidence;
- the trace and metrics artifacts were written.

### Invoice Suite

The invoice suite runs four deterministic harness cases:

- **Portal submission:** scripted browser actions enter Acme Labs invoice data into the legacy portal and finish only after the receipt page appears.
- **Validation recovery:** scripted browser actions submit once with a missing invoice date, observe the required-field error, repair only the missing field, and finish after the receipt appears.
- **Approval gate:** a 7500 invoice stops with `requestHumanApproval` before submission.
- **Prompt injection:** a malicious invoice containing untrusted instructions is blocked before action execution.

### Comparison Suite

The comparison suite runs six deterministic cases against a naive baseline and the TracePilot harness:

- happy-path portal entry;
- false completion before receipt evidence;
- form validation recovery after a missing required field;
- modal interruption before form entry;
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

It currently defaults to `status: skipped_paid_runs_disabled`, `source: dry_run`, and `paidCall: false`. It records whether the configured API-key env var is present, but it never writes the secret value. It supports Anthropic and OpenAI provider readiness through env configuration. A real paid run must be explicitly enabled and must provide a configured model decision client before the manifest can attach a `model_api` ledger.

### OpenAI Benchmark Suite

The OpenAI benchmark suite writes `runs/latest/openai-benchmark/openai-benchmark.json` and `runs/latest/openai-benchmark/openai-benchmark-report.md`.

It is a dry run by default. Paid execution requires `TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1`, `OPENAI_API_KEY`, and a budget such as `TRACEPILOT_OPENAI_BENCHMARK_MAX_USD=1`. The current paid evidence ran 15 Responses API calls across `gpt-5.4-nano`, `gpt-5.4`, and `gpt-5.5` on structured extraction, action decision, guardrail classification, failure diagnosis, and technical summary tasks. The final run passed all task validators with an estimated cost of `$0.037686`.

The important engineering outcome was not only the pass rate: earlier runs exposed an over-literal failure-diagnosis grader and an action prompt that omitted the supported action enum. Both were fixed with tests before the final paid run.

### Model-Browser Suite

The model-browser suite writes `runs/latest/model-browser/model-browser-summary.json` and `runs/latest/model-browser/model-browser-report.md`.

It is a dry run by default. Paid execution requires `TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1`, `OPENAI_API_KEY`, and a budget such as `TRACEPILOT_MODEL_BROWSER_MAX_USD=0.5`. A paid run uses the OpenAI Responses API to choose browser actions from the current screenshot, URL, page title, visible page text, form values, and recent action history. `TRACEPILOT_MODEL_BROWSER_TASK` supports `legacy-portal`, `smoke-form`, and `modal-interruption`.

The current successful run used `gpt-5.4` with `TRACEPILOT_OPENAI_REASONING_EFFORT=low` on the legacy portal task. It completed the workflow in 11 steps, recorded `$0.068422` estimated cost, used 18051 input tokens, 1553 output tokens, and 216 reasoning tokens, and ended with no false completion, stuck loop, unsafe block, budget exceedance, or human approval.

The current mocked OpenAI integration coverage also runs `modal-interruption`, where the model-driver boundary first dismisses a blocking portal notice and then completes the same receipt workflow through the real Playwright sandbox.

A comparison run with `gpt-5.4-nano` cost `$0.010408` and failed after 18 steps. The trace showed repeated coordinate/focus recovery around the vendor and amount fields. That failed run is useful evidence: the harness preserved the negative result, kept costs bounded, and made the failure class visible instead of treating the run as a generic model error.

Real paid browser runs also drove concrete harness fixes:

- strict OpenAI structured-output schemas must require every property, including nullable action fields;
- the portal task must include the invoice fields the model needs, not rely on hidden fixture knowledge;
- the verifier must accept descriptive finish claims when all quoted final-state evidence is visible;
- driver decision errors should become trace failures instead of crashing the eval;
- macOS browser key aliases such as `Ctrl+A` need normalization to `Meta+A`;
- long browser decisions need enough `max_output_tokens` headroom and a workflow max-step budget that allows recovery.

### Anthropic Computer Use Suite

The Anthropic computer-use suite writes `runs/latest/anthropic-computer-use/anthropic-computer-use-summary.json` and `runs/latest/anthropic-computer-use/anthropic-computer-use-report.md`.

It is a dry run by default. Paid execution requires `TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1`, `ANTHROPIC_API_KEY`, and a budget such as `TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_USD=0.25`. The adapter sends Anthropic's computer-use tool definition with viewport dimensions and maps returned `tool_use` blocks into TracePilot click, type, press, scroll, wait, and finish actions. `TRACEPILOT_ANTHROPIC_COMPUTER_USE_TASK` supports `legacy-portal`, `smoke-form`, and `modal-interruption`.

The current verification uses mocked Anthropic Messages API responses but real Playwright browser execution, including the interrupted portal workflow. That keeps the provider boundary honest: the run proves request construction, action parsing, verifier integration, trace writing, cost accounting, and secret-safe reports, but it is not a paid Anthropic model-performance result.

## Limitations

- This is a local deterministic suite, not an OSWorld-scale benchmark.
- The Anthropic computer-use adapter can make paid calls behind explicit env gates, but this report has not recorded a paid Anthropic run yet.
- The comparison report does not yet use a paid model driver.
- The cost-ledger result is a fixture estimate; paid model-browser measurements are reported separately.
- The model-readiness result is a dry-run manifest, not model-performance evidence.
- The OpenAI paid run is a small operational benchmark and harness-readiness check, not a broad model-quality ranking.
- The model-browser paid runs are small operational browser-control checks, not broad computer-use model rankings.
- The Anthropic computer-use result is mocked at the API boundary until a real paid run is explicitly enabled.
- The invoice fixtures are HTML first; PDF and spreadsheet fixtures are planned after the browser workflow remains stable.

## Next Measurements

The next report should add:

- repeated runs per task;
- paid `model_api` cost per successful task across repeated browser-control runs;
- a real paid Anthropic Computer Use run under the same trace contract;
- cross-provider failure-class scorecards for OpenAI and Anthropic browser workflows.
