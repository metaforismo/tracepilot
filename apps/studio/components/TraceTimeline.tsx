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
            <span>{step.verifier.reason}</span>
            <span className={`status ${step.verifier.status}`}>{step.verifier.status}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

