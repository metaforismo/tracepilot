# Enterprise Evidence Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, redacted, tamper-evident enterprise evidence pack for TracePilot runs, scorecards, readiness gates, model costs, and negative computer-use traces.

**Architecture:** Add core helpers for secret redaction, artifact hashing, canonical manifest generation, and Markdown readout. Add an eval suite that runs or collects existing TracePilot evidence, writes redacted artifact copies under `runs/latest/evidence-pack/artifacts`, and emits `enterprise-evidence-pack.json` plus `enterprise-evidence-pack.md`. Wire the suite into the CLI and docs.

**Tech Stack:** TypeScript, Node.js built-ins (`crypto`, `fs/promises`, `path`), Vitest, existing pnpm workspace and eval runner.

---

## File Structure

- Create `packages/core/src/evidence-pack.ts`
  - Redact provider/API key patterns from artifact text.
  - Build sorted artifact metadata.
  - Build canonical manifest digests with SHA-256.
  - Render a compact Markdown enterprise readout.
- Modify `packages/core/src/index.ts`
  - Export evidence-pack helpers and types.
- Create `packages/core/test/evidence-pack.test.ts`
  - Red tests for redaction, hash integrity, deterministic ordering, and report rendering.
- Create `evals/evidence-pack-suite.ts`
  - Run readiness gate and cost-ledger suites into nested dirs.
  - Collect readiness/provider/reliability/cost/model-browser trace artifacts.
  - Copy redacted artifacts into the evidence-pack bundle.
  - Write manifest and Markdown readout.
- Create `evals/evidence-pack-suite.test.ts`
  - Red tests for artifact collection, hashes, redaction, report output, and no secret leakage.
- Modify `evals/run-evals.ts`
  - Add `--suite evidence-pack`.
- Modify `evals/run-evals-cli.test.ts`
  - Add CLI coverage for `evidence-pack`.
- Modify `README.md`, `docs/results/first-report.md`, `docs/video-walkthrough-script.md`
  - Document the new suite and enterprise workflow.

## Task 1: Core Evidence-Pack Red Tests

**Files:**
- Create: `packages/core/test/evidence-pack.test.ts`
- Create later: `packages/core/src/evidence-pack.ts`
- Modify later: `packages/core/src/index.ts`

- [ ] **Step 1: Add failing core test file**

```ts
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
    const input = [
      `OPENAI_API_KEY=${openAiKey}`,
      `ANTHROPIC_API_KEY=${anthropicKey}`,
      `Authorization: Bearer ${anotherOpenAiKey}`
    ].join("\n");

    const result = redactEvidenceText(input);

    expect(result.text).toContain("OPENAI_API_KEY=[REDACTED_OPENAI_API_KEY]");
    expect(result.text).toContain("ANTHROPIC_API_KEY=[REDACTED_ANTHROPIC_API_KEY]");
    expect(result.text).toContain("Bearer [REDACTED_OPENAI_API_KEY]");
    expect(result.text).not.toContain(openAiKey);
    expect(result.text).not.toContain(anthropicKey);
    expect(result.redactions).toEqual([
      { type: "openai_api_key", count: 2 },
      { type: "anthropic_api_key", count: 1 }
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
```

- [ ] **Step 2: Verify RED**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/core test -- evidence-pack.test.ts
```

Expected: fail because `../src/evidence-pack.js` does not exist.

## Task 2: Core Evidence-Pack Implementation

**Files:**
- Create: `packages/core/src/evidence-pack.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/evidence-pack.test.ts`

- [ ] **Step 1: Implement core helpers**

The implementation must include:

```ts
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

export function redactEvidenceText(text: string): {
  text: string;
  redactions: EvidenceRedaction[];
};

export function buildEvidencePackManifest(input: EvidencePackManifestInput): EvidencePackManifest;

export function renderEvidencePackMarkdown(manifest: EvidencePackManifest): string;
```

Behavior:

- Sort artifacts by `relativePath`.
- Redact content before hashing.
- Store hashes of redacted content only.
- Compute `integrity.manifestSha256` from canonical JSON of the manifest without the `integrity` field.
- Summarize total artifacts, required artifacts, redacted artifacts, total bytes, categories, source suites, and warnings.

- [ ] **Step 2: Export helpers from `packages/core/src/index.ts`**

Add:

```ts
export {
  buildEvidencePackManifest,
  redactEvidenceText,
  renderEvidencePackMarkdown
} from "./evidence-pack.js";
export type {
  EvidenceArtifactCategory,
  EvidencePackArtifact,
  EvidencePackArtifactInput,
  EvidencePackManifest,
  EvidencePackManifestInput,
  EvidenceRedaction
} from "./evidence-pack.js";
```

- [ ] **Step 3: Verify GREEN**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/core test -- evidence-pack.test.ts
```

Expected: all evidence-pack core tests pass.

## Task 3: Eval Suite Red Tests

**Files:**
- Create: `evals/evidence-pack-suite.test.ts`
- Create later: `evals/evidence-pack-suite.ts`
- Modify later: `evals/run-evals.ts`
- Modify later: `evals/run-evals-cli.test.ts`

- [ ] **Step 1: Add failing eval-suite test**

```ts
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runEvidencePackSuite } from "./evidence-pack-suite.js";

describe("runEvidencePackSuite", () => {
  test("writes a redacted tamper-evident enterprise evidence pack", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-evidence-pack-"));
    const openAiKey = ["sk", "proj", "testsecret1234567890"].join("-");
    const result = await runEvidencePackSuite({
      runsDir,
      generatedAt: "2026-06-27T10:00:00.000Z",
      extraArtifacts: [
        {
          id: "secret-log",
          title: "Secret log",
          category: "other",
          relativePath: "logs/secret-log.txt",
          mediaType: "text/plain",
          sourceSuite: "test",
          required: false,
          content: `OPENAI_API_KEY=${openAiKey}\n`
        }
      ]
    });

    expect(result.manifest.summary.totalArtifacts).toBeGreaterThan(8);
    expect(result.manifest.summary.redactedArtifacts).toBe(1);
    expect(result.manifest.integrity.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.artifacts.some((artifact) => artifact.category === "readiness_gate")).toBe(true);
    expect(result.manifest.artifacts.some((artifact) => artifact.category === "provider_scorecard")).toBe(true);
    expect(result.manifest.artifacts.some((artifact) => artifact.category === "reliability_scorecard")).toBe(true);
    expect(result.manifest.artifacts.some((artifact) => artifact.category === "cost_ledger")).toBe(true);
    expect(result.manifest.artifacts.some((artifact) => artifact.category === "model_trace")).toBe(true);

    const report = await readFile(result.artifacts.reportPath, "utf8");
    expect(report).toContain("# Enterprise Evidence Pack");
    expect(report).toContain("readiness_gate");
    expect(report).toContain("model_trace");
    expect(report).not.toContain(openAiKey);

    const redactedLog = await readFile(join(runsDir, "artifacts", "logs", "secret-log.txt"), "utf8");
    expect(redactedLog).toContain("[REDACTED_OPENAI_API_KEY]");
    expect(redactedLog).not.toContain(openAiKey);
  }, 120_000);
});
```

- [ ] **Step 2: Add failing CLI test**

Append to `evals/run-evals-cli.test.ts`:

```ts
test("runs the enterprise evidence-pack suite without leaking provider keys", async () => {
  const { stdout } = await execFileAsync(
    "corepack",
    ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "evidence-pack"],
    {
      cwd: process.cwd(),
      timeout: 120_000,
      env: {
        ...process.env,
        OPENAI_API_KEY: "test-openai-key",
        ANTHROPIC_API_KEY: "test-anthropic-key",
        TRACEPILOT_ENABLE_PAID_MODEL_RUNS: "0"
      }
    }
  );

  expect(stdout).toContain("evidence-pack artifacts=");
  expect(stdout).toContain("manifest=");
  expect(stdout).toContain("report=");
  expect(stdout).not.toContain("test-openai-key");
  expect(stdout).not.toContain("test-anthropic-key");
}, 120_000);
```

- [ ] **Step 3: Verify RED**

Run:

```bash
corepack pnpm@9.15.4 exec vitest run evals/evidence-pack-suite.test.ts evals/run-evals-cli.test.ts
```

Expected: fail because `evals/evidence-pack-suite.ts` and CLI suite wiring do not exist.

## Task 4: Eval Suite Implementation

**Files:**
- Create: `evals/evidence-pack-suite.ts`
- Modify: `evals/run-evals.ts`
- Test: `evals/evidence-pack-suite.test.ts`
- Test: `evals/run-evals-cli.test.ts`

- [ ] **Step 1: Implement `runEvidencePackSuite`**

Behavior:

- Remove and recreate `options.runsDir`.
- Run `runReadinessGateSuite` into `join(options.runsDir, "sources", "readiness-gate")`.
- Run `runCostLedgerSuite` into `join(options.runsDir, "sources", "cost-ledger")`.
- Collect these generated source files:
  - `readiness-gate/readiness-inputs.json`
  - `readiness-gate/readiness-gate.json`
  - `readiness-gate/readiness-gate.md`
  - `readiness-gate/reliability-scorecard/reliability-scorecard.json`
  - `readiness-gate/reliability-scorecard/reliability-results.json`
  - `readiness-gate/reliability-scorecard/reliability-diagnosis.json`
  - `readiness-gate/provider-scorecard/provider-scorecard.json`
  - `readiness-gate/provider-scorecard/provider-results.json`
  - `readiness-gate/provider-scorecard/provider-diagnosis.json`
  - `cost-ledger/model-cost-ledger.json`
  - `cost-ledger/model-cost-report.md`
- Collect committed model-browser negative fixture files:
  - `apps/studio/fixtures/runs/model-browser-negative/metrics.json`
  - `apps/studio/fixtures/runs/model-browser-negative/trace.jsonl`
  - `apps/studio/public/fixtures/model-browser-negative.svg`
- Copy redacted artifact content into `join(options.runsDir, "artifacts", relativePath)`.
- Build the manifest via `buildEvidencePackManifest`.
- Write:
  - `enterprise-evidence-pack.json`
  - `enterprise-evidence-pack.md`

- [ ] **Step 2: Wire CLI**

Add `evidence-pack` to allowed suite names and add branch:

```ts
} else if (values.suite === "evidence-pack") {
  const result = await runEvidencePackSuite({
    runsDir: join(process.cwd(), "runs", "latest", "evidence-pack")
  });
  console.log(
    `evidence-pack artifacts=${result.manifest.summary.totalArtifacts} redacted=${result.manifest.summary.redactedArtifacts} manifest=${result.artifacts.manifestPath} report=${result.artifacts.reportPath}`
  );
```

- [ ] **Step 3: Verify GREEN**

Run:

```bash
corepack pnpm@9.15.4 exec vitest run evals/evidence-pack-suite.test.ts evals/run-evals-cli.test.ts
```

Expected: new tests pass.

## Task 5: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/results/first-report.md`
- Modify: `docs/video-walkthrough-script.md`

- [ ] **Step 1: README**

Add repository-status bullet:

```md
- enterprise evidence-pack suite that writes redacted artifacts, SHA-256 hashes, canonical manifest digest, and Markdown audit readout for readiness, provider, reliability, cost, and trace evidence.
```

Add local command:

```bash
corepack pnpm@9.15.4 run eval -- --suite evidence-pack
```

Add expected output:

```text
evidence-pack artifacts=... redacted=0 manifest=... report=...
```

- [ ] **Step 2: First report**

Document the evidence-pack suite as an enterprise review artifact, not a model benchmark.

- [ ] **Step 3: Video walkthrough**

Add a short segment showing `runs/latest/evidence-pack/enterprise-evidence-pack.md` and explaining redaction plus tamper-evident hashes.

## Task 6: Verification

- [ ] Run focused core test:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/core test -- evidence-pack.test.ts
```

- [ ] Run focused eval tests:

```bash
corepack pnpm@9.15.4 exec vitest run evals/evidence-pack-suite.test.ts evals/run-evals-cli.test.ts
```

- [ ] Run suite manually:

```bash
corepack pnpm@9.15.4 run eval -- --suite evidence-pack
```

- [ ] Run typecheck:

```bash
corepack pnpm@9.15.4 run typecheck
```

- [ ] Run all tests:

```bash
corepack pnpm@9.15.4 run test
```

- [ ] Run build:

```bash
corepack pnpm@9.15.4 run build
```

- [ ] Restore `apps/studio/next-env.d.ts` if Next rewrites it.
- [ ] Run CI:

```bash
corepack pnpm@9.15.4 run ci
```

- [ ] Run secret scan:

```bash
rg -n '<provider-key-patterns>' README.md SECURITY.md docs apps evals packages -g '!docs/superpowers/plans/**'
```

- [ ] Inspect generated manifest:

```bash
node -e 'const m=require("./runs/latest/evidence-pack/enterprise-evidence-pack.json"); console.log(m.summary, m.integrity)'
```

## Task 7: Finish

- [ ] Review diff:

```bash
git diff --check
git diff --stat
git status --short --branch
```

- [ ] Commit:

```bash
git add packages/core/src/evidence-pack.ts packages/core/src/index.ts packages/core/test/evidence-pack.test.ts evals/evidence-pack-suite.ts evals/evidence-pack-suite.test.ts evals/run-evals.ts evals/run-evals-cli.test.ts README.md docs/results/first-report.md docs/video-walkthrough-script.md docs/superpowers/plans/2026-06-27-enterprise-evidence-pack.md
git commit -m "feat: add enterprise evidence packs"
```

- [ ] Push branch, open PR, watch checks, merge, update `main`, delete branch, remove worktree.

## Acceptance Criteria

- `--suite evidence-pack` creates `runs/latest/evidence-pack/enterprise-evidence-pack.json` and `.md`.
- Manifest includes readiness, provider, reliability, cost-ledger, and model-browser negative trace artifacts.
- Every artifact has a SHA-256 hash over redacted content.
- Manifest has a canonical SHA-256 digest.
- Secrets are redacted before artifacts are written.
- CLI output does not leak provider keys.
- Full tests, typecheck, build, CI, and secret scan pass.
