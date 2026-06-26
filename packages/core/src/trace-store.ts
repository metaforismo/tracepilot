import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nanoid } from "nanoid";
import type { RunMetrics, TraceStep } from "./types.js";

export type TraceStore = {
  runId: string;
  runDir: string;
  screenshotsDir: string;
  appendStep(step: TraceStep): Promise<void>;
  writeMetrics(metrics: RunMetrics): Promise<void>;
};

export async function createTraceStore(rootDir: string, runId = nanoid()): Promise<TraceStore> {
  const runDir = join(rootDir, runId);
  const screenshotsDir = join(runDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });

  return {
    runId,
    runDir,
    screenshotsDir,
    async appendStep(step: TraceStep) {
      await appendFile(join(runDir, "trace.jsonl"), `${JSON.stringify(step)}\n`, "utf8");
    },
    async writeMetrics(metrics: RunMetrics) {
      await writeFile(join(runDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
    }
  };
}

