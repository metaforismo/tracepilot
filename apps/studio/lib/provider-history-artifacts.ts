import { readFile } from "node:fs/promises";
import { join } from "node:path";
import providerRowsFixture from "../fixtures/scorecards/provider-results.json";
import {
  buildProviderHistory,
  validateProviderHistory,
  type ProviderHistoryResult,
  type ProviderHistoryRow
} from "@tracepilot/core/provider-history";

const generatedHistoryPath = join(
  process.cwd(),
  "..",
  "..",
  "runs",
  "history",
  "provider-scorecard",
  "provider-history.json"
);

export async function loadProviderHistory(): Promise<ProviderHistoryResult> {
  try {
    const text = await readFile(/* turbopackIgnore: true */ generatedHistoryPath, "utf8");
    const value = JSON.parse(text) as unknown;
    try {
      validateProviderHistory(value);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Provider history at ${generatedHistoryPath} is invalid: ${reason}`);
    }
    return value;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    return fixtureHistory();
  }
}

function fixtureHistory(): ProviderHistoryResult {
  const currentRows = (providerRowsFixture as ProviderHistoryRow[]).map(copyHistoryRow);
  const baselineRows = currentRows.map((row) => ({
    ...row,
    model: row.model === "claude-sonnet-4-6" ? "claude-sonnet-4-5" : row.model,
    success: true,
    stuckLoop: false,
    falseCompletion: false,
    totalCostUsd: baselineCost(row.taskId)
  }));

  return buildProviderHistory([
    {
      generatedAt: "2026-06-25T16:37:32.578Z",
      label: "Previous provider baseline",
      revision: "fixture-baseline",
      source: "fixture",
      rows: baselineRows
    },
    {
      generatedAt: "2026-06-28T16:37:32.578Z",
      label: "Current committed scorecard",
      revision: "fixture-current",
      source: "fixture",
      rows: currentRows
    }
  ]);
}

function copyHistoryRow(row: ProviderHistoryRow): ProviderHistoryRow {
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

function baselineCost(taskId: string): number {
  if (taskId === "legacy-portal") return 0.06;
  if (taskId === "modal-interruption") return 0.05;
  return 0.025;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
