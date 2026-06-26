import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { runModelBrowserSuite } from "./model-browser-suite.js";

describe("runModelBrowserSuite", () => {
  test("writes a dry-run report without calling OpenAI by default", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-model-browser-dry-"));
    const fetchImpl = vi.fn();

    const result = await runModelBrowserSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      fetchImpl,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
      }
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({
      status: "skipped_paid_runs_disabled",
      paidCall: false,
      success: false,
      totalCostUsd: 0
    });

    const report = await readFile(join(runsDir, "model-browser-report.md"), "utf8");
    expect(report).toContain("Status: `skipped_paid_runs_disabled`");
    expect(report).toContain("No paid model-browser call was made.");
    expect(report).not.toContain("test-openai-key");
  });

  test("runs a model-driven legacy portal workflow in the real browser sandbox with mocked OpenAI", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-model-browser-paid-"));
    const actions = [
      { actionKind: "press", key: "Tab", reasoning: "Focus vendor.", confidence: 0.9 },
      { actionKind: "type", text: "Acme Labs", reasoning: "Type vendor.", confidence: 0.9 },
      { actionKind: "press", key: "Tab", reasoning: "Focus amount.", confidence: 0.9 },
      { actionKind: "type", text: "1200", reasoning: "Type amount.", confidence: 0.9 },
      { actionKind: "press", key: "Tab", reasoning: "Focus date.", confidence: 0.9 },
      { actionKind: "type", text: "2026-06-26", reasoning: "Type date.", confidence: 0.9 },
      { actionKind: "press", key: "Tab", reasoning: "Focus IBAN.", confidence: 0.9 },
      {
        actionKind: "type",
        text: "IT60X0542811101000000123456",
        reasoning: "Type IBAN.",
        confidence: 0.9
      },
      { actionKind: "press", key: "Tab", reasoning: "Focus submit.", confidence: 0.9 },
      {
        actionKind: "press",
        key: "Enter",
        expectedState: "Portal receipt saved",
        reasoning: "Submit form.",
        confidence: 0.9
      },
      {
        actionKind: "finish",
        summary: "Portal receipt saved for Acme Labs.",
        expectedState: "Portal receipt saved",
        reasoning: "The receipt page is visible.",
        confidence: 0.95
      }
    ];
    let index = 0;
    const observedMaxOutputTokens: number[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      observedMaxOutputTokens.push(JSON.parse(init.body).max_output_tokens);
      const action = actions[index];
      index += 1;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            model: "gpt-5.4-nano-2026-03-17",
            status: "completed",
            output_text: JSON.stringify(action),
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              output_tokens_details: {
                reasoning_tokens: 4
              }
            }
          })
      };
    });

    const result = await runModelBrowserSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      fetchImpl,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_MODEL_BROWSER_MODEL: "gpt-5.4-nano",
        TRACEPILOT_MODEL_BROWSER_TASK: "legacy-portal",
        TRACEPILOT_MODEL_BROWSER_MAX_USD: "0.25",
        TRACEPILOT_MODEL_BROWSER_MAX_OUTPUT_TOKENS: "900",
        TRACEPILOT_OPENAI_REASONING_EFFORT: "low"
      }
    });

    expect(result.summary).toMatchObject({
      status: "executed",
      paidCall: true,
      success: true,
      falseCompletion: false,
      budgetExceeded: false,
      steps: 11
    });
    expect(result.summary.totalCostUsd).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(11);
    expect(observedMaxOutputTokens.every((value) => value === 900)).toBe(true);

    const report = await readFile(join(runsDir, "model-browser-report.md"), "utf8");
    expect(report).toContain("Success | yes");
    expect(report).toContain("legacy-portal");
    expect(report).not.toContain("test-openai-key");

    expect(result.summary.runDir).toBeDefined();
    const trace = await readFile(join(result.summary.runDir ?? "", "trace.jsonl"), "utf8");
    expect(trace).toContain("Portal receipt saved");
    expect(trace).toContain("model_api");
  }, 30_000);

  test("runs a model-driven modal interruption workflow in the real browser sandbox with mocked OpenAI", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-model-browser-modal-"));
    const actions = [
      { actionKind: "press", key: "Enter", reasoning: "Dismiss the portal notice.", confidence: 0.9 },
      { actionKind: "type", text: "Acme Labs", reasoning: "Type vendor.", confidence: 0.9 },
      { actionKind: "press", key: "Tab", reasoning: "Focus amount.", confidence: 0.9 },
      { actionKind: "type", text: "1200", reasoning: "Type amount.", confidence: 0.9 },
      { actionKind: "press", key: "Tab", reasoning: "Focus date.", confidence: 0.9 },
      { actionKind: "type", text: "2026-06-26", reasoning: "Type date.", confidence: 0.9 },
      { actionKind: "press", key: "Tab", reasoning: "Focus IBAN.", confidence: 0.9 },
      {
        actionKind: "type",
        text: "IT60X0542811101000000123456",
        reasoning: "Type IBAN.",
        confidence: 0.9
      },
      { actionKind: "press", key: "Tab", reasoning: "Focus submit.", confidence: 0.9 },
      {
        actionKind: "press",
        key: "Enter",
        expectedState: "Portal receipt saved",
        reasoning: "Submit form.",
        confidence: 0.9
      },
      {
        actionKind: "finish",
        summary: "Portal receipt saved for Acme Labs after dismissing the notice.",
        expectedState: "Portal receipt saved",
        reasoning: "The receipt page is visible.",
        confidence: 0.95
      }
    ];
    let index = 0;
    const fetchImpl = vi.fn(async () => {
      const action = actions[index];
      index += 1;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            model: "gpt-5.4-nano-2026-03-17",
            status: "completed",
            output_text: JSON.stringify(action),
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              output_tokens_details: { reasoning_tokens: 4 }
            }
          })
      };
    });

    const result = await runModelBrowserSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      fetchImpl,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_MODEL_BROWSER_MODEL: "gpt-5.4-nano",
        TRACEPILOT_MODEL_BROWSER_TASK: "modal-interruption",
        TRACEPILOT_MODEL_BROWSER_MAX_USD: "0.25",
        TRACEPILOT_MODEL_BROWSER_MAX_OUTPUT_TOKENS: "900",
        TRACEPILOT_OPENAI_REASONING_EFFORT: "low"
      }
    });

    expect(result.summary).toMatchObject({
      status: "executed",
      paidCall: true,
      taskId: "modal-interruption",
      success: true,
      steps: 11
    });
    expect(fetchImpl).toHaveBeenCalledTimes(11);

    const report = await readFile(join(runsDir, "model-browser-report.md"), "utf8");
    expect(report).toContain("modal-interruption");

    expect(result.summary.runDir).toBeDefined();
    const trace = await readFile(join(result.summary.runDir ?? "", "trace.jsonl"), "utf8");
    expect(trace).toContain("Dismiss the portal notice");
    expect(trace).toContain("Portal receipt saved");
  }, 60_000);
});
