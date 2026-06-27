export type ReadinessGateDecision = "pass" | "warn" | "fail" | "blocked";
export type ReadinessGateSeverity = ReadinessGateDecision;
export type ReadinessGateRuleId =
  | "reliability-runs"
  | "reliability-success-rate"
  | "reliability-false-completion-rate"
  | "reliability-stuck-loop-rate"
  | "provider-executed-runs"
  | "provider-success-rate"
  | "provider-false-completion-rate"
  | "provider-stuck-loop-rate"
  | "provider-cost";

export type WilsonInterval = {
  point: number;
  lower: number;
  upper: number;
  confidence: number;
};

export type WilsonIntervalInput = {
  successes: number;
  runs: number;
  confidence: number;
};

export type ReadinessReliabilityEvidence = {
  suiteId: string;
  status: "executed";
  runs: number;
  successes: number;
  falseCompletions: number;
  stuckLoops: number;
  unsafeBlocks: number;
  humanApprovals: number;
  totalCostUsd: number;
  warnings: string[];
};

export type ReadinessProviderEvidence = {
  suiteId: string;
  status: "executed" | "skipped_paid_runs_disabled" | "skipped_missing_api_key" | "partial";
  plannedRuns: number;
  executedRuns: number;
  paidCalls: number;
  successes: number;
  falseCompletions: number;
  stuckLoops: number;
  unsafeBlocks: number;
  totalCostUsd: number;
  warnings: string[];
};

export type ReadinessGateThresholds = {
  confidence: 0.8 | 0.9 | 0.95 | 0.99;
  minReliabilityRuns: number;
  minProviderRuns: number;
  minSuccessRate: number;
  maxFalseCompletionRate: number;
  maxStuckLoopRate: number;
  maxCostUsd: number;
};

export type ReadinessGateInput = {
  generatedAt: string;
  reliability: ReadinessReliabilityEvidence;
  provider: ReadinessProviderEvidence;
  thresholds: ReadinessGateThresholds;
};

export type ReadinessGateRule = {
  id: ReadinessGateRuleId;
  label: string;
  severity: ReadinessGateSeverity;
  passed: boolean;
  observed: number;
  threshold: number;
  interval?: WilsonInterval;
  message: string;
};

export type ReadinessGateResult = {
  suiteId: "readiness-gate";
  generatedAt: string;
  decision: ReadinessGateDecision;
  input: ReadinessGateInput;
  rules: ReadinessGateRule[];
  summary: {
    highestSeverity: ReadinessGateDecision;
    passedRules: number;
    warnedRules: number;
    failedRules: number;
    blockedRules: number;
    totalRules: number;
  };
  warnings: string[];
};

const suiteId = "readiness-gate";
const zScores = new Map<number, number>([
  [0.8, 1.2815515655446004],
  [0.9, 1.6448536269514722],
  [0.95, 1.959963984540054],
  [0.99, 2.5758293035489004]
]);

export function wilsonInterval(input: WilsonIntervalInput): WilsonInterval {
  if (!Number.isInteger(input.runs) || input.runs < 0) {
    throw new Error(`runs must be a non-negative integer, got ${input.runs}`);
  }
  if (!Number.isInteger(input.successes) || input.successes < 0 || input.successes > input.runs) {
    throw new Error(`successes must be an integer between 0 and runs, got ${input.successes}`);
  }

  const z = zScores.get(input.confidence);
  if (z === undefined) {
    throw new Error(`Unsupported confidence ${input.confidence}; expected one of ${[...zScores.keys()].join(", ")}`);
  }

  if (input.runs === 0) {
    return { point: 0, lower: 0, upper: 0, confidence: input.confidence };
  }

  const point = input.successes / input.runs;
  const zSquared = z * z;
  const denominator = 1 + zSquared / input.runs;
  const center = point + zSquared / (2 * input.runs);
  const spread = z * Math.sqrt((point * (1 - point) + zSquared / (4 * input.runs)) / input.runs);

  return {
    point,
    lower: clampRate((center - spread) / denominator),
    upper: clampRate((center + spread) / denominator),
    confidence: input.confidence
  };
}

export function evaluateReadinessGate(input: ReadinessGateInput): ReadinessGateResult {
  validateThresholds(input.thresholds);
  const providerExecuted = input.provider.status === "executed";
  const rules: ReadinessGateRule[] = [
    minimumCountRule({
      id: "reliability-runs",
      label: "Reliability sample size",
      observed: input.reliability.runs,
      threshold: input.thresholds.minReliabilityRuns,
      failMessage: `Reliability scorecard has ${input.reliability.runs} runs, below the ${input.thresholds.minReliabilityRuns} run minimum.`
    }),
    minimumRateRule({
      id: "reliability-success-rate",
      label: "Reliability success rate",
      successes: input.reliability.successes,
      runs: input.reliability.runs,
      threshold: input.thresholds.minSuccessRate,
      confidence: input.thresholds.confidence
    }),
    maximumRateRule({
      id: "reliability-false-completion-rate",
      label: "Reliability false completion rate",
      events: input.reliability.falseCompletions,
      runs: input.reliability.runs,
      threshold: input.thresholds.maxFalseCompletionRate,
      confidence: input.thresholds.confidence
    }),
    maximumRateRule({
      id: "reliability-stuck-loop-rate",
      label: "Reliability stuck-loop rate",
      events: input.reliability.stuckLoops,
      runs: input.reliability.runs,
      threshold: input.thresholds.maxStuckLoopRate,
      confidence: input.thresholds.confidence
    }),
    providerExecutedRule(input.provider, input.thresholds)
  ];

  if (providerExecuted) {
    rules.push(
      minimumRateRule({
        id: "provider-success-rate",
        label: "Provider success rate",
        successes: input.provider.successes,
        runs: input.provider.executedRuns,
        threshold: input.thresholds.minSuccessRate,
        confidence: input.thresholds.confidence
      }),
      maximumRateRule({
        id: "provider-false-completion-rate",
        label: "Provider false completion rate",
        events: input.provider.falseCompletions,
        runs: input.provider.executedRuns,
        threshold: input.thresholds.maxFalseCompletionRate,
        confidence: input.thresholds.confidence
      }),
      maximumRateRule({
        id: "provider-stuck-loop-rate",
        label: "Provider stuck-loop rate",
        events: input.provider.stuckLoops,
        runs: input.provider.executedRuns,
        threshold: input.thresholds.maxStuckLoopRate,
        confidence: input.thresholds.confidence
      }),
      providerCostRule(input.provider, input.thresholds)
    );
  }

  const decision = highestSeverity(rules.map((rule) => rule.severity));

  return {
    suiteId,
    generatedAt: input.generatedAt,
    decision,
    input,
    rules,
    summary: {
      highestSeverity: decision,
      passedRules: rules.filter((rule) => rule.severity === "pass").length,
      warnedRules: rules.filter((rule) => rule.severity === "warn").length,
      failedRules: rules.filter((rule) => rule.severity === "fail").length,
      blockedRules: rules.filter((rule) => rule.severity === "blocked").length,
      totalRules: rules.length
    },
    warnings: uniqueWarnings([...input.reliability.warnings, ...input.provider.warnings])
  };
}

export function renderReadinessGateMarkdown(gate: ReadinessGateResult): string {
  const thresholdRows = [
    ["Confidence", formatPercent(gate.input.thresholds.confidence)],
    ["Minimum reliability runs", String(gate.input.thresholds.minReliabilityRuns)],
    ["Minimum provider runs", String(gate.input.thresholds.minProviderRuns)],
    ["Minimum success lower bound", formatPercent(gate.input.thresholds.minSuccessRate)],
    ["Maximum false-completion upper bound", formatPercent(gate.input.thresholds.maxFalseCompletionRate)],
    ["Maximum stuck-loop upper bound", formatPercent(gate.input.thresholds.maxStuckLoopRate)],
    ["Maximum provider cost", formatUsd(gate.input.thresholds.maxCostUsd)]
  ].map((row) => `| ${row[0]} | ${row[1]} |`);
  const ruleRows = gate.rules.map((rule) =>
    [
      rule.id,
      rule.severity,
      rule.passed ? "yes" : "no",
      formatObserved(rule),
      formatThreshold(rule),
      rule.message
    ].join(" | ")
  );
  const warnings = gate.warnings.length > 0 ? gate.warnings.map((warning) => `- ${warning}`).join("\n") : "- None.";

  return `# Readiness Gate

Generated at: ${gate.generatedAt}

Decision: \`${gate.decision}\`

This gate turns TracePilot reliability and provider scorecards into an operational readiness decision. It is not a broad model ranking.

## Summary

| Metric | Value |
| --- | ---: |
| Passed rules | ${gate.summary.passedRules} |
| Warned rules | ${gate.summary.warnedRules} |
| Failed rules | ${gate.summary.failedRules} |
| Blocked rules | ${gate.summary.blockedRules} |
| Total rules | ${gate.summary.totalRules} |

## Thresholds

| Threshold | Value |
| --- | ---: |
${thresholdRows.join("\n")}

## Reliability evidence

| Metric | Value |
| --- | ---: |
| Suite | \`${gate.input.reliability.suiteId}\` |
| Runs | ${gate.input.reliability.runs} |
| Successes | ${gate.input.reliability.successes} |
| False completions | ${gate.input.reliability.falseCompletions} |
| Stuck loops | ${gate.input.reliability.stuckLoops} |
| Unsafe blocks | ${gate.input.reliability.unsafeBlocks} |
| Human approvals | ${gate.input.reliability.humanApprovals} |
| Total cost | ${formatUsd(gate.input.reliability.totalCostUsd)} |

## Provider evidence

| Metric | Value |
| --- | ---: |
| Suite | \`${gate.input.provider.suiteId}\` |
| Status | \`${gate.input.provider.status}\` |
| Planned runs | ${gate.input.provider.plannedRuns} |
| Executed runs | ${gate.input.provider.executedRuns} |
| Paid calls | ${gate.input.provider.paidCalls} |
| Successes | ${gate.input.provider.successes} |
| False completions | ${gate.input.provider.falseCompletions} |
| Stuck loops | ${gate.input.provider.stuckLoops} |
| Unsafe blocks | ${gate.input.provider.unsafeBlocks} |
| Total cost | ${formatUsd(gate.input.provider.totalCostUsd)} |

## Rule outcomes

| Rule | Severity | Passed | Observed | Threshold | Message |
| --- | --- | --- | ---: | ---: | --- |
| ${ruleRows.join(" |\n| ")} |

## Warnings

${warnings}
`;
}

function minimumCountRule(params: {
  id: ReadinessGateRuleId;
  label: string;
  observed: number;
  threshold: number;
  failMessage: string;
}): ReadinessGateRule {
  const passed = params.observed >= params.threshold;
  return {
    id: params.id,
    label: params.label,
    severity: passed ? "pass" : "fail",
    passed,
    observed: params.observed,
    threshold: params.threshold,
    message: passed
      ? `${params.label} meets the ${params.threshold} run minimum.`
      : params.failMessage
  };
}

function minimumRateRule(params: {
  id: ReadinessGateRuleId;
  label: string;
  successes: number;
  runs: number;
  threshold: number;
  confidence: ReadinessGateThresholds["confidence"];
}): ReadinessGateRule {
  const interval = wilsonInterval({ successes: params.successes, runs: params.runs, confidence: params.confidence });
  const severity = interval.point < params.threshold ? "fail" : interval.lower < params.threshold ? "warn" : "pass";

  return {
    id: params.id,
    label: params.label,
    severity,
    passed: severity === "pass",
    observed: interval.point,
    threshold: params.threshold,
    interval,
    message:
      severity === "pass"
        ? `${params.label} lower bound ${formatPercent(interval.lower)} clears ${formatPercent(params.threshold)}.`
        : severity === "warn"
          ? `${params.label} point estimate ${formatPercent(interval.point)} clears ${formatPercent(params.threshold)}, but the ${formatPercent(params.confidence)} lower bound is ${formatPercent(interval.lower)}.`
          : `${params.label} point estimate ${formatPercent(interval.point)} is below ${formatPercent(params.threshold)}.`
  };
}

function maximumRateRule(params: {
  id: ReadinessGateRuleId;
  label: string;
  events: number;
  runs: number;
  threshold: number;
  confidence: ReadinessGateThresholds["confidence"];
}): ReadinessGateRule {
  const interval = wilsonInterval({ successes: params.events, runs: params.runs, confidence: params.confidence });
  const severity = interval.point > params.threshold ? "fail" : interval.upper > params.threshold ? "warn" : "pass";

  return {
    id: params.id,
    label: params.label,
    severity,
    passed: severity === "pass",
    observed: interval.point,
    threshold: params.threshold,
    interval,
    message:
      severity === "pass"
        ? `${params.label} upper bound ${formatPercent(interval.upper)} stays under ${formatPercent(params.threshold)}.`
        : severity === "warn"
          ? `${params.label} point estimate ${formatPercent(interval.point)} is under ${formatPercent(params.threshold)}, but the ${formatPercent(params.confidence)} upper bound is ${formatPercent(interval.upper)}.`
          : `${params.label} point estimate ${formatPercent(interval.point)} exceeds ${formatPercent(params.threshold)}.`
  };
}

function providerExecutedRule(
  provider: ReadinessProviderEvidence,
  thresholds: ReadinessGateThresholds
): ReadinessGateRule {
  if (provider.status !== "executed") {
    return {
      id: "provider-executed-runs",
      label: "Provider executed runs",
      severity: "blocked",
      passed: false,
      observed: provider.executedRuns,
      threshold: thresholds.minProviderRuns,
      message: `Provider runs were not executed; status is ${provider.status}.`
    };
  }

  const passed = provider.executedRuns >= thresholds.minProviderRuns;
  return {
    id: "provider-executed-runs",
    label: "Provider executed runs",
    severity: passed ? "pass" : "blocked",
    passed,
    observed: provider.executedRuns,
    threshold: thresholds.minProviderRuns,
    message: passed
      ? `Provider scorecard has ${provider.executedRuns} executed runs.`
      : `Provider scorecard has ${provider.executedRuns} executed runs, below the ${thresholds.minProviderRuns} run minimum.`
  };
}

function providerCostRule(
  provider: ReadinessProviderEvidence,
  thresholds: ReadinessGateThresholds
): ReadinessGateRule {
  const passed = provider.totalCostUsd <= thresholds.maxCostUsd;
  return {
    id: "provider-cost",
    label: "Provider cost",
    severity: passed ? "pass" : "fail",
    passed,
    observed: provider.totalCostUsd,
    threshold: thresholds.maxCostUsd,
    message: passed
      ? `Provider cost ${formatUsd(provider.totalCostUsd)} is inside budget.`
      : `Provider cost ${formatUsd(provider.totalCostUsd)} exceeds budget ${formatUsd(thresholds.maxCostUsd)}.`
  };
}

function highestSeverity(severities: ReadinessGateSeverity[]): ReadinessGateDecision {
  if (severities.includes("blocked")) {
    return "blocked";
  }
  if (severities.includes("fail")) {
    return "fail";
  }
  if (severities.includes("warn")) {
    return "warn";
  }
  return "pass";
}

function validateThresholds(thresholds: ReadinessGateThresholds): void {
  if (!zScores.has(thresholds.confidence)) {
    throw new Error(`Unsupported confidence ${thresholds.confidence}; expected one of ${[...zScores.keys()].join(", ")}`);
  }
  for (const [name, value] of Object.entries(thresholds)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Threshold ${name} must be a non-negative finite number, got ${value}`);
    }
  }
}

function clampRate(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function formatObserved(rule: ReadinessGateRule): string {
  if (rule.id.endsWith("rate")) {
    return rule.interval === undefined
      ? formatPercent(rule.observed)
      : `${formatPercent(rule.observed)} (${formatPercent(rule.interval.lower)}-${formatPercent(rule.interval.upper)})`;
  }
  if (rule.id === "provider-cost") {
    return formatUsd(rule.observed);
  }
  return String(rule.observed);
}

function formatThreshold(rule: ReadinessGateRule): string {
  if (rule.id.endsWith("rate")) {
    return formatPercent(rule.threshold);
  }
  if (rule.id === "provider-cost") {
    return formatUsd(rule.threshold);
  }
  return String(rule.threshold);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}
