import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runReliabilityScorecardSuite } from "./reliability-scorecard-suite.js";

describe("runReliabilityScorecardSuite", () => {
  test("aggregates repeated hard browser workflows into a reliability scorecard", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-reliability-"));

    const result = await runReliabilityScorecardSuite({
      runsDir,
      generatedAt: "2026-06-27T00:00:00.000Z",
      headless: true,
      repetitions: 2
    });

    expect(result.summary).toMatchObject({
      suiteId: "reliability-scorecard",
      generatedAt: "2026-06-27T00:00:00.000Z",
      repetitions: 2,
      totalRuns: 10,
      successes: 10,
      falseCompletions: 0,
      stuckLoops: 0,
      unsafeBlocks: 2,
      humanApprovals: 2
    });
    expect(result.summary.successRate).toBe(1);
    expect(result.summary.falseCompletionRate).toBe(0);
    expect(result.summary.stuckLoopRate).toBe(0);
    expect(result.summary.unsafeBlockRate).toBe(0.2);
    expect(result.summary.humanApprovalRate).toBe(0.2);
    expect(result.summary.medianStepsPerSuccessfulRun).toBe(11);
    expect(result.results).toHaveLength(10);
    expect(new Set(result.results.map((item) => item.metrics.runId)).size).toBe(10);

    expect(result.summary.cases.map((item) => item.caseId)).toEqual([
      "happy-path-portal-entry",
      "validation-recovery-after-missing-date",
      "modal-interruption-blocking-form",
      "approval-required-above-threshold",
      "prompt-injection-in-untrusted-invoice"
    ]);

    const modalInterruption = result.summary.cases.find(
      (item) => item.caseId === "modal-interruption-blocking-form"
    );
    expect(modalInterruption).toMatchObject({
      runs: 2,
      successes: 2,
      successRate: 1,
      falseCompletionRate: 0,
      stuckLoopRate: 0,
      medianStepsPerSuccessfulRun: 11
    });

    const approval = result.summary.cases.find((item) => item.caseId === "approval-required-above-threshold");
    expect(approval).toMatchObject({
      runs: 2,
      successes: 2,
      humanApprovalRate: 1
    });

    const promptInjection = result.summary.cases.find(
      (item) => item.caseId === "prompt-injection-in-untrusted-invoice"
    );
    expect(promptInjection).toMatchObject({
      runs: 2,
      successes: 2,
      unsafeBlockRate: 1
    });

    expect(result.diagnosis.summary).toMatchObject({
      total: 10,
      successes: 10,
      failures: 0,
      blocked: 4
    });

    const summaryJson = await readFile(join(runsDir, "reliability-scorecard.json"), "utf8");
    expect(summaryJson).toContain('"suiteId": "reliability-scorecard"');
    expect(summaryJson).toContain('"caseId": "modal-interruption-blocking-form"');

    const report = await readFile(join(runsDir, "reliability-scorecard.md"), "utf8");
    expect(report).toContain("# Reliability Scorecard");
    expect(report).toContain("| modal-interruption-blocking-form | 2 | 2 | 100.0% |");
    expect(report).toContain("Operational Relevance");
    expect(report).toContain("Browser-agent reliability measurement");

    const diagnosisReport = await readFile(join(runsDir, "reliability-diagnosis.md"), "utf8");
    expect(diagnosisReport).toContain("# Reliability Diagnosis");
    expect(diagnosisReport).toContain("requires_human_approval");
    expect(diagnosisReport).toContain("prompt_injection_blocked");
  }, 90_000);
});
