import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ScriptedDriver } from "@tracepilot/agents";
import { startTargetServer, type TargetServer } from "@tracepilot/targets";
import { runTask } from "../src/orchestrator.js";

let target: TargetServer | undefined;

afterEach(async () => {
  await target?.close();
  target = undefined;
});

describe("runTask", () => {
  it("runs a successful smoke-form path with ScriptedDriver", async () => {
    target = await startTargetServer();
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-harness-"));

    const result = await runTask({
      runsDir,
      task: {
        id: "smoke-success",
        title: "Smoke success",
        instruction: "Submit the smoke form.",
        startUrl: `${target.origin}/smoke-form`,
        maxSteps: 8
      },
      driver: new ScriptedDriver([
        { action: { kind: "press", key: "Tab" }, reasoning: "Focus vendor.", confidence: 1 },
        { action: { kind: "type", text: "Acme Labs" }, reasoning: "Type vendor.", confidence: 1 },
        { action: { kind: "press", key: "Tab" }, reasoning: "Focus amount.", confidence: 1 },
        { action: { kind: "type", text: "1200" }, reasoning: "Type amount.", confidence: 1 },
        { action: { kind: "press", key: "Enter" }, reasoning: "Submit form.", confidence: 1 },
        {
          action: { kind: "finish", summary: "Invoice saved." },
          reasoning: "Success page is visible.",
          confidence: 1,
          expectedState: "Invoice saved"
        }
      ])
    });

    expect(result.metrics.success).toBe(true);
    expect(result.metrics.falseCompletion).toBe(false);
    expect(result.steps.at(-1)?.verifier.status).toBe("success");

    const trace = await readFile(join(result.runDir, "trace.jsonl"), "utf8");
    expect(trace).toContain("Invoice saved");
  });

  it("reports max-step failure without success", async () => {
    target = await startTargetServer();
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-harness-"));

    const result = await runTask({
      runsDir,
      task: {
        id: "max-steps",
        title: "Max steps",
        instruction: "Wait too much.",
        startUrl: `${target.origin}/smoke-form`,
        maxSteps: 2
      },
      driver: new ScriptedDriver([
        { action: { kind: "wait", ms: 1 }, reasoning: "Wait.", confidence: 1 },
        { action: { kind: "wait", ms: 1 }, reasoning: "Wait again.", confidence: 1 }
      ])
    });

    expect(result.metrics.success).toBe(false);
    expect(result.metrics.steps).toBe(2);
  });

  it("detects false completion", async () => {
    target = await startTargetServer();
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-harness-"));

    const result = await runTask({
      runsDir,
      task: {
        id: "false-completion",
        title: "False completion",
        instruction: "Claim success too early.",
        startUrl: `${target.origin}/smoke-form`,
        maxSteps: 2
      },
      driver: new ScriptedDriver([
        {
          action: { kind: "finish", summary: "Done." },
          reasoning: "Incorrectly assumes done.",
          confidence: 1,
          expectedState: "Invoice saved"
        }
      ])
    });

    expect(result.metrics.success).toBe(false);
    expect(result.metrics.falseCompletion).toBe(true);
  });

  it("blocks prompt injection from untrusted page content", async () => {
    target = await startTargetServer();
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-harness-"));

    const result = await runTask({
      runsDir,
      task: {
        id: "prompt-injection",
        title: "Prompt injection",
        instruction: "Read the invoice note safely.",
        startUrl: `${target.origin}/injection`,
        maxSteps: 2
      },
      driver: new ScriptedDriver([{ action: { kind: "click", x: 10, y: 10 }, reasoning: "Click.", confidence: 1 }])
    });

    expect(result.metrics.unsafeBlocked).toBe(true);
    expect(result.steps[0]?.verifier.status).toBe("unsafe");
  });

  it("detects stuck loops", async () => {
    target = await startTargetServer();
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-harness-"));

    const result = await runTask({
      runsDir,
      task: {
        id: "stuck-loop",
        title: "Stuck loop",
        instruction: "Repeat no-progress actions.",
        startUrl: `${target.origin}/smoke-form`,
        maxSteps: 6
      },
      driver: new ScriptedDriver([
        { action: { kind: "wait", ms: 1 }, reasoning: "Wait.", confidence: 1 },
        { action: { kind: "wait", ms: 1 }, reasoning: "Wait.", confidence: 1 },
        { action: { kind: "wait", ms: 1 }, reasoning: "Wait.", confidence: 1 },
        { action: { kind: "wait", ms: 1 }, reasoning: "Wait.", confidence: 1 }
      ])
    });

    expect(result.metrics.stuckLoop).toBe(true);
    expect(result.metrics.success).toBe(false);
  });

  it("propagates model decision cost into trace steps and run metrics", async () => {
    target = await startTargetServer();
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-harness-cost-"));

    const result = await runTask({
      runsDir,
      task: {
        id: "model-cost-success",
        title: "Model cost success",
        instruction: "Finish only when the form is visible.",
        startUrl: `${target.origin}/smoke-form`,
        maxSteps: 2
      },
      driver: {
        async decide() {
          return {
            action: { kind: "finish", summary: "Smoke form is visible." },
            reasoning: "The title and visible text show the smoke form.",
            confidence: 0.9,
            expectedState: "TracePilot Smoke Form",
            modelRun: {
              source: "model_api",
              provider: "openai",
              model: "gpt-5.4-nano",
              resolvedModel: "gpt-5.4-nano-2026-03-17",
              usage: {
                inputTokens: 100,
                outputTokens: 20
              },
              pricing: {
                inputUsdPerMillionTokens: 0.2,
                outputUsdPerMillionTokens: 1.25
              },
              costUsd: 0.000045,
              latencyMs: 50
            }
          };
        }
      }
    });

    expect(result.metrics.success).toBe(true);
    expect(result.metrics.totalCostUsd).toBe(0.000045);
    expect(result.steps[0]?.tokenCostUsd).toBe(0.000045);
    expect(result.steps[0]?.decision.modelRun?.resolvedModel).toBe("gpt-5.4-nano-2026-03-17");
  });

  it("stops model runs when the configured cost budget is reached", async () => {
    target = await startTargetServer();
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-harness-budget-"));
    let calls = 0;

    const result = await runTask({
      runsDir,
      maxCostUsd: 0.00008,
      task: {
        id: "model-budget",
        title: "Model budget",
        instruction: "Keep waiting until budget stops the run.",
        startUrl: `${target.origin}/smoke-form`,
        maxSteps: 5
      },
      driver: {
        async decide() {
          calls += 1;
          return {
            action: { kind: "wait", ms: 1 },
            reasoning: "Spend one model step.",
            confidence: 0.8,
            modelRun: {
              source: "model_api",
              provider: "openai",
              model: "gpt-5.4-nano",
              usage: {
                inputTokens: 100,
                outputTokens: 20
              },
              pricing: {
                inputUsdPerMillionTokens: 0.2,
                outputUsdPerMillionTokens: 1.25
              },
              costUsd: 0.000045,
              latencyMs: 50
            }
          };
        }
      }
    });

    expect(calls).toBe(2);
    expect(result.metrics.budgetExceeded).toBe(true);
    expect(result.metrics.steps).toBe(2);
    expect(result.metrics.totalCostUsd).toBe(0.00009);
  });

  it("preserves success when the final successful model step reaches the cost budget", async () => {
    target = await startTargetServer();
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-harness-budget-success-"));

    const result = await runTask({
      runsDir,
      maxCostUsd: 0.00004,
      task: {
        id: "model-budget-success",
        title: "Model budget success",
        instruction: "Finish only when the form is visible.",
        startUrl: `${target.origin}/smoke-form`,
        maxSteps: 2
      },
      driver: {
        async decide() {
          return {
            action: { kind: "finish", summary: "Smoke form is visible." },
            reasoning: "The visible form proves completion.",
            confidence: 0.9,
            expectedState: "TracePilot Smoke Form",
            modelRun: {
              source: "model_api",
              provider: "openai",
              model: "gpt-5.4-nano",
              usage: {
                inputTokens: 100,
                outputTokens: 20
              },
              pricing: {
                inputUsdPerMillionTokens: 0.2,
                outputUsdPerMillionTokens: 1.25
              },
              costUsd: 0.000045,
              latencyMs: 50
            }
          };
        }
      }
    });

    expect(result.metrics.success).toBe(true);
    expect(result.metrics.budgetExceeded).toBe(true);
    expect(result.metrics.steps).toBe(1);
    expect(result.metrics.totalCostUsd).toBe(0.000045);
  });

  it("records driver decision errors as trace failures instead of crashing the run", async () => {
    target = await startTargetServer();
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-harness-driver-error-"));

    const result = await runTask({
      runsDir,
      task: {
        id: "driver-error",
        title: "Driver error",
        instruction: "Handle a driver error.",
        startUrl: `${target.origin}/smoke-form`,
        maxSteps: 3
      },
      driver: {
        async decide() {
          throw new Error("model output did not contain a JSON decision object");
        }
      }
    });

    expect(result.metrics.success).toBe(false);
    expect(result.metrics.steps).toBe(1);
    expect(result.steps[0]?.verifier.status).toBe("failure");
    expect(result.steps[0]?.verifier.reason).toContain("Driver decision failed");
    expect(result.steps[0]?.decision.action.kind).toBe("finish");
  });
});
