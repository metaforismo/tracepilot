import { describe, expect, test } from "vitest";
import { evaluateReadinessGate, type ReadinessGateResult } from "../src/readiness-gate.js";
import {
  appendReadinessHistory,
  buildReadinessHistory,
  renderReadinessHistoryMarkdown,
  validateReadinessHistory
} from "../src/readiness-history.js";

describe("readiness history", () => {
  test("sorts gates and detects the active release regressions", () => {
    const previous = gate({
      generatedAt: "2026-06-27T10:00:00.000Z",
      providerRuns: 50,
      providerSuccesses: 48,
      providerStuckLoops: 0,
      providerCostUsd: 0.24
    });
    const current = gate({
      generatedAt: "2026-06-28T10:00:00.000Z",
      providerRuns: 50,
      providerSuccesses: 38,
      providerStuckLoops: 5,
      providerCostUsd: 0.57
    });

    const history = buildReadinessHistory([
      { gate: current, label: "Candidate", source: "fixture" },
      { gate: previous, label: "Baseline", source: "fixture" }
    ]);

    expect(history.snapshots.map((snapshot) => snapshot.label)).toEqual(["Baseline", "Candidate"]);
    expect(history.summary).toMatchObject({
      snapshotCount: 2,
      latestDecision: "fail",
      trend: "regressing",
      activeRegressions: 4
    });
    expect(history.regressions.map((regression) => regression.metric)).toEqual([
      "decision",
      "provider-success-rate",
      "provider-stuck-loop-rate",
      "provider-cost-per-success"
    ]);
    expect(history.regressions.every((regression) => regression.severity === "fail")).toBe(true);
  });

  test("appends idempotently and respects retention", () => {
    const first = gate({ generatedAt: "2026-06-25T10:00:00.000Z" });
    const second = gate({ generatedAt: "2026-06-26T10:00:00.000Z", providerSuccesses: 47 });
    const replacement = gate({ generatedAt: "2026-06-26T10:00:00.000Z", providerSuccesses: 49 });

    const initial = buildReadinessHistory([{ gate: first }, { gate: second }]);
    const history = appendReadinessHistory(initial, { gate: replacement, label: "Replacement" }, { retention: 1 });

    expect(history.snapshots).toHaveLength(1);
    expect(history.snapshots[0]).toMatchObject({
      label: "Replacement",
      generatedAt: "2026-06-26T10:00:00.000Z"
    });
    expect(history.snapshots[0]?.provider.successRate).toBe(0.98);
  });

  test("does not invent numerical regressions when provider evidence is blocked", () => {
    const executed = gate({ generatedAt: "2026-06-25T10:00:00.000Z" });
    const blocked = gate({
      generatedAt: "2026-06-26T10:00:00.000Z",
      providerRuns: 0,
      providerSuccesses: 0,
      providerStatus: "skipped_paid_runs_disabled",
      providerCostUsd: 0
    });

    const history = buildReadinessHistory([{ gate: executed }, { gate: blocked }]);

    expect(history.summary.trend).toBe("regressing");
    expect(history.regressions).toHaveLength(1);
    expect(history.regressions[0]).toMatchObject({
      metric: "decision",
      severity: "fail",
      currentValue: "blocked"
    });
    expect(history.snapshots[1]?.provider.successRate).toBeNull();
  });

  test("rejects ambiguous duplicate timestamps in a fresh history build", () => {
    const duplicate = gate({ generatedAt: "2026-06-25T10:00:00.000Z" });

    expect(() => buildReadinessHistory([{ gate: duplicate }, { gate: duplicate }])).toThrow(
      "Duplicate readiness snapshot timestamp"
    );
  });

  test("rejects a persisted history whose derived summary was tampered with", () => {
    const history = buildReadinessHistory([
      { gate: gate({ generatedAt: "2026-06-25T10:00:00.000Z" }) }
    ]);
    history.summary.snapshotCount = 99;

    expect(() => validateReadinessHistory(history)).toThrow(
      "summary does not match the retained snapshots"
    );
  });

  test("rejects corrupted persisted snapshots before appending a release", () => {
    const initial = buildReadinessHistory([
      { gate: gate({ generatedAt: "2026-06-25T10:00:00.000Z" }) }
    ]);
    initial.snapshots[0]!.id = "tampered-id";

    expect(() => appendReadinessHistory(
      initial,
      { gate: gate({ generatedAt: "2026-06-26T10:00:00.000Z" }) }
    )).toThrow("snapshot.id must be derived");
  });

  test("normalizes release metadata and carries evidence warnings into snapshots", () => {
    const evidence = gate({ generatedAt: "2026-06-25T10:00:00.000Z" });
    evidence.input.provider.warnings.push("  provider warning  ");
    evidence.input.reliability.warnings.push("reliability warning");

    const history = buildReadinessHistory([
      { gate: evidence, revision: "  abc123  ", note: "  release note  " }
    ]);

    expect(history.snapshots[0]).toMatchObject({
      revision: "abc123",
      note: "release note",
      warnings: ["reliability warning", "provider warning"]
    });
  });

  test("renders a portable Markdown audit readout", () => {
    const history = buildReadinessHistory([
      { gate: gate({ generatedAt: "2026-06-25T10:00:00.000Z" }), revision: "abc123" }
    ]);

    const markdown = renderReadinessHistoryMarkdown(history);

    expect(markdown).toContain("# Readiness History");
    expect(markdown).toContain("Latest decision: `pass`");
    expect(markdown).toContain("abc123");
    expect(markdown).toContain("No regressions detected.");
  });
});

type GateOptions = {
  generatedAt: string;
  providerRuns?: number;
  providerSuccesses?: number;
  providerFalseCompletions?: number;
  providerStuckLoops?: number;
  providerCostUsd?: number;
  providerStatus?: ReadinessGateResult["input"]["provider"]["status"];
};

function gate(options: GateOptions): ReadinessGateResult {
  const providerRuns = options.providerRuns ?? 50;
  const providerStatus = options.providerStatus ?? "executed";

  return evaluateReadinessGate({
    generatedAt: options.generatedAt,
    reliability: {
      suiteId: "reliability-scorecard",
      status: "executed",
      runs: 50,
      successes: 50,
      falseCompletions: 0,
      stuckLoops: 0,
      unsafeBlocks: 5,
      humanApprovals: 5,
      totalCostUsd: 0,
      warnings: []
    },
    provider: {
      suiteId: "provider-scorecard",
      status: providerStatus,
      plannedRuns: providerStatus === "executed" ? providerRuns : 50,
      executedRuns: providerRuns,
      paidCalls: providerRuns,
      successes: options.providerSuccesses ?? providerRuns,
      falseCompletions: options.providerFalseCompletions ?? 0,
      stuckLoops: options.providerStuckLoops ?? 0,
      unsafeBlocks: 5,
      totalCostUsd: options.providerCostUsd ?? 0.2,
      warnings: []
    },
    thresholds: {
      confidence: 0.95,
      minReliabilityRuns: 5,
      minProviderRuns: 6,
      minSuccessRate: 0.75,
      maxFalseCompletionRate: 0.1,
      maxStuckLoopRate: 0.1,
      maxCostUsd: 0.5
    }
  });
}
