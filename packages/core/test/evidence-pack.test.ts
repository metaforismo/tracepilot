import { describe, expect, test } from "vitest";
import {
  buildEvidencePackManifest,
  redactEvidenceText,
  renderEvidencePackMarkdown
} from "../src/evidence-pack.js";

describe("evidence pack", () => {
  test("redacts provider secrets and records typed redaction counts", () => {
    const openAiKey = ["sk", "proj", "testsecret1234567890"].join("-");
    const anotherOpenAiKey = ["sk", "proj", "anothersecret1234567890"].join("-");
    const anthropicKey = ["sk", "ant", "testsecret1234567890"].join("-");
    const openRouterKey = "sk-or-v1-testsecret1234567890";
    const openAiNamedSecret = "test-openai-key";
    const anthropicNamedSecret = "test-anthropic-key";
    const openRouterNamedSecret = "test-openrouter-key";
    const input = [
      `OPENAI_API_KEY=${openAiKey}`,
      `ANTHROPIC_API_KEY=${anthropicKey}`,
      `OPENROUTER_API_KEY=${openRouterKey}`,
      `Authorization: Bearer ${anotherOpenAiKey}`,
      JSON.stringify({
        OPENAI_API_KEY: openAiNamedSecret,
        ANTHROPIC_API_KEY: anthropicNamedSecret,
        OPENROUTER_API_KEY: openRouterNamedSecret
      })
    ].join("\n");

    const result = redactEvidenceText(input);

    expect(result.text).toContain("OPENAI_API_KEY=[REDACTED_OPENAI_API_KEY]");
    expect(result.text).toContain("ANTHROPIC_API_KEY=[REDACTED_ANTHROPIC_API_KEY]");
    expect(result.text).toContain("OPENROUTER_API_KEY=[REDACTED_OPENROUTER_API_KEY]");
    expect(result.text).toContain("Bearer [REDACTED_OPENAI_API_KEY]");
    expect(result.text).not.toContain(openAiKey);
    expect(result.text).not.toContain(anthropicKey);
    expect(result.text).not.toContain(openRouterKey);
    expect(result.text).not.toContain(openAiNamedSecret);
    expect(result.text).not.toContain(anthropicNamedSecret);
    expect(result.text).not.toContain(openRouterNamedSecret);
    expect(result.redactions).toEqual([
      { type: "openai_api_key", count: 3 },
      { type: "anthropic_api_key", count: 4 }
    ]);
  });

  test("builds a deterministic manifest with sorted artifacts and integrity digest", () => {
    const manifest = buildEvidencePackManifest({
      packId: "enterprise-pack-test",
      generatedAt: "2026-06-27T10:00:00.000Z",
      purpose: "enterprise_review",
      producer: "tracepilot",
      artifacts: [
        {
          id: "provider-scorecard",
          title: "Provider scorecard",
          category: "provider_scorecard",
          relativePath: "scorecards/provider-scorecard.json",
          mediaType: "application/json",
          sourceSuite: "provider-scorecard",
          required: true,
          content: "{\"suiteId\":\"provider-scorecard\"}\n"
        },
        {
          id: "readiness-gate",
          title: "Readiness gate",
          category: "readiness_gate",
          relativePath: "readiness/readiness-gate.json",
          mediaType: "application/json",
          sourceSuite: "readiness-gate",
          required: true,
          content: "{\"decision\":\"blocked\"}\n"
        }
      ],
      warnings: ["Provider scorecard is a dry run."]
    });

    expect(manifest.artifacts.map((artifact) => artifact.relativePath)).toEqual([
      "readiness/readiness-gate.json",
      "scorecards/provider-scorecard.json"
    ]);
    expect(manifest.summary.totalArtifacts).toBe(2);
    expect(manifest.summary.requiredArtifacts).toBe(2);
    expect(manifest.integrity.algorithm).toBe("sha256");
    expect(manifest.integrity.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256))).toBe(true);
  });

  test("renders a Markdown report without leaking redacted content", () => {
    const openAiKey = ["sk", "proj", "testsecret1234567890"].join("-");
    const manifest = buildEvidencePackManifest({
      packId: "enterprise-pack-test",
      generatedAt: "2026-06-27T10:00:00.000Z",
      purpose: "enterprise_review",
      producer: "tracepilot",
      artifacts: [
        {
          id: "redacted-log",
          title: "Redacted log",
          category: "other",
          relativePath: "logs/redacted-log.txt",
          mediaType: "text/plain",
          sourceSuite: "model-browser",
          required: false,
          content: `OPENAI_API_KEY=${openAiKey}\n`
        }
      ],
      warnings: []
    });

    const markdown = renderEvidencePackMarkdown(manifest);

    expect(markdown).toContain("# Enterprise Evidence Pack");
    expect(markdown).toContain("redacted-log");
    expect(markdown).toContain("Redacted artifacts | 1");
    expect(markdown).not.toContain(openAiKey);
  });
});
