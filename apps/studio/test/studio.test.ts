import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

let server: ChildProcessWithoutNullStreams | undefined;
let browser: Browser | undefined;
let page: Page | undefined;
let origin = "";

beforeAll(async () => {
  const port = await getFreePort();
  origin = `http://127.0.0.1:${port}`;
  server = spawn("corepack", ["pnpm@9.15.4", "exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }
  });

  await waitForHttp(origin);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
}, 45000);

afterAll(async () => {
  await page?.close();
  await browser?.close();
  server?.kill("SIGTERM");
});

describe("TracePilot Studio", () => {
  it("renders the run launcher", async () => {
    await page!.goto(origin, { waitUntil: "networkidle" });

    await expectText("TracePilot Studio");
    await expectText("Run launcher");
    await expectText("Open trace");
    await expectText("Readiness gate");
    await expectText("Provider scorecard");
    await expectText("Reliability scorecard");
    await expectText("Model browser negative run");
  }, 15000);

  it("renders the trace replay surface", async () => {
    await page!.goto(`${origin}/runs/smoke-form`, { waitUntil: "networkidle" });

    await expectText("Trace timeline");
    await expectText("Inspector");
    await expectText("Deterministic evaluator found expected success state.");
    await expect(page!.locator("img[alt='Observation step-1']").count()).resolves.toBe(1);
  }, 15000);

  it("renders model API evidence for a failed browser-control run", async () => {
    await page!.goto(`${origin}/runs/model-browser-negative`, { waitUntil: "networkidle" });

    await expectText("Model API evidence");
    await expectText("gpt-5.4-nano");
    await expectText("model_api");
    await expectText("Total model cost");
    await expectText("$0.010408");
    await expectText("Budget exceeded");
    await expectText("Driver decision failed");
    await expectText("OpenAI Responses output did not contain a JSON decision object.");

    await page!.getByRole("link", { name: /#1/ }).click();
    await page!.waitForURL(`${origin}/runs/model-browser-negative?step=1`);
    expect(page!.url()).toBe(`${origin}/runs/model-browser-negative?step=1`);
    await expectText("Selected model decision");
    await expectText("Input tokens");
    await expectText("4,210");
    await expectText("Reasoning tokens");
    await expectText("42");
  }, 15000);

  it("renders the failure diagnostics surface", async () => {
    await page!.goto(`${origin}/diagnostics`, { waitUntil: "networkidle" });

    await expectText("Failure diagnostics");
    await expectText("model-behavior hypotheses");
    await expectText("false-completion-before-receipt");
    await expectText("false_completion");
    await expectText("post_training_data");
  }, 15000);

  it("renders the readiness gate dashboard", async () => {
    await page!.goto(`${origin}/readiness`, { waitUntil: "networkidle" });

    await expectText("Readiness gate");
    await expectText("Decision");
    await expectText("Reliability evidence");
    await expectText("Provider evidence");
    await expectText("provider");
    await expectText("Rule outcomes");
  }, 15000);

  it("renders the provider scorecard drilldown", async () => {
    await page!.goto(`${origin}/scorecards/provider`, { waitUntil: "networkidle" });

    await expectText("Provider scorecard");
    await expectText("planned runs");
    await expectText("executed runs");
    await expectText("Anthropic");
    await expectText("success rate");
    await expectText("paid calls");
    await expectText("legacy-portal");
    await expectText("prompt-injection");
  }, 15000);

  it("renders the reliability scorecard drilldown", async () => {
    await page!.goto(`${origin}/scorecards/reliability`, { waitUntil: "networkidle" });

    await expectText("Reliability scorecard");
    await expectText("happy-path-portal-entry");
    await expectText("validation-recovery-after-missing-date");
    await expectText("prompt-injection-in-untrusted-invoice");
    await expectText("success rate");
  }, 15000);
});

async function expectText(text: string): Promise<void> {
  await expect(page!.getByText(text).first().isVisible()).resolves.toBe(true);
}

async function waitForHttp(url: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Could not allocate a TCP port.");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  return address.port;
}
