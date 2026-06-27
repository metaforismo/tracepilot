import { createHash } from "node:crypto";

export type EvidenceArtifactCategory =
  | "readiness_gate"
  | "provider_scorecard"
  | "reliability_scorecard"
  | "cost_ledger"
  | "model_trace"
  | "diagnosis"
  | "report"
  | "run_metrics"
  | "other";

export type EvidenceRedaction = {
  type: "openai_api_key" | "anthropic_api_key" | "generic_bearer_token";
  count: number;
};

export type EvidencePackArtifactInput = {
  id: string;
  title: string;
  category: EvidenceArtifactCategory;
  relativePath: string;
  mediaType: string;
  sourceSuite: string;
  required: boolean;
  content: string;
};

export type EvidencePackArtifact = Omit<EvidencePackArtifactInput, "content"> & {
  bytes: number;
  sha256: string;
  redacted: boolean;
  redactions: EvidenceRedaction[];
};

export type EvidencePackManifestInput = {
  packId: string;
  generatedAt: string;
  purpose: "enterprise_review" | "security_review" | "eval_readout" | "customer_audit";
  producer: string;
  artifacts: EvidencePackArtifactInput[];
  warnings: string[];
};

export type EvidencePackManifest = {
  suiteId: "enterprise-evidence-pack";
  schemaVersion: "2026-06-27";
  packId: string;
  generatedAt: string;
  purpose: EvidencePackManifestInput["purpose"];
  producer: string;
  artifacts: EvidencePackArtifact[];
  summary: {
    totalArtifacts: number;
    requiredArtifacts: number;
    redactedArtifacts: number;
    totalBytes: number;
    categories: Array<{ category: EvidenceArtifactCategory; count: number }>;
    sourceSuites: Array<{ sourceSuite: string; count: number }>;
    warnings: number;
  };
  policy: {
    secretsRedacted: true;
    hashesCoverRedactedContentOnly: true;
    contentsExcludedFromManifest: true;
  };
  warnings: string[];
  integrity: {
    algorithm: "sha256";
    manifestSha256: string;
  };
};

const schemaVersion: EvidencePackManifest["schemaVersion"] = "2026-06-27";

export function redactEvidenceText(text: string): { text: string; redactions: EvidenceRedaction[] } {
  let redacted = text;
  const counts = new Map<EvidenceRedaction["type"], number>();

  redacted = replaceNamedSecret(
    redacted,
    "OPENAI_API_KEY",
    "[REDACTED_OPENAI_API_KEY]",
    "openai_api_key",
    counts
  );
  redacted = replaceNamedSecret(
    redacted,
    "ANTHROPIC_API_KEY",
    "[REDACTED_ANTHROPIC_API_KEY]",
    "anthropic_api_key",
    counts
  );
  redacted = replaceAndCount(
    redacted,
    new RegExp(`${"sk"}-${"proj"}-[A-Za-z0-9_-]+`, "g"),
    "[REDACTED_OPENAI_API_KEY]",
    "openai_api_key",
    counts
  );
  redacted = replaceAndCount(
    redacted,
    new RegExp(`${"sk"}-${"ant"}-[A-Za-z0-9_-]+`, "g"),
    "[REDACTED_ANTHROPIC_API_KEY]",
    "anthropic_api_key",
    counts
  );
  redacted = replaceAndCount(
    redacted,
    /Bearer\s+(?!\[REDACTED_)[A-Za-z0-9._~+/=-]{24,}/g,
    "Bearer [REDACTED_BEARER_TOKEN]",
    "generic_bearer_token",
    counts
  );

  return {
    text: redacted,
    redactions: typedRedactions(counts)
  };
}

export function buildEvidencePackManifest(input: EvidencePackManifestInput): EvidencePackManifest {
  validateManifestInput(input);
  const artifacts = input.artifacts
    .map((artifact) => {
      const redacted = redactEvidenceText(artifact.content);
      return {
        id: artifact.id,
        title: artifact.title,
        category: artifact.category,
        relativePath: artifact.relativePath,
        mediaType: artifact.mediaType,
        sourceSuite: artifact.sourceSuite,
        required: artifact.required,
        bytes: Buffer.byteLength(redacted.text, "utf8"),
        sha256: sha256(redacted.text),
        redacted: redacted.redactions.length > 0,
        redactions: redacted.redactions
      };
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const manifestWithoutIntegrity = {
    suiteId: "enterprise-evidence-pack" as const,
    schemaVersion,
    packId: input.packId,
    generatedAt: input.generatedAt,
    purpose: input.purpose,
    producer: input.producer,
    artifacts,
    summary: summarizeArtifacts(artifacts, input.warnings),
    policy: {
      secretsRedacted: true as const,
      hashesCoverRedactedContentOnly: true as const,
      contentsExcludedFromManifest: true as const
    },
    warnings: uniqueSorted(input.warnings)
  };

  return {
    ...manifestWithoutIntegrity,
    integrity: {
      algorithm: "sha256",
      manifestSha256: sha256(canonicalJson(manifestWithoutIntegrity))
    }
  };
}

export function renderEvidencePackMarkdown(manifest: EvidencePackManifest): string {
  const artifactRows = manifest.artifacts.map((artifact) =>
    [
      artifact.id,
      artifact.category,
      artifact.sourceSuite,
      artifact.required ? "yes" : "no",
      artifact.redacted ? "yes" : "no",
      String(artifact.bytes),
      artifact.sha256,
      artifact.relativePath
    ].join(" | ")
  );
  const categoryRows = manifest.summary.categories.map((item) => `| ${item.category} | ${item.count} |`);
  const suiteRows = manifest.summary.sourceSuites.map((item) => `| ${item.sourceSuite} | ${item.count} |`);
  const warnings = manifest.warnings.length > 0 ? manifest.warnings.map((warning) => `- ${warning}`).join("\n") : "- None.";

  return `# Enterprise Evidence Pack

Generated at: ${manifest.generatedAt}

Pack ID: \`${manifest.packId}\`

Purpose: \`${manifest.purpose}\`

This pack is a redacted, tamper-evident evidence bundle for TracePilot reliability review. It is not a model leaderboard or a broad benchmark claim.

## Integrity

| Field | Value |
| --- | --- |
| Hash algorithm | ${manifest.integrity.algorithm} |
| Manifest SHA-256 | \`${manifest.integrity.manifestSha256}\` |
| Hash boundary | Redacted artifact content only |
| Manifest content policy | Artifact contents are excluded |

## Summary

| Metric | Value |
| --- | ---: |
| Total artifacts | ${manifest.summary.totalArtifacts} |
| Required artifacts | ${manifest.summary.requiredArtifacts} |
| Redacted artifacts | ${manifest.summary.redactedArtifacts} |
| Total redacted bytes | ${manifest.summary.totalBytes} |
| Warnings | ${manifest.summary.warnings} |

## Categories

| Category | Artifacts |
| --- | ---: |
${categoryRows.length > 0 ? categoryRows.join("\n") : "| none | 0 |"}

## Source Suites

| Source suite | Artifacts |
| --- | ---: |
${suiteRows.length > 0 ? suiteRows.join("\n") : "| none | 0 |"}

## Artifacts

| ID | Category | Source suite | Required | Redacted | Bytes | SHA-256 | Path |
| --- | --- | --- | --- | --- | ---: | --- | --- |
${artifactRows.length > 0 ? `| ${artifactRows.join(" |\n| ")} |` : "| none | none | none | no | no | 0 | none | none |"}

## Warnings

${warnings}
`;
}

function replaceAndCount(
  text: string,
  pattern: RegExp,
  replacement: string,
  type: EvidenceRedaction["type"],
  counts: Map<EvidenceRedaction["type"], number>
): string {
  return text.replace(pattern, () => {
    counts.set(type, (counts.get(type) ?? 0) + 1);
    return replacement;
  });
}

function replaceNamedSecret(
  text: string,
  keyName: string,
  placeholder: string,
  type: EvidenceRedaction["type"],
  counts: Map<EvidenceRedaction["type"], number>
): string {
  const pattern = new RegExp(`((?:^|[\\s,{])["']?${keyName}["']?\\s*[:=]\\s*)(["']?)([^\\s"',}]+)(["']?)`, "g");

  return text.replace(pattern, (match, prefix: string, openingQuote: string, value: string, closingQuote: string) => {
    if (value.startsWith("[REDACTED_")) {
      return match;
    }

    counts.set(type, (counts.get(type) ?? 0) + 1);
    return `${prefix}${openingQuote}${placeholder}${closingQuote}`;
  });
}

function typedRedactions(counts: Map<EvidenceRedaction["type"], number>): EvidenceRedaction[] {
  return (["openai_api_key", "anthropic_api_key", "generic_bearer_token"] as const).flatMap((type) => {
    const count = counts.get(type) ?? 0;
    return count === 0 ? [] : [{ type, count }];
  });
}

function summarizeArtifacts(
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
    warnings: uniqueSorted(warnings).length
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

function validateManifestInput(input: EvidencePackManifestInput): void {
  if (input.artifacts.length === 0) {
    throw new Error("Evidence packs require at least one artifact.");
  }

  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const artifact of input.artifacts) {
    if (ids.has(artifact.id)) {
      throw new Error(`Duplicate evidence artifact id: ${artifact.id}`);
    }
    if (paths.has(artifact.relativePath)) {
      throw new Error(`Duplicate evidence artifact path: ${artifact.relativePath}`);
    }
    validateRelativePath(artifact.relativePath);
    ids.add(artifact.id);
    paths.add(artifact.relativePath);
  }
}

function validateRelativePath(relativePath: string): void {
  if (relativePath.startsWith("/") || relativePath.startsWith("\\") || relativePath.trim() === "") {
    throw new Error(`Evidence artifact path must be relative, got ${relativePath}`);
  }

  if (relativePath.split(/[\\/]+/).some((part) => part === ".." || part === "")) {
    throw new Error(`Evidence artifact path cannot contain empty or parent segments: ${relativePath}`);
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
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
