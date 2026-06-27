import Link from "next/link";
import type { TraceStep } from "@tracepilot/core";

export function TraceTimeline({ runId, steps, selectedStep }: { runId: string; steps: TraceStep[]; selectedStep: TraceStep }) {
  return (
    <section className="panel" aria-label="Trace timeline">
      <div className="panelHeader">
        <h2>Trace timeline</h2>
        <span className="meta">{steps.length} steps</span>
      </div>
      <div className="timeline">
        {steps.map((step) => (
          <Link
            className={`timelineRow ${step.stepIndex === selectedStep.stepIndex ? "active" : ""}`}
            href={`/runs/${runId}?step=${step.stepIndex}`}
            key={step.stepIndex}
          >
            <span className="mono">#{step.stepIndex}</span>
            <span>{step.decision.action.kind}</span>
            <span className="timelineReason">
              <span>{step.verifier.reason}</span>
              <span className="timelineBadges" aria-label={`Step ${step.stepIndex} evidence`}>
                {step.decision.modelRun ? <span className="stepBadge">model_api</span> : null}
                {step.tokenCostUsd !== undefined ? <span className="stepBadge">{formatUsd(step.tokenCostUsd)}</span> : null}
                {isDriverDecisionFailure(step) ? <span className="stepBadge failure">driver failure</span> : null}
              </span>
            </span>
            <span className={`status ${step.verifier.status}`}>{step.verifier.status}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function isDriverDecisionFailure(step: TraceStep): boolean {
  return step.decision.reasoning.startsWith("Driver decision failed:");
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 6,
    minimumFractionDigits: 6,
    style: "currency"
  }).format(value);
}
