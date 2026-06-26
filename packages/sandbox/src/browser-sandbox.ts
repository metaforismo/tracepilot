import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Observation, TaskSpec, TraceStore } from "@tracepilot/core";

export type BrowserSandboxOptions = {
  task: TaskSpec;
  traceStore: Pick<TraceStore, "screenshotsDir">;
  headless?: boolean;
};

export class BrowserSandbox {
  readonly page: Page;

  private readonly browser: Browser;
  private readonly context: BrowserContext;
  private readonly traceStore: Pick<TraceStore, "screenshotsDir">;

  private constructor(params: {
    browser: Browser;
    context: BrowserContext;
    page: Page;
    traceStore: Pick<TraceStore, "screenshotsDir">;
  }) {
    this.browser = params.browser;
    this.context = params.context;
    this.page = params.page;
    this.traceStore = params.traceStore;
  }

  static async launch(options: BrowserSandboxOptions): Promise<BrowserSandbox> {
    const browser = await chromium.launch({ headless: options.headless ?? true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(options.task.startUrl, { waitUntil: "domcontentloaded" });

    return new BrowserSandbox({
      browser,
      context,
      page,
      traceStore: options.traceStore
    });
  }

  async observe(stepId: string): Promise<Observation> {
    const screenshotPath = join(this.traceStore.screenshotsDir, `${sanitizeStepId(stepId)}.png`);
    await this.page.screenshot({ path: screenshotPath, fullPage: true });

    const [title, domText] = await Promise.all([this.page.title(), extractPageText(this.page)]);
    const viewport = this.page.viewportSize() ?? { width: 1280, height: 720 };

    return {
      stepId,
      screenshotPath,
      url: this.page.url(),
      title,
      viewport,
      capturedAt: new Date().toISOString(),
      domText
    };
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }
}

async function extractPageText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const bodyText = document.body.innerText;
    const fieldValues = Array.from(document.querySelectorAll("input, textarea, select"))
      .map((element) => {
        const named = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const label = named.getAttribute("aria-label") ?? named.getAttribute("name") ?? named.id ?? named.tagName;
        return `${label}: ${named.value}`;
      })
      .filter((value) => !value.endsWith(": "));

    return [bodyText, ...fieldValues].filter(Boolean).join("\n");
  });
}

function sanitizeStepId(stepId: string): string {
  return stepId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

