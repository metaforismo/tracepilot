import { describe, expect, test } from "vitest";
import {
  appendProviderHistory,
  buildProviderHistory,
  latestProviderModelTransitions,
  renderProviderHistoryMarkdown,
  validateProviderHistory,
  type ProviderHistoryRow
} from "../src/provider-history.js";

describe("provider history", () => {
  test("attributes threshold-crossing regressions to provider, task, and model transition", () => {
    const previous = rows({
      model: "claude-sonnet-4-5",
      outcomes: [true, true, true, true],
      costs: [0.02, 0.02, 0.02, 0.02]
    });
    const current = rows({
      model: "claude-sonnet-4-6",
      outcomes: [true, true, true, false],
      stuckAttempts: [4],
      costs: [0.04, 0.04, 0.04, 0.04]
    });

    const history = buildProviderHistory([
      {
        generatedAt: "2026-06-27T00:00:00.000Z",
        label: "Baseline",
        revision: "abc123",
        source: "fixture",
        rows: previous
      },
      {
        generatedAt: "2026-06-28T00:00:00.000Z",
        label: "Candidate",
        revision: "def456",
        source: "fixture",
        rows: current
      }
    ]);

    expect(history.summary).toMatchObject({
      snapshotCount: 2,
      trend: "regressing",
      activeRegressions: 3,
      affectedTasks: 1,
      affectedProviders: 1,
      modelChanges: 1
    });
    expect(history.regressions.map((regression) => regression.metric)).toEqual([
      "success-rate",
      "stuck-loop-rate",
      "cost-per-success"
    ]);
    expect(history.regressions.every((regression) => regression.severity === "fail")).toBe(true);
    expect(history.regressions[0]).toMatchObject({
      provider: "anthropic",
      taskId: "legacy-portal",
      previousModels: ["claude-sonnet-4-5"],
      currentModels: ["claude-sonnet-4-6"]
    });
    expect(history.regressions[0]?.message).toContain(
      "models changed from claude-sonnet-4-5 to claude-sonnet-4-6"
    );
    expect(latestProviderModelTransitions(history)).toEqual([
      {
        provider: "anthropic",
        taskId: "legacy-portal",
        previousModels: ["claude-sonnet-4-5"],
        currentModels: ["claude-sonnet-4-6"]
      }
    ]);
  });

  test("treats missing paid evidence as insufficient instead of inventing numerical regressions", () => {
    const history = buildProviderHistory([
      {
        generatedAt: "2026-06-27T00:00:00.000Z",
        rows: rows({ model: "gpt-5.4", outcomes: [true, true] })
      },
      {
        generatedAt: "2026-06-28T00:00:00.000Z",
        rows: rows({
          model: "gpt-5.4",
          outcomes: [false, false],
          status: "skipped_paid_runs_disabled"
        })
      }
    ]);

    expect(history.regressions).toHaveLength(0);
    expect(history.summary.trend).toBe("insufficient_evidence");
    expect(history.snapshots[1]?.slices[0]).toMatchObject({
      executedRuns: 0,
      successRate: null,
      falseCompletionRate: null,
      stuckLoopRate: null,
      costPerSuccessUsd: null
    });
  });

  test("keeps mixed sub-threshold movement stable", () => {
    const history = buildProviderHistory(
      [
        {
          generatedAt: "2026-06-27T00:00:00.000Z",
          rows: rows({ model: "gpt-5.4", outcomes: [true, false], costs: [0.02, 0.02] })
        },
        {
          generatedAt: "2026-06-28T00:00:00.000Z",
          rows: rows({ model: "gpt-5.4", outcomes: [true, true], costs: [0.03, 0.03] })
        }
      ],
      {
        regressionThresholds: {
          successRateDrop: { warn: 1, fail: 1 },
          falseCompletionRateIncrease: { warn: 1, fail: 1 },
          stuckLoopRateIncrease: { warn: 1, fail: 1 },
          costPerSuccessIncreaseRatio: { warn: 10, fail: 10 }
        }
      }
    );

    expect(history.regressions).toHaveLength(0);
    expect(history.summary.trend).toBe("stable");
  });

  test("appends idempotently and respects retention", () => {
    const initial = buildProviderHistory([
      {
        generatedAt: "2026-06-26T00:00:00.000Z",
        rows: rows({ model: "gpt-5.4", outcomes: [true] })
      },
      {
        generatedAt: "2026-06-27T00:00:00.000Z",
        rows: rows({ model: "gpt-5.4", outcomes: [true] })
      }
    ]);

    const history = appendProviderHistory(
      initial,
      {
        generatedAt: "2026-06-27T00:00:00.000Z",
        label: "Replacement",
        rows: rows({ model: "gpt-5.4-mini", outcomes: [true] })
      },
      { retention: 1 }
    );

    expect(history.snapshots).toHaveLength(1);
    expect(history.snapshots[0]).toMatchObject({
      label: "Replacement",
      generatedAt: "2026-06-27T00:00:00.000Z"
    });
    expect(history.snapshots[0]?.slices[0]?.models).toEqual(["gpt-5.4-mini"]);
  });

  test("rejects persisted derived slices that were tampered with", () => {
    const history = buildProviderHistory([
      {
        generatedAt: "2026-06-27T00:00:00.000Z",
        rows: rows({ model: "gpt-5.4", outcomes: [true, true] })
      }
    ]);
    history.snapshots[0]!.slices[0]!.successes = 0;

    expect(() => validateProviderHistory(history)).toThrow(
      "slices do not match the retained scorecard rows"
    );
  });

  test("renders a portable attribution report without raw trace payloads", () => {
    const history = buildProviderHistory([
      {
        generatedAt: "2026-06-27T00:00:00.000Z",
        label: "Baseline",
        revision: "abc123",
        rows: rows({ model: "claude-sonnet-4-5", outcomes: [true, true] })
      },
      {
        generatedAt: "2026-06-28T00:00:00.000Z",
        label: "Candidate",
        revision: "def456",
        rows: rows({ model: "claude-sonnet-4-6", outcomes: [true, false] })
      }
    ]);

    const markdown = renderProviderHistoryMarkdown(history);

    expect(markdown).toContain("# Provider Regression Attribution");
    expect(markdown).toContain("anthropic");
    expect(markdown).toContain("legacy-portal");
    expect(markdown).toContain("claude-sonnet-4-5 → claude-sonnet-4-6");
    expect(markdown).toContain("def456");
  });
});

function rows(options: {
  model: string;
  outcomes: boolean[];
  costs?: number[];
  stuckAttempts?: number[];
  status?: ProviderHistoryRow["status"];
}): ProviderHistoryRow[] {
  const status = options.status ?? "executed";
  return options.outcomes.map((success, index) => ({
    provider: "anthropic",
    taskId: "legacy-portal",
    attempt: index + 1,
    status,
    paidCall: status === "executed",
    model: options.model,
    success: status === "executed" ? success : false,
    falseCompletion: false,
    stuckLoop: status === "executed" && (options.stuckAttempts ?? []).includes(index + 1),
    unsafeBlocked: false,
    humanApprovals: 0,
    budgetExceeded: false,
    steps: status === "executed" ? 4 : 0,
    totalCostUsd: status === "executed" ? (options.costs?.[index] ?? 0.02) : 0,
    maxCostUsd: 0.5
  }));
}
