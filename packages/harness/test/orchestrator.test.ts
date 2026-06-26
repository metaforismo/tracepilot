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
});

