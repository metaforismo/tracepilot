import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  appendProviderHistory,
  renderProviderHistoryMarkdown,
  validateProviderHistory,
  type ProviderHistoryResult,
  type ProviderHistoryRow
} from "../packages/core/src/provider-history.js";
import {
  atomicWriteText,
  historyDirectoryForRuns,
  readValidatedJsonIfExists,
  withHistoryFileLock
} from "./history-artifact-store.js";

export type ProviderScorecardHistoryRowInput = ProviderHistoryRow & {
  runDir?: string;
  traceTaskId?: string;
  warnings?: string[];
};

export type PersistProviderHistoryOptions = {
  runsDir: string;
  generatedAt: string;
  rows: ProviderScorecardHistoryRowInput[];
  warnings?: string[];
  historyDir?: string;
  label?: string;
  revision?: string;
  retention?: number;
};

export type ProviderHistoryArtifacts = {
  historyPath: string;
  historyReportPath: string;
};

export async function persistProviderHistory(
  options: PersistProviderHistoryOptions
): Promise<ProviderHistoryArtifacts> {
  const historyDir = options.historyDir ?? historyDirectoryForRuns(options.runsDir, "provider-scorecard");
  const artifacts = {
    historyPath: join(historyDir, "provider-history.json"),
    historyReportPath: join(historyDir, "provider-history.md")
  };
  await mkdir(historyDir, { recursive: true });

  await withHistoryFileLock(join(historyDir, ".provider-history.lock"), async () => {
    const previous = await readValidatedJsonIfExists<ProviderHistoryResult>(
      artifacts.historyPath,
      validateProviderHistory
    );
    const history = appendProviderHistory(
      previous,
      {
        generatedAt: options.generatedAt,
        rows: options.rows.map(toHistoryRow),
        source: "generated",
        ...(normalizedOptionalText(options.label) === undefined
          ? {}
          : { label: normalizedOptionalText(options.label)! }),
        ...(normalizedOptionalText(options.revision) === undefined
          ? {}
          : { revision: normalizedOptionalText(options.revision)! }),
        warnings: options.warnings ?? []
      },
      {
        generatedAt: options.generatedAt,
        ...(options.retention === undefined ? {} : { retention: options.retention })
      }
    );

    await Promise.all([
      atomicWriteText(artifacts.historyPath, `${JSON.stringify(history, null, 2)}\n`),
      atomicWriteText(artifacts.historyReportPath, renderProviderHistoryMarkdown(history))
    ]);
  });

  return artifacts;
}

function toHistoryRow(row: ProviderScorecardHistoryRowInput): ProviderHistoryRow {
  return {
    provider: row.provider,
    taskId: row.taskId,
    attempt: row.attempt,
    status: row.status,
    paidCall: row.paidCall,
    model: row.model,
    success: row.success,
    falseCompletion: row.falseCompletion,
    stuckLoop: row.stuckLoop,
    unsafeBlocked: row.unsafeBlocked,
    humanApprovals: row.humanApprovals,
    budgetExceeded: row.budgetExceeded,
    steps: row.steps,
    totalCostUsd: row.totalCostUsd,
    maxCostUsd: row.maxCostUsd
  };
}

function normalizedOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}
