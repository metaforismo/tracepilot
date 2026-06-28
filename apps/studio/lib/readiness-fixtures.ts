import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReadinessGateResult } from "@tracepilot/core";

export type ReadinessLoadOptions = {
  runsRoot?: string;
  fixtureRoot?: string;
};

const defaultFixtureRoot = join(process.cwd(), "fixtures", "readiness");

export async function loadReadinessGate(options: ReadinessLoadOptions = {}): Promise<ReadinessGateResult> {
  const runsPath = join(options.runsRoot ?? defaultRunsRoot(), "readiness-gate", "readiness-gate.json");
  const fixturePath = join(options.fixtureRoot ?? defaultFixtureRoot, "readiness-gate.json");

  try {
    return await readGate(runsPath);
  } catch {
    return readGate(fixturePath);
  }
}

async function readGate(path: string): Promise<ReadinessGateResult> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as ReadinessGateResult;
}

function defaultRunsRoot(): string {
  return process.env.TRACEPILOT_STUDIO_RUNS_DIR ?? join(/* turbopackIgnore: true */ process.cwd(), "..", "..", "runs", "latest");
}
