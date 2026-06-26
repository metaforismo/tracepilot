import { describe, expect, it } from "vitest";
import { isStuckLoop } from "../src/loop-detector.js";
import type { AgentAction, TraceStep } from "../src/types.js";

function step(stepIndex: number, action: AgentAction, status: TraceStep["verifier"]["status"]): TraceStep {
  return {
    runId: "run-loop",
    stepIndex,
    observation: {
      stepId: `step-${stepIndex}`,
      screenshotPath: `screenshots/${stepIndex}.png`,
      url: "http://localhost/form",
      title: "Form",
      viewport: { width: 1280, height: 720 },
      capturedAt: "2026-06-26T00:00:00.000Z",
      domText: "Invoice form"
    },
    decision: {
      action,
      reasoning: "Trying to make progress.",
      confidence: 0.5
    },
    verifier: {
      status,
      reason: "No observable progress."
    },
    latencyMs: 10
  };
}

describe("isStuckLoop", () => {
  it("detects repeated no-progress actions", () => {
    const steps = [
      step(0, { kind: "click", x: 100, y: 200 }, "uncertain"),
      step(1, { kind: "wait", ms: 500 }, "uncertain"),
      step(2, { kind: "click", x: 104, y: 198 }, "failure"),
      step(3, { kind: "wait", ms: 500 }, "uncertain")
    ];

    expect(isStuckLoop(steps)).toBe(true);
  });

  it("does not flag short histories", () => {
    const steps = [
      step(0, { kind: "click", x: 100, y: 200 }, "uncertain"),
      step(1, { kind: "wait", ms: 500 }, "uncertain")
    ];

    expect(isStuckLoop(steps)).toBe(false);
  });

  it("does not flag windows with progress", () => {
    const steps = [
      step(0, { kind: "click", x: 100, y: 200 }, "uncertain"),
      step(1, { kind: "wait", ms: 500 }, "uncertain"),
      step(2, { kind: "click", x: 104, y: 198 }, "progress"),
      step(3, { kind: "wait", ms: 500 }, "uncertain")
    ];

    expect(isStuckLoop(steps)).toBe(false);
  });
});

