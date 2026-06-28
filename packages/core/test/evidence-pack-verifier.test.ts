import { describe, expect, test } from "vitest";
import {
  buildEvidencePackManifest,
  redactEvidenceText,
  type EvidenceArtifactCategory,
  type EvidencePackArtifactInput
} from "../src/evidence-pack.js";
import {
  renderEvidencePackVerificationMarkdown,
  verifyEvidencePack,
  type EvidencePackVerificationReport
} from "../src/evidence-pack-verifier.js";

describe("evidence pack verifier", () => {
  test("passes an intact enterprise evidence pack", () => {
    const pack = createEnterprisePack();

    const report = verifyEvidencePack({
      manifest: pack.manifest,
      artifacts: redactedArtifactContents(pack.artifacts),
      expectedManifestSha256: pack.manifest.integrity.manifestSha256,
      generatedAt: "2026-06-27T10:01:00.000Z"
    });

    expect(report.decision).toBe("pass");
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBe(0);
    expect(report.summary.verifiedArtifacts).toBe(pack.artifacts.length);
    expect(report.integrity.manifestMatches).toBe(true);
    expect(report.integrity.expectedManifestSha256).toBe(pack.manifest.integrity.manifestSha256);
    expect(report.checkedArtifacts.every((artifact) => artifact.status === "verified")).toBe(true);
  });

  test("fails when artifacts are missing or tampered", () => {
    const pack = createEnterprisePack();
    const copiedArtifacts = redactedArtifactContents(pack.artifacts);
    const report = verifyEvidencePack({
      manifest: pack.manifest,
      artifacts: [
        { relativePath: copiedArtifacts[0].relativePath, content: "tampered" },
        ...copiedArtifacts.slice(2)
      ],
      requiredCategories: [],
      requiredSourceSuites: [],
      generatedAt: "2026-06-27T10:01:00.000Z"
    });

    expect(report.decision).toBe("fail");
    expect(issueCodes(report)).toContain("artifact_hash_mismatch");
    expect(issueCodes(report)).toContain("artifact_bytes_mismatch");
    expect(issueCodes(report)).toContain("artifact_missing");
    expect(report.summary.missingArtifacts).toBe(1);
    expect(report.summary.mismatchedArtifacts).toBe(1);
  });

  test("fails when copied artifacts still contain provider secrets", () => {
    const pack = createEnterprisePack();
    const leakedKey = "test-openai-key";
    const copiedArtifacts = redactedArtifactContents(pack.artifacts).map((item, index) =>
      index === 0 ? { ...item, content: JSON.stringify({ OPENAI_API_KEY: leakedKey }) } : item
    );

    const report = verifyEvidencePack({
      manifest: pack.manifest,
      artifacts: copiedArtifacts,
      requiredCategories: [],
      requiredSourceSuites: [],
      generatedAt: "2026-06-27T10:01:00.000Z"
    });

    expect(report.decision).toBe("fail");
    expect(issueCodes(report)).toContain("secret_pattern_detected");
    expect(report.summary.leakedArtifacts).toBe(1);
  });

  test("fails when copied artifacts contain raw OpenRouter token patterns", () => {
    const pack = createEnterprisePack();
    const copiedArtifacts = redactedArtifactContents(pack.artifacts).map((item, index) =>
      index === 0 ? { ...item, content: "provider token sk-or-v1-testsecret1234567890 leaked" } : item
    );

    const report = verifyEvidencePack({
      manifest: pack.manifest,
      artifacts: copiedArtifacts,
      requiredCategories: [],
      requiredSourceSuites: [],
      generatedAt: "2026-06-27T10:01:00.000Z"
    });

    expect(report.decision).toBe("fail");
    expect(issueCodes(report)).toContain("secret_pattern_detected");
    expect(report.summary.leakedArtifacts).toBe(1);
  });

  test("detects manifest digest mismatch and unmanifested artifacts", () => {
    const pack = createEnterprisePack();
    const report = verifyEvidencePack({
      manifest: {
        ...pack.manifest,
        producer: "attacker"
      },
      artifacts: [
        ...redactedArtifactContents(pack.artifacts),
        { relativePath: "extra/debug.txt", content: "not in manifest" }
      ],
      requiredCategories: [],
      requiredSourceSuites: [],
      generatedAt: "2026-06-27T10:01:00.000Z"
    });

    expect(report.decision).toBe("fail");
    expect(issueCodes(report)).toContain("manifest_digest_mismatch");
    expect(issueCodes(report)).toContain("unmanifested_artifact");
    expect(report.summary.warnings).toBe(1);
  });

  test("fails when unmanifested copied artifacts contain provider secrets", () => {
    const pack = createEnterprisePack();
    const report = verifyEvidencePack({
      manifest: pack.manifest,
      artifacts: [
        ...redactedArtifactContents(pack.artifacts),
        { relativePath: "extra/debug.txt", content: JSON.stringify({ ANTHROPIC_API_KEY: "test-anthropic-key" }) }
      ],
      requiredCategories: [],
      requiredSourceSuites: [],
      generatedAt: "2026-06-27T10:01:00.000Z"
    });

    expect(report.decision).toBe("fail");
    expect(issueCodes(report)).toContain("unmanifested_artifact");
    expect(issueCodes(report)).toContain("secret_pattern_detected");
    expect(report.summary.warnings).toBe(1);
    expect(report.summary.leakedArtifacts).toBe(1);
  });

  test("fails when the pack lacks required enterprise evidence classes", () => {
    const onlyReadiness = [
      artifact("readiness", "readiness_gate", "readiness-gate", "readiness/readiness-gate.json")
    ];
    const manifest = buildEvidencePackManifest({
      packId: "thin-pack",
      generatedAt: "2026-06-27T10:00:00.000Z",
      purpose: "enterprise_review",
      producer: "tracepilot",
      artifacts: onlyReadiness,
      warnings: []
    });

    const report = verifyEvidencePack({
      manifest,
      artifacts: redactedArtifactContents(onlyReadiness),
      generatedAt: "2026-06-27T10:01:00.000Z"
    });

    expect(report.decision).toBe("fail");
    expect(issueCodes(report)).toContain("required_category_missing");
    expect(issueCodes(report)).toContain("required_source_suite_missing");
  });

  test("renders a concise Markdown verification report", () => {
    const pack = createEnterprisePack();
    const report = verifyEvidencePack({
      manifest: pack.manifest,
      artifacts: redactedArtifactContents(pack.artifacts),
      expectedManifestSha256: pack.manifest.integrity.manifestSha256,
      generatedAt: "2026-06-27T10:01:00.000Z"
    });

    const markdown = renderEvidencePackVerificationMarkdown(report);

    expect(markdown).toContain("# Enterprise Evidence Pack Verification");
    expect(markdown).toContain("Decision | pass");
    expect(markdown).toContain("Verified artifacts | 8");
    expect(markdown).toContain("manifest_digest_mismatch");
    expect(markdown).not.toContain("test-openai-key");
  });
});

function createEnterprisePack(): {
  artifacts: EvidencePackArtifactInput[];
  manifest: ReturnType<typeof buildEvidencePackManifest>;
} {
  const artifacts = [
    artifact("readiness", "readiness_gate", "readiness-gate", "readiness/readiness-gate.json"),
    artifact("provider", "provider_scorecard", "provider-scorecard", "scorecards/provider-scorecard.json"),
    artifact(
      "reliability",
      "reliability_scorecard",
      "reliability-scorecard",
      "scorecards/reliability-scorecard.json"
    ),
    artifact("cost", "cost_ledger", "cost-ledger", "cost/model-cost-ledger.json"),
    artifact("trace", "model_trace", "model-browser", "traces/model-browser-negative/trace.jsonl"),
    artifact("diagnosis", "diagnosis", "reliability-scorecard", "diagnostics/reliability-diagnosis.json"),
    artifact("report", "report", "cost-ledger", "cost/model-cost-report.md"),
    artifact("metrics", "run_metrics", "model-browser", "traces/model-browser-negative/metrics.json")
  ];

  return {
    artifacts,
    manifest: buildEvidencePackManifest({
      packId: "pack",
      generatedAt: "2026-06-27T10:00:00.000Z",
      purpose: "enterprise_review",
      producer: "tracepilot",
      artifacts,
      warnings: ["Provider rows are dry runs."]
    })
  };
}

function artifact(
  id: string,
  category: EvidenceArtifactCategory,
  sourceSuite: string,
  relativePath: string
): EvidencePackArtifactInput {
  return {
    id,
    title: `${id} artifact`,
    category,
    relativePath,
    mediaType: relativePath.endsWith(".md") ? "text/markdown" : "application/json",
    sourceSuite,
    required: true,
    content: JSON.stringify({ id, category, sourceSuite, ok: true }) + "\n"
  };
}

function redactedArtifactContents(
  artifacts: EvidencePackArtifactInput[]
): Array<{ relativePath: string; content: string }> {
  return artifacts.map((artifact) => ({
    relativePath: artifact.relativePath,
    content: redactEvidenceText(artifact.content).text
  }));
}

function issueCodes(report: EvidencePackVerificationReport): string[] {
  return report.issues.map((issue) => issue.code);
}
