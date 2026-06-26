import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentDriver } from "@tracepilot/agents";
import {
  createTraceStore,
  inspectUntrustedContent,
  isStuckLoop,
  validateSensitiveAction,
  verifyActionEffect
} from "@tracepilot/core";
import type { RunMetrics, TaskSpec, TraceStep } from "@tracepilot/core";
import { BrowserSandbox, executeAction } from "@tracepilot/sandbox";

export type RunTaskOptions = {
  task: TaskSpec;
  driver: AgentDriver;
  runsDir: string;
  headless?: boolean;
  maxCostUsd?: number;
};

export type RunTaskResult = {
  metrics: RunMetrics;
  runDir: string;
  steps: TraceStep[];
};

export async function runTask(options: RunTaskOptions): Promise<RunTaskResult> {
  const startedAt = Date.now();
  await mkdir(options.runsDir, { recursive: true });
  const store = await createTraceStore(options.runsDir, options.task.id);
  const steps: TraceStep[] = [];
  let sandbox: BrowserSandbox | undefined;
  let success = false;
  let falseCompletion = false;
  let stuckLoop = false;
  let unsafeBlocked = false;
  let humanApprovals = 0;
  let budgetExceeded = false;

  try {
    sandbox = await BrowserSandbox.launch({
      task: options.task,
      traceStore: store,
      ...(options.headless === undefined ? {} : { headless: options.headless })
    });

    let observation = await sandbox.observe("step-0");

    for (let stepIndex = 0; stepIndex < options.task.maxSteps; stepIndex += 1) {
      const decisionResult = await decideSafely(options.driver, { task: options.task, observation, steps });
      if (!decisionResult.ok) {
        const step = traceStep({
          task: options.task,
          stepIndex,
          observation,
          decision: decisionResult.decision,
          verifier: decisionResult.verifier,
          startedAt
        });
        steps.push(step);
        await store.appendStep(step);
        break;
      }
      const decision = decisionResult.decision;
      const unsafe = inspectUntrustedContent(observation.domText ?? "");
      if (unsafe.status === "unsafe") {
        unsafeBlocked = true;
        const step = traceStep({ task: options.task, stepIndex, observation, decision, verifier: unsafe, startedAt });
        steps.push(step);
        await store.appendStep(step);
        break;
      }

      const sensitive = validateSensitiveAction(options.task, decision.action);
      if (sensitive.status === "needs_human") {
        humanApprovals += 1;
        const step = traceStep({ task: options.task, stepIndex, observation, decision, verifier: sensitive, startedAt });
        steps.push(step);
        await store.appendStep(step);
        break;
      }

      const before = observation;
      const execution = await executeAction(sandbox.page, decision.action);
      observation = await sandbox.observe(`step-${stepIndex + 1}`);
      const verifier = execution.ok
        ? verifyActionEffect({
            before,
            after: observation,
            action: decision.action,
            ...(decision.expectedState === undefined ? {} : { expectedState: decision.expectedState })
          })
        : execution.verifier;

      const step = traceStep({ task: options.task, stepIndex, observation, decision, verifier, startedAt });
      steps.push(step);
      await store.appendStep(step);

      const reachedBudget = options.maxCostUsd !== undefined && totalCostUsd(steps) >= options.maxCostUsd;

      if (verifier.status === "success") {
        success = true;
        budgetExceeded = reachedBudget;
        break;
      }

      if (decision.action.kind === "finish" && verifier.status === "failure") {
        falseCompletion = true;
        budgetExceeded = reachedBudget;
        break;
      }

      if (reachedBudget) {
        budgetExceeded = true;
        break;
      }

      if (isStuckLoop(steps)) {
        stuckLoop = true;
        break;
      }
    }
  } finally {
    await sandbox?.close();
  }

  const metrics: RunMetrics = {
    runId: store.runId,
    taskId: options.task.id,
    success,
    steps: steps.length,
    falseCompletion,
    stuckLoop,
    unsafeBlocked,
    humanApprovals,
    totalCostUsd: totalCostUsd(steps),
    ...(budgetExceeded ? { budgetExceeded } : {}),
    durationMs: Date.now() - startedAt
  };
  await store.writeMetrics(metrics);

  return {
    metrics,
    runDir: join(options.runsDir, options.task.id),
    steps
  };
}

async function decideSafely(
  driver: AgentDriver,
  context: Parameters<AgentDriver["decide"]>[0]
): Promise<
  | { ok: true; decision: Awaited<ReturnType<AgentDriver["decide"]>> }
  | { ok: false; decision: Awaited<ReturnType<AgentDriver["decide"]>>; verifier: TraceStep["verifier"] }
> {
  try {
    return { ok: true, decision: await driver.decide(context) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      decision: {
        action: { kind: "finish", summary: "Driver failed before choosing a valid browser action." },
        reasoning: `Driver decision failed: ${message}`,
        confidence: 0
      },
      verifier: {
        status: "failure",
        reason: `Driver decision failed: ${message}`,
        suggestedRecovery: "Inspect the model output, schema, and observation before retrying."
      }
    };
  }
}

function traceStep(params: {
  task: TaskSpec;
  stepIndex: number;
  observation: TraceStep["observation"];
  decision: TraceStep["decision"];
  verifier: TraceStep["verifier"];
  startedAt: number;
}): TraceStep {
  return {
    runId: params.task.id,
    stepIndex: params.stepIndex,
    observation: params.observation,
    decision: params.decision,
    verifier: params.verifier,
    latencyMs: Date.now() - params.startedAt,
    ...(params.decision.modelRun?.costUsd === undefined ? {} : { tokenCostUsd: params.decision.modelRun.costUsd })
  };
}

function totalCostUsd(steps: TraceStep[]): number {
  return Number(steps.reduce((sum, step) => sum + (step.tokenCostUsd ?? 0), 0).toFixed(6));
}
