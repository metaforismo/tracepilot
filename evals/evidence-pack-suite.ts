import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildEvidencePackManifest,
  redactEvidenceText,
  renderEvidencePackMarkdown,
  type EvidencePackArtifactInput,
  type EvidencePackManifest
} from "../packages/core/src/evidence-pack.js";
import { runCostLedgerSuite } from "./cost-ledger-suite.js";
import { runReadinessGateSuite } from "./readiness-gate-suite.js";
import type { ProviderScorecardSummary } from "./provider-scorecard-suite.js";
import type { ReliabilityScorecardSummary } from "./reliability-scorecard-suite.js";

export type EvidencePackSuiteOptions = {
  runsDir: string;
  generatedAt?: string;
  extraArtifacts?: EvidencePackArtifactInput[];
};

export type EvidencePackSuiteResult = {
  manifest: EvidencePackManifest;
  artifacts: {
    manifestPath: string;
    reportPath: string;
    artifactsDir: string;
  };
};

export async function runEvidencePackSuite(options: EvidencePackSuiteOptions): Promise<EvidencePackSuiteResult> {
  await rm(options.runsDir, { recursive: true, force: true });
  await mkdir(options.runsDir, { recursive: true });

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sourcesDir = join(options.runsDir, "sources");
  const artifactsDir = join(options.runsDir, "artifacts");
  const readinessDir = join(sourcesDir, "readiness-gate");
  const costLedgerDir = join(sourcesDir, "cost-ledger");
  const useLatestScorecards = process.env.TRACEPILOT_EVIDENCE_PACK_USE_LATEST_SCORECARDS === "1";
  const latestScorecards = useLatestScorecards ? await loadLatestScorecardSummaries() : {};

  await runReadinessGateSuite({
    runsDir: readinessDir,
    generatedAt,
    ...latestScorecards,
    ...(useLatestScorecards
      ? {}
      : {
          providerEnv: {
            ...process.env,
            TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
          }
        })
  });
  if (useLatestScorecards) {
    await copyLatestScorecardArtifacts(readinessDir);
  }
  await runCostLedgerSuite({
    runsDir: costLedgerDir,
    generatedAt
  });

  const artifactInputs = [
    ...(await generatedArtifacts({ readinessDir, costLedgerDir })),
    ...(await modelBrowserNegativeArtifacts()),
    ...(options.extraArtifacts ?? [])
  ];

  await Promise.all(artifactInputs.map((artifact) => writeRedactedArtifact({ artifactsDir, artifact })));

  const manifest = buildEvidencePackManifest({
    packId: "tracepilot-enterprise-evidence-pack",
    generatedAt,
    purpose: "enterprise_review",
    producer: "tracepilot",
    artifacts: artifactInputs,
    warnings: [
      useLatestScorecards
        ? "Evidence pack readiness uses existing runs/latest scorecard summaries; it does not re-run paid provider calls."
        : "Provider rows in the default evidence pack are dry-run rows unless paid provider scorecards are explicitly enabled upstream.",
      "Artifact hashes cover redacted evidence-pack bytes, not unredacted source files."
    ]
  });
  const manifestPath = join(options.runsDir, "enterprise-evidence-pack.json");
  const reportPath = join(options.runsDir, "enterprise-evidence-pack.md");

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(reportPath, renderEvidencePackMarkdown(manifest), "utf8");

  return {
    manifest,
    artifacts: {
      manifestPath,
      reportPath,
      artifactsDir
    }
  };
}

async function generatedArtifacts(params: {
  readinessDir: string;
  costLedgerDir: string;
}): Promise<EvidencePackArtifactInput[]> {
  return Promise.all([
    sourceArtifact({
      id: "readiness-inputs",
      title: "Readiness gate inputs",
      category: "readiness_gate",
      relativePath: "readiness/readiness-inputs.json",
      mediaType: "application/json",
      sourceSuite: "readiness-gate",
      required: true,
      sourcePath: join(params.readinessDir, "readiness-inputs.json")
    }),
    sourceArtifact({
      id: "readiness-gate",
      title: "Readiness gate decision",
      category: "readiness_gate",
      relativePath: "readiness/readiness-gate.json",
      mediaType: "application/json",
      sourceSuite: "readiness-gate",
      required: true,
      sourcePath: join(params.readinessDir, "readiness-gate.json")
    }),
    sourceArtifact({
      id: "readiness-report",
      title: "Readiness gate report",
      category: "report",
      relativePath: "readiness/readiness-gate.md",
      mediaType: "text/markdown",
      sourceSuite: "readiness-gate",
      required: true,
      sourcePath: join(params.readinessDir, "readiness-gate.md")
    }),
    sourceArtifact({
      id: "reliability-scorecard",
      title: "Reliability scorecard",
      category: "reliability_scorecard",
      relativePath: "scorecards/reliability-scorecard.json",
      mediaType: "application/json",
      sourceSuite: "reliability-scorecard",
      required: true,
      sourcePath: join(params.readinessDir, "reliability-scorecard", "reliability-scorecard.json")
    }),
    sourceArtifact({
      id: "reliability-results",
      title: "Reliability scorecard rows",
      category: "reliability_scorecard",
      relativePath: "scorecards/reliability-results.json",
      mediaType: "application/json",
      sourceSuite: "reliability-scorecard",
      required: true,
      sourcePath: join(params.readinessDir, "reliability-scorecard", "reliability-results.json")
    }),
    sourceArtifact({
      id: "reliability-diagnosis",
      title: "Reliability diagnosis",
      category: "diagnosis",
      relativePath: "diagnostics/reliability-diagnosis.json",
      mediaType: "application/json",
      sourceSuite: "reliability-scorecard",
      required: true,
      sourcePath: join(params.readinessDir, "reliability-scorecard", "reliability-diagnosis.json")
    }),
    sourceArtifact({
      id: "provider-scorecard",
      title: "Provider scorecard",
      category: "provider_scorecard",
      relativePath: "scorecards/provider-scorecard.json",
      mediaType: "application/json",
      sourceSuite: "provider-scorecard",
      required: true,
      sourcePath: join(params.readinessDir, "provider-scorecard", "provider-scorecard.json")
    }),
    sourceArtifact({
      id: "provider-results",
      title: "Provider scorecard rows",
      category: "provider_scorecard",
      relativePath: "scorecards/provider-results.json",
      mediaType: "application/json",
      sourceSuite: "provider-scorecard",
      required: true,
      sourcePath: join(params.readinessDir, "provider-scorecard", "provider-results.json")
    }),
    sourceArtifact({
      id: "provider-diagnosis",
      title: "Provider diagnosis",
      category: "diagnosis",
      relativePath: "diagnostics/provider-diagnosis.json",
      mediaType: "application/json",
      sourceSuite: "provider-scorecard",
      required: true,
      sourcePath: join(params.readinessDir, "provider-scorecard", "provider-diagnosis.json")
    }),
    sourceArtifact({
      id: "model-cost-ledger",
      title: "Model cost ledger",
      category: "cost_ledger",
      relativePath: "cost/model-cost-ledger.json",
      mediaType: "application/json",
      sourceSuite: "cost-ledger",
      required: true,
      sourcePath: join(params.costLedgerDir, "model-cost-ledger.json")
    }),
    sourceArtifact({
      id: "model-cost-report",
      title: "Model cost report",
      category: "report",
      relativePath: "cost/model-cost-report.md",
      mediaType: "text/markdown",
      sourceSuite: "cost-ledger",
      required: true,
      sourcePath: join(params.costLedgerDir, "model-cost-report.md")
    })
  ]);
}

async function modelBrowserNegativeArtifacts(): Promise<EvidencePackArtifactInput[]> {
  const root = process.cwd();
  return Promise.all([
    sourceArtifact({
      id: "model-browser-negative-metrics",
      title: "Model browser negative metrics",
      category: "run_metrics",
      relativePath: "traces/model-browser-negative/metrics.json",
      mediaType: "application/json",
      sourceSuite: "model-browser",
      required: true,
      sourcePath: join(root, "apps", "studio", "fixtures", "runs", "model-browser-negative", "metrics.json")
    }),
    sourceArtifact({
      id: "model-browser-negative-trace",
      title: "Model browser negative trace",
      category: "model_trace",
      relativePath: "traces/model-browser-negative/trace.jsonl",
      mediaType: "application/jsonl",
      sourceSuite: "model-browser",
      required: true,
      sourcePath: join(root, "apps", "studio", "fixtures", "runs", "model-browser-negative", "trace.jsonl")
    }),
    sourceArtifact({
      id: "model-browser-negative-screenshot",
      title: "Model browser negative screenshot",
      category: "model_trace",
      relativePath: "traces/model-browser-negative/screenshot.svg",
      mediaType: "image/svg+xml",
      sourceSuite: "model-browser",
      required: true,
      sourcePath: join(root, "apps", "studio", "public", "fixtures", "model-browser-negative.svg")
    })
  ]);
}

async function loadLatestScorecardSummaries(): Promise<{
  reliabilitySummary: ReliabilityScorecardSummary;
  providerSummary: ProviderScorecardSummary;
}> {
  return {
    reliabilitySummary: await readJson(join(process.cwd(), "runs", "latest", "reliability-scorecard", "reliability-scorecard.json")),
    providerSummary: await readJson(join(process.cwd(), "runs", "latest", "provider-scorecard", "provider-scorecard.json"))
  };
}

async function copyLatestScorecardArtifacts(readinessDir: string): Promise<void> {
  await Promise.all([
    cp(
      join(process.cwd(), "runs", "latest", "reliability-scorecard"),
      join(readinessDir, "reliability-scorecard"),
      { recursive: true, force: true }
    ),
    cp(
      join(process.cwd(), "runs", "latest", "provider-scorecard"),
      join(readinessDir, "provider-scorecard"),
      { recursive: true, force: true }
    )
  ]);
}

async function readJson<T>(path: string): Promise<T> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as T;
}

async function sourceArtifact(params: Omit<EvidencePackArtifactInput, "content"> & { sourcePath: string }): Promise<EvidencePackArtifactInput> {
  return {
    id: params.id,
    title: params.title,
    category: params.category,
    relativePath: params.relativePath,
    mediaType: params.mediaType,
    sourceSuite: params.sourceSuite,
    required: params.required,
    content: await readFile(params.sourcePath, "utf8")
  };
}

async function writeRedactedArtifact(params: {
  artifactsDir: string;
  artifact: EvidencePackArtifactInput;
}): Promise<void> {
  const targetPath = join(params.artifactsDir, params.artifact.relativePath);
  const redacted = redactEvidenceText(params.artifact.content);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, redacted.text, "utf8");
}
