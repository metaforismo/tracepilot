import { mkdtemp, readFile } from "node:fs/promises";
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

    expect(gateJson).toContain('"decision": "blocked"');
    expect(inputsJson).toContain('"provider"');
    expect(report).toContain("# Readiness Gate");
    expect(report).toContain("Provider evidence");
    expect(report).toContain("provider-executed-runs");
    expect(gateJson).not.toContain("test-openai-key");
    expect(inputsJson).not.toContain("test-openai-key");
    expect(report).not.toContain("test-openai-key");
    expect(report).not.toContain("test-anthropic-key");
  }, 90_000);

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
