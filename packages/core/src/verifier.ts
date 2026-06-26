import type { AgentAction, Observation, VerifierResult } from "./types.js";

export function verifyActionEffect(params: {
  before: Observation;
  after: Observation;
  action: AgentAction;
  expectedState?: string;
}): VerifierResult {
  const { before, after, action, expectedState } = params;

  if (action.kind === "finish") {
    const text = `${after.title}\n${after.domText ?? ""}`.toLowerCase();
    const expected = expectedState?.toLowerCase();
    if (expected && !text.includes(expected)) {
      return {
        status: "failure",
        reason: `Agent finished before expected state appeared: ${expectedState}`,
        suggestedRecovery: "Continue observing and complete the missing state before finishing."
      };
    }
    return { status: "success", reason: "Finish action matched verifier evidence." };
  }

  if (before.url !== after.url) {
    return { status: "progress", reason: "URL changed after action." };
  }

  if ((before.domText ?? "") !== (after.domText ?? "")) {
    return { status: "progress", reason: "Visible page text changed after action." };
  }

  if (action.kind === "wait") {
    return { status: "uncertain", reason: "Wait action completed without observable progress." };
  }

  return {
    status: "uncertain",
    reason: "Action completed but verifier did not observe state change.",
    suggestedRecovery: "Capture a fresh observation and try an alternate action."
  };
}

