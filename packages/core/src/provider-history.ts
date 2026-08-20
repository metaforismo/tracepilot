export type ProviderHistorySnapshotSource = "generated" | "fixture";
export type ProviderHistorySource = ProviderHistorySnapshotSource | "mixed";
export type ProviderHistoryTrend = "improving" | "stable" | "regressing" | "insufficient_evidence";
export type ProviderHistoryRowStatus =
  | "executed"
  | "skipped_paid_runs_disabled"
  | "skipped_missing_api_key";
export type ProviderRegressionSeverity = "warn" | "fail";
export type ProviderRegressionMetric =
  | "success-rate"
  | "false-completion-rate"
  | "stuck-loop-rate"
  | "cost-per-success";

export type ProviderRegressionBand = {
  warn: number;
  fail: number;
};

export type ProviderRegressionThresholds = {
  successRateDrop: ProviderRegressionBand;
  falseCompletionRateIncrease: ProviderRegressionBand;
  stuckLoopRateIncrease: ProviderRegressionBand;
  costPerSuccessIncreaseRatio: ProviderRegressionBand;
};

export type ProviderHistoryRow = {
  provider: string;
  taskId: string;
  attempt: number;
  status: ProviderHistoryRowStatus;
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
};

export type ProviderHistorySlice = {
  provider: string;
  taskId: string;
  models: string[];
  plannedRuns: number;
  executedRuns: number;
  paidCalls: number;
  successes: number;
  successRate: number | null;
  falseCompletions: number;
  falseCompletionRate: number | null;
  stuckLoops: number;
  stuckLoopRate: number | null;
  unsafeBlocks: number;
  humanApprovals: number;
  totalCostUsd: number;
  costPerSuccessUsd: number | null;
};

export type ProviderHistoryEntry = {
  generatedAt: string;
  rows: ProviderHistoryRow[];
  label?: string;
  revision?: string;
  source?: ProviderHistorySnapshotSource;
  warnings?: string[];
};

export type ProviderHistorySnapshot = {
  id: string;
  generatedAt: string;
  label: string;
  source: ProviderHistorySnapshotSource;
  rows: ProviderHistoryRow[];
  slices: ProviderHistorySlice[];
  warnings: string[];
  revision?: string;
};

export type ProviderRegression = {
  id: string;
  metric: ProviderRegressionMetric;
  severity: ProviderRegressionSeverity;
  previousSnapshotId: string;
  currentSnapshotId: string;
  provider: string;
  taskId: string;
  previousModels: string[];
  currentModels: string[];
  previousValue: number;
  currentValue: number;
  delta: number;
  threshold: number;
  message: string;
};

export type ProviderModelTransition = {
  provider: string;
  taskId: string;
  previousModels: string[];
  currentModels: string[];
};

export type ProviderHistoryResult = {
  suiteId: "provider-history";
  generatedAt: string;
  source: ProviderHistorySource;
  retention: number;
  regressionThresholds: ProviderRegressionThresholds;
  snapshots: ProviderHistorySnapshot[];
  regressions: ProviderRegression[];
  summary: {
    snapshotCount: number;
    generatedSnapshots: number;
    fixtureSnapshots: number;
    latestSnapshotId: string;
    trend: ProviderHistoryTrend;
    activeRegressions: number;
    affectedTasks: number;
    affectedProviders: number;
    modelChanges: number;
    totalRegressions: number;
  };
  warnings: string[];
};

export type BuildProviderHistoryOptions = {
  generatedAt?: string;
  retention?: number;
  regressionThresholds?: Partial<ProviderRegressionThresholds>;
  warnings?: string[];
};

export const defaultProviderRegressionThresholds: ProviderRegressionThresholds = {
  successRateDrop: { warn: 0.05, fail: 0.1 },
  falseCompletionRateIncrease: { warn: 0.02, fail: 0.05 },
  stuckLoopRateIncrease: { warn: 0.02, fail: 0.05 },
  costPerSuccessIncreaseRatio: { warn: 0.25, fail: 0.5 }
};

const suiteId = "provider-history";
const defaultRetention = 90;
const epsilon = 1e-12;

export function createProviderHistorySnapshot(entry: ProviderHistoryEntry): ProviderHistorySnapshot {
  validateIsoDate("provider history entry.generatedAt", entry.generatedAt);
  if (!Array.isArray(entry.rows) || entry.rows.length === 0) {
    throw new Error("Provider history entries require at least one scorecard row.");
  }

  const rows = entry.rows.map((row, index) => normalizeRow(row, index));
  const revision = normalizedOptionalText(entry.revision);
  const snapshot: ProviderHistorySnapshot = {
    id: snapshotId(entry.generatedAt),
    generatedAt: entry.generatedAt,
    label: entry.label?.trim() || `Provider scorecard ${entry.generatedAt.slice(0, 10)}`,
    source: entry.source ?? "generated",
    rows,
    slices: deriveSlices(rows),
    warnings: uniqueStrings(entry.warnings ?? []),
    ...(revision === undefined ? {} : { revision })
  };
  validateSnapshot(snapshot);
  return snapshot;
}

export function buildProviderHistory(
  entries: ProviderHistoryEntry[],
  options: BuildProviderHistoryOptions = {}
): ProviderHistoryResult {
  if (entries.length === 0) {
    throw new Error("Provider history requires at least one scorecard entry.");
  }
  return buildHistoryFromSnapshots(entries.map(createProviderHistorySnapshot), options);
}

export function appendProviderHistory(
  history: ProviderHistoryResult | undefined,
  entry: ProviderHistoryEntry,
  options: BuildProviderHistoryOptions = {}
): ProviderHistoryResult {
  if (history !== undefined) validateProviderHistory(history);
  const snapshot = createProviderHistorySnapshot(entry);
  const snapshots = [
    ...(history?.snapshots ?? []).filter((candidate) => candidate.generatedAt !== snapshot.generatedAt),
    snapshot
  ];
  const thresholds = options.regressionThresholds ?? history?.regressionThresholds;

  return buildHistoryFromSnapshots(snapshots, {
    generatedAt: options.generatedAt ?? snapshot.generatedAt,
    retention: options.retention ?? history?.retention ?? defaultRetention,
    ...(thresholds === undefined ? {} : { regressionThresholds: thresholds }),
    warnings: uniqueStrings([...(history?.warnings ?? []), ...(options.warnings ?? [])])
  });
}

export function latestProviderModelTransitions(history: ProviderHistoryResult): ProviderModelTransition[] {
  if (history.snapshots.length < 2) return [];
  const previous = history.snapshots.at(-2)!;
  const current = history.snapshots.at(-1)!;
  return modelTransitions(previous, current);
}

export function validateProviderHistory(value: unknown): asserts value is ProviderHistoryResult {
  if (
    !isRecord(value) ||
    value.suiteId !== suiteId ||
    !Array.isArray(value.snapshots) ||
    value.snapshots.length === 0 ||
    !Array.isArray(value.regressions) ||
    !isRecord(value.summary) ||
    !Array.isArray(value.warnings)
  ) {
    throw new Error("Provider history does not match the expected artifact shape.");
  }

  const history = value as unknown as ProviderHistoryResult;
  validateIsoDate("provider history.generatedAt", history.generatedAt);
  validateRetention(history.retention);
  if (history.snapshots.length > history.retention) {
    throw new Error(
      `Provider history contains ${history.snapshots.length} snapshots beyond retention ${history.retention}.`
    );
  }
  if (!history.warnings.every((warning) => typeof warning === "string")) {
    throw new Error("Provider history warnings must be strings.");
  }
  assertRegressionThresholds(history.regressionThresholds);
  validateRegressionThresholds(history.regressionThresholds);

  for (const [index, snapshot] of history.snapshots.entries()) {
    assertSnapshotShape(snapshot, index);
    validateSnapshot(snapshot);
  }
  validateUniqueSnapshotTimestamps(history.snapshots);
  for (let index = 1; index < history.snapshots.length; index += 1) {
    const previous = history.snapshots[index - 1]!;
    const current = history.snapshots[index]!;
    if (previous.generatedAt.localeCompare(current.generatedAt) > 0) {
      throw new Error("Provider history snapshots must be ordered from oldest to newest.");
    }
  }

  const latest = history.snapshots.at(-1)!;
  if (history.generatedAt.localeCompare(latest.generatedAt) < 0) {
    throw new Error("provider history.generatedAt cannot be older than the latest snapshot.");
  }
  const generatedSnapshots = history.snapshots.filter((snapshot) => snapshot.source === "generated").length;
  const fixtureSnapshots = history.snapshots.length - generatedSnapshots;
  const expectedSource = sourceForCounts(history.snapshots.length, generatedSnapshots, fixtureSnapshots);
  if (history.source !== expectedSource) {
    throw new Error(
      `Provider history source ${history.source} does not match snapshot sources ${expectedSource}.`
    );
  }

  const expectedRegressions = detectProviderRegressions(history.snapshots, history.regressionThresholds);
  if (regressionSignatures(history.regressions) !== regressionSignatures(expectedRegressions)) {
    throw new Error("Provider history regressions do not match the retained snapshots.");
  }
  const expectedSummary = deriveSummary(
    history.snapshots,
    expectedRegressions,
    generatedSnapshots,
    fixtureSnapshots
  );
  if (summarySignature(history.summary) !== summarySignature(expectedSummary)) {
    throw new Error("Provider history summary does not match the retained snapshots.");
  }
}

export function renderProviderHistoryMarkdown(history: ProviderHistoryResult): string {
  validateProviderHistory(history);
  const latest = history.snapshots.at(-1)!;
  const active = history.regressions.filter((regression) => regression.currentSnapshotId === latest.id);
  const snapshotRows = history.snapshots.map((snapshot) =>
    [
      markdownCell(snapshot.generatedAt),
      markdownCell(snapshot.label),
      snapshot.source,
      snapshot.slices.reduce((sum, slice) => sum + slice.executedRuns, 0),
      markdownCell(snapshot.revision ?? "—")
    ].join(" | ")
  );
  const regressionRows = active.map((regression) =>
    [
      regression.severity,
      markdownCell(regression.provider),
      markdownCell(regression.taskId),
      markdownCell(`${regression.previousModels.join(", ")} → ${regression.currentModels.join(", ")}`),
      regression.metric,
      markdownCell(regression.message)
    ].join(" | ")
  );

  return `# Provider Regression Attribution\n\nGenerated at: ${history.generatedAt}\n\nSource: \`${history.source}\`\n\nTrend: \`${history.summary.trend}\`\n\n## Summary\n\n| Metric | Value |\n| --- | ---: |\n| Snapshots | ${history.summary.snapshotCount} |\n| Active regressions | ${history.summary.activeRegressions} |\n| Affected tasks | ${history.summary.affectedTasks} |\n| Affected providers | ${history.summary.affectedProviders} |\n| Model changes | ${history.summary.modelChanges} |\n| Retention | ${history.retention} |\n\n## Releases\n\n| Generated | Label | Source | Executed rows | Revision |\n| --- | --- | --- | ---: | --- |\n| ${snapshotRows.join(" |\n| ")} |\n\n## Active regressions\n\n${regressionRows.length > 0
    ? `| Severity | Provider | Task | Model transition | Metric | Evidence |\n| --- | --- | --- | --- | --- | --- |\n| ${regressionRows.join(" |\n| ")} |`
    : "No threshold-crossing provider regressions detected."}\n`;
}

function buildHistoryFromSnapshots(
  inputSnapshots: ProviderHistorySnapshot[],
  options: BuildProviderHistoryOptions
): ProviderHistoryResult {
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
    throw new Error("Provider history requires at least one snapshot after retention is applied.");
  }
  validateUniqueSnapshotTimestamps(snapshots);

  const latest = snapshots.at(-1)!;
  const requestedGeneratedAt = options.generatedAt ?? latest.generatedAt;
  validateIsoDate("provider history.generatedAt", requestedGeneratedAt);
  const generatedAt = latest.generatedAt.localeCompare(requestedGeneratedAt) > 0
    ? latest.generatedAt
    : requestedGeneratedAt;
  const regressions = detectProviderRegressions(snapshots, regressionThresholds);
  const generatedSnapshots = snapshots.filter((snapshot) => snapshot.source === "generated").length;
  const fixtureSnapshots = snapshots.length - generatedSnapshots;

  return {
    suiteId,
    generatedAt,
    source: sourceForCounts(snapshots.length, generatedSnapshots, fixtureSnapshots),
    retention,
    regressionThresholds,
    snapshots,
    regressions,
    summary: deriveSummary(snapshots, regressions, generatedSnapshots, fixtureSnapshots),
    warnings: uniqueStrings(options.warnings ?? [])
  };
}

function deriveSummary(
  snapshots: ProviderHistorySnapshot[],
  regressions: ProviderRegression[],
  generatedSnapshots: number,
  fixtureSnapshots: number
): ProviderHistoryResult["summary"] {
  const latest = snapshots.at(-1)!;
  const active = regressions.filter((regression) => regression.currentSnapshotId === latest.id);
  return {
    snapshotCount: snapshots.length,
    generatedSnapshots,
    fixtureSnapshots,
    latestSnapshotId: latest.id,
    trend: deriveTrend(snapshots, active.length),
    activeRegressions: active.length,
    affectedTasks: new Set(active.map((regression) => regression.taskId)).size,
    affectedProviders: new Set(active.map((regression) => regression.provider)).size,
    modelChanges: snapshots.length < 2
      ? 0
      : modelTransitions(snapshots.at(-2)!, latest).length,
    totalRegressions: regressions.length
  };
}

function detectProviderRegressions(
  snapshots: ProviderHistorySnapshot[],
  thresholds: ProviderRegressionThresholds
): ProviderRegression[] {
  const regressions: ProviderRegression[] = [];
  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    if (previous === undefined || current === undefined) continue;
    const previousSlices = new Map(previous.slices.map((slice) => [sliceKey(slice), slice]));

    for (const currentSlice of current.slices) {
      const previousSlice = previousSlices.get(sliceKey(currentSlice));
      if (
        previousSlice === undefined ||
        previousSlice.executedRuns === 0 ||
        currentSlice.executedRuns === 0
      ) {
        continue;
      }

      addRateRegression({
        regressions,
        previous,
        current,
        previousSlice,
        currentSlice,
        metric: "success-rate",
        previousValue: previousSlice.successRate,
        currentValue: currentSlice.successRate,
        delta: rateDelta(previousSlice.successRate, currentSlice.successRate, "drop"),
        thresholds: thresholds.successRateDrop,
        describe: (delta) => `Success rate fell ${formatPercentagePoints(delta)}`
      });
      addRateRegression({
        regressions,
        previous,
        current,
        previousSlice,
        currentSlice,
        metric: "false-completion-rate",
        previousValue: previousSlice.falseCompletionRate,
        currentValue: currentSlice.falseCompletionRate,
        delta: rateDelta(
          previousSlice.falseCompletionRate,
          currentSlice.falseCompletionRate,
          "increase"
        ),
        thresholds: thresholds.falseCompletionRateIncrease,
        describe: (delta) => `False-completion rate rose ${formatPercentagePoints(delta)}`
      });
      addRateRegression({
        regressions,
        previous,
        current,
        previousSlice,
        currentSlice,
        metric: "stuck-loop-rate",
        previousValue: previousSlice.stuckLoopRate,
        currentValue: currentSlice.stuckLoopRate,
        delta: rateDelta(previousSlice.stuckLoopRate, currentSlice.stuckLoopRate, "increase"),
        thresholds: thresholds.stuckLoopRateIncrease,
        describe: (delta) => `Stuck-loop rate rose ${formatPercentagePoints(delta)}`
      });

      const previousCost = previousSlice.costPerSuccessUsd;
      const currentCost = currentSlice.costPerSuccessUsd;
      if (previousCost !== null && currentCost !== null && previousCost > 0) {
        const increaseRatio = currentCost / previousCost - 1;
        const severity = regressionSeverity(increaseRatio, thresholds.costPerSuccessIncreaseRatio);
        if (severity !== null) {
          regressions.push(
            regression({
              previous,
              current,
              previousSlice,
              currentSlice,
              metric: "cost-per-success",
              severity,
              previousValue: previousCost,
              currentValue: currentCost,
              delta: increaseRatio,
              threshold: severity === "fail"
                ? thresholds.costPerSuccessIncreaseRatio.fail
                : thresholds.costPerSuccessIncreaseRatio.warn,
              description: `Cost per success increased ${formatPercent(increaseRatio)}`
            })
          );
        }
      }
    }
  }
  return regressions;
}

function addRateRegression(params: {
  regressions: ProviderRegression[];
  previous: ProviderHistorySnapshot;
  current: ProviderHistorySnapshot;
  previousSlice: ProviderHistorySlice;
  currentSlice: ProviderHistorySlice;
  metric: Exclude<ProviderRegressionMetric, "cost-per-success">;
  previousValue: number | null;
  currentValue: number | null;
  delta: number | null;
  thresholds: ProviderRegressionBand;
  describe: (delta: number) => string;
}): void {
  if (params.previousValue === null || params.currentValue === null || params.delta === null) return;
  const severity = regressionSeverity(params.delta, params.thresholds);
  if (severity === null) return;
  params.regressions.push(
    regression({
      previous: params.previous,
      current: params.current,
      previousSlice: params.previousSlice,
      currentSlice: params.currentSlice,
      metric: params.metric,
      severity,
      previousValue: params.previousValue,
      currentValue: params.currentValue,
      delta: params.delta,
      threshold: severity === "fail" ? params.thresholds.fail : params.thresholds.warn,
      description: params.describe(params.delta)
    })
  );
}

function regression(params: {
  previous: ProviderHistorySnapshot;
  current: ProviderHistorySnapshot;
  previousSlice: ProviderHistorySlice;
  currentSlice: ProviderHistorySlice;
  metric: ProviderRegressionMetric;
  severity: ProviderRegressionSeverity;
  previousValue: number;
  currentValue: number;
  delta: number;
  threshold: number;
  description: string;
}): ProviderRegression {
  const modelContext = sameStringArray(params.previousSlice.models, params.currentSlice.models)
    ? `on ${params.currentSlice.models.join(", ")}`
    : `as models changed from ${params.previousSlice.models.join(", ")} to ${params.currentSlice.models.join(", ")}`;
  return {
    id: regressionId(params.current.id, params.currentSlice.provider, params.currentSlice.taskId, params.metric),
    metric: params.metric,
    severity: params.severity,
    previousSnapshotId: params.previous.id,
    currentSnapshotId: params.current.id,
    provider: params.currentSlice.provider,
    taskId: params.currentSlice.taskId,
    previousModels: [...params.previousSlice.models],
    currentModels: [...params.currentSlice.models],
    previousValue: params.previousValue,
    currentValue: params.currentValue,
    delta: params.delta,
    threshold: params.threshold,
    message: `${params.description} for ${params.currentSlice.provider}/${params.currentSlice.taskId} ${modelContext}.`
  };
}

function deriveTrend(
  snapshots: ProviderHistorySnapshot[],
  activeRegressions: number
): ProviderHistoryTrend {
  if (snapshots.length < 2) return "insufficient_evidence";
  if (activeRegressions > 0) return "regressing";
  const previous = snapshots.at(-2)!;
  const current = snapshots.at(-1)!;
  const previousSlices = new Map(previous.slices.map((slice) => [sliceKey(slice), slice]));
  let comparable = false;
  let improved = false;
  let worsened = false;

  for (const currentSlice of current.slices) {
    const previousSlice = previousSlices.get(sliceKey(currentSlice));
    if (
      previousSlice === undefined ||
      previousSlice.executedRuns === 0 ||
      currentSlice.executedRuns === 0
    ) {
      continue;
    }
    comparable = true;
    improved ||=
      increased(currentSlice.successRate, previousSlice.successRate) ||
      decreased(currentSlice.falseCompletionRate, previousSlice.falseCompletionRate) ||
      decreased(currentSlice.stuckLoopRate, previousSlice.stuckLoopRate) ||
      decreased(currentSlice.costPerSuccessUsd, previousSlice.costPerSuccessUsd);
    worsened ||=
      decreased(currentSlice.successRate, previousSlice.successRate) ||
      increased(currentSlice.falseCompletionRate, previousSlice.falseCompletionRate) ||
      increased(currentSlice.stuckLoopRate, previousSlice.stuckLoopRate) ||
      increased(currentSlice.costPerSuccessUsd, previousSlice.costPerSuccessUsd);
  }

  if (!comparable) return "insufficient_evidence";
  return improved && !worsened ? "improving" : "stable";
}

function deriveSlices(rows: ProviderHistoryRow[]): ProviderHistorySlice[] {
  const groups = new Map<string, ProviderHistoryRow[]>();
  for (const row of rows) {
    const key = sliceKey(row);
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, [row]);
    else existing.push(row);
  }

  return [...groups.values()]
    .map((groupRows) => {
      const first = groupRows[0]!;
      const executed = groupRows.filter((row) => row.status === "executed");
      const successes = executed.filter((row) => row.success).length;
      const falseCompletions = count(executed, (row) => row.falseCompletion);
      const stuckLoops = count(executed, (row) => row.stuckLoop);
      const totalCostUsd = Number(
        executed.reduce((sum, row) => sum + row.totalCostUsd, 0).toFixed(6)
      );
      return {
        provider: first.provider,
        taskId: first.taskId,
        models: [...new Set(groupRows.map((row) => row.model))].sort(),
        plannedRuns: groupRows.length,
        executedRuns: executed.length,
        paidCalls: count(groupRows, (row) => row.paidCall),
        successes,
        successRate: optionalRate(successes, executed.length),
        falseCompletions,
        falseCompletionRate: optionalRate(falseCompletions, executed.length),
        stuckLoops,
        stuckLoopRate: optionalRate(stuckLoops, executed.length),
        unsafeBlocks: count(executed, (row) => row.unsafeBlocked),
        humanApprovals: executed.reduce((sum, row) => sum + row.humanApprovals, 0),
        totalCostUsd,
        costPerSuccessUsd: successes > 0 ? totalCostUsd / successes : null
      };
    })
    .sort((left, right) => sliceKey(left).localeCompare(sliceKey(right)));
}

function modelTransitions(
  previous: ProviderHistorySnapshot,
  current: ProviderHistorySnapshot
): ProviderModelTransition[] {
  const previousSlices = new Map(previous.slices.map((slice) => [sliceKey(slice), slice]));
  return current.slices.flatMap((currentSlice) => {
    const previousSlice = previousSlices.get(sliceKey(currentSlice));
    if (previousSlice === undefined || sameStringArray(previousSlice.models, currentSlice.models)) return [];
    return [{
      provider: currentSlice.provider,
      taskId: currentSlice.taskId,
      previousModels: [...previousSlice.models],
      currentModels: [...currentSlice.models]
    }];
  });
}

function normalizeRow(row: ProviderHistoryRow, index: number): ProviderHistoryRow {
  validateRow(row, index);
  return {
    provider: row.provider.trim(),
    taskId: row.taskId.trim(),
    attempt: row.attempt,
    status: row.status,
    paidCall: row.paidCall,
    model: row.model.trim(),
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

function validateSnapshot(snapshot: ProviderHistorySnapshot): void {
  validateIsoDate("provider history snapshot.generatedAt", snapshot.generatedAt);
  if (snapshot.id !== snapshotId(snapshot.generatedAt)) {
    throw new Error("Provider history snapshot.id must be derived from generatedAt.");
  }
  if (snapshot.label.trim().length === 0) throw new Error("Provider history snapshots require a label.");
  if (snapshot.source !== "generated" && snapshot.source !== "fixture") {
    throw new Error(`Unsupported provider history source: ${String(snapshot.source)}.`);
  }
  if (!Array.isArray(snapshot.rows) || snapshot.rows.length === 0 || !Array.isArray(snapshot.slices)) {
    throw new Error("Provider history snapshots require rows and derived slices.");
  }
  snapshot.rows.forEach(validateRow);
  const expectedSlices = deriveSlices(snapshot.rows);
  if (JSON.stringify(snapshot.slices) !== JSON.stringify(expectedSlices)) {
    throw new Error("Provider history slices do not match the retained scorecard rows.");
  }
  if (!snapshot.warnings.every((warning) => typeof warning === "string")) {
    throw new Error("Provider history snapshot warnings must be strings.");
  }
}

function validateRow(row: ProviderHistoryRow, index = 0): void {
  if (!isRecord(row)) throw new Error(`Provider history row ${index} must be an object.`);
  for (const [name, value] of [["provider", row.provider], ["taskId", row.taskId], ["model", row.model]] as const) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Provider history row ${index} ${name} must be a non-empty string.`);
    }
  }
  if (!["executed", "skipped_paid_runs_disabled", "skipped_missing_api_key"].includes(row.status)) {
    throw new Error(`Provider history row ${index} has unsupported status ${String(row.status)}.`);
  }
  validateNonNegativeInteger(`row ${index}.attempt`, row.attempt, true);
  validateNonNegativeInteger(`row ${index}.humanApprovals`, row.humanApprovals);
  validateNonNegativeInteger(`row ${index}.steps`, row.steps);
  validateNonNegativeFinite(`row ${index}.totalCostUsd`, row.totalCostUsd);
  validateNonNegativeFinite(`row ${index}.maxCostUsd`, row.maxCostUsd);
  for (const [name, value] of [
    ["paidCall", row.paidCall],
    ["success", row.success],
    ["falseCompletion", row.falseCompletion],
    ["stuckLoop", row.stuckLoop],
    ["unsafeBlocked", row.unsafeBlocked],
    ["budgetExceeded", row.budgetExceeded]
  ] as const) {
    if (typeof value !== "boolean") throw new Error(`Provider history row ${index} ${name} must be boolean.`);
  }
  if (row.status !== "executed" && (row.paidCall || row.success || row.falseCompletion || row.stuckLoop)) {
    throw new Error(`Provider history row ${index} cannot report executed outcomes while skipped.`);
  }
}

function assertSnapshotShape(value: unknown, index: number): asserts value is ProviderHistorySnapshot {
  if (
    !isRecord(value) ||
    !Array.isArray(value.rows) ||
    !Array.isArray(value.slices) ||
    !Array.isArray(value.warnings)
  ) {
    throw new Error(`Provider history snapshot ${index} does not match the expected artifact shape.`);
  }
}

function assertRegressionThresholds(value: unknown): asserts value is ProviderRegressionThresholds {
  if (!isRecord(value)) throw new Error("Provider regression thresholds must be an object.");
  for (const key of [
    "successRateDrop",
    "falseCompletionRateIncrease",
    "stuckLoopRateIncrease",
    "costPerSuccessIncreaseRatio"
  ] as const) {
    const band = value[key];
    if (!isRecord(band) || typeof band.warn !== "number" || typeof band.fail !== "number") {
      throw new Error(`Provider regression threshold ${key} is invalid.`);
    }
  }
}

function mergeRegressionThresholds(
  partial: Partial<ProviderRegressionThresholds> | undefined
): ProviderRegressionThresholds {
  return {
    successRateDrop: partial?.successRateDrop ?? defaultProviderRegressionThresholds.successRateDrop,
    falseCompletionRateIncrease:
      partial?.falseCompletionRateIncrease ?? defaultProviderRegressionThresholds.falseCompletionRateIncrease,
    stuckLoopRateIncrease:
      partial?.stuckLoopRateIncrease ?? defaultProviderRegressionThresholds.stuckLoopRateIncrease,
    costPerSuccessIncreaseRatio:
      partial?.costPerSuccessIncreaseRatio ?? defaultProviderRegressionThresholds.costPerSuccessIncreaseRatio
  };
}

function validateRegressionThresholds(thresholds: ProviderRegressionThresholds): void {
  for (const [name, band] of Object.entries(thresholds)) {
    validateNonNegativeFinite(`${name}.warn`, band.warn);
    validateNonNegativeFinite(`${name}.fail`, band.fail);
    if (band.fail < band.warn) throw new Error(`${name}.fail must be greater than or equal to ${name}.warn.`);
  }
}

function sourceForCounts(total: number, generated: number, fixtures: number): ProviderHistorySource {
  if (generated === total) return "generated";
  if (fixtures === total) return "fixture";
  return "mixed";
}

function rateDelta(
  previous: number | null,
  current: number | null,
  direction: "drop" | "increase"
): number | null {
  if (previous === null || current === null) return null;
  return direction === "drop" ? previous - current : current - previous;
}

function regressionSeverity(delta: number, thresholds: ProviderRegressionBand): ProviderRegressionSeverity | null {
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

function optionalRate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function count<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

function sliceKey(value: Pick<ProviderHistorySlice, "provider" | "taskId"> | Pick<ProviderHistoryRow, "provider" | "taskId">): string {
  return `${value.provider}\u001f${value.taskId}`;
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function snapshotId(generatedAt: string): string {
  return `provider-${generatedAt.replace(/\D/g, "")}`;
}

function regressionId(
  snapshot: string,
  provider: string,
  taskId: string,
  metric: ProviderRegressionMetric
): string {
  return `${snapshot}:${slug(provider)}:${slug(taskId)}:${metric}`;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function validateUniqueSnapshotTimestamps(snapshots: ProviderHistorySnapshot[]): void {
  const timestamps = new Set<string>();
  for (const snapshot of snapshots) {
    if (timestamps.has(snapshot.generatedAt)) {
      throw new Error(`Duplicate provider history snapshot timestamp: ${snapshot.generatedAt}.`);
    }
    timestamps.add(snapshot.generatedAt);
  }
}

function validateRetention(retention: number): void {
  validateNonNegativeInteger("retention", retention, true);
}

function validateNonNegativeInteger(name: string, value: number, positive = false): void {
  if (!Number.isInteger(value) || value < (positive ? 1 : 0)) {
    throw new Error(`${name} must be ${positive ? "a positive" : "a non-negative"} integer, got ${value}.`);
  }
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

function regressionSignatures(regressions: ProviderRegression[]): string {
  return JSON.stringify(regressions);
}

function summarySignature(summary: ProviderHistoryResult["summary"]): string {
  return JSON.stringify(summary);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPercentagePoints(value: number): string {
  return `${(value * 100).toFixed(1)} pp`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
