# TracePilot

Reliability studio for computer-use agents.

TracePilot is an open-source product and eval harness for browser and desktop agents. It records every agent step, replays runs visually, verifies whether actions actually worked, recovers from common failures, and measures reliability across repeatable knowledge-work tasks.

The project is designed around one question:

> What product and engineering layer turns raw computer-use capability into something debuggable, measurable, and safe enough for real workflows?

## Why This Exists

Computer-use agents often fail in ways that are hard to inspect:

- They click the wrong target.
- They assume an action succeeded when it did not.
- They get stuck repeating the same step.
- They miss validation errors, modals, cookie banners, or disabled controls.
- They follow untrusted instructions from web pages, documents, emails, or tool output.
- They produce a final answer without enough evidence that the task is complete.

TracePilot treats those as product problems, not just model problems. The system wraps an agent in a sandboxed runtime, captures a step-by-step trace, verifies progress after actions, and produces metrics that make reliability work concrete.

## Product Shape

TracePilot has four core surfaces:

- **Task Launcher:** Start a browser or desktop workflow from a natural-language task and a repeatable fixture.
- **Trace Viewer:** Replay screenshots, actions, observations, verifier decisions, retries, costs, latency, and final outcomes.
- **Reliability Harness:** Detect false completion, stuck loops, unsafe actions, repeated mis-clicks, and missing expected state changes.
- **Eval Dashboard:** Compare a baseline agent against verifier/retry policies on task success rate, cost per successful task, stuck-loop rate, and prompt-injection resistance.

## Demo Workflow

The flagship demo is an invoice-to-legacy-portal workflow:

1. Read a mock invoice PDF.
2. Check vendor details in a spreadsheet.
3. Enter invoice data into a local legacy portal with no API.
4. Recover from form validation errors.
5. Stop for human approval above a configured payment threshold.
6. Block a prompt-injection attempt embedded in an untrusted document or page.
7. Save an audit report and update the run metrics.

This is intentionally business-like: the goal is not to show that an agent can click a button, but that a product can make a computer-use workflow observable, recoverable, and measurable.

## Target Architecture

```mermaid
flowchart TD
  A["Target app or desktop sandbox"] --> B["Observation layer: screenshot, OCR, DOM, logs"]
  B --> C["Agent driver: Claude Computer Use or compatible adapter"]
  C --> D["Action executor: click, type, scroll, keypress, upload"]
  D --> E["Verifier: goal state, action effect, unsafe content"]
  E --> F["Trace store: steps, artifacts, metrics"]
  E -->|retry or re-plan| B
  F --> G["Studio UI: launcher, replay, dashboard"]
```

## Planned Stack

- **Language:** TypeScript.
- **Runtime:** Node.js, pnpm workspaces.
- **Browser control:** Playwright.
- **Product UI:** Next.js.
- **Agent layer:** Pluggable driver interface, starting with a deterministic scripted driver and an Anthropic Computer Use adapter.
- **Storage:** Local SQLite for run metadata, filesystem artifacts for screenshots and trace files, with Postgres-compatible schema later.
- **Testing:** Vitest for unit tests, Playwright for integration tasks, reproducible eval runner for metrics.

## Eval Metrics

TracePilot will report:

| Metric | Meaning |
| --- | --- |
| Task success rate | Percent of eval tasks completed according to evaluator scripts. |
| False completion rate | Agent claimed success but evaluator found missing or wrong state. |
| Stuck-loop rate | Agent repeated semantically equivalent actions without progress. |
| Recovery rate | Failed or uncertain steps recovered by verifier/retry policies. |
| Prompt-injection block rate | Unsafe attempts blocked or escalated before action. |
| Cost per successful task | Model and tool cost divided by successful runs. |
| Median steps per task | Efficiency signal for completed tasks. |

The current comparison report measures:

- baseline loop: observe -> act -> final answer;
- TracePilot loop: observe -> act -> verify -> retry/escalate -> final answer.

## Repository Status

TracePilot is now an executable TypeScript workspace. The current foundation includes:

- pnpm monorepo scaffold and GitHub Actions CI;
- strict TypeScript configuration;
- `@tracepilot/core` trace/action/task/metric schema;
- local JSONL trace store;
- deterministic verifier, safety policy, and stuck-loop detector;
- dependency-free local target app;
- Playwright browser sandbox with screenshot observation capture;
- typed action executor for click, type, press, scroll, wait, upload, finish, and human approval actions;
- deterministic `ScriptedDriver` for offline evals;
- env-gated Anthropic driver boundary for future paid computer-use calls;
- orchestrator loop for observe, decide, safety-check, act, verify, trace, and measure;
- Next.js Studio UI with run launcher, metrics strip, screenshot panel, timeline, and inspector;
- invoice-to-legacy-portal target fixtures with approval and prompt-injection cases;
- real smoke eval that writes `runs/latest/metrics.json` and `runs/latest/smoke-form/trace.jsonl`;
- baseline-vs-TracePilot comparison suite with JSON and Markdown artifacts;
- failure diagnosis casebook that maps eval outcomes to post-training, grader, safety, and harness interventions.
- model-run cost ledger that separates scripted controls, fixture estimates, and future paid model API runs.
- env-gated model-run readiness manifest that explains why a paid model call did or did not execute without leaking credentials.

Next build slices:

1. Injected real model decision client using the readiness manifest and cost ledger's `model_api` reporting path.
2. Video walkthrough package.
3. Larger failure taxonomy with repeated runs per task.

## Run Locally

```bash
corepack pnpm@9.15.4 install
corepack pnpm@9.15.4 run ci
corepack pnpm@9.15.4 run eval -- --suite smoke
corepack pnpm@9.15.4 run eval -- --suite invoice
corepack pnpm@9.15.4 run eval -- --suite comparison
corepack pnpm@9.15.4 run eval -- --suite cost-ledger
corepack pnpm@9.15.4 run eval -- --suite model-readiness
corepack pnpm@9.15.4 --filter @tracepilot/studio dev
```

Expected smoke output:

```text
smoke-form success=true steps=2
```

Expected invoice output:

```text
invoice success=true portal=true approval=true injection=true
```

Expected comparison output:

```text
comparison success_delta=75.0% false_completion_delta=-50.0% report=... diagnosis=...
```

Expected cost-ledger output:

```text
cost-ledger model_runs=1 scripted_controls=1 total_cost_usd=0.30975 source=model_fixture ledger=... report=...
```

The cost-ledger suite uses fixture token usage only. It does not make a paid model call; future `model_api` runs must be reported separately.

Expected model-readiness output:

```text
model-readiness status=skipped_paid_runs_disabled source=dry_run paid_call=false manifest=... report=...
```

The model-readiness suite writes an env-gated manifest. By default it does not make a paid model call, even if an API key is present; paid runs require `TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1` and a configured model decision client.

## Docs

- [Design Spec](docs/superpowers/specs/2026-06-26-tracepilot-design.md)
- [Implementation Plan](docs/superpowers/plans/2026-06-26-tracepilot-implementation-plan.md)
- [Eval Plan](docs/eval-plan.md)
- [First Report](docs/results/first-report.md)
- [Baseline Comparison](docs/results/baseline-comparison.md)
- [Failure Diagnosis](docs/results/failure-diagnosis.md)
- [Model Cost Ledger](docs/results/model-cost-ledger.md)
- [Model Run Readiness](docs/results/model-readiness.md)
- [Hiring Positioning](docs/hiring-positioning.md)
- [Video Walkthrough Script](docs/video-walkthrough-script.md)
- [Security Model](SECURITY.md)

## License

MIT.
