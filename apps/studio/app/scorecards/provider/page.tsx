import Link from "next/link";
import { BarChart3, ClipboardCheck, ShieldCheck } from "lucide-react";
import { Metric } from "../../../components/Metric";
import { StudioShell } from "../../../components/StudioShell";
import { formatPercent, formatUsdCompact, yesNo } from "../../../lib/format";
import type {
  ProviderScorecardGroupSummary,
  ProviderScorecardRow
} from "../../../lib/scorecard-artifacts";
import { loadProviderScorecard } from "../../../lib/scorecard-artifacts";

export const dynamic = "force-dynamic";

export default async function ProviderScorecardPage() {
  const artifact = await loadProviderScorecard();
  const summary = artifact.summary;

  return (
    <StudioShell
      icon={<BarChart3 size={18} />}
      subtitle="Provider scorecard"
      sidebar={
        <>
          <span className="sectionLabel">Status</span>
          <div className="taskItem">
            <strong>{summary.status}</strong>
            <small>{new Date(summary.generatedAt).toISOString()}</small>
            <span className={`status ${statusSeverity(summary.status)}`}>{summary.executedRuns} executed</span>
          </div>

          <span className="sectionLabel">Drilldowns</span>
          <div className="taskList">
            <Link className="taskItem" href="/readiness">
              <strong>Readiness gate</strong>
              <small>release decision</small>
            </Link>
            <Link className="taskItem" href="/scorecards/reliability">
              <strong>Reliability scorecard</strong>
              <small>deterministic runs</small>
            </Link>
          </div>
        </>
      }
    >
      <div className="topbar">
        <div>
          <h1>Provider scorecard</h1>
          <p>OpenAI and Anthropic browser-control rows behind explicit paid-run gates.</p>
        </div>
        <div className="buttonRow">
          <span className={`sourceBadge ${artifact.source.kind}`}>{artifact.source.kind}</span>
          <Link className="ghostButton" href="/readiness">
            <ClipboardCheck size={15} />
            Readiness gate
          </Link>
          <Link className="ghostButton" href="/scorecards/reliability">
            <ShieldCheck size={15} />
            Reliability
          </Link>
        </div>
      </div>

      <section className="panel" aria-label="Provider scorecard summary">
        <div className="panelHeader">
          <h2>Summary</h2>
          <span className="meta">{summary.repetitions} repetition</span>
        </div>
        <div className="metricsStrip scorecardMetrics">
          <Metric label="planned runs" value={summary.plannedRuns} />
          <Metric label="executed runs" value={summary.executedRuns} />
          <Metric label="skipped runs" value={summary.skippedRuns} />
          <Metric label="paid calls" value={summary.paidCalls} />
          <Metric label="successes" value={summary.successes} />
          <Metric label="success rate" tone="pass" value={formatPercent(summary.successRate)} />
          <Metric label="false completion" tone={summary.falseCompletionRate > 0 ? "warn" : "pass"} value={formatPercent(summary.falseCompletionRate)} />
          <Metric label="stuck loop" tone={summary.stuckLoopRate > 0 ? "warn" : "pass"} value={formatPercent(summary.stuckLoopRate)} />
          <Metric label="unsafe blocks" value={summary.unsafeBlocks} />
          <Metric label="total cost" value={formatUsdCompact(summary.totalCostUsd)} />
        </div>
      </section>

      <div className="scorecardGrid">
        <GroupPanel
          title="Providers"
          meta={`${summary.providers.length} providers`}
          labelHeader="Provider"
          groups={summary.providers}
          getLabel={(group) => providerLabel(group.provider)}
        />
        <GroupPanel
          title="Tasks"
          meta={`${summary.tasks.length} tasks`}
          labelHeader="Task"
          groups={summary.tasks}
          getLabel={(group) => group.taskId ?? "unknown"}
        />
      </div>

      <section className="panel" aria-label="Provider scorecard rows">
        <div className="panelHeader">
          <h2>Rows</h2>
          <span className="meta">{artifact.rows.length} rows</span>
        </div>
        <div className="scorecardTable">
          <div className="scorecardRow provider header">
            <span>Provider</span>
            <span>Task</span>
            <span>Attempt</span>
            <span>Status</span>
            <span>Model</span>
            <span>Success</span>
            <span>Paid</span>
            <span>Steps</span>
            <span>Cost</span>
          </div>
          {artifact.rows.map((row) => (
            <ProviderRow row={row} key={`${row.provider}-${row.taskId}-${row.attempt}`} />
          ))}
        </div>
      </section>

      {summary.warnings.length > 0 ? (
        <section className="panel" aria-label="Provider scorecard warnings">
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
    </StudioShell>
  );
}

function GroupPanel(props: {
  title: string;
  meta: string;
  labelHeader: string;
  groups: ProviderScorecardGroupSummary[];
  getLabel: (group: ProviderScorecardGroupSummary) => string;
}) {
  return (
    <section className="panel" aria-label={props.title}>
      <div className="panelHeader">
        <h2>{props.title}</h2>
        <span className="meta">{props.meta}</span>
      </div>
      <div className="scorecardTable compact">
        <div className="scorecardRow group header">
          <span>{props.labelHeader}</span>
          <span>Planned</span>
          <span>Executed</span>
          <span>Success</span>
          <span>Unsafe</span>
          <span>Cost</span>
        </div>
        {props.groups.map((group) => (
          <div className="scorecardRow group" key={props.getLabel(group)}>
            <strong>{props.getLabel(group)}</strong>
            <span>{group.plannedRuns}</span>
            <span>{group.executedRuns}</span>
            <span>{formatPercent(group.successRate)}</span>
            <span>{group.unsafeBlocks}</span>
            <span>{formatUsdCompact(group.totalCostUsd)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProviderRow(props: { row: ProviderScorecardRow }) {
  return (
    <div className="scorecardRow provider">
      <strong>{providerLabel(props.row.provider)}</strong>
      <span className="mono">{props.row.taskId}</span>
      <span>{props.row.attempt}</span>
      <span className={`status ${statusSeverity(props.row.status)}`}>{props.row.status}</span>
      <span className="mono">{props.row.model}</span>
      <span>{yesNo(props.row.success)}</span>
      <span>{yesNo(props.row.paidCall)}</span>
      <span>{props.row.steps}</span>
      <span>{formatUsdCompact(props.row.totalCostUsd)}</span>
    </div>
  );
}

function providerLabel(provider: string | undefined): string {
  return provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Anthropic" : "unknown";
}

function statusSeverity(status: string): string {
  if (status === "executed") return "pass";
  if (status === "partial") return "warn";
  return "blocked";
}