# Post-Training and Evals Appendix

Date: 2026-06-27

This appendix explains how TracePilot turns computer-use runs into eval evidence, grader labels, and possible post-training data. It is written for people evaluating agentic browser workflows, not for a marketing demo.

## Failure Taxonomy

TracePilot classifies failures at the behavior level before assigning an owner. The same trace can produce product, harness, safety, grader, or post-training work items.

| Failure class | Observable signal | Likely owner | Example intervention |
| --- | --- | --- | --- |
| False completion | model says the task is done but expected state is absent | grader or eval, post-training data | strengthen final-state grader and add negative finish examples |
| No-progress action | action executes but URL, visible state, form values, or verifier state do not change | agent harness | retry with updated observation, focus recovery, or stop with diagnosis |
| Stuck loop | repeated semantically similar actions without progress | agent harness, post-training data | loop detector, recovery prompt, traces as negative loop examples |
| Validation miss | form error appears but the agent does not repair it | post-training data, product workflow | train/eval on error-reading and field repair |
| Modal interruption miss | blocking dialog or banner prevents the intended action | post-training data, agent harness | modal-dismiss task family and explicit verifier recovery |
| Approval policy miss | model proceeds on a thresholded or sensitive action | safety policy, product workflow | deterministic approval gate and escalation trace |
| Prompt-injection risk | untrusted page/document instructs the agent to exfiltrate or ignore policy | safety policy | untrusted-content classifier, blocked-action examples |
| Provider schema failure | model/provider returns invalid shape or rejects request schema | agent harness, provider adapter | schema conformance test, provider compatibility report |
| Budget stop | run reaches configured cost budget before success | product workflow, eval design | budget-aware task max steps and cost-per-success readout |
| Evidence-pack integrity failure | copied report is missing, tampered, or contains secrets | enterprise review | SHA-256 manifest verification and secret-pattern scan |

## Grader Design

TracePilot separates model output from success truth. A model can only finish a task when the verifier can observe the required state.

| Grader layer | Inputs | Output | Why it exists |
| --- | --- | --- | --- |
| Action-effect verifier | previous observation, action, next observation | `progress`, `uncertain`, `failure`, `success` | catches misclicks, invisible typing, and no-op actions |
| Goal-state verifier | expected URL/text/form/page state | `success` or `failure` | prevents false completion |
| Safety verifier | action plus untrusted page/document text | `unsafe` or allowed | blocks prompt injection and unsafe exfiltration |
| Approval verifier | task threshold and action semantics | `needs_human` | keeps sensitive workflow decisions explicit |
| Loop detector | recent actions and verifier statuses | stuck-loop boolean | stops repeated no-progress behavior |
| Cost ledger | model usage, pricing, source labels | cost per run and cost per success | prevents uncontrolled paid evals |
| Evidence-pack verifier | manifest, copied artifacts, hashes, required categories | pass/fail audit result | makes reports checkable by another team |

The grader rule is intentionally conservative: an uncertain action is not a success. The system can retry, ask for human approval, or stop with a diagnostic trace, but it should not silently turn uncertainty into completion.

## Trace Schema as Eval Data

Each TracePilot run writes a JSONL trace. One row represents one step:

```json
{
  "runId": "smoke-form",
  "stepIndex": 0,
  "observation": {
    "url": "http://127.0.0.1:4317/smoke-form",
    "title": "TracePilot Smoke Form",
    "screenshotPath": "screenshots/step-0.png",
    "domText": "Vendor Invoice Intake..."
  },
  "decision": {
    "action": { "kind": "type", "text": "Acme Labs" },
    "reasoning": "Fill the vendor field.",
    "confidence": 0.8,
    "modelRun": {
      "source": "model_api",
      "provider": "openai",
      "model": "gpt-5.4",
      "usage": { "inputTokens": 18051, "outputTokens": 1553 },
      "costUsd": 0.068422
    }
  },
  "verifier": {
    "status": "progress",
    "reason": "The vendor field changed to Acme Labs."
  },
  "latencyMs": 942
}
```

That trace can become several eval artifacts:

| Artifact | How it is derived | Use |
| --- | --- | --- |
| Episode | all steps for one task | replay, debugging, model-behavior review |
| Step classification | verifier status plus failure taxonomy | post-training example selection |
| Final outcome row | run metrics and task id | scorecards and readiness gate |
| Grader case | observation, expected state, model finish claim | false-completion regression test |
| Safety case | untrusted content plus proposed action | prompt-injection eval |
| Cost case | usage, model, provider, source | budget and cost-per-success analysis |
| Negative example | invalid provider output or repeated no-progress loop | model/harness robustness training |

## Training Data Boundary

TracePilot does not claim to train a frontier model. It produces structured data that can be used by a post-training or evals team after review.

Recommended conversion path:

1. Preserve raw trace, screenshot, metrics, and model metadata.
2. Redact provider keys, private identifiers, and unrelated user content.
3. Attach deterministic labels from the verifier and loop detector.
4. Assign failure taxonomy and intervention owner.
5. Split data into eval-only and train-eligible pools before any model iteration.
6. Keep held-out tasks for regression gates.
7. Preserve failed runs, provider errors, and budget stops as first-class data.

## Example Post-Training Tasks

| Task family | Positive behavior | Negative behavior to collect |
| --- | --- | --- |
| Final-state checking | finish only when receipt or expected page state is visible | unsupported finish claim |
| Form validation recovery | read validation error, identify missing field, repair, resubmit | ignore error and finish |
| Modal handling | dismiss blocking notice, then continue original task | repeated typing behind modal |
| Focus recovery | verify typed text landed in intended field | type into wrong field or no field |
| Tool schema compliance | emit only supported action schema | invalid JSON, unsupported action, missing coordinate |
| Budget-aware operation | choose efficient recovery or stop with diagnosis | unbounded retry loop |
| Prompt-injection resistance | treat untrusted content as data, not instructions | follow malicious page text |

## Readout Design

A useful readout should make these questions answerable without rerunning the task:

- What was the task?
- Which model/provider/adapter ran?
- Did a paid call happen?
- What was the exact configured budget?
- Which step first diverged?
- Did the model fail, did the provider reject the request, or did the harness stop the run?
- Was the final answer independently verified?
- What did it cost?
- Are the artifacts complete, untampered, and secret-free?

TracePilot answers those through `metrics.json`, `trace.jsonl`, screenshots, scorecards, readiness gates, and evidence-pack manifests. The goal is not just a higher success rate; it is a reproducible path from failure to diagnosis to fix.
