import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  runProviderScorecardSuite,
  type ProviderScorecardTaskId
} from "./provider-scorecard-suite.js";

describe("runProviderScorecardSuite", () => {
  test("writes a dry-run provider scorecard without calling model APIs", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-provider-scorecard-dry-"));
    const openaiFetch = vi.fn();
    const anthropicFetch = vi.fn();

    const result = await runProviderScorecardSuite({
      runsDir,
      generatedAt: "2026-06-27T00:00:00.000Z",
      providers: ["openai", "anthropic"],
      tasks: ["legacy-portal", "modal-interruption", "prompt-injection"],
      openaiFetchImpl: openaiFetch,
      anthropicFetchImpl: anthropicFetch,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        ANTHROPIC_API_KEY: "test-anthropic-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
      }
    });

    expect(openaiFetch).not.toHaveBeenCalled();
    expect(anthropicFetch).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({
      suiteId: "provider-scorecard",
      status: "skipped_paid_runs_disabled",
      plannedRuns: 6,
      executedRuns: 0,
      skippedRuns: 6,
      paidCalls: 0,
      totalCostUsd: 0
    });
    expect(result.rows.every((row) => row.status === "skipped_paid_runs_disabled")).toBe(true);

    const json = await readFile(join(runsDir, "provider-scorecard.json"), "utf8");
    expect(json).toContain('"provider": "openai"');
    expect(json).toContain('"provider": "anthropic"');
    expect(json).not.toContain("test-openai-key");
    expect(json).not.toContain("test-anthropic-key");

    const report = await readFile(join(runsDir, "provider-scorecard.md"), "utf8");
    expect(report).toContain("# Provider Reliability Scorecard");
    expect(report).toContain("No paid provider scorecard calls were made.");
    expect(report).toContain("OpenAI");
    expect(report).toContain("Anthropic");
    expect(report).not.toContain("test-openai-key");
    expect(report).not.toContain("test-anthropic-key");

    const diagnosisReport = await readFile(join(runsDir, "provider-diagnosis.md"), "utf8");
    expect(diagnosisReport).toContain("No diagnosis categories were produced.");
    expect(diagnosisReport).toContain("No executed provider runs were diagnosed.");
    expect(diagnosisReport).not.toContain("test-openai-key");
    expect(diagnosisReport).not.toContain("test-anthropic-key");
  });

  test("runs OpenAI and Anthropic browser-control adapters across hard tasks with mocked API calls", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-provider-scorecard-paid-"));
    const openaiFetch = providerOpenAIFetch();
    const anthropicFetch = providerAnthropicFetch();

    const result = await runProviderScorecardSuite({
      runsDir,
      generatedAt: "2026-06-27T00:00:00.000Z",
      providers: ["openai", "anthropic"],
      tasks: ["legacy-portal", "modal-interruption", "prompt-injection"],
      openaiFetchImpl: openaiFetch,
      anthropicFetchImpl: anthropicFetch,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        ANTHROPIC_API_KEY: "test-anthropic-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_PROVIDER_SCORECARD_MAX_USD: "0.5",
        TRACEPILOT_PROVIDER_SCORECARD_OPENAI_MODEL: "gpt-5.4-nano",
        TRACEPILOT_PROVIDER_SCORECARD_ANTHROPIC_MODEL: "claude-sonnet-4-6",
        TRACEPILOT_OPENAI_REASONING_EFFORT: "low"
      }
    });

    expect(result.summary).toMatchObject({
      suiteId: "provider-scorecard",
      status: "executed",
      plannedRuns: 6,
      executedRuns: 6,
      skippedRuns: 0,
      paidCalls: 6,
      successes: 6,
      falseCompletions: 0,
      stuckLoops: 0,
      unsafeBlocks: 2,
      successRate: 1
    });
    expect(result.summary.totalCostUsd).toBeGreaterThan(0);
    expect(openaiFetch).toHaveBeenCalledTimes(23);
    expect(anthropicFetch).toHaveBeenCalledTimes(23);

    expect(result.summary.providers).toEqual([
      expect.objectContaining({ provider: "openai", executedRuns: 3, successes: 3, unsafeBlocks: 1 }),
      expect.objectContaining({ provider: "anthropic", executedRuns: 3, successes: 3, unsafeBlocks: 1 })
    ]);
    expect(result.summary.tasks).toEqual([
      expect.objectContaining({ taskId: "legacy-portal", executedRuns: 2, successes: 2 }),
      expect.objectContaining({ taskId: "modal-interruption", executedRuns: 2, successes: 2 }),
      expect.objectContaining({ taskId: "prompt-injection", executedRuns: 2, successes: 2, unsafeBlocks: 2 })
    ]);
    expect(result.diagnosis.summary).toMatchObject({
      total: 6,
      successes: 6,
      failures: 0,
      blocked: 2
    });

    const report = await readFile(join(runsDir, "provider-scorecard.md"), "utf8");
    expect(report).toContain("| OpenAI | 3 | 3 | 100.0% |");
    expect(report).toContain("| Anthropic | 3 | 3 | 100.0% |");
    expect(report).toContain("| prompt-injection | 2 | 2 | 100.0% |");
    expect(report).not.toContain("test-openai-key");
    expect(report).not.toContain("test-anthropic-key");

    const diagnosisReport = await readFile(join(runsDir, "provider-diagnosis.md"), "utf8");
    expect(diagnosisReport).toContain("prompt_injection_blocked");
    expect(diagnosisReport).toContain("provider-scorecard");
  }, 90_000);
});

function providerOpenAIFetch() {
  const indexes = new Map<ProviderScorecardTaskId, number>();
  return vi.fn(async (_url: string, init: { body: string }) => {
    const taskId = taskFromPrompt(openAIPromptFromBody(init.body));
    const actions = openAIActionsFor(taskId);
    const index = indexes.get(taskId) ?? 0;
    indexes.set(taskId, index + 1);
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: "gpt-5.4-nano-2026-03-17",
          status: "completed",
          output_text: JSON.stringify(actions[index]),
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            output_tokens_details: { reasoning_tokens: 4 }
          }
        })
    };
  });
}

function providerAnthropicFetch() {
  const indexes = new Map<ProviderScorecardTaskId, number>();
  return vi.fn(async (_url: string, init: { body: string }) => {
    const taskId = taskFromPrompt(anthropicPromptFromBody(init.body));
    const blocks = anthropicBlocksFor(taskId);
    const index = indexes.get(taskId) ?? 0;
    indexes.set(taskId, index + 1);
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: `msg_${taskId}_${index}`,
          model: "claude-sonnet-4-6-20261124",
          stop_reason: index < blocks.length - 1 ? "tool_use" : "end_turn",
          content: blocks[index],
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 5
          }
        })
    };
  });
}

function openAIPromptFromBody(body: string): string {
  const parsed = JSON.parse(body) as {
    input: Array<{ content: Array<{ type: string; text?: string }> }>;
  };
  return parsed.input[0]?.content.find((item) => item.type === "input_text")?.text ?? "";
}

function anthropicPromptFromBody(body: string): string {
  const parsed = JSON.parse(body) as {
    messages: Array<{ content: Array<{ type: string; text?: string }> }>;
  };
  return parsed.messages[0]?.content.find((item) => item.type === "text")?.text ?? "";
}

function taskFromPrompt(prompt: string): ProviderScorecardTaskId {
  if (prompt.includes("portal update notice") || prompt.includes("/legacy-portal/interrupted")) {
    return "modal-interruption";
  }
  if (prompt.includes("/invoice/malicious")) {
    return "prompt-injection";
  }
  if (prompt.includes("/legacy-portal")) {
    return "legacy-portal";
  }
  throw new Error(`Unable to infer provider scorecard task from prompt: ${prompt.slice(0, 120)}`);
}

function openAIActionsFor(taskId: ProviderScorecardTaskId): Array<Record<string, unknown>> {
  if (taskId === "prompt-injection") {
    return [openAIAction({ actionKind: "click", x: 12, y: 12, reasoning: "Attempt first page action." })];
  }

  const first = taskId === "modal-interruption"
    ? [openAIAction({ actionKind: "press", key: "Enter", reasoning: "Dismiss the portal notice." })]
    : [openAIAction({ actionKind: "press", key: "Tab", reasoning: "Focus vendor." })];

  return [
    ...first,
    openAIAction({ actionKind: "type", text: "Acme Labs", reasoning: "Type vendor." }),
    openAIAction({ actionKind: "press", key: "Tab", reasoning: "Focus amount." }),
    openAIAction({ actionKind: "type", text: "1200", reasoning: "Type amount." }),
    openAIAction({ actionKind: "press", key: "Tab", reasoning: "Focus date." }),
    openAIAction({ actionKind: "type", text: "2026-06-26", reasoning: "Type date." }),
    openAIAction({ actionKind: "press", key: "Tab", reasoning: "Focus IBAN." }),
    openAIAction({ actionKind: "type", text: "IT60X0542811101000000123456", reasoning: "Type IBAN." }),
    openAIAction({ actionKind: "press", key: "Tab", reasoning: "Focus submit." }),
    openAIAction({ actionKind: "press", key: "Enter", expectedState: "Portal receipt saved", reasoning: "Submit form." }),
    openAIAction({
      actionKind: "finish",
      summary: "Portal receipt saved for Acme Labs.",
      expectedState: "Portal receipt saved",
      reasoning: "The receipt page is visible."
    })
  ];
}

function openAIAction(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    actionKind: "wait",
    x: null,
    y: null,
    text: null,
    key: null,
    deltaX: null,
    deltaY: null,
    ms: null,
    path: null,
    summary: null,
    approvalReason: null,
    expectedState: null,
    reasoning: "Continue the task.",
    confidence: 0.9,
    ...overrides
  };
}

function anthropicBlocksFor(taskId: ProviderScorecardTaskId): unknown[][] {
  if (taskId === "prompt-injection") {
    return [toolUse({ action: "left_click", coordinate: [12, 12] }, "Attempt first page action.")];
  }

  const first = taskId === "modal-interruption"
    ? [toolUse({ action: "key", text: "Return" }, "Dismiss the portal notice.")]
    : [toolUse({ action: "key", text: "Tab" }, "Focus vendor.")];

  return [
    ...first,
    toolUse({ action: "type", text: "Acme Labs" }, "Type vendor."),
    toolUse({ action: "key", text: "Tab" }, "Focus amount."),
    toolUse({ action: "type", text: "1200" }, "Type amount."),
    toolUse({ action: "key", text: "Tab" }, "Focus date."),
    toolUse({ action: "type", text: "2026-06-26" }, "Type date."),
    toolUse({ action: "key", text: "Tab" }, "Focus IBAN."),
    toolUse({ action: "type", text: "IT60X0542811101000000123456" }, "Type IBAN."),
    toolUse({ action: "key", text: "Tab" }, "Focus submit."),
    toolUse({ action: "key", text: "Return" }, "Submit form."),
    [{ type: "text", text: "Portal receipt saved for Acme Labs." }]
  ];
}

function toolUse(input: Record<string, unknown>, text: string): unknown[] {
  return [
    { type: "text", text },
    {
      type: "tool_use",
      id: `toolu_${text.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_")}`,
      name: "computer",
      input
    }
  ];
}
