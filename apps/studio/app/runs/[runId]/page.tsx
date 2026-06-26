import Link from "next/link";
import { ArrowLeft, CheckCircle2, RotateCcw } from "lucide-react";
import { MetricsStrip } from "../../../components/MetricsStrip";
import { ScreenshotPanel } from "../../../components/ScreenshotPanel";
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
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark"><CheckCircle2 size={18} /></div>
          <div className="brandText">
            <strong>TracePilot Studio</strong>
            <span>{run.title}</span>
          </div>
        </div>

        <Link className="ghostButton" href="/">
          <ArrowLeft size={15} />
          Runs
        </Link>

        <span className="sectionLabel">Mode</span>
        <div className="modeSwitch" aria-label="Agent mode">
          <span>Baseline</span>
          <span className="active">TracePilot</span>
        </div>

        <span className="sectionLabel">Selected</span>
        <div className="taskItem">
          <strong>Step #{selectedStep.stepIndex}</strong>
          <small>{selectedStep.decision.action.kind}</small>
          <span className={`status ${selectedStep.verifier.status}`}>{selectedStep.verifier.status}</span>
        </div>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <h1>{run.title}</h1>
            <p>{selectedStep.observation.title} · {selectedStep.observation.url}</p>
          </div>
          <Link className="ghostButton" href={`/runs/${run.id}`}>
            <RotateCcw size={15} />
            Latest step
          </Link>
        </div>

        <MetricsStrip metrics={run.metrics} />

        <div className="workbench">
          <div className="panelStack">
            <ScreenshotPanel step={selectedStep} />
            <TraceTimeline runId={run.id} steps={run.steps} selectedStep={selectedStep} />
          </div>

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
      </section>
    </main>
  );
}

