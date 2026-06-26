import { buildCostLedger } from "./cost-ledger.js";
import type { ModelProvider, ModelRunManifest, ModelRunResult } from "./types.js";

export type BuildModelRunManifestParams = {
  runId: string;
  suiteId: string;
  taskId: string;
  generatedAt: string;
  provider: ModelProvider;
  model: string;
  apiKeyEnvVar: string;
  paidRunsEnabled: boolean;
  apiKeyPresent: boolean;
  clientConfigured: boolean;
  request?: {
    reasoningEffort?: string;
  };
  result?: ModelRunResult;
};

export function buildModelRunManifest(params: BuildModelRunManifestParams): ModelRunManifest {
  const base = {
    runId: params.runId,
    suiteId: params.suiteId,
    taskId: params.taskId,
    provider: params.provider,
    model: params.model,
    generatedAt: params.generatedAt,
    environment: {
      apiKeyEnvVar: params.apiKeyEnvVar,
      apiKeyPresent: params.apiKeyPresent,
      clientConfigured: params.clientConfigured,
      paidRunsEnabled: params.paidRunsEnabled
    },
    ...(params.request === undefined ? {} : { request: params.request })
  };

  if (!params.paidRunsEnabled) {
    return {
      ...base,
      source: "dry_run",
      status: "skipped_paid_runs_disabled",
      paidCall: false,
      warnings: [
        "Paid model runs are disabled; set TRACEPILOT_ENABLE_PAID_MODEL_RUNS=1 to allow model_api execution."
      ]
    };
  }

  if (!params.apiKeyPresent) {
    return {
      ...base,
      source: "dry_run",
      status: "skipped_missing_api_key",
      paidCall: false,
      warnings: [`${params.apiKeyEnvVar} is required before a model_api run can execute.`]
    };
  }

  if (!params.clientConfigured) {
    return {
      ...base,
      source: "dry_run",
      status: "skipped_missing_client",
      paidCall: false,
      warnings: ["A model decision client is required before TracePilot can execute a model_api run."]
    };
  }

  if (!params.result) {
    throw new Error("Executed model_api manifests require result usage, pricing, duration, and success metadata.");
  }

  const ledger = buildCostLedger({
    experimentId: params.suiteId,
    generatedAt: params.generatedAt,
    runs: [
      {
        runId: params.runId,
        suiteId: params.suiteId,
        taskId: params.taskId,
        driverKind: "model",
        source: "model_api",
        provider: params.provider,
        model: params.model,
        usage: params.result.usage,
        pricing: params.result.pricing,
        durationMs: params.result.durationMs,
        success: params.result.success
      }
    ]
  });

  return {
    ...base,
    source: "model_api",
    status: "executed",
    paidCall: true,
    ledger,
    warnings: []
  };
}
