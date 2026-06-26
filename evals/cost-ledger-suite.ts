import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildCostLedger } from "../packages/core/src/cost-ledger.js";
import type { CostLedger, CostLedgerRun } from "../packages/core/src/types.js";

export type CostLedgerSuiteOptions = {
  runsDir: string;
  generatedAt?: string;
};

export type CostLedgerSuiteResult = {
  ledger: CostLedger;
  artifacts: {
    ledgerPath: string;
    reportPath: string;
  };
};

export async function runCostLedgerSuite(options: CostLedgerSuiteOptions): Promise<CostLedgerSuiteResult> {
  await rm(options.runsDir, { recursive: true, force: true });
  await mkdir(options.runsDir, { recursive: true });

  const ledger = buildCostLedger({
    experimentId: "invoice-model-cost-ledger",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    runs: fixtureRuns()
  });
  const artifacts = {
    ledgerPath: join(options.runsDir, "model-cost-ledger.json"),
    reportPath: join(options.runsDir, "model-cost-report.md")
  };

  await writeFile(artifacts.ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await writeFile(artifacts.reportPath, renderModelCostReport(ledger), "utf8");

  return { ledger, artifacts };
}

function fixtureRuns(): CostLedgerRun[] {
  return [
    {
      runId: "scripted-control",
      suiteId: "invoice",
      taskId: "invoice-portal-acme-1200",
      driverKind: "scripted",
      source: "scripted_control",
      durationMs: 500,
      success: true
    },
    {
      runId: "model-fixture",
      suiteId: "invoice",
      taskId: "invoice-portal-acme-1200",
      driverKind: "model",
      source: "model_fixture",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
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
      },
      durationMs: 12_000,
      success: true
    }
  ];
}

export function renderModelCostReport(ledger: CostLedger): string {
  const rows = ledger.runs.map((run) =>
    [
      runLabel(run.runId),
      run.driverKind,
      run.source,
      run.provider ?? "n/a",
      run.model ?? "n/a",
      formatUsd(run.computedCostUsd)
    ].join(" | ")
  );
  const warningRows = ledger.warnings.map((warning) => `- ${warning}`);

  return `# Model Cost Ledger

Generated at: ${ledger.generatedAt}

This deterministic local suite records how TracePilot separates scripted controls from model runs before publishing any computer-use result.

## Readout

- No paid model call was made.
- Fixture/dry-run cost estimate only.
- Scripted controls are separated from model runs.

## Summary

| Metric | Value |
| --- | ---: |
| Runs | ${ledger.summary.runs} |
| Scripted controls | ${ledger.summary.scriptedRuns} |
| Model runs | ${ledger.summary.modelRuns} |
| Successful model runs | ${ledger.summary.successfulModelRuns} |
| Input tokens | ${ledger.summary.totalInputTokens} |
| Output tokens | ${ledger.summary.totalOutputTokens} |
| Cache-read input tokens | ${ledger.summary.totalCacheReadInputTokens} |
| Cache-creation input tokens | ${ledger.summary.totalCacheCreationInputTokens} |
| Total estimated model cost | ${formatUsd(ledger.summary.totalCostUsd)} |
| Cost per successful model run | ${formatUsd(ledger.summary.costPerSuccessfulModelRunUsd)} |

## Runs

| Run | Driver | Source | Provider | Model | Computed cost |
| --- | --- | --- | --- | --- | ---: |
| ${rows.join(" |\n| ")} |

## Warnings

${warningRows.length > 0 ? warningRows.join("\n") : "- None."}
`;
}

function runLabel(runId: string): string {
  return runId
    .split("-")
    .map((part, index) => (index === 0 ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}` : part))
    .join(" ");
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}
