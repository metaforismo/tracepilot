import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { ReadinessHistoryResult } from "@tracepilot/core/readiness-history";
import { loadReadinessHistory } from "../lib/readiness-history-artifacts.js";

describe("loadReadinessHistory", () => {
  test("uses the committed fixture only when generated history is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracepilot-studio-history-"));
    const historyRoot = join(root, "generated");
    const fixtureRoot = join(root, "fixtures");
    await mkdir(fixtureRoot, { recursive: true });
    await writeFile(
      join(fixtureRoot, "readiness-history.json"),
      JSON.stringify(history("fixture")),
      "utf8"
    );

    const fixture = await loadReadinessHistory({ historyRoot, fixtureRoot });
    expect(fixture.source).toBe("fixture");

    await mkdir(historyRoot, { recursive: true });
    await writeFile(
      join(historyRoot, "readiness-history.json"),
      JSON.stringify(history("generated")),
      "utf8"
    );

    const generated = await loadReadinessHistory({ historyRoot, fixtureRoot });
    expect(generated.source).toBe("generated");
  });

  test("does not hide a malformed generated artifact behind the fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracepilot-studio-history-invalid-"));
    const historyRoot = join(root, "generated");
    const fixtureRoot = join(root, "fixtures");
    await Promise.all([
      mkdir(historyRoot, { recursive: true }),
      mkdir(fixtureRoot, { recursive: true })
    ]);
    const corrupted = history("generated");
    corrupted.summary.snapshotCount = 99;
    await Promise.all([
      writeFile(join(historyRoot, "readiness-history.json"), JSON.stringify(corrupted), "utf8"),
      writeFile(join(fixtureRoot, "readiness-history.json"), JSON.stringify(history("fixture")), "utf8")
    ]);

    await expect(loadReadinessHistory({ historyRoot, fixtureRoot })).rejects.toThrow(
      "summary does not match the retained snapshots"
    );
  });
});

function history(source: "fixture" | "generated"): ReadinessHistoryResult {
  const snapshot = {
    id: "readiness-20260628000000000",
    generatedAt: "2026-06-28T00:00:00.000Z",
    label: "Gate",
    source,
    decision: "pass" as const,
    reliability: { runs: 5, successRate: 1, falseCompletionRate: 0, stuckLoopRate: 0 },
    provider: {
      status: "executed" as const,
      plannedRuns: 10,
      executedRuns: 10,
      paidCalls: 10,
      successRate: 1,
      falseCompletionRate: 0,
      stuckLoopRate: 0,
      totalCostUsd: 0.1,
      costPerSuccessUsd: 0.01
    },
    thresholds: {
      minSuccessRate: 0.75,
      maxFalseCompletionRate: 0.1,
      maxStuckLoopRate: 0.1,
      maxCostUsd: 0.5
    },
    rules: { passed: 9, warned: 0, failed: 0, blocked: 0, total: 9 },
    warnings: []
  };

  return {
    suiteId: "readiness-history",
    generatedAt: snapshot.generatedAt,
    source,
    retention: 90,
    regressionThresholds: {
      successRateDrop: { warn: 0.05, fail: 0.1 },
      falseCompletionRateIncrease: { warn: 0.02, fail: 0.05 },
      stuckLoopRateIncrease: { warn: 0.02, fail: 0.05 },
      costPerSuccessIncreaseRatio: { warn: 0.25, fail: 0.5 }
    },
    snapshots: [snapshot],
    regressions: [],
    summary: {
      snapshotCount: 1,
      generatedSnapshots: source === "generated" ? 1 : 0,
      fixtureSnapshots: source === "fixture" ? 1 : 0,
      latestSnapshotId: snapshot.id,
      latestDecision: "pass",
      trend: "insufficient_evidence",
      activeRegressions: 0,
      totalRegressions: 0
    },
    warnings: []
  };
}
