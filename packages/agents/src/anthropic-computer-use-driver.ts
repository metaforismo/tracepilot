import type { DriverDecision } from "@tracepilot/core";
import type { AgentDriver, AgentDriverContext } from "./agent-driver.js";
import {
  AnthropicComputerUseDecisionClient,
  type AnthropicComputerUseFetch
} from "./anthropic-computer-use-decision-client.js";

export type AnthropicDecisionClient = {
  decide(context: AgentDriverContext, options?: { model: string; maxTokens?: number }): Promise<DriverDecision>;
};

export type AnthropicComputerUseDriverOptions = {
  apiKey?: string;
  client?: AnthropicDecisionClient;
  model?: string;
  maxTokens?: number;
  enablePaidCalls?: boolean;
  fetchImpl?: AnthropicComputerUseFetch;
};

export class MissingAnthropicApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is required to use AnthropicComputerUseDriver.");
    this.name = "MissingAnthropicApiKeyError";
  }
}

export class AnthropicComputerUseDriver implements AgentDriver {
  private readonly client: AnthropicDecisionClient | undefined;
  private readonly model: string;
  private readonly maxTokens: number | undefined;

  constructor(options: AnthropicComputerUseDriverOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new MissingAnthropicApiKeyError();
    }

    this.model = options.model ?? process.env.TRACEPILOT_ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
    this.maxTokens = options.maxTokens;
    this.client =
      options.client ??
      (options.enablePaidCalls
        ? new AnthropicComputerUseDecisionClient({
            apiKey,
            ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
            ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens })
          })
        : undefined);
  }

  async decide(context: AgentDriverContext): Promise<DriverDecision> {
    if (!this.client) {
      throw new Error(
        "AnthropicComputerUseDriver needs an AnthropicDecisionClient before paid API calls are enabled in this repo."
      );
    }

    return this.client.decide(context, {
      model: this.model,
      ...(this.maxTokens === undefined ? {} : { maxTokens: this.maxTokens })
    });
  }
}
