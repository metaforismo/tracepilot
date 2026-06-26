import type { CostLedger, CostLedgerRun, CostLedgerRunWithCost, ModelPricing, TokenUsage } from "./types.js";

export function buildCostLedger(params: {
  experimentId: string;
  generatedAt: string;
  runs: CostLedgerRun[];
}): CostLedger {
  const runs = params.runs.map((run) => withComputedCost(run));
  const modelRuns = runs.filter((run) => run.driverKind === "model");
  const scriptedRuns = runs.filter((run) => run.driverKind === "scripted");
  const successfulModelRuns = modelRuns.filter((run) => run.success);
  const totalCostUsd = roundUsd(modelRuns.reduce((sum, run) => sum + run.computedCostUsd, 0));

  return {
    experimentId: params.experimentId,
    generatedAt: params.generatedAt,
    runs,
    summary: {
      runs: runs.length,
      scriptedRuns: scriptedRuns.length,
      modelRuns: modelRuns.length,
      successfulModelRuns: successfulModelRuns.length,
      totalInputTokens: sumUsage(modelRuns, "inputTokens"),
      totalOutputTokens: sumUsage(modelRuns, "outputTokens"),
      totalCacheReadInputTokens: sumUsage(modelRuns, "cacheReadInputTokens"),
      totalCacheCreationInputTokens: sumUsage(modelRuns, "cacheCreationInputTokens"),
      totalCostUsd,
      costPerSuccessfulModelRunUsd:
        successfulModelRuns.length === 0 ? 0 : roundUsd(totalCostUsd / successfulModelRuns.length)
    },
    warnings: warningsFor(runs)
  };
}

function withComputedCost(run: CostLedgerRun): CostLedgerRunWithCost {
  if (run.driverKind === "scripted") {
    if (run.source && run.source !== "scripted_control") {
      throw new Error("Scripted runs must use source scripted_control.");
    }

    return {
      ...run,
      source: run.source ?? "scripted_control",
      computedCostUsd: 0
    };
  }

  if (!run.provider || !run.model || !run.usage || !run.pricing || !run.source) {
    throw new Error("Model runs require provider, model, usage, pricing, and source.");
  }

  if (run.source === "scripted_control") {
    throw new Error("Model runs must use source model_api, model_fixture, or dry_run.");
  }

  validateTokenUsage(run.usage);
  validatePricing(run.pricing);

  return {
    ...run,
    source: run.source,
    computedCostUsd: computeTokenCostUsd(run.usage, run.pricing)
  };
}

export function computeTokenCostUsd(usage: TokenUsage, pricing: ModelPricing): number {
  const input = costFor(usage.inputTokens, pricing.inputUsdPerMillionTokens);
  const output = costFor(usage.outputTokens, pricing.outputUsdPerMillionTokens);
  const cacheRead = costFor(usage.cacheReadInputTokens ?? 0, pricing.cacheReadInputUsdPerMillionTokens ?? 0);
  const cacheCreation = costFor(
    usage.cacheCreationInputTokens ?? 0,
    pricing.cacheCreationInputUsdPerMillionTokens ?? pricing.inputUsdPerMillionTokens
  );

  return roundUsd(input + output + cacheRead + cacheCreation);
}

function costFor(tokens: number, usdPerMillionTokens: number): number {
  return (tokens / 1_000_000) * usdPerMillionTokens;
}

function validateTokenUsage(usage: TokenUsage): void {
  const values = [
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheReadInputTokens ?? 0,
    usage.cacheCreationInputTokens ?? 0
  ];

  if (values.some((value) => !Number.isFinite(value) || value < 0 || !Number.isInteger(value))) {
    throw new Error("Token usage values must be finite non-negative integers.");
  }
}

function validatePricing(pricing: ModelPricing): void {
  const values = [
    pricing.inputUsdPerMillionTokens,
    pricing.outputUsdPerMillionTokens,
    pricing.cacheReadInputUsdPerMillionTokens ?? 0,
    pricing.cacheCreationInputUsdPerMillionTokens ?? 0
  ];

  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Pricing values must be finite non-negative numbers.");
  }
}

function sumUsage(
  runs: CostLedgerRunWithCost[],
  key: "inputTokens" | "outputTokens" | "cacheReadInputTokens" | "cacheCreationInputTokens"
): number {
  return runs.reduce((sum, run) => sum + (run.usage?.[key] ?? 0), 0);
}

function warningsFor(runs: CostLedgerRunWithCost[]): string[] {
  const hasNonApiModelRun = runs.some((run) => run.driverKind === "model" && run.source !== "model_api");
  return hasNonApiModelRun
    ? [
        "Ledger includes fixture or dry-run model costs; do not report as paid production results unless source is model_api."
      ]
    : [];
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}
