# Studio Readiness Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a product-facing TracePilot Studio route that loads a real readiness-gate artifact shape and makes readiness decisions, evidence classes, Wilson-bound rules, provider gating, and warnings inspectable from the UI.

**Architecture:** Keep readiness math in `@tracepilot/core`; Studio only loads and renders the saved `ReadinessGateResult` JSON. Add a fixture loader beside the existing trace and diagnostic fixture loaders, add a server-rendered Next.js route at `/readiness`, update launcher navigation, and cover the route through the existing Playwright-backed Vitest Studio smoke test. The UI should be dense, work-focused, and evidence-oriented rather than marketing-like.

**Tech Stack:** TypeScript, pnpm 9.15.4, Next.js 16 App Router, React 19 server components, Vitest, Playwright, existing TracePilot core readiness-gate types, no new runtime dependencies.

---

### Task 1: Baseline And File Map

**Files:**
- Read: `apps/studio/app/page.tsx`
- Read: `apps/studio/app/diagnostics/page.tsx`
- Read: `apps/studio/app/runs/[runId]/page.tsx`
- Read: `apps/studio/lib/trace-fixtures.ts`
- Read: `apps/studio/lib/diagnostic-fixtures.ts`
- Read: `apps/studio/test/studio.test.ts`
- Read: `packages/core/src/readiness-gate.ts`

- [x] **Step 1: Create an isolated worktree**

Run:

```bash
git worktree add .worktrees/studio-readiness-dashboard -b feat/studio-readiness-dashboard
```

Expected: a clean linked worktree on `feat/studio-readiness-dashboard`.

- [x] **Step 2: Install dependencies**

Run:

```bash
corepack pnpm@9.15.4 install
```

Expected: lockfile remains unchanged and workspace dependencies install.

- [x] **Step 3: Run the full baseline**

Run:

```bash
corepack pnpm@9.15.4 run test
```

Expected: all workspace package tests and eval tests pass before code changes.

- [x] **Step 4: Confirm the rendering pattern**

Observation: Studio routes are async server components. Fixture loaders read JSON/JSONL from `apps/studio/fixtures`, and `apps/studio/test/studio.test.ts` starts `next dev` with a random free port and validates rendered routes with Playwright.

### Task 2: Red Test For Readiness Route

**Files:**
- Modify: `apps/studio/test/studio.test.ts`

- [x] **Step 1: Add route-level expectations before implementation**

Append this test inside the existing `describe("TracePilot Studio", ...)` block:

```ts
it("renders the readiness gate dashboard", async () => {
  await page!.goto(`${origin}/readiness`, { waitUntil: "networkidle" });

  await expectText("Readiness gate");
  await expectText("Decision");
  await expectText("blocked");
  await expectText("Reliability evidence");
  await expectText("Provider evidence");
  await expectText("provider-executed-runs");
  await expectText("Provider runs were not executed; status is skipped_paid_runs_disabled.");
}, 15000);
```

- [x] **Step 2: Add launcher navigation expectation**

Extend the existing launcher test:

```ts
await expectText("Readiness gate");
```

Expected: the home page will eventually expose a link to `/readiness`.

- [x] **Step 3: Verify RED**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/studio test -- studio.test.ts
```

Expected: FAIL because `/readiness` does not exist and/or the launcher does not yet render the readiness link.

### Task 3: Readiness Fixture And Loader

**Files:**
- Create: `apps/studio/fixtures/readiness/readiness-gate.json`
- Create: `apps/studio/lib/readiness-fixtures.ts`

- [x] **Step 1: Add a credential-free readiness fixture**

Create `apps/studio/fixtures/readiness/readiness-gate.json` with a representative default gate result:

```json
{
  "suiteId": "readiness-gate",
  "generatedAt": "2026-06-27T00:00:00.000Z",
  "decision": "blocked",
  "input": {
    "generatedAt": "2026-06-27T00:00:00.000Z",
    "reliability": {
      "suiteId": "reliability-scorecard",
      "status": "executed",
      "runs": 5,
      "successes": 5,
      "falseCompletions": 0,
      "stuckLoops": 0,
      "unsafeBlocks": 1,
      "humanApprovals": 1,
      "totalCostUsd": 0,
      "warnings": [
        "Reliability evidence is deterministic harness evidence, not paid provider evidence."
      ]
    },
    "provider": {
      "suiteId": "provider-scorecard",
      "status": "skipped_paid_runs_disabled",
      "plannedRuns": 6,
      "executedRuns": 0,
      "paidCalls": 0,
      "successes": 0,
      "falseCompletions": 0,
      "stuckLoops": 0,
      "unsafeBlocks": 0,
      "totalCostUsd": 0,
      "warnings": [
        "Provider scorecard was a dry run because paid model runs were disabled."
      ]
    },
    "thresholds": {
      "confidence": 0.95,
      "minReliabilityRuns": 5,
      "minProviderRuns": 6,
      "minSuccessRate": 0.75,
      "maxFalseCompletionRate": 0.1,
      "maxStuckLoopRate": 0.1,
      "maxCostUsd": 0.5
    }
  },
  "rules": [
    {
      "id": "reliability-runs",
      "label": "Reliability sample size",
      "severity": "pass",
      "passed": true,
      "observed": 5,
      "threshold": 5,
      "message": "Reliability sample size meets the 5 run minimum."
    },
    {
      "id": "reliability-success-rate",
      "label": "Reliability success rate",
      "severity": "warn",
      "passed": false,
      "observed": 1,
      "threshold": 0.75,
      "interval": {
        "point": 1,
        "lower": 0.5655175352168252,
        "upper": 1,
        "confidence": 0.95
      },
      "message": "Reliability success rate point estimate 100.0% clears 75.0%, but the 95.0% lower bound is 56.6%."
    },
    {
      "id": "reliability-false-completion-rate",
      "label": "Reliability false completion rate",
      "severity": "warn",
      "passed": false,
      "observed": 0,
      "threshold": 0.1,
      "interval": {
        "point": 0,
        "lower": 0,
        "upper": 0.43448246478317476,
        "confidence": 0.95
      },
      "message": "Reliability false completion rate point estimate 0.0% is under 10.0%, but the 95.0% upper bound is 43.4%."
    },
    {
      "id": "reliability-stuck-loop-rate",
      "label": "Reliability stuck-loop rate",
      "severity": "warn",
      "passed": false,
      "observed": 0,
      "threshold": 0.1,
      "interval": {
        "point": 0,
        "lower": 0,
        "upper": 0.43448246478317476,
        "confidence": 0.95
      },
      "message": "Reliability stuck-loop rate point estimate 0.0% is under 10.0%, but the 95.0% upper bound is 43.4%."
    },
    {
      "id": "provider-executed-runs",
      "label": "Provider executed runs",
      "severity": "blocked",
      "passed": false,
      "observed": 0,
      "threshold": 6,
      "message": "Provider runs were not executed; status is skipped_paid_runs_disabled."
    }
  ],
  "summary": {
    "highestSeverity": "blocked",
    "passedRules": 1,
    "warnedRules": 3,
    "failedRules": 0,
    "blockedRules": 1,
    "totalRules": 5
  },
  "warnings": [
    "Reliability evidence is deterministic harness evidence, not paid provider evidence.",
    "Provider scorecard was a dry run because paid model runs were disabled."
  ]
}
```

- [x] **Step 2: Add the loader**

Create `apps/studio/lib/readiness-fixtures.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReadinessGateResult } from "@tracepilot/core";

const fixtureRoot = join(process.cwd(), "fixtures", "readiness");

export async function loadReadinessGate(): Promise<ReadinessGateResult> {
  const text = await readFile(join(fixtureRoot, "readiness-gate.json"), "utf8");
  return JSON.parse(text) as ReadinessGateResult;
}
```

- [x] **Step 3: Run the Studio test again**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/studio test -- studio.test.ts
```

Expected: still FAIL because the route and launcher link are not implemented yet.

### Task 4: Readiness Dashboard Route

**Files:**
- Create: `apps/studio/app/readiness/page.tsx`
- Modify: `apps/studio/app/page.tsx`

- [x] **Step 1: Add local formatting helpers**

The page should format percent, dollars, and rule observed values locally:

```ts
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}
```

Use rule ids ending in `rate` to render `observed` plus confidence interval where present.

- [x] **Step 2: Render the evidence-first dashboard**

The `/readiness` page must include:
- sidebar brand text `Readiness gate`;
- back link to `/`;
- decision summary with `Decision`, `blocked`, and generated timestamp;
- summary metrics for passed, warned, failed, blocked, and total rules;
- threshold panel;
- reliability evidence panel;
- provider evidence panel;
- rule table with ids, severity pills, observed values, thresholds, and messages;
- warnings panel when `gate.warnings.length > 0`.

- [x] **Step 3: Add home navigation**

Modify `apps/studio/app/page.tsx`:

```tsx
import { Activity, ClipboardCheck, Play, ShieldCheck, TriangleAlert } from "lucide-react";
```

Add a ghost button:

```tsx
<Link className="ghostButton" href="/readiness">
  <ClipboardCheck size={15} />
  Readiness gate
</Link>
```

- [x] **Step 4: Verify GREEN**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/studio test -- studio.test.ts
```

Expected: PASS with the new readiness dashboard test.

### Task 5: CSS For Dense Evidence Tables

**Files:**
- Modify: `apps/studio/app/globals.css`

- [x] **Step 1: Add status classes**

Extend existing status styles so readiness rule severities render correctly:

```css
.status.pass {
  background: var(--green-soft);
  color: var(--green);
}

.status.warn,
.status.blocked {
  background: var(--amber-soft);
  color: var(--amber);
}

.status.fail {
  background: var(--red-soft);
  color: var(--red);
}
```

- [x] **Step 2: Add readiness layout utilities**

Add CSS for:
- `.readinessGrid` as a two-column evidence layout;
- `.thresholdGrid` as compact threshold cells;
- `.evidenceList` and `.evidenceRow` for metric rows;
- `.ruleTable` and `.ruleRow` for wide rule details;
- `.warningList` and `.warningItem` for warnings.

Keep card radius at `6px`, use existing color variables, and make wide tables horizontally scrollable rather than forcing text overlap.

- [x] **Step 3: Verify responsive behavior through tests**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/studio test -- studio.test.ts
```

Expected: PASS.

### Task 6: Documentation Updates

**Files:**
- Modify: `README.md`
- Modify: `docs/results/first-report.md`
- Modify: `docs/video-walkthrough-script.md`

- [x] **Step 1: Update repository status**

In `README.md`, add a bullet:

```md
- Studio readiness gate dashboard that surfaces operational decision, rule outcomes, thresholds, reliability evidence, provider evidence, and warnings.
```

- [x] **Step 2: Update next slices**

In `README.md`, adjust the Studio next-slice item so readiness gates are no longer listed as absent:

```md
3. Studio surfacing for per-step `model_api` metadata, budget stops, driver error traces, provider scorecard drilldowns, and paid-readiness history.
```

- [x] **Step 3: Update first report**

In `docs/results/first-report.md`, add the Studio readiness dashboard to `What Works` and note it under readiness coverage:

```md
- Studio readiness dashboard that renders the default gate decision, thresholds, evidence classes, rule outcomes, and warnings.
```

- [x] **Step 4: Update walkthrough script**

In `docs/video-walkthrough-script.md`, add:

```md
Open `/readiness` in Studio and show the same blocked decision in the product UI: reliability evidence is visible, provider evidence is visibly dry-run only, and the blocking rule points to missing executed provider rows.
```

### Task 7: Full Local Verification

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

Expected: PASS. If `apps/studio/next-env.d.ts` changes from dev route types to build route types, restore it before commit.

- [x] **Step 5: Run CI script**

Run:

```bash
corepack pnpm@9.15.4 run ci
```

Expected: PASS.

- [x] **Step 6: Run a secret scan**

Run:

```bash
rg -n "sk-proj-|sk-ant-|OPENAI_API_KEY=.*sk-|ANTHROPIC_API_KEY=.*sk-" README.md SECURITY.md docs apps evals packages
```

Expected: no real keys. If the plan file contains only the literal scan pattern, exclude `docs/superpowers/plans` for the commit-safety scan.

### Task 8: Rendered UI QA

**Files:**
- Verify running app only; do not commit screenshots or temporary scripts

- [x] **Step 1: Read Browser skill before Browser actions**

Read:

```bash
sed -n '1,260p' /Users/francescogiannicola/.codex/plugins/cache/openai-bundled/browser/26.623.31921/skills/control-in-app-browser/SKILL.md
```

- [x] **Step 2: Start or reuse Studio dev server**

Run one of:

```bash
corepack pnpm@9.15.4 run dev:studio
```

or navigate to the already-running local Studio route if available.

- [x] **Step 3: Validate desktop readiness flow**

Open:

```text
http://127.0.0.1:3200/readiness
```

Check:
- title/page identity matches TracePilot Studio;
- page is not blank;
- no Next.js error overlay;
- no relevant console errors or warnings;
- decision summary is visible;
- rule table includes `provider-executed-runs`;
- clicking `Runs` returns to the launcher;
- clicking `Readiness gate` from the launcher returns to the dashboard.

- [x] **Step 4: Validate mobile layout**

Use a mobile viewport around `390x844`.

Check:
- sidebar stacks above main content;
- threshold/evidence grids collapse to one column;
- rule table scrolls horizontally instead of overlapping;
- buttons wrap without clipped text.

### Task 9: Commit, PR, CI, Merge, Cleanup

**Files:**
- Commit only intentional changed files

- [x] **Step 1: Inspect git status**

Run:

```bash
git status --short
```

Expected: only the readiness dashboard source, fixture, tests, docs, and plan file are changed.

- [x] **Step 2: Commit**

Run:

```bash
git add apps/studio docs README.md
git commit -m "feat: add studio readiness dashboard"
```

- [ ] **Step 3: Push**

Run:

```bash
git push -u origin feat/studio-readiness-dashboard
```

- [ ] **Step 4: Open PR**

Run:

```bash
gh pr create --base main --head feat/studio-readiness-dashboard --title "Add Studio readiness dashboard" --body "## Summary
- add a Studio readiness gate dashboard backed by a typed readiness fixture
- render decision, thresholds, rule outcomes, reliability evidence, provider evidence, and warnings
- update Studio smoke tests and project docs

## Verification
- corepack pnpm@9.15.4 --filter @tracepilot/studio test
- corepack pnpm@9.15.4 run typecheck
- corepack pnpm@9.15.4 run test
- corepack pnpm@9.15.4 run build
- corepack pnpm@9.15.4 run ci
- rendered UI QA for /readiness"
```

- [ ] **Step 5: Monitor CI**

Run:

```bash
gh pr checks --watch --fail-fast
```

Expected: all required checks pass.

- [ ] **Step 6: Merge**

Run:

```bash
gh pr merge --merge --delete-branch
```

If the command reports local worktree branch deletion trouble after a successful remote merge, verify with:

```bash
gh pr view --json state,mergeCommit,url
```

- [ ] **Step 7: Update main and remove worktree**

From the main checkout:

```bash
git pull --ff-only
git worktree remove .worktrees/studio-readiness-dashboard
git branch -d feat/studio-readiness-dashboard
```

Expected: main is up to date and only pre-existing unrelated untracked files remain.

### Task 10: Final Report

**Files:**
- Read: final git status
- Read: PR state

- [ ] **Step 1: Summarize user-visible change**

Report that Studio now has `/readiness` with decision, thresholds, reliability evidence, provider evidence, rule outcomes, and warnings.

- [ ] **Step 2: Summarize verification**

List the commands that passed and mention any non-code QA performed.

- [ ] **Step 3: Summarize PR outcome**

Include the PR URL, merge state, and final clean-up status.
