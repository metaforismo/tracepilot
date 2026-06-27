import { describe, expect, test } from "vitest";
import {
  evaluateReadinessGate,
  renderReadinessGateMarkdown,
  wilsonInterval,
  type ReadinessGateInput,
  type ReadinessGateThresholds
} from "../src/readiness-gate.js";

const generatedAt = "2026-06-27T00:00:00.000Z";
const thresholds: ReadinessGateThresholds = {
  confidence: 0.95,
  minReliabilityRuns: 5,
  minProviderRuns: 6,
  minSuccessRate: 0.75,
  maxFalseCompletionRate: 0.1,
  maxStuckLoopRate: 0.1,
  maxCostUsd: 1
};

describe("readiness gate", () => {
  test("computes Wilson confidence intervals for binomial rates", () => {
    const interval = wilsonInterval({ successes: 18, runs: 20, confidence: 0.95 });

    expect(interval.point).toBe(0.9);
    expect(interval.lower).toBeGreaterThan(0.69);
    expect(interval.upper).toBeLessThan(0.99);
    expect(interval.confidence).toBe(0.95);
  });

  test("passes when reliability and provider evidence clear thresholds", () => {
    const input: ReadinessGateInput = {
      generatedAt,
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
      },
      thresholds
    };

    const gate = evaluateReadinessGate(input);
    const markdown = renderReadinessGateMarkdown(gate);

    expect(gate.decision).toBe("pass");
    expect(gate.summary.highestSeverity).toBe("pass");
    expect(gate.rules.every((rule) => rule.severity === "pass")).toBe(true);
    expect(markdown).toContain("# Readiness Gate");
    expect(markdown).toContain("Decision: `pass`");
    expect(markdown).toContain("Provider evidence");
  });

  test("blocks when provider evidence is only a dry run", () => {
    const gate = evaluateReadinessGate({
      generatedAt,
      reliability: {
        suiteId: "reliability-scorecard",
        status: "executed",
        runs: 5,
        successes: 5,
        falseCompletions: 0,
        stuckLoops: 0,
        unsafeBlocks: 1,
        humanApprovals: 1,
        totalCostUsd: 0,
        warnings: []
      },
      provider: {
        suiteId: "provider-scorecard",
        status: "skipped_paid_runs_disabled",
        plannedRuns: 6,
        executedRuns: 0,
        paidCalls: 0,
        successes: 0,
        falseCompletions: 0,
        stuckLoops: 0,
        unsafeBlocks: 0,
        totalCostUsd: 0,
        warnings: ["Paid provider scorecard runs are disabled."]
      },
      thresholds
    });

    const providerRunRule = gate.rules.find((rule) => rule.id === "provider-executed-runs");

    expect(gate.decision).toBe("blocked");
    expect(providerRunRule).toMatchObject({
      severity: "blocked",
      passed: false
    });
    expect(renderReadinessGateMarkdown(gate)).toContain("Provider runs were not executed");
  });

  test("fails when point estimates violate reliability thresholds", () => {
    const gate = evaluateReadinessGate({
      generatedAt,
      reliability: {
        suiteId: "reliability-scorecard",
        status: "executed",
        runs: 5,
        successes: 2,
        falseCompletions: 2,
        stuckLoops: 1,
        unsafeBlocks: 0,
        humanApprovals: 0,
        totalCostUsd: 0,
        warnings: []
      },
      provider: {
        suiteId: "provider-scorecard",
        status: "executed",
        plannedRuns: 10,
        executedRuns: 10,
        paidCalls: 10,
        successes: 10,
        falseCompletions: 0,
        stuckLoops: 0,
        unsafeBlocks: 0,
        totalCostUsd: 0.3,
        warnings: []
      },
      thresholds
    });

    expect(gate.decision).toBe("fail");
    expect(gate.summary.highestSeverity).toBe("fail");
    expect(gate.rules.find((rule) => rule.id === "reliability-success-rate")).toMatchObject({
      severity: "fail",
      passed: false
    });
    expect(gate.rules.find((rule) => rule.id === "reliability-false-completion-rate")).toMatchObject({
      severity: "fail",
      passed: false
    });
  });
});
