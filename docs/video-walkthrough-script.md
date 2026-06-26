# Video Walkthrough Script

Target length: 3 minutes.

## 1. Problem

Computer-use agents do not only need to click. They need to be observable, recoverable, measurable, and safe. The failure modes I care about are silent mis-clicks, false completion, stuck loops, validation misses, and prompt injection from untrusted pages or documents.

## 2. Product

TracePilot is a reliability studio for computer-use agents. It wraps a browser agent loop with trace capture, a verifier, retry-ready failure labels, safety checks, and a Studio UI for replaying what happened step by step.

## 3. Trace Replay

Open the Studio. Show the smoke trace:

- run metrics;
- screenshot panel;
- timeline;
- selected step inspector;
- action JSON;
- verifier reason.

Point out that every run writes JSONL traces and metrics artifacts.

## 4. Invoice Demo

Run:

```bash
corepack pnpm@9.15.4 run eval -- --suite invoice
```

Show the four invoice outcomes:

- portal submission succeeds;
- validation recovery fixes a missing invoice date after the portal rejects the form;
- high-value invoice requests human approval;
- malicious invoice prompt injection is blocked.

Then run the comparison suite and point out the extra browser-interruption case:

```bash
corepack pnpm@9.15.4 run eval -- --suite comparison
```

Show that the baseline gets stuck on `modal-interruption-blocking-form`, while TracePilot dismisses the portal notice, continues the form, and records the failure as `modal_interruption_miss` for diagnosis.

Then run the reliability scorecard:

```bash
corepack pnpm@9.15.4 run eval -- --suite reliability-scorecard
```

Show the scorecard report: five harder browser cases, successful policy outcomes, zero false completions, zero stuck loops, one approval stop, and one prompt-injection block. Explain that this is the bridge from a one-off demo to repeated operational reliability measurement.

Mention that longer local runs can use `--repetitions 3` or higher before comparing paid provider-backed scorecards.

## 5. Reliability Story

Explain that the project starts with deterministic drivers and local evals so reliability work is cheap and reproducible. The Anthropic and OpenAI adapter boundaries are behind explicit API-key and paid-run gates because paid model calls should be measured separately from local harness correctness.

Run:

```bash
corepack pnpm@9.15.4 run eval -- --suite cost-ledger
corepack pnpm@9.15.4 run eval -- --suite model-readiness
corepack pnpm@9.15.4 run eval -- --suite openai-benchmark
corepack pnpm@9.15.4 run eval -- --suite model-browser
corepack pnpm@9.15.4 run eval -- --suite anthropic-computer-use
```

Point out that this is a fixture estimate and a dry-run readiness manifest, not a paid API result. The useful product behavior is the reporting boundary: scripted controls, fixtures, dry runs, and future `model_api` runs cannot be mixed silently, and API key presence is recorded without leaking the key.

For the paid OpenAI benchmark, show only the sanitized report. The key point is that real model calls exposed a brittle grader and a prompt/schema ambiguity, both were fixed with tests, and the final 15-call run passed all validators while recording estimated cost and reasoning tokens.

For the model-browser run, show only the sanitized model-browser report and trace. The key point is that a real model controlled the legacy portal through screenshots and structured actions, while the harness recorded cost, verifier results, and a cheaper-model failure that became a concrete visual-grounding diagnosis. Mention that the same provider suite can now target `modal-interruption`.

For the Anthropic computer-use run, show the dry-run report and mocked integration trace. The point is provider parity: Anthropic `tool_use` actions and OpenAI structured decisions both end up in the same verifier, trace, cost, and reporting surface, including the modal-interruption workflow.

## 6. Why It Fits Computer Use

Close with:

TracePilot is not trying to train a model from scratch. It focuses on the product and harness layer that makes computer-use agents useful: instrumentation, evals, failure attribution, safety gates, and clean user-facing replay.
