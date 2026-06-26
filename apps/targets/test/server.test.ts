import { afterEach, describe, expect, it } from "vitest";
import { startTargetServer, type TargetServer } from "../src/server.js";

let target: TargetServer | undefined;

afterEach(async () => {
  await target?.close();
  target = undefined;
});

describe("target server", () => {
  it("serves the smoke form", async () => {
    target = await startTargetServer();

    const response = await fetch(`${target.origin}/smoke-form`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Vendor Invoice Intake");
  });

  it("returns a validation error when required fields are missing", async () => {
    target = await startTargetServer();

    const response = await fetch(`${target.origin}/smoke-form`, {
      method: "POST",
      body: new URLSearchParams({ vendor: "", amount: "1200" }),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).toContain("Vendor and amount are required.");
  });

  it("redirects valid submissions to a success page", async () => {
    target = await startTargetServer();

    const response = await fetch(`${target.origin}/smoke-form`, {
      method: "POST",
      body: new URLSearchParams({ vendor: "Acme Labs", amount: "1200" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      redirect: "manual"
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/success?vendor=Acme%20Labs&amount=1200");

    const success = await fetch(`${target.origin}${response.headers.get("location")}`);
    const html = await success.text();

    expect(html).toContain("Invoice saved");
    expect(html).toContain("Acme Labs");
  });

  it("serves invoice fixtures", async () => {
    target = await startTargetServer();

    const response = await fetch(`${target.origin}/invoice/acme-1200`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Acme Labs");
    expect(html).toContain("IT60X0542811101000000123456");
  });

  it("validates and saves legacy portal submissions", async () => {
    target = await startTargetServer();

    const invalid = await fetch(`${target.origin}/legacy-portal`, {
      method: "POST",
      body: new URLSearchParams({ vendor: "Acme Labs", amount: "1200", date: "2026-06-26", iban: "" }),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.text()).resolves.toContain("Vendor, amount, date, and IBAN are required.");

    const valid = await fetch(`${target.origin}/legacy-portal`, {
      method: "POST",
      body: new URLSearchParams({
        vendor: "Acme Labs",
        amount: "1200",
        date: "2026-06-26",
        iban: "IT60X0542811101000000123456"
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      redirect: "manual"
    });

    expect(valid.status).toBe(303);
    const success = await fetch(`${target.origin}${valid.headers.get("location")}`);
    await expect(success.text()).resolves.toContain("Portal receipt saved");
  });
});
