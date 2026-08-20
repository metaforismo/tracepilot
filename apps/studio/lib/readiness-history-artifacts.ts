import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateReadinessHistory, type ReadinessHistoryResult } from "@tracepilot/core/readiness-history";

export type ReadinessHistoryLoadOptions = {
  historyRoot?: string;
  fixtureRoot?: string;
};

const defaultFixtureRoot = join(process.cwd(), "fixtures", "readiness");

export async function loadReadinessHistory(
  options: ReadinessHistoryLoadOptions = {}
): Promise<ReadinessHistoryResult> {
  const generatedPath = join(
    options.historyRoot ?? defaultHistoryRoot(),
    "readiness-history.json"
  );
  const fixturePath = join(
    options.fixtureRoot ?? defaultFixtureRoot,
    "readiness-history.json"
  );

  try {
    return await readHistory(generatedPath);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    return readHistory(fixturePath);
  }
}

async function readHistory(path: string): Promise<ReadinessHistoryResult> {
  const text = await readFile(path, "utf8");
  const value = JSON.parse(text) as unknown;
  try {
    validateReadinessHistory(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Readiness history at ${path} is invalid: ${reason}`);
  }
  return value;
}

function defaultHistoryRoot(): string {
  return process.env.TRACEPILOT_STUDIO_HISTORY_DIR ??
    join(
      /* turbopackIgnore: true */ process.cwd(),
      "..",
      "..",
      "runs",
      "history",
      "readiness-gate"
    );
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
