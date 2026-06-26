import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AnthropicComputerUseDecisionClient,
  AnthropicComputerUseDriver,
  AnthropicComputerUseDriverError
} from "../src/index.js";
import type { AgentDriverContext } from "../src/agent-driver.js";

describe("AnthropicComputerUseDecisionClient", () => {
  it("sends a computer-use tool request and maps tool_use into a TracePilot click", async () => {
    const context = await contextWithScreenshot();
    let requestBody: unknown;
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      requestBody = JSON.parse(init.body);
      return jsonResponse({
        id: "msg_test",
        model: "claude-sonnet-4-6-20261124",
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "I will click the focused vendor field." },
          {
            type: "tool_use",
            id: "toolu_test",
            name: "computer",
            input: {
              action: "left_click",
              coordinate: [452, 196]
            }
          }
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 40,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 5
        }
      });
    });

    const client = new AnthropicComputerUseDecisionClient({
      apiKey: "test-anthropic-key",
      fetchImpl
    });

    const decision = await client.decide(context, {
      model: "claude-sonnet-4-6",
      maxTokens: 700
    });

    expect(decision).toMatchObject({
      action: { kind: "click", x: 452, y: 196 },
      reasoning: "I will click the focused vendor field.",
      confidence: 0.8,
      modelRun: {
        source: "model_api",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        resolvedModel: "claude-sonnet-4-6-20261124",
        usage: {
          inputTokens: 100,
          outputTokens: 40,
          cacheReadInputTokens: 10,
          cacheCreationInputTokens: 5
        },
        costUsd: 0.000922
      }
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-anthropic-key",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "computer-use-2025-11-24"
        })
      })
    );
    expect(JSON.stringify(requestBody)).toContain("computer_20251124");
    expect(JSON.stringify(requestBody)).toContain("display_width_px");
    expect(JSON.stringify(requestBody)).toContain("TracePilot Smoke Form");
    expect((requestBody as { max_tokens: number }).max_tokens).toBe(700);
  });

  it("maps keyboard, typing, scrolling, and final text outputs", async () => {
    const context = await contextWithScreenshot();
    const makeDecision = async (content: unknown[]) => {
      const client = new AnthropicComputerUseDecisionClient({
        apiKey: "test-anthropic-key",
        fetchImpl: vi.fn(async () =>
          jsonResponse({
            id: "msg_test",
            model: "claude-sonnet-4-6-20261124",
            stop_reason: "tool_use",
            content,
            usage: { input_tokens: 10, output_tokens: 10 }
          })
        )
      });
      return client.decide(context, { model: "claude-sonnet-4-6" });
    };

    await expect(
      makeDecision([{ type: "tool_use", id: "toolu_key", name: "computer", input: { action: "key", text: "Tab" } }])
    ).resolves.toMatchObject({ action: { kind: "press", key: "Tab" } });
    await expect(
      makeDecision([{ type: "tool_use", id: "toolu_type", name: "computer", input: { action: "type", text: "Acme" } }])
    ).resolves.toMatchObject({ action: { kind: "type", text: "Acme" } });
    await expect(
      makeDecision([
        {
          type: "tool_use",
          id: "toolu_scroll",
          name: "computer",
          input: { action: "scroll", scroll_direction: "down", scroll_amount: 2 }
        }
      ])
    ).resolves.toMatchObject({ action: { kind: "scroll", deltaX: 0, deltaY: 960 } });
    await expect(makeDecision([{ type: "text", text: "The receipt page is visible." }])).resolves.toMatchObject({
      action: { kind: "finish", summary: "The receipt page is visible." }
    });
  });

  it("redacts API keys from Anthropic API and network errors", async () => {
    const context = await contextWithScreenshot();
    const client = new AnthropicComputerUseDecisionClient({
      apiKey: "test-anthropic-key",
      fetchImpl: vi.fn(async () => {
        throw new Error("proxy log leaked x-api-key test-anthropic-key and Bearer test-anthropic-key");
      })
    });

    await expect(client.decide(context, { model: "claude-sonnet-4-6" })).rejects.toThrow(
      AnthropicComputerUseDriverError
    );
    await expect(client.decide(context, { model: "claude-sonnet-4-6" })).rejects.not.toThrow("test-anthropic-key");
  });

  it("validates unsupported or malformed tool outputs before browser execution", async () => {
    const context = await contextWithScreenshot();
    const client = new AnthropicComputerUseDecisionClient({
      apiKey: "test-anthropic-key",
      fetchImpl: vi.fn(async () =>
        jsonResponse({
          model: "claude-sonnet-4-6-20261124",
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "toolu_bad",
              name: "computer",
              input: { action: "left_click" }
            }
          ],
          usage: { input_tokens: 1, output_tokens: 1 }
        })
      )
    });

    await expect(client.decide(context, { model: "claude-sonnet-4-6" })).rejects.toThrow(
      "left_click requires a numeric coordinate"
    );
  });
});

describe("AnthropicComputerUseDriver", () => {
  it("can opt into the real Anthropic computer-use client behind the paid-run gate", async () => {
    const context = await contextWithScreenshot();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        model: "claude-sonnet-4-6-20261124",
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_wait",
            name: "computer",
            input: { action: "wait" }
          }
        ],
        usage: { input_tokens: 10, output_tokens: 10 }
      })
    );
    const driver = new AnthropicComputerUseDriver({
      apiKey: "test-anthropic-key",
      model: "claude-sonnet-4-6",
      enablePaidCalls: true,
      fetchImpl
    });

    await expect(driver.decide(context)).resolves.toMatchObject({
      action: { kind: "wait", ms: 1000 },
      modelRun: { source: "model_api", provider: "anthropic" }
    });
  });
});

async function contextWithScreenshot(): Promise<AgentDriverContext> {
  const dir = await mkdtemp(join(tmpdir(), "tracepilot-anthropic-client-"));
  const screenshotPath = join(dir, "step-0.png");
  await writeFile(screenshotPath, Buffer.from("fake-png"));

  return {
    task: {
      id: "smoke",
      title: "Smoke",
      instruction: "Submit the smoke form.",
      startUrl: "http://127.0.0.1/smoke-form",
      maxSteps: 4
    },
    observation: {
      stepId: "step-0",
      screenshotPath,
      url: "http://127.0.0.1/smoke-form",
      title: "TracePilot Smoke Form",
      viewport: { width: 1280, height: 720 },
      capturedAt: "2026-06-27T00:00:00.000Z",
      domText: "Vendor\nAmount\nSubmit"
    },
    steps: []
  };
}

function jsonResponse(payload: unknown): {
  ok: true;
  status: number;
  text(): Promise<string>;
} {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload)
  };
}
