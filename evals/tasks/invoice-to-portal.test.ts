import { describe, expect, test } from "vitest";
import { createPortalTask } from "./invoice-to-portal.js";

describe("createPortalTask", () => {
  test("includes the invoice fields a model driver needs to complete the workflow", () => {
    const task = createPortalTask("http://127.0.0.1:3000");

    expect(task.instruction).toContain("Vendor: Acme Labs");
    expect(task.instruction).toContain("Amount: 1200");
    expect(task.instruction).toContain("Invoice date: 2026-06-26");
    expect(task.instruction).toContain("IBAN: IT60X0542811101000000123456");
  });

  test("allows extra steps for model-driven recovery attempts", () => {
    const task = createPortalTask("http://127.0.0.1:3000");

    expect(task.maxSteps).toBeGreaterThanOrEqual(18);
  });
});
