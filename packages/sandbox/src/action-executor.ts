import type { Page } from "playwright";
import type { AgentAction, VerifierResult } from "@tracepilot/core";

export type ActionExecutionResult = {
  ok: boolean;
  verifier: VerifierResult;
};

export async function executeAction(page: Page, action: AgentAction): Promise<ActionExecutionResult> {
  try {
    await performAction(page, action);
    return {
      ok: true,
      verifier: successFor(action)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      verifier: {
        status: "failure",
        reason: `Playwright action failed: ${message}`
      }
    };
  }
}

async function performAction(page: Page, action: AgentAction): Promise<void> {
  switch (action.kind) {
    case "click":
      await page.mouse.click(action.x, action.y);
      return;
    case "type":
      await page.keyboard.type(action.text);
      return;
    case "press":
      await page.keyboard.press(action.key);
      return;
    case "scroll":
      await page.mouse.wheel(action.deltaX, action.deltaY);
      return;
    case "wait":
      await page.waitForTimeout(action.ms);
      return;
    case "uploadFile":
      await uploadToFocusedInput(page, action.path);
      return;
    case "finish":
    case "requestHumanApproval":
      return;
  }
}

async function uploadToFocusedInput(page: Page, path: string): Promise<void> {
  const handle = await page.evaluateHandle(() => document.activeElement);
  const element = handle.asElement();
  if (!element) {
    throw new Error("No focused element is available for uploadFile.");
  }

  await element.setInputFiles(path);
}

function successFor(action: AgentAction): VerifierResult {
  if (action.kind === "requestHumanApproval") {
    return { status: "needs_human", reason: action.reason };
  }

  if (action.kind === "finish") {
    return { status: "progress", reason: "Finish action recorded without browser mutation." };
  }

  return { status: "progress", reason: `${action.kind} action executed.` };
}

