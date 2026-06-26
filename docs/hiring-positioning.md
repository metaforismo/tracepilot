# Hiring Positioning

## One-Line Description

TracePilot is a reliability studio for computer-use agents: a sandboxed eval, replay, and self-healing harness for browser and desktop workflows.

## Why It Fits Computer Use

The project is designed to demonstrate the work behind useful computer-control products:

- end-to-end product surface;
- agent loop implementation;
- browser automation and sandboxing;
- reliability and robustness diagnosis;
- eval harness design;
- usage and outcome instrumentation;
- prompt-injection guardrails;
- clear user-facing trace replay.

## Application Summary

I built TracePilot, a reliability studio for computer-use agents: a sandboxed browser workflow harness with trace replay, step-level verification, stuck-loop detection, prompt-injection tests, and an invoice-to-legacy-portal demo. The project focuses on the loop I think matters most for computer use: turning raw model actions into a measurable, debuggable, recoverable product surface.

Current foundation:

- local target app and browser sandbox;
- deterministic trace/eval harness;
- prompt-injection block fixture;
- approval-gated invoice workflow;
- Next.js trace replay Studio;
- first report with exact verification commands.

## DM Draft

Hi, I am interested in Product Engineer, Computer Use. I am building TracePilot, a reliability studio for computer-use agents: a sandboxed browser harness with trace replay, eval tasks, step-level verification, stuck-loop detection, prompt-injection tests, and an invoice-to-legacy-portal workflow.

The project focuses on the part of computer use I find most important: turning raw model capability into a measurable, debuggable, safe product loop. I am including a video walkthrough, eval report, and before/after metrics comparing a baseline agent to a verifier/retry layer.

I would be excited to work on agent harness reliability, evals, browser-control product surfaces, and knowledge-worker workflows.

## Walkthrough Narrative

1. Show the problem: a baseline agent can silently mis-click, miss validation errors, or claim success early.
2. Show TracePilot: every observation, action, verifier decision, retry, and artifact is recorded.
3. Run the invoice-to-legacy-portal demo.
4. Trigger a validation failure and show recovery.
5. Trigger a prompt-injection fixture and show the block.
6. End with metrics: baseline versus TracePilot.
