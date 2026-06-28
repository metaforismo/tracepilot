import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTraceStore } from "../../core/src/trace-store.js";
import { startTargetServer, type TargetServer } from "../../../apps/targets/src/server.js";
import { BrowserSandbox } from "../src/browser-sandbox.js";
import { executeAction } from "../src/action-executor.js";

let target: TargetServer | undefined;
let sandbox: BrowserSandbox | undefined;

afterEach(async () => {
  await sandbox?.close();
  await target?.close();
  sandbox = undefined;
  target = undefined;
});

describe("BrowserSandbox and executeAction", () => {
  it("fills the smoke form through browser actions and captures observations", async () => {
    target = await startTargetServer();
    const root = await mkdtemp(join(tmpdir(), "tracepilot-sandbox-"));
    const traceStore = await createTraceStore(root, "sandbox-smoke");

    sandbox = await BrowserSandbox.launch({
      task: {
        id: "smoke-form",
        title: "Smoke form",
        instruction: "Fill the vendor field.",
        startUrl: `${target.origin}/smoke-form`,
        maxSteps: 4
      },
      traceStore
    });

    const vendorBox = await sandbox.page.locator("#vendor").boundingBox();
    expect(vendorBox).not.toBeNull();

    const click = await executeAction(sandbox.page, {
      kind: "click",
      x: vendorBox!.x + vendorBox!.width / 2,
      y: vendorBox!.y + vendorBox!.height / 2
    });
    expect(click.ok).toBe(true);

    const type = await executeAction(sandbox.page, { kind: "type", text: "Acme Labs" });
    expect(type.ok).toBe(true);

    const observation = await sandbox.observe("after-type");
    expect(observation.domText).toContain("vendor: Acme Labs");
    await expect(stat(observation.screenshotPath)).resolves.toMatchObject({ size: expect.any(Number) });
  });

  it("converts unsupported focused upload targets into verifier failures", async () => {
    target = await startTargetServer();
    const root = await mkdtemp(join(tmpdir(), "tracepilot-sandbox-"));
    const traceStore = await createTraceStore(root, "sandbox-upload");

    sandbox = await BrowserSandbox.launch({
      task: {
        id: "smoke-form",
        title: "Smoke form",
        instruction: "Try an unsupported upload.",
        startUrl: `${target.origin}/smoke-form`,
        maxSteps: 4
      },
      traceStore
    });

    const result = await executeAction(sandbox.page, { kind: "uploadFile", path: "/tmp/missing.txt" });

    expect(result.ok).toBe(false);
    expect(result.verifier.status).toBe("failure");
    expect(result.verifier.reason).toContain("Playwright action failed");
  });

  it("normalizes common modifier key aliases from model output", async () => {
    target = await startTargetServer();
    const root = await mkdtemp(join(tmpdir(), "tracepilot-sandbox-"));
    const traceStore = await createTraceStore(root, "sandbox-key-alias");

    sandbox = await BrowserSandbox.launch({
      task: {
        id: "smoke-form",
        title: "Smoke form",
        instruction: "Select text using a model-style shortcut.",
        startUrl: `${target.origin}/smoke-form`,
        maxSteps: 4
      },
      traceStore
    });

    const vendor = sandbox.page.locator("#vendor");
    await vendor.click();
    await vendor.fill("Acme Labs");
    const result = await executeAction(sandbox.page, { kind: "press", key: "Ctrl+A" });
    await sandbox.page.keyboard.type("Contoso Research");

    await expect(vendor.inputValue()).resolves.toBe("Contoso Research");
    expect(result.ok).toBe(true);
  });

  it("passes multi-click counts through to Playwright", async () => {
    target = await startTargetServer();
    const root = await mkdtemp(join(tmpdir(), "tracepilot-sandbox-"));
    const traceStore = await createTraceStore(root, "sandbox-multi-click");

    sandbox = await BrowserSandbox.launch({
      task: {
        id: "smoke-form",
        title: "Smoke form",
        instruction: "Select text using a native multi-click action.",
        startUrl: `${target.origin}/smoke-form`,
        maxSteps: 4
      },
      traceStore
    });

    const vendor = sandbox.page.locator("#vendor");
    await vendor.fill("Acme Labs");
    const vendorBox = await vendor.boundingBox();
    expect(vendorBox).not.toBeNull();

    const result = await executeAction(sandbox.page, {
      kind: "click",
      x: vendorBox!.x + vendorBox!.width / 2,
      y: vendorBox!.y + vendorBox!.height / 2,
      clickCount: 3
    });

    const selection = await vendor.evaluate((element) => {
      const input = element as HTMLInputElement;
      return { start: input.selectionStart, end: input.selectionEnd };
    });
    expect(result.ok).toBe(true);
    expect(selection).toEqual({ start: 0, end: "Acme Labs".length });
  });

  it("treats tab-separated model typing as field navigation", async () => {
    target = await startTargetServer();
    const root = await mkdtemp(join(tmpdir(), "tracepilot-sandbox-"));
    const traceStore = await createTraceStore(root, "sandbox-tab-type");

    sandbox = await BrowserSandbox.launch({
      task: {
        id: "legacy-portal",
        title: "Legacy portal",
        instruction: "Fill the invoice form using a model-emitted tab-separated type action.",
        startUrl: `${target.origin}/legacy-portal`,
        maxSteps: 4
      },
      traceStore
    });

    await sandbox.page.locator("#vendor").click();
    const result = await executeAction(sandbox.page, {
      kind: "type",
      text: "Acme Labs\t1200\t2026-06-26\tIT60X0542811101000000123456"
    });

    await expect(sandbox.page.locator("#vendor").inputValue()).resolves.toBe("Acme Labs");
    await expect(sandbox.page.locator("#amount").inputValue()).resolves.toBe("1200");
    await expect(sandbox.page.locator("#date").inputValue()).resolves.toBe("2026-06-26");
    await expect(sandbox.page.locator("#iban").inputValue()).resolves.toBe("IT60X0542811101000000123456");
    expect(result.ok).toBe(true);
  });
});
