import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("prefers generated runs artifacts when both generated artifacts and fixtures exist", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "tracepilot-runs-"));
    const providerDir = join(runsRoot, "provider-scorecard");
    const reliabilityDir = join(runsRoot, "reliability-scorecard");
    await mkdir(providerDir, { recursive: true });
    await mkdir(reliabilityDir, { recursive: true });

    await writeFile(
      join(providerDir, "provider-scorecard.json"),
      JSON.stringify({
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
      }),
      "utf8"
    );
    await writeFile(
      join(providerDir, "provider-results.json"),
      JSON.stringify([
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
      ]),
      "utf8"
    );
    await writeFile(
      join(reliabilityDir, "reliability-scorecard.json"),
      JSON.stringify({
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
      }),
      "utf8"
    );
    await writeFile(
      join(reliabilityDir, "reliability-results.json"),
      JSON.stringify([
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
      ]),
      "utf8"
    );

    const provider = await loadProviderScorecard({ runsRoot });
    const reliability = await loadReliabilityScorecard({ runsRoot });

    expect(provider.source.kind).toBe("runs_latest");
    expect(provider.summary.status).toBe("executed");
    expect(provider.rows[0]?.model).toBe("gpt-5.4");
    expect(reliability.source.kind).toBe("runs_latest");
    expect(reliability.summary.totalRuns).toBe(1);
  });
});
