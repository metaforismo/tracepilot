import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runReadinessGateSuite } from "./readiness-gate-suite.js";

describe("runReadinessGateSuite", () => {
  test("blocks by default when provider scorecard evidence is a dry run", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-readiness-gate-default-"));

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

    expect(result.inputs.reliability).toMatchObject({
      runs: 5,
      successes: 5,
      falseCompletions: 0,
      stuckLoops: 0
    });
    expect(result.inputs.provider).toMatchObject({
      plannedRuns: 6,
      executedRuns: 0,
      paidCalls: 0,
      successes: 0,
      status: "skipped_paid_runs_disabled"
    });
    expect(result.gate.decision).toBe("blocked");
    expect(result.gate.rules.find((rule) => rule.id === "provider-executed-runs")).toMatchObject({
      severity: "blocked",
      passed: false
    });

    const gateJson = await readFile(join(runsDir, "readiness-gate.json"), "utf8");
    const inputsJson = await readFile(join(runsDir, "readiness-inputs.json"), "utf8");
    const report = await readFile(join(runsDir, "readiness-gate.md"), "utf8");
    const historyJson = await readFile(result.artifacts.historyPath, "utf8");
    const historyReport = await readFile(result.artifacts.historyReportPath, "utf8");

    expect(gateJson).toContain('"decision": "blocked"');
    expect(inputsJson).toContain('"provider"');
    expect(report).toContain("# Readiness Gate");
    expect(report).toContain("Provider evidence");
    expect(report).toContain("provider-executed-runs");
    expect(historyJson).toContain('"suiteId": "readiness-history"');
    expect(historyJson).toContain('"snapshotCount": 1');
    expect(historyJson).toContain('"latestDecision": "blocked"');
    expect(historyReport).toContain("# Readiness History");
    expect(gateJson).not.toContain("test-openai-key");
    expect(inputsJson).not.toContain("test-openai-key");
    expect(report).not.toContain("test-openai-key");
    expect(report).not.toContain("test-anthropic-key");
    expect(historyJson).not.toContain("test-openai-key");
    expect(historyReport).not.toContain("test-anthropic-key");
  }, 90_000);


  test("persists repeated release gates and flags the latest regression", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracepilot-readiness-history-"));
    const runsDir = join(root, "latest", "readiness-gate");
    const historyDir = join(root, "history", "readiness-gate");
    const reliabilityEvidence = {
      suiteId: "reliability-scorecard",
      status: "executed" as const,
      runs: 50,
      successes: 50,
      falseCompletions: 0,
      stuckLoops: 0,
      unsafeBlocks: 10,
      humanApprovals: 10,
      totalCostUsd: 0,
      warnings: []
    };

    await runReadinessGateSuite({
      runsDir,
      historyDir,
      historyLabel: "release-2026.06.27",
      historyRevision: "abc123",
      generatedAt: "2026-06-27T00:00:00.000Z",
      reliabilityEvidence,
      providerEvidence: {
        suiteId: "provider-scorecard",
        status: "executed",
        plannedRuns: 50,
        executedRuns: 50,
        paidCalls: 50,
        successes: 50,
        falseCompletions: 0,
        stuckLoops: 0,
        unsafeBlocks: 8,
        totalCostUsd: 0.2,
        warnings: []
      }
    });

    const result = await runReadinessGateSuite({
      runsDir,
      historyDir,
      historyLabel: "release-2026.06.28",
      historyRevision: "def456",
      generatedAt: "2026-06-28T00:00:00.000Z",
      reliabilityEvidence,
      providerEvidence: {
        suiteId: "provider-scorecard",
        status: "executed",
        plannedRuns: 50,
        executedRuns: 50,
        paidCalls: 50,
        successes: 35,
        falseCompletions: 0,
        stuckLoops: 0,
        unsafeBlocks: 8,
        totalCostUsd: 0.8,
        warnings: []
      }
    });

    const history = JSON.parse(await readFile(result.artifacts.historyPath, "utf8")) as {
      snapshots: Array<{ label: string; revision?: string }>;
      summary: { snapshotCount: number; latestDecision: string; trend: string; activeRegressions: number };
      regressions: Array<{ metric: string; severity: string }>;
    };

    expect(history.snapshots).toHaveLength(2);
    expect(history.snapshots[0]).toMatchObject({ label: "release-2026.06.27", revision: "abc123" });
    expect(history.snapshots[1]).toMatchObject({ label: "release-2026.06.28", revision: "def456" });
    expect(history.summary).toMatchObject({
      snapshotCount: 2,
      latestDecision: "fail",
      trend: "regressing",
      activeRegressions: 3
    });
    expect(history.regressions.map((regression) => regression.metric)).toEqual([
      "decision",
      "provider-success-rate",
      "provider-cost-per-success"
    ]);
    expect(history.regressions.every((regression) => regression.severity === "fail")).toBe(true);
  });

  test("serializes concurrent history updates without losing a release", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracepilot-readiness-history-concurrent-"));
    const historyDir = join(root, "history", "readiness-gate");
    const reliabilityEvidence = {
      suiteId: "reliability-scorecard",
      status: "executed" as const,
      runs: 50,
      successes: 50,
      falseCompletions: 0,
      stuckLoops: 0,
      unsafeBlocks: 10,
      humanApprovals: 10,
      totalCostUsd: 0,
      warnings: []
    };
    const providerEvidence = {
      suiteId: "provider-scorecard",
      status: "executed" as const,
      plannedRuns: 50,
      executedRuns: 50,
      paidCalls: 50,
      successes: 50,
      falseCompletions: 0,
      stuckLoops: 0,
      unsafeBlocks: 8,
      totalCostUsd: 0.2,
      warnings: []
    };

    const [first, second] = await Promise.all([
      runReadinessGateSuite({
        runsDir: join(root, "candidate-a"),
        historyDir,
        generatedAt: "2026-06-27T00:00:00.000Z",
        historyLabel: "candidate-a",
        reliabilityEvidence,
        providerEvidence
      }),
      runReadinessGateSuite({
        runsDir: join(root, "candidate-b"),
        historyDir,
        generatedAt: "2026-06-28T00:00:00.000Z",
        historyLabel: "candidate-b",
        reliabilityEvidence,
        providerEvidence
      })
    ]);

    const history = JSON.parse(await readFile(first.artifacts.historyPath, "utf8")) as {
      generatedAt: string;
      snapshots: Array<{ label: string; generatedAt: string }>;
    };

    expect(second.artifacts.historyPath).toBe(first.artifacts.historyPath);
    expect(history.generatedAt).toBe("2026-06-28T00:00:00.000Z");
    expect(history.snapshots).toEqual([
      expect.objectContaining({
        label: "candidate-a",
        generatedAt: "2026-06-27T00:00:00.000Z"
      }),
      expect.objectContaining({
        label: "candidate-b",
        generatedAt: "2026-06-28T00:00:00.000Z"
      })
    ]);
    await expect(access(join(historyDir, ".readiness-history.lock"))).rejects.toThrow();
  });

  test("passes when injected reliability and provider evidence clear confidence thresholds", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-readiness-gate-injected-"));

    const result = await runReadinessGateSuite({
      runsDir,
      generatedAt: "2026-06-27T00:00:00.000Z",
      reliabilityEvidence: {
        suiteId: "reliability-scorecard",
        status: "executed",
        runs: 50,
        successes: 50,
        falseCompletions: 0,
        stuckLoops: 0,
        unsafeBlocks: 10,
        humanApprovals: 10,
        totalCostUsd: 0,
        warnings: []
      },
      providerEvidence: {
        suiteId: "provider-scorecard",
        status: "executed",
        plannedRuns: 50,
        executedRuns: 50,
        paidCalls: 50,
        successes: 50,
        falseCompletions: 0,
        stuckLoops: 0,
        unsafeBlocks: 8,
        totalCostUsd: 0.4,
        warnings: []
      }
    });

    expect(result.gate.decision).toBe("pass");
    expect(result.gate.summary).toMatchObject({
      highestSeverity: "pass",
      failedRules: 0,
      blockedRules: 0
    });

    const report = await readFile(join(runsDir, "readiness-gate.md"), "utf8");
    expect(report).toContain("Decision: `pass`");
  });
});
