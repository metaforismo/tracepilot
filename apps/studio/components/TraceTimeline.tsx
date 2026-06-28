import Link from "next/link";
import type { TraceStep } from "@tracepilot/core";
import { formatUsd } from "../lib/format";

export function TraceTimeline({ runId, steps, selectedStep }: { runId: string; steps: TraceStep[]; selectedStep: TraceStep }) {
  return (
    <section className="panel" aria-label="Trace timeline">
      <div className="panelHeader">
        <h2>Trace timeline</h2>
        <span className="meta">{steps.length} steps</span>
      </div>
      <div className="timeline" role="list">
        {steps.map((step) => (
          <Link
            aria-current={step.stepIndex === selectedStep.stepIndex ? "step" : undefined}
            className={`timelineRow ${step.stepIndex === selectedStep.stepIndex ? "active" : ""}`}
            href={`/runs/${runId}?step=${step.stepIndex}`}
            key={step.stepIndex}
            role="listitem"
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