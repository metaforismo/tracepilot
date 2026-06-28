# What I Learned Building TracePilot

Date: 2026-06-27

TracePilot started as a focused computer-use reliability project, but the main lesson was that "computer use" is not just about making a model click on a screen. The hard part is the product and evaluation layer around the model: the loop that observes state, asks a model or policy for the next action, executes that action, checks whether it actually worked, records evidence, and turns failures into something a team can debug.

This document is written as a learning log. It is not a benchmark paper and it does not claim that TracePilot trains a frontier model. It explains what I learned from building the harness, running evals, preserving negative results, and trying real paid model-provider paths.

## 1. The Valuable Unit Is The Harness, Not Just The Model

At the beginning, it is tempting to think the impressive project would be "build a model that does computer use." That is not the right level for a serious product-engineering project.

The more valuable system is the harness around any capable model:

- a sandboxed browser or desktop target;
- screenshot and page-state capture;
- a model adapter that turns observations into actions;
- an action executor that performs click, type, scroll, keypress, wait, upload, finish, or approval actions;
- a verifier that checks whether the action changed the workflow state;
- a loop detector for repeated no-progress behavior;
- a safety layer for untrusted content and sensitive actions;
- a trace store that keeps screenshots, decisions, verifier status, latency, cost, and final metrics;
- an eval runner that can compare policies and providers repeatedly.

That is the layer an enterprise team needs before agentic workflows can be trusted. A raw model demo can look impressive once. A harness lets a team answer: what failed, why did it fail, how much did it cost, and did the fix improve the success rate?

## 2. Computer-Use Failures Are Usually State-Verification Failures

The most interesting failures were not dramatic. They were small state mismatches:

- the model typed into the wrong field;
- the page showed a validation error, but the agent continued as if the form succeeded;
- a modal blocked the page, but the agent kept clicking behind it;
- the model claimed completion before the receipt page existed;
- the model repeated semantically similar actions without progress;
- an untrusted document or page contained instructions that should be treated as data, not commands.

This changed how I think about agent quality. A good computer-use system cannot rely only on the model's confidence or final answer. It needs independent state checks.

In TracePilot, the final answer is not enough. A task succeeds only when the verifier can observe the expected state. That single rule removes a large class of false-completion behavior.

## 3. Evals Need Product Contracts, Not Only Prompt Tests

A useful computer-use eval is a product contract:

- what task is being attempted;
- what state proves completion;
- what states count as unsafe;
- when human approval is required;
- how many steps are allowed;
- what budget is allowed;
- which artifacts must be saved;
- how failures are classified.

TracePilot's baseline-vs-TracePilot comparison made this concrete. The baseline succeeded in 1 of 6 deterministic cases. TracePilot succeeded in 6 of 6 by adding verifier, retry, approval, safety, and loop-detection behavior.

Measured result:

| Mode | Runs | Successes | Success rate | False completion rate | Stuck-loop rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 6 | 1 | 16.7% | 50.0% | 16.7% |
| TracePilot | 6 | 6 | 100.0% | 0.0% | 0.0% |

The important detail is not that this is a frontier-model benchmark. It is not. The baseline is intentionally weak and deterministic. The important point is that the harness created measurable reliability improvements on concrete workflow failures.

## 4. Negative Results Are Product Evidence

One of the most useful outcomes was not the final success; it was the sequence of failures that made the provider boundary clearer.

The OpenRouter-backed Anthropic attempt reached the Anthropic-compatible endpoint with paid runs enabled and a strict budget cap. When TracePilot forced native mode, the provider returned HTTP 400 because it rejected the native `computer_20251124` tool type as an unknown server-tool shorthand. TracePilot recorded this as:

- `status=executed`;
- `paidCall=true`;
- model `anthropic/claude-sonnet-4.6`;
- tool mode `native_computer`;
- task `smoke-form`;
- one recorded step;
- no success;
- no leaked key material;
- `$0.000000` estimated token cost because the request failed at provider validation.

That result was not a successful native Anthropic Computer Use benchmark. But it was still valuable evidence:

- the paid-run gate worked;
- OpenRouter credential routing worked;
- the Anthropic-compatible URL was selected;
- the provider error was captured and sanitized;
- the run did not crash the eval process;
- the failure became a traceable artifact;
- provider routing must be explicit when multiple Anthropic-compatible credentials are present;
- the project needed an explicit distinction between native computer-use mode and provider-compatible action-tool mode.

After that, TracePilot added a portable `action_tool` mode for Anthropic-compatible providers that accept normal client tools but do not pass through the native computer-use tool. A real paid OpenRouter run with `anthropic/claude-sonnet-4.6` then completed the `smoke-form` workflow in 6 steps for `$0.053109`.

TracePilot now has an explicit `TRACEPILOT_ANTHROPIC_API_PROVIDER` selector. `anthropic` forces `ANTHROPIC_API_KEY`, the first-party Anthropic Messages endpoint, `x-api-key` auth, and native computer-use mode by default. `openrouter` forces `OPENROUTER_API_KEY`, the OpenRouter-compatible endpoint, bearer auth, and portable action-tool mode by default. That boundary matters because eval evidence is only useful when the endpoint, model, tool contract, and auth mode are unambiguous.

The first-party Anthropic path then produced a repeated paid provider scorecard with 9 executed paid rows across `legacy-portal`, `modal-interruption`, and `prompt-injection`. The current result is 7 successes out of 9, 77.8% success rate, 0.0% false-completion rate, 11.1% stuck-loop rate, 3 unsafe blocks, and `$0.541311` estimated cost. The task split is more useful than the average: `modal-interruption` passed 3/3, `prompt-injection` blocked unsafe content 3/3, and `legacy-portal` passed 1/3 while preserving one stuck-loop diagnosis and one unknown failure.

Those failed `legacy-portal` rows are not embarrassing noise. They are exactly why the harness exists. They show where the model/harness boundary still needs better field-grounding, retry, and completion verification.

That successful run exposed another useful behavior pattern: focus-only clicks often create no visible state change, so the verifier correctly marked them `uncertain`. The prompt and schema had to teach the model not to repeat the same focus click and to use typing or `Enter` when form state was already correct. The fix was small, but the learning was large: computer-use reliability often improves by closing the loop between model behavior, verifier feedback, and provider-schema constraints.

This is how serious evaluation should behave. Failed runs should not disappear. They should become clear, bounded, reproducible information.

## 5. Provider Adapters Need To Be Tested Like Product Surfaces

The Anthropic/OpenRouter work exposed a subtle bug before the real run: the eval suite accepted an injected `env`, but the driver and client still resolved URL/header behavior from ambient `process.env`. A unit test caught the mismatch.

The fix was to pass the resolved messages URL and OpenRouter header mode through the driver explicitly.

What I learned:

- adapter behavior should be testable without mutating global process state;
- API-key presence should be a boolean in reports, never a value;
- endpoint selection and auth header shape deserve unit tests;
- provider errors need sanitization before traces are written;
- a compatibility failure is different from a model failure.

This matters for both product engineering and evals. If a provider row fails, the harness should be able to say whether the model performed badly, the provider rejected the schema, the budget stopped the run, or the adapter crashed.

## 6. Cost Accounting Is Part Of Reliability

Agentic workflows can hide cost problems because failure often looks like "try one more step." That is dangerous.

TracePilot keeps model usage and cost attached to decisions, and it has explicit budget stops. This taught me that cost is not just finance metadata. It is a reliability signal.

Questions a good harness should answer:

- How many model steps happened?
- How much did each step cost?
- How much did the successful run cost?
- Did the run stop because of budget?
- Was a failed run still useful as training or eval data?
- Are scripted, fixture, dry-run, and real `model_api` sources separated?

If those are mixed together, the results become easy to overstate. TracePilot keeps them separate.

## 7. Safety Has To Be In The Loop, Not Only In The Prompt

Prompt-injection resistance cannot rely only on telling the model to be careful. The workflow needs a safety policy that inspects untrusted page or document content before action execution.

In TracePilot, untrusted content can produce an `unsafe` verifier outcome. That means the system can stop before the browser action happens.

The practical lesson is simple: safety should be an executable product behavior, not just a paragraph in a system prompt.

## 8. Human Approval Is A First-Class Action

For thresholded or sensitive workflows, "ask a human" should not be treated as failure. It should be a valid action with its own metric.

In TracePilot, high-value invoice workflows can stop with `needs_human`. This is important because enterprise workflows often need approval boundaries:

- payments above a threshold;
- destructive changes;
- external messages;
- permission changes;
- uploads or data sharing;
- operations involving private or regulated data.

I learned that successful autonomy does not always mean the agent completes everything alone. Sometimes the reliable behavior is to stop at the right boundary.

## 9. Traces Are The Bridge Between Product And Post-Training

A TracePilot step contains observation, action, model reasoning, verifier status, latency, and optional model metadata. That makes it useful beyond a UI replay.

The same trace can become:

- an eval row;
- a regression test;
- a false-completion grader case;
- a prompt-injection safety case;
- a tool-schema compliance case;
- a post-training negative example;
- a product bug report;
- an enterprise audit artifact.

The post-training loop I would use is:

1. collect runs with preserved failures;
2. redact secrets and unrelated user data;
3. label steps with deterministic verifier outcomes;
4. assign a failure taxonomy;
5. split train-eligible data from held-out eval data;
6. improve model behavior or harness policy;
7. rerun the same eval suite and compare deltas.

The hard rule is not to train on the held-out gate. The project is only credible if it preserves that boundary.

## 10. Public Claims Need Evidence Packs

A public engineering project needs more than a README that says "it works." It needs checkable evidence:

- exact commands;
- screenshots;
- JSON and Markdown artifacts;
- deterministic eval output;
- positive and negative traces;
- cost reports;
- secret scans;
- tamper-evident evidence packs;
- an offline verifier.

TracePilot's evidence-pack verifier checks hashes, byte counts, required evidence classes, required source suites, manifest digest, and provider-secret patterns. That changed my standard for what a serious AI systems repo should include.

If the project is meant for provider, eval, or enterprise reviewers, it should be easy to inspect the artifacts without trusting my memory or my summary.

## 11. Technical Summary

Short version:

> I built TracePilot, a reliability studio and eval harness for computer-use agents. It wraps browser-control models in an observe-act-verify loop, records every step, detects false completion and stuck loops, blocks unsafe untrusted-content actions, tracks cost, and produces scorecards and evidence packs. In a deterministic baseline comparison, the naive loop completed 1 of 6 workflows while TracePilot completed 6 of 6 by adding verifier, retry, safety, and approval behavior. I also integrated OpenAI and Anthropic-style provider adapters behind paid-run gates, preserved compatibility failures as traceable negative evidence, and ran first-party Anthropic paid rows through the same browser contracts.

Longer version:

> The project is not a toy model demo. It is the product and evaluation layer around computer use. I wanted to demonstrate end-to-end ownership: browser sandbox, action executor, model adapters, verifier, guardrails, eval runner, Studio UI, cost ledger, readiness gate, evidence-pack verifier, public docs, and real paid provider attempts. The most important learning was that agentic reliability comes from measuring and debugging the whole loop, not from only changing the prompt.

## 12. What I Would Build Next

The strongest next steps are:

1. Increase repeated paid provider scorecards across OpenAI and Anthropic with confidence intervals.
2. Add more realistic enterprise workflows: CRM update, ERP invoice entry, internal support tooling, and spreadsheet-to-browser reconciliation.
3. Add trace triage UI for assigning failure taxonomy and intervention owner.
4. Export eval rows in a training/eval-data format with explicit held-out split metadata.
5. Add screenshot-level visual diffing for action-effect verification.
6. Improve legacy-portal recovery after the preserved Anthropic failure traces.
7. Add a small public benchmark pack with fixed local targets and stable graders.

## Final Takeaway

The project taught me that computer-use agents need the same discipline as production systems:

- observability;
- explicit contracts;
- bounded costs;
- reproducible evals;
- honest negative results;
- safety gates;
- and reports that another engineer can verify.

That is the kind of systems work I want to keep doing.
