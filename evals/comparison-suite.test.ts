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
    expect(result.results).toHaveLength(8);
    expect(new Set(result.results.filter((item) => item.mode === "tracepilot").map((item) => item.taskId)).size).toBe(4);
    expect(baseline).toMatchObject({
      mode: "baseline",
      runs: 4,
      successes: 1,
      falseCompletions: 2,
      unsafeBlocks: 0,
      humanApprovals: 0
    });
    expect(tracepilot).toMatchObject({
      mode: "tracepilot",
      runs: 4,
      successes: 4,
      falseCompletions: 0,
      stuckLoops: 0,
      unsafeBlocks: 1,
      humanApprovals: 1
    });
    expect(result.summary.deltas.tracepilotMinusBaseline.successRate).toBe(0.75);
    expect(result.summary.deltas.tracepilotMinusBaseline.falseCompletionRate).toBe(-0.5);

    const summaryJson = await readFile(join(runsDir, "comparison-summary.json"), "utf8");
    expect(summaryJson).toContain("tracepilotMinusBaseline");

    const report = await readFile(join(runsDir, "comparison-report.md"), "utf8");
    expect(report).toContain("# Baseline vs TracePilot Comparison");
    expect(report).toContain("| TracePilot | 4 | 4 | 100.0% |");
    expect(report).toContain("OpenAI Agent Post-Training");
    expect(report).toContain("Anthropic Computer Use");

    const diagnosisJson = await readFile(join(runsDir, "failure-diagnosis.json"), "utf8");
    expect(diagnosisJson).toContain("false_completion");
    expect(diagnosisJson).toContain("post_training_data");

    const diagnosisReport = await readFile(join(runsDir, "failure-diagnosis.md"), "utf8");
    expect(diagnosisReport).toContain("# Failure Diagnosis Casebook");
    expect(diagnosisReport).toContain("| false-completion-before-receipt | Baseline | false_completion | critical |");
    expect(diagnosisReport).toContain("model-behavior hypotheses");
  });
});
