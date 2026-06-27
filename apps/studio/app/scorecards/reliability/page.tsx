import Link from "next/link";
import { ArrowLeft, BarChart3, ClipboardCheck, Cpu } from "lucide-react";
import type {
  ReliabilityScorecardCaseSummary,
  ReliabilityScorecardResult
} from "../../../lib/scorecard-artifacts";
import { loadReliabilityScorecard } from "../../../lib/scorecard-artifacts";

export const dynamic = "force-dynamic";

export default async function ReliabilityScorecardPage() {
  const artifact = await loadReliabilityScorecard();
  const summary = artifact.summary;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark"><BarChart3 size={18} /></div>
          <div className="brandText">
            <strong>TracePilot Studio</strong>
            <span>Reliability scorecard</span>
          </div>
        </div>

        <Link className="ghostButton" href="/">
          <ArrowLeft size={15} />
          Runs
        </Link>

        <span className="sectionLabel">Evidence</span>
        <div className="taskItem">
          <strong>{summary.totalRuns} runs</strong>
          <small>{new Date(summary.generatedAt).toISOString()}</small>
          <span className="status pass">{formatPercent(summary.successRate)}</span>
        </div>

        <span className="sectionLabel">Drilldowns</span>
        <div className="taskList">
          <Link className="taskItem" href="/readiness">
            <strong>Readiness gate</strong>
            <small>release decision</small>
          </Link>
          <Link className="taskItem" href="/scorecards/provider">
            <strong>Provider scorecard</strong>
            <small>OpenAI and Anthropic</small>
          </Link>
        </div>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <h1>Reliability scorecard</h1>
            <p>Repeated deterministic browser workflows with safety and approval outcomes preserved.</p>
          </div>
          <div className="buttonRow">
            <span className={`sourceBadge ${artifact.source.kind}`}>{artifact.source.kind}</span>
            <Link className="ghostButton" href="/readiness">
              <ClipboardCheck size={15} />
              Readiness gate
            </Link>
            <Link className="ghostButton" href="/scorecards/provider">
              <Cpu size={15} />
              Provider
            </Link>
          </div>
        </div>

        <section className="panel" aria-label="Reliability scorecard summary">
          <div className="panelHeader">
            <h2>Summary</h2>
            <span className="meta">{summary.repetitions} repetition</span>
          </div>
          <div className="metricsStrip scorecardMetrics">
            <Metric label="total runs" value={summary.totalRuns} />
            <Metric label="successes" value={summary.successes} />
            <Metric label="success rate" value={formatPercent(summary.successRate)} />
            <Metric label="false completions" value={summary.falseCompletions} />
            <Metric label="stuck loops" value={summary.stuckLoops} />
            <Metric label="unsafe blocks" value={summary.unsafeBlocks} />
            <Metric label="human approvals" value={summary.humanApprovals} />
            <Metric label="median steps" value={formatNumber(summary.medianStepsPerSuccessfulRun)} />
            <Metric label="median duration" value={`${formatNumber(summary.medianDurationMs)}ms`} />
            <Metric label="total cost" value={formatUsd(summary.totalCostUsd)} />
          </div>
        </section>

        <section className="panel" aria-label="Reliability cases">
          <div className="panelHeader">
            <h2>Cases</h2>
            <span className="meta">{summary.cases.length} cases</span>
          </div>
          <div className="scorecardTable">
            <div className="scorecardRow reliabilityCase header">
              <span>Case</span>
              <span>Runs</span>
              <span>Success</span>
              <span>False completion</span>
              <span>Stuck loop</span>
              <span>Unsafe</span>
              <span>Approval</span>
              <span>Median steps</span>
            </div>
            {summary.cases.map((testCase) => (
              <CaseRow testCase={testCase} key={testCase.caseId} />
            ))}
          </div>
        </section>

        <section className="panel" aria-label="Reliability result rows">
          <div className="panelHeader">
            <h2>Rows</h2>
            <span className="meta">{artifact.results.length} rows</span>
          </div>
          <div className="scorecardTable">
            <div className="scorecardRow reliabilityResult header">
              <span>Case</span>
              <span>Task</span>
              <span>Success</span>
              <span>False completion</span>
              <span>Stuck loop</span>
              <span>Unsafe</span>
              <span>Approvals</span>
              <span>Steps</span>
              <span>Duration</span>
            </div>
            {artifact.results.map((result) => (
              <ResultRow result={result} key={`${result.caseId}-${result.taskId}`} />
            ))}
          </div>
        </section>

        {summary.warnings.length > 0 ? (
          <section className="panel" aria-label="Reliability scorecard warnings">
            <div className="panelHeader">
              <h2>Warnings</h2>
              <span className="meta">{summary.warnings.length} active</span>
            </div>
            <div className="warningList">
              {summary.warnings.map((warning) => (
                <div className="warningItem" key={warning}>{warning}</div>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function CaseRow(props: { testCase: ReliabilityScorecardCaseSummary }) {
  return (
    <div className="scorecardRow reliabilityCase">
      <strong className="mono">{props.testCase.caseId}</strong>
      <span>{props.testCase.runs}</span>
      <span>{formatPercent(props.testCase.successRate)}</span>
      <span>{formatPercent(props.testCase.falseCompletionRate)}</span>
      <span>{formatPercent(props.testCase.stuckLoopRate)}</span>
      <span>{formatPercent(props.testCase.unsafeBlockRate)}</span>
      <span>{formatPercent(props.testCase.humanApprovalRate)}</span>
      <span>{formatNumber(props.testCase.medianStepsPerSuccessfulRun)}</span>
    </div>
  );
}

function ResultRow(props: { result: ReliabilityScorecardResult }) {
  return (
    <div className="scorecardRow reliabilityResult">
      <strong className="mono">{props.result.caseId}</strong>
      <span className="mono">{props.result.taskId}</span>
      <span>{yesNo(props.result.metrics.success)}</span>
      <span>{yesNo(props.result.metrics.falseCompletion)}</span>
      <span>{yesNo(props.result.metrics.stuckLoop)}</span>
      <span>{yesNo(props.result.metrics.unsafeBlocked)}</span>
      <span>{props.result.metrics.humanApprovals}</span>
      <span>{props.result.metrics.steps}</span>
      <span>{props.result.metrics.durationMs}ms</span>
    </div>
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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}
