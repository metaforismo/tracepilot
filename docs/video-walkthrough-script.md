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

Then run the provider scorecard dry run:

```bash
corepack pnpm@9.15.4 run eval -- --suite provider-scorecard
```

Show that it plans OpenAI and Anthropic rows across `legacy-portal`, `modal-interruption`, and `prompt-injection`, but makes no paid calls until explicitly enabled. Explain that the mocked integration tests run those same provider adapters through the real browser sandbox, so the provider boundary is tested without mixing it with live model claims.

Then run the readiness gate:

```bash
corepack pnpm@9.15.4 run eval -- --suite readiness-gate
```

Show that the gate combines reliability evidence and provider evidence, then reports `blocked` because provider rows are dry-run only. Explain that this is the behavior you want in a real reliability product: deterministic harness success is useful, but it cannot masquerade as provider-readiness evidence.

Open `/readiness` in Studio and show the same blocked decision in the product UI: reliability evidence is visible, provider evidence is visibly dry-run only, and the blocking rule points to missing executed provider rows.

Open `/scorecards/provider` and `/scorecards/reliability` to show the underlying rows that explain the readiness decision: provider rows are dry-run only, while deterministic reliability rows are executed and repeatable.

Open `/runs/model-browser-negative`. Show the model-evidence panel: total model cost, budget-exceeded state, provider/model metadata, selected-step token usage, reasoning tokens, pricing, and the driver decision failure. Explain that this is the useful product behavior after a real browser-control failure: the run is bounded, inspectable, and tied to a specific failure class rather than disappearing into a generic model error.

## 5. Reliability Story

Explain that the project starts with deterministic drivers and local evals so reliability work is cheap and reproducible. The Anthropic and OpenAI adapter boundaries are behind explicit API-key and paid-run gates because paid model calls should be measured separately from local harness correctness.

Run:

```bash
corepack pnpm@9.15.4 run eval -- --suite cost-ledger
corepack pnpm@9.15.4 run eval -- --suite model-readiness
corepack pnpm@9.15.4 run eval -- --suite openai-benchmark
corepack pnpm@9.15.4 run eval -- --suite model-browser
corepack pnpm@9.15.4 run eval -- --suite anthropic-computer-use
corepack pnpm@9.15.4 run eval -- --suite provider-scorecard
corepack pnpm@9.15.4 run eval -- --suite readiness-gate
corepack pnpm@9.15.4 run eval -- --suite evidence-pack
corepack pnpm@9.15.4 run eval -- --suite evidence-pack-verify
```

Point out that this is a fixture estimate, a dry-run readiness manifest, and a blocked readiness gate, not a paid provider result. The useful product behavior is the reporting boundary: scripted controls, fixtures, dry runs, and future `model_api` runs cannot be mixed silently, and API key presence is recorded without leaking the key.

For the evidence pack, open `runs/latest/evidence-pack/enterprise-evidence-pack.md`. Show the artifact count, categories, source suites, per-artifact SHA-256 hashes, canonical manifest digest, and warnings. Explain that this is the enterprise handoff layer: reliability, provider, readiness, cost, and negative trace evidence can be reviewed without exposing provider credentials or mixing dry-run evidence with paid claims.

For the verifier, open `runs/latest/evidence-pack-verify/enterprise-evidence-pack-verification.md`. Show that the decision is `pass`, that 14 artifacts were verified, and that the verifier would fail missing artifacts, hash mismatches, manifest digest mismatches, missing evidence classes, or unredacted provider credential patterns. This is the reviewer-side trust check for the evidence pack.

For the paid OpenAI benchmark, show only the sanitized report. The key point is that real model calls exposed a brittle grader and a prompt/schema ambiguity, both were fixed with tests, and the final 15-call run passed all validators while recording estimated cost and reasoning tokens.

For the model-browser run, show only the sanitized model-browser report and trace. The key point is that a real model controlled the legacy portal through screenshots and structured actions, while the harness recorded cost, verifier results, and a cheaper-model failure that became a concrete visual-grounding diagnosis. Mention that the same provider suite can now target `modal-interruption`.

In Studio, show that the negative model-browser trace is inspectable step by step. The latest step preserves the driver decision failure, while step 1 shows the model API source, OpenAI model, token usage, reasoning-token count, pricing, latency, and estimated step cost.

For the Anthropic computer-use run, show the dry-run report and mocked integration trace. The point is provider parity: Anthropic `tool_use` actions and OpenAI structured decisions both end up in the same verifier, trace, cost, and reporting surface, including the modal-interruption workflow.

## 6. Why It Fits Computer Use

Close with:

TracePilot is not trying to train a model from scratch. It focuses on the product and harness layer that makes computer-use agents useful: instrumentation, evals, failure attribution, safety gates, and clean user-facing replay.
