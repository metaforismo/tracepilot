import Link from "next/link";
import { Activity, BarChart3, ClipboardCheck, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import { listRuns } from "../lib/trace-fixtures";

export default async function HomePage() {
  const runs = await listRuns();

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark"><Activity size={18} /></div>
          <div className="brandText">
            <strong>TracePilot Studio</strong>
            <span>Computer-use reliability</span>
          </div>
        </div>

        <span className="sectionLabel">Mode</span>
        <div className="modeSwitch" aria-label="Agent mode">
          <span>Baseline</span>
          <span className="active">TracePilot</span>
        </div>

        <span className="sectionLabel">Tasks</span>
        <div className="taskList">
          {runs.map((run) => (
            <div className="taskItem" key={run.id}>
              <strong>{run.title}</strong>
              <small>{run.description}</small>
              <Link className="primaryButton" href={`/runs/${run.id}`}>
                <Play size={15} />
                Open trace
              </Link>
            </div>
          ))}
        </div>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <h1>Run launcher</h1>
            <p>Start from a saved trace fixture, then inspect verifier evidence step by step.</p>
          </div>
          <div className="buttonRow">
            <Link className="ghostButton" href="/readiness">
              <ClipboardCheck size={15} />
              Readiness gate
            </Link>
            <Link className="ghostButton" href="/scorecards/provider">
              <BarChart3 size={15} />
              Provider scorecard
            </Link>
            <Link className="ghostButton" href="/scorecards/reliability">
              <BarChart3 size={15} />
              Reliability scorecard
            </Link>
            <Link className="ghostButton" href="/diagnostics">
              <TriangleAlert size={15} />
              Diagnostics
            </Link>
            <Link className="ghostButton" href="/runs/smoke-form">
              <ShieldCheck size={15} />
              Latest smoke run
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
