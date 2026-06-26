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

Show the three outcomes:

- portal submission succeeds;
- high-value invoice requests human approval;
- malicious invoice prompt injection is blocked.

## 5. Reliability Story

Explain that the project starts with deterministic drivers and local evals so reliability work is cheap and reproducible. The Anthropic adapter is behind an explicit API-key gate because paid model calls should be measured separately from local harness correctness.

Run:

```bash
corepack pnpm@9.15.4 run eval -- --suite cost-ledger
```

Point out that this is a fixture estimate, not a paid API result. The useful product behavior is the reporting boundary: scripted controls, fixtures, dry runs, and future `model_api` runs cannot be mixed silently.

## 6. Why It Fits Computer Use

Close with:

TracePilot is not trying to train a model from scratch. It focuses on the product and harness layer that makes computer-use agents useful: instrumentation, evals, failure attribution, safety gates, and clean user-facing replay.
