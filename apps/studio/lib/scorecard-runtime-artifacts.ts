import { readFile } from "node:fs/promises";
import { join } from "node:path";
import providerRowsFixture from "../fixtures/scorecards/provider-results.json";
import providerSummaryFixture from "../fixtures/scorecards/provider-scorecard.json";
import reliabilityRowsFixture from "../fixtures/scorecards/reliability-results.json";
import reliabilitySummaryFixture from "../fixtures/scorecards/reliability-scorecard.json";
import type {
  ProviderScorecardArtifact,
  ProviderScorecardRow,
  ProviderScorecardSummary,
  ReliabilityScorecardArtifact,
  ReliabilityScorecardResult,
  ReliabilityScorecardSummary,
  ScorecardSource
} from "./scorecard-artifacts";

const studioRoot = process.cwd();
const runsRoot = join(studioRoot, "..", "..", "runs", "latest");
const fixtureRoot = join(studioRoot, "fixtures", "scorecards");

const providerGeneratedRoot = join(runsRoot, "provider-scorecard");
const providerGeneratedSummaryPath = join(providerGeneratedRoot, "provider-scorecard.json");
const providerGeneratedRowsPath = join(providerGeneratedRoot, "provider-results.json");
const providerFixtureSummaryPath = join(fixtureRoot, "provider-scorecard.json");
const providerFixtureRowsPath = join(fixtureRoot, "provider-results.json");

const reliabilityGeneratedRoot = join(runsRoot, "reliability-scorecard");
const reliabilityGeneratedSummaryPath = join(reliabilityGeneratedRoot, "reliability-scorecard.json");
const reliabilityGeneratedRowsPath = join(reliabilityGeneratedRoot, "reliability-results.json");
const reliabilityFixtureSummaryPath = join(fixtureRoot, "reliability-scorecard.json");
const reliabilityFixtureRowsPath = join(fixtureRoot, "reliability-results.json");

export async function loadProviderScorecard(): Promise<ProviderScorecardArtifact> {
  try {
    const [summaryText, rowsText] = await Promise.all([
      readFile(/* turbopackIgnore: true */ providerGeneratedSummaryPath, "utf8"),
      readFile(/* turbopackIgnore: true */ providerGeneratedRowsPath, "utf8")
    ]);

    return {
      source: source(
        "runs_latest",
        providerGeneratedRoot,
        providerGeneratedSummaryPath,
        providerGeneratedRowsPath
      ),
      summary: JSON.parse(summaryText) as ProviderScorecardSummary,
      rows: JSON.parse(rowsText) as ProviderScorecardRow[]
    };
  } catch (error) {
    if (!isMissingFile(error)) throw error;

    return {
      source: source(
        "fixture",
        fixtureRoot,
        providerFixtureSummaryPath,
        providerFixtureRowsPath
      ),
      summary: providerSummaryFixture as ProviderScorecardSummary,
      rows: providerRowsFixture as ProviderScorecardRow[]
    };
  }
}

export async function loadReliabilityScorecard(): Promise<ReliabilityScorecardArtifact> {
  try {
    const [summaryText, rowsText] = await Promise.all([
      readFile(/* turbopackIgnore: true */ reliabilityGeneratedSummaryPath, "utf8"),
      readFile(/* turbopackIgnore: true */ reliabilityGeneratedRowsPath, "utf8")
    ]);

    return {
      source: source(
        "runs_latest",
        reliabilityGeneratedRoot,
        reliabilityGeneratedSummaryPath,
        reliabilityGeneratedRowsPath
      ),
      summary: JSON.parse(summaryText) as ReliabilityScorecardSummary,
      results: JSON.parse(rowsText) as ReliabilityScorecardResult[]
    };
  } catch (error) {
    if (!isMissingFile(error)) throw error;

    return {
      source: source(
        "fixture",
        fixtureRoot,
        reliabilityFixtureSummaryPath,
        reliabilityFixtureRowsPath
      ),
      summary: reliabilitySummaryFixture as ReliabilityScorecardSummary,
      results: reliabilityRowsFixture as ReliabilityScorecardResult[]
    };
  }
}

function source(
  kind: ScorecardSource["kind"],
  root: string,
  summaryPath: string,
  rowsPath: string
): ScorecardSource {
  return { kind, root, summaryPath, rowsPath };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
