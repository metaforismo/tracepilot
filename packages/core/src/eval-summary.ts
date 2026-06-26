import type { EvalCaseResult, EvalComparisonSummary, EvalMode, EvalModeSummary } from "./types.js";

const orderedModes: EvalMode[] = ["baseline", "tracepilot"];

export function summarizeEvalComparison(params: {
  suiteId: string;
  generatedAt: string;
  results: EvalCaseResult[];
}): EvalComparisonSummary {
  const modes = orderedModes.map((mode) => summarizeMode(mode, params.results.filter((result) => result.mode === mode)));
  const baseline = modes.find((mode) => mode.mode === "baseline") ?? emptyMode("baseline");
  const tracepilot = modes.find((mode) => mode.mode === "tracepilot") ?? emptyMode("tracepilot");

  return {
    suiteId: params.suiteId,
    generatedAt: params.generatedAt,
    modes,
    deltas: {
      tracepilotMinusBaseline: {
        successRate: tracepilot.successRate - baseline.successRate,
        falseCompletionRate: tracepilot.falseCompletionRate - baseline.falseCompletionRate,
        stuckLoopRate: tracepilot.stuckLoopRate - baseline.stuckLoopRate,
        unsafeBlockRate: tracepilot.unsafeBlockRate - baseline.unsafeBlockRate,
        humanApprovalRate: tracepilot.humanApprovalRate - baseline.humanApprovalRate,
        medianStepsPerSuccessfulTask:
          tracepilot.medianStepsPerSuccessfulTask - baseline.medianStepsPerSuccessfulTask,
        costPerSuccessfulTaskUsd: tracepilot.costPerSuccessfulTaskUsd - baseline.costPerSuccessfulTaskUsd,
        medianDurationMs: tracepilot.medianDurationMs - baseline.medianDurationMs
      }
    }
  };
}

function summarizeMode(mode: EvalMode, results: EvalCaseResult[]): EvalModeSummary {
  if (results.length === 0) {
    return emptyMode(mode);
  }

  const metrics = results.map((result) => result.metrics);
  const successes = metrics.filter((metric) => metric.success);
  const successCount = successes.length;

  return {
    mode,
    runs: metrics.length,
    successes: successCount,
    successRate: rate(successCount, metrics.length),
    falseCompletions: count(metrics, (metric) => metric.falseCompletion),
    falseCompletionRate: rate(count(metrics, (metric) => metric.falseCompletion), metrics.length),
    stuckLoops: count(metrics, (metric) => metric.stuckLoop),
    stuckLoopRate: rate(count(metrics, (metric) => metric.stuckLoop), metrics.length),
    unsafeBlocks: count(metrics, (metric) => metric.unsafeBlocked),
    unsafeBlockRate: rate(count(metrics, (metric) => metric.unsafeBlocked), metrics.length),
    humanApprovals: metrics.reduce((sum, metric) => sum + metric.humanApprovals, 0),
    humanApprovalRate: rate(count(metrics, (metric) => metric.humanApprovals > 0), metrics.length),
    medianStepsPerSuccessfulTask: median(successes.map((metric) => metric.steps)),
    costPerSuccessfulTaskUsd:
      successCount === 0 ? 0 : metrics.reduce((sum, metric) => sum + metric.totalCostUsd, 0) / successCount,
    medianDurationMs: median(metrics.map((metric) => metric.durationMs))
  };
}

function emptyMode(mode: EvalMode): EvalModeSummary {
  return {
    mode,
    runs: 0,
    successes: 0,
    successRate: 0,
    falseCompletions: 0,
    falseCompletionRate: 0,
    stuckLoops: 0,
    stuckLoopRate: 0,
    unsafeBlocks: 0,
    unsafeBlockRate: 0,
    humanApprovals: 0,
    humanApprovalRate: 0,
    medianStepsPerSuccessfulTask: 0,
    costPerSuccessfulTaskUsd: 0,
    medianDurationMs: 0
  };
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
