import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ScorecardSourceKind = "runs_latest" | "fixture";

export type ScorecardSource = {
  kind: ScorecardSourceKind;
  root: string;
  summaryPath: string;
  rowsPath: string;
};

export type ProviderScorecardProvider = "openai" | "anthropic";
export type ProviderScorecardTaskId = "legacy-portal" | "modal-interruption" | "prompt-injection";
export type ProviderScorecardRowStatus = "skipped_paid_runs_disabled" | "skipped_missing_api_key" | "executed";
export type ProviderScorecardStatus = ProviderScorecardRowStatus | "partial";

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
  suiteId: "provider-scorecard";
  status: ProviderScorecardStatus;
  generatedAt: string;
  repetitions: number;
  paidCalls: number;
  providers: Array<ProviderScorecardGroupSummary & { provider: ProviderScorecardProvider }>;
  tasks: Array<ProviderScorecardGroupSummary & { taskId: ProviderScorecardTaskId }>;
  warnings: string[];
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

export type ProviderScorecardArtifact = {
  source: ScorecardSource;
  summary: ProviderScorecardSummary;
  rows: ProviderScorecardRow[];
};

export type ReliabilityScorecardCaseSummary = {
  caseId: string;
  title: string;
  runs: number;
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
  medianDurationMs: number;
};

export type ReliabilityScorecardSummary = {
  suiteId: "reliability-scorecard";
  generatedAt: string;
  repetitions: number;
  totalRuns: number;
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
  medianDurationMs: number;
  totalCostUsd: number;
  costPerSuccessfulRunUsd: number;
  cases: ReliabilityScorecardCaseSummary[];
  warnings: string[];
};

export type ReliabilityScorecardResult = {
  suiteId: "reliability-scorecard";
  caseId: string;
  mode: "tracepilot" | string;
  taskId: string;
  metrics: {
    runId: string;
    taskId: string;
    success: boolean;
    steps: number;
    falseCompletion: boolean;
    stuckLoop: boolean;
    unsafeBlocked: boolean;
    humanApprovals: number;
    totalCostUsd: number;
    durationMs: number;
  };
};

export type ReliabilityScorecardArtifact = {
  source: ScorecardSource;
  summary: ReliabilityScorecardSummary;
  results: ReliabilityScorecardResult[];
};

export type ScorecardLoadOptions = {
  runsRoot?: string;
  fixtureRoot?: string;
};

const defaultFixtureRoot = join(process.cwd(), "fixtures", "scorecards");

export async function loadProviderScorecard(options: ScorecardLoadOptions = {}): Promise<ProviderScorecardArtifact> {
  const loaded = await loadArtifactPair<ProviderScorecardSummary, ProviderScorecardRow[]>({
    options,
    suiteDir: "provider-scorecard",
    generatedSummaryFile: "provider-scorecard.json",
    generatedRowsFile: "provider-results.json",
    fixtureSummaryFile: "provider-scorecard.json",
    fixtureRowsFile: "provider-results.json"
  });

  return {
    source: loaded.source,
    summary: loaded.summary,
    rows: loaded.rows
  };
}

export async function loadReliabilityScorecard(options: ScorecardLoadOptions = {}): Promise<ReliabilityScorecardArtifact> {
  const loaded = await loadArtifactPair<ReliabilityScorecardSummary, ReliabilityScorecardResult[]>({
    options,
    suiteDir: "reliability-scorecard",
    generatedSummaryFile: "reliability-scorecard.json",
    generatedRowsFile: "reliability-results.json",
    fixtureSummaryFile: "reliability-scorecard.json",
    fixtureRowsFile: "reliability-results.json"
  });

  return {
    source: loaded.source,
    summary: loaded.summary,
    results: loaded.rows
  };
}

async function loadArtifactPair<TSummary, TRows>(params: {
  options: ScorecardLoadOptions;
  suiteDir: string;
  generatedSummaryFile: string;
  generatedRowsFile: string;
  fixtureSummaryFile: string;
  fixtureRowsFile: string;
}): Promise<{ source: ScorecardSource; summary: TSummary; rows: TRows }> {
  const runsRoot = params.options.runsRoot ?? defaultRunsRoot();
  const fixtureRoot = params.options.fixtureRoot ?? defaultFixtureRoot;
  const generatedSummaryPath = join(runsRoot, params.suiteDir, params.generatedSummaryFile);
  const generatedRowsPath = join(runsRoot, params.suiteDir, params.generatedRowsFile);
  const fixtureSummaryPath = join(fixtureRoot, params.fixtureSummaryFile);
  const fixtureRowsPath = join(fixtureRoot, params.fixtureRowsFile);

  try {
    const [summary, rows] = await Promise.all([
      readJson<TSummary>(generatedSummaryPath),
      readJson<TRows>(generatedRowsPath)
    ]);
    return {
      source: {
        kind: "runs_latest",
        root: runsRoot,
        summaryPath: generatedSummaryPath,
        rowsPath: generatedRowsPath
      },
      summary,
      rows
    };
  } catch {
    const [summary, rows] = await Promise.all([
      readJson<TSummary>(fixtureSummaryPath),
      readJson<TRows>(fixtureRowsPath)
    ]);
    return {
      source: {
        kind: "fixture",
        root: fixtureRoot,
        summaryPath: fixtureSummaryPath,
        rowsPath: fixtureRowsPath
      },
      summary,
      rows
    };
  }
}

async function readJson<T>(path: string): Promise<T> {
  const text = await readFile(/* turbopackIgnore: true */ path, "utf8");
  return JSON.parse(text) as T;
}

function defaultRunsRoot(): string {
  return process.env.TRACEPILOT_STUDIO_RUNS_DIR ?? join(/* turbopackIgnore: true */ process.cwd(), "..", "..", "runs", "latest");
}
