# Studio Model Step Evidence Plan

Date: 2026-06-27

## Goal

Make TracePilot Studio useful for debugging real paid browser-control runs by surfacing per-step model API metadata, run-level model cost, budget stops, and driver decision failures directly in the trace replay UI.

This slice should prove that TracePilot does more than replay screenshots. A reviewer should be able to open a clean clone, inspect a representative negative model-browser run, and immediately see:

- which provider/model produced each decision;
- token usage, reasoning-token count, latency, pricing, and cost for a selected model step;
- total run cost and whether the run stopped because of a budget;
- where a driver decision failed and what recovery evidence the harness preserved;
- how those details connect to the model-browser paid-run report.

## Constraints

- Keep the feature scoped to Studio trace replay and committed fixtures.
- Do not write or commit API keys, local `.env` files, generated screenshots, or paid-run artifacts.
- Preserve the existing trace schema; `decision.modelRun`, `tokenCostUsd`, `totalCostUsd`, and `budgetExceeded` already exist.
- Keep UI density appropriate for a reliability/debugging product.
- Use TDD: write failing Studio tests before implementation.
- Verify with automated tests, typecheck, build, CI, a secret scan, and browser QA.

## Long Checklist

### 1. Baseline and Orientation

- [ ] Confirm the feature worktree is on `feat/studio-model-step-evidence`.
- [ ] Confirm the worktree starts clean.
- [ ] Read the current run page, metrics strip, timeline, launcher, trace fixtures loader, Studio tests, CSS, and trace types.
- [ ] Confirm `RunMetrics.totalCostUsd` and `RunMetrics.budgetExceeded` are already typed.
- [ ] Confirm `TraceStep.decision.modelRun` and `TraceStep.tokenCostUsd` are already typed.
- [ ] Confirm the harness already converts driver errors into trace failures.
- [ ] Confirm docs already describe the negative paid model-browser run.

### 2. Red Tests

- [ ] Add launcher coverage that expects the negative model-browser fixture to appear.
- [ ] Add route coverage for `/runs/model-browser-negative`.
- [ ] Assert the model evidence panel title renders.
- [ ] Assert the OpenAI model name renders.
- [ ] Assert the `model_api` source renders.
- [ ] Assert total model cost renders as a precise USD value.
- [ ] Assert the budget-exceeded state renders.
- [ ] Assert driver failure evidence renders.
- [ ] Assert selected step query support renders per-step token evidence for a model-backed step.
- [ ] Run the focused Studio test and confirm it fails for the new missing fixture/UI.

### 3. Fixture Evidence

- [ ] Add a committed `model-browser-negative` fixture directory.
- [ ] Add `metrics.json` with a failed model-browser run, total cost, duration, step count, and budget-exceeded state.
- [ ] Add a line-delimited `trace.jsonl` with multiple model-backed steps.
- [ ] Include `decision.modelRun.source = "model_api"` on model-backed steps.
- [ ] Include provider, model, resolved model, token usage, pricing, latency, reasoning tokens, and cost metadata.
- [ ] Include `tokenCostUsd` on model-backed trace steps.
- [ ] Include a synthetic driver failure step with a recovery hint.
- [ ] Add a committed SVG observation fixture that looks like a legacy portal/focus-recovery failure.
- [ ] Keep fixture content secret-free and deterministic.

### 4. Studio Data Loading

- [ ] Add the negative run to `listRuns()`.
- [ ] Give it a recruiter-readable title and description.
- [ ] Add a title mapping in `loadRun()` so the run page has human-friendly copy.
- [ ] Keep fixture loading parallel and simple.
- [ ] Avoid generated artifact loading in this slice unless tests prove it is needed.

### 5. Metrics Strip

- [ ] Add total model cost to the metrics strip.
- [ ] Add budget state to the metrics strip.
- [ ] Format USD values consistently.
- [ ] Ensure zero-cost deterministic runs still read cleanly.
- [ ] Adjust grid sizing so eight metrics do not feel cramped.
- [ ] Keep mobile layout single-column via existing responsive rules.

### 6. Timeline Evidence

- [ ] Add compact badges for `model_api` steps.
- [ ] Add compact badges for per-step cost when present.
- [ ] Add compact badges for driver decision failures.
- [ ] Preserve the existing selected-step behavior.
- [ ] Keep timeline rows stable and readable on desktop.
- [ ] Ensure long verifier text wraps without breaking layout.

### 7. Model Evidence Panel

- [ ] Create a focused Studio component for model evidence.
- [ ] Summarize model-backed step count.
- [ ] Summarize provider/model pairs.
- [ ] Summarize total input tokens.
- [ ] Summarize total output tokens.
- [ ] Summarize reasoning tokens.
- [ ] Summarize model-decision latency.
- [ ] Summarize driver failure count.
- [ ] Show budget state from run metrics.
- [ ] Show selected-step source/provider/model/resolved model.
- [ ] Show selected-step usage and pricing.
- [ ] Show selected-step cost and latency.
- [ ] Show selected-step reasoning tokens.
- [ ] Show a clear empty state for non-model steps.
- [ ] Show driver failure details for synthetic failure steps.
- [ ] Keep the panel server-rendered and dependency-light.

### 8. Route Composition

- [ ] Import the model evidence panel into `/runs/[runId]`.
- [ ] Place it in the inspector column near the selected-step details.
- [ ] Keep screenshot and timeline as the primary replay surface.
- [ ] Keep the latest-step reset link behavior unchanged.
- [ ] Verify `?step=1` still selects the requested step.

### 9. Styling

- [ ] Add compact evidence-grid styles.
- [ ] Add row styles for label/value evidence.
- [ ] Add timeline badge styles.
- [ ] Add warning/failure styles that reuse existing color tokens.
- [ ] Avoid nested cards.
- [ ] Avoid one-note color drift.
- [ ] Verify mobile wrapping and no text overlap.

### 10. Documentation

- [ ] Update repository status in `README.md`.
- [ ] Update next-build slices so completed Studio surfacing is no longer listed as future work.
- [ ] Update the first report `What Works` section.
- [ ] Update the Studio/readiness/product narrative where relevant.
- [ ] Update the video walkthrough script to include the model-browser negative trace in Studio.
- [ ] Keep docs sober and evidence-based.

### 11. Automated Verification

- [ ] Run focused Studio tests after implementation.
- [ ] Run all Studio tests.
- [ ] Run typecheck.
- [ ] Run all tests.
- [ ] Run build.
- [ ] Run CI.
- [ ] Inspect `git diff`.
- [ ] Restore generated Next metadata if build rewrites it.
- [ ] Run a secret scan over committed paths.

### 12. Browser QA

- [ ] Read and follow the Browser skill if using the in-app Browser plugin.
- [ ] Start Studio on a non-conflicting local port.
- [ ] Define the target flow.
- [ ] Open `/runs/model-browser-negative`.
- [ ] Confirm page title and URL.
- [ ] Confirm the page is not blank.
- [ ] Confirm no Next.js/framework overlay.
- [ ] Confirm no relevant console errors.
- [ ] Confirm the model evidence panel renders.
- [ ] Confirm budget-exceeded evidence renders.
- [ ] Confirm driver failure evidence renders on latest step.
- [ ] Open `/runs/model-browser-negative?step=1`.
- [ ] Confirm selected-step token/cost/model details render.
- [ ] Exercise a timeline step link and verify selected-step state changes.
- [ ] Capture a desktop screenshot outside the repo.
- [ ] Capture a mobile screenshot outside the repo.
- [ ] Check for layout clipping, overlap, unreadable text, and broken responsive wrapping.

### 13. Finish

- [ ] Review the final diff.
- [ ] Commit with a focused message.
- [ ] Push the branch.
- [ ] Open a PR with verification evidence.
- [ ] Wait for PR checks.
- [ ] Merge after checks pass.
- [ ] Update local `main`.
- [ ] Remove the feature worktree.
- [ ] Leave the main repo clean except for pre-existing unrelated files.
- [ ] Restart or confirm the local Studio server points at merged code.

## Acceptance Criteria

- A clean clone can open `/runs/model-browser-negative` and inspect paid-model-style browser-control failure evidence without running paid calls.
- Studio shows per-step model API metadata and selected-step driver failure details.
- Tests prove the launcher and route behavior.
- Docs accurately state the new capability and preserve the limitations around paid provider evidence.
- No secrets are committed.
- Full automated verification and browser QA pass.
