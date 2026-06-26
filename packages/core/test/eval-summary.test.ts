import { describe, expect, test } from "vitest";
import { summarizeEvalComparison } from "../src/eval-summary.js";
import type { EvalCaseResult, RunMetrics } from "../src/types.js";

describe("summarizeEvalComparison", () => {
  test("aggregates mode-level reliability rates and TracePilot deltas", () => {
    const results: EvalCaseResult[] = [
      result("baseline", "invoice-a", metrics({ success: true, steps: 4, durationMs: 1000, totalCostUsd: 0.01 })),
      result(
        "baseline",
        "invoice-b",
        metrics({ success: false, falseCompletion: true, steps: 2, durationMs: 2000, totalCostUsd: 0.02 })
      ),
      result(
        "baseline",
        "invoice-c",
        metrics({ success: false, stuckLoop: true, steps: 5, durationMs: 3000, totalCostUsd: 0.03 })
      ),
      result(
        "tracepilot",
        "invoice-a",
        metrics({ success: true, steps: 5, durationMs: 1500, totalCostUsd: 0.015 })
      ),
      result(
        "tracepilot",
        "invoice-b",
        metrics({ success: true, unsafeBlocked: true, steps: 3, durationMs: 2500, totalCostUsd: 0.02 })
      ),
      result(
        "tracepilot",
        "invoice-c",
        metrics({ success: false, humanApprovals: 1, steps: 1, durationMs: 500, totalCostUsd: 0.005 })
      )
    ];

    const summary = summarizeEvalComparison({
      suiteId: "invoice-reliability",
      generatedAt: "2026-06-26T00:00:00.000Z",
      results
    });

    expect(summary.suiteId).toBe("invoice-reliability");
    expect(summary.generatedAt).toBe("2026-06-26T00:00:00.000Z");
    expect(summary.modes.map((mode) => mode.mode)).toEqual(["baseline", "tracepilot"]);
    expect(summary.modes[0]).toMatchObject({
      mode: "baseline",
      runs: 3,
      successes: 1,
      successRate: 1 / 3,
      falseCompletions: 1,
      falseCompletionRate: 1 / 3,
      stuckLoops: 1,
      stuckLoopRate: 1 / 3,
      unsafeBlocks: 0,
      humanApprovals: 0,
      medianStepsPerSuccessfulTask: 4,
      costPerSuccessfulTaskUsd: 0.06
    });
    expect(summary.modes[1]).toMatchObject({
      mode: "tracepilot",
      runs: 3,
      successes: 2,
      successRate: 2 / 3,
      falseCompletions: 0,
      falseCompletionRate: 0,
      stuckLoops: 0,
      stuckLoopRate: 0,
      unsafeBlocks: 1,
      humanApprovals: 1,
      medianStepsPerSuccessfulTask: 4
    });
    expect(summary.deltas.tracepilotMinusBaseline).toMatchObject({
      successRate: 1 / 3,
      falseCompletionRate: -1 / 3,
      stuckLoopRate: -1 / 3,
      unsafeBlockRate: 1 / 3,
      humanApprovalRate: 1 / 3
    });
  });
});

function result(mode: "baseline" | "tracepilot", taskId: string, runMetrics: RunMetrics): EvalCaseResult {
  return {
    suiteId: "invoice-reliability",
    caseId: `${mode}-${taskId}`,
    mode,
    taskId,
    metrics: runMetrics
  };
}

function metrics(overrides: Partial<RunMetrics>): RunMetrics {
  return {
    runId: "run-1",
    taskId: "task-1",
    success: false,
    steps: 0,
    falseCompletion: false,
    stuckLoop: false,
    unsafeBlocked: false,
    humanApprovals: 0,
    totalCostUsd: 0,
    durationMs: 0,
    ...overrides
  };
}
