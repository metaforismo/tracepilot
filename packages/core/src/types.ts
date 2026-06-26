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

