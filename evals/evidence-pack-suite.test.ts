import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runEvidencePackSuite } from "./evidence-pack-suite.js";

describe("runEvidencePackSuite", () => {
  test("writes a redacted tamper-evident enterprise evidence pack", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-evidence-pack-"));
    const openAiKey = ["sk", "proj", "testsecret1234567890"].join("-");
    const result = await runEvidencePackSuite({
      runsDir,
      generatedAt: "2026-06-27T10:00:00.000Z",
      extraArtifacts: [
        {
          id: "secret-log",
          title: "Secret log",
          category: "other",
          relativePath: "logs/secret-log.txt",
          mediaType: "text/plain",
          sourceSuite: "test",
          required: false,
          content: `OPENAI_API_KEY=${openAiKey}\n`
        }
      ]
    });

    expect(result.manifest.summary.totalArtifacts).toBeGreaterThan(8);
    expect(result.manifest.summary.redactedArtifacts).toBe(1);
    expect(result.manifest.integrity.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.artifacts.some((artifact) => artifact.category === "readiness_gate")).toBe(true);
    expect(result.manifest.artifacts.some((artifact) => artifact.category === "provider_scorecard")).toBe(true);
    expect(result.manifest.artifacts.some((artifact) => artifact.category === "reliability_scorecard")).toBe(true);
    expect(result.manifest.artifacts.some((artifact) => artifact.category === "cost_ledger")).toBe(true);
    expect(result.manifest.artifacts.some((artifact) => artifact.category === "model_trace")).toBe(true);

    const report = await readFile(result.artifacts.reportPath, "utf8");
    expect(report).toContain("# Enterprise Evidence Pack");
    expect(report).toContain("readiness_gate");
    expect(report).toContain("model_trace");
    expect(report).not.toContain(openAiKey);

    const manifestText = await readFile(result.artifacts.manifestPath, "utf8");
    expect(manifestText).toContain(result.manifest.integrity.manifestSha256);
    expect(manifestText).not.toContain(openAiKey);

    const redactedLog = await readFile(join(runsDir, "artifacts", "logs", "secret-log.txt"), "utf8");
    expect(redactedLog).toContain("[REDACTED_OPENAI_API_KEY]");
    expect(redactedLog).not.toContain(openAiKey);
  }, 120_000);
});
