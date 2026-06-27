import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

describe("run-evals CLI", () => {
  test("runs the invoice suite with validation recovery", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "invoice"],
      {
        cwd: process.cwd(),
        timeout: 60_000
      }
    );

    expect(stdout).toContain("invoice success=true");
    expect(stdout).toContain("portal=true");
    expect(stdout).toContain("validation=true");
    expect(stdout).toContain("approval=true");
    expect(stdout).toContain("injection=true");
  }, 60_000);

  test("runs the baseline-vs-TracePilot comparison suite", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "comparison"],
      {
        cwd: process.cwd(),
        timeout: 60_000
      }
    );

    expect(stdout).toContain("comparison success_delta=83.3%");
    expect(stdout).toContain("false_completion_delta=-50.0%");
    expect(stdout).toContain("diagnosis=");
  }, 60_000);

  test("runs the repeated reliability scorecard suite", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "reliability-scorecard"],
      {
        cwd: process.cwd(),
        timeout: 90_000
      }
    );

    expect(stdout).toContain("reliability-scorecard runs=5 repetitions=1 success_rate=100.0%");
    expect(stdout).toContain("false_completion_rate=0.0%");
    expect(stdout).toContain("stuck_loop_rate=0.0%");
    expect(stdout).toContain("report=");
    expect(stdout).toContain("diagnosis=");
  }, 90_000);

  test("passes a reliability scorecard repetition count through the CLI", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      [
        "pnpm@9.15.4",
        "exec",
        "tsx",
        "evals/run-evals.ts",
        "--",
        "--suite",
        "reliability-scorecard",
        "--repetitions",
        "2"
      ],
      {
        cwd: process.cwd(),
        timeout: 120_000
      }
    );

    expect(stdout).toContain("reliability-scorecard runs=10 repetitions=2 success_rate=100.0%");
    expect(stdout).toContain("false_completion_rate=0.0%");
    expect(stdout).toContain("stuck_loop_rate=0.0%");
  }, 120_000);

  test("runs the provider scorecard suite as a dry run by default", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "provider-scorecard"],
      {
        cwd: process.cwd(),
        timeout: 30_000,
        env: {
          ...process.env,
          OPENAI_API_KEY: "test-openai-key",
          ANTHROPIC_API_KEY: "test-anthropic-key",
          TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
        }
      }
    );

    expect(stdout).toContain(
      "provider-scorecard status=skipped_paid_runs_disabled planned_runs=6 executed_runs=0 success_rate=0.0%"
    );
    expect(stdout).toContain("report=");
    expect(stdout).toContain("diagnosis=");
    expect(stdout).not.toContain("test-openai-key");
    expect(stdout).not.toContain("test-anthropic-key");
  }, 30_000);

  test("passes a provider scorecard repetition count through the CLI", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      [
        "pnpm@9.15.4",
        "exec",
        "tsx",
        "evals/run-evals.ts",
        "--",
        "--suite",
        "provider-scorecard",
        "--repetitions",
        "2"
      ],
      {
        cwd: process.cwd(),
        timeout: 30_000,
        env: {
          ...process.env,
          OPENAI_API_KEY: "test-openai-key",
          ANTHROPIC_API_KEY: "test-anthropic-key",
          TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
        }
      }
    );

    expect(stdout).toContain(
      "provider-scorecard status=skipped_paid_runs_disabled planned_runs=12 executed_runs=0 success_rate=0.0%"
    );
    expect(stdout).not.toContain("test-openai-key");
    expect(stdout).not.toContain("test-anthropic-key");
  }, 30_000);

  test("runs the readiness gate suite without leaking provider keys", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "readiness-gate"],
      {
        cwd: process.cwd(),
        timeout: 90_000,
        env: {
          ...process.env,
          OPENAI_API_KEY: "test-openai-key",
          ANTHROPIC_API_KEY: "test-anthropic-key",
          TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
        }
      }
    );

    expect(stdout).toContain("readiness-gate decision=blocked reliability_runs=5 provider_executed_runs=0");
    expect(stdout).toContain("report=");
    expect(stdout).not.toContain("test-openai-key");
    expect(stdout).not.toContain("test-anthropic-key");
  }, 90_000);

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

  test("runs the Anthropic computer-use suite as a dry run by default", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "anthropic-computer-use"],
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
      "anthropic-computer-use status=skipped_paid_runs_disabled paid_call=false success=false steps=0 total_cost_usd=0"
    );
    expect(stdout).toContain("report=");
    expect(stdout).not.toContain("test-anthropic-key");
  }, 30_000);

  test("runs the enterprise evidence-pack suite without leaking provider keys", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "evidence-pack"],
      {
        cwd: process.cwd(),
        timeout: 120_000,
        env: {
          ...process.env,
          OPENAI_API_KEY: "test-openai-key",
          ANTHROPIC_API_KEY: "test-anthropic-key",
          TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
        }
      }
    );

    expect(stdout).toContain("evidence-pack artifacts=");
    expect(stdout).toContain("manifest=");
    expect(stdout).toContain("report=");
    expect(stdout).not.toContain("test-openai-key");
    expect(stdout).not.toContain("test-anthropic-key");
  }, 120_000);

  test("runs the enterprise evidence-pack verifier suite without leaking provider keys", async () => {
    const { stdout } = await execFileAsync(
      "corepack",
      ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "evidence-pack-verify"],
      {
        cwd: process.cwd(),
        timeout: 120_000,
        env: {
          ...process.env,
          OPENAI_API_KEY: "test-openai-key",
          ANTHROPIC_API_KEY: "test-anthropic-key",
          TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
        }
      }
    );

    expect(stdout).toContain("evidence-pack-verify decision=pass");
    expect(stdout).toContain("errors=0");
    expect(stdout).toContain("warnings=0");
    expect(stdout).toContain("report=");
    expect(stdout).not.toContain("test-openai-key");
    expect(stdout).not.toContain("test-anthropic-key");
  }, 120_000);
});
