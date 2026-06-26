import Link from "next/link";
import { Activity, ArrowLeft, TriangleAlert } from "lucide-react";
import { loadFailureDiagnosis } from "../../lib/diagnostic-fixtures";

export default async function DiagnosticsPage() {
  const report = await loadFailureDiagnosis();
  const critical = report.diagnoses.filter((diagnosis) => diagnosis.severity === "critical");

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark"><TriangleAlert size={18} /></div>
          <div className="brandText">
            <strong>TracePilot Studio</strong>
            <span>Failure diagnosis</span>
          </div>
        </div>

        <Link className="ghostButton" href="/">
          <ArrowLeft size={15} />
          Runs
        </Link>

        <span className="sectionLabel">Suite</span>
        <div className="taskItem">
          <strong>{report.suiteId}</strong>
          <small>{new Date(report.generatedAt).toISOString()}</small>
          <span className={`status ${report.summary.highestSeverity}`}>{report.summary.highestSeverity}</span>
        </div>

        <span className="sectionLabel">Critical</span>
        <div className="taskList">
          {critical.map((diagnosis) => (
            <a className="taskItem" href={`#${diagnosis.caseId}-${diagnosis.mode}`} key={`${diagnosis.caseId}-${diagnosis.mode}`}>
              <strong>{diagnosis.caseId}</strong>
              <small>{diagnosis.category}</small>
            </a>
          ))}
        </div>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <h1>Failure diagnostics</h1>
            <p>{report.summary.total} eval cases mapped to model-behavior hypotheses and intervention owners.</p>
          </div>
          <Link className="ghostButton" href="/runs/smoke-form">
            <Activity size={15} />
            Open trace
          </Link>
        </div>

        <div className="diagnosticGrid">
          <section className="panel" aria-label="Diagnosis summary">
            <div className="panelHeader">
              <h2>Summary</h2>
              <span className="meta">{report.summary.blocked} policy blocks</span>
            </div>
            <div className="summaryGrid">
              <Metric label="successes" value={report.summary.successes} />
              <Metric label="failures" value={report.summary.failures} />
              <Metric label="blocked" value={report.summary.blocked} />
              <Metric label="highest" value={report.summary.highestSeverity} />
            </div>
          </section>

          <section className="panel" aria-label="Intervention owners">
            <div className="panelHeader">
              <h2>Intervention owners</h2>
              <span className="meta">weighted by cases</span>
            </div>
            <div className="ownerList">
              {report.summary.interventionOwners.map((owner) => (
                <div className="ownerRow" key={owner.owner}>
                  <span>{owner.owner}</span>
                  <strong>{owner.count}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="panel" aria-label="Diagnosis table">
          <div className="panelHeader">
            <h2>Case diagnoses</h2>
            <span className="meta">{report.diagnoses.length} rows</span>
          </div>
          <div className="diagnosisTable">
            <div className="diagnosisRow header">
              <span>Case</span>
              <span>Mode</span>
              <span>Category</span>
              <span>Severity</span>
              <span>Owners</span>
            </div>
            {report.diagnoses.map((diagnosis) => (
              <div className="diagnosisRow" id={`${diagnosis.caseId}-${diagnosis.mode}`} key={`${diagnosis.caseId}-${diagnosis.mode}`}>
                <strong>{diagnosis.caseId}</strong>
                <span>{diagnosis.mode}</span>
                <span className="mono">{diagnosis.category}</span>
                <span className={`status ${diagnosis.severity}`}>{diagnosis.severity}</span>
                <span>{diagnosis.recommendedInterventions.map((item) => item.owner).join(", ")}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" aria-label="Model-behavior hypotheses">
          <div className="panelHeader">
            <h2>model-behavior hypotheses</h2>
            <span className="meta">critical cases</span>
          </div>
          <div className="hypothesisList">
            {critical.map((diagnosis) => (
              <div className="hypothesisItem" key={`${diagnosis.caseId}-${diagnosis.category}`}>
                <strong>{diagnosis.category}</strong>
                <p>{diagnosis.modelBehaviorHypothesis}</p>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
