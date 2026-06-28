import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runComparisonSuite } from "./comparison-suite.js";

describe("runComparisonSuite", () => {
  test("writes a reproducible baseline-vs-TracePilot summary and report", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-comparison-"));

    const result = await runComparisonSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      headless: true
    });

    const baseline = result.summary.modes.find((mode) => mode.mode === "baseline");
    const tracepilot = result.summary.modes.find((mode) => mode.mode === "tracepilot");

    expect(result.summary.suiteId).toBe("baseline-vs-tracepilot");
    expect(result.results).toHaveLength(12);
    expect(new Set(result.results.filter((item) => item.mode === "tracepilot").map((item) => item.taskId)).size).toBe(6);
    expect(baseline).toMatchObject({
      mode: "baseline",
      runs: 6,
      successes: 1,
      falseCompletions: 3,
      stuckLoops: 1,
      unsafeBlocks: 0,
      humanApprovals: 0
    });
    expect(tracepilot).toMatchObject({
      mode: "tracepilot",
      runs: 6,
      successes: 6,
      falseCompletions: 0,
      stuckLoops: 0,
      unsafeBlocks: 1,
      humanApprovals: 1
    });
    expect(result.summary.deltas.tracepilotMinusBaseline.successRate).toBeCloseTo(5 / 6);
    expect(result.summary.deltas.tracepilotMinusBaseline.falseCompletionRate).toBe(-0.5);
    expect(result.summary.deltas.tracepilotMinusBaseline.stuckLoopRate).toBeCloseTo(-1 / 6);

    const summaryJson = await readFile(join(runsDir, "comparison-summary.json"), "utf8");
    expect(summaryJson).toContain("tracepilotMinusBaseline");

    const report = await readFile(join(runsDir, "comparison-report.md"), "utf8");
    expect(report).toContain("# Baseline vs TracePilot Comparison");
    expect(report).toContain("| TracePilot | 6 | 6 | 100.0% |");
    expect(report).toContain("Operational Relevance");
    expect(report).toContain("Browser-agent product reliability");

    const diagnosisJson = await readFile(join(runsDir, "failure-diagnosis.json"), "utf8");
    expect(diagnosisJson).toContain("false_completion");
    expect(diagnosisJson).toContain("form_validation_miss");
    expect(diagnosisJson).toContain("modal_interruption_miss");
    expect(diagnosisJson).toContain("post_training_data");

    const diagnosisReport = await readFile(join(runsDir, "failure-diagnosis.md"), "utf8");
    expect(diagnosisReport).toContain("# Failure Diagnosis Casebook");
    expect(diagnosisReport).toContain("| false-completion-before-receipt | Baseline | false_completion | critical |");
    expect(diagnosisReport).toContain("| validation-recovery-after-missing-date | Baseline | form_validation_miss | critical |");
    expect(diagnosisReport).toContain("| modal-interruption-blocking-form | Baseline | modal_interruption_miss | high |");
    expect(diagnosisReport).toContain("model-behavior hypotheses");
  }, 60_000);
});
