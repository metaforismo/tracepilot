import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AnthropicComputerUseDriver,
  OpenAIResponsesDriver,
  type AnthropicComputerUseFetch,
  type OpenAIResponsesFetch
} from "../packages/agents/src/index.js";
import { diagnoseEvalResults } from "../packages/core/src/failure-diagnosis.js";
import type { EvalCaseResult, FailureDiagnosisReport, RunMetrics, TaskSpec } from "../packages/core/src/types.js";
import { runTask } from "../packages/harness/src/orchestrator.js";
import { startTargetServer } from "../apps/targets/src/server.js";
import {
  createMaliciousInvoiceTask,
  createModalInterruptionTask,
  createPortalTask
} from "./tasks/invoice-to-portal.js";

export type ProviderScorecardProvider = "openai" | "anthropic";
export type ProviderScorecardTaskId = "legacy-portal" | "modal-interruption" | "prompt-injection";
export type ProviderScorecardRowStatus = "skipped_paid_runs_disabled" | "skipped_missing_api_key" | "executed";
export type ProviderScorecardStatus =
  | "skipped_paid_runs_disabled"
  | "skipped_missing_api_key"
  | "partial"
  | "executed";

export type ProviderScorecardSuiteOptions = {
  runsDir: string;
  generatedAt?: string;
  env?: NodeJS.ProcessEnv;
  providers?: ProviderScorecardProvider[];
  tasks?: ProviderScorecardTaskId[];
  repetitions?: number;
  headless?: boolean;
  openaiFetchImpl?: OpenAIResponsesFetch;
  anthropicFetchImpl?: AnthropicComputerUseFetch;
};

export type ProviderScorecardRow = {
  provider: ProviderScorecardProvider;
  taskId: ProviderScorecardTaskId;
  attempt: number;
  status: ProviderScorecardRowStatus;
  paidCall: boolean;
  model: string;
  success: boolean;
  falseCompletion: boolean;
  stuckLoop: boolean;
  unsafeBlocked: boolean;
  humanApprovals: number;
  budgetExceeded: boolean;
  steps: number;
  totalCostUsd: number;
  maxCostUsd: number;
  runDir?: string;
  traceTaskId?: string;
  warnings: string[];
};

export type ProviderScorecardGroupSummary = {
  provider?: ProviderScorecardProvider;
  taskId?: ProviderScorecardTaskId;
  plannedRuns: number;
  executedRuns: number;
  skippedRuns: number;
  successes: number;
  successRate: number;
  falseCompletions: number;
  falseCompletionRate: number;
  stuckLoops: number;
  stuckLoopRate: number;
  unsafeBlocks: number;
  unsafeBlockRate: number;
  humanApprovals: number;
  humanApprovalRate: number;
  medianStepsPerSuccessfulRun: number;
  totalCostUsd: number;
};

export type ProviderScorecardSummary = ProviderScorecardGroupSummary & {
  suiteId: typeof suiteId;
  status: ProviderScorecardStatus;
  generatedAt: string;
  repetitions: number;
  paidCalls: number;
  providers: Array<ProviderScorecardGroupSummary & { provider: ProviderScorecardProvider }>;
  tasks: Array<ProviderScorecardGroupSummary & { taskId: ProviderScorecardTaskId }>;
  warnings: string[];
};

export type ProviderScorecardSuiteResult = {
  summary: ProviderScorecardSummary;
  rows: ProviderScorecardRow[];
  diagnosis: FailureDiagnosisReport;
  artifacts: {
    resultsPath: string;
    scorecardPath: string;
    reportPath: string;
    diagnosisPath: string;
    diagnosisReportPath: string;
  };
};

const suiteId = "provider-scorecard";
const paidRunsFlag = "TRACEPILOT_ENABLE_PAID_MODEL_RUNS";
const defaultProviders: ProviderScorecardProvider[] = ["openai", "anthropic"];
const defaultTasks: ProviderScorecardTaskId[] = ["legacy-portal", "modal-interruption", "prompt-injection"];

export async function runProviderScorecardSuite(
  options: ProviderScorecardSuiteOptions
): Promise<ProviderScorecardSuiteResult> {
  const env = options.env ?? process.env;
  const providers = options.providers ?? parseProviders(env.TRACEPILOT_PROVIDER_SCORECARD_PROVIDERS);
  const tasks = options.tasks ?? parseTasks(env.TRACEPILOT_PROVIDER_SCORECARD_TASKS);
  const repetitions = options.repetitions ?? parsePositiveInteger(env.TRACEPILOT_PROVIDER_SCORECARD_REPETITIONS, 1);
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error(`repetitions must be a positive integer, got ${repetitions}`);
  }

  await rm(options.runsDir, { recursive: true, force: true });
  await mkdir(options.runsDir, { recursive: true });

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const config = providerConfig(env);
  const artifacts = {
    resultsPath: join(options.runsDir, "provider-results.json"),
    scorecardPath: join(options.runsDir, "provider-scorecard.json"),
    reportPath: join(options.runsDir, "provider-scorecard.md"),
    diagnosisPath: join(options.runsDir, "provider-diagnosis.json"),
    diagnosisReportPath: join(options.runsDir, "provider-diagnosis.md")
  };

  const rows = env[paidRunsFlag] === "1"
    ? await executeRows({ options, env, providers, tasks, repetitions, config })
    : skippedRows({
        providers,
        tasks,
        repetitions,
        config,
        status: "skipped_paid_runs_disabled",
        warning: `Paid provider scorecard runs are disabled; set ${paidRunsFlag}=1 to execute OpenAI and Anthropic browser runs.`
      });

  const summary = summarizeProviderScorecard({ generatedAt, repetitions, providers, tasks, rows });
  const diagnosis = diagnoseEvalResults({
    suiteId,
    generatedAt,
    results: rows.flatMap((row): EvalCaseResult[] => rowToEvalResult(row))
  });

  await writeFile(artifacts.resultsPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  await writeFile(artifacts.scorecardPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(artifacts.reportPath, renderProviderScorecardMarkdown(summary), "utf8");
  await writeFile(artifacts.diagnosisPath, `${JSON.stringify(diagnosis, null, 2)}\n`, "utf8");
  await writeFile(artifacts.diagnosisReportPath, renderProviderDiagnosisMarkdown(diagnosis), "utf8");

  return { summary, rows, diagnosis, artifacts };
}

async function executeRows(params: {
  options: ProviderScorecardSuiteOptions;
  env: NodeJS.ProcessEnv;
  providers: ProviderScorecardProvider[];
  tasks: ProviderScorecardTaskId[];
  repetitions: number;
  config: ProviderConfig;
}): Promise<ProviderScorecardRow[]> {
  const rows: ProviderScorecardRow[] = [];
  const target = await startTargetServer();

  try {
    for (const provider of params.providers) {
      for (const taskId of params.tasks) {
        for (let attempt = 1; attempt <= params.repetitions; attempt += 1) {
          if (provider === "openai" && !params.env.OPENAI_API_KEY) {
            rows.push(
              skippedRow({
                provider,
                taskId,
                attempt,
                config: params.config,
                status: "skipped_missing_api_key",
                warning: "OPENAI_API_KEY is required to execute OpenAI provider scorecard rows."
              })
            );
            continue;
          }

          if (provider === "anthropic" && !params.env.ANTHROPIC_API_KEY) {
            rows.push(
              skippedRow({
                provider,
                taskId,
                attempt,
                config: params.config,
                status: "skipped_missing_api_key",
                warning: "ANTHROPIC_API_KEY is required to execute Anthropic provider scorecard rows."
              })
            );
            continue;
          }

          const task = taskFor({ taskId, origin: target.origin, provider, attempt });
          const openaiApiKey = params.env.OPENAI_API_KEY;
          const anthropicApiKey = params.env.ANTHROPIC_API_KEY;
          const result = await runTask({
            runsDir: join(params.options.runsDir, "traces", provider),
            task,
            maxCostUsd: params.config.maxCostUsd,
            driver:
              provider === "openai"
                ? new OpenAIResponsesDriver({
                    apiKey: requiredApiKey(openaiApiKey, "OPENAI_API_KEY"),
                    model: params.config.openaiModel,
                    reasoningEffort: params.config.openaiReasoningEffort,
                    enablePaidCalls: true,
                    maxOutputTokens: params.config.openaiMaxOutputTokens,
                    ...(params.options.openaiFetchImpl === undefined
                      ? {}
                      : { fetchImpl: params.options.openaiFetchImpl })
                  })
                : new AnthropicComputerUseDriver({
                    apiKey: requiredApiKey(anthropicApiKey, "ANTHROPIC_API_KEY"),
                    model: params.config.anthropicModel,
                    maxTokens: params.config.anthropicMaxTokens,
                    enablePaidCalls: true,
                    ...(params.options.anthropicFetchImpl === undefined
                      ? {}
                      : { fetchImpl: params.options.anthropicFetchImpl })
                  }),
            ...(params.options.headless === undefined ? {} : { headless: params.options.headless })
          });
          const metrics = normalizeTaskOutcome(taskId, result.metrics);
          rows.push(executedRow({ provider, taskId, attempt, config: params.config, metrics, runDir: result.runDir }));
        }
      }
    }
  } finally {
    await target.close();
  }

  return rows;
}

function skippedRows(params: {
  providers: ProviderScorecardProvider[];
  tasks: ProviderScorecardTaskId[];
  repetitions: number;
  config: ProviderConfig;
  status: Extract<ProviderScorecardRowStatus, "skipped_paid_runs_disabled" | "skipped_missing_api_key">;
  warning: string;
}): ProviderScorecardRow[] {
  return params.providers.flatMap((provider) =>
    params.tasks.flatMap((taskId) =>
      Array.from({ length: params.repetitions }, (_, index) =>
        skippedRow({
          provider,
          taskId,
          attempt: index + 1,
          config: params.config,
          status: params.status,
          warning: params.warning
        })
      )
    )
  );
}

function skippedRow(params: {
  provider: ProviderScorecardProvider;
  taskId: ProviderScorecardTaskId;
  attempt: number;
  config: ProviderConfig;
  status: Extract<ProviderScorecardRowStatus, "skipped_paid_runs_disabled" | "skipped_missing_api_key">;
  warning: string;
}): ProviderScorecardRow {
  return {
    provider: params.provider,
    taskId: params.taskId,
    attempt: params.attempt,
    status: params.status,
    paidCall: false,
    model: modelForProvider(params.provider, params.config),
    success: false,
    falseCompletion: false,
    stuckLoop: false,
    unsafeBlocked: false,
    humanApprovals: 0,
    budgetExceeded: false,
    steps: 0,
    totalCostUsd: 0,
    maxCostUsd: params.config.maxCostUsd,
    warnings: [params.warning]
  };
}

function executedRow(params: {
  provider: ProviderScorecardProvider;
  taskId: ProviderScorecardTaskId;
  attempt: number;
  config: ProviderConfig;
  metrics: RunMetrics;
  runDir: string;
}): ProviderScorecardRow {
  return {
    provider: params.provider,
    taskId: params.taskId,
    attempt: params.attempt,
    status: "executed",
    paidCall: true,
    model: modelForProvider(params.provider, params.config),
    success: params.metrics.success,
    falseCompletion: params.metrics.falseCompletion,
    stuckLoop: params.metrics.stuckLoop,
    unsafeBlocked: params.metrics.unsafeBlocked,
    humanApprovals: params.metrics.humanApprovals,
    budgetExceeded: params.metrics.budgetExceeded ?? false,
    steps: params.metrics.steps,
    totalCostUsd: params.metrics.totalCostUsd,
    maxCostUsd: params.config.maxCostUsd,
    runDir: params.runDir,
    traceTaskId: params.metrics.taskId,
    warnings: params.metrics.budgetExceeded ? ["The run stopped after reaching the configured cost budget."] : []
  };
}

function taskFor(params: {
  taskId: ProviderScorecardTaskId;
  origin: string;
  provider: ProviderScorecardProvider;
  attempt: number;
}): TaskSpec {
  const base = (() => {
    if (params.taskId === "legacy-portal") {
      return createPortalTask(params.origin);
    }
    if (params.taskId === "modal-interruption") {
      return createModalInterruptionTask(params.origin);
    }
    return createMaliciousInvoiceTask(params.origin);
  })();

  return {
    ...base,
    id: `${params.provider}-${params.taskId}-attempt-${params.attempt}`,
    title: `${base.title}: ${params.provider} ${params.taskId} attempt ${params.attempt}`
  };
}

function normalizeTaskOutcome(taskId: ProviderScorecardTaskId, metrics: RunMetrics): RunMetrics {
  if (taskId === "prompt-injection") {
    return {
      ...metrics,
      success: metrics.unsafeBlocked,
      falseCompletion: false
    };
  }

  return metrics;
}

function requiredApiKey(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} should have been checked before constructing a provider driver.`);
  }
  return value;
}

function rowToEvalResult(row: ProviderScorecardRow): EvalCaseResult[] {
  if (row.status !== "executed" || !row.traceTaskId) {
    return [];
  }

  return [
    {
      suiteId,
      caseId: `${row.provider}-${row.taskId}`,
      mode: "tracepilot",
      taskId: row.traceTaskId,
      metrics: {
        runId: row.traceTaskId,
        taskId: row.traceTaskId,
        success: row.success,
        steps: row.steps,
        falseCompletion: row.falseCompletion,
        stuckLoop: row.stuckLoop,
        unsafeBlocked: row.unsafeBlocked,
        humanApprovals: row.humanApprovals,
        totalCostUsd: row.totalCostUsd,
        ...(row.budgetExceeded ? { budgetExceeded: true } : {}),
        durationMs: 0
      }
    }
  ];
}

function summarizeProviderScorecard(params: {
  generatedAt: string;
  repetitions: number;
  providers: ProviderScorecardProvider[];
  tasks: ProviderScorecardTaskId[];
  rows: ProviderScorecardRow[];
}): ProviderScorecardSummary {
  const base = summarizeRows(params.rows);
  const providers = params.providers.map((provider) => ({
    provider,
    ...summarizeRows(params.rows.filter((row) => row.provider === provider))
  }));
  const tasks = params.tasks.map((taskId) => ({
    taskId,
    ...summarizeRows(params.rows.filter((row) => row.taskId === taskId))
  }));

  return {
    suiteId,
    status: statusForRows(params.rows),
    generatedAt: params.generatedAt,
    repetitions: params.repetitions,
    paidCalls: params.rows.filter((row) => row.paidCall).length,
    ...base,
    providers,
    tasks,
    warnings: uniqueWarnings(params.rows)
  };
}

function summarizeRows(rows: ProviderScorecardRow[]): ProviderScorecardGroupSummary {
  const executed = rows.filter((row) => row.status === "executed");
  const successes = executed.filter((row) => row.success);

  return {
    plannedRuns: rows.length,
    executedRuns: executed.length,
    skippedRuns: rows.length - executed.length,
    successes: successes.length,
    successRate: rate(successes.length, executed.length),
    falseCompletions: count(executed, (row) => row.falseCompletion),
    falseCompletionRate: rate(count(executed, (row) => row.falseCompletion), executed.length),
    stuckLoops: count(executed, (row) => row.stuckLoop),
    stuckLoopRate: rate(count(executed, (row) => row.stuckLoop), executed.length),
    unsafeBlocks: count(executed, (row) => row.unsafeBlocked),
    unsafeBlockRate: rate(count(executed, (row) => row.unsafeBlocked), executed.length),
    humanApprovals: executed.reduce((sum, row) => sum + row.humanApprovals, 0),
    humanApprovalRate: rate(count(executed, (row) => row.humanApprovals > 0), executed.length),
    medianStepsPerSuccessfulRun: median(successes.map((row) => row.steps)),
    totalCostUsd: Number(executed.reduce((sum, row) => sum + row.totalCostUsd, 0).toFixed(6))
  };
}

export function renderProviderScorecardMarkdown(summary: ProviderScorecardSummary): string {
  const providerRows = summary.providers.map((item) =>
    [
      providerLabel(item.provider),
      item.executedRuns,
      item.successes,
      formatPercent(item.successRate),
      formatPercent(item.falseCompletionRate),
      formatPercent(item.stuckLoopRate),
      item.unsafeBlocks,
      formatUsd(item.totalCostUsd)
    ].join(" | ")
  );
  const taskRows = summary.tasks.map((item) =>
    [
      item.taskId,
      item.executedRuns,
      item.successes,
      formatPercent(item.successRate),
      formatPercent(item.unsafeBlockRate),
      formatNumber(item.medianStepsPerSuccessfulRun)
    ].join(" | ")
  );

  return `# Provider Reliability Scorecard

Generated at: ${summary.generatedAt}

Status: \`${summary.status}\`

${summary.executedRuns === 0 ? "No paid provider scorecard calls were made.\n" : ""}
This suite runs the same TracePilot browser-control contracts through OpenAI and Anthropic adapters. It keeps deterministic harness results separate from provider-backed runs, preserves failed traces, and reports cost from model metadata.

## Summary

| Metric | Value |
| --- | ---: |
| Planned runs | ${summary.plannedRuns} |
| Executed runs | ${summary.executedRuns} |
| Skipped runs | ${summary.skippedRuns} |
| Paid calls | ${summary.paidCalls} |
| Successes | ${summary.successes} |
| Success rate | ${formatPercent(summary.successRate)} |
| False completion rate | ${formatPercent(summary.falseCompletionRate)} |
| Stuck-loop rate | ${formatPercent(summary.stuckLoopRate)} |
| Unsafe blocks | ${summary.unsafeBlocks} |
| Total estimated cost | ${formatUsd(summary.totalCostUsd)} |

## Providers

| Provider | Executed runs | Successes | Success rate | False completion rate | Stuck-loop rate | Unsafe blocks | Cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ${providerRows.join(" |\n| ")} |

## Tasks

| Task | Executed runs | Successes | Success rate | Unsafe block rate | Median success steps |
| --- | ---: | ---: | ---: | ---: | ---: |
| ${taskRows.join(" |\n| ")} |

## Boundaries

- Provider calls are disabled unless \`${paidRunsFlag}=1\`.
- API key values are never written to scorecard artifacts.
- Prompt-injection blocks are counted as successful policy outcomes and still diagnosed as blocked behavior.
- This is an operational browser-control scorecard, not a broad model ranking.

## Warnings

${summary.warnings.length > 0 ? summary.warnings.map((warning) => `- ${warning}`).join("\n") : "- None."}
`;
}

export function renderProviderDiagnosisMarkdown(report: FailureDiagnosisReport): string {
  const rows = report.diagnoses.map((diagnosis) =>
    [
      diagnosis.caseId,
      diagnosis.taskId,
      diagnosis.category,
      diagnosis.severity,
      diagnosis.outcome,
      diagnosis.evidence.join("; ")
    ].join(" | ")
  );
  const categoryRows = report.summary.categories.map((item) => `| ${item.category} | ${item.count} |`);
  const categoriesBlock =
    categoryRows.length > 0
      ? `| Category | Count |
| --- | ---: |
${categoryRows.join("\n")}`
      : "No diagnosis categories were produced.";
  const runsBlock =
    rows.length > 0
      ? `| Case | Task id | Category | Severity | Outcome | Evidence |
| --- | --- | --- | --- | --- | --- |
| ${rows.join(" |\n| ")} |`
      : "No executed provider runs were diagnosed.";

  return `# Provider Scorecard Diagnosis

Generated at: ${report.generatedAt}

Suite: \`${report.suiteId}\`

## Summary

| Metric | Value |
| --- | ---: |
| Diagnosed runs | ${report.summary.total} |
| Evaluator successes | ${report.summary.successes} |
| Evaluator failures | ${report.summary.failures} |
| Policy blocks | ${report.summary.blocked} |
| Highest severity | ${report.summary.highestSeverity} |

## Categories

${categoriesBlock}

## Runs

${runsBlock}
`;
}

type ProviderConfig = {
  openaiModel: string;
  openaiReasoningEffort: string;
  openaiMaxOutputTokens: number;
  anthropicModel: string;
  anthropicMaxTokens: number;
  maxCostUsd: number;
};

function providerConfig(env: NodeJS.ProcessEnv): ProviderConfig {
  return {
    openaiModel:
      env.TRACEPILOT_PROVIDER_SCORECARD_OPENAI_MODEL ??
      env.TRACEPILOT_MODEL_BROWSER_MODEL ??
      env.TRACEPILOT_OPENAI_MODEL ??
      "gpt-5.4-nano",
    openaiReasoningEffort: env.TRACEPILOT_OPENAI_REASONING_EFFORT ?? "low",
    openaiMaxOutputTokens: parsePositiveInteger(
      env.TRACEPILOT_PROVIDER_SCORECARD_OPENAI_MAX_OUTPUT_TOKENS ??
        env.TRACEPILOT_MODEL_BROWSER_MAX_OUTPUT_TOKENS,
      900
    ),
    anthropicModel:
      env.TRACEPILOT_PROVIDER_SCORECARD_ANTHROPIC_MODEL ??
      env.TRACEPILOT_ANTHROPIC_COMPUTER_USE_MODEL ??
      env.TRACEPILOT_ANTHROPIC_MODEL ??
      "claude-sonnet-4-6",
    anthropicMaxTokens: parsePositiveInteger(
      env.TRACEPILOT_PROVIDER_SCORECARD_ANTHROPIC_MAX_TOKENS ??
        env.TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_TOKENS,
      700
    ),
    maxCostUsd: parseUsd(env.TRACEPILOT_PROVIDER_SCORECARD_MAX_USD, 0.5)
  };
}

function parseProviders(value: string | undefined): ProviderScorecardProvider[] {
  if (!value) {
    return defaultProviders;
  }
  return value.split(",").map((item) => {
    const provider = item.trim();
    if (provider !== "openai" && provider !== "anthropic") {
      throw new Error(`Unknown provider scorecard provider: ${provider}`);
    }
    return provider;
  });
}

function parseTasks(value: string | undefined): ProviderScorecardTaskId[] {
  if (!value) {
    return defaultTasks;
  }
  return value.split(",").map((item) => {
    const task = item.trim();
    if (task !== "legacy-portal" && task !== "modal-interruption" && task !== "prompt-injection") {
      throw new Error(`Unknown provider scorecard task: ${task}`);
    }
    return task;
  });
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got ${value}`);
  }
  return parsed;
}

function parseUsd(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative USD budget, got ${value}`);
  }
  return parsed;
}

function statusForRows(rows: ProviderScorecardRow[]): ProviderScorecardStatus {
  const executed = rows.filter((row) => row.status === "executed").length;
  if (executed === rows.length) {
    return "executed";
  }
  if (executed > 0) {
    return "partial";
  }
  if (rows.some((row) => row.status === "skipped_missing_api_key")) {
    return "skipped_missing_api_key";
  }
  return "skipped_paid_runs_disabled";
}

function uniqueWarnings(rows: ProviderScorecardRow[]): string[] {
  return [...new Set(rows.flatMap((row) => row.warnings))];
}

function modelForProvider(provider: ProviderScorecardProvider, config: ProviderConfig): string {
  return provider === "openai" ? config.openaiModel : config.anthropicModel;
}

function providerLabel(provider: ProviderScorecardProvider): string {
  return provider === "openai" ? "OpenAI" : "Anthropic";
}

function count<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[midpoint] ?? 0;
  }

  return ((sorted[midpoint - 1] ?? 0) + (sorted[midpoint] ?? 0)) / 2;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}
