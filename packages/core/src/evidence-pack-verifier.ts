import { createHash } from "node:crypto";
import type { EvidenceArtifactCategory, EvidencePackArtifact, EvidencePackManifest } from "./evidence-pack.js";

export type EvidencePackVerificationDecision = "pass" | "fail";
export type EvidencePackVerificationSeverity = "error" | "warning";
export type EvidencePackVerificationIssueCode =
  | "manifest_algorithm_invalid"
  | "manifest_digest_mismatch"
  | "manifest_expected_digest_mismatch"
  | "manifest_policy_invalid"
  | "manifest_summary_mismatch"
  | "duplicate_manifest_id"
  | "duplicate_manifest_path"
  | "artifact_missing"
  | "artifact_hash_mismatch"
  | "artifact_bytes_mismatch"
  | "unmanifested_artifact"
  | "required_category_missing"
  | "required_source_suite_missing"
  | "secret_pattern_detected";

export type EvidencePackArtifactContent = {
  relativePath: string;
  content: string;
};

export type EvidencePackVerificationIssue = {
  severity: EvidencePackVerificationSeverity;
  code: EvidencePackVerificationIssueCode;
  message: string;
  artifactId?: string;
  relativePath?: string;
  expected?: string | number;
  actual?: string | number;
};

export type EvidencePackCheckedArtifactStatus = "verified" | "missing" | "mismatch" | "leaked" | "extra";

export type EvidencePackCheckedArtifact = {
  id?: string;
  relativePath: string;
  status: EvidencePackCheckedArtifactStatus;
  expectedSha256?: string;
  actualSha256?: string;
  expectedBytes?: number;
  actualBytes?: number;
  issueCodes: EvidencePackVerificationIssueCode[];
};

export type EvidencePackVerificationInput = {
  manifest: EvidencePackManifest;
  artifacts: EvidencePackArtifactContent[];
  expectedManifestSha256?: string;
  requiredCategories?: readonly EvidenceArtifactCategory[];
  requiredSourceSuites?: readonly string[];
  generatedAt?: string;
};

export type EvidencePackVerificationReport = {
  suiteId: "enterprise-evidence-pack-verifier";
  schemaVersion: "2026-06-27";
  generatedAt: string;
  packId: string;
  decision: EvidencePackVerificationDecision;
  summary: {
    manifestArtifacts: number;
    providedArtifacts: number;
    verifiedArtifacts: number;
    missingArtifacts: number;
    mismatchedArtifacts: number;
    leakedArtifacts: number;
    errors: number;
    warnings: number;
  };
  integrity: {
    algorithm: "sha256";
    manifestSha256: string;
    actualManifestSha256: string;
    manifestMatches: boolean;
    expectedManifestSha256?: string;
    expectedDigestMatches?: boolean;
  };
  requirements: {
    categories: readonly EvidenceArtifactCategory[];
    sourceSuites: readonly string[];
  };
  checkedArtifacts: EvidencePackCheckedArtifact[];
  issues: EvidencePackVerificationIssue[];
};

export const defaultEnterpriseEvidencePackRequirements = {
  categories: [
    "cost_ledger",
    "diagnosis",
    "model_trace",
    "provider_scorecard",
    "readiness_gate",
    "reliability_scorecard",
    "report",
    "run_metrics"
  ] satisfies EvidenceArtifactCategory[],
  sourceSuites: ["cost-ledger", "model-browser", "provider-scorecard", "readiness-gate", "reliability-scorecard"]
} as const;

const monitoredIssueCodes: EvidencePackVerificationIssueCode[] = [
  "manifest_algorithm_invalid",
  "manifest_digest_mismatch",
  "manifest_expected_digest_mismatch",
  "manifest_policy_invalid",
  "manifest_summary_mismatch",
  "duplicate_manifest_id",
  "duplicate_manifest_path",
  "artifact_missing",
  "artifact_hash_mismatch",
  "artifact_bytes_mismatch",
  "unmanifested_artifact",
  "required_category_missing",
  "required_source_suite_missing",
  "secret_pattern_detected"
];

export function verifyEvidencePack(input: EvidencePackVerificationInput): EvidencePackVerificationReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const issues: EvidencePackVerificationIssue[] = [];
  const requiredCategories = input.requiredCategories ?? defaultEnterpriseEvidencePackRequirements.categories;
  const requiredSourceSuites = input.requiredSourceSuites ?? defaultEnterpriseEvidencePackRequirements.sourceSuites;
  const actualManifestSha256 = sha256(canonicalJson(withoutIntegrity(input.manifest)));
  const manifestMatches = actualManifestSha256 === input.manifest.integrity.manifestSha256;
  const expectedManifestSha256 = input.expectedManifestSha256;
  const expectedDigestMatches =
    expectedManifestSha256 === undefined
      ? undefined
      : expectedManifestSha256 === input.manifest.integrity.manifestSha256;

  if (input.manifest.integrity.algorithm !== "sha256") {
    addIssue(issues, {
      severity: "error",
      code: "manifest_algorithm_invalid",
      message: `Expected manifest hash algorithm sha256, got ${input.manifest.integrity.algorithm}.`,
      expected: "sha256",
      actual: input.manifest.integrity.algorithm
    });
  }

  if (!manifestMatches) {
    addIssue(issues, {
      severity: "error",
      code: "manifest_digest_mismatch",
      message: "Manifest metadata does not match its recorded SHA-256 digest.",
      expected: input.manifest.integrity.manifestSha256,
      actual: actualManifestSha256
    });
  }

  if (expectedManifestSha256 !== undefined && expectedDigestMatches === false) {
    addIssue(issues, {
      severity: "error",
      code: "manifest_expected_digest_mismatch",
      message: "Manifest digest does not match the expected out-of-band digest.",
      expected: expectedManifestSha256,
      actual: input.manifest.integrity.manifestSha256
    });
  }

  if (
    input.manifest.policy.secretsRedacted !== true ||
    input.manifest.policy.hashesCoverRedactedContentOnly !== true ||
    input.manifest.policy.contentsExcludedFromManifest !== true
  ) {
    addIssue(issues, {
      severity: "error",
      code: "manifest_policy_invalid",
      message: "Manifest policy flags do not describe a redacted content-excluded evidence pack."
    });
  }

  addDuplicateIssues(input.manifest.artifacts, issues);
  addSummaryIssue(input.manifest, issues);
  addRequirementIssues(input.manifest, requiredCategories, requiredSourceSuites, issues);

  const manifestPaths = new Set(input.manifest.artifacts.map((artifact) => artifact.relativePath));
  const contentByPath = new Map(input.artifacts.map((artifact) => [artifact.relativePath, artifact.content]));
  const checkedArtifacts: EvidencePackCheckedArtifact[] = input.manifest.artifacts.map((artifact) =>
    checkManifestArtifact(artifact, contentByPath.get(artifact.relativePath), issues)
  );

  for (const artifact of input.artifacts) {
    if (!manifestPaths.has(artifact.relativePath)) {
      const leaks = detectSecretLeaks(artifact.content);
      const issueCodes: EvidencePackVerificationIssueCode[] = ["unmanifested_artifact"];
      addIssue(issues, {
        severity: "warning",
        code: "unmanifested_artifact",
        message: `Copied artifact is not listed in the manifest: ${artifact.relativePath}.`,
        relativePath: artifact.relativePath
      });
      if (leaks > 0) {
        issueCodes.push("secret_pattern_detected");
        addIssue(issues, {
          severity: "error",
          code: "secret_pattern_detected",
          message: `Unmanifested artifact contains ${leaks} unredacted provider credential pattern(s): ${artifact.relativePath}.`,
          relativePath: artifact.relativePath,
          actual: leaks
        });
      }
      checkedArtifacts.push({
        relativePath: artifact.relativePath,
        status: leaks > 0 ? "leaked" : "extra",
        actualSha256: sha256(artifact.content),
        actualBytes: Buffer.byteLength(artifact.content, "utf8"),
        issueCodes
      });
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;

  return {
    suiteId: "enterprise-evidence-pack-verifier",
    schemaVersion: "2026-06-27",
    generatedAt,
    packId: input.manifest.packId,
    decision: errors > 0 ? "fail" : "pass",
    summary: {
      manifestArtifacts: input.manifest.artifacts.length,
      providedArtifacts: input.artifacts.length,
      verifiedArtifacts: checkedArtifacts.filter((artifact) => artifact.status === "verified").length,
      missingArtifacts: checkedArtifacts.filter((artifact) => artifact.status === "missing").length,
      mismatchedArtifacts: countArtifactIssuePaths(issues, ["artifact_hash_mismatch", "artifact_bytes_mismatch"]),
      leakedArtifacts: countArtifactIssuePaths(issues, ["secret_pattern_detected"]),
      errors,
      warnings
    },
    integrity: {
      algorithm: "sha256",
      manifestSha256: input.manifest.integrity.manifestSha256,
      actualManifestSha256,
      manifestMatches,
      ...(input.expectedManifestSha256 === undefined ? {} : { expectedManifestSha256: input.expectedManifestSha256 }),
      ...(expectedDigestMatches === undefined ? {} : { expectedDigestMatches })
    },
    requirements: {
      categories: requiredCategories,
      sourceSuites: requiredSourceSuites
    },
    checkedArtifacts,
    issues
  };
}

export function renderEvidencePackVerificationMarkdown(report: EvidencePackVerificationReport): string {
  const issueRows =
    report.issues.length === 0
      ? "| none | none | none | none | none |"
      : report.issues
          .map((issue) =>
            [
              issue.severity,
              issue.code,
              issue.artifactId ?? "none",
              issue.relativePath ?? "none",
              issue.message
            ].join(" | ")
          )
          .map((row) => `| ${row} |`)
          .join("\n");
  const artifactRows =
    report.checkedArtifacts.length === 0
      ? "| none | none | none | none |"
      : report.checkedArtifacts
          .map((artifact) =>
            [
              artifact.id ?? "none",
              artifact.status,
              artifact.relativePath,
              artifact.issueCodes.length === 0 ? "none" : artifact.issueCodes.join(", ")
            ].join(" | ")
          )
          .map((row) => `| ${row} |`)
          .join("\n");

  return `# Enterprise Evidence Pack Verification

Generated at: ${report.generatedAt}

Pack ID: \`${report.packId}\`

## Summary

| Metric | Value |
| --- | ---: |
| Decision | ${report.decision} |
| Manifest artifacts | ${report.summary.manifestArtifacts} |
| Provided artifacts | ${report.summary.providedArtifacts} |
| Verified artifacts | ${report.summary.verifiedArtifacts} |
| Missing artifacts | ${report.summary.missingArtifacts} |
| Mismatched artifacts | ${report.summary.mismatchedArtifacts} |
| Leaked artifacts | ${report.summary.leakedArtifacts} |
| Errors | ${report.summary.errors} |
| Warnings | ${report.summary.warnings} |

## Integrity

| Field | Value |
| --- | --- |
| Manifest SHA-256 | \`${report.integrity.manifestSha256}\` |
| Actual manifest SHA-256 | \`${report.integrity.actualManifestSha256}\` |
| Manifest digest matches | ${report.integrity.manifestMatches ? "yes" : "no"} |
| Expected out-of-band digest | ${report.integrity.expectedManifestSha256 ? `\`${report.integrity.expectedManifestSha256}\`` : "not provided"} |
| Expected digest matches | ${report.integrity.expectedDigestMatches === undefined ? "not checked" : report.integrity.expectedDigestMatches ? "yes" : "no"} |

## Issues

| Severity | Code | Artifact ID | Path | Message |
| --- | --- | --- | --- | --- |
${issueRows}

## Checked Artifacts

| Artifact ID | Status | Path | Issue codes |
| --- | --- | --- | --- |
${artifactRows}

## Failure Codes Monitored

${monitoredIssueCodes.map((code) => `- ${code}`).join("\n")}
`;
}

function checkManifestArtifact(
  artifact: EvidencePackArtifact,
  content: string | undefined,
  issues: EvidencePackVerificationIssue[]
): EvidencePackCheckedArtifact {
  if (content === undefined) {
    addIssue(issues, {
      severity: "error",
      code: "artifact_missing",
      message: `Manifest artifact is missing from the copied artifact directory: ${artifact.relativePath}.`,
      artifactId: artifact.id,
      relativePath: artifact.relativePath
    });
    return {
      id: artifact.id,
      relativePath: artifact.relativePath,
      status: "missing",
      expectedSha256: artifact.sha256,
      expectedBytes: artifact.bytes,
      issueCodes: ["artifact_missing"]
    };
  }

  const actualSha256 = sha256(content);
  const actualBytes = Buffer.byteLength(content, "utf8");
  const issueCodes: EvidencePackVerificationIssueCode[] = [];
  const leaks = detectSecretLeaks(content);

  if (actualSha256 !== artifact.sha256) {
    issueCodes.push("artifact_hash_mismatch");
    addIssue(issues, {
      severity: "error",
      code: "artifact_hash_mismatch",
      message: `Artifact SHA-256 does not match manifest metadata: ${artifact.relativePath}.`,
      artifactId: artifact.id,
      relativePath: artifact.relativePath,
      expected: artifact.sha256,
      actual: actualSha256
    });
  }

  if (actualBytes !== artifact.bytes) {
    issueCodes.push("artifact_bytes_mismatch");
    addIssue(issues, {
      severity: "error",
      code: "artifact_bytes_mismatch",
      message: `Artifact byte count does not match manifest metadata: ${artifact.relativePath}.`,
      artifactId: artifact.id,
      relativePath: artifact.relativePath,
      expected: artifact.bytes,
      actual: actualBytes
    });
  }

  if (leaks > 0) {
    issueCodes.push("secret_pattern_detected");
    addIssue(issues, {
      severity: "error",
      code: "secret_pattern_detected",
      message: `Artifact contains ${leaks} unredacted provider credential pattern(s): ${artifact.relativePath}.`,
      artifactId: artifact.id,
      relativePath: artifact.relativePath,
      actual: leaks
    });
  }

  return {
    id: artifact.id,
    relativePath: artifact.relativePath,
    status: issueCodes.includes("secret_pattern_detected")
      ? "leaked"
      : issueCodes.length > 0
        ? "mismatch"
        : "verified",
    expectedSha256: artifact.sha256,
    actualSha256,
    expectedBytes: artifact.bytes,
    actualBytes,
    issueCodes
  };
}

function addDuplicateIssues(artifacts: EvidencePackArtifact[], issues: EvidencePackVerificationIssue[]): void {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const artifact of artifacts) {
    if (ids.has(artifact.id)) {
      addIssue(issues, {
        severity: "error",
        code: "duplicate_manifest_id",
        message: `Manifest contains duplicate artifact id: ${artifact.id}.`,
        artifactId: artifact.id,
        relativePath: artifact.relativePath
      });
    }
    if (paths.has(artifact.relativePath)) {
      addIssue(issues, {
        severity: "error",
        code: "duplicate_manifest_path",
        message: `Manifest contains duplicate artifact path: ${artifact.relativePath}.`,
        artifactId: artifact.id,
        relativePath: artifact.relativePath
      });
    }
    ids.add(artifact.id);
    paths.add(artifact.relativePath);
  }
}

function addSummaryIssue(manifest: EvidencePackManifest, issues: EvidencePackVerificationIssue[]): void {
  const expected = summarizeManifestArtifacts(manifest.artifacts, manifest.warnings);
  if (canonicalJson(expected) !== canonicalJson(manifest.summary)) {
    addIssue(issues, {
      severity: "error",
      code: "manifest_summary_mismatch",
      message: "Manifest summary does not match artifact metadata."
    });
  }
}

function addRequirementIssues(
  manifest: EvidencePackManifest,
  requiredCategories: readonly EvidenceArtifactCategory[],
  requiredSourceSuites: readonly string[],
  issues: EvidencePackVerificationIssue[]
): void {
  const categories = new Set(manifest.artifacts.map((artifact) => artifact.category));
  const sourceSuites = new Set(manifest.artifacts.map((artifact) => artifact.sourceSuite));

  for (const category of requiredCategories) {
    if (!categories.has(category)) {
      addIssue(issues, {
        severity: "error",
        code: "required_category_missing",
        message: `Evidence pack is missing required category: ${category}.`,
        expected: category
      });
    }
  }

  for (const sourceSuite of requiredSourceSuites) {
    if (!sourceSuites.has(sourceSuite)) {
      addIssue(issues, {
        severity: "error",
        code: "required_source_suite_missing",
        message: `Evidence pack is missing required source suite: ${sourceSuite}.`,
        expected: sourceSuite
      });
    }
  }
}

function addIssue(
  issues: EvidencePackVerificationIssue[],
  issue: EvidencePackVerificationIssue
): void {
  issues.push(issue);
}

function countArtifactIssuePaths(
  issues: EvidencePackVerificationIssue[],
  codes: EvidencePackVerificationIssueCode[]
): number {
  return new Set(
    issues
      .filter((issue) => codes.includes(issue.code) && issue.relativePath !== undefined)
      .map((issue) => issue.relativePath)
  ).size;
}

function detectSecretLeaks(content: string): number {
  return (
    countMatches(
      content,
      /(?:^|[\s,{])["']?(?:OPENAI_API_KEY|ANTHROPIC_API_KEY)["']?\s*[:=]\s*["']?(?!\[REDACTED_)[^\s"',}]+["']?/g
    ) +
    countMatches(content, new RegExp(`${"sk"}-${"proj"}-[A-Za-z0-9_-]+`, "g")) +
    countMatches(content, new RegExp(`${"sk"}-${"ant"}-[A-Za-z0-9_-]+`, "g")) +
    countMatches(content, /Bearer\s+(?!\[REDACTED_)[A-Za-z0-9._~+/=-]{24,}/g)
  );
}

function countMatches(content: string, pattern: RegExp): number {
  return [...content.matchAll(pattern)].length;
}

function summarizeManifestArtifacts(
  artifacts: EvidencePackArtifact[],
  warnings: string[]
): EvidencePackManifest["summary"] {
  return {
    totalArtifacts: artifacts.length,
    requiredArtifacts: artifacts.filter((artifact) => artifact.required).length,
    redactedArtifacts: artifacts.filter((artifact) => artifact.redacted).length,
    totalBytes: artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    categories: groupedCounts(artifacts, "category"),
    sourceSuites: groupedCounts(artifacts, "sourceSuite"),
    warnings: new Set(warnings).size
  };
}

function groupedCounts<TKey extends "category" | "sourceSuite">(
  artifacts: EvidencePackArtifact[],
  key: TKey
): Array<Record<TKey, EvidencePackArtifact[TKey]> & { count: number }> {
  const counts = new Map<EvidencePackArtifact[TKey], number>();
  for (const artifact of artifacts) {
    counts.set(artifact[key], (counts.get(artifact[key]) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([value, count]) => ({ [key]: value, count }) as Record<TKey, EvidencePackArtifact[TKey]> & { count: number });
}

function withoutIntegrity(manifest: EvidencePackManifest): Omit<EvidencePackManifest, "integrity"> {
  const { integrity: _integrity, ...withoutDigest } = manifest;
  return withoutDigest;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)])
    );
  }

  return value;
}
