import type { DriverDecision } from "@tracepilot/core";
import type { AgentDriver, AgentDriverContext } from "./agent-driver.js";

export type OpenAIDecisionClient = {
  decide(context: AgentDriverContext, options: { model: string; reasoningEffort?: string }): Promise<DriverDecision>;
};

export type OpenAIResponsesDriverOptions = {
  apiKey?: string;
  model?: string;
  reasoningEffort?: string;
  client?: OpenAIDecisionClient;
};

export class MissingOpenAIApiKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY is required to use OpenAIResponsesDriver.");
    this.name = "MissingOpenAIApiKeyError";
  }
}

export class OpenAIResponsesDriver implements AgentDriver {
  private readonly client: OpenAIDecisionClient | undefined;
  private readonly model: string;
  private readonly reasoningEffort: string;

  constructor(options: OpenAIResponsesDriverOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new MissingOpenAIApiKeyError();
    }

    this.model = options.model ?? process.env.TRACEPILOT_OPENAI_MODEL ?? "gpt-5.4-nano";
    this.reasoningEffort = options.reasoningEffort ?? process.env.TRACEPILOT_OPENAI_REASONING_EFFORT ?? "low";
    this.client = options.client;
  }

  async decide(context: AgentDriverContext): Promise<DriverDecision> {
    if (!this.client) {
      throw new Error("OpenAIResponsesDriver needs an OpenAIDecisionClient before paid API calls are enabled in this repo.");
    }

    return this.client.decide(context, { model: this.model, reasoningEffort: this.reasoningEffort });
  }
}
