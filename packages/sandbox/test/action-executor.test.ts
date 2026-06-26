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
});

