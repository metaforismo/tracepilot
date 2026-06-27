# Evidence Pack Verifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline verifier that proves a TracePilot enterprise evidence pack is complete, internally consistent, untampered at the artifact-hash layer, and free of provider credential leaks.

**Architecture:** Add a pure core verifier that accepts a manifest plus copied artifact bytes and emits a structured pass/fail report. Add an eval suite that generates a fresh evidence pack, reads the redacted artifact directory from disk, verifies it, and writes JSON plus Markdown verifier reports. Wire the suite into the existing eval CLI and document the enterprise review workflow.

**Tech Stack:** TypeScript, Node.js built-ins (`crypto`, `fs/promises`, `path`), Vitest, existing pnpm workspace and eval runner.

---

## File Structure

- Create `packages/core/src/evidence-pack-verifier.ts`
  - Defines verifier input, checked-artifact rows, issue codes, report shape, default enterprise requirements, `verifyEvidencePack`, and `renderEvidencePackVerificationMarkdown`.
  - Recomputes canonical manifest SHA-256 by removing the `integrity` field and using the same recursive key ordering as the pack builder.
  - Checks artifact presence, SHA-256, byte counts, duplicate manifest rows, unmanifested files, manifest summary consistency, policy flags, required categories, required source suites, and provider-secret leakage in copied artifacts.
- Create `packages/core/test/evidence-pack-verifier.test.ts`
  - Red tests for intact pack pass, missing/tampered artifact fail, leaked credential fail, manifest digest fail, unmanifested artifact warning, and Markdown output.
- Modify `packages/core/src/index.ts`
  - Export verifier functions and types.
- Create `evals/evidence-pack-verify-suite.ts`
  - Generates an evidence pack in a nested directory by calling `runEvidencePackSuite`.
  - Reads every copied artifact from `artifacts/`.
  - Calls the pure verifier with the manifest digest as the expected out-of-band digest.
  - Writes `enterprise-evidence-pack-verification.json` and `enterprise-evidence-pack-verification.md`.
- Create `evals/evidence-pack-verify-suite.test.ts`
  - Red test for generated-pack verification and artifact report output.
- Modify `evals/run-evals.ts`
  - Add `--suite evidence-pack-verify`.
- Modify `evals/run-evals-cli.test.ts`
  - Add CLI coverage for the verifier suite and secret-safe stdout.
- Modify `README.md`, `docs/results/first-report.md`, `docs/video-walkthrough-script.md`
  - Document pack generation plus verifier workflow and what pass/fail means.

## Task 1: Core Verifier Red Tests

**Files:**
- Create: `packages/core/test/evidence-pack-verifier.test.ts`
- Create later: `packages/core/src/evidence-pack-verifier.ts`
- Modify later: `packages/core/src/index.ts`

- [ ] **Step 1: Add failing tests for the pure verifier**

Use helper artifacts that cover the enterprise categories and source suites:

```ts
const requiredArtifacts: EvidencePackArtifactInput[] = [
  artifact("readiness", "readiness_gate", "readiness-gate", "readiness/readiness-gate.json"),
  artifact("provider", "provider_scorecard", "provider-scorecard", "scorecards/provider-scorecard.json"),
  artifact("reliability", "reliability_scorecard", "reliability-scorecard", "scorecards/reliability-scorecard.json"),
  artifact("cost", "cost_ledger", "cost-ledger", "cost/model-cost-ledger.json"),
  artifact("trace", "model_trace", "model-browser", "traces/model-browser-negative/trace.jsonl"),
  artifact("diagnosis", "diagnosis", "reliability-scorecard", "diagnostics/reliability-diagnosis.json"),
  artifact("report", "report", "cost-ledger", "cost/model-cost-report.md"),
  artifact("metrics", "run_metrics", "model-browser", "traces/model-browser-negative/metrics.json")
];
```

Tests to add:

```ts
test("passes an intact enterprise evidence pack", () => {
  const manifest = buildEvidencePackManifest({
    packId: "pack",
    generatedAt: "2026-06-27T10:00:00.000Z",
    purpose: "enterprise_review",
    producer: "tracepilot",
    artifacts: requiredArtifacts,
    warnings: ["Provider rows are dry runs."]
  });

  const report = verifyEvidencePack({
    manifest,
    artifacts: requiredArtifacts.map((item) => ({ relativePath: item.relativePath, content: redactEvidenceText(item.content).text })),
    expectedManifestSha256: manifest.integrity.manifestSha256,
    generatedAt: "2026-06-27T10:01:00.000Z"
  });

  expect(report.decision).toBe("pass");
  expect(report.summary.errors).toBe(0);
  expect(report.summary.verifiedArtifacts).toBe(requiredArtifacts.length);
});
```

```ts
test("fails when artifacts are missing or tampered", () => {
  const manifest = buildEvidencePackManifest(...requiredArtifacts...);
  const report = verifyEvidencePack({
    manifest,
    artifacts: [
      { relativePath: requiredArtifacts[0].relativePath, content: "tampered" },
      ...requiredArtifacts.slice(2).map((item) => ({ relativePath: item.relativePath, content: redactEvidenceText(item.content).text }))
    ],
    requiredCategories: [],
    requiredSourceSuites: []
  });

  expect(report.decision).toBe("fail");
  expect(report.issues.map((issue) => issue.code)).toContain("artifact_hash_mismatch");
  expect(report.issues.map((issue) => issue.code)).toContain("artifact_missing");
});
```

```ts
test("fails when copied artifacts still contain provider secrets", () => {
  const leakedKey = "test-openai-key";
  const manifest = buildEvidencePackManifest(...requiredArtifacts...);
  const report = verifyEvidencePack({
    manifest,
    artifacts: requiredArtifacts.map((item, index) => ({
      relativePath: item.relativePath,
      content: index === 0 ? `{"OPENAI_API_KEY":"${leakedKey}"}` : redactEvidenceText(item.content).text
    })),
    requiredCategories: [],
    requiredSourceSuites: []
  });

  expect(report.decision).toBe("fail");
  expect(report.issues.map((issue) => issue.code)).toContain("secret_pattern_detected");
});
```

```ts
test("detects manifest digest mismatch and unmanifested artifacts", () => {
  const manifest = buildEvidencePackManifest(...requiredArtifacts...);
  const tamperedManifest = { ...manifest, producer: "attacker" };
  const report = verifyEvidencePack({
    manifest: tamperedManifest,
    artifacts: [
      ...requiredArtifacts.map((item) => ({ relativePath: item.relativePath, content: redactEvidenceText(item.content).text })),
      { relativePath: "extra/debug.txt", content: "not in manifest" }
    ],
    requiredCategories: [],
    requiredSourceSuites: []
  });

  expect(report.decision).toBe("fail");
  expect(report.issues.map((issue) => issue.code)).toContain("manifest_digest_mismatch");
  expect(report.issues.map((issue) => issue.code)).toContain("unmanifested_artifact");
});
```

```ts
test("renders a concise Markdown verification report", () => {
  const report = verifyEvidencePack(...intact pack...);
  const markdown = renderEvidencePackVerificationMarkdown(report);

  expect(markdown).toContain("# Enterprise Evidence Pack Verification");
  expect(markdown).toContain("Decision | pass");
  expect(markdown).toContain("artifact_hash_mismatch");
  expect(markdown).not.toContain("test-openai-key");
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/core test -- evidence-pack-verifier.test.ts
```

Expected: fail because `../src/evidence-pack-verifier.js` does not exist.

## Task 2: Core Verifier Implementation

**Files:**
- Create: `packages/core/src/evidence-pack-verifier.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/evidence-pack-verifier.test.ts`

- [ ] **Step 1: Implement verifier public API**

Add these exports:

```ts
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
```

Add:

```ts
export const defaultEnterpriseEvidencePackRequirements = {
  categories: ["cost_ledger", "diagnosis", "model_trace", "provider_scorecard", "readiness_gate", "reliability_scorecard", "report", "run_metrics"],
  sourceSuites: ["cost-ledger", "model-browser", "provider-scorecard", "readiness-gate", "reliability-scorecard"]
} as const;
```

Implement:

```ts
export function verifyEvidencePack(input: EvidencePackVerificationInput): EvidencePackVerificationReport;
export function renderEvidencePackVerificationMarkdown(report: EvidencePackVerificationReport): string;
```

- [ ] **Step 2: Implement digest, summary, and artifact checks**

Rules:
- `decision` is `fail` if any issue has severity `error`.
- Recompute `actualManifestSha256` from canonical JSON of the manifest without the `integrity` field.
- Error if `manifest.integrity.algorithm !== "sha256"`.
- Error if `actualManifestSha256 !== manifest.integrity.manifestSha256`.
- Error if `expectedManifestSha256` is provided and does not equal `manifest.integrity.manifestSha256`.
- Error if policy flags are not all `true`.
- Error on duplicate artifact ids or paths.
- Error if a manifest artifact is missing from provided artifacts.
- Error if copied artifact SHA-256 or byte count does not match manifest metadata.
- Warning if a provided artifact path is not listed in the manifest.
- Error if default required categories or source suites are absent, unless caller passes explicit empty arrays.
- Error if copied artifact text contains exact provider key field leaks, raw provider key patterns, or unredacted bearer tokens.

- [ ] **Step 3: Export from `packages/core/src/index.ts`**

Add function and type exports from `./evidence-pack-verifier.js`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
corepack pnpm@9.15.4 --filter @tracepilot/core test -- evidence-pack-verifier.test.ts
```

Expected: pass.

## Task 3: Eval Suite Red Tests

**Files:**
- Create: `evals/evidence-pack-verify-suite.test.ts`
- Create later: `evals/evidence-pack-verify-suite.ts`
- Modify later: `evals/run-evals.ts`
- Modify later: `evals/run-evals-cli.test.ts`

- [ ] **Step 1: Add failing eval suite test**

```ts
test("generates and verifies an enterprise evidence pack", async () => {
  const runsDir = await mkdtemp(join(tmpdir(), "tracepilot-evidence-pack-verify-"));
  const result = await runEvidencePackVerifySuite({
    runsDir,
    generatedAt: "2026-06-27T10:00:00.000Z"
  });

  expect(result.report.decision).toBe("pass");
  expect(result.report.summary.errors).toBe(0);
  expect(result.report.summary.verifiedArtifacts).toBe(14);
  expect(result.report.integrity.manifestMatches).toBe(true);

  const json = await readFile(result.artifacts.reportJsonPath, "utf8");
  const markdown = await readFile(result.artifacts.reportMarkdownPath, "utf8");
  expect(json).toContain("\"decision\": \"pass\"");
  expect(markdown).toContain("# Enterprise Evidence Pack Verification");
});
```

- [ ] **Step 2: Add failing CLI test**

In `evals/run-evals-cli.test.ts`, add:

```ts
test("runs the enterprise evidence-pack verifier suite without leaking provider keys", async () => {
  const { stdout } = await execFileAsync(
    "corepack",
    ["pnpm@9.15.4", "exec", "tsx", "evals/run-evals.ts", "--", "--suite", "evidence-pack-verify"],
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

  expect(stdout).toContain("evidence-pack-verify decision=pass");
  expect(stdout).toContain("errors=0");
  expect(stdout).toContain("report=");
  expect(stdout).not.toContain("test-openai-key");
  expect(stdout).not.toContain("test-anthropic-key");
});
```

- [ ] **Step 3: Verify RED**

Run:

```bash
corepack pnpm@9.15.4 exec vitest run evals/evidence-pack-verify-suite.test.ts evals/run-evals-cli.test.ts
```

Expected: fail because the suite module and CLI branch do not exist.

## Task 4: Eval Suite Implementation

**Files:**
- Create: `evals/evidence-pack-verify-suite.ts`
- Modify: `evals/run-evals.ts`
- Test: `evals/evidence-pack-verify-suite.test.ts`
- Test: `evals/run-evals-cli.test.ts`

- [ ] **Step 1: Implement file-system verifier suite**

`runEvidencePackVerifySuite` should:
- Remove and recreate `runsDir`.
- Call `runEvidencePackSuite({ runsDir: join(runsDir, "pack"), generatedAt })`.
- Recursively read every file under `pack/artifacts`.
- Call `verifyEvidencePack` with the generated manifest, copied artifact contents, `expectedManifestSha256`, and `generatedAt`.
- Write `enterprise-evidence-pack-verification.json`.
- Write `enterprise-evidence-pack-verification.md`.
- Return the structured report and artifact paths.

- [ ] **Step 2: Wire CLI**

In `evals/run-evals.ts`:
- Import `runEvidencePackVerifySuite`.
- Add `"evidence-pack-verify"` to the suite allow-list.
- Add an early branch that writes:

```text
evidence-pack-verify decision=<decision> artifacts=<verifiedArtifacts> errors=<errors> warnings=<warnings> report=<markdownPath>
```

- [ ] **Step 3: Verify GREEN**

Run:

```bash
corepack pnpm@9.15.4 exec vitest run evals/evidence-pack-verify-suite.test.ts evals/run-evals-cli.test.ts
```

Expected: pass.

## Task 5: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/results/first-report.md`
- Modify: `docs/video-walkthrough-script.md`

- [ ] **Step 1: Update README**

Add `corepack pnpm@9.15.4 run eval -- --suite evidence-pack-verify` near the evidence-pack command.

Add expected output:

```text
evidence-pack-verify decision=pass artifacts=14 errors=0 warnings=0 report=...
```

Explain that the verifier rejects missing artifacts, hash mismatches, manifest digest mismatches, missing enterprise evidence categories, and leaked provider credentials.

- [ ] **Step 2: Update first report**

Add a Current Results row for the verifier and a short section explaining the offline audit boundary.

- [ ] **Step 3: Update walkthrough**

Add the verifier command and mention how to show the generated Markdown report after the pack readout.

## Task 6: Full Verification and Finish

**Files:**
- All changed files.

- [ ] **Step 1: Run focused core tests**

```bash
corepack pnpm@9.15.4 --filter @tracepilot/core test -- evidence-pack-verifier.test.ts evidence-pack.test.ts
```

- [ ] **Step 2: Run focused eval tests**

```bash
corepack pnpm@9.15.4 exec vitest run evals/evidence-pack-verify-suite.test.ts evals/evidence-pack-suite.test.ts evals/run-evals-cli.test.ts
```

- [ ] **Step 3: Run typecheck**

```bash
corepack pnpm@9.15.4 run typecheck
```

- [ ] **Step 4: Run full tests**

```bash
corepack pnpm@9.15.4 run test
```

- [ ] **Step 5: Run build**

```bash
corepack pnpm@9.15.4 run build
```

Restore `apps/studio/next-env.d.ts` if Next rewrites the route import.

- [ ] **Step 6: Run CI**

```bash
corepack pnpm@9.15.4 run ci
```

- [ ] **Step 7: Run manual verifier suite**

```bash
corepack pnpm@9.15.4 run eval -- --suite evidence-pack-verify
```

- [ ] **Step 8: Inspect generated verification report**

```bash
node -e 'const r=require("./runs/latest/evidence-pack-verify/enterprise-evidence-pack-verification.json"); console.log(JSON.stringify({decision:r.decision, errors:r.summary.errors, warnings:r.summary.warnings, artifacts:r.summary.verifiedArtifacts}, null, 2))'
```

- [ ] **Step 9: Run secret scans and diff hygiene**

```bash
rg -n '<provider-key-patterns>' README.md SECURITY.md docs apps evals packages -g '!docs/superpowers/plans/**'
git diff --check
git diff --cached --check
```

- [ ] **Step 10: Commit, push, PR, checks, merge, cleanup**

Use:

```bash
git add <changed files>
git commit -m "feat: verify enterprise evidence packs"
git push -u origin feat/evidence-pack-verifier
gh pr create --base main --head feat/evidence-pack-verifier --title "Verify enterprise evidence packs" --body "<summary and verification>"
gh pr checks <number> --watch --interval 10
gh pr merge <number> --merge --delete-branch
```

Then fast-forward `main`, remove `.worktrees/evidence-pack-verifier`, prune worktrees, and delete any remaining feature branch refs.

## Self-Review

- Spec coverage: the plan covers pure core verification, file-system eval verification, CLI access, docs, manual report inspection, and PR completion.
- Placeholder scan: no implementation step depends on an unspecified future behavior; command and output shapes are concrete.
- Type consistency: `verifyEvidencePack`, `renderEvidencePackVerificationMarkdown`, `EvidencePackVerificationReport`, and `runEvidencePackVerifySuite` names are consistent across tasks.
