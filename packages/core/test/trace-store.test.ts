import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTraceStore } from "../src/trace-store.js";

describe("createTraceStore", () => {
  it("writes trace steps and metrics into a run directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracepilot-"));
    const store = await createTraceStore(root, "run-test");

    await store.appendStep({
      runId: "run-test",
      stepIndex: 0,
      observation: {
        stepId: "step-0",
        screenshotPath: "screenshots/0.png",
        url: "http://localhost:3001",
        title: "Fixture",
        viewport: { width: 1280, height: 720 },
        capturedAt: "2026-06-26T00:00:00.000Z"
      },
      decision: {
        action: { kind: "wait", ms: 100 },
        reasoning: "Wait for page to settle.",
        confidence: 0.8
      },
      verifier: { status: "progress", reason: "Initial observation captured." },
      latencyMs: 100
    });

    await store.writeMetrics({
      runId: "run-test",
      taskId: "smoke",
      success: true,
      steps: 1,
      falseCompletion: false,
      stuckLoop: false,
      unsafeBlocked: false,
      humanApprovals: 0,
      totalCostUsd: 0,
      durationMs: 100
    });

    const trace = await readFile(join(store.runDir, "trace.jsonl"), "utf8");
    const metrics = await readFile(join(store.runDir, "metrics.json"), "utf8");

    expect(trace).toContain("\"stepIndex\":0");
    expect(JSON.parse(metrics).success).toBe(true);
  });

  it("creates a screenshots directory for artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracepilot-"));
    const store = await createTraceStore(root, "artifact-test");

    expect(store.screenshotsDir).toBe(join(root, "artifact-test", "screenshots"));
  });
});

