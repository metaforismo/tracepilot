import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { runOpenAIBenchmarkSuite } from "./openai-benchmark-suite.js";

describe("runOpenAIBenchmarkSuite", () => {
  test("writes a dry-run report without calling OpenAI when paid runs are disabled", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-openai-benchmark-dry-"));
    const fetchImpl = vi.fn();

    const result = await runOpenAIBenchmarkSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      fetchImpl,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
      }
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({
      status: "skipped_paid_runs_disabled",
      paidCalls: 0,
      totalCostUsd: 0
    });

    const report = await readFile(join(runsDir, "openai-benchmark-report.md"), "utf8");
    expect(report).toContain("Status: `skipped_paid_runs_disabled`");
    expect(report).toContain("No paid OpenAI call was made.");
    expect(report).not.toContain("test-openai-key");
  });

  test("executes selected tasks with a budget ledger and no secret leakage", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-openai-benchmark-paid-"));
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: "gpt-5.4-nano-2026-03-17",
          status: "completed",
          output_text:
            '{"claim":"TracePilot makes computer-use agent failures measurable.","amount":1200,"vendor":"Acme Labs"}',
          usage: {
            input_tokens: 100,
            output_tokens: 40,
            output_tokens_details: {
              reasoning_tokens: 0
            }
          }
        })
    }));

    const result = await runOpenAIBenchmarkSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      fetchImpl,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_OPENAI_BENCHMARK_MODELS: "gpt-5.4-nano",
        TRACEPILOT_OPENAI_BENCHMARK_TASKS: "structured-extraction",
        TRACEPILOT_OPENAI_BENCHMARK_MAX_USD: "0.25",
        TRACEPILOT_OPENAI_REASONING_EFFORT: "low"
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.summary).toMatchObject({
      status: "executed",
      paidCalls: 1,
      passed: 1,
      failed: 0
    });
    expect(result.results[0]).toMatchObject({
      model: "gpt-5.4-nano",
      resolvedModel: "gpt-5.4-nano-2026-03-17",
      taskId: "structured-extraction",
      validation: {
        passed: true
      },
      usage: {
        inputTokens: 100,
        outputTokens: 40
      }
    });

    const report = await readFile(join(runsDir, "openai-benchmark-report.md"), "utf8");
    expect(report).toContain("Paid calls | 1");
    expect(report).toContain("structured-extraction");
    expect(report).not.toContain("test-openai-key");

    const json = await readFile(join(runsDir, "openai-benchmark.json"), "utf8");
    expect(json).toContain('"totalCostUsd"');
    expect(json).not.toContain("test-openai-key");
  });

  test("redacts bearer values from stored fetch errors", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-openai-benchmark-redaction-"));
    const fetchImpl = vi.fn(async () => {
      throw new Error("network logger included Bearer test-openai-key by mistake");
    });

    const result = await runOpenAIBenchmarkSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      fetchImpl,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_OPENAI_BENCHMARK_MODELS: "gpt-5.4-nano",
        TRACEPILOT_OPENAI_BENCHMARK_TASKS: "structured-extraction",
        TRACEPILOT_OPENAI_BENCHMARK_MAX_USD: "0.25",
        TRACEPILOT_OPENAI_REASONING_EFFORT: "low"
      }
    });

    expect(result.summary).toMatchObject({
      errors: 1,
      paidCalls: 0
    });

    const json = await readFile(join(runsDir, "openai-benchmark.json"), "utf8");
    expect(json).not.toContain("test-openai-key");
    expect(json).toContain("Bearer [redacted]");
  });

  test("accepts semantic false-completion diagnoses, not only one exact label", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-openai-benchmark-diagnosis-"));
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: "gpt-5.5-2026-04-23",
          status: "completed",
          output_text:
            '{"category":"premature task completion / missing state verification","severity":"high","owner":"agent-runtime","nextExperiment":"Require a post-submit verifier before finish."}',
          usage: {
            input_tokens: 70,
            output_tokens: 120,
            output_tokens_details: {
              reasoning_tokens: 32
            }
          }
        })
    }));

    const result = await runOpenAIBenchmarkSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      fetchImpl,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_OPENAI_BENCHMARK_MODELS: "gpt-5.5",
        TRACEPILOT_OPENAI_BENCHMARK_TASKS: "failure-diagnosis",
        TRACEPILOT_OPENAI_BENCHMARK_MAX_USD: "0.25",
        TRACEPILOT_OPENAI_REASONING_EFFORT: "low"
      }
    });

    expect(result.summary).toMatchObject({
      paidCalls: 1,
      passed: 1,
      failed: 0
    });
    expect(result.results[0]?.validation).toMatchObject({
      passed: true,
      reason: "Diagnosed premature completion or missing verification and assigned an owner."
    });
  });

  test("accepts state-verification failure as a false-completion diagnosis", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-openai-benchmark-state-verification-"));
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: "gpt-5.4-nano-2026-03-17",
          status: "completed",
          output_text:
            '{"category":"Reliability/State-Verification Failure (Web automation desynchronization)","severity":"high","owner":"QA Automation & Agent Reliability","nextExperiment":"Add explicit verification gates before calling finish."}',
          usage: {
            input_tokens: 70,
            output_tokens: 120,
            output_tokens_details: {
              reasoning_tokens: 32
            }
          }
        })
    }));

    const result = await runOpenAIBenchmarkSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      fetchImpl,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_OPENAI_BENCHMARK_MODELS: "gpt-5.4-nano",
        TRACEPILOT_OPENAI_BENCHMARK_TASKS: "failure-diagnosis",
        TRACEPILOT_OPENAI_BENCHMARK_MAX_USD: "0.25",
        TRACEPILOT_OPENAI_REASONING_EFFORT: "low"
      }
    });

    expect(result.summary).toMatchObject({
      paidCalls: 1,
      passed: 1,
      failed: 0
    });
  });

  test("accepts workflow-state mismatch with a verification experiment", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-openai-benchmark-state-mismatch-"));
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: "gpt-5.4-nano-2026-03-17",
          status: "completed",
          output_text:
            '{"category":"Workflow-state mismatch / asynchronous UI update","severity":"high","owner":"Agent orchestration & UI state verifier","nextExperiment":"Add an explicit post-submit verification gate before allowing finish."}',
          usage: {
            input_tokens: 70,
            output_tokens: 120,
            output_tokens_details: {
              reasoning_tokens: 32
            }
          }
        })
    }));

    const result = await runOpenAIBenchmarkSuite({
      runsDir,
      generatedAt: "2026-06-26T00:00:00.000Z",
      fetchImpl,
      env: {
        OPENAI_API_KEY: "test-openai-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "1",
        TRACEPILOT_OPENAI_BENCHMARK_MODELS: "gpt-5.4-nano",
        TRACEPILOT_OPENAI_BENCHMARK_TASKS: "failure-diagnosis",
        TRACEPILOT_OPENAI_BENCHMARK_MAX_USD: "0.25",
        TRACEPILOT_OPENAI_REASONING_EFFORT: "low"
      }
    });

    expect(result.summary).toMatchObject({
      paidCalls: 1,
      passed: 1,
      failed: 0
    });
  });
});
