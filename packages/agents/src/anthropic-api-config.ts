export type AnthropicApiProvider = "anthropic" | "openrouter";

export function anthropicApiProvider(env: NodeJS.ProcessEnv = process.env): AnthropicApiProvider | undefined {
  const configured = env.TRACEPILOT_ANTHROPIC_API_PROVIDER?.trim();
  if (!configured) {
    return undefined;
  }
  if (configured === "anthropic" || configured === "openrouter") {
    return configured;
  }

  throw new Error(
    `TRACEPILOT_ANTHROPIC_API_PROVIDER must be "anthropic" or "openrouter", got "${configured}".`
  );
}

export function hasAnthropicApiCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveAnthropicApiKey(env) !== undefined;
}

export function resolveAnthropicApiKey(
  env: NodeJS.ProcessEnv = process.env,
  explicit?: string
): string | undefined {
  if (explicit) {
    return explicit;
  }

  const provider = anthropicApiProvider(env);
  if (provider === "anthropic") {
    return env.ANTHROPIC_API_KEY;
  }
  if (provider === "openrouter") {
    return env.OPENROUTER_API_KEY;
  }

  return env.OPENROUTER_API_KEY ?? env.ANTHROPIC_API_KEY;
}

export function anthropicApiKeyEnvVar(env: NodeJS.ProcessEnv = process.env): string {
  const provider = anthropicApiProvider(env);
  if (provider === "anthropic") {
    return "ANTHROPIC_API_KEY";
  }
  if (provider === "openrouter") {
    return "OPENROUTER_API_KEY";
  }

  return env.OPENROUTER_API_KEY ? "OPENROUTER_API_KEY" : "ANTHROPIC_API_KEY";
}

export function anthropicMessagesUrl(env: NodeJS.ProcessEnv = process.env): string {
  const provider = anthropicApiProvider(env);
  if (provider === "anthropic") {
    return "https://api.anthropic.com/v1/messages";
  }

  const base = env.ANTHROPIC_API_BASE_URL?.replace(/\/$/, "");
  if (base) {
    return `${base}/v1/messages`;
  }
  if (provider === "openrouter" || env.OPENROUTER_API_KEY) {
    return "https://openrouter.ai/api/v1/messages";
  }
  return "https://api.anthropic.com/v1/messages";
}

export function usesOpenRouterAnthropicApi(env: NodeJS.ProcessEnv = process.env): boolean {
  const provider = anthropicApiProvider(env);
  if (provider) {
    return provider === "openrouter";
  }

  return Boolean(env.OPENROUTER_API_KEY) || Boolean(env.ANTHROPIC_API_BASE_URL?.includes("openrouter"));
}

export type AnthropicComputerUseToolMode = "native_computer" | "action_tool";

export function anthropicComputerUseToolMode(
  env: NodeJS.ProcessEnv = process.env,
  useOpenRouter = usesOpenRouterAnthropicApi(env)
): AnthropicComputerUseToolMode {
  const configured = env.TRACEPILOT_ANTHROPIC_COMPUTER_USE_TOOL_MODE;
  if (configured === "native_computer" || configured === "action_tool") {
    return configured;
  }
  return useOpenRouter ? "action_tool" : "native_computer";
}

export function anthropicRequestHeaders(
  apiKey: string,
  useOpenRouter = usesOpenRouterAnthropicApi(),
  options: { includeComputerUseBeta?: boolean } = {}
): Record<string, string> {
  const common = {
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  };
  const betaHeaders =
    options.includeComputerUseBeta === false ? {} : { "anthropic-beta": "computer-use-2025-11-24" };

  if (useOpenRouter) {
    return {
      ...common,
      ...betaHeaders,
      Authorization: `Bearer ${apiKey}`
    };
  }

  return {
    ...common,
    ...betaHeaders,
    "x-api-key": apiKey
  };
}
