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
