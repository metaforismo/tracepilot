import { describe, expect, test } from "vitest";
import {
  anthropicApiKeyEnvVar,
  anthropicComputerUseToolMode,
  anthropicMessagesUrl,
  hasAnthropicApiCredentials,
  resolveAnthropicApiKey,
  usesOpenRouterAnthropicApi
} from "../src/anthropic-api-config.js";

describe("Anthropic API config", () => {
  test("can force first-party Anthropic when OpenRouter fallback variables are also present", () => {
    const env = {
      ANTHROPIC_API_KEY: "test-anthropic-key",
      OPENROUTER_API_KEY: "test-openrouter-key",
      ANTHROPIC_API_BASE_URL: "https://openrouter.ai/api",
      TRACEPILOT_ANTHROPIC_API_PROVIDER: "anthropic"
    };

    expect(hasAnthropicApiCredentials(env)).toBe(true);
    expect(resolveAnthropicApiKey(env)).toBe("test-anthropic-key");
    expect(anthropicApiKeyEnvVar(env)).toBe("ANTHROPIC_API_KEY");
    expect(anthropicMessagesUrl(env)).toBe("https://api.anthropic.com/v1/messages");
    expect(usesOpenRouterAnthropicApi(env)).toBe(false);
    expect(anthropicComputerUseToolMode(env)).toBe("native_computer");
  });

  test("can force OpenRouter compatibility mode when both provider keys are present", () => {
    const env = {
      ANTHROPIC_API_KEY: "test-anthropic-key",
      OPENROUTER_API_KEY: "test-openrouter-key",
      TRACEPILOT_ANTHROPIC_API_PROVIDER: "openrouter"
    };

    expect(resolveAnthropicApiKey(env)).toBe("test-openrouter-key");
    expect(anthropicApiKeyEnvVar(env)).toBe("OPENROUTER_API_KEY");
    expect(anthropicMessagesUrl(env)).toBe("https://openrouter.ai/api/v1/messages");
    expect(usesOpenRouterAnthropicApi(env)).toBe(true);
    expect(anthropicComputerUseToolMode(env)).toBe("action_tool");
  });
});
