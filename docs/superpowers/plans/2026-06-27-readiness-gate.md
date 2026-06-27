# Readiness Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a machine-readable readiness gate that turns TracePilot scorecards into a pass/warn/fail/blocked decision with confidence intervals, threshold evidence, and Markdown reporting.

**Architecture:** The core package owns reusable statistical and gate-decision logic. The eval layer runs or consumes the reliability and provider scorecards, applies the core gate rules, and writes JSON/Markdown artifacts. The CLI exposes `--suite readiness-gate`, and docs explain that the gate is operational evidence rather than a model-quality ranking.

**Tech Stack:** TypeScript, pnpm 9.15.4, Vitest, existing TracePilot eval runners, no new runtime dependencies.

---

### Task 1: Core Readiness Gate Types And Tests

**Files:**
- Create: `packages/core/src/readiness-gate.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/readiness-gate.test.ts`

- [ ] **Step 1: Write failing tests for Wilson intervals and strict pass decisions**

Add tests that import `evaluateReadinessGate`, `wilsonInterval`, and `renderReadinessGateMarkdown` from `../src/readiness-gate.js`.

The first test should assert:

```ts
const interval = wilsonInterval({ successes: 18, runs: 20, confidence: 0.95 });
expect(interval.lower).toBeGreaterThan(0.69);
expect(interval.upper).toBeLessThan(0.99);
expect(interval.confidence).toBe(0.95);
```

The second test should build a `GateInput` with:

```ts
reliability: {
  suiteId: "reliability-scorecard",
  status: "executed",
  runs: 50,
  successes: 50,
  falseCompletions: 0,
  stuckLoops: 0,
  unsafeBlocks: 4,
  humanApprovals: 4,
  totalCostUsd: 0,
  warnings: []
},
provider: {
  suiteId: "provider-scorecard",
  status: "executed",
  plannedRuns: 50,
  executedRuns: 50,
  paidCalls: 50,
  successes: 50,
  falseCompletions: 0,
  stuckLoops: 0,
  unsafeBlocks: 2,
  totalCostUsd: 0.42,
  warnings: []
}
```

Use thresholds:

```ts
{
  confidence: 0.95,
  minReliabilityRuns: 5,
  minProviderRuns: 6,
  minSuccessRate: 0.75,
  maxFalseCompletionRate: 0.1,
  maxStuckLoopRate: 0.1,
  maxCostUsd: 1
}
```

Expect `decision` to be `"pass"`, `summary.highestSeverity` to be `"pass"`, and the Markdown report to contain `# Readiness Gate`, `Decision: \`pass\``, and `Provider evidence`.

- [ ] **Step 2: Write failing tests for blocked dry-run provider evidence**

Add a test where reliability has 5/5 successes but provider has:

```ts
status: "skipped_paid_runs_disabled",
plannedRuns: 6,
executedRuns: 0,
paidCalls: 0,
successes: 0
```

Expect `decision` to be `"blocked"`, a rule id `provider-executed-runs`, and Markdown text explaining that provider runs were not executed.

- [ ] **Step 3: Write failing tests for failure severity ordering**

Add a test where reliability has `successes: 2`, `runs: 5`, `falseCompletions: 2`, and `stuckLoops: 1`.

Expect:
- decision `"fail"`;
- a `success-rate` rule with severity `"fail"`;
- a `false-completion-rate` rule with severity `"fail"`;
- `summary.highestSeverity` `"fail"`.

- [ ] **Step 4: Run the core test and verify RED**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/core test -- readiness-gate.test.ts
```

Expected: FAIL because `readiness-gate.ts` does not exist or exports are missing.

### Task 2: Core Readiness Gate Implementation

**Files:**
- Create: `packages/core/src/readiness-gate.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/readiness-gate.test.ts`

- [ ] **Step 1: Implement exported types**

Create:

```ts
export type ReadinessGateDecision = "pass" | "warn" | "fail" | "blocked";
export type ReadinessGateSeverity = ReadinessGateDecision;
export type ReadinessGateRuleId =
  | "reliability-runs"
  | "reliability-success-rate"
  | "reliability-false-completion-rate"
  | "reliability-stuck-loop-rate"
  | "provider-executed-runs"
  | "provider-success-rate"
  | "provider-false-completion-rate"
  | "provider-stuck-loop-rate"
  | "provider-cost";
```

Add input types for reliability and provider evidence with only numeric fields needed by the gate, so eval suites can map from their existing summaries.

- [ ] **Step 2: Implement `wilsonInterval`**

Use the two-sided Wilson interval with a z-score chosen from confidence:

```ts
const zScores = new Map([
  [0.8, 1.2815515655446004],
  [0.9, 1.6448536269514722],
  [0.95, 1.959963984540054],
  [0.99, 2.5758293035489004]
]);
```

For zero runs, return `{ lower: 0, upper: 0, point: 0, confidence }`.

- [ ] **Step 3: Implement `evaluateReadinessGate`**

Evaluate these rules:
- reliability run count must be at least `minReliabilityRuns`;
- reliability success lower bound must be at least `minSuccessRate`;
- reliability false-completion upper bound must be at most `maxFalseCompletionRate`;
- reliability stuck-loop upper bound must be at most `maxStuckLoopRate`;
- provider status must be `"executed"` and executed runs at least `minProviderRuns`;
- provider success lower bound must be at least `minSuccessRate` only when provider runs executed;
- provider false-completion and stuck-loop upper bounds must stay under thresholds when provider runs executed;
- provider total cost must be at most `maxCostUsd` when provider runs executed.

Decision priority:

```ts
blocked > fail > warn > pass
```

Use `"warn"` for low sample-size pass cases where the point estimate passes but the confidence bound does not. Use `"fail"` when the point estimate itself violates the threshold.

- [ ] **Step 4: Implement `renderReadinessGateMarkdown`**

Markdown sections:
- title and generated timestamp;
- summary table;
- threshold table;
- reliability evidence;
- provider evidence;
- rule outcomes;
- warnings.

The report must not include API keys and should not mention provider quality rankings.

- [ ] **Step 5: Export from `packages/core/src/index.ts`**

Add:

```ts
export * from "./readiness-gate.js";
```

- [ ] **Step 6: Run the core tests and verify GREEN**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/core test -- readiness-gate.test.ts
```

Expected: PASS.

### Task 3: Eval Suite Red Tests

**Files:**
- Create: `evals/readiness-gate-suite.ts`
- Create: `evals/readiness-gate-suite.test.ts`
- Modify: `evals/run-evals.ts`
- Modify: `evals/run-evals-cli.test.ts`

- [ ] **Step 1: Write failing suite test for default readiness gate**

Add a test that runs:

```ts
const result = await runReadinessGateSuite({
  runsDir,
  generatedAt: "2026-06-27T00:00:00.000Z",
  reliabilityRepetitions: 1,
  providerEnv: {
    OPENAI_API_KEY: "test-openai-key",
    ANTHROPIC_API_KEY: "test-anthropic-key",
    TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
  }
});
```

Expect:
- reliability evidence has 5 runs and 5 successes;
- provider evidence has 6 planned runs, 0 executed runs, and 0 paid calls;
- decision is `"blocked"` because provider evidence is dry-run only;
- artifacts include `readiness-gate.json`, `readiness-gate.md`, and `readiness-inputs.json`;
- artifacts do not contain `test-openai-key` or `test-anthropic-key`;
- Markdown contains `Provider evidence` and `provider-executed-runs`.

- [ ] **Step 2: Write failing suite test for injected executed provider evidence**

Allow the suite to accept precomputed summaries:

```ts
providerSummary: {
  suiteId: "provider-scorecard",
  status: "executed",
  plannedRuns: 12,
  executedRuns: 12,
  paidCalls: 12,
  successes: 12,
  falseCompletions: 0,
  stuckLoops: 0,
  unsafeBlocks: 2,
  totalCostUsd: 0.4,
  warnings: []
}
```

Expect decision `"pass"` or `"warn"` depending on confidence lower bound. Use `minSuccessRate: 0.7` and `minProviderRuns: 6` so it passes deterministically.

- [ ] **Step 3: Write failing CLI test**

Add a CLI test:

```ts
corepack pnpm@9.15.4 exec tsx evals/run-evals.ts -- --suite readiness-gate
```

with fake keys and `TRACEPILOT_ENABLE_PAID_MODEL_RUNS=0`.

Expect stdout:

```text
readiness-gate decision=blocked reliability_runs=5 provider_executed_runs=0
```

and ensure fake keys are absent.

- [ ] **Step 4: Run focused tests and verify RED**

Run:

```bash
corepack pnpm@9.15.4 exec vitest run evals/readiness-gate-suite.test.ts evals/run-evals-cli.test.ts
```

Expected: FAIL because the new suite and CLI branch do not exist yet.

### Task 4: Eval Suite Implementation

**Files:**
- Create: `evals/readiness-gate-suite.ts`
- Modify: `evals/run-evals.ts`
- Test: `evals/readiness-gate-suite.test.ts`
- Test: `evals/run-evals-cli.test.ts`

- [ ] **Step 1: Implement `runReadinessGateSuite`**

The suite should:
- remove and recreate `runsDir`;
- run `runReliabilityScorecardSuite` into `runsDir/reliability-scorecard` unless a reliability summary is injected;
- run `runProviderScorecardSuite` into `runsDir/provider-scorecard` unless a provider summary is injected;
- map summaries into core `GateInput`;
- call `evaluateReadinessGate`;
- write `readiness-inputs.json`, `readiness-gate.json`, and `readiness-gate.md`;
- return `{ gate, inputs, artifacts }`.

- [ ] **Step 2: Add CLI branch**

Accept `readiness-gate` in the suite validator and route it to:

```ts
runReadinessGateSuite({
  runsDir: join(process.cwd(), "runs", "latest", "readiness-gate"),
  ...(values.repetitions === undefined ? {} : { reliabilityRepetitions: parsePositiveInteger("repetitions", values.repetitions) })
})
```

Print:

```text
readiness-gate decision=<decision> reliability_runs=<n> provider_executed_runs=<n> report=<path>
```

- [ ] **Step 3: Run focused tests and verify GREEN**

Run:

```bash
corepack pnpm@9.15.4 exec vitest run evals/readiness-gate-suite.test.ts evals/run-evals-cli.test.ts
```

Expected: PASS.

### Task 5: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/eval-plan.md`
- Modify: `docs/results/first-report.md`
- Create: `docs/results/readiness-gate.md`
- Modify: `docs/hiring-positioning.md`
- Modify: `docs/video-walkthrough-script.md`

- [ ] **Step 1: README**

Add `readiness-gate` to local commands and describe expected output:

```text
readiness-gate decision=blocked reliability_runs=5 provider_executed_runs=0 report=...
```

Explain that dry-run provider evidence blocks deployment readiness instead of pretending to rank providers.

- [ ] **Step 2: Eval plan**

Add the suite row and artifact list:
- `runs/latest/readiness-gate/readiness-inputs.json`;
- `runs/latest/readiness-gate/readiness-gate.json`;
- `runs/latest/readiness-gate/readiness-gate.md`.

- [ ] **Step 3: Results page**

Create a concise report explaining:
- default gate command;
- current expected dry-run decision;
- thresholds;
- artifacts;
- interpretation boundaries.

- [ ] **Step 4: Hiring positioning and walkthrough**

Add one paragraph/bullet explaining that TracePilot now turns evals into release-style readiness decisions with confidence bounds.

- [ ] **Step 5: Test-count docs**

After final tests, update any documented test count from 99 to the verified count.

### Task 6: Verification And Security Hygiene

**Files:**
- All touched files.

- [ ] **Step 1: Focused tests**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/core test -- readiness-gate.test.ts
corepack pnpm@9.15.4 exec vitest run evals/readiness-gate-suite.test.ts evals/run-evals-cli.test.ts
```

- [ ] **Step 2: Typecheck**

Run:

```bash
corepack pnpm@9.15.4 run typecheck
```

- [ ] **Step 3: Full test suite**

Run:

```bash
corepack pnpm@9.15.4 run test
```

- [ ] **Step 4: Build**

Run:

```bash
corepack pnpm@9.15.4 run build
```

If `apps/studio/next-env.d.ts` flips between dev and prod generated route types, restore the repository baseline before staging.

- [ ] **Step 5: End-to-end evals**

Run:

```bash
corepack pnpm@9.15.4 run eval -- --suite readiness-gate
env TRACEPILOT_ENABLE_PAID_MODEL_RUNS=0 OPENAI_API_KEY=test-openai-key ANTHROPIC_API_KEY=test-anthropic-key corepack pnpm@9.15.4 run eval -- --suite readiness-gate
```

- [ ] **Step 6: Diff and secret checks**

Run:

```bash
git diff --check
secret_pattern='s''k-proj-|s''k-ant-|OPENAI_API_KEY=.*s''k-|ANTHROPIC_API_KEY=.*s''k-'
rg -l "$secret_pattern" README.md docs/eval-plan.md docs/hiring-positioning.md docs/results docs/video-walkthrough-script.md evals packages
rg -l "test-openai-key|test-anthropic-key" runs/latest/readiness-gate
```

Expected: no secret-pattern matches and no fake-key matches in artifacts.

### Task 7: Finish Branch

**Files:**
- All touched files.

- [ ] **Step 1: Review diff**

Run:

```bash
git diff --stat
git diff -- README.md docs/eval-plan.md docs/results/readiness-gate.md evals/readiness-gate-suite.ts packages/core/src/readiness-gate.ts
```

- [ ] **Step 2: Commit**

Run:

```bash
git add README.md docs/eval-plan.md docs/results/first-report.md docs/results/readiness-gate.md docs/hiring-positioning.md docs/video-walkthrough-script.md evals/readiness-gate-suite.ts evals/readiness-gate-suite.test.ts evals/run-evals.ts evals/run-evals-cli.test.ts packages/core/src/readiness-gate.ts packages/core/src/index.ts packages/core/test/readiness-gate.test.ts
git commit -m "feat: add readiness gate suite"
```

- [ ] **Step 3: Push and PR**

Run:

```bash
git push -u origin feat/readiness-gate
gh pr create --base main --head feat/readiness-gate --title "Add readiness gate suite" --body "$(cat <<'EOF'
## Summary
- Add a readiness gate over reliability and provider scorecards with confidence-bound rules.
- Write JSON and Markdown readiness artifacts without recording provider secrets.
- Document the new operational gate and its dry-run blocking behavior.

## Test Plan
- corepack pnpm@9.15.4 --filter @tracepilot/core test -- readiness-gate.test.ts
- corepack pnpm@9.15.4 exec vitest run evals/readiness-gate-suite.test.ts evals/run-evals-cli.test.ts
- corepack pnpm@9.15.4 run ci
- corepack pnpm@9.15.4 run build
- corepack pnpm@9.15.4 run eval -- --suite readiness-gate
- secret-pattern scans over changed files and generated readiness artifacts
EOF
)"
```

- [ ] **Step 4: Wait for CI and merge**

Run:

```bash
gh pr checks --watch --fail-fast
gh pr merge --merge --delete-branch
```

If local worktree checkout causes `main is already used by worktree`, verify the PR state, then update local main and clean up manually.

- [ ] **Step 5: Cleanup**

Run from the main repo:

```bash
git pull --ff-only
git worktree remove .worktrees/feat-readiness-gate
git worktree prune
git branch -d feat/readiness-gate
git push origin --delete feat/readiness-gate
git status --short --branch
```

Preserve unrelated pre-existing untracked files such as `.cursor/`.
