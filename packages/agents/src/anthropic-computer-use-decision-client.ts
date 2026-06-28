import { readFile } from "node:fs/promises";
import { computeTokenCostUsd } from "@tracepilot/core";
import type { AgentAction, DriverDecision, ModelPricing, TokenUsage } from "@tracepilot/core";
import type { AgentDriverContext } from "./agent-driver.js";
import {
  anthropicComputerUseToolMode,
  anthropicMessagesUrl,
  anthropicRequestHeaders,
  type AnthropicComputerUseToolMode,
  usesOpenRouterAnthropicApi
} from "./anthropic-api-config.js";

export type AnthropicComputerUseFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type AnthropicComputerUseDecisionClientOptions = {
  apiKey: string;
  fetchImpl?: AnthropicComputerUseFetch;
  maxTokens?: number;
  messagesUrl?: string;
  useOpenRouter?: boolean;
  toolMode?: AnthropicComputerUseToolMode;
};

export type AnthropicComputerUseDecisionOptions = {
  model: string;
  maxTokens?: number;
};

type AnthropicResponsePayload = {
  id?: string;
  model?: string;
  stop_reason?: string;
  content?: Array<AnthropicContentBlock>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
};

type AnthropicContentBlock =
  | { type: "text"; text?: string }
  | { type: "tool_use"; id?: string; name?: string; input?: AnthropicComputerInput }
  | { type: string; [key: string]: unknown };

type AnthropicComputerInput = {
  action?: string;
  coordinate?: unknown;
  text?: unknown;
  scroll_direction?: unknown;
  scroll_amount?: unknown;
};

type TracePilotActionInput = {
  action?: unknown;
  x?: unknown;
  y?: unknown;
  text?: unknown;
  direction?: unknown;
  amount?: unknown;
  summary?: unknown;
  reason?: unknown;
};

export class AnthropicComputerUseDriverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnthropicComputerUseDriverError";
  }
}

export class AnthropicComputerUseDecisionClient {
  private readonly apiKey: string;
  private readonly fetchImpl: AnthropicComputerUseFetch;
  private readonly maxTokens: number;
  private readonly messagesUrl: string;
  private readonly useOpenRouter: boolean;
  private readonly toolMode: AnthropicComputerUseToolMode;

  constructor(options: AnthropicComputerUseDecisionClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxTokens = options.maxTokens ?? 700;
    this.messagesUrl = options.messagesUrl ?? anthropicMessagesUrl();
    this.useOpenRouter = options.useOpenRouter ?? usesOpenRouterAnthropicApi();
    this.toolMode = options.toolMode ?? anthropicComputerUseToolMode(process.env, this.useOpenRouter);
  }

  async decide(context: AgentDriverContext, options: AnthropicComputerUseDecisionOptions): Promise<DriverDecision> {
    const startedAt = Date.now();
    const pricing = pricingForAnthropicModel(options.model);
    const body = JSON.stringify(
      await buildRequestBody({
        context,
        model: options.model,
        maxTokens: options.maxTokens ?? this.maxTokens,
        toolMode: this.toolMode
      })
    );

    try {
      const response = await this.fetchImpl(this.messagesUrl, {
        method: "POST",
        headers: anthropicRequestHeaders(this.apiKey, this.useOpenRouter, {
          includeComputerUseBeta: this.toolMode === "native_computer"
        }),
        body
      });
      const rawBody = await response.text();
      if (!response.ok) {
        throw new AnthropicComputerUseDriverError(
          `Anthropic Messages API returned HTTP ${response.status}: ${sanitize(rawBody, this.apiKey)}`
        );
      }

      const payload = JSON.parse(rawBody) as AnthropicResponsePayload;
      const usage = usageFromPayload(payload);
      const costUsd = computeTokenCostUsd(usage, pricing);

      return {
        ...decisionFromPayload(payload),
        modelRun: {
          source: "model_api",
          provider: "anthropic",
          model: options.model,
          ...(payload.model === undefined ? {} : { resolvedModel: payload.model }),
          usage,
          pricing,
          costUsd,
          latencyMs: Date.now() - startedAt
        }
      };
    } catch (error) {
      if (error instanceof AnthropicComputerUseDriverError) {
        throw error;
      }

      throw new AnthropicComputerUseDriverError(
        sanitize(error instanceof Error ? error.message : "Unknown Anthropic computer-use client error.", this.apiKey)
      );
    }
  }
}

async function buildRequestBody(params: {
  context: AgentDriverContext;
  model: string;
  maxTokens: number;
  toolMode: AnthropicComputerUseToolMode;
}): Promise<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: renderComputerUsePrompt(params.context)
    }
  ];
  const screenshot = await readScreenshotAsBase64(params.context.observation.screenshotPath);
  if (screenshot) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: screenshot
      }
    });
  }

  const common = {
    model: params.model,
    max_tokens: params.maxTokens,
    messages: [
      {
        role: "user",
        content
      }
    ]
  };

  if (params.toolMode === "action_tool") {
    return {
      ...common,
      tools: [tracePilotActionToolSchema()],
      tool_choice: { type: "tool", name: "tracepilot_action" }
    };
  }

  return {
    ...common,
    tools: [
      {
        type: "computer_20251124",
        name: "computer",
        display_width_px: params.context.observation.viewport.width,
        display_height_px: params.context.observation.viewport.height,
        display_number: 1
      }
    ]
  };
}

function renderComputerUsePrompt(context: AgentDriverContext): string {
  const history = context.steps
    .slice(-6)
    .map(
      (step) =>
        `${step.stepIndex}: action=${step.decision.action.kind}; verifier=${step.verifier.status}; reason=${step.verifier.reason}`
    )
    .join("\n");

  return `You are controlling a browser inside TracePilot with an Anthropic-compatible browser action tool.

Goal: ${context.task.instruction}
Current URL: ${context.observation.url}
Current title: ${context.observation.title}
Viewport: ${context.observation.viewport.width}x${context.observation.viewport.height}

Use the provided tool for browser actions. Prefer reliable keyboard navigation on simple forms.
If the visible page already proves the goal state, answer normally instead of using a tool.
For click actions, include numeric x and y viewport coordinates.
After filling a simple form, prefer pressing Return or Enter to submit when the active field is likely focused.
Do not repeat the same click after the verifier reports uncertain progress or no visible state change.
Focus-only clicks often create no observable verifier change; after focusing a field, type the intended value or use Tab/Enter rather than clicking the same spot again.
If a recent action was uncertain, choose a different recovery action and explain why.

Recent history:
${history || "No previous steps."}

Visible page text and field values:
${context.observation.domText ?? "(no DOM text captured)"}`;
}

function tracePilotActionToolSchema(): Record<string, unknown> {
  return {
    name: "tracepilot_action",
    description:
      "Choose exactly one next browser action for TracePilot's local UI automation harness. Use finish only when the visible state proves the task is complete.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: {
          type: "string",
          enum: ["click", "type", "press", "scroll", "wait", "finish"],
          description:
            "The next browser action to execute. click needs x and y. type and press need text. scroll needs direction. finish needs summary."
        },
        x: { type: "number", description: "Click x coordinate in viewport pixels." },
        y: { type: "number", description: "Click y coordinate in viewport pixels." },
        text: { type: "string", description: "Text to type, or the key name to press." },
        direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Scroll direction." },
        amount: { type: "number", description: "Scroll amount in coarse wheel units." },
        summary: { type: "string", description: "Completion summary when action is finish." },
        reason: { type: "string", description: "Brief reason for the chosen action." }
      },
      required: ["action", "reason"]
    }
  };
}

async function readScreenshotAsBase64(path: string): Promise<string | undefined> {
  try {
    const image = await readFile(path);
    return image.toString("base64");
  } catch {
    return undefined;
  }
}

function decisionFromPayload(payload: AnthropicResponsePayload): Omit<DriverDecision, "modelRun"> {
  const text = textFromPayload(payload);
  const computerToolUse = payload.content?.find(
    (block): block is Extract<AnthropicContentBlock, { type: "tool_use" }> =>
      block.type === "tool_use" && block.name === "computer"
  );

  if (computerToolUse) {
    return {
      action: actionFromComputerInput(computerToolUse.input),
      reasoning: text || `Anthropic requested computer action ${computerToolUse.input?.action ?? "unknown"}.`,
      confidence: 0.8
    };
  }

  const actionToolUse = payload.content?.find(
    (block): block is Extract<AnthropicContentBlock, { type: "tool_use" }> =>
      block.type === "tool_use" && block.name === "tracepilot_action"
  );
  if (actionToolUse) {
    const input = actionToolUse.input as TracePilotActionInput | undefined;
    const action = actionFromTracePilotActionInput(input);
    return {
      action,
      reasoning:
        stringFromUnknown(input?.reason) ||
        text ||
        `Anthropic-compatible action tool requested ${String(input?.action ?? "unknown")}.`,
      confidence: 0.8
    };
  }

  if (text) {
    return {
      action: { kind: "finish", summary: text },
      reasoning: text,
      confidence: 0.8
    };
  }

  throw new AnthropicComputerUseDriverError("Anthropic response did not contain a computer tool_use or text answer.");
}

function actionFromTracePilotActionInput(input: TracePilotActionInput | undefined): AgentAction {
  switch (input?.action) {
    case "click":
      return { kind: "click", x: numberOrThrow(input.x, "click requires numeric x."), y: numberOrThrow(input.y, "click requires numeric y.") };
    case "type":
      return { kind: "type", text: stringOrThrow(input.text, "type requires non-empty text.") };
    case "press":
      return { kind: "press", key: normalizeKeyName(stringOrThrow(input.text, "press requires non-empty text.")) };
    case "scroll":
      return scrollActionFromTracePilotInput(input);
    case "wait":
      return { kind: "wait", ms: 1000 };
    case "finish":
      return { kind: "finish", summary: stringOrThrow(input.summary ?? input.reason, "finish requires a summary.") };
    default:
      throw new AnthropicComputerUseDriverError(
        `Unsupported Anthropic-compatible action tool action: ${String(input?.action ?? "missing")}.`
      );
  }
}

function scrollActionFromTracePilotInput(input: TracePilotActionInput): AgentAction {
  const amount = typeof input.amount === "number" && Number.isFinite(input.amount) ? input.amount : 1;
  const pixels = Math.max(1, amount) * 480;
  switch (input.direction) {
    case "up":
      return { kind: "scroll", deltaX: 0, deltaY: -pixels };
    case "down":
      return { kind: "scroll", deltaX: 0, deltaY: pixels };
    case "left":
      return { kind: "scroll", deltaX: -pixels, deltaY: 0 };
    case "right":
      return { kind: "scroll", deltaX: pixels, deltaY: 0 };
    default:
      throw new AnthropicComputerUseDriverError("scroll requires direction up, down, left, or right.");
  }
}

function actionFromComputerInput(input: AnthropicComputerInput | undefined): AgentAction {
  switch (input?.action) {
    case "left_click": {
      const [x, y] = coordinateOrThrow(input.coordinate, "left_click requires a numeric coordinate.");
      return { kind: "click", x, y };
    }
    case "double_click": {
      const [x, y] = coordinateOrThrow(input.coordinate, "double_click requires a numeric coordinate.");
      return { kind: "click", x, y, clickCount: 2 };
    }
    case "triple_click": {
      const [x, y] = coordinateOrThrow(input.coordinate, "triple_click requires a numeric coordinate.");
      return { kind: "click", x, y, clickCount: 3 };
    }
    case "type":
      return { kind: "type", text: stringOrThrow(input.text, "type requires non-empty text.") };
    case "key":
      return { kind: "press", key: normalizeKeyName(stringOrThrow(input.text, "key requires non-empty text.")) };
    case "scroll":
      return scrollAction(input);
    case "wait":
      return { kind: "wait", ms: 1000 };
    case "screenshot":
      return { kind: "wait", ms: 250 };
    default:
      throw new AnthropicComputerUseDriverError(
        `Unsupported Anthropic computer action: ${String(input?.action ?? "missing")}.`
      );
  }
}

function scrollAction(input: AnthropicComputerInput): AgentAction {
  const amount = typeof input.scroll_amount === "number" && Number.isFinite(input.scroll_amount)
    ? input.scroll_amount
    : 1;
  const pixels = Math.max(1, amount) * 480;
  switch (input.scroll_direction) {
    case "up":
      return { kind: "scroll", deltaX: 0, deltaY: -pixels };
    case "down":
      return { kind: "scroll", deltaX: 0, deltaY: pixels };
    case "left":
      return { kind: "scroll", deltaX: -pixels, deltaY: 0 };
    case "right":
      return { kind: "scroll", deltaX: pixels, deltaY: 0 };
    default:
      throw new AnthropicComputerUseDriverError("scroll requires direction up, down, left, or right.");
  }
}

function coordinateOrThrow(value: unknown, message: string): [number, number] {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  ) {
    return [value[0], value[1]];
  }

  throw new AnthropicComputerUseDriverError(message);
}

function numberOrThrow(value: unknown, message: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new AnthropicComputerUseDriverError(message);
}

function stringOrThrow(value: unknown, message: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new AnthropicComputerUseDriverError(message);
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function normalizeKeyName(key: string): string {
  if (key === "Return") {
    return "Enter";
  }
  return key;
}

function textFromPayload(payload: AnthropicResponsePayload): string {
  return (
    payload.content
      ?.filter((block): block is Extract<AnthropicContentBlock, { type: "text" }> => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n")
      .trim() ?? ""
  );
}

function usageFromPayload(payload: AnthropicResponsePayload): TokenUsage {
  return {
    inputTokens: payload.usage?.input_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0,
    cacheReadInputTokens: payload.usage?.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: payload.usage?.cache_creation_input_tokens ?? 0
  };
}

function pricingForAnthropicModel(model: string): ModelPricing {
  if (model.includes("haiku")) {
    return {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 5,
      cacheReadInputUsdPerMillionTokens: 0.1,
      cacheCreationInputUsdPerMillionTokens: 1.25
    };
  }
  if (model.includes("opus")) {
    return {
      inputUsdPerMillionTokens: 5,
      outputUsdPerMillionTokens: 25,
      cacheReadInputUsdPerMillionTokens: 0.5,
      cacheCreationInputUsdPerMillionTokens: 6.25
    };
  }

  return {
    inputUsdPerMillionTokens: 3,
    outputUsdPerMillionTokens: 15,
    cacheReadInputUsdPerMillionTokens: 0.3,
    cacheCreationInputUsdPerMillionTokens: 3.75
  };
}

function sanitize(message: string, apiKey: string): string {
  const withoutKey = apiKey ? message.replaceAll(apiKey, "[redacted]") : message;
  return withoutKey.replace(/Bearer\s+\S+/g, "Bearer [redacted]").slice(0, 500);
}
