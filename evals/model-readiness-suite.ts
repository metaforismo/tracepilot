import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildModelRunManifest } from "../packages/core/src/model-run-manifest.js";
import type { ModelProvider, ModelRunManifest } from "../packages/core/src/types.js";
import { anthropicApiKeyEnvVar, hasAnthropicApiCredentials } from "../packages/agents/src/anthropic-api-config.js";

export type ModelReadinessSuiteOptions = {
  runsDir: string;
  generatedAt?: string;
  env?: NodeJS.ProcessEnv;
};

export type ModelReadinessSuiteResult = {
  manifest: ModelRunManifest;
  artifacts: {
    manifestPath: string;
    reportPath: string;
  };
};

const paidRunsFlag = "TRACEPILOT_ENABLE_PAID_MODEL_RUNS";

export async function runModelReadinessSuite(
  options: ModelReadinessSuiteOptions
): Promise<ModelReadinessSuiteResult> {
  await rm(options.runsDir, { recursive: true, force: true });
  await mkdir(options.runsDir, { recursive: true });

  const env = options.env ?? process.env;
  const provider = providerConfig(env);
  const manifest = buildModelRunManifest({
    runId: `${provider.provider}-model-readiness`,
    suiteId: "model-readiness",
    taskId: "invoice-portal-acme-1200",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    provider: provider.provider,
    model: provider.model,
    apiKeyEnvVar: provider.apiKeyEnvVar,
    paidRunsEnabled: env[paidRunsFlag] === "1",
    apiKeyPresent: provider.provider === "anthropic" ? hasAnthropicApiCredentials(env) : Boolean(env[provider.apiKeyEnvVar]),
    clientConfigured: false,
    ...(provider.reasoningEffort === undefined ? {} : { request: { reasoningEffort: provider.reasoningEffort } })
  });
  const artifacts = {
    manifestPath: join(options.runsDir, "model-run-manifest.json"),
    reportPath: join(options.runsDir, "model-run-readiness.md")
  };

  await writeFile(artifacts.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(artifacts.reportPath, renderModelReadinessReport(manifest), "utf8");

  return { manifest, artifacts };
}

export function renderModelReadinessReport(manifest: ModelRunManifest): string {
  const warningRows = manifest.warnings.map((warning) => `- ${warning}`);
  const ledgerLines = manifest.ledger
    ? [
        `- Model runs: ${manifest.ledger.summary.modelRuns}`,
        `- Total cost: ${formatUsd(manifest.ledger.summary.totalCostUsd)}`
      ]
    : ["- No model_api ledger was written."];

  return `# Model Run Readiness

Generated at: ${manifest.generatedAt}

No paid model call was made.

## Status

- Status: \`${manifest.status}\`
- Source: \`${manifest.source}\`
- Paid call: \`${manifest.paidCall}\`
- Provider: \`${manifest.provider}\`
- Model: \`${manifest.model}\`
${manifest.request?.reasoningEffort ? `- Reasoning effort: \`${manifest.request.reasoningEffort}\`\n` : ""}

## Environment Gate

Paid calls require \`${paidRunsFlag}=1\`.

| Gate | Value |
| --- | --- |
| Paid calls require \`${paidRunsFlag}=1\` | ${manifest.environment.paidRunsEnabled ? "yes" : "no"} |
| API key env var | \`${manifest.environment.apiKeyEnvVar}\` |
| API key present | ${manifest.environment.apiKeyPresent ? "yes" : "no"} |
| Model client configured | ${manifest.environment.clientConfigured ? "yes" : "no"} |

## Ledger

${ledgerLines.join("\n")}

## Warnings

${warningRows.length > 0 ? warningRows.join("\n") : "- None."}
`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}

function providerConfig(env: NodeJS.ProcessEnv): {
  provider: Extract<ModelProvider, "anthropic" | "openai">;
  model: string;
  apiKeyEnvVar: string;
  reasoningEffort?: string;
} {
  if (env.TRACEPILOT_MODEL_PROVIDER === "openai") {
    return {
      provider: "openai",
      model: env.TRACEPILOT_OPENAI_MODEL ?? "gpt-5.4-nano",
      apiKeyEnvVar: "OPENAI_API_KEY",
      reasoningEffort: env.TRACEPILOT_OPENAI_REASONING_EFFORT ?? "low"
    };
  }

  return {
    provider: "anthropic",
    model: env.TRACEPILOT_ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
    apiKeyEnvVar: anthropicApiKeyEnvVar(env)
  };
}
