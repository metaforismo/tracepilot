import { parseArgs } from "node:util";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTraceStore } from "../packages/core/src/trace-store.js";
import type { Observation, RunMetrics, TraceStep } from "../packages/core/src/types.js";
import { startTargetServer } from "../apps/targets/src/server.js";
import { createSmokeFormTask, evaluateSmokeForm } from "./tasks/smoke-form.js";

const { values } = parseArgs({
  args: normalizeArgs(process.argv.slice(2)),
  options: {
    suite: { type: "string", default: "smoke" }
  },
  allowPositionals: true
});

if (values.suite !== "smoke") {
  throw new Error(`Unknown eval suite: ${values.suite}`);
}

const metrics = await runSmokeSuite();
console.log(`smoke-form success=${metrics.success} steps=${metrics.steps}`);

function normalizeArgs(args: string[]): string[] {
  return args[0] === "--" ? args.slice(1) : args;
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
