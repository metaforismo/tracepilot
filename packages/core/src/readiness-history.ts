import type {
  ReadinessGateDecision,
  ReadinessGateResult,
  ReadinessGateThresholds
} from "./readiness-gate.js";

export type ReadinessHistorySnapshotSource = "generated" | "fixture";
export type ReadinessHistorySource = ReadinessHistorySnapshotSource | "mixed";
export type ReadinessHistoryTrend =
  | "improving"
  | "stable"
  | "regressing"
  | "insufficient_evidence";
export type ReadinessRegressionSeverity = "warn" | "fail";
export type ReadinessRegressionMetric =
  | "decision"
  | "provider-success-rate"
  | "provider-false-completion-rate"
  | "provider-stuck-loop-rate"
  | "provider-cost-per-success";

export type ReadinessRegressionBand = {
  warn: number;
  fail: number;
};

export type ReadinessRegressionThresholds = {
  successRateDrop: ReadinessRegressionBand;
  falseCompletionRateIncrease: ReadinessRegressionBand;
  stuckLoopRateIncrease: ReadinessRegressionBand;
  costPerSuccessIncreaseRatio: ReadinessRegressionBand;
};

export type ReadinessHistoryEntry = {
  gate: ReadinessGateResult;
  label?: string;
  revision?: string;
  source?: ReadinessHistorySnapshotSource;
  note?: string;
};

export type ReadinessHistorySnapshot = {
  id: string;
  generatedAt: string;
  label: string;
  source: ReadinessHistorySnapshotSource;
  decision: ReadinessGateDecision;
  reliability: {
    runs: number;
    successRate: number;
    falseCompletionRate: number;
    stuckLoopRate: number;
  };
  provider: {
    status: ReadinessGateResult["input"]["provider"]["status"];
    plannedRuns: number;
    executedRuns: number;
    paidCalls: number;
    successRate: number | null;
    falseCompletionRate: number | null;
    stuckLoopRate: number | null;
    totalCostUsd: number;
    costPerSuccessUsd: number | null;
  };
  thresholds: Pick<
    ReadinessGateThresholds,
    "minSuccessRate" | "maxFalseCompletionRate" | "maxStuckLoopRate" | "maxCostUsd"
  >;
  rules: {
    passed: number;
    warned: number;
    failed: number;
    blocked: number;
    total: number;
  };
  warnings: string[];
  revision?: string;
  note?: string;
};

export type ReadinessRegression = {
  id: string;
  metric: ReadinessRegressionMetric;
  severity: ReadinessRegressionSeverity;
  previousSnapshotId: string;
  currentSnapshotId: string;
  previousValue: number | string;
  currentValue: number | string;
  delta: number | null;
  threshold: number | null;
  message: string;
};

export type ReadinessHistoryResult = {
  suiteId: "readiness-history";
  generatedAt: string;
  source: ReadinessHistorySource;
  retention: number;
  regressionThresholds: ReadinessRegressionThresholds;
  snapshots: ReadinessHistorySnapshot[];
  regressions: ReadinessRegression[];
  summary: {
    snapshotCount: number;
    generatedSnapshots: number;
    fixtureSnapshots: number;
    latestSnapshotId: string;
    latestDecision: ReadinessGateDecision;
    trend: ReadinessHistoryTrend;
    activeRegressions: number;
    totalRegressions: number;
  };
  warnings: string[];
};

export type BuildReadinessHistoryOptions = {
  generatedAt?: string;
  retention?: number;
  regressionThresholds?: Partial<ReadinessRegressionThresholds>;
  warnings?: string[];
};

export const defaultReadinessRegressionThresholds: ReadinessRegressionThresholds = {
  successRateDrop: { warn: 0.05, fail: 0.1 },
  falseCompletionRateIncrease: { warn: 0.02, fail: 0.05 },
  stuckLoopRateIncrease: { warn: 0.02, fail: 0.05 },
  costPerSuccessIncreaseRatio: { warn: 0.25, fail: 0.5 }
};

const defaultRetention = 90;
const suiteId = "readiness-history";
const epsilon = 1e-12;

export function createReadinessHistorySnapshot(entry: ReadinessHistoryEntry): ReadinessHistorySnapshot {
  validateGate(entry.gate);
  const generatedAt = entry.gate.generatedAt;
  const reliability = entry.gate.input.reliability;
  const provider = entry.gate.input.provider;
  const revision = normalizedOptionalText(entry.revision);
  const note = normalizedOptionalText(entry.note);
  const snapshot: ReadinessHistorySnapshot = {
    id: snapshotId(generatedAt),
    generatedAt,
    label: entry.label?.trim() || `Gate ${generatedAt.slice(0, 10)}`,
    source: entry.source ?? "generated",
    decision: entry.gate.decision,
    reliability: {
      runs: reliability.runs,
      successRate: requiredRate(reliability.successes, reliability.runs),
      falseCompletionRate: requiredRate(reliability.falseCompletions, reliability.runs),
      stuckLoopRate: requiredRate(reliability.stuckLoops, reliability.runs)
    },
    provider: {
      status: provider.status,
      plannedRuns: provider.plannedRuns,
      executedRuns: provider.executedRuns,
      paidCalls: provider.paidCalls,
      successRate: optionalRate(provider.successes, provider.executedRuns),
      falseCompletionRate: optionalRate(provider.falseCompletions, provider.executedRuns),
      stuckLoopRate: optionalRate(provider.stuckLoops, provider.executedRuns),
      totalCostUsd: provider.totalCostUsd,
      costPerSuccessUsd: provider.successes > 0 ? provider.totalCostUsd / provider.successes : null
    },
    thresholds: {
      minSuccessRate: entry.gate.input.thresholds.minSuccessRate,
      maxFalseCompletionRate: entry.gate.input.thresholds.maxFalseCompletionRate,
      maxStuckLoopRate: entry.gate.input.thresholds.maxStuckLoopRate,
      maxCostUsd: entry.gate.input.thresholds.maxCostUsd
    },
    rules: {
      passed: entry.gate.summary.passedRules,
      warned: entry.gate.summary.warnedRules,
      failed: entry.gate.summary.failedRules,
      blocked: entry.gate.summary.blockedRules,
      total: entry.gate.summary.totalRules
    },
    warnings: uniqueStrings([
      ...entry.gate.warnings,
      ...entry.gate.input.reliability.warnings,
      ...entry.gate.input.provider.warnings
    ]),
    ...(revision === undefined ? {} : { revision }),
    ...(note === undefined ? {} : { note })
  };

  validateSnapshot(snapshot);
  return snapshot;
}

export function validateReadinessHistory(value: unknown): asserts value is ReadinessHistoryResult {
  if (
    !isRecord(value) ||
    value.suiteId !== suiteId ||
    !Array.isArray(value.snapshots) ||
    value.snapshots.length === 0 ||
    !Array.isArray(value.regressions) ||
    !isRecord(value.summary) ||
    !Array.isArray(value.warnings)
  ) {
    throw new Error("Readiness history does not match the expected artifact shape.");
  }
  assertRegressionThresholds(value.regressionThresholds);

  const history = value as unknown as ReadinessHistoryResult;
  validateIsoDate("history.generatedAt", history.generatedAt);
  validateRetention(history.retention);
  if (history.snapshots.length > history.retention) {
    throw new Error(`Readiness history contains ${history.snapshots.length} snapshots beyond retention ${history.retention}.`);
  }
  if (!history.warnings.every((warning) => typeof warning === "string")) {
    throw new Error("Readiness history warnings must be strings.");
  }

  for (const [index, snapshot] of history.snapshots.entries()) {
    assertSnapshotShape(snapshot, index);
    validateSnapshot(snapshot);
  }
  validateUniqueSnapshotTimestamps(history.snapshots);
  for (let index = 1; index < history.snapshots.length; index += 1) {
    const previous = history.snapshots[index - 1]!;
    const current = history.snapshots[index]!;
    if (previous.generatedAt.localeCompare(current.generatedAt) > 0) {
      throw new Error("Readiness history snapshots must be ordered from oldest to newest.");
    }
  }

  const latest = history.snapshots.at(-1)!;
  if (history.generatedAt.localeCompare(latest.generatedAt) < 0) {
    throw new Error("history.generatedAt cannot be older than the latest snapshot.");
  }
  const generatedSnapshots = history.snapshots.filter((snapshot) => snapshot.source === "generated").length;
  const fixtureSnapshots = history.snapshots.length - generatedSnapshots;
  const expectedSource: ReadinessHistorySource = generatedSnapshots === history.snapshots.length
    ? "generated"
    : fixtureSnapshots === history.snapshots.length
      ? "fixture"
      : "mixed";
  if (history.source !== expectedSource) {
    throw new Error(`Readiness history source ${history.source} does not match snapshot sources ${expectedSource}.`);
  }

  validateRegressionThresholds(history.regressionThresholds);
  const expectedRegressions = detectReadinessRegressions(history.snapshots, history.regressionThresholds);
  if (regressionSignatures(history.regressions) !== regressionSignatures(expectedRegressions)) {
    throw new Error("Readiness history regressions do not match the retained snapshots.");
  }
  const activeRegressions = expectedRegressions.filter(
    (regression) => regression.currentSnapshotId === latest.id
  ).length;
  const expectedSummary: ReadinessHistoryResult["summary"] = {
    snapshotCount: history.snapshots.length,
    generatedSnapshots,
    fixtureSnapshots,
    latestSnapshotId: latest.id,
    latestDecision: latest.decision,
    trend: deriveTrend(history.snapshots, activeRegressions),
    activeRegressions,
    totalRegressions: expectedRegressions.length
  };
  if (summarySignature(history.summary) !== summarySignature(expectedSummary)) {
    throw new Error("Readiness history summary does not match the retained snapshots.");
  }
}

export function buildReadinessHistory(
  entries: ReadinessHistoryEntry[],
  options: BuildReadinessHistoryOptions = {}
): ReadinessHistoryResult {
  if (entries.length === 0) {
    throw new Error("Readiness history requires at least one gate entry.");
  }

  return buildHistoryFromSnapshots(
    entries.map((entry) => createReadinessHistorySnapshot(entry)),
    options
  );
}

export function appendReadinessHistory(
  history: ReadinessHistoryResult | undefined,
  entry: ReadinessHistoryEntry,
  options: BuildReadinessHistoryOptions = {}
): ReadinessHistoryResult {
  if (history !== undefined) validateReadinessHistory(history);
  const snapshot = createReadinessHistorySnapshot(entry);
  const snapshots = [
    ...(history?.snapshots ?? []).filter((candidate) => candidate.generatedAt !== snapshot.generatedAt),
    snapshot
  ];

  const regressionThresholds = options.regressionThresholds ?? history?.regressionThresholds;
  return buildHistoryFromSnapshots(snapshots, {
    generatedAt: options.generatedAt ?? snapshot.generatedAt,
    retention: options.retention ?? history?.retention ?? defaultRetention,
    ...(regressionThresholds === undefined ? {} : { regressionThresholds }),
    warnings: uniqueStrings([...(history?.warnings ?? []), ...(options.warnings ?? [])])
  });
}

export function renderReadinessHistoryMarkdown(history: ReadinessHistoryResult): string {
  const latest = history.snapshots.at(-1);
  if (latest === undefined) {
    throw new Error("Readiness history cannot be rendered without a latest snapshot.");
  }

  const snapshotRows = history.snapshots.map((snapshot) =>
    [
      markdownCell(snapshot.generatedAt),
      markdownCell(snapshot.label),
      snapshot.source,
      snapshot.decision,
      formatOptionalPercent(snapshot.provider.successRate),
      formatOptionalPercent(snapshot.provider.falseCompletionRate),
      formatOptionalPercent(snapshot.provider.stuckLoopRate),
      formatOptionalUsd(snapshot.provider.costPerSuccessUsd),
      markdownCell(snapshot.revision ?? "—")
    ].join(" | ")
  );
  const regressionRows = history.regressions.map((regression) =>
    [
      regression.currentSnapshotId,
      regression.severity,
      regression.metric,
      markdownCell(regression.message)
    ].join(" | ")
  );
  const warnings = history.warnings.length > 0
    ? history.warnings.map((warning) => `- ${warning}`).join("\n")
    : "- None.";

  return `# Readiness History\n\nGenerated at: ${history.generatedAt}\n\nSource: \`${history.source}\`\n\nLatest decision: \`${latest.decision}\`\n\nTrend: \`${history.summary.trend}\`\n\n## Summary\n\n| Metric | Value |\n| --- | ---: |\n| Snapshots | ${history.summary.snapshotCount} |\n| Active regressions | ${history.summary.activeRegressions} |\n| Total regressions | ${history.summary.totalRegressions} |\n| Retention | ${history.retention} |\n\n## Snapshots\n\n| Generated | Label | Source | Decision | Provider success | False completion | Stuck loop | Cost / success | Revision |\n| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |\n| ${snapshotRows.join(" |\n| ")} |\n\n## Regressions\n\n${regressionRows.length > 0
    ? `| Snapshot | Severity | Metric | Message |\n| --- | --- | --- | --- |\n| ${regressionRows.join(" |\n| ")} |`
    : "No regressions detected."}\n\n## Warnings\n\n${warnings}\n`;
}

function buildHistoryFromSnapshots(
  inputSnapshots: ReadinessHistorySnapshot[],
  options: BuildReadinessHistoryOptions
): ReadinessHistoryResult {
  const retention = options.retention ?? defaultRetention;
  validateRetention(retention);
  const regressionThresholds = mergeRegressionThresholds(options.regressionThresholds);
  validateRegressionThresholds(regressionThresholds);

  const snapshots = [...inputSnapshots]
    .map((snapshot) => {
      validateSnapshot(snapshot);
      return snapshot;
    })
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt))
    .slice(-retention);

  if (snapshots.length === 0) {
    throw new Error("Readiness history requires at least one snapshot after retention is applied.");
  }

  validateUniqueSnapshotTimestamps(snapshots);
  const latest = snapshots.at(-1)!;
  const requestedGeneratedAt = options.generatedAt ?? latest.generatedAt;
  validateIsoDate("history.generatedAt", requestedGeneratedAt);
  const generatedAt = latest.generatedAt.localeCompare(requestedGeneratedAt) > 0
    ? latest.generatedAt
    : requestedGeneratedAt;
  const regressions = detectReadinessRegressions(snapshots, regressionThresholds);
  const activeRegressions = regressions.filter(
    (regression) => regression.currentSnapshotId === latest.id
  ).length;
  const generatedSnapshots = snapshots.filter((snapshot) => snapshot.source === "generated").length;
  const fixtureSnapshots = snapshots.length - generatedSnapshots;
  const source: ReadinessHistorySource = generatedSnapshots === snapshots.length
    ? "generated"
    : fixtureSnapshots === snapshots.length
      ? "fixture"
      : "mixed";

  return {
    suiteId,
    generatedAt,
    source,
    retention,
    regressionThresholds,
    snapshots,
    regressions,
    summary: {
      snapshotCount: snapshots.length,
      generatedSnapshots,
      fixtureSnapshots,
      latestSnapshotId: latest.id,
      latestDecision: latest.decision,
      trend: deriveTrend(snapshots, activeRegressions),
      activeRegressions,
      totalRegressions: regressions.length
    },
    warnings: uniqueStrings(options.warnings ?? [])
  };
}

function detectReadinessRegressions(
  snapshots: ReadinessHistorySnapshot[],
  thresholds: ReadinessRegressionThresholds
): ReadinessRegression[] {
  const regressions: ReadinessRegression[] = [];

  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    if (previous === undefined || current === undefined) continue;

    const previousDecisionRank = decisionRank(previous.decision);
    const currentDecisionRank = decisionRank(current.decision);
    if (currentDecisionRank > previousDecisionRank) {
      regressions.push({
        id: regressionId(current.id, "decision"),
        metric: "decision",
        severity: current.decision === "fail" || current.decision === "blocked" ? "fail" : "warn",
        previousSnapshotId: previous.id,
        currentSnapshotId: current.id,
        previousValue: previous.decision,
        currentValue: current.decision,
        delta: currentDecisionRank - previousDecisionRank,
        threshold: null,
        message: `Readiness decision deteriorated from ${previous.decision} to ${current.decision}.`
      });
    }

    if (previous.provider.status !== "executed" || current.provider.status !== "executed") {
      continue;
    }

    addRateRegression({
      regressions,
      previous,
      current,
      metric: "provider-success-rate",
      previousValue: previous.provider.successRate,
      currentValue: current.provider.successRate,
      delta: rateDelta(previous.provider.successRate, current.provider.successRate, "drop"),
      thresholds: thresholds.successRateDrop,
      message: (delta) =>
        `Provider success rate fell ${formatPercentagePoints(delta)}, from ${formatOptionalPercent(previous.provider.successRate)} to ${formatOptionalPercent(current.provider.successRate)}.`
    });
    addRateRegression({
      regressions,
      previous,
      current,
      metric: "provider-false-completion-rate",
      previousValue: previous.provider.falseCompletionRate,
      currentValue: current.provider.falseCompletionRate,
      delta: rateDelta(previous.provider.falseCompletionRate, current.provider.falseCompletionRate, "increase"),
      thresholds: thresholds.falseCompletionRateIncrease,
      message: (delta) =>
        `Provider false-completion rate rose ${formatPercentagePoints(delta)}, from ${formatOptionalPercent(previous.provider.falseCompletionRate)} to ${formatOptionalPercent(current.provider.falseCompletionRate)}.`
    });
    addRateRegression({
      regressions,
      previous,
      current,
      metric: "provider-stuck-loop-rate",
      previousValue: previous.provider.stuckLoopRate,
      currentValue: current.provider.stuckLoopRate,
      delta: rateDelta(previous.provider.stuckLoopRate, current.provider.stuckLoopRate, "increase"),
      thresholds: thresholds.stuckLoopRateIncrease,
      message: (delta) =>
        `Provider stuck-loop rate rose ${formatPercentagePoints(delta)}, from ${formatOptionalPercent(previous.provider.stuckLoopRate)} to ${formatOptionalPercent(current.provider.stuckLoopRate)}.`
    });

    const previousCost = previous.provider.costPerSuccessUsd;
    const currentCost = current.provider.costPerSuccessUsd;
    if (previousCost !== null && currentCost !== null && previousCost > 0) {
      const increaseRatio = currentCost / previousCost - 1;
      const severity = regressionSeverity(increaseRatio, thresholds.costPerSuccessIncreaseRatio);
      if (severity !== null) {
        regressions.push({
          id: regressionId(current.id, "provider-cost-per-success"),
          metric: "provider-cost-per-success",
          severity,
          previousSnapshotId: previous.id,
          currentSnapshotId: current.id,
          previousValue: previousCost,
          currentValue: currentCost,
          delta: increaseRatio,
          threshold: severity === "fail"
            ? thresholds.costPerSuccessIncreaseRatio.fail
            : thresholds.costPerSuccessIncreaseRatio.warn,
          message: `Provider cost per successful run increased ${formatPercent(increaseRatio)}, from ${formatUsd(previousCost)} to ${formatUsd(currentCost)}.`
        });
      }
    }
  }

  return regressions;
}

function addRateRegression(params: {
  regressions: ReadinessRegression[];
  previous: ReadinessHistorySnapshot;
  current: ReadinessHistorySnapshot;
  metric: Exclude<ReadinessRegressionMetric, "decision" | "provider-cost-per-success">;
  previousValue: number | null;
  currentValue: number | null;
  delta: number | null;
  thresholds: ReadinessRegressionBand;
  message: (delta: number) => string;
}): void {
  if (params.previousValue === null || params.currentValue === null || params.delta === null) return;
  const severity = regressionSeverity(params.delta, params.thresholds);
  if (severity === null) return;

  params.regressions.push({
    id: regressionId(params.current.id, params.metric),
    metric: params.metric,
    severity,
    previousSnapshotId: params.previous.id,
    currentSnapshotId: params.current.id,
    previousValue: params.previousValue,
    currentValue: params.currentValue,
    delta: params.delta,
    threshold: severity === "fail" ? params.thresholds.fail : params.thresholds.warn,
    message: params.message(params.delta)
  });
}

function deriveTrend(
  snapshots: ReadinessHistorySnapshot[],
  activeRegressions: number
): ReadinessHistoryTrend {
  if (snapshots.length < 2) return "insufficient_evidence";
  if (activeRegressions > 0) return "regressing";

  const previous = snapshots.at(-2)!;
  const current = snapshots.at(-1)!;
  if (previous.provider.status !== "executed" || current.provider.status !== "executed") {
    return "insufficient_evidence";
  }

  const improved =
    decisionRank(current.decision) < decisionRank(previous.decision) ||
    increased(current.provider.successRate, previous.provider.successRate) ||
    decreased(current.provider.falseCompletionRate, previous.provider.falseCompletionRate) ||
    decreased(current.provider.stuckLoopRate, previous.provider.stuckLoopRate) ||
    decreased(current.provider.costPerSuccessUsd, previous.provider.costPerSuccessUsd);

  return improved ? "improving" : "stable";
}

function rateDelta(
  previous: number | null,
  current: number | null,
  direction: "drop" | "increase"
): number | null {
  if (previous === null || current === null) return null;
  return direction === "drop" ? previous - current : current - previous;
}

function regressionSeverity(
  delta: number,
  thresholds: ReadinessRegressionBand
): ReadinessRegressionSeverity | null {
  if (delta + epsilon >= thresholds.fail) return "fail";
  if (delta + epsilon >= thresholds.warn) return "warn";
  return null;
}

function increased(current: number | null, previous: number | null): boolean {
  return current !== null && previous !== null && current - previous > epsilon;
}

function decreased(current: number | null, previous: number | null): boolean {
  return current !== null && previous !== null && previous - current > epsilon;
}

function requiredRate(events: number, runs: number): number {
  return runs === 0 ? 0 : events / runs;
}

function optionalRate(events: number, runs: number): number | null {
  return runs === 0 ? null : events / runs;
}

function decisionRank(decision: ReadinessGateDecision): number {
  switch (decision) {
    case "pass":
      return 0;
    case "warn":
      return 1;
    case "fail":
      return 2;
    case "blocked":
      return 3;
  }
}

function snapshotId(generatedAt: string): string {
  return `readiness-${generatedAt.replace(/\D/g, "")}`;
}

function regressionId(snapshotIdValue: string, metric: ReadinessRegressionMetric): string {
  return `${snapshotIdValue}:${metric}`;
}

function mergeRegressionThresholds(
  partial: Partial<ReadinessRegressionThresholds> | undefined
): ReadinessRegressionThresholds {
  return {
    successRateDrop: partial?.successRateDrop ?? defaultReadinessRegressionThresholds.successRateDrop,
    falseCompletionRateIncrease:
      partial?.falseCompletionRateIncrease ?? defaultReadinessRegressionThresholds.falseCompletionRateIncrease,
    stuckLoopRateIncrease:
      partial?.stuckLoopRateIncrease ?? defaultReadinessRegressionThresholds.stuckLoopRateIncrease,
    costPerSuccessIncreaseRatio:
      partial?.costPerSuccessIncreaseRatio ?? defaultReadinessRegressionThresholds.costPerSuccessIncreaseRatio
  };
}

function validateGate(gate: ReadinessGateResult): void {
  validateIsoDate("gate.generatedAt", gate.generatedAt);
  if (gate.input.generatedAt !== gate.generatedAt) {
    throw new Error("gate.generatedAt must match gate.input.generatedAt.");
  }
  validateCounts("reliability", {
    runs: gate.input.reliability.runs,
    successes: gate.input.reliability.successes,
    falseCompletions: gate.input.reliability.falseCompletions,
    stuckLoops: gate.input.reliability.stuckLoops
  });
  validateCounts("provider", {
    plannedRuns: gate.input.provider.plannedRuns,
    executedRuns: gate.input.provider.executedRuns,
    paidCalls: gate.input.provider.paidCalls,
    successes: gate.input.provider.successes,
    falseCompletions: gate.input.provider.falseCompletions,
    stuckLoops: gate.input.provider.stuckLoops
  });
  validateNonNegativeFinite("provider.totalCostUsd", gate.input.provider.totalCostUsd);

  validateEventsWithinRuns("reliability", gate.input.reliability.runs, {
    successes: gate.input.reliability.successes,
    falseCompletions: gate.input.reliability.falseCompletions,
    stuckLoops: gate.input.reliability.stuckLoops
  });
  validateEventsWithinRuns("provider", gate.input.provider.executedRuns, {
    successes: gate.input.provider.successes,
    falseCompletions: gate.input.provider.falseCompletions,
    stuckLoops: gate.input.provider.stuckLoops
  });
  if (gate.input.provider.executedRuns > gate.input.provider.plannedRuns) {
    throw new Error("provider executed runs cannot exceed planned runs.");
  }
}

function assertRegressionThresholds(value: unknown): asserts value is ReadinessRegressionThresholds {
  if (!isRecord(value)) {
    throw new Error("Readiness history regression thresholds must be an object.");
  }
  for (const key of [
    "successRateDrop",
    "falseCompletionRateIncrease",
    "stuckLoopRateIncrease",
    "costPerSuccessIncreaseRatio"
  ] as const) {
    const band = value[key];
    if (!isRecord(band) || typeof band.warn !== "number" || typeof band.fail !== "number") {
      throw new Error(`Readiness history regression threshold ${key} is invalid.`);
    }
  }
}

function assertSnapshotShape(value: unknown, index: number): asserts value is ReadinessHistorySnapshot {
  if (
    !isRecord(value) ||
    !isRecord(value.reliability) ||
    !isRecord(value.provider) ||
    !isRecord(value.thresholds) ||
    !isRecord(value.rules) ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every((warning) => typeof warning === "string")
  ) {
    throw new Error(`Readiness history snapshot ${index} does not match the expected artifact shape.`);
  }
}

function regressionSignatures(regressions: ReadinessRegression[]): string {
  return JSON.stringify(regressions.map((regression) => [
    regression.id,
    regression.metric,
    regression.severity,
    regression.previousSnapshotId,
    regression.currentSnapshotId,
    regression.previousValue,
    regression.currentValue,
    regression.delta,
    regression.threshold,
    regression.message
  ]));
}

function summarySignature(summary: ReadinessHistoryResult["summary"]): string {
  return JSON.stringify([
    summary.snapshotCount,
    summary.generatedSnapshots,
    summary.fixtureSnapshots,
    summary.latestSnapshotId,
    summary.latestDecision,
    summary.trend,
    summary.activeRegressions,
    summary.totalRegressions
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateUniqueSnapshotTimestamps(snapshots: ReadinessHistorySnapshot[]): void {
  const timestamps = new Set<string>();
  for (const snapshot of snapshots) {
    if (timestamps.has(snapshot.generatedAt)) {
      throw new Error(`Duplicate readiness snapshot timestamp: ${snapshot.generatedAt}.`);
    }
    timestamps.add(snapshot.generatedAt);
  }
}

function validateEventsWithinRuns(
  scope: string,
  runs: number,
  events: Record<string, number>
): void {
  for (const [name, value] of Object.entries(events)) {
    if (value > runs) {
      throw new Error(`${scope}.${name} cannot exceed ${scope} runs.`);
    }
  }
}

function validateSnapshot(snapshot: ReadinessHistorySnapshot): void {
  validateIsoDate("snapshot.generatedAt", snapshot.generatedAt);
  if (snapshot.id !== snapshotId(snapshot.generatedAt)) {
    throw new Error(`snapshot.id must be derived from snapshot.generatedAt, got ${snapshot.id}.`);
  }
  if (snapshot.label.trim().length === 0) {
    throw new Error("Readiness snapshots require a non-empty label.");
  }
  if (snapshot.source !== "generated" && snapshot.source !== "fixture") {
    throw new Error(`Unsupported readiness snapshot source: ${String(snapshot.source)}.`);
  }
  if (!["pass", "warn", "fail", "blocked"].includes(snapshot.decision)) {
    throw new Error(`Unsupported readiness snapshot decision: ${String(snapshot.decision)}.`);
  }

  validateCounts("snapshot.reliability", { runs: snapshot.reliability.runs });
  validateRate("snapshot.reliability.successRate", snapshot.reliability.successRate);
  validateRate("snapshot.reliability.falseCompletionRate", snapshot.reliability.falseCompletionRate);
  validateRate("snapshot.reliability.stuckLoopRate", snapshot.reliability.stuckLoopRate);

  if (!["executed", "skipped_paid_runs_disabled", "skipped_missing_api_key", "partial"].includes(snapshot.provider.status)) {
    throw new Error(`Unsupported readiness provider status: ${String(snapshot.provider.status)}.`);
  }
  validateCounts("snapshot.provider", {
    plannedRuns: snapshot.provider.plannedRuns,
    executedRuns: snapshot.provider.executedRuns,
    paidCalls: snapshot.provider.paidCalls
  });
  if (snapshot.provider.executedRuns > snapshot.provider.plannedRuns) {
    throw new Error("snapshot.provider.executedRuns cannot exceed plannedRuns.");
  }
  validateOptionalRate("snapshot.provider.successRate", snapshot.provider.successRate);
  validateOptionalRate("snapshot.provider.falseCompletionRate", snapshot.provider.falseCompletionRate);
  validateOptionalRate("snapshot.provider.stuckLoopRate", snapshot.provider.stuckLoopRate);
  const providerRates = [
    snapshot.provider.successRate,
    snapshot.provider.falseCompletionRate,
    snapshot.provider.stuckLoopRate
  ];
  if (snapshot.provider.executedRuns === 0 && providerRates.some((value) => value !== null)) {
    throw new Error("Provider rates must be null when no provider runs were executed.");
  }
  if (snapshot.provider.executedRuns > 0 && providerRates.some((value) => value === null)) {
    throw new Error("Provider rates are required when provider runs were executed.");
  }
  validateNonNegativeFinite("snapshot.provider.totalCostUsd", snapshot.provider.totalCostUsd);
  if (snapshot.provider.costPerSuccessUsd !== null) {
    validateNonNegativeFinite("snapshot.provider.costPerSuccessUsd", snapshot.provider.costPerSuccessUsd);
  }

  validateRate("snapshot.thresholds.minSuccessRate", snapshot.thresholds.minSuccessRate);
  validateRate("snapshot.thresholds.maxFalseCompletionRate", snapshot.thresholds.maxFalseCompletionRate);
  validateRate("snapshot.thresholds.maxStuckLoopRate", snapshot.thresholds.maxStuckLoopRate);
  validateNonNegativeFinite("snapshot.thresholds.maxCostUsd", snapshot.thresholds.maxCostUsd);

  validateCounts("snapshot.rules", snapshot.rules);
  const classifiedRules = snapshot.rules.passed + snapshot.rules.warned + snapshot.rules.failed + snapshot.rules.blocked;
  if (classifiedRules !== snapshot.rules.total) {
    throw new Error(`snapshot.rules total ${snapshot.rules.total} does not match classified rules ${classifiedRules}.`);
  }
}

function validateCounts(scope: string, counts: Record<string, number>): void {
  for (const [name, value] of Object.entries(counts)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${scope}.${name} must be a non-negative integer, got ${value}.`);
    }
  }
}

function validateRetention(retention: number): void {
  if (!Number.isInteger(retention) || retention < 1) {
    throw new Error(`retention must be a positive integer, got ${retention}.`);
  }
}

function validateRegressionThresholds(thresholds: ReadinessRegressionThresholds): void {
  for (const [name, band] of Object.entries(thresholds)) {
    validateNonNegativeFinite(`${name}.warn`, band.warn);
    validateNonNegativeFinite(`${name}.fail`, band.fail);
    if (band.fail < band.warn) {
      throw new Error(`${name}.fail must be greater than or equal to ${name}.warn.`);
    }
  }
}

function validateRate(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1, got ${value}.`);
  }
}

function validateOptionalRate(name: string, value: number | null): void {
  if (value !== null) validateRate(name, value);
}

function validateNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number, got ${value}.`);
  }
}

function validateIsoDate(name: string, value: string): void {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${name} must be a canonical UTC ISO timestamp, got ${value}.`);
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function normalizedOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function markdownCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function formatOptionalPercent(value: number | null): string {
  return value === null ? "—" : formatPercent(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPercentagePoints(value: number): string {
  return `${(value * 100).toFixed(1)} pp`;
}

function formatOptionalUsd(value: number | null): string {
  return value === null ? "—" : formatUsd(value);
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}
