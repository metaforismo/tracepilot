import { describe, expect, it } from "vitest";
import { verifyActionEffect } from "../src/verifier.js";
import type { Observation } from "../src/types.js";

const baseObservation: Observation = {
  stepId: "before",
  screenshotPath: "before.png",
  url: "http://localhost/form",
  title: "Form",
  viewport: { width: 1280, height: 720 },
  capturedAt: "2026-06-26T00:00:00.000Z",
  domText: "Invoice form"
};

describe("verifyActionEffect", () => {
  it("marks URL changes as progress", () => {
    const result = verifyActionEffect({
      before: baseObservation,
      after: { ...baseObservation, stepId: "after", url: "http://localhost/done" },
      action: { kind: "click", x: 100, y: 120 }
    });

    expect(result.status).toBe("progress");
    expect(result.reason).toContain("URL changed");
  });

  it("marks visible text changes as progress", () => {
    const result = verifyActionEffect({
      before: baseObservation,
      after: { ...baseObservation, stepId: "after", domText: "Invoice saved" },
      action: { kind: "type", text: "Acme Labs" }
    });

    expect(result.status).toBe("progress");
  });

  it("blocks false completion when expected state is missing", () => {
    const result = verifyActionEffect({
      before: baseObservation,
      after: baseObservation,
      action: { kind: "finish", summary: "Done" },
      expectedState: "confirmation saved"
    });

    expect(result.status).toBe("failure");
    expect(result.reason).toContain("confirmation saved");
  });

  it("allows finish when expected state is present", () => {
    const result = verifyActionEffect({
      before: baseObservation,
      after: { ...baseObservation, domText: "Confirmation saved for Acme Labs" },
      action: { kind: "finish", summary: "Done" },
      expectedState: "confirmation saved"
    });

    expect(result.status).toBe("success");
  });

  it("allows descriptive finish evidence when all quoted fragments are present", () => {
    const result = verifyActionEffect({
      before: baseObservation,
      after: {
        ...baseObservation,
        title: "Portal Receipt Saved",
        domText:
          "Portal receipt saved\nVendor\nAcme Labs\nAmount\n1200\nDate\n2026-06-26\nIBAN\nIT60X0542811101000000123456"
      },
      action: { kind: "finish", summary: "Done" },
      expectedState:
        "Visible page shows 'Portal receipt saved' with Vendor 'Acme Labs', Amount '1200', Date '2026-06-26', and IBAN 'IT60X0542811101000000123456'."
    });

    expect(result.status).toBe("success");
  });
});
