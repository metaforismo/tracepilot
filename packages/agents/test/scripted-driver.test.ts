import { describe, expect, it } from "vitest";
import {
  MissingAnthropicApiKeyError,
  MissingOpenAIApiKeyError,
  AnthropicComputerUseDriver,
  OpenAIResponsesDriver,
  ScriptedDriver
} from "../src/index.js";
import type { AgentDriverContext } from "../src/agent-driver.js";

const context: AgentDriverContext = {
  task: {
    id: "task",
    title: "Task",
    instruction: "Do the thing.",
    startUrl: "http://localhost",
    maxSteps: 3
  },
  observation: {
    stepId: "step-0",
    screenshotPath: "screenshot.png",
    url: "http://localhost",
    title: "Fixture",
    viewport: { width: 1280, height: 720 },
    capturedAt: "2026-06-26T00:00:00.000Z"
  },
  steps: []
};

describe("ScriptedDriver", () => {
  it("returns decisions in order", async () => {
    const driver = new ScriptedDriver([
      {
        action: { kind: "press", key: "Tab" },
        reasoning: "Focus the first field.",
        confidence: 1
      },
      {
        action: { kind: "type", text: "Acme Labs" },
        reasoning: "Type the vendor.",
        confidence: 1
      }
    ]);

    await expect(driver.decide(context)).resolves.toMatchObject({ action: { kind: "press", key: "Tab" } });
    await expect(driver.decide(context)).resolves.toMatchObject({ action: { kind: "type", text: "Acme Labs" } });
  });

  it("finishes when scripted decisions are exhausted", async () => {
    const driver = new ScriptedDriver([]);

    await expect(driver.decide(context)).resolves.toMatchObject({ action: { kind: "finish" } });
  });
});

describe("AnthropicComputerUseDriver", () => {
  it("requires an API key before enabling paid API calls", () => {
    expect(() => new AnthropicComputerUseDriver({ apiKey: "" })).toThrow(MissingAnthropicApiKeyError);
  });

  it("delegates to an injected decision client when configured", async () => {
    const driver = new AnthropicComputerUseDriver({
      apiKey: "test-key",
      client: {
        async decide() {
          return {
            action: { kind: "wait", ms: 10 },
            reasoning: "Injected client decision.",
            confidence: 0.9
          };
        }
      }
    });

    await expect(driver.decide(context)).resolves.toMatchObject({ action: { kind: "wait", ms: 10 } });
  });
});

describe("OpenAIResponsesDriver", () => {
  it("requires an API key before enabling paid API calls", () => {
    expect(() => new OpenAIResponsesDriver({ apiKey: "" })).toThrow(MissingOpenAIApiKeyError);
  });

  it("delegates to an injected decision client when configured", async () => {
    let observedModel = "";
    let observedReasoningEffort = "";
    const driver = new OpenAIResponsesDriver({
      apiKey: "test-key",
      model: "gpt-5.2",
      reasoningEffort: "low",
      client: {
        async decide(_context, options) {
          observedModel = options.model;
          observedReasoningEffort = options.reasoningEffort ?? "";
          return {
            action: { kind: "wait", ms: 5 },
            reasoning: "Injected OpenAI client decision.",
            confidence: 0.8
          };
        }
      }
    });

    await expect(driver.decide(context)).resolves.toMatchObject({ action: { kind: "wait", ms: 5 } });
    expect(observedModel).toBe("gpt-5.2");
    expect(observedReasoningEffort).toBe("low");
  });
});
