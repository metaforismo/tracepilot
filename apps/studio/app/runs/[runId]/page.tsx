import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { MetricsStrip } from "../../../components/MetricsStrip";
import { ModelEvidencePanel } from "../../../components/ModelEvidencePanel";
import { ScreenshotPanel } from "../../../components/ScreenshotPanel";
import { StepNavigator } from "../../../components/StepNavigator";
import { StudioShell } from "../../../components/StudioShell";
import { TraceTimeline } from "../../../components/TraceTimeline";
import { loadRun, selectStep } from "../../../lib/trace-fixtures";

type PageProps = {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ step?: string }>;
};

export default async function RunPage({ params, searchParams }: PageProps) {
  const [{ runId }, query] = await Promise.all([params, searchParams]);
  const run = await loadRun(runId);
  const selectedStep = selectStep(run.steps, query.step);

  return (
    <StudioShell
      icon={<CheckCircle2 size={18} />}
      subtitle={run.title}
      sidebar={
        <>
          <span className="sectionLabel">Evidence</span>
          <div className="taskItem">
            <strong>{run.metrics.totalCostUsd > 0 ? "Model API trace" : "Replay fixture"}</strong>
            <small>
              {run.metrics.totalCostUsd > 0
                ? "Provider metadata and verifier evidence."
                : "Deterministic replay with verifier evidence."}
            </small>
            <span className={`status ${run.metrics.totalCostUsd > 0 ? "warn" : "pass"}`}>
              {run.metrics.totalCostUsd > 0 ? "paid" : "local"}
            </span>
          </div>

          <span className="sectionLabel">Selected</span>
          <div className="taskItem">
            <strong>Step #{selectedStep.stepIndex}</strong>
            <small>{selectedStep.decision.action.kind}</small>
            <span className={`status ${selectedStep.verifier.status}`}>{selectedStep.verifier.status}</span>
          </div>

          <span className="sectionLabel">All steps</span>
          <div className="taskList">
            {run.steps.map((step) => (
              <Link
                className={`taskItem${step.stepIndex === selectedStep.stepIndex ? " taskItem--active" : ""}`}
                href={`/runs/${run.id}?step=${step.stepIndex}`}
                key={step.stepIndex}
              >
                <strong>Step #{step.stepIndex}</strong>
                <small>{step.decision.action.kind}</small>
                <span className={`status ${step.verifier.status}`}>{step.verifier.status}</span>
              </Link>
            ))}
          </div>
        </>
      }
    >
      <div className="topbar">
        <div>
          <h1>{run.title}</h1>
          <p>{selectedStep.observation.title} · {selectedStep.observation.url}</p>
        </div>
        <StepNavigator runId={run.id} stepCount={run.steps.length} stepIndex={selectedStep.stepIndex} />
      </div>

      <MetricsStrip metrics={run.metrics} />

      <div className="workbench">
        <div className="panelStack">
          <ScreenshotPanel step={selectedStep} />
          <TraceTimeline runId={run.id} steps={run.steps} selectedStep={selectedStep} />
        </div>

        <div className="panelStack">
          <ModelEvidencePanel metrics={run.metrics} selectedStep={selectedStep} steps={run.steps} />

          <section className="panel" aria-label="Step inspector">
            <div className="panelHeader">
              <h2>Inspector</h2>
              <span className="meta">{selectedStep.latencyMs}ms</span>
            </div>
            <div className="inspector">
              <div className="detailBlock">
                <h3>Action</h3>
                <pre className="codeBlock">{JSON.stringify(selectedStep.decision.action, null, 2)}</pre>
              </div>
              <div className="detailBlock">
                <h3>Reasoning</h3>
                <p>{selectedStep.decision.reasoning}</p>
              </div>
              <div className="detailBlock">
                <h3>Verifier</h3>
                <p>{selectedStep.verifier.reason}</p>
              </div>
              {selectedStep.verifier.suggestedRecovery ? (
                <div className="detailBlock">
                  <h3>Recovery</h3>
                  <p>{selectedStep.verifier.suggestedRecovery}</p>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </StudioShell>
  );
}