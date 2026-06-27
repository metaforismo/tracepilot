import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runEvidencePackVerifySuite } from "./evidence-pack-verify-suite.js";

describe("runEvidencePackVerifySuite", () => {
  test("generates and verifies an enterprise evidence pack", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-evidence-pack-verify-"));
    const result = await runEvidencePackVerifySuite({
      runsDir,
      generatedAt: "2026-06-27T10:00:00.000Z"
    });

    expect(result.report.decision).toBe("pass");
    expect(result.report.summary.errors).toBe(0);
    expect(result.report.summary.warnings).toBe(0);
    expect(result.report.summary.verifiedArtifacts).toBe(14);
    expect(result.report.integrity.manifestMatches).toBe(true);

    const json = await readFile(result.artifacts.reportJsonPath, "utf8");
    const markdown = await readFile(result.artifacts.reportMarkdownPath, "utf8");
    expect(json).toContain("\"decision\": \"pass\"");
    expect(markdown).toContain("# Enterprise Evidence Pack Verification");
    expect(markdown).toContain("Verified artifacts | 14");
  }, 120_000);
});
