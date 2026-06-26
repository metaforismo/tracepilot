import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OpenAIResponsesDriver, type OpenAIResponsesFetch } from "../packages/agents/src/index.js";
import type { RunMetrics, TaskSpec } from "../packages/core/src/types.js";
import { runTask } from "../packages/harness/src/orchestrator.js";
import { startTargetServer } from "../apps/targets/src/server.js";
import { createModalInterruptionTask, createPortalTask } from "./tasks/invoice-to-portal.js";
import { createSmokeFormTask } from "./tasks/smoke-form.js";

export type ModelBrowserStatus = "skipped_paid_runs_disabled" | "skipped_missing_api_key" | "executed";

export type ModelBrowserSummary = {
  status: ModelBrowserStatus;
  generatedAt: string;
  paidCall: boolean;
  provider: "openai";
  model: string;
  reasoningEffort: string;
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

export type ModelBrowserSuiteResult = {
  summary: ModelBrowserSummary;
  metrics?: RunMetrics;
  artifacts: {
    summaryPath: string;
    reportPath: string;
  };
};

export type ModelBrowserSuiteOptions = {
  runsDir: string;
  generatedAt?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: OpenAIResponsesFetch;
};

const paidRunsFlag = "TRACEPILOT_ENABLE_PAID_MODEL_RUNS";

export async function runModelBrowserSuite(options: ModelBrowserSuiteOptions): Promise<ModelBrowserSuiteResult> {
  await rm(options.runsDir, { recursive: true, force: true });
  await mkdir(options.runsDir, { recursive: true });

  const env = options.env ?? process.env;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const model = env.TRACEPILOT_MODEL_BROWSER_MODEL ?? env.TRACEPILOT_OPENAI_MODEL ?? "gpt-5.4-nano";
  const reasoningEffort = env.TRACEPILOT_OPENAI_REASONING_EFFORT ?? "low";
  const taskId = env.TRACEPILOT_MODEL_BROWSER_TASK ?? "legacy-portal";
  const maxCostUsd = parseUsd(env.TRACEPILOT_MODEL_BROWSER_MAX_USD, 0.25);
  const maxOutputTokens = parsePositiveInteger(env.TRACEPILOT_MODEL_BROWSER_MAX_OUTPUT_TOKENS, 900);
  const artifacts = {
    summaryPath: join(options.runsDir, "model-browser-summary.json"),
    reportPath: join(options.runsDir, "model-browser-report.md")
  };

  if (env[paidRunsFlag] !== "1") {
    const summary = skippedSummary({
      status: "skipped_paid_runs_disabled",
      generatedAt,
      model,
      reasoningEffort,
      taskId,
      maxCostUsd,
      warning: `Paid model runs are disabled; set ${paidRunsFlag}=1 to execute the browser model suite.`
    });
    await writeArtifacts(artifacts, summary);
    return { summary, artifacts };
  }

  if (!env.OPENAI_API_KEY) {
    const summary = skippedSummary({
      status: "skipped_missing_api_key",
      generatedAt,
      model,
      reasoningEffort,
      taskId,
      maxCostUsd,
      warning: "OPENAI_API_KEY is required to execute the browser model suite."
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
      driver: new OpenAIResponsesDriver({
        apiKey: env.OPENAI_API_KEY,
        model,
        reasoningEffort,
        enablePaidCalls: true,
        maxOutputTokens,
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl })
      })
    });
    const summary: ModelBrowserSummary = {
      status: "executed",
      generatedAt,
      paidCall: true,
      provider: "openai",
      model,
      reasoningEffort,
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
  status: Extract<ModelBrowserStatus, "skipped_paid_runs_disabled" | "skipped_missing_api_key">;
  generatedAt: string;
  model: string;
  reasoningEffort: string;
  taskId: string;
  maxCostUsd: number;
  warning: string;
}): ModelBrowserSummary {
  return {
    status: params.status,
    generatedAt: params.generatedAt,
    paidCall: false,
    provider: "openai",
    model: params.model,
    reasoningEffort: params.reasoningEffort,
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

  throw new Error(`Unknown model-browser task: ${taskId}`);
}

async function writeArtifacts(artifacts: ModelBrowserSuiteResult["artifacts"], summary: ModelBrowserSummary): Promise<void> {
  await writeFile(artifacts.summaryPath, `${JSON.stringify({ summary }, null, 2)}\n`, "utf8");
  await writeFile(artifacts.reportPath, renderModelBrowserReport(summary), "utf8");
}

function renderModelBrowserReport(summary: ModelBrowserSummary): string {
  const warningRows = summary.warnings.map((warning) => `- ${warning}`);

  return `# Model Browser Run

Generated at: ${summary.generatedAt}

Status: \`${summary.status}\`

${summary.paidCall ? "" : "No paid model-browser call was made.\n"}
## Summary

| Metric | Value |
| --- | ---: |
| Status | \`${summary.status}\` |
| Paid call | ${summary.paidCall ? "yes" : "no"} |
| Provider | \`${summary.provider}\` |
| Model | \`${summary.model}\` |
| Reasoning effort | \`${summary.reasoningEffort}\` |
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

- OpenAI calls are disabled unless \`${paidRunsFlag}=1\`.
- Artifacts record key presence and model metadata, not API key values.
- Pricing source: [OpenAI API pricing](https://openai.com/api/pricing/), standard short-context prices per 1M tokens.
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
    throw new Error("TRACEPILOT_MODEL_BROWSER_MAX_USD must be a non-negative number.");
  }
  return parsed;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("TRACEPILOT_MODEL_BROWSER_MAX_OUTPUT_TOKENS must be a positive integer.");
  }
  return parsed;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}
