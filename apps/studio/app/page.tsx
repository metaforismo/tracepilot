import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Play,
  ShieldCheck,
  TriangleAlert
} from "lucide-react";
import { loadReadinessGate } from "../lib/readiness-fixtures";
import { loadProviderScorecard } from "../lib/scorecard-artifacts";
import { listRuns } from "../lib/trace-fixtures";

export default async function HomePage() {
  const [runs, gate, providerScorecard] = await Promise.all([
    listRuns(),
    loadReadinessGate(),
    loadProviderScorecard()
  ]);
  const providerSummary = providerScorecard.summary;
  const generatedAt = new Date(gate.generatedAt).toISOString();

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

        <nav className="sidebarActions" aria-label="Studio navigation">
          <Link className="navLink active" href="/">
            <Gauge size={15} />
            Overview
          </Link>
          <Link className="navLink" href="/readiness">
            <ClipboardCheck size={15} />
            Readiness
          </Link>
          <Link className="navLink" href="/scorecards/provider">
            <BarChart3 size={15} />
            Provider scorecard
          </Link>
          <Link className="navLink" href="/diagnostics">
            <TriangleAlert size={15} />
            Diagnostics
          </Link>
        </nav>

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
            <span className="eyebrow">Computer-use reliability workbench</span>
            <h1>TracePilot Studio</h1>
            <p>Inspect traces, compare provider evidence, and turn failures into release decisions.</p>
          </div>
          <div className="buttonRow">
            <Link className="primaryButton" href="/runs/smoke-form">
              <Play size={15} />
              Open trace
            </Link>
            <Link className="ghostButton" href="/readiness">
              <ClipboardCheck size={15} />
              Readiness gate
            </Link>
            <Link className="ghostButton" href="/scorecards/provider">
              <BarChart3 size={15} />
              Provider scorecard
            </Link>
          </div>
        </div>

        <section className="overviewGrid" aria-label="TracePilot overview">
          <div className="overviewHero">
            <div>
              <span className="eyebrow">Current release signal</span>
              <h2>Readiness is {gate.decision}</h2>
              <p>
                The gate combines deterministic reliability runs with paid provider evidence,
                then marks each release rule as pass, warn, fail, or blocked.
              </p>
            </div>
            <div className="heroSignal">
              <span className={`status ${gate.decision}`}>{gate.decision}</span>
              <strong>{gate.summary.passedRules}/{gate.summary.totalRules}</strong>
              <small>rules passing</small>
            </div>
          </div>

          <div className="evidenceBoard" aria-label="Evidence summary">
            <Metric label="Provider runs" value={`${providerSummary.executedRuns}/${providerSummary.plannedRuns}`} />
            <Metric label="Paid calls" value={providerSummary.paidCalls} />
            <Metric label="Success rate" value={formatPercent(providerSummary.successRate)} />
            <Metric label="Unsafe blocks" value={providerSummary.unsafeBlocks} />
            <Metric label="Total cost" value={formatUsd(providerSummary.totalCostUsd)} />
            <Metric label="Generated" value={shortDate(generatedAt)} />
          </div>

          <section className="panel homePanel" aria-label="Recommended workflow">
            <div className="panelHeader">
              <h2>Workflow</h2>
              <span className="meta">evidence first</span>
            </div>
            <div className="workflowList">
              <WorkflowStep
                icon={<Play size={15} />}
                title="Replay a trace"
                body="Open a browser-control run and inspect screenshot, action, verifier reason, and recovery path."
                href="/runs/smoke-form"
              />
              <WorkflowStep
                icon={<BarChart3 size={15} />}
                title="Compare providers"
                body="Review OpenAI and Anthropic rows with paid-call status, cost, success, and stuck-loop signals."
                href="/scorecards/provider"
              />
              <WorkflowStep
                icon={<ClipboardCheck size={15} />}
                title="Check the gate"
                body="Use the release gate to see which evidence is strong, weak, failed, or still blocked."
                href="/readiness"
              />
            </div>
          </section>

          <section className="panel homePanel" aria-label="Runs">
            <div className="panelHeader">
              <h2>Runs</h2>
              <span className="meta">{runs.length} traces</span>
            </div>
            <div className="runGrid">
              {runs.map((run) => (
                <Link className="runCard" href={`/runs/${run.id}`} key={run.id}>
                  <div>
                    <strong>{run.title}</strong>
                    <p>{run.description}</p>
                  </div>
                  <span>
                    Open
                    <ArrowRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="panel homePanel" aria-label="Guardrail signal">
            <div className="panelHeader">
              <h2>Guardrails</h2>
              <span className="meta">{providerSummary.warnings.length} warnings</span>
            </div>
            <div className="guardrailStack">
              <div className="guardrailRow">
                <CheckCircle2 size={16} />
                <div>
                  <strong>{providerSummary.unsafeBlocks} unsafe blocks recorded</strong>
                  <span>Prompt-injection rows are counted as safety evidence, not hidden as failures.</span>
                </div>
              </div>
              <div className="guardrailRow">
                <ShieldCheck size={16} />
                <div>
                  <strong>{formatPercent(providerSummary.falseCompletionRate)} false completion rate</strong>
                  <span>The scorecard separates real completion from optimistic agent claims.</span>
                </div>
              </div>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div className="metric evidenceMetricTile">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

type WorkflowHref = "/runs/smoke-form" | "/scorecards/provider" | "/readiness";

function WorkflowStep(props: { body: string; href: WorkflowHref; icon: ReactNode; title: string }) {
  return (
    <Link className="workflowStep" href={props.href}>
      <span className="workflowIcon">{props.icon}</span>
      <span>
        <strong>{props.title}</strong>
        <small>{props.body}</small>
      </span>
      <ArrowRight size={14} />
    </Link>
  );
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}

function shortDate(value: string): string {
  return value.slice(0, 10);
}
