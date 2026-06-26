import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

describe("run-evals CLI", () => {
  test("runs the baseline-vs-TracePilot comparison suite", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "comparison"],
      {
        cwd: process.cwd(),
        timeout: 30_000
      }
    );

    expect(stdout).toContain("comparison success_delta=75.0%");
    expect(stdout).toContain("false_completion_delta=-50.0%");
    expect(stdout).toContain("diagnosis=");
  }, 30_000);

  test("runs the model cost-ledger suite with source-aware accounting", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "cost-ledger"],
      {
        cwd: process.cwd(),
        timeout: 30_000
      }
    );

    expect(stdout).toContain(
      "cost-ledger model_runs=1 scripted_controls=1 total_cost_usd=0.30975 source=model_fixture"
    );
    expect(stdout).toContain("ledger=");
    expect(stdout).toContain("report=");
  }, 30_000);

  test("runs the env-gated model readiness suite without paid calls by default", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "model-readiness"],
      {
        cwd: process.cwd(),
        timeout: 30_000,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: "test-anthropic-key",
          TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
        }
      }
    );

    expect(stdout).toContain(
      "model-readiness provider=anthropic model=claude-sonnet-4-20250514 status=skipped_paid_runs_disabled source=dry_run paid_call=false"
    );
    expect(stdout).toContain("manifest=");
    expect(stdout).toContain("report=");
    expect(stdout).not.toContain("test-anthropic-key");
  }, 30_000);

  test("runs OpenAI model readiness without leaking the API key", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "model-readiness"],
      {
        cwd: process.cwd(),
        timeout: 30_000,
        env: {
          ...process.env,
          TRACEPILOT_MODEL_PROVIDER: "openai",
          OPENAI_API_KEY: "test-openai-key",
          TRACEPILOT_OPENAI_MODEL: "gpt-5.2",
          TRACEPILOT_OPENAI_REASONING_EFFORT: "low",
          TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
        }
      }
    );

    expect(stdout).toContain(
      "model-readiness provider=openai model=gpt-5.2 reasoning_effort=low status=skipped_paid_runs_disabled source=dry_run paid_call=false"
    );
    expect(stdout).not.toContain("test-openai-key");
  }, 30_000);

  test("runs the OpenAI benchmark suite as a dry run by default", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "openai-benchmark"],
      {
        cwd: process.cwd(),
        timeout: 30_000,
        env: {
          ...process.env,
          OPENAI_API_KEY: "test-openai-key",
          TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
        }
      }
    );

    expect(stdout).toContain(
      "openai-benchmark status=skipped_paid_runs_disabled paid_calls=0 passed=0 failed=0 total_cost_usd=0"
    );
    expect(stdout).toContain("report=");
    expect(stdout).not.toContain("test-openai-key");
  }, 30_000);

  test("runs the model-browser suite as a dry run by default", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "model-browser"],
      {
        cwd: process.cwd(),
        timeout: 30_000,
        env: {
          ...process.env,
          OPENAI_API_KEY: "test-openai-key",
          TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
        }
      }
    );

    expect(stdout).toContain(
      "model-browser status=skipped_paid_runs_disabled paid_call=false success=false steps=0 total_cost_usd=0"
    );
    expect(stdout).toContain("report=");
    expect(stdout).not.toContain("test-openai-key");
  }, 30_000);
});
