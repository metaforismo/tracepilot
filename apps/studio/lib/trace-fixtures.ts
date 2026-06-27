import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunMetrics, TraceStep } from "@tracepilot/core";

export type StudioRun = {
  id: string;
  title: string;
  metrics: RunMetrics;
  steps: TraceStep[];
};

const fixtureRoot = join(process.cwd(), "fixtures", "runs");
const runTitles: Record<string, string> = {
  "smoke-form": "Smoke form",
  "model-browser-negative": "Model browser negative run"
};

export async function listRuns(): Promise<Array<{ id: string; title: string; description: string }>> {
  return [
    {
      id: "smoke-form",
      title: "Smoke form",
      description: "Two-step vendor form trace with deterministic success."
    },
    {
      id: "model-browser-negative",
      title: "Model browser negative run",
      description: "Paid-model-style browser trace with model metadata, a budget stop, and driver failure evidence."
    }
  ];
}

export async function loadRun(runId: string): Promise<StudioRun> {
  const runDir = join(fixtureRoot, runId);
  const [metricsText, traceText] = await Promise.all([
    readFile(join(runDir, "metrics.json"), "utf8"),
    readFile(join(runDir, "trace.jsonl"), "utf8")
  ]);

  return {
    id: runId,
    title: runTitles[runId] ?? runId,
    metrics: JSON.parse(metricsText) as RunMetrics,
    steps: traceText
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TraceStep)
  };
}

export function selectStep(steps: TraceStep[], requested: string | undefined): TraceStep {
  const index = requested === undefined ? steps.length - 1 : Number(requested);
  return steps[Math.min(Math.max(Number.isFinite(index) ? index : 0, 0), steps.length - 1)] ?? steps[0]!;
}
