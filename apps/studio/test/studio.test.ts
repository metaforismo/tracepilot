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
  });

  it("renders the trace replay surface", async () => {
    await page!.goto(`${origin}/runs/smoke-form`, { waitUntil: "networkidle" });

    await expectText("Trace timeline");
    await expectText("Inspector");
    await expectText("Deterministic evaluator found expected success state.");
    await expect(page!.locator("img[alt='Observation step-1']").count()).resolves.toBe(1);
  });
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

