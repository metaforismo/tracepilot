import type { TaskSpec } from "../../packages/core/src/types.js";

export function createSmokeFormTask(origin: string): TaskSpec {
  return {
    id: "smoke-form",
    title: "Submit a simple vendor form",
    instruction: "Enter vendor Acme Labs with invoice amount 1200 and submit the form.",
    startUrl: `${origin}/smoke-form`,
    maxSteps: 8
  };
}

export function evaluateSmokeForm(html: string): boolean {
  return html.includes("Invoice saved") && html.includes("Acme Labs") && html.includes("1200");
}

