import type { AgentAction, TraceStep } from "./types.js";

function actionSignature(action: AgentAction): string {
  if (action.kind === "click") return `click:${Math.round(action.x / 10)}:${Math.round(action.y / 10)}`;
  if (action.kind === "type") return `type:${action.text}`;
  if (action.kind === "press") return `press:${action.key}`;
  if (action.kind === "scroll") return `scroll:${Math.sign(action.deltaY)}:${Math.sign(action.deltaX)}`;
  if (action.kind === "wait") return "wait";
  return action.kind;
}

export function isStuckLoop(steps: TraceStep[], windowSize = 4): boolean {
  if (steps.length < windowSize) return false;

  const recent = steps.slice(-windowSize);
  const signatures = recent.map((step) => actionSignature(step.decision.action));
  const noProgress = recent.every(
    (step) => step.verifier.status === "uncertain" || step.verifier.status === "failure"
  );

  return noProgress && new Set(signatures).size <= 2;
}

