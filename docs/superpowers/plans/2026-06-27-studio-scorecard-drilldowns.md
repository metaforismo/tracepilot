# Studio Scorecard Drilldowns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add artifact-backed Studio scorecard drilldowns for provider and reliability evals so readiness decisions can be inspected through real generated evidence, row details, and safe fixture fallback.

**Architecture:** Studio gets a focused scorecard artifact loader that first reads ignored local artifacts from `runs/latest` (or `TRACEPILOT_STUDIO_RUNS_DIR`) and falls back to committed fixtures under `apps/studio/fixtures/scorecards`. Two server-rendered Next.js routes, `/scorecards/provider` and `/scorecards/reliability`, render summaries, grouped tables, run rows, source metadata, and warnings. Existing readiness and launcher navigation link into these drilldowns.

**Tech Stack:** TypeScript, pnpm 9.15.4, Next.js 16 App Router, React 19 server components, Vitest, Playwright, existing TracePilot eval artifact JSON, no new runtime dependencies.

---

### Task 1: Baseline And Artifact Map

**Files:**
- Read: `evals/provider-scorecard-suite.ts`
- Read: `evals/reliability-scorecard-suite.ts`
- Read: `apps/studio/app/readiness/page.tsx`
- Read: `apps/studio/test/studio.test.ts`
- Read: `apps/studio/app/globals.css`

- [x] **Step 1: Create isolated worktree**

Run:

```bash
git worktree add .worktrees/studio-scorecard-drilldowns -b feat/studio-scorecard-drilldowns
```

Expected: worktree exists on `feat/studio-scorecard-drilldowns`.

- [x] **Step 2: Install dependencies**

Run:

```bash
corepack pnpm@9.15.4 install
```

Expected: dependencies install and lockfile remains unchanged.

- [x] **Step 3: Run baseline tests**

Run:

```bash
corepack pnpm@9.15.4 run test
```

Expected: all package tests and eval tests pass before code changes.

- [x] **Step 4: Confirm artifact boundary**

Observation: `runs/*` is ignored and not tracked. Studio must read generated `runs/latest/...` artifacts when present, but fresh clones and CI need committed fixtures.

### Task 2: Red Tests For Scorecard Loader

**Files:**
- Create: `apps/studio/test/scorecard-artifacts.test.ts`

- [x] **Step 1: Write failing loader fallback test**

Create `apps/studio/test/scorecard-artifacts.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadProviderScorecard, loadReliabilityScorecard } from "../lib/scorecard-artifacts";

describe("scorecard artifact loaders", () => {
  it("falls back to committed scorecard fixtures when runs artifacts are missing", async () => {
    const emptyRunsRoot = await mkdtemp(join(tmpdir(), "tracepilot-empty-runs-"));

    const provider = await loadProviderScorecard({ runsRoot: emptyRunsRoot });
    const reliability = await loadReliabilityScorecard({ runsRoot: emptyRunsRoot });

    expect(provider.source.kind).toBe("fixture");
    expect(provider.summary.suiteId).toBe("provider-scorecard");
    expect(provider.rows).toHaveLength(6);
    expect(provider.rows[0]?.provider).toBe("openai");
    expect(reliability.source.kind).toBe("fixture");
    expect(reliability.summary.suiteId).toBe("reliability-scorecard");
    expect(reliability.results).toHaveLength(5);
  });
});
```

Expected: FAIL because `../lib/scorecard-artifacts` does not exist.

- [x] **Step 2: Write failing generated-artifact precedence test**

Append to the same describe block:

```ts
it("prefers generated runs artifacts when both generated artifacts and fixtures exist", async () => {
  const runsRoot = await mkdtemp(join(tmpdir(), "tracepilot-runs-"));
  const providerDir = join(runsRoot, "provider-scorecard");
  const reliabilityDir = join(runsRoot, "reliability-scorecard");
  await mkdir(providerDir, { recursive: true });
  await mkdir(reliabilityDir, { recursive: true });

  await writeFile(join(providerDir, "provider-scorecard.json"), JSON.stringify({
    suiteId: "provider-scorecard",
    status: "executed",
    generatedAt: "2026-06-27T01:00:00.000Z",
    repetitions: 1,
    paidCalls: 1,
    plannedRuns: 1,
    executedRuns: 1,
    skippedRuns: 0,
    successes: 1,
    successRate: 1,
    falseCompletions: 0,
    falseCompletionRate: 0,
    stuckLoops: 0,
    stuckLoopRate: 0,
    unsafeBlocks: 0,
    unsafeBlockRate: 0,
    humanApprovals: 0,
    humanApprovalRate: 0,
    medianStepsPerSuccessfulRun: 9,
    totalCostUsd: 0.0123,
    providers: [],
    tasks: [],
    warnings: []
  }), "utf8");
  await writeFile(join(providerDir, "provider-results.json"), JSON.stringify([
    {
      provider: "openai",
      taskId: "legacy-portal",
      attempt: 1,
      status: "executed",
      paidCall: true,
      model: "gpt-5.4",
      success: true,
      falseCompletion: false,
      stuckLoop: false,
      unsafeBlocked: false,
      humanApprovals: 0,
      budgetExceeded: false,
      steps: 9,
      totalCostUsd: 0.0123,
      maxCostUsd: 0.5,
      warnings: []
    }
  ]), "utf8");
  await writeFile(join(reliabilityDir, "reliability-scorecard.json"), JSON.stringify({
    suiteId: "reliability-scorecard",
    generatedAt: "2026-06-27T01:00:00.000Z",
    repetitions: 1,
    totalRuns: 1,
    successes: 1,
    successRate: 1,
    falseCompletions: 0,
    falseCompletionRate: 0,
    stuckLoops: 0,
    stuckLoopRate: 0,
    unsafeBlocks: 0,
    unsafeBlockRate: 0,
    humanApprovals: 0,
    humanApprovalRate: 0,
    medianStepsPerSuccessfulRun: 9,
    medianDurationMs: 500,
    totalCostUsd: 0,
    costPerSuccessfulRunUsd: 0,
    cases: [],
    warnings: []
  }), "utf8");
  await writeFile(join(reliabilityDir, "reliability-results.json"), JSON.stringify([
    {
      suiteId: "reliability-scorecard",
      caseId: "happy-path-portal-entry",
      mode: "tracepilot",
      taskId: "happy-path-portal-entry-attempt-1",
      metrics: {
        runId: "happy-path-portal-entry-attempt-1",
        taskId: "happy-path-portal-entry-attempt-1",
        success: true,
        steps: 9,
        falseCompletion: false,
        stuckLoop: false,
        unsafeBlocked: false,
        humanApprovals: 0,
        totalCostUsd: 0,
        durationMs: 500
      }
    }
  ]), "utf8");

  const provider = await loadProviderScorecard({ runsRoot });
  const reliability = await loadReliabilityScorecard({ runsRoot });

  expect(provider.source.kind).toBe("runs_latest");
  expect(provider.summary.status).toBe("executed");
  expect(provider.rows[0]?.model).toBe("gpt-5.4");
  expect(reliability.source.kind).toBe("runs_latest");
  expect(reliability.summary.totalRuns).toBe(1);
});
```

- [x] **Step 3: Verify RED**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/studio test -- scorecard-artifacts.test.ts
```

Expected: FAIL because the loader module is missing.

### Task 3: Scorecard Fixtures And Loader

**Files:**
- Create: `apps/studio/fixtures/scorecards/provider-scorecard.json`
- Create: `apps/studio/fixtures/scorecards/provider-results.json`
- Create: `apps/studio/fixtures/scorecards/reliability-scorecard.json`
- Create: `apps/studio/fixtures/scorecards/reliability-results.json`
- Create: `apps/studio/lib/scorecard-artifacts.ts`

- [x] **Step 1: Add provider scorecard summary fixture**

Create `apps/studio/fixtures/scorecards/provider-scorecard.json` with:

```json
{
  "suiteId": "provider-scorecard",
  "status": "skipped_paid_runs_disabled",
  "generatedAt": "2026-06-27T00:00:00.000Z",
  "repetitions": 1,
  "paidCalls": 0,
  "plannedRuns": 6,
  "executedRuns": 0,
  "skippedRuns": 6,
  "successes": 0,
  "successRate": 0,
  "falseCompletions": 0,
  "falseCompletionRate": 0,
  "stuckLoops": 0,
  "stuckLoopRate": 0,
  "unsafeBlocks": 0,
  "unsafeBlockRate": 0,
  "humanApprovals": 0,
  "humanApprovalRate": 0,
  "medianStepsPerSuccessfulRun": 0,
  "totalCostUsd": 0,
  "providers": [
    {
      "provider": "openai",
      "plannedRuns": 3,
      "executedRuns": 0,
      "skippedRuns": 3,
      "successes": 0,
      "successRate": 0,
      "falseCompletions": 0,
      "falseCompletionRate": 0,
      "stuckLoops": 0,
      "stuckLoopRate": 0,
      "unsafeBlocks": 0,
      "unsafeBlockRate": 0,
      "humanApprovals": 0,
      "humanApprovalRate": 0,
      "medianStepsPerSuccessfulRun": 0,
      "totalCostUsd": 0
    },
    {
      "provider": "anthropic",
      "plannedRuns": 3,
      "executedRuns": 0,
      "skippedRuns": 3,
      "successes": 0,
      "successRate": 0,
      "falseCompletions": 0,
      "falseCompletionRate": 0,
      "stuckLoops": 0,
      "stuckLoopRate": 0,
      "unsafeBlocks": 0,
      "unsafeBlockRate": 0,
      "humanApprovals": 0,
      "humanApprovalRate": 0,
      "medianStepsPerSuccessfulRun": 0,
      "totalCostUsd": 0
    }
  ],
  "tasks": [
    {
      "taskId": "legacy-portal",
      "plannedRuns": 2,
      "executedRuns": 0,
      "skippedRuns": 2,
      "successes": 0,
      "successRate": 0,
      "falseCompletions": 0,
      "falseCompletionRate": 0,
      "stuckLoops": 0,
      "stuckLoopRate": 0,
      "unsafeBlocks": 0,
      "unsafeBlockRate": 0,
      "humanApprovals": 0,
      "humanApprovalRate": 0,
      "medianStepsPerSuccessfulRun": 0,
      "totalCostUsd": 0
    },
    {
      "taskId": "modal-interruption",
      "plannedRuns": 2,
      "executedRuns": 0,
      "skippedRuns": 2,
      "successes": 0,
      "successRate": 0,
      "falseCompletions": 0,
      "falseCompletionRate": 0,
      "stuckLoops": 0,
      "stuckLoopRate": 0,
      "unsafeBlocks": 0,
      "unsafeBlockRate": 0,
      "humanApprovals": 0,
      "humanApprovalRate": 0,
      "medianStepsPerSuccessfulRun": 0,
      "totalCostUsd": 0
    },
    {
      "taskId": "prompt-injection",
      "plannedRuns": 2,
      "executedRuns": 0,
      "skippedRuns": 2,
      "successes": 0,
      "successRate": 0,
      "falseCompletions": 0,
      "falseCompletionRate": 0,
      "stuckLoops": 0,
      "stuckLoopRate": 0,
      "unsafeBlocks": 0,
      "unsafeBlockRate": 0,
      "humanApprovals": 0,
      "humanApprovalRate": 0,
      "medianStepsPerSuccessfulRun": 0,
      "totalCostUsd": 0
    }
  ],
  "warnings": [
    "Paid provider scorecard runs are disabled; set TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1 to execute OpenAI and Anthropic browser runs."
  ]
}
```

- [x] **Step 2: Add provider row fixture**

Create `apps/studio/fixtures/scorecards/provider-results.json` with six rows: OpenAI and Anthropic across `legacy-portal`, `modal-interruption`, and `prompt-injection`, all `status: "skipped_paid_runs_disabled"`, `paidCall: false`, model names `gpt-5.4-nano` and `claude-sonnet-4-6`, zero cost, and the paid-runs-disabled warning.

- [x] **Step 3: Add reliability summary fixture**

Create `apps/studio/fixtures/scorecards/reliability-scorecard.json` with five deterministic cases, 5 total runs, 5 successes, 0 false completions, 0 stuck loops, one unsafe block, one human approval, and per-case rows for the five hard workflows.

- [x] **Step 4: Add reliability results fixture**

Create `apps/studio/fixtures/scorecards/reliability-results.json` with five `EvalCaseResult` rows matching the summary cases. Each row should include minimal `metrics` fields: `runId`, `taskId`, `success`, `steps`, `falseCompletion`, `stuckLoop`, `unsafeBlocked`, `humanApprovals`, `totalCostUsd`, and `durationMs`.

- [x] **Step 5: Implement local types and loader helpers**

Create `apps/studio/lib/scorecard-artifacts.ts` with exported types:

```ts
export type ScorecardSourceKind = "runs_latest" | "fixture";
export type ScorecardSource = { kind: ScorecardSourceKind; root: string; summaryPath: string; rowsPath: string };
export type ProviderScorecardArtifact = { source: ScorecardSource; summary: ProviderScorecardSummary; rows: ProviderScorecardRow[] };
export type ReliabilityScorecardArtifact = { source: ScorecardSource; summary: ReliabilityScorecardSummary; results: ReliabilityScorecardResult[] };
```

Use local structural types for provider summaries, provider rows, reliability summaries, reliability cases, and reliability results. Do not import from `evals/*` into Studio.

- [x] **Step 6: Implement `loadProviderScorecard`**

The function should:
- accept optional `{ runsRoot?: string; fixtureRoot?: string }`;
- compute default `runsRoot` from `TRACEPILOT_STUDIO_RUNS_DIR` or `join(process.cwd(), "..", "..", "runs", "latest")`;
- compute default `fixtureRoot` as `join(process.cwd(), "fixtures", "scorecards")`;
- try reading `provider-scorecard/provider-scorecard.json` and `provider-scorecard/provider-results.json` from `runsRoot`;
- if either read fails, read `provider-scorecard.json` and `provider-results.json` from `fixtureRoot`;
- return `source.kind: "runs_latest"` for generated artifacts and `"fixture"` for fallback.

- [x] **Step 7: Implement `loadReliabilityScorecard`**

Mirror provider loading with `reliability-scorecard/reliability-scorecard.json`, `reliability-scorecard/reliability-results.json`, and fixture fallback.

- [x] **Step 8: Verify loader GREEN**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/studio test -- scorecard-artifacts.test.ts
```

Expected: PASS.

### Task 4: Red Tests For Rendered Scorecard Routes

**Files:**
- Modify: `apps/studio/test/studio.test.ts`

- [x] **Step 1: Add launcher expectations**

In the launcher test, add:

```ts
await expectText("Provider scorecard");
await expectText("Reliability scorecard");
```

- [x] **Step 2: Add provider route test**

Append:

```ts
it("renders the provider scorecard drilldown", async () => {
  await page!.goto(`${origin}/scorecards/provider`, { waitUntil: "networkidle" });

  await expectText("Provider scorecard");
  await expectText("planned runs");
  await expectText("executed runs");
  await expectText("OpenAI");
  await expectText("Anthropic");
  await expectText("legacy-portal");
  await expectText("skipped_paid_runs_disabled");
});
```

- [x] **Step 3: Add reliability route test**

Append:

```ts
it("renders the reliability scorecard drilldown", async () => {
  await page!.goto(`${origin}/scorecards/reliability`, { waitUntil: "networkidle" });

  await expectText("Reliability scorecard");
  await expectText("happy-path-portal-entry");
  await expectText("validation-recovery-after-missing-date");
  await expectText("prompt-injection-in-untrusted-invoice");
  await expectText("success rate");
});
```

- [x] **Step 4: Verify route RED**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/studio test -- studio.test.ts
```

Expected: FAIL because `/scorecards/provider`, `/scorecards/reliability`, and launcher links do not exist.

### Task 5: Provider Scorecard Route

**Files:**
- Create: `apps/studio/app/scorecards/provider/page.tsx`
- Modify: `apps/studio/app/globals.css`

- [x] **Step 1: Create the provider page**

Create a server component that calls `loadProviderScorecard()` and renders:
- sidebar brand `Provider scorecard`;
- links to `/`, `/readiness`, and `/scorecards/reliability`;
- status card with `summary.status`, `source.kind`, and generated timestamp;
- summary metrics: planned runs, executed runs, skipped runs, paid calls, successes, success rate, false completion rate, stuck-loop rate, unsafe blocks, total cost;
- provider grouped rows for OpenAI and Anthropic;
- task grouped rows for `legacy-portal`, `modal-interruption`, and `prompt-injection`;
- row table with provider, task, attempt, status, model, success, paid call, steps, and cost;
- warnings panel.

- [x] **Step 2: Add formatting helpers**

Use local helpers:

```ts
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}
```

- [x] **Step 3: Add CSS classes**

In `apps/studio/app/globals.css`, add:
- `.scorecardGrid` for two-column grouped panels;
- `.scorecardTable` with `overflow-x: auto`;
- `.scorecardRow` with wide stable columns;
- `.sourceBadge` for `runs_latest` or `fixture`;
- mobile collapse for `.scorecardGrid`.

- [x] **Step 4: Run Studio test**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/studio test -- studio.test.ts
```

Expected: provider route assertions may pass, reliability route and launcher links may still fail until later tasks.

### Task 6: Reliability Scorecard Route

**Files:**
- Create: `apps/studio/app/scorecards/reliability/page.tsx`
- Modify: `apps/studio/app/globals.css`

- [x] **Step 1: Create reliability page**

Create a server component that calls `loadReliabilityScorecard()` and renders:
- sidebar brand `Reliability scorecard`;
- links to `/`, `/readiness`, and `/scorecards/provider`;
- source card with `source.kind`, generated timestamp, and repetitions;
- summary metrics: total runs, successes, success rate, false completions, stuck loops, unsafe blocks, human approvals, median success steps, total cost;
- case table with case id, runs, successes, success rate, false completion rate, stuck-loop rate, unsafe block rate, human approval rate, median success steps;
- result row table with case id, task id, success, false completion, stuck loop, unsafe blocked, human approvals, steps, duration;
- warnings panel when warnings exist.

- [x] **Step 2: Reuse scorecard CSS**

Use `.scorecardGrid`, `.scorecardTable`, `.scorecardRow`, `.sourceBadge`, `.metric`, `.status`, and `.warningList` rather than creating a separate one-off visual system.

- [x] **Step 3: Run Studio test**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/studio test -- studio.test.ts
```

Expected: route tests may still fail on launcher links until navigation is added.

### Task 7: Navigation And Readiness Connections

**Files:**
- Modify: `apps/studio/app/page.tsx`
- Modify: `apps/studio/app/readiness/page.tsx`

- [x] **Step 1: Add launcher buttons**

In `apps/studio/app/page.tsx`, import `BarChart3` from `lucide-react` and add:

```tsx
<Link className="ghostButton" href="/scorecards/provider">
  <BarChart3 size={15} />
  Provider scorecard
</Link>
<Link className="ghostButton" href="/scorecards/reliability">
  <BarChart3 size={15} />
  Reliability scorecard
</Link>
```

- [x] **Step 2: Add readiness drilldown buttons**

In `apps/studio/app/readiness/page.tsx`, add buttons to `/scorecards/provider` and `/scorecards/reliability`.

- [x] **Step 3: Verify rendered route GREEN**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/studio test -- studio.test.ts
```

Expected: PASS.

### Task 8: Documentation Updates

**Files:**
- Modify: `README.md`
- Modify: `docs/results/first-report.md`
- Modify: `docs/video-walkthrough-script.md`

- [x] **Step 1: Update repository status**

Add:

```md
- Studio scorecard drilldowns that read generated provider and reliability artifacts when present and fall back to safe fixtures in fresh clones.
```

- [x] **Step 2: Update next build slices**

Remove provider scorecard drilldowns from future work and leave per-step model API metadata, budget stops, driver error traces, and paid-readiness history.

- [x] **Step 3: Update first report**

Add the scorecard drilldowns to `What Works` and note that Studio now links readiness decisions to provider/reliability drilldowns.

- [x] **Step 4: Update walkthrough script**

Add a line after the readiness gate section:

```md
Open `/scorecards/provider` and `/scorecards/reliability` to show the underlying rows that explain the readiness decision: provider rows are dry-run only, while deterministic reliability rows are executed and repeatable.
```

### Task 9: Full Verification

**Files:**
- Verify all changed source and docs

- [x] **Step 1: Run focused Studio tests**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/studio test
```

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run:

```bash
corepack pnpm@9.15.4 run typecheck
```

Expected: PASS.

- [x] **Step 3: Run full tests**

Run:

```bash
corepack pnpm@9.15.4 run test
```

Expected: PASS.

- [x] **Step 4: Run build**

Run:

```bash
corepack pnpm@9.15.4 run build
```

Expected: PASS. Restore `apps/studio/next-env.d.ts` if Next rewrites the generated route-types import.

- [x] **Step 5: Run CI**

Run:

```bash
corepack pnpm@9.15.4 run ci
```

Expected: PASS.

- [x] **Step 6: Run secret scan**

Run:

```bash
rg -n "sk-proj-|sk-ant-|OPENAI_API_KEY=.*sk-|ANTHROPIC_API_KEY=.*sk-" README.md SECURITY.md docs apps evals packages -g '!docs/superpowers/plans/**'
```

Expected: no matches.

### Task 10: Rendered UI QA

**Files:**
- Verify running app only; do not commit screenshots or temporary scripts

- [x] **Step 1: Read Browser skill before browser actions**

Read:

```bash
sed -n '1,340p' /Users/francescogiannicola/.codex/plugins/cache/openai-bundled/browser/26.623.31921/skills/control-in-app-browser/SKILL.md
```

- [x] **Step 2: Start Studio dev server**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/studio dev
```

Use `http://127.0.0.1:3200`.

- [x] **Step 3: Browser QA provider route**

Validate:
- page identity is `/scorecards/provider`;
- page title is `TracePilot Studio`;
- page is not blank;
- no framework overlay;
- no relevant console errors/warnings;
- source badge is visible;
- rows include OpenAI, Anthropic, `legacy-portal`, and `skipped_paid_runs_disabled`;
- navigation to readiness works.

- [x] **Step 4: Browser QA reliability route**

Validate:
- page identity is `/scorecards/reliability`;
- page title is `TracePilot Studio`;
- page is not blank;
- no framework overlay;
- no relevant console errors/warnings;
- rows include `happy-path-portal-entry`, `validation-recovery-after-missing-date`, and `prompt-injection-in-untrusted-invoice`;
- navigation to provider works.

- [x] **Step 5: Mobile QA**

Set viewport to `390x844` and validate both scorecard routes:
- sidebar stacks above main content;
- grouped grids collapse to one column;
- row tables scroll horizontally;
- buttons are not clipped.

- [x] **Step 6: Save output screenshots**

Save screenshots to:
- `/Users/francescogiannicola/Documents/Codex/2026-06-26/we-re-hiring-on-the-computer/outputs/tracepilot-provider-scorecard-desktop.png`
- `/Users/francescogiannicola/Documents/Codex/2026-06-26/we-re-hiring-on-the-computer/outputs/tracepilot-reliability-scorecard-desktop.png`
- `/Users/francescogiannicola/Documents/Codex/2026-06-26/we-re-hiring-on-the-computer/outputs/tracepilot-provider-scorecard-mobile.png`
- `/Users/francescogiannicola/Documents/Codex/2026-06-26/we-re-hiring-on-the-computer/outputs/tracepilot-reliability-scorecard-mobile.png`

### Task 11: Commit, PR, CI, Merge, Cleanup

**Files:**
- Commit only intentional changed files

- [x] **Step 1: Inspect git status**

Run:

```bash
git status --short
```

Expected: scorecard fixtures, loader, routes, CSS, tests, docs, and plan file only.

- [x] **Step 2: Commit**

Run:

```bash
git add apps/studio docs README.md
git commit -m "feat: add studio scorecard drilldowns"
```

- [ ] **Step 3: Push**

Run:

```bash
git push -u origin feat/studio-scorecard-drilldowns
```

- [ ] **Step 4: Create PR**

Run:

```bash
gh pr create --base main --head feat/studio-scorecard-drilldowns --title "Add Studio scorecard drilldowns" --body "## Summary
- add artifact-backed provider and reliability scorecard drilldown routes in Studio
- load generated runs/latest scorecards when present with committed fixture fallback
- wire launcher/readiness navigation and update docs

## Verification
- corepack pnpm@9.15.4 --filter @tracepilot/studio test
- corepack pnpm@9.15.4 run typecheck
- corepack pnpm@9.15.4 run test
- corepack pnpm@9.15.4 run build
- corepack pnpm@9.15.4 run ci
- Browser QA for provider/reliability scorecard routes on desktop and 390px mobile
- secret scan for OpenAI/Anthropic key patterns"
```

- [ ] **Step 5: Watch CI**

Run:

```bash
gh pr checks --watch --fail-fast
```

Expected: all required checks pass.

- [ ] **Step 6: Merge PR**

Run:

```bash
gh pr merge --merge --delete-branch
```

If the local checkout warning appears, verify remote merge with:

```bash
gh pr view --json state,mergeCommit,url
```

- [ ] **Step 7: Update main and cleanup worktree**

From main checkout:

```bash
git pull --ff-only
git worktree remove .worktrees/studio-scorecard-drilldowns
git worktree prune
git branch -d feat/studio-scorecard-drilldowns
git push origin --delete feat/studio-scorecard-drilldowns
```

Expected: main is up to date, local/remote feature branches are gone, and only pre-existing unrelated untracked files remain.

### Task 12: Final Report

**Files:**
- Read: final git status
- Read: PR state

- [ ] **Step 1: Summarize product change**

Report the two new Studio routes and artifact fallback behavior.

- [ ] **Step 2: Summarize verification**

List local tests, build, CI, Browser QA, secret scan, and screenshot outputs.

- [ ] **Step 3: Summarize merge and cleanup**

Include PR URL, merge commit, final git status, and live Studio URL if running.
