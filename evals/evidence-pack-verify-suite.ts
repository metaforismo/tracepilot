import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  renderEvidencePackVerificationMarkdown,
  verifyEvidencePack,
  type EvidencePackArtifactContent,
  type EvidencePackVerificationReport
} from "../packages/core/src/evidence-pack-verifier.js";
import { runEvidencePackSuite } from "./evidence-pack-suite.js";

export type EvidencePackVerifySuiteOptions = {
  runsDir: string;
  generatedAt?: string;
};

export type EvidencePackVerifySuiteResult = {
  report: EvidencePackVerificationReport;
  artifacts: {
    packDir: string;
    artifactsDir: string;
    reportJsonPath: string;
    reportMarkdownPath: string;
  };
};

export async function runEvidencePackVerifySuite(
  options: EvidencePackVerifySuiteOptions
): Promise<EvidencePackVerifySuiteResult> {
  await rm(options.runsDir, { recursive: true, force: true });
  await mkdir(options.runsDir, { recursive: true });

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const packDir = join(options.runsDir, "pack");
  const pack = await runEvidencePackSuite({ runsDir: packDir, generatedAt });
  const artifactContents = await readArtifactContents(pack.artifacts.artifactsDir);
  const report = verifyEvidencePack({
    manifest: pack.manifest,
    artifacts: artifactContents,
    expectedManifestSha256: pack.manifest.integrity.manifestSha256,
    generatedAt
  });

  const reportJsonPath = join(options.runsDir, "enterprise-evidence-pack-verification.json");
  const reportMarkdownPath = join(options.runsDir, "enterprise-evidence-pack-verification.md");
  await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(reportMarkdownPath, renderEvidencePackVerificationMarkdown(report), "utf8");

  return {
    report,
    artifacts: {
      packDir,
      artifactsDir: pack.artifacts.artifactsDir,
      reportJsonPath,
      reportMarkdownPath
    }
  };
}

async function readArtifactContents(rootDir: string): Promise<EvidencePackArtifactContent[]> {
  const files = await readFilesRecursively(rootDir);
  return Promise.all(
    files.map(async (filePath) => ({
      relativePath: relative(rootDir, filePath).replaceAll("\\", "/"),
      content: await readFile(filePath, "utf8")
    }))
  ).then((artifacts) => artifacts.sort((left, right) => left.relativePath.localeCompare(right.relativePath)));
}

async function readFilesRecursively(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        return readFilesRecursively(entryPath);
      }
      if (entry.isFile()) {
        return [entryPath];
      }
      return [];
    })
  );
  return nested.flat().sort((left, right) => left.localeCompare(right));
}
