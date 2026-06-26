import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCostLedgerSuite } from "./cost-ledger-suite.js";

describe("runCostLedgerSuite", () => {
  test("writes explicit model cost accounting and a human-readable report", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-cost-ledger-"));

    const result = await runCostLedgerSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z"
    });

    expect(result.ledger).toMatchObject({
      experimentId: "invoice-model-cost-ledger",
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
    expect(result.ledger.runs[0]).toMatchObject({
      runId: "scripted-control",
      driverKind: "scripted",
      source: "scripted_control",
      computedCostUsd: 0
    });
    expect(result.ledger.runs[1]).toMatchObject({
      runId: "model-fixture",
      driverKind: "model",
      source: "model_fixture",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      computedCostUsd: 0.30975
    });

    const ledgerJson = await readFile(join(runsDir, "model-cost-ledger.json"), "utf8");
    expect(ledgerJson).toContain('"source": "model_fixture"');
    expect(ledgerJson).toContain('"totalCostUsd": 0.30975');

    const report = await readFile(join(runsDir, "model-cost-report.md"), "utf8");
    expect(report).toContain("# Model Cost Ledger");
    expect(report).toContain("No paid model call was made.");
    expect(report).toContain("Fixture/dry-run cost estimate only.");
    expect(report).toContain("Scripted controls are separated from model runs.");
    expect(report).toContain("| Model fixture | model | model_fixture | anthropic | claude-sonnet-4-20250514 | $0.309750 |");
  });
});
