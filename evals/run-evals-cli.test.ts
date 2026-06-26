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
  });
});
