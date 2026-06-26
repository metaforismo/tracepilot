import { describe, expect, test } from "vitest";
import { buildModelRunManifest } from "../src/model-run-manifest.js";

describe("buildModelRunManifest", () => {
  test("defaults to a dry-run manifest when paid model calls are disabled", () => {
    const manifest = buildModelRunManifest({
      runId: "model-smoke-disabled",
      suiteId: "model-readiness",
      taskId: "invoice-portal-acme-1200",
      generatedAt: "2026-06-26T00:00:00.000Z",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      paidRunsEnabled: false,
      apiKeyPresent: true,
      clientConfigured: true
    });

    expect(manifest).toMatchObject({
      runId: "model-smoke-disabled",
      suiteId: "model-readiness",
      taskId: "invoice-portal-acme-1200",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      source: "dry_run",
      status: "skipped_paid_runs_disabled",
      paidCall: false,
      generatedAt: "2026-06-26T00:00:00.000Z",
      environment: {
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        apiKeyPresent: true,
        clientConfigured: true,
        paidRunsEnabled: false
      }
    });
    expect(manifest.ledger).toBeUndefined();
    expect(manifest.warnings).toContain(
      "Paid model runs are disabled; set TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1 to allow model_api execution."
    );
  });

  test("reports missing credentials before a paid model_api run can execute", () => {
    const manifest = buildModelRunManifest({
      runId: "model-smoke-missing-key",
      suiteId: "model-readiness",
      taskId: "invoice-portal-acme-1200",
      generatedAt: "2026-06-26T00:00:00.000Z",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      paidRunsEnabled: true,
      apiKeyPresent: false,
      clientConfigured: true
    });

    expect(manifest).toMatchObject({
      source: "dry_run",
      status: "skipped_missing_api_key",
      paidCall: false,
      environment: {
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        apiKeyPresent: false,
        clientConfigured: true,
        paidRunsEnabled: true
      }
    });
    expect(JSON.stringify(manifest)).not.toContain("test-secret-value");
    expect(manifest.warnings).toContain("ANTHROPIC_API_KEY is required before a model_api run can execute.");
  });

  test("reports missing model client separately from credentials", () => {
    const manifest = buildModelRunManifest({
      runId: "model-smoke-missing-client",
      suiteId: "model-readiness",
      taskId: "invoice-portal-acme-1200",
      generatedAt: "2026-06-26T00:00:00.000Z",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      paidRunsEnabled: true,
      apiKeyPresent: true,
      clientConfigured: false
    });

    expect(manifest).toMatchObject({
      source: "dry_run",
      status: "skipped_missing_client",
      paidCall: false
    });
    expect(manifest.warnings).toContain(
      "A model decision client is required before TracePilot can execute a model_api run."
    );
  });

  test("preserves provider request metadata without treating it as secret state", () => {
    const manifest = buildModelRunManifest({
      runId: "openai-readiness",
      suiteId: "model-readiness",
      taskId: "invoice-portal-acme-1200",
      generatedAt: "2026-06-26T00:00:00.000Z",
      provider: "openai",
      model: "gpt-5.4-nano",
      apiKeyEnvVar: "OPENAI_API_KEY",
      paidRunsEnabled: false,
      apiKeyPresent: true,
      clientConfigured: false,
      request: {
        reasoningEffort: "low"
      }
    });

    expect(manifest).toMatchObject({
      provider: "openai",
      model: "gpt-5.4-nano",
      request: {
        reasoningEffort: "low"
      }
    });
  });

  test("requires a measured result when a paid model client is configured", () => {
    expect(() =>
      buildModelRunManifest({
        runId: "model-smoke-missing-result",
        suiteId: "model-readiness",
        taskId: "invoice-portal-acme-1200",
        generatedAt: "2026-06-26T00:00:00.000Z",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        paidRunsEnabled: true,
        apiKeyPresent: true,
        clientConfigured: true
      })
    ).toThrow("Executed model_api manifests require result usage, pricing, duration, and success metadata.");
  });

  test("attaches a model_api cost ledger only for executed paid runs", () => {
    const manifest = buildModelRunManifest({
      runId: "model-smoke-executed",
      suiteId: "model-readiness",
      taskId: "invoice-portal-acme-1200",
      generatedAt: "2026-06-26T00:00:00.000Z",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      paidRunsEnabled: true,
      apiKeyPresent: true,
      clientConfigured: true,
      result: {
        durationMs: 12_000,
        success: true,
        usage: {
          inputTokens: 50_000,
          outputTokens: 10_000,
          cacheReadInputTokens: 20_000,
          cacheCreationInputTokens: 1_000
        },
        pricing: {
          inputUsdPerMillionTokens: 3,
          outputUsdPerMillionTokens: 15,
          cacheReadInputUsdPerMillionTokens: 0.3,
          cacheCreationInputUsdPerMillionTokens: 3.75
        }
      }
    });

    expect(manifest).toMatchObject({
      source: "model_api",
      status: "executed",
      paidCall: true,
      ledger: {
        summary: {
          modelRuns: 1,
          scriptedRuns: 0,
          totalCostUsd: 0.30975
        },
        runs: [
          {
            source: "model_api",
            provider: "anthropic",
            model: "claude-sonnet-4-20250514",
            computedCostUsd: 0.30975
          }
        ],
        warnings: []
      }
    });
  });
});
