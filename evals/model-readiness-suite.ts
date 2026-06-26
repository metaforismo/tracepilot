import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildModelRunManifest } from "../packages/core/src/model-run-manifest.js";
import type { ModelRunManifest } from "../packages/core/src/types.js";

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
const apiKeyEnvVar = "ANTHROPIC_API_KEY";

export async function runModelReadinessSuite(
  options: ModelReadinessSuiteOptions
): Promise<ModelReadinessSuiteResult> {
  await rm(options.runsDir, { recursive: true, force: true });
  await mkdir(options.runsDir, { recursive: true });

  const env = options.env ?? process.env;
  const manifest = buildModelRunManifest({
    runId: "anthropic-model-readiness",
    suiteId: "model-readiness",
    taskId: "invoice-portal-acme-1200",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    apiKeyEnvVar,
    paidRunsEnabled: env[paidRunsFlag] === "1",
    apiKeyPresent: Boolean(env[apiKeyEnvVar]),
    clientConfigured: false
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
