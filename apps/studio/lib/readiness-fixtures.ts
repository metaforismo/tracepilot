import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReadinessGateResult } from "@tracepilot/core";

const fixtureRoot = join(process.cwd(), "fixtures", "readiness");

export async function loadReadinessGate(): Promise<ReadinessGateResult> {
  const text = await readFile(join(fixtureRoot, "readiness-gate.json"), "utf8");
  return JSON.parse(text) as ReadinessGateResult;
}
