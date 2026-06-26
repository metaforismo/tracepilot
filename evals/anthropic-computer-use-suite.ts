import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AnthropicComputerUseDriver, type AnthropicComputerUseFetch } from "../packages/agents/src/index.js";
import type { RunMetrics, TaskSpec } from "../packages/core/src/types.js";
import { runTask } from "../packages/harness/src/orchestrator.js";
import { startTargetServer } from "../apps/targets/src/server.js";
import { createModalInterruptionTask, createPortalTask } from "./tasks/invoice-to-portal.js";
import { createSmokeFormTask } from "./tasks/smoke-form.js";

export type AnthropicComputerUseStatus = "skipped_paid_runs_disabled" | "skipped_missing_api_key" | "executed";

export type AnthropicComputerUseSummary = {
  status: AnthropicComputerUseStatus;
  generatedAt: string;
  paidCall: boolean;
  provider: "anthropic";
  model: string;
  taskId: string;
  success: boolean;
  falseCompletion: boolean;
  stuckLoop: boolean;
  unsafeBlocked: boolean;
  budgetExceeded: boolean;
  steps: number;
  totalCostUsd: number;
  maxCostUsd: number;
  runDir?: string;
  warnings: string[];
};

export type AnthropicComputerUseSuiteResult = {
  summary: AnthropicComputerUseSummary;
  metrics?: RunMetrics;
  artifacts: {
    summaryPath: string;
    reportPath: string;
  };
};

export type AnthropicComputerUseSuiteOptions = {
  runsDir: string;
  generatedAt?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: AnthropicComputerUseFetch;
};

const paidRunsFlag = "TRACEPILOT_ENABLE_PAID_MODEL_RUNS";

export async function runAnthropicComputerUseSuite(
  options: AnthropicComputerUseSuiteOptions
): Promise<AnthropicComputerUseSuiteResult> {
  await rm(options.runsDir, { recursive: true, force: true });
  await mkdir(options.runsDir, { recursive: true });

  const env = options.env ?? process.env;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const model = env.TRACEPILOT_ANTHROPIC_COMPUTER_USE_MODEL ?? env.TRACEPILOT_ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const taskId = env.TRACEPILOT_ANTHROPIC_COMPUTER_USE_TASK ?? "legacy-portal";
  const maxCostUsd = parseUsd(env.TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_USD, 0.25);
  const maxTokens = parsePositiveInteger(env.TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_TOKENS, 700);
  const artifacts = {
    summaryPath: join(options.runsDir, "anthropic-computer-use-summary.json"),
    reportPath: join(options.runsDir, "anthropic-computer-use-report.md")
  };

  if (env[paidRunsFlag] !== "1") {
    const summary = skippedSummary({
      status: "skipped_paid_runs_disabled",
      generatedAt,
      model,
      taskId,
      maxCostUsd,
      warning: `Paid model runs are disabled; set ${paidRunsFlag}=1 to execute the Anthropic computer-use suite.`
    });
    await writeArtifacts(artifacts, summary);
    return { summary, artifacts };
  }

  if (!env.ANTHROPIC_API_KEY) {
    const summary = skippedSummary({
      status: "skipped_missing_api_key",
      generatedAt,
      model,
      taskId,
      maxCostUsd,
      warning: "ANTHROPIC_API_KEY is required to execute the Anthropic computer-use suite."
    });
    await writeArtifacts(artifacts, summary);
    return { summary, artifacts };
  }

  const target = await startTargetServer();
  try {
    const task = taskFor(taskId, target.origin);
    const result = await runTask({
      runsDir: options.runsDir,
      task,
      maxCostUsd,
      driver: new AnthropicComputerUseDriver({
        apiKey: env.ANTHROPIC_API_KEY,
        model,
        maxTokens,
        enablePaidCalls: true,
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl })
      })
    });
    const summary: AnthropicComputerUseSummary = {
      status: "executed",
      generatedAt,
      paidCall: true,
      provider: "anthropic",
      model,
      taskId,
      success: result.metrics.success,
      falseCompletion: result.metrics.falseCompletion,
      stuckLoop: result.metrics.stuckLoop,
      unsafeBlocked: result.metrics.unsafeBlocked,
      budgetExceeded: result.metrics.budgetExceeded ?? false,
      steps: result.metrics.steps,
      totalCostUsd: result.metrics.totalCostUsd,
      maxCostUsd,
      runDir: result.runDir,
      warnings: result.metrics.budgetExceeded ? ["The run stopped after reaching the configured cost budget."] : []
    };
    await writeArtifacts(artifacts, summary);
    return { summary, metrics: result.metrics, artifacts };
  } finally {
    await target.close();
  }
}

function skippedSummary(params: {
  status: Extract<AnthropicComputerUseStatus, "skipped_paid_runs_disabled" | "skipped_missing_api_key">;
  generatedAt: string;
  model: string;
  taskId: string;
  maxCostUsd: number;
  warning: string;
}): AnthropicComputerUseSummary {
  return {
    status: params.status,
    generatedAt: params.generatedAt,
    paidCall: false,
    provider: "anthropic",
    model: params.model,
    taskId: params.taskId,
    success: false,
    falseCompletion: false,
    stuckLoop: false,
    unsafeBlocked: false,
    budgetExceeded: false,
    steps: 0,
    totalCostUsd: 0,
    maxCostUsd: params.maxCostUsd,
    warnings: [params.warning]
  };
}

function taskFor(taskId: string, origin: string): TaskSpec {
  if (taskId === "legacy-portal") {
    return createPortalTask(origin);
  }
  if (taskId === "modal-interruption") {
    return createModalInterruptionTask(origin);
  }
  if (taskId === "smoke-form") {
    return createSmokeFormTask(origin);
  }

  throw new Error(`Unknown Anthropic computer-use task: ${taskId}`);
}

async function writeArtifacts(
  artifacts: AnthropicComputerUseSuiteResult["artifacts"],
  summary: AnthropicComputerUseSummary
): Promise<void> {
  await writeFile(artifacts.summaryPath, `${JSON.stringify({ summary }, null, 2)}\n`, "utf8");
  await writeFile(artifacts.reportPath, renderAnthropicComputerUseReport(summary), "utf8");
}

function renderAnthropicComputerUseReport(summary: AnthropicComputerUseSummary): string {
  const warningRows = summary.warnings.map((warning) => `- ${warning}`);

  return `# Anthropic Computer Use Run

Generated at: ${summary.generatedAt}

Status: \`${summary.status}\`

${summary.paidCall ? "" : "No paid Anthropic computer-use call was made.\n"}
## Summary

| Metric | Value |
| --- | ---: |
| Status | \`${summary.status}\` |
| Paid call | ${summary.paidCall ? "yes" : "no"} |
| Provider | \`${summary.provider}\` |
| Model | \`${summary.model}\` |
| Task | \`${summary.taskId}\` |
| Success | ${summary.success ? "yes" : "no"} |
| False completion | ${summary.falseCompletion ? "yes" : "no"} |
| Stuck loop | ${summary.stuckLoop ? "yes" : "no"} |
| Unsafe blocked | ${summary.unsafeBlocked ? "yes" : "no"} |
| Budget exceeded | ${summary.budgetExceeded ? "yes" : "no"} |
| Steps | ${summary.steps} |
| Total estimated cost | ${formatUsd(summary.totalCostUsd)} |
| Max configured cost | ${formatUsd(summary.maxCostUsd)} |

## Boundaries

- Anthropic calls are disabled unless \`${paidRunsFlag}=1\`.
- Artifacts record key presence and model metadata, not API key values.
- Computer-use request shape follows Anthropic's Messages API computer tool docs.
- Pricing source: [Anthropic pricing](https://docs.anthropic.com/en/docs/about-claude/pricing), standard first-party Claude API prices per MTok.
- This is a small operational browser run, not a broad benchmark ranking.

## Warnings

${warningRows.length > 0 ? warningRows.join("\n") : "- None."}
`;
}

function parseUsd(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_USD must be a non-negative number.");
  }
  return parsed;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_TOKENS must be a positive integer.");
  }
  return parsed;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}
