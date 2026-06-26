import { readFile } from "node:fs/promises";
import { computeTokenCostUsd } from "@tracepilot/core";
import type { AgentAction, DriverDecision, ModelPricing, TokenUsage } from "@tracepilot/core";
import type { AgentDriverContext } from "./agent-driver.js";

export type OpenAIResponsesFetch = (
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

export type OpenAIResponsesDecisionClientOptions = {
  apiKey: string;
  fetchImpl?: OpenAIResponsesFetch;
  maxOutputTokens?: number;
};

type OpenAIDecisionOptions = {
  model: string;
  reasoningEffort?: string;
};

type OpenAIResponsePayload = {
  model?: string;
  status?: string;
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
    };
    output_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
};

type RawDecision = {
  actionKind?: string;
  x?: number | null;
  y?: number | null;
  text?: string | null;
  key?: string | null;
  deltaX?: number | null;
  deltaY?: number | null;
  ms?: number | null;
  path?: string | null;
  summary?: string | null;
  approvalReason?: string | null;
  expectedState?: string | null;
  reasoning?: string;
  confidence?: number;
};

export class OpenAIResponsesDriverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIResponsesDriverError";
  }
}

export class OpenAIResponsesDecisionClient {
  private readonly apiKey: string;
  private readonly fetchImpl: OpenAIResponsesFetch;
  private readonly maxOutputTokens: number;

  constructor(options: OpenAIResponsesDecisionClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxOutputTokens = options.maxOutputTokens ?? 500;
  }

  async decide(context: AgentDriverContext, options: OpenAIDecisionOptions): Promise<DriverDecision> {
    const startedAt = Date.now();
    const pricing = pricingForOpenAIModel(options.model);
    const body = JSON.stringify(
      await buildRequestBody({
        context,
        model: options.model,
        reasoningEffort: options.reasoningEffort ?? "low",
        maxOutputTokens: this.maxOutputTokens
      })
    );

    try {
      const response = await this.fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        body
      });
      const rawBody = await response.text();
      if (!response.ok) {
        throw new OpenAIResponsesDriverError(
          `OpenAI Responses API returned HTTP ${response.status}: ${sanitize(rawBody, this.apiKey)}`
        );
      }

      const payload = JSON.parse(rawBody) as OpenAIResponsePayload;
      const outputText = extractOutputText(payload);
      const rawDecision = parseDecision(outputText);
      const usage = usageFromPayload(payload);
      const costUsd = computeTokenCostUsd(usage, pricing);

      return {
        ...decisionFromRaw(rawDecision),
        modelRun: {
          source: "model_api",
          provider: "openai",
          model: options.model,
          ...(payload.model === undefined ? {} : { resolvedModel: payload.model }),
          usage,
          pricing,
          costUsd,
          latencyMs: Date.now() - startedAt,
          reasoningTokens: payload.usage?.output_tokens_details?.reasoning_tokens ?? 0
        }
      };
    } catch (error) {
      if (error instanceof OpenAIResponsesDriverError) {
        throw error;
      }

      throw new OpenAIResponsesDriverError(
        sanitize(error instanceof Error ? error.message : "Unknown OpenAI Responses client error.", this.apiKey)
      );
    }
  }
}

async function buildRequestBody(params: {
  context: AgentDriverContext;
  model: string;
  reasoningEffort: string;
  maxOutputTokens: number;
}): Promise<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: renderDecisionPrompt(params.context)
    }
  ];
  const screenshot = await readScreenshotAsDataUrl(params.context.observation.screenshotPath);
  if (screenshot) {
    content.push({
      type: "input_image",
      image_url: screenshot,
      detail: "low"
    });
  }

  return {
    model: params.model,
    store: false,
    max_output_tokens: params.maxOutputTokens,
    reasoning: {
      effort: params.reasoningEffort
    },
    input: [
      {
        role: "user",
        content
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "tracepilot_driver_decision",
        strict: true,
        schema: decisionSchema()
      }
    }
  };
}

function renderDecisionPrompt(context: AgentDriverContext): string {
  const history = context.steps
    .slice(-6)
    .map(
      (step) =>
        `${step.stepIndex}: action=${step.decision.action.kind}; verifier=${step.verifier.status}; reason=${step.verifier.reason}`
    )
    .join("\n");

  return `You are controlling a browser inside TracePilot.

Goal: ${context.task.instruction}
Current URL: ${context.observation.url}
Current title: ${context.observation.title}
Viewport: ${context.observation.viewport.width}x${context.observation.viewport.height}

Available actions:
- click: use x/y viewport coordinates.
- type: types text into the currently focused field.
- press: presses a key such as Tab, Enter, Escape, ArrowDown.
- scroll: uses deltaX/deltaY.
- wait: waits milliseconds.
- finish: only when verifier evidence already shows the goal state.
- requestHumanApproval: only for policy or irreversible ambiguity.

Prefer reliable keyboard navigation on simple forms: press Tab to focus a field, type the value, then press Tab or Enter.
Never invent success. If finishing, set expectedState to visible evidence that must be present.

Recent history:
${history || "No previous steps."}

Visible page text and field values:
${context.observation.domText ?? "(no DOM text captured)"}`;
}

async function readScreenshotAsDataUrl(path: string): Promise<string | undefined> {
  try {
    const image = await readFile(path);
    return `data:image/png;base64,${image.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function decisionSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "actionKind",
      "x",
      "y",
      "text",
      "key",
      "deltaX",
      "deltaY",
      "ms",
      "path",
      "summary",
      "approvalReason",
      "expectedState",
      "reasoning",
      "confidence"
    ],
    properties: {
      actionKind: {
        type: "string",
        enum: ["click", "type", "press", "scroll", "wait", "uploadFile", "finish", "requestHumanApproval"]
      },
      x: { type: ["number", "null"] },
      y: { type: ["number", "null"] },
      text: { type: ["string", "null"] },
      key: { type: ["string", "null"] },
      deltaX: { type: ["number", "null"] },
      deltaY: { type: ["number", "null"] },
      ms: { type: ["number", "null"] },
      path: { type: ["string", "null"] },
      summary: { type: ["string", "null"] },
      approvalReason: { type: ["string", "null"] },
      expectedState: { type: ["string", "null"] },
      reasoning: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 }
    }
  };
}

function parseDecision(outputText: string): RawDecision {
  const trimmed = outputText.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new OpenAIResponsesDriverError("OpenAI Responses output did not contain a JSON decision object.");
  }

  return JSON.parse(trimmed.slice(start, end + 1)) as RawDecision;
}

function decisionFromRaw(raw: RawDecision): Omit<DriverDecision, "modelRun"> {
  const action = actionFromRaw(raw);
  const reasoning = stringOrThrow(raw.reasoning, "reasoning");
  const confidence = numberOrThrow(raw.confidence, "confidence");

  return {
    action,
    reasoning,
    confidence,
    ...(raw.expectedState ? { expectedState: raw.expectedState } : {})
  };
}

function actionFromRaw(raw: RawDecision): AgentAction {
  switch (raw.actionKind) {
    case "click":
      return { kind: "click", x: numberOrThrow(raw.x, "x", "click actions require numeric x and y."), y: numberOrThrow(raw.y, "y", "click actions require numeric x and y.") };
    case "type":
      return { kind: "type", text: stringOrThrow(raw.text, "text") };
    case "press":
      return { kind: "press", key: stringOrThrow(raw.key, "key") };
    case "scroll":
      return {
        kind: "scroll",
        deltaX: numberOrThrow(raw.deltaX, "deltaX"),
        deltaY: numberOrThrow(raw.deltaY, "deltaY")
      };
    case "wait":
      return { kind: "wait", ms: numberOrThrow(raw.ms, "ms") };
    case "uploadFile":
      return { kind: "uploadFile", path: stringOrThrow(raw.path, "path") };
    case "finish":
      return { kind: "finish", summary: stringOrThrow(raw.summary, "summary") };
    case "requestHumanApproval":
      return { kind: "requestHumanApproval", reason: stringOrThrow(raw.approvalReason, "approvalReason") };
    default:
      throw new OpenAIResponsesDriverError(`Unsupported actionKind from OpenAI Responses output: ${String(raw.actionKind)}`);
  }
}

function stringOrThrow(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OpenAIResponsesDriverError(`OpenAI Responses output requires non-empty string field: ${field}.`);
  }
  return value;
}

function numberOrThrow(value: unknown, field: string, message?: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new OpenAIResponsesDriverError(message ?? `OpenAI Responses output requires numeric field: ${field}.`);
  }
  return value;
}

function usageFromPayload(payload: OpenAIResponsePayload): TokenUsage {
  return {
    inputTokens: payload.usage?.input_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0,
    cacheReadInputTokens: payload.usage?.input_tokens_details?.cached_tokens ?? 0
  };
}

function extractOutputText(payload: OpenAIResponsePayload): string {
  if (payload.output_text) {
    return payload.output_text;
  }

  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .join("\n") ?? ""
  );
}

function pricingForOpenAIModel(model: string): ModelPricing {
  if (model.startsWith("gpt-5.5")) {
    return {
      inputUsdPerMillionTokens: 5,
      outputUsdPerMillionTokens: 30,
      cacheReadInputUsdPerMillionTokens: 0.5
    };
  }
  if (model.startsWith("gpt-5.4-nano")) {
    return {
      inputUsdPerMillionTokens: 0.2,
      outputUsdPerMillionTokens: 1.25,
      cacheReadInputUsdPerMillionTokens: 0.02
    };
  }
  if (model.startsWith("gpt-5.4")) {
    return {
      inputUsdPerMillionTokens: 2.5,
      outputUsdPerMillionTokens: 15,
      cacheReadInputUsdPerMillionTokens: 0.25
    };
  }

  throw new OpenAIResponsesDriverError(`No OpenAI pricing configured for model ${model}.`);
}

function sanitize(message: string, apiKey: string): string {
  const withoutKey = apiKey ? message.replaceAll(apiKey, "[redacted]") : message;
  return withoutKey.replace(/Bearer\s+\S+/g, "Bearer [redacted]").slice(0, 500);
}
