# Model Browser Run

Date: 2026-06-26

This report documents the first TracePilot browser-control run using a real OpenAI Responses model as the decision client. It is operational evidence for the harness, not a broad model-quality ranking.

## Purpose

The model-browser suite tests whether TracePilot can run the real computer-use loop end to end:

1. capture a browser observation with screenshot and page context;
2. ask a model for the next structured action;
3. execute click, type, press, scroll, wait, finish, or approval actions;
4. verify whether the page state changed as expected;
5. record trace, token usage, estimated cost, latency, and final outcome;
6. stop when the workflow succeeds, fails, or reaches the configured budget.

This is the path that makes the project relevant to computer-use product engineering: the model is not just answering a prompt, it is controlling a local workflow under a verifier and an accounting boundary.

## Commands

Dry-run check:

```bash
corepack pnpm@9.15.4 run eval -- --suite model-browser
```

Paid browser-control run shape:

```bash
TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1 \
TRACEPILOT_MODEL_BROWSER_MODEL=gpt-5.4 \
TRACEPILOT_MODEL_BROWSER_TASK=legacy-portal \
TRACEPILOT_MODEL_BROWSER_MAX_USD=0.1 \
TRACEPILOT_MODEL_BROWSER_MAX_OUTPUT_TOKENS=900 \
TRACEPILOT_OPENAI_REASONING_EFFORT=low \
corepack pnpm@9.15.4 exec tsx evals/run-evals.ts -- --suite model-browser
```

Set `TRACEPILOT_MODEL_BROWSER_TASK=modal-interruption` to run the harder portal-notice workflow instead of the straight legacy portal task.

The API key is read from `OPENAI_API_KEY` and is never written to the report. Pricing references OpenAI standard short-context pricing from [OpenAI API pricing](https://openai.com/api/pricing/).

## Successful Run

The successful run used `gpt-5.4` on the `legacy-portal` task.

| Field | Value |
| --- | --- |
| Status | `executed` |
| Success | `true` |
| Steps | `11` |
| Estimated cost | `$0.068422` |
| Duration | `26253 ms` |
| Input tokens | `18051` |
| Output tokens | `1553` |
| Reasoning tokens | `216` |
| False completion | `false` |
| Stuck loop | `false` |
| Unsafe blocked | `false` |
| Human approvals | `0` |

The action path was:

```text
click vendor -> type vendor -> Tab -> type amount -> Tab -> type date -> Tab -> type IBAN -> Tab -> Enter -> finish
```

The final verifier accepted the portal receipt state. The receipt page showed the expected vendor, amount, invoice date, and IBAN evidence.

## Mocked Modal Coverage

The suite also has mocked OpenAI Responses integration coverage for `modal-interruption`. That test uses the real Playwright target with a blocking portal update notice, then verifies the driver can dismiss the modal, fill the invoice fields, submit, and finish only after the receipt appears. This is provider-boundary evidence, not a paid OpenAI model result.

## Negative Run

A comparison run used `gpt-5.4-nano` on the same task.

| Field | Value |
| --- | --- |
| Status | `executed` |
| Success | `false` |
| Steps | `18` |
| Estimated cost | `$0.010408` |

The run repeatedly tried to recover focus around the vendor and amount fields, eventually entering `Acme Labs` into the wrong field. That negative result is preserved because it is useful: it points at visual grounding and focus-recovery reliability, not a vague "model failed" label.

## Harness Fixes From Paid Runs

Paid runs exposed issues that deterministic tests alone did not:

- strict OpenAI structured-output schemas must include every property in `required`, even nullable action fields;
- the portal task prompt must include actual invoice fields instead of relying on hidden fixture data;
- finish verification must accept quoted final-state evidence inside a descriptive model summary;
- driver decision errors should become trace failures instead of crashing the eval process;
- macOS key aliases need normalization so model-emitted `Ctrl+A` works as `Meta+A` in Playwright;
- model-browser workflows need output-token headroom and enough max steps to allow recovery attempts.

Each fix has regression coverage in the unit or eval tests.

## Boundaries

These runs are small and operational. They prove TracePilot can run and measure real model-browser workflows behind explicit paid-run gates. They do not prove broad model superiority, and failed runs should stay in future reports.

No API keys, bearer tokens, raw response IDs, or secret values are stored in this report.
