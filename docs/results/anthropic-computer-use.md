# Anthropic Computer Use Run

Date: 2026-06-27

This report documents TracePilot's Anthropic Computer Use adapter and eval boundary. It is adapter and harness evidence, not a paid Anthropic benchmark.

## Purpose

The Anthropic computer-use suite tests whether TracePilot can use Anthropic's Messages API computer tool contract end to end:

1. capture a browser observation with screenshot and page context;
2. send Anthropic's `computer_20251124` tool definition with viewport dimensions;
3. parse returned `tool_use` blocks into TracePilot actions;
4. execute click, type, key, scroll, wait, screenshot-request, or finish actions through the browser sandbox;
5. verify the resulting page state;
6. record trace, token usage, estimated cost, latency, and final outcome;
7. stop when the workflow succeeds, fails, or reaches the configured budget.

The important point is provider parity: OpenAI and Anthropic model drivers now feed the same TracePilot action, verifier, trace, and cost contract.

## Commands

Dry-run check:

```bash
corepack pnpm@9.15.4 run eval -- --suite anthropic-computer-use
```

Paid browser-control run shape:

```bash
TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1 \
TRACEPILOT_ANTHROPIC_COMPUTER_USE_MODEL=claude-sonnet-4-6 \
TRACEPILOT_ANTHROPIC_COMPUTER_USE_TASK=legacy-portal \
TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_USD=0.25 \
TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_TOKENS=700 \
corepack pnpm@9.15.4 exec tsx evals/run-evals.ts -- --suite anthropic-computer-use
```

Set `TRACEPILOT_ANTHROPIC_COMPUTER_USE_TASK=modal-interruption` to run the harder portal-notice workflow instead of the straight legacy portal task.

The API key is read from `ANTHROPIC_API_KEY` and is never written to the report. Pricing references first-party Claude API prices from [Anthropic pricing](https://docs.anthropic.com/en/docs/about-claude/pricing). The computer-use request shape follows [Anthropic's computer use tool docs](https://docs.anthropic.com/en/docs/build-with-claude/computer-use).

## Verified Locally

The mocked Anthropic integration run uses real Playwright browser execution and local target pages. The only mocked boundary is the Anthropic HTTP response.

| Field | Value |
| --- | --- |
| Provider | `anthropic` |
| Tool type | `computer_20251124` |
| Task | `legacy-portal` |
| Success | `true` |
| Steps | `11` |
| Paid call | `false` in default dry run |
| Secret leakage | `none observed in artifacts or tests` |

The mocked action path is:

```text
Tab -> type vendor -> Tab -> type amount -> Tab -> type date -> Tab -> type IBAN -> Tab -> Return -> finish
```

The mocked integration suite also covers `modal-interruption`. In that path, Anthropic-style `tool_use` blocks first dismiss a blocking portal update notice and then complete the same receipt workflow through the real browser sandbox.

## Current Boundary

No real Anthropic paid run has been recorded in this report. The suite is ready for one, but it requires explicit paid-run gates and an `ANTHROPIC_API_KEY`.

Until then, Anthropic results should be described as adapter-readiness evidence: request construction, tool-use parsing, browser execution, verifier integration, cost accounting, and sanitized reporting.

No API keys, bearer tokens, raw response IDs, or secret values are stored in this report.
