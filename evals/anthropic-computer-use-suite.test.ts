import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { runAnthropicComputerUseSuite } from "./anthropic-computer-use-suite.js";

describe("runAnthropicComputerUseSuite", () => {
  test("writes a dry-run report without calling Anthropic by default", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-anthropic-computer-use-dry-"));
    const fetchImpl = vi.fn();

    const result = await runAnthropicComputerUseSuite({
      runsDir,
      generatedAt: "2026-06-27T00:00:00.000Z",
      fetchImpl,
      env: {
        ANTHROPIC_API_KEY: "test-anthropic-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
      }
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({
      status: "skipped_paid_runs_disabled",
      paidCall: false,
      provider: "anthropic",
      success: false,
      totalCostUsd: 0
    });

    const report = await readFile(join(runsDir, "anthropic-computer-use-report.md"), "utf8");
    expect(report).toContain("Status: `skipped_paid_runs_disabled`");
    expect(report).toContain("No paid Anthropic computer-use call was made.");
    expect(report).not.toContain("test-anthropic-key");
  });

  test("runs an Anthropic computer-use legacy portal workflow in the real browser sandbox with mocked API calls", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-anthropic-computer-use-paid-"));
    const blocks = [
      toolUse({ action: "key", text: "Tab" }, "Focus vendor."),
      toolUse({ action: "type", text: "Acme Labs" }, "Type vendor."),
      toolUse({ action: "key", text: "Tab" }, "Focus amount."),
      toolUse({ action: "type", text: "1200" }, "Type amount."),
      toolUse({ action: "key", text: "Tab" }, "Focus date."),
      toolUse({ action: "type", text: "2026-06-26" }, "Type date."),
      toolUse({ action: "key", text: "Tab" }, "Focus IBAN."),
      toolUse({ action: "type", text: "IT60X0542811101000000123456" }, "Type IBAN."),
      toolUse({ action: "key", text: "Tab" }, "Focus submit."),
      toolUse({ action: "key", text: "Return" }, "Submit form."),
      [{ type: "text", text: "Portal receipt saved for Acme Labs." }]
    ];
    let index = 0;
    const observedMaxTokens: number[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      observedMaxTokens.push(JSON.parse(init.body).max_tokens);
      const content = blocks[index];
      index += 1;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: `msg_${index}`,
            model: "claude-sonnet-4-6-20261124",
            stop_reason: index < blocks.length ? "tool_use" : "end_turn",
            content,
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              cache_read_input_tokens: 5
            }
          })
      };
    });

    const result = await runAnthropicComputerUseSuite({
      runsDir,
      generatedAt: "2026-06-27T00:00:00.000Z",
      fetchImpl,
      env: {
        ANTHROPIC_API_KEY: "test-anthropic-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MODEL: "claude-sonnet-4-6",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_TASK: "legacy-portal",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_USD: "0.25",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_TOKENS: "700"
      }
    });

    expect(result.summary).toMatchObject({
      status: "executed",
      paidCall: true,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      success: true,
      falseCompletion: false,
      budgetExceeded: false,
      steps: 11
    });
    expect(result.summary.totalCostUsd).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(11);
    expect(observedMaxTokens.every((value) => value === 700)).toBe(true);

    const report = await readFile(join(runsDir, "anthropic-computer-use-report.md"), "utf8");
    expect(report).toContain("Success | yes");
    expect(report).toContain("legacy-portal");
    expect(report).not.toContain("test-anthropic-key");

    expect(result.summary.runDir).toBeDefined();
    const trace = await readFile(join(result.summary.runDir ?? "", "trace.jsonl"), "utf8");
    expect(trace).toContain("Portal receipt saved");
    expect(trace).toContain("model_api");
    expect(trace).toContain("anthropic");
  }, 30_000);

  test("uses OpenRouter credentials and endpoint when only OPENROUTER_API_KEY is configured", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-anthropic-computer-use-openrouter-"));
    const blocks = [
      actionToolUse({ action: "type", text: "Acme Labs" }, "Type vendor."),
      actionToolUse({ action: "press", text: "Tab" }, "Focus amount."),
      actionToolUse({ action: "type", text: "1200" }, "Type amount."),
      actionToolUse({ action: "press", text: "Tab" }, "Focus submit."),
      actionToolUse({ action: "press", text: "Return" }, "Submit form."),
      [{ type: "text", text: "Invoice saved for Acme Labs." }]
    ];
    let index = 0;
    const observedUrls: string[] = [];
    const observedHeaders: Array<Record<string, string>> = [];
    const observedBodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
      observedUrls.push(url);
      observedHeaders.push(init.headers);
      observedBodies.push(JSON.parse(init.body) as Record<string, unknown>);
      const content = blocks[index];
      index += 1;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: `msg_openrouter_${index}`,
            model: "anthropic/claude-sonnet-4",
            stop_reason: index < blocks.length ? "tool_use" : "end_turn",
            content,
            usage: {
              input_tokens: 40,
              output_tokens: 10
            }
          })
      };
    });

    const result = await runAnthropicComputerUseSuite({
      runsDir,
      generatedAt: "2026-06-27T00:00:00.000Z",
      fetchImpl,
      env: {
        OPENROUTER_API_KEY: "test-openrouter-key",
        ANTHROPIC_API_BASE_URL: "https://openrouter.ai/api",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MODEL: "anthropic/claude-sonnet-4",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_TASK: "smoke-form",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_USD: "0.25",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_TOKENS: "700"
      }
    });

    expect(result.summary).toMatchObject({
      status: "executed",
      paidCall: true,
      model: "anthropic/claude-sonnet-4",
      toolMode: "action_tool",
      taskId: "smoke-form",
      success: true
    });
    expect(observedUrls.every((url) => url === "https://openrouter.ai/api/v1/messages")).toBe(true);
    expect(observedHeaders.every((headers) => headers.Authorization === "Bearer test-openrouter-key")).toBe(true);
    expect(observedHeaders.every((headers) => !("x-api-key" in headers))).toBe(true);
    expect(observedHeaders.every((headers) => !("anthropic-beta" in headers))).toBe(true);
    expect(observedBodies.every((body) => JSON.stringify(body.tools).includes("tracepilot_action"))).toBe(true);
    expect(observedBodies.every((body) => !JSON.stringify(body.tools).includes("computer_20251124"))).toBe(true);

    const report = await readFile(join(runsDir, "anthropic-computer-use-report.md"), "utf8");
    expect(report).toContain("anthropic/claude-sonnet-4");
    expect(report).toContain("Tool mode | `action_tool`");
    expect(report).not.toContain("test-openrouter-key");
  }, 30_000);

  test("forces first-party Anthropic when configured even if OpenRouter fallback variables are present", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-anthropic-computer-use-direct-"));
    const observedUrls: string[] = [];
    const observedHeaders: Array<Record<string, string>> = [];
    const observedBodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
      observedUrls.push(url);
      observedHeaders.push(init.headers);
      observedBodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "msg_direct_1",
            model: "claude-sonnet-4-6-20261124",
            stop_reason: "end_turn",
            content: [{ type: "text", text: "I need more visual context before acting." }],
            usage: {
              input_tokens: 40,
              output_tokens: 10
            }
          })
      };
    });

    await runAnthropicComputerUseSuite({
      runsDir,
      generatedAt: "2026-06-27T00:00:00.000Z",
      fetchImpl,
      env: {
        ANTHROPIC_API_KEY: "test-anthropic-key",
        OPENROUTER_API_KEY: "test-openrouter-key",
        ANTHROPIC_API_BASE_URL: "https://openrouter.ai/api",
        TRACEPILOT_ANTHROPIC_API_PROVIDER: "anthropic",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MODEL: "claude-sonnet-4-6",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_TASK: "legacy-portal",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_USD: "0.25",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_TOKENS: "700"
      }
    });

    expect(observedUrls).toEqual(["https://api.anthropic.com/v1/messages"]);
    expect(observedHeaders).toEqual([
      expect.objectContaining({
        "x-api-key": "test-anthropic-key",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "computer-use-2025-11-24"
      })
    ]);
    expect(observedHeaders.every((headers) => !("Authorization" in headers))).toBe(true);
    expect(observedBodies.every((body) => JSON.stringify(body.tools).includes("computer_20251124"))).toBe(true);
    expect(observedBodies.every((body) => !JSON.stringify(body.tools).includes("tracepilot_action"))).toBe(true);
  }, 30_000);

  test("supports a prompt-injection safety task for paid Anthropic computer-use runs", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-anthropic-computer-use-injection-"));
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: "msg_injection",
          model: "claude-sonnet-4-6-20261124",
          stop_reason: "tool_use",
          content: toolUse({ action: "left_click", coordinate: [12, 12] }, "The page asks me to click."),
          usage: {
            input_tokens: 40,
            output_tokens: 10
          }
        })
    }));

    const result = await runAnthropicComputerUseSuite({
      runsDir,
      generatedAt: "2026-06-27T00:00:00.000Z",
      fetchImpl,
      env: {
        ANTHROPIC_API_KEY: "test-anthropic-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MODEL: "claude-sonnet-4-6",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_TASK: "prompt-injection",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_USD: "0.25",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_TOKENS: "700"
      }
    });

    expect(result.summary).toMatchObject({
      status: "executed",
      paidCall: true,
      taskId: "prompt-injection",
      success: false,
      unsafeBlocked: true,
      falseCompletion: false,
      steps: 1
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const report = await readFile(join(runsDir, "anthropic-computer-use-report.md"), "utf8");
    expect(report).toContain("prompt-injection");
    expect(report).toContain("Unsafe blocked | yes");

    expect(result.summary.runDir).toBeDefined();
    const trace = await readFile(join(result.summary.runDir ?? "", "trace.jsonl"), "utf8");
    expect(trace).toContain("prompt-injection pattern");
  }, 30_000);

  test("runs an Anthropic computer-use modal interruption workflow in the real browser sandbox with mocked API calls", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-anthropic-computer-use-modal-"));
    const blocks = [
      toolUse({ action: "key", text: "Return" }, "Dismiss the portal notice."),
      toolUse({ action: "type", text: "Acme Labs" }, "Type vendor."),
      toolUse({ action: "key", text: "Tab" }, "Focus amount."),
      toolUse({ action: "type", text: "1200" }, "Type amount."),
      toolUse({ action: "key", text: "Tab" }, "Focus date."),
      toolUse({ action: "type", text: "2026-06-26" }, "Type date."),
      toolUse({ action: "key", text: "Tab" }, "Focus IBAN."),
      toolUse({ action: "type", text: "IT60X0542811101000000123456" }, "Type IBAN."),
      toolUse({ action: "key", text: "Tab" }, "Focus submit."),
      toolUse({ action: "key", text: "Return" }, "Submit form."),
      [{ type: "text", text: "Portal receipt saved for Acme Labs after dismissing the notice." }]
    ];
    let index = 0;
    const fetchImpl = vi.fn(async () => {
      const content = blocks[index];
      index += 1;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: `msg_modal_${index}`,
            model: "claude-sonnet-4-6-20261124",
            stop_reason: index < blocks.length ? "tool_use" : "end_turn",
            content,
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              cache_read_input_tokens: 5
            }
          })
      };
    });

    const result = await runAnthropicComputerUseSuite({
      runsDir,
      generatedAt: "2026-06-27T00:00:00.000Z",
      fetchImpl,
      env: {
        ANTHROPIC_API_KEY: "test-anthropic-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MODEL: "claude-sonnet-4-6",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_TASK: "modal-interruption",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_USD: "0.25",
        TRACEPILOT_ANTHROPIC_COMPUTER_USE_MAX_TOKENS: "700"
      }
    });

    expect(result.summary).toMatchObject({
      status: "executed",
      paidCall: true,
      provider: "anthropic",
      taskId: "modal-interruption",
      success: true,
      steps: 11
    });
    expect(fetchImpl).toHaveBeenCalledTimes(11);

    const report = await readFile(join(runsDir, "anthropic-computer-use-report.md"), "utf8");
    expect(report).toContain("modal-interruption");

    expect(result.summary.runDir).toBeDefined();
    const trace = await readFile(join(result.summary.runDir ?? "", "trace.jsonl"), "utf8");
    expect(trace).toContain("Dismiss the portal notice");
    expect(trace).toContain("Portal receipt saved");
    expect(trace).toContain("anthropic");
  }, 60_000);
});

function toolUse(input: Record<string, unknown>, text: string): unknown[] {
  return [
    { type: "text", text },
    {
      type: "tool_use",
      id: `toolu_${text.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_")}`,
      name: "computer",
      input
    }
  ];
}

function actionToolUse(input: Record<string, unknown>, text: string): unknown[] {
  return [
    { type: "text", text },
    {
      type: "tool_use",
      id: `toolu_${text.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_")}`,
      name: "tracepilot_action",
      input: {
        ...input,
        reason: text
      }
    }
  ];
}
