import { mkdir, open, readFile, rename, rm, stat, writeFile, type FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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
  appendReadinessHistory,
  renderReadinessHistoryMarkdown,
  validateReadinessHistory,
  type ReadinessHistoryResult
} from "../packages/core/src/readiness-history.js";
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
  historyDir?: string;
  historyLabel?: string;
  historyRevision?: string;
  historyRetention?: number;
};

export type ReadinessGateSuiteResult = {
  gate: ReadinessGateResult;
  inputs: ReadinessGateInput;
  artifacts: {
    inputsPath: string;
    gatePath: string;
    reportPath: string;
    historyPath: string;
    historyReportPath: string;
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
  const historyDir = options.historyDir ?? defaultHistoryDir(options.runsDir);
  const artifacts = {
    inputsPath: join(options.runsDir, "readiness-inputs.json"),
    gatePath: join(options.runsDir, "readiness-gate.json"),
    reportPath: join(options.runsDir, "readiness-gate.md"),
    historyPath: join(historyDir, "readiness-history.json"),
    historyReportPath: join(historyDir, "readiness-history.md")
  };

  const historyLabel = resolveHistoryLabel(options);
  const historyRevision = resolveHistoryRevision(options);

  await Promise.all([
    writeFile(artifacts.inputsPath, `${JSON.stringify(inputs, null, 2)}\n`, "utf8"),
    writeFile(artifacts.gatePath, `${JSON.stringify(gate, null, 2)}\n`, "utf8"),
    writeFile(artifacts.reportPath, renderReadinessGateMarkdown(gate), "utf8")
  ]);
  await mkdir(historyDir, { recursive: true });
  await withHistoryLock(join(historyDir, ".readiness-history.lock"), async () => {
    const previousHistory = await readHistory(artifacts.historyPath);
    const history = appendReadinessHistory(
      previousHistory,
      {
        gate,
        source: "generated",
        ...(historyLabel === undefined ? {} : { label: historyLabel }),
        ...(historyRevision === undefined ? {} : { revision: historyRevision })
      },
      {
        generatedAt,
        ...(options.historyRetention === undefined ? {} : { retention: options.historyRetention })
      }
    );

    await Promise.all([
      atomicWriteFile(artifacts.historyPath, `${JSON.stringify(history, null, 2)}\n`),
      atomicWriteFile(artifacts.historyReportPath, renderReadinessHistoryMarkdown(history))
    ]);
  });

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

function defaultHistoryDir(runsDir: string): string {
  const parent = dirname(runsDir);
  return basename(parent) === "latest"
    ? join(dirname(parent), "history", basename(runsDir))
    : join(runsDir, "history");
}

function resolveHistoryLabel(options: ReadinessGateSuiteOptions): string | undefined {
  return options.historyLabel ?? process.env.TRACEPILOT_RELEASE_LABEL;
}

function resolveHistoryRevision(options: ReadinessGateSuiteOptions): string | undefined {
  return options.historyRevision ?? process.env.TRACEPILOT_REVISION ?? process.env.GITHUB_SHA;
}

async function readHistory(path: string): Promise<ReadinessHistoryResult | undefined> {
  try {
    const text = await readFile(path, "utf8");
    const value = JSON.parse(text) as unknown;
    validateReadinessHistory(value);
    return value;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function atomicWriteFile(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function withHistoryLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const handle = await acquireHistoryLock(path);
  try {
    return await operation();
  } finally {
    await handle.close();
    await rm(path, { force: true });
  }
}

async function acquireHistoryLock(path: string): Promise<FileHandle> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const handle = await open(path, "wx");
      try {
        await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`, "utf8");
        return handle;
      } catch (error) {
        await handle.close();
        await rm(path, { force: true });
        throw error;
      }
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") throw error;
      if (await isStaleLock(path)) {
        await rm(path, { force: true });
        continue;
      }
      await delay(25);
    }
  }

  throw new Error(`Timed out waiting for readiness history lock at ${path}.`);
}

async function isStaleLock(path: string): Promise<boolean> {
  try {
    const metadata = await stat(path);
    return Date.now() - metadata.mtimeMs > 30_000;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
