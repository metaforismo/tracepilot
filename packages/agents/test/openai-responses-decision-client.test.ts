import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  OpenAIResponsesDecisionClient,
  OpenAIResponsesDriver,
  OpenAIResponsesDriverError
} from "../src/index.js";
import type { AgentDriverContext } from "../src/agent-driver.js";

describe("OpenAIResponsesDecisionClient", () => {
  it("sends screenshot and page context to the Responses API and maps JSON into a TracePilot action", async () => {
    const context = await contextWithScreenshot();
    let requestBody: unknown;
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      requestBody = JSON.parse(init.body);
      return jsonResponse({
        model: "gpt-5.4-nano-2026-03-17",
        status: "completed",
        output_text: JSON.stringify({
          actionKind: "type",
          text: "Acme Labs",
          expectedState: "vendor field contains Acme Labs",
          reasoning: "The vendor input is focused, so type the vendor.",
          confidence: 0.86
        }),
        usage: {
          input_tokens: 100,
          output_tokens: 40,
          input_tokens_details: { cached_tokens: 10 },
          output_tokens_details: { reasoning_tokens: 8 }
        }
      });
    });

    const client = new OpenAIResponsesDecisionClient({
      apiKey: "test-openai-key",
      fetchImpl
    });

    const decision = await client.decide(context, {
      model: "gpt-5.4-nano",
      reasoningEffort: "low"
    });

    expect(decision).toMatchObject({
      action: { kind: "type", text: "Acme Labs" },
      expectedState: "vendor field contains Acme Labs",
      reasoning: "The vendor input is focused, so type the vendor.",
      confidence: 0.86,
      modelRun: {
        source: "model_api",
        provider: "openai",
        model: "gpt-5.4-nano",
        resolvedModel: "gpt-5.4-nano-2026-03-17",
        usage: {
          inputTokens: 100,
          outputTokens: 40,
          cacheReadInputTokens: 10
        },
        reasoningTokens: 8,
        costUsd: 0.00007
      }
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer test-openai-key" })
      })
    );
    expect(JSON.stringify(requestBody)).toContain("input_image");
    expect(JSON.stringify(requestBody)).toContain("TracePilot Smoke Form");
    expect(JSON.stringify(requestBody)).toContain("json_schema");
    expect(JSON.stringify(requestBody)).toContain('"store":false');
    const schema = (requestBody as {
      text: { format: { schema: { properties: Record<string, unknown>; required: string[] } } };
    }).text.format.schema;
    expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
  });

  it("redacts API keys from API and network errors", async () => {
    const context = await contextWithScreenshot();
    const fetchImpl = vi.fn(async () => {
      throw new Error("proxy log leaked Bearer test-openai-key");
    });
    const client = new OpenAIResponsesDecisionClient({
      apiKey: "test-openai-key",
      fetchImpl
    });

    await expect(client.decide(context, { model: "gpt-5.4-nano", reasoningEffort: "low" })).rejects.toThrow(
      OpenAIResponsesDriverError
    );
    await expect(client.decide(context, { model: "gpt-5.4-nano", reasoningEffort: "low" })).rejects.not.toThrow(
      "test-openai-key"
    );
  });

  it("validates model output before executing browser actions", async () => {
    const context = await contextWithScreenshot();
    const client = new OpenAIResponsesDecisionClient({
      apiKey: "test-openai-key",
      fetchImpl: vi.fn(async () =>
        jsonResponse({
          model: "gpt-5.4-nano-2026-03-17",
          status: "completed",
          output_text: JSON.stringify({
            actionKind: "click",
            reasoning: "Click without coordinates.",
            confidence: 0.5
          }),
          usage: { input_tokens: 1, output_tokens: 1 }
        })
      )
    });

    await expect(client.decide(context, { model: "gpt-5.4-nano", reasoningEffort: "low" })).rejects.toThrow(
      "click actions require numeric x and y"
    );
  });
});

describe("OpenAIResponsesDriver", () => {
  it("can opt into the real Responses client behind the paid-run gate", async () => {
    const context = await contextWithScreenshot();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        model: "gpt-5.4-nano-2026-03-17",
        status: "completed",
        output_text: JSON.stringify({
          actionKind: "wait",
          ms: 25,
          reasoning: "Wait for the next render.",
          confidence: 0.7
        }),
        usage: { input_tokens: 10, output_tokens: 10 }
      })
    );
    const driver = new OpenAIResponsesDriver({
      apiKey: "test-openai-key",
      model: "gpt-5.4-nano",
      reasoningEffort: "low",
      enablePaidCalls: true,
      fetchImpl
    });

    await expect(driver.decide(context)).resolves.toMatchObject({
      action: { kind: "wait", ms: 25 },
      modelRun: {
        source: "model_api"
      }
    });
  });
});

async function contextWithScreenshot(): Promise<AgentDriverContext> {
  const dir = await mkdtemp(join(tmpdir(), "tracepilot-openai-client-"));
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
      capturedAt: "2026-06-26T00:00:00.000Z",
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
