import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FailureDiagnosisReport } from "@tracepilot/core";

const fixtureRoot = join(process.cwd(), "fixtures", "diagnostics");

export async function loadFailureDiagnosis(): Promise<FailureDiagnosisReport> {
  const text = await readFile(join(fixtureRoot, "failure-diagnosis.json"), "utf8");
  return JSON.parse(text) as FailureDiagnosisReport;
}
