# Hiring Positioning

## One-Line Description

TracePilot is a reliability studio for computer-use agents: a sandboxed eval, replay, and self-healing harness for browser and desktop workflows.

## Why It Fits Anthropic Computer Use

The project is designed to demonstrate the work behind useful computer-control products:

- end-to-end product surface;
- agent loop implementation;
- browser automation and sandboxing;
- reliability and robustness diagnosis;
- eval harness design;
- usage and outcome instrumentation;
- explicit model-run cost accounting;
- prompt-injection guardrails;
- clear user-facing trace replay.

## Why It Fits OpenAI Agent Post-Training

The project also maps directly to computer-use post-training work:

- local environments that expose specific model-behavior failures;
- grader-like success criteria for false completion, approval gates, and unsafe content;
- deterministic control runs before introducing paid model calls;
- run artifacts that make behavior analysis concrete;
- comparison reports that turn qualitative failures into measurable deltas;
- failure diagnosis casebook that maps traces to model-behavior hypotheses and intervention owners;
- source-aware cost ledger for separating scripted controls, fixtures, dry runs, and paid `model_api` results;
- clear separation between scripted-driver results and future model-driver results.

## Application Summary

I built TracePilot, a reliability studio for computer-use agents: a sandboxed browser workflow harness with trace replay, step-level verification, stuck-loop detection, prompt-injection tests, deterministic evals, and an invoice-to-legacy-portal demo. The project focuses on the loop I think matters most for computer use: turning raw model actions into measurable, debuggable, recoverable behavior.

Current foundation:

- local target app and browser sandbox;
- deterministic trace/eval harness;
- prompt-injection block fixture;
- approval-gated invoice workflow;
- Next.js trace replay Studio;
- baseline-vs-TracePilot comparison report;
- failure diagnosis report with post-training and harness follow-ups;
- model cost ledger with explicit fixture-versus-paid reporting boundary;
- exact verification commands and artifacts.

## Anthropic DM Draft

Hi, I am interested in Product Engineer, Computer Use. I am building TracePilot, a reliability studio for computer-use agents: a sandboxed browser harness with trace replay, eval tasks, step-level verification, stuck-loop detection, prompt-injection tests, and an invoice-to-legacy-portal workflow.

The project focuses on the part of computer use I find most important: turning raw model capability into a measurable, debuggable, safe product loop. I am including a video walkthrough, eval report, before/after metrics comparing a baseline agent to a verifier/retry layer, and source-aware cost accounting for future model-driver runs.

I would be excited to work on agent harness reliability, evals, browser-control product surfaces, and knowledge-worker workflows.

## OpenAI Application Draft

I am interested in Agent Post-Training, Computer Use. I am building TracePilot, a local eval and diagnostics harness for browser-based computer-use agents. It includes production-like target environments, grader-style success criteria, trace artifacts, prompt-injection and approval-gate cases, a reproducible baseline-vs-TracePilot comparison report, a source-aware model cost ledger, and a failure diagnosis casebook.

The project is meant to show how I move from a vague behavior problem to a concrete experiment: define the failure mode, build the environment, add a grader, run the comparison, inspect the trace, classify the failure, and decide what should become a model, data, or product-harness fix.

## Walkthrough Narrative

1. Show the problem: a baseline agent can silently mis-click, miss validation errors, or claim success early.
2. Show TracePilot: every observation, action, verifier decision, retry, and artifact is recorded.
3. Run the invoice-to-legacy-portal demo.
4. Trigger a validation failure and show recovery.
5. Trigger a prompt-injection fixture and show the block.
6. End with metrics: baseline versus TracePilot and explain how the same loop becomes post-training data or product-harness fixes.
