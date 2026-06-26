import type { DriverDecision } from "@tracepilot/core";
import type { AgentDriver, AgentDriverContext } from "./agent-driver.js";

export type AnthropicDecisionClient = {
  decide(context: AgentDriverContext): Promise<DriverDecision>;
};

export type AnthropicComputerUseDriverOptions = {
  apiKey?: string;
  client?: AnthropicDecisionClient;
};

export class MissingAnthropicApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is required to use AnthropicComputerUseDriver.");
    this.name = "MissingAnthropicApiKeyError";
  }
}

export class AnthropicComputerUseDriver implements AgentDriver {
  private readonly client: AnthropicDecisionClient | undefined;

  constructor(options: AnthropicComputerUseDriverOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new MissingAnthropicApiKeyError();
    }

    this.client = options.client;
  }

  async decide(context: AgentDriverContext): Promise<DriverDecision> {
    if (!this.client) {
      throw new Error(
        "AnthropicComputerUseDriver needs an AnthropicDecisionClient before paid API calls are enabled in this repo."
      );
    }

    return this.client.decide(context);
  }
}
