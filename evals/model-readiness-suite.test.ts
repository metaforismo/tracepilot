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
        ANTHROPIC_API_KEY: "test-anthropic-key",
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
    expect(manifestJson).not.toContain("test-anthropic-key");

    const report = await readFile(join(runsDir, "model-run-readiness.md"), "utf8");
    expect(report).toContain("# Model Run Readiness");
    expect(report).toContain("No paid model call was made.");
    expect(report).toContain("Status: `skipped_paid_runs_disabled`");
    expect(report).toContain("Source: `dry_run`");
    expect(report).toContain("Paid calls require `TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1`.");
  });

  test("writes an OpenAI readiness manifest without leaking the API key", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-openai-readiness-"));

    const result = await runModelReadinessSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      env: {
        TRACEPILOT_MODEL_PROVIDER: "openai",
        OPENAI_API_KEY: "test-openai-key",
        TRACEPILOT_OPENAI_MODEL: "gpt-5.2",
        TRACEPILOT_OPENAI_REASONING_EFFORT: "low",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
      }
    });

    expect(result.manifest).toMatchObject({
      runId: "openai-model-readiness",
      provider: "openai",
      model: "gpt-5.2",
      source: "dry_run",
      status: "skipped_paid_runs_disabled",
      paidCall: false,
      request: {
        reasoningEffort: "low"
      },
      environment: {
        apiKeyEnvVar: "OPENAI_API_KEY",
        apiKeyPresent: true,
        clientConfigured: false,
        paidRunsEnabled: false
      }
    });

    const manifestJson = await readFile(join(runsDir, "model-run-manifest.json"), "utf8");
    expect(manifestJson).toContain('"provider": "openai"');
    expect(manifestJson).toContain('"apiKeyEnvVar": "OPENAI_API_KEY"');
    expect(manifestJson).toContain('"reasoningEffort": "low"');
    expect(manifestJson).not.toContain("test-openai-key");

    const report = await readFile(join(runsDir, "model-run-readiness.md"), "utf8");
    expect(report).toContain("- Provider: `openai`");
    expect(report).toContain("- Model: `gpt-5.2`");
    expect(report).toContain("- Reasoning effort: `low`");
    expect(report).not.toContain("test-openai-key");
  });

  test("uses a small OpenAI model by default for budget-aware smoke tests", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-openai-default-model-"));

    const result = await runModelReadinessSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      env: {
        TRACEPILOT_MODEL_PROVIDER: "openai",
        OPENAI_API_KEY: "test-openai-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
      }
    });

    expect(result.manifest).toMatchObject({
      provider: "openai",
      model: "gpt-5.4-nano",
      source: "dry_run",
      paidCall: false,
      request: {
        reasoningEffort: "low"
      }
    });
  });
});
