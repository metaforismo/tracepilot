# OpenAI API Evidence

Date: 2026-06-26

This report documents manual and scripted OpenAI Responses API evidence. It proves TracePilot can use an env-gated OpenAI key safely, capture usage/cost metadata, and improve its benchmark harness from real failures. It is not a broad model-ranking claim.

No API key value, response ID, or secret is recorded here.

## Setup

- Key source: local `.env.local`, ignored by Git.
- Provider env: `TRACEPILOT_MODEL_PROVIDER=openai`.
- Default low-budget readiness model: `gpt-5.4-nano`.
- Reasoning effort: `low`.
- Pricing source: [OpenAI API pricing](https://openai.com/api/pricing/), standard short-context prices per 1M tokens.

## JSON Smoke

Prompt:

```text
Return only this JSON object with no markdown: {"claim":"TracePilot makes computer-use agent failures measurable."}
```

| Requested model | Resolved model | Status | Latency ms | Input tokens | Output tokens | Reasoning tokens | Total tokens | Estimated cost USD |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `gpt-5.4-nano` | `gpt-5.4-nano-2026-03-17` | completed | 1964 | 28 | 17 | 0 | 45 | $0.000027 |
| `gpt-5.4` | `gpt-5.4-2026-03-05` | completed | 1406 | 28 | 17 | 0 | 45 | $0.000325 |
| `gpt-5.5` | `gpt-5.5-2026-04-23` | completed | 1659 | 28 | 29 | 10 | 57 | $0.001010 |

## Longer Paragraph Smoke

Prompt:

```text
Write a concise but useful evaluation paragraph, 90 to 130 words, about why TracePilot is relevant to computer-use agent reliability. Mention traces, evals, guardrails, and cost accounting. Do not use markdown.
```

| Requested model | Resolved model | Status | Latency ms | Input tokens | Output tokens | Reasoning tokens | Total tokens | Words | Estimated cost USD |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `gpt-5.4-nano` | `gpt-5.4-nano-2026-03-17` | completed | 4548 | 51 | 141 | 0 | 192 | 107 | $0.000186 |
| `gpt-5.4` | `gpt-5.4-2026-03-05` | completed | 3583 | 51 | 149 | 0 | 200 | 112 | $0.002363 |
| `gpt-5.5` | `gpt-5.5-2026-04-23` | completed | 5687 | 51 | 194 | 54 | 245 | 105 | $0.006075 |

## Broader OpenAI Benchmark

Command shape:

```bash
set -a; source .env.local; set +a
TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1 \
TRACEPILOT_OPENAI_BENCHMARK_MAX_USD=1 \
TRACEPILOT_OPENAI_REASONING_EFFORT=low \
corepack pnpm@9.15.4 exec tsx evals/run-evals.ts -- --suite openai-benchmark
```

Final run output:

```text
openai-benchmark status=executed paid_calls=15 passed=15 failed=0 total_cost_usd=0.037686 report=...
```

Task set:

- `structured-extraction`;
- `action-decision`;
- `guardrail-classification`;
- `failure-diagnosis`;
- `technical-summary`.

Per-model summary:

| Model | Calls | Validations passed | Input tokens | Output tokens | Reasoning tokens | Total estimated cost | Total latency ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `gpt-5.4-nano` | 5 | 5 | 314 | 710 | 89 | $0.000951 | 11740 |
| `gpt-5.4` | 5 | 5 | 314 | 852 | 351 | $0.013565 | 17450 |
| `gpt-5.5` | 5 | 5 | 314 | 720 | 244 | $0.023170 | 18472 |

The run used a `$1.00` configured max cost and spent an estimated `$0.037686`.

## Harness Findings From Real Runs

Earlier broad runs produced `12/15`, `14/15`, and `13/15` validation passes. Inspecting failures found harness issues rather than API errors:

- the failure-diagnosis validator was too literal and rejected valid labels such as `premature task completion`, `state-verification failure`, and `workflow-state mismatch`;
- the action-decision prompt did not enumerate supported TracePilot action kinds, so one `gpt-5.4-nano` run returned `fill` instead of the supported `type`.

Fixes added regression coverage in `evals/openai-benchmark-suite.test.ts`, broadened the diagnosis grader semantically, and made the action prompt schema-explicit. The final paid run after those fixes passed all 15 validations.

## Takeaways

- `gpt-5.4-nano` is the safest default for small smoke tests because it completed both prompts with the lowest estimated cost.
- `gpt-5.4` produced the fastest longer paragraph in this tiny sample, but at a higher estimated cost.
- `gpt-5.5` used reasoning tokens on both JSON and longer paragraph tasks, so output caps need more headroom.
- An earlier 32-token cap produced empty `output_text` for `gpt-5.4-nano` and `gpt-5.4`, and `incomplete` for `gpt-5.5` after 32 reasoning tokens. Raising `max_output_tokens` to 80 fixed the short JSON prompt.
- The broader benchmark is useful as harness evidence: it found grader brittleness and prompt/schema ambiguity before it became a product claim.

## Boundary

The smoke tests and broader benchmark have tiny sample sizes. Do not present them as model quality evidence or broad rankings. Their value is operational: they verify env-gated OpenAI execution, usage capture, cost controls, prompt/schema iteration, and low-budget model selection without leaking secrets.
