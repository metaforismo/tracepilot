import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadReadinessGate } from "../lib/readiness-fixtures";

describe("loadReadinessGate", () => {
  test("prefers a generated runs/latest readiness gate when present", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracepilot-readiness-loader-"));
    const runsRoot = join(root, "runs");
    const fixtureRoot = join(root, "fixtures");
    await mkdir(join(runsRoot, "readiness-gate"), { recursive: true });
    await mkdir(fixtureRoot, { recursive: true });
    await writeFile(join(fixtureRoot, "readiness-gate.json"), gateJson("blocked"), "utf8");
    await writeFile(join(runsRoot, "readiness-gate", "readiness-gate.json"), gateJson("fail"), "utf8");

    await expect(loadReadinessGate({ runsRoot, fixtureRoot })).resolves.toMatchObject({ decision: "fail" });
  });

  test("falls back to the committed fixture when no generated gate exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracepilot-readiness-loader-"));
    const runsRoot = join(root, "runs");
    const fixtureRoot = join(root, "fixtures");
    await mkdir(fixtureRoot, { recursive: true });
    await writeFile(join(fixtureRoot, "readiness-gate.json"), gateJson("blocked"), "utf8");

    await expect(loadReadinessGate({ runsRoot, fixtureRoot })).resolves.toMatchObject({ decision: "blocked" });
  });
});

function gateJson(decision: "blocked" | "fail"): string {
  return `${JSON.stringify({
    suiteId: "readiness-gate",
    generatedAt: "2026-06-28T00:00:00.000Z",
    decision,
    input: {
      generatedAt: "2026-06-28T00:00:00.000Z",
      reliability: {
        suiteId: "reliability-scorecard",
        status: "executed",
        runs: 1,
        successes: 1,
        falseCompletions: 0,
        stuckLoops: 0,
        unsafeBlocks: 0,
        humanApprovals: 0,
        totalCostUsd: 0,
        warnings: []
      },
      provider: {
        suiteId: "provider-scorecard",
        status: decision === "fail" ? "executed" : "skipped_paid_runs_disabled",
        plannedRuns: 1,
        executedRuns: decision === "fail" ? 1 : 0,
        paidCalls: decision === "fail" ? 1 : 0,
        successes: 0,
        falseCompletions: 0,
        stuckLoops: 0,
        unsafeBlocks: 0,
        totalCostUsd: 0,
        warnings: []
      },
      thresholds: {
        confidence: 0.95,
        minReliabilityRuns: 1,
        minProviderRuns: 1,
        minSuccessRate: 0.75,
        maxFalseCompletionRate: 0.1,
        maxStuckLoopRate: 0.1,
        maxCostUsd: 0.5
      }
    },
    rules: [],
    summary: {
      highestSeverity: decision,
      passedRules: 0,
      warnedRules: 0,
      failedRules: decision === "fail" ? 1 : 0,
      blockedRules: decision === "blocked" ? 1 : 0,
      totalRules: 1
    },
    warnings: []
  })}\n`;
}
