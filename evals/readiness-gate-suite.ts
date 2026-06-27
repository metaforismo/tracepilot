import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  evaluateReadinessGate,
  renderReadinessGateMarkdown,
  type ReadinessGateInput,
  type ReadinessGateResult,
  type ReadinessGateThresholds,
  type ReadinessProviderEvidence,
  type ReadinessReliabilityEvidence
} from "../packages/core/src/readiness-gate.js";
import {
  runReliabilityScorecardSuite,
  type ReliabilityScorecardSummary
} from "./reliability-scorecard-suite.js";
import {
  runProviderScorecardSuite,
  type ProviderScorecardSummary
} from "./provider-scorecard-suite.js";

export type ReadinessGateSuiteOptions = {
  runsDir: string;
  generatedAt?: string;
  reliabilityRepetitions?: number;
  headless?: boolean;
  thresholds?: Partial<ReadinessGateThresholds>;
  providerEnv?: NodeJS.ProcessEnv;
  reliabilityEvidence?: ReadinessReliabilityEvidence;
  providerEvidence?: ReadinessProviderEvidence;
  reliabilitySummary?: ReliabilityScorecardSummary;
  providerSummary?: ProviderScorecardSummary;
};

export type ReadinessGateSuiteResult = {
  gate: ReadinessGateResult;
  inputs: ReadinessGateInput;
  artifacts: {
    inputsPath: string;
    gatePath: string;
    reportPath: string;
  };
};

const defaultThresholds: ReadinessGateThresholds = {
  confidence: 0.95,
  minReliabilityRuns: 5,
  minProviderRuns: 6,
  minSuccessRate: 0.75,
  maxFalseCompletionRate: 0.1,
  maxStuckLoopRate: 0.1,
  maxCostUsd: 0.5
};

export async function runReadinessGateSuite(
  options: ReadinessGateSuiteOptions
): Promise<ReadinessGateSuiteResult> {
  await rm(options.runsDir, { recursive: true, force: true });
  await mkdir(options.runsDir, { recursive: true });

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const thresholds = { ...defaultThresholds, ...(options.thresholds ?? {}) };
  const reliability =
    options.reliabilityEvidence ??
    (options.reliabilitySummary === undefined
      ? await runReliabilityEvidence(options)
      : reliabilityEvidenceFromSummary(options.reliabilitySummary));
  const provider =
    options.providerEvidence ??
    (options.providerSummary === undefined ? await runProviderEvidence(options) : providerEvidenceFromSummary(options.providerSummary));
  const inputs: ReadinessGateInput = {
    generatedAt,
    reliability,
    provider,
    thresholds
  };
  const gate = evaluateReadinessGate(inputs);
  const artifacts = {
    inputsPath: join(options.runsDir, "readiness-inputs.json"),
    gatePath: join(options.runsDir, "readiness-gate.json"),
    reportPath: join(options.runsDir, "readiness-gate.md")
  };

  await writeFile(artifacts.inputsPath, `${JSON.stringify(inputs, null, 2)}\n`, "utf8");
  await writeFile(artifacts.gatePath, `${JSON.stringify(gate, null, 2)}\n`, "utf8");
  await writeFile(artifacts.reportPath, renderReadinessGateMarkdown(gate), "utf8");

  return { gate, inputs, artifacts };
}

async function runReliabilityEvidence(options: ReadinessGateSuiteOptions): Promise<ReadinessReliabilityEvidence> {
  const result = await runReliabilityScorecardSuite({
    runsDir: join(options.runsDir, "reliability-scorecard"),
    repetitions: options.reliabilityRepetitions ?? 1,
    ...(options.generatedAt === undefined ? {} : { generatedAt: options.generatedAt }),
    ...(options.headless === undefined ? {} : { headless: options.headless })
  });

  return reliabilityEvidenceFromSummary(result.summary);
}

async function runProviderEvidence(options: ReadinessGateSuiteOptions): Promise<ReadinessProviderEvidence> {
  const env = options.providerEnv === undefined ? undefined : { ...process.env, ...options.providerEnv };
  const result = await runProviderScorecardSuite({
    runsDir: join(options.runsDir, "provider-scorecard"),
    ...(options.generatedAt === undefined ? {} : { generatedAt: options.generatedAt }),
    ...(options.headless === undefined ? {} : { headless: options.headless }),
    ...(env === undefined ? {} : { env })
  });

  return providerEvidenceFromSummary(result.summary);
}

function reliabilityEvidenceFromSummary(summary: ReliabilityScorecardSummary): ReadinessReliabilityEvidence {
  return {
    suiteId: summary.suiteId,
    status: "executed",
    runs: summary.totalRuns,
    successes: summary.successes,
    falseCompletions: summary.falseCompletions,
    stuckLoops: summary.stuckLoops,
    unsafeBlocks: summary.unsafeBlocks,
    humanApprovals: summary.humanApprovals,
    totalCostUsd: summary.totalCostUsd,
    warnings: summary.warnings
  };
}

function providerEvidenceFromSummary(summary: ProviderScorecardSummary): ReadinessProviderEvidence {
  return {
    suiteId: summary.suiteId,
    status: summary.status,
    plannedRuns: summary.plannedRuns,
    executedRuns: summary.executedRuns,
    paidCalls: summary.paidCalls,
    successes: summary.successes,
    falseCompletions: summary.falseCompletions,
    stuckLoops: summary.stuckLoops,
    unsafeBlocks: summary.unsafeBlocks,
    totalCostUsd: summary.totalCostUsd,
    warnings: summary.warnings
  };
}
