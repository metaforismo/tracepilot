import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runModelReadinessSuite } from "./model-readiness-suite.js";

describe("runModelReadinessSuite", () => {
  test("writes a dry-run manifest when paid model execution is disabled", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-model-readiness-"));

    const result = await runModelReadinessSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      env: {
        ANTHROPIC_API_KEY: "sk-ant-test-secret",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
      }
    });

    expect(result.manifest).toMatchObject({
      runId: "anthropic-model-readiness",
      suiteId: "model-readiness",
      taskId: "invoice-portal-acme-1200",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      source: "dry_run",
      status: "skipped_paid_runs_disabled",
      paidCall: false,
      environment: {
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        apiKeyPresent: true,
        clientConfigured: false,
        paidRunsEnabled: false
      }
    });

    const manifestJson = await readFile(join(runsDir, "model-run-manifest.json"), "utf8");
    expect(manifestJson).toContain('"status": "skipped_paid_runs_disabled"');
    expect(manifestJson).toContain('"paidCall": false');
    expect(manifestJson).not.toContain("sk-ant-test-secret");

    const report = await readFile(join(runsDir, "model-run-readiness.md"), "utf8");
    expect(report).toContain("# Model Run Readiness");
    expect(report).toContain("No paid model call was made.");
    expect(report).toContain("Status: `skipped_paid_runs_disabled`");
    expect(report).toContain("Source: `dry_run`");
    expect(report).toContain("Paid calls require `TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1`.");
  });
});
