import { parseArgs } from "node:util";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTraceStore } from "../packages/core/src/trace-store.js";
import type { Observation, RunMetrics, TraceStep } from "../packages/core/src/types.js";
import { startTargetServer } from "../apps/targets/src/server.js";
import { createSmokeFormTask, evaluateSmokeForm } from "./tasks/smoke-form.js";
import { ScriptedDriver } from "../packages/agents/src/scripted-driver.js";
import { runTask } from "../packages/harness/src/orchestrator.js";
import {
  approvalDriverDecisions,
  createApprovalTask,
  createMaliciousInvoiceTask,
  createPortalTask,
  createValidationRecoveryTask,
  maliciousDriverDecisions,
  portalDriverDecisions,
  validationRecoveryDriverDecisions
} from "./tasks/invoice-to-portal.js";
import { runComparisonSuite } from "./comparison-suite.js";
import { runCostLedgerSuite } from "./cost-ledger-suite.js";
import { runModelReadinessSuite } from "./model-readiness-suite.js";
import { runOpenAIBenchmarkSuite } from "./openai-benchmark-suite.js";
import { runModelBrowserSuite } from "./model-browser-suite.js";
import { runAnthropicComputerUseSuite } from "./anthropic-computer-use-suite.js";
import { runReliabilityScorecardSuite, type ReliabilityScorecardSummary } from "./reliability-scorecard-suite.js";
import { runProviderScorecardSuite, type ProviderScorecardSummary } from "./provider-scorecard-suite.js";
import { runReadinessGateSuite } from "./readiness-gate-suite.js";
import { runEvidencePackSuite } from "./evidence-pack-suite.js";
import { runEvidencePackVerifySuite } from "./evidence-pack-verify-suite.js";

const { values } = parseArgs({
  args: normalizeArgs(process.argv.slice(2)),
  options: {
    suite: { type: "string", default: "smoke" },
    repetitions: { type: "string" }
  },
  allowPositionals: true
});

if (
  values.suite !== "smoke" &&
  values.suite !== "invoice" &&
  values.suite !== "comparison" &&
  values.suite !== "reliability-scorecard" &&
  values.suite !== "provider-scorecard" &&
  values.suite !== "readiness-gate" &&
  values.suite !== "cost-ledger" &&
  values.suite !== "model-readiness" &&
  values.suite !== "openai-benchmark" &&
  values.suite !== "model-browser" &&
  values.suite !== "anthropic-computer-use" &&
  values.suite !== "evidence-pack" &&
  values.suite !== "evidence-pack-verify"
) {
  throw new Error(`Unknown eval suite: ${values.suite}`);
}

if (values.suite === "evidence-pack-verify") {
  const result = await runEvidencePackVerifySuite({
    runsDir: join(process.cwd(), "runs", "latest", "evidence-pack-verify")
  });
  console.log(
    `evidence-pack-verify decision=${result.report.decision} artifacts=${result.report.summary.verifiedArtifacts} errors=${result.report.summary.errors} warnings=${result.report.summary.warnings} report=${result.artifacts.reportMarkdownPath}`
  );
} else if (values.suite === "evidence-pack") {
  const result = await runEvidencePackSuite({
    runsDir: join(process.cwd(), "runs", "latest", "evidence-pack")
  });
  console.log(
    `evidence-pack artifacts=${result.manifest.summary.totalArtifacts} redacted=${result.manifest.summary.redactedArtifacts} manifest=${result.artifacts.manifestPath} report=${result.artifacts.reportPath}`
  );
} else if (values.suite === "anthropic-computer-use") {
  const result = await runAnthropicComputerUseSuite({
    runsDir: join(process.cwd(), "runs", "latest", "anthropic-computer-use")
  });
  console.log(
    `anthropic-computer-use status=${result.summary.status} paid_call=${result.summary.paidCall} success=${result.summary.success} steps=${result.summary.steps} total_cost_usd=${result.summary.totalCostUsd} report=${result.artifacts.reportPath}`
  );
} else if (values.suite === "model-browser") {
  const result = await runModelBrowserSuite({
    runsDir: join(process.cwd(), "runs", "latest", "model-browser")
  });
  console.log(
    `model-browser status=${result.summary.status} paid_call=${result.summary.paidCall} success=${result.summary.success} steps=${result.summary.steps} total_cost_usd=${result.summary.totalCostUsd} report=${result.artifacts.reportPath}`
  );
} else if (values.suite === "openai-benchmark") {
  const result = await runOpenAIBenchmarkSuite({
    runsDir: join(process.cwd(), "runs", "latest", "openai-benchmark")
  });
  console.log(
    `openai-benchmark status=${result.summary.status} paid_calls=${result.summary.paidCalls} passed=${result.summary.passed} failed=${result.summary.failed} total_cost_usd=${result.summary.totalCostUsd} report=${result.artifacts.reportPath}`
  );
} else if (values.suite === "model-readiness") {
  const result = await runModelReadinessSuite({
    runsDir: join(process.cwd(), "runs", "latest", "model-readiness")
  });
  const reasoningEffort = result.manifest.request?.reasoningEffort
    ? ` reasoning_effort=${result.manifest.request.reasoningEffort}`
    : "";
  console.log(
    `model-readiness provider=${result.manifest.provider} model=${result.manifest.model}${reasoningEffort} status=${result.manifest.status} source=${result.manifest.source} paid_call=${result.manifest.paidCall} manifest=${result.artifacts.manifestPath} report=${result.artifacts.reportPath}`
  );
} else if (values.suite === "cost-ledger") {
  const result = await runCostLedgerSuite({
    runsDir: join(process.cwd(), "runs", "latest", "cost-ledger")
  });
  const modelRun = result.ledger.runs.find((run) => run.driverKind === "model");
  console.log(
    `cost-ledger model_runs=${result.ledger.summary.modelRuns} scripted_controls=${result.ledger.summary.scriptedRuns} total_cost_usd=${result.ledger.summary.totalCostUsd} source=${modelRun?.source ?? "none"} ledger=${result.artifacts.ledgerPath} report=${result.artifacts.reportPath}`
  );
} else if (values.suite === "comparison") {
  const result = await runComparisonSuite({
    runsDir: join(process.cwd(), "runs", "latest", "comparison")
  });
  const delta = result.summary.deltas.tracepilotMinusBaseline;
  console.log(
    `comparison success_delta=${formatPercent(delta.successRate)} false_completion_delta=${formatPercent(delta.falseCompletionRate)} report=${result.artifacts.reportPath} diagnosis=${result.artifacts.diagnosisReportPath}`
  );
} else if (values.suite === "reliability-scorecard") {
  const result = await runReliabilityScorecardSuite({
    runsDir: join(process.cwd(), "runs", "latest", "reliability-scorecard"),
    ...(values.repetitions === undefined ? {} : { repetitions: parsePositiveInteger("repetitions", values.repetitions) })
  });
  console.log(
    `reliability-scorecard runs=${result.summary.totalRuns} repetitions=${result.summary.repetitions} success_rate=${formatPercent(result.summary.successRate)} false_completion_rate=${formatPercent(result.summary.falseCompletionRate)} stuck_loop_rate=${formatPercent(result.summary.stuckLoopRate)} report=${result.artifacts.reportPath} diagnosis=${result.artifacts.diagnosisReportPath}`
  );
} else if (values.suite === "provider-scorecard") {
  const result = await runProviderScorecardSuite({
    runsDir: join(process.cwd(), "runs", "latest", "provider-scorecard"),
    ...(values.repetitions === undefined ? {} : { repetitions: parsePositiveInteger("repetitions", values.repetitions) })
  });
  console.log(
    `provider-scorecard status=${result.summary.status} planned_runs=${result.summary.plannedRuns} executed_runs=${result.summary.executedRuns} success_rate=${formatPercent(result.summary.successRate)} total_cost_usd=${result.summary.totalCostUsd} report=${result.artifacts.reportPath} diagnosis=${result.artifacts.diagnosisReportPath}`
  );
} else if (values.suite === "readiness-gate") {
  const latestScorecards = process.env.TRACEPILOT_READINESS_USE_LATEST_SCORECARDS === "1"
    ? await loadLatestScorecardSummaries()
    : {};
  const result = await runReadinessGateSuite({
    runsDir: join(process.cwd(), "runs", "latest", "readiness-gate"),
    ...latestScorecards,
    ...(values.repetitions === undefined
      ? {}
      : { reliabilityRepetitions: parsePositiveInteger("repetitions", values.repetitions) })
  });
  console.log(
    `readiness-gate decision=${result.gate.decision} reliability_runs=${result.inputs.reliability.runs} provider_executed_runs=${result.inputs.provider.executedRuns} report=${result.artifacts.reportPath}`
  );
} else if (values.suite === "invoice") {
  const summary = await runInvoiceSuite();
  console.log(
    `invoice success=${summary.success} portal=${summary.portalSuccess} validation=${summary.validationRecovered} approval=${summary.approvalStopped} injection=${summary.injectionBlocked}`
  );
} else {
  const metrics = await runSmokeSuite();
  console.log(`smoke-form success=${metrics.success} steps=${metrics.steps}`);
}

function normalizeArgs(args: string[]): string[] {
  return args[0] === "--" ? args.slice(1) : args;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function loadLatestScorecardSummaries(): Promise<{
  reliabilitySummary: ReliabilityScorecardSummary;
  providerSummary: ProviderScorecardSummary;
}> {
  return {
    reliabilitySummary: await readJson(join(process.cwd(), "runs", "latest", "reliability-scorecard", "reliability-scorecard.json")),
    providerSummary: await readJson(join(process.cwd(), "runs", "latest", "provider-scorecard", "provider-scorecard.json"))
  };
}

async function readJson<T>(path: string): Promise<T> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as T;
}

function parsePositiveInteger(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer, got ${value}`);
  }
  return parsed;
}

async function runSmokeSuite(): Promise<RunMetrics> {
  const target = await startTargetServer();
  const startedAt = Date.now();
  const latestDir = join(process.cwd(), "runs", "latest");
  await rm(latestDir, { recursive: true, force: true });
  await mkdir(latestDir, { recursive: true });

  try {
    const task = createSmokeFormTask(target.origin);
    const store = await createTraceStore(latestDir, task.id);

    const formResponse = await fetch(task.startUrl);
    const formHtml = await formResponse.text();
    const before = observation({
      stepId: "step-0",
      url: task.startUrl,
      title: "TracePilot Smoke Form",
      domText: formHtml
    });

    const submitResponse = await fetch(task.startUrl, {
      method: "POST",
      body: new URLSearchParams({ vendor: "Acme Labs", amount: "1200" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      redirect: "manual"
    });

    const location = submitResponse.headers.get("location");
    if (submitResponse.status !== 303 || !location) {
      throw new Error(`Expected smoke form redirect, got ${submitResponse.status}`);
    }

    const successUrl = `${target.origin}${location}`;
    const successResponse = await fetch(successUrl);
    const successHtml = await successResponse.text();
    const after = observation({
      stepId: "step-1",
      url: successUrl,
      title: "Invoice Saved",
      domText: successHtml
    });
    const success = evaluateSmokeForm(successHtml);

    const steps: TraceStep[] = [
      {
        runId: store.runId,
        stepIndex: 0,
        observation: before,
        decision: {
          action: { kind: "type", text: "vendor=Acme Labs; amount=1200" },
          reasoning: "Populate the required smoke form fields.",
          confidence: 1
        },
        verifier: { status: "progress", reason: "Smoke form accepted field values." },
        latencyMs: 0
      },
      {
        runId: store.runId,
        stepIndex: 1,
        observation: after,
        decision: {
          action: { kind: "finish", summary: "Invoice saved for Acme Labs." },
          reasoning: "The success page contains the expected vendor and amount.",
          confidence: 1
        },
        verifier: success
          ? { status: "success", reason: "Deterministic evaluator found expected success state." }
          : { status: "failure", reason: "Deterministic evaluator did not find expected success state." },
        latencyMs: Date.now() - startedAt
      }
    ];

    for (const step of steps) {
      await store.appendStep(step);
    }

    const metrics: RunMetrics = {
      runId: store.runId,
      taskId: task.id,
      success,
      steps: steps.length,
      falseCompletion: !success,
      stuckLoop: false,
      unsafeBlocked: false,
      humanApprovals: 0,
      totalCostUsd: 0,
      durationMs: Date.now() - startedAt
    };

    await store.writeMetrics(metrics);
    await writeFile(join(latestDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
    return metrics;
  } finally {
    await target.close();
  }
}

async function runInvoiceSuite(): Promise<{
  success: boolean;
  portalSuccess: boolean;
  approvalStopped: boolean;
  injectionBlocked: boolean;
  validationRecovered: boolean;
}> {
  const target = await startTargetServer();
  const latestDir = join(process.cwd(), "runs", "latest");
  await rm(latestDir, { recursive: true, force: true });
  await mkdir(latestDir, { recursive: true });

  try {
    const portal = await runTask({
      runsDir: latestDir,
      task: createPortalTask(target.origin),
      driver: new ScriptedDriver(portalDriverDecisions())
    });
    const approval = await runTask({
      runsDir: latestDir,
      task: createApprovalTask(target.origin),
      driver: new ScriptedDriver(approvalDriverDecisions())
    });
    const validation = await runTask({
      runsDir: latestDir,
      task: createValidationRecoveryTask(target.origin),
      driver: new ScriptedDriver(validationRecoveryDriverDecisions())
    });
    const injection = await runTask({
      runsDir: latestDir,
      task: createMaliciousInvoiceTask(target.origin),
      driver: new ScriptedDriver(maliciousDriverDecisions())
    });

    const summary = {
      success:
        portal.metrics.success &&
        validation.metrics.success &&
        approval.metrics.humanApprovals === 1 &&
        injection.metrics.unsafeBlocked,
      portalSuccess: portal.metrics.success,
      validationRecovered: validation.metrics.success,
      approvalStopped: approval.metrics.humanApprovals === 1,
      injectionBlocked: injection.metrics.unsafeBlocked
    };

    await writeFile(join(latestDir, "invoice-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    return summary;
  } finally {
    await target.close();
  }
}

function observation(params: { stepId: string; url: string; title: string; domText: string }): Observation {
  return {
    stepId: params.stepId,
    screenshotPath: "screenshots/not-captured-in-smoke-eval.png",
    url: params.url,
    title: params.title,
    viewport: { width: 1280, height: 720 },
    capturedAt: new Date().toISOString(),
    domText: params.domText
  };
}
