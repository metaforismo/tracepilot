export type ActionKind =
  | "click"
  | "type"
  | "press"
  | "scroll"
  | "wait"
  | "uploadFile"
  | "finish"
  | "requestHumanApproval";

export type AgentAction =
  | { kind: "click"; x: number; y: number; expected?: string }
  | { kind: "type"; text: string; expected?: string }
  | { kind: "press"; key: string; expected?: string }
  | { kind: "scroll"; deltaX: number; deltaY: number; expected?: string }
  | { kind: "wait"; ms: number; expected?: string }
  | { kind: "uploadFile"; path: string; expected?: string }
  | { kind: "finish"; summary: string }
  | { kind: "requestHumanApproval"; reason: string };

export type Observation = {
  stepId: string;
  screenshotPath: string;
  url: string;
  title: string;
  viewport: { width: number; height: number };
  capturedAt: string;
  domText?: string;
};

export type DriverDecision = {
  action: AgentAction;
  reasoning: string;
  confidence: number;
  expectedState?: string;
};

export type VerifierStatus =
  | "progress"
  | "success"
  | "failure"
  | "uncertain"
  | "unsafe"
  | "needs_human";

export type VerifierResult = {
  status: VerifierStatus;
  reason: string;
  suggestedRecovery?: string;
};

export type TraceStep = {
  runId: string;
  stepIndex: number;
  observation: Observation;
  decision: DriverDecision;
  verifier: VerifierResult;
  latencyMs: number;
  tokenCostUsd?: number;
};

export type TaskSpec = {
  id: string;
  title: string;
  instruction: string;
  startUrl: string;
  maxSteps: number;
  approvalThresholdUsd?: number;
  untrustedContentSelectors?: string[];
};

export type RunMetrics = {
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

export type EvalMode = "baseline" | "tracepilot";

export type EvalCaseResult = {
  suiteId: string;
  caseId: string;
  mode: EvalMode;
  taskId: string;
  metrics: RunMetrics;
};

export type EvalModeSummary = {
  mode: EvalMode;
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
  medianStepsPerSuccessfulTask: number;
  costPerSuccessfulTaskUsd: number;
  medianDurationMs: number;
};

export type EvalComparisonSummary = {
  suiteId: string;
  generatedAt: string;
  modes: EvalModeSummary[];
  deltas: {
    tracepilotMinusBaseline: {
      successRate: number;
      falseCompletionRate: number;
      stuckLoopRate: number;
      unsafeBlockRate: number;
      humanApprovalRate: number;
      medianStepsPerSuccessfulTask: number;
      costPerSuccessfulTaskUsd: number;
      medianDurationMs: number;
    };
  };
};

export type FailureCategory =
  | "success"
  | "false_completion"
  | "approval_policy_miss"
  | "prompt_injection_risk"
  | "prompt_injection_blocked"
  | "requires_human_approval"
  | "stuck_loop"
  | "no_progress"
  | "unknown_failure";

export type FailureSeverity = "low" | "medium" | "high" | "critical";

export type FailureOutcome = "pass" | "fail" | "blocked";

export type InterventionOwner =
  | "post_training_data"
  | "grader_or_eval"
  | "agent_harness"
  | "safety_policy"
  | "product_workflow";

export type RecommendedIntervention = {
  owner: InterventionOwner;
  action: string;
};

export type FailureDiagnosis = {
  suiteId: string;
  caseId: string;
  mode: EvalMode;
  taskId: string;
  outcome: FailureOutcome;
  category: FailureCategory;
  severity: FailureSeverity;
  evidence: string[];
  modelBehaviorHypothesis: string;
  recommendedInterventions: RecommendedIntervention[];
};

export type FailureDiagnosisReport = {
  suiteId: string;
  generatedAt: string;
  diagnoses: FailureDiagnosis[];
  summary: {
    total: number;
    successes: number;
    failures: number;
    blocked: number;
    highestSeverity: FailureSeverity;
    categories: Array<{ category: FailureCategory; count: number }>;
    interventionOwners: Array<{ owner: InterventionOwner; count: number }>;
  };
};

export type EvalDriverKind = "scripted" | "model";

export type ModelProvider = "anthropic" | "openai" | "local" | "other";

export type RunSource = "scripted_control" | "model_api" | "model_fixture" | "dry_run";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
};

export type ModelPricing = {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  cacheReadInputUsdPerMillionTokens?: number;
  cacheCreationInputUsdPerMillionTokens?: number;
};

export type CostLedgerRun = {
  runId: string;
  suiteId: string;
  taskId: string;
  driverKind: EvalDriverKind;
  source?: RunSource;
  provider?: ModelProvider;
  model?: string;
  usage?: TokenUsage;
  pricing?: ModelPricing;
  durationMs: number;
  success: boolean;
};

export type CostLedgerRunWithCost = CostLedgerRun & {
  source: RunSource;
  computedCostUsd: number;
};

export type CostLedger = {
  experimentId: string;
  generatedAt: string;
  runs: CostLedgerRunWithCost[];
  summary: {
    runs: number;
    scriptedRuns: number;
    modelRuns: number;
    successfulModelRuns: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadInputTokens: number;
    totalCacheCreationInputTokens: number;
    totalCostUsd: number;
    costPerSuccessfulModelRunUsd: number;
  };
  warnings: string[];
};

export type ModelRunStatus =
  | "skipped_paid_runs_disabled"
  | "skipped_missing_api_key"
  | "skipped_missing_client"
  | "executed";

export type ModelRunResult = {
  durationMs: number;
  success: boolean;
  usage: TokenUsage;
  pricing: ModelPricing;
};

export type ModelRunManifest = {
  runId: string;
  suiteId: string;
  taskId: string;
  provider: ModelProvider;
  model: string;
  source: Extract<RunSource, "dry_run" | "model_api">;
  status: ModelRunStatus;
  paidCall: boolean;
  generatedAt: string;
  environment: {
    apiKeyEnvVar: string;
    apiKeyPresent: boolean;
    clientConfigured: boolean;
    paidRunsEnabled: boolean;
  };
  request?: {
    reasoningEffort?: string;
  };
  ledger?: CostLedger;
  warnings: string[];
};
