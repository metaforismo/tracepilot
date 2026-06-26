import { describe, expect, test } from "vitest";
import { buildCostLedger } from "../src/cost-ledger.js";
import type { CostLedgerRun, ModelPricing, TokenUsage } from "../src/types.js";

describe("buildCostLedger", () => {
  test("computes model costs and keeps scripted controls separate", () => {
    const ledger = buildCostLedger({
      experimentId: "invoice-model-smoke",
      generatedAt: "2026-06-26T00:00:00.000Z",
      runs: [
        scriptedRun("scripted-control"),
        modelRun()
      ]
    });

    expect(ledger).toMatchObject({
      experimentId: "invoice-model-smoke",
      generatedAt: "2026-06-26T00:00:00.000Z",
      summary: {
        runs: 2,
        scriptedRuns: 1,
        modelRuns: 1,
        successfulModelRuns: 1,
        totalInputTokens: 50_000,
        totalOutputTokens: 10_000,
        totalCacheReadInputTokens: 20_000,
        totalCacheCreationInputTokens: 1_000,
        totalCostUsd: 0.30975,
        costPerSuccessfulModelRunUsd: 0.30975
      }
    });
    expect(ledger.runs[0]).toMatchObject({
      driverKind: "scripted",
      computedCostUsd: 0
    });
    expect(ledger.runs[1]).toMatchObject({
      driverKind: "model",
      computedCostUsd: 0.30975
    });
    expect(ledger.warnings).toEqual([
      "Ledger includes fixture or dry-run model costs; do not report as paid production results unless source is model_api."
    ]);
  });

  test("requires model metadata, usage, and pricing for model runs", () => {
    expect(() =>
      buildCostLedger({
        experimentId: "bad-ledger",
        generatedAt: "2026-06-26T00:00:00.000Z",
        runs: [
          {
            runId: "missing-model-metadata",
            suiteId: "invoice",
            taskId: "invoice-portal-acme-1200",
            driverKind: "model",
            durationMs: 1,
            success: false
          }
        ]
      })
    ).toThrow("Model runs require provider, model, usage, pricing, and source.");
  });

  test("prevents source labels from crossing scripted and model runs", () => {
    expect(() =>
      buildCostLedger({
        experimentId: "bad-scripted-source",
        generatedAt: "2026-06-26T00:00:00.000Z",
        runs: [{ ...scriptedRun("scripted-as-model"), source: "model_fixture" }]
      })
    ).toThrow("Scripted runs must use source scripted_control.");

    expect(() =>
      buildCostLedger({
        experimentId: "bad-model-source",
        generatedAt: "2026-06-26T00:00:00.000Z",
        runs: [modelRun({ runId: "model-as-scripted", source: "scripted_control", durationMs: 1, success: false })]
      })
    ).toThrow("Model runs must use source model_api, model_fixture, or dry_run.");
  });

  test("rejects invalid token usage and pricing values", () => {
    expect(() =>
      buildCostLedger({
        experimentId: "bad-token-usage",
        generatedAt: "2026-06-26T00:00:00.000Z",
        runs: [modelRun({ usage: { inputTokens: -1 } })]
      })
    ).toThrow("Token usage values must be finite non-negative integers.");

    expect(() =>
      buildCostLedger({
        experimentId: "bad-pricing",
        generatedAt: "2026-06-26T00:00:00.000Z",
        runs: [modelRun({ pricing: { inputUsdPerMillionTokens: Number.NaN } })]
      })
    ).toThrow("Pricing values must be finite non-negative numbers.");
  });
});

type ModelRunOverrides = Partial<Omit<CostLedgerRun, "usage" | "pricing">> & {
  usage?: Partial<TokenUsage>;
  pricing?: Partial<ModelPricing>;
};

function modelRun(overrides: ModelRunOverrides = {}): CostLedgerRun {
  const usage = {
    inputTokens: 50_000,
    outputTokens: 10_000,
    cacheReadInputTokens: 20_000,
    cacheCreationInputTokens: 1_000,
    ...overrides.usage
  };
  const pricing = {
    inputUsdPerMillionTokens: 3,
    outputUsdPerMillionTokens: 15,
    cacheReadInputUsdPerMillionTokens: 0.3,
    cacheCreationInputUsdPerMillionTokens: 3.75,
    ...overrides.pricing
  };

  return {
    runId: "model-run-1",
    suiteId: "invoice",
    taskId: "invoice-portal-acme-1200",
    driverKind: "model",
    source: "model_fixture",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    durationMs: 12_000,
    success: true,
    ...overrides,
    usage,
    pricing
  };
}

function scriptedRun(runId: string): CostLedgerRun {
  return {
    runId,
    suiteId: "invoice",
    taskId: "invoice-portal-acme-1200",
    driverKind: "scripted",
    source: "scripted_control",
    durationMs: 500,
    success: true
  };
}
